import time
import uuid
from datetime import UTC, datetime

from django.test import RequestFactory, SimpleTestCase, TestCase, override_settings
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from core.api_response import (
    paginated_response,
    parse_pagination_params,
    success_response,
)
from core.audit_context import (
    REQUEST_ID_HEADER,
    RequestContextMiddleware,
    get_current_request_id,
)
from core.authentication import (
    PurchasesJwtAuthentication,
    encode_hs256_jwt,
    verify_access_token,
)
from core.exception_handler import purchases_exception_handler
from core.exceptions import (
    AuthenticationRequiredError,
    DomainValidationError,
    ErrorCode,
    FieldErrorDetail,
    ForbiddenDomainError,
    InvalidTokenError,
    ProjectionNotReadyError,
    VersionConflictError,
)
from core.permissions import PurchasesAccessPermission, ensure_order_ownership
from projections.models import UserProjection

TEST_JWT_SECRET = "test-jwt-secret-with-at-least-32-bytes-000000"
TEST_ISSUER = "techdistribution-auth"
TEST_AUDIENCE = "techdistribution-api"


class _DummyLineSerializer(serializers.Serializer):
    unitPrice = serializers.RegexField(
        regex=r"^\d+(\.\d{1,2})?$",
        error_messages={"invalid": "Debe contener como máximo dos decimales"},
    )


class _DummyOrderSerializer(serializers.Serializer):
    lines = _DummyLineSerializer(many=True)


class _ProtectedProbeView(APIView):
    def get(self, request: Request):
        return success_response(
            data={"userId": str(request.user.user_id), "role": request.user.role},
            message="Acceso autorizado",
        )


class CoreApiResponseAndExceptionTests(SimpleTestCase):
    def test_success_and_paginated_response_format(self):
        single = success_response(
            data={"id": "5015c8cb-3687-4482-a19b-e95f50f12d6a"},
            message="Orden creada exitosamente",
            status_code=201,
        )
        self.assertEqual(single.status_code, 201)
        self.assertEqual(
            single.data,
            {
                "error": False,
                "statusCode": 201,
                "message": "Orden creada exitosamente",
                "data": {"id": "5015c8cb-3687-4482-a19b-e95f50f12d6a"},
            },
        )

        paged = paginated_response(
            items=[{"id": "1"}],
            page=1,
            limit=20,
            total=37,
            message="Órdenes obtenidas exitosamente",
        )
        self.assertEqual(paged.status_code, 200)
        self.assertEqual(
            paged.data["meta"],
            {"page": 1, "limit": 20, "total": 37, "totalPages": 2},
        )

        empty_paged = paginated_response(
            items=[],
            page=1,
            limit=20,
            total=0,
            message="Órdenes obtenidas exitosamente",
        )
        self.assertEqual(empty_paged.data["data"], [])
        self.assertEqual(empty_paged.data["meta"]["totalPages"], 0)

    def test_parse_pagination_params_validation(self):
        self.assertEqual(parse_pagination_params({}), (1, 20))
        self.assertEqual(parse_pagination_params({"page": "2", "limit": "50"}), (2, 50))

        with self.assertRaises(DomainValidationError) as ctx:
            parse_pagination_params({"page": "0", "limit": "101"})

        response = purchases_exception_handler(ctx.exception, {})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], ErrorCode.VALIDATION_ERROR)
        self.assertEqual(response.data["source"], "purchases")
        fields = {item["field"] for item in response.data["details"]}
        self.assertEqual(fields, {"page", "limit"})

    def test_exception_handler_formats_nested_serializer_and_domain_errors(self):
        serializer = _DummyOrderSerializer(data={"lines": [{"unitPrice": "10.999"}]})
        with self.assertRaises(serializers.ValidationError) as val_ctx:
            serializer.is_valid(raise_exception=True)

        val_response = purchases_exception_handler(val_ctx.exception, {})
        self.assertEqual(val_response.status_code, 400)
        self.assertTrue(val_response.data["error"])
        self.assertEqual(val_response.data["code"], ErrorCode.VALIDATION_ERROR)
        self.assertEqual(val_response.data["source"], "purchases")
        self.assertEqual(val_response.data["details"][0]["field"], "lines[0].unitPrice")

        proj_err = ProjectionNotReadyError(
            details=[
                FieldErrorDetail(
                    field="lines[0].productId",
                    code=ErrorCode.PROJECTION_NOT_READY,
                    message="Producto aún no proyectado",
                )
            ]
        )
        proj_response = purchases_exception_handler(proj_err, {})
        self.assertEqual(proj_response.status_code, 409)
        self.assertEqual(proj_response.data["code"], ErrorCode.PROJECTION_NOT_READY)
        self.assertEqual(proj_response["Retry-After"], "2")

        conflict_response = purchases_exception_handler(VersionConflictError(), {})
        self.assertEqual(conflict_response.status_code, 409)
        self.assertEqual(conflict_response.data["code"], ErrorCode.VERSION_CONFLICT)

        unexpected_response = purchases_exception_handler(RuntimeError("sensitive sql"), {})
        self.assertEqual(unexpected_response.status_code, 500)
        self.assertEqual(unexpected_response.data["code"], ErrorCode.INTERNAL_ERROR)
        self.assertNotIn("sensitive sql", str(unexpected_response.data))

    def test_request_context_middleware_propagates_and_generates_request_id(self):
        factory = RequestFactory()
        valid_id = str(uuid.uuid4())

        def dummy_get_response(req):
            from django.http import HttpResponse

            self.assertEqual(str(req.request_id), str(get_current_request_id()))
            return HttpResponse("ok")

        middleware = RequestContextMiddleware(dummy_get_response)

        req_with_id = factory.get("/health/live", HTTP_X_REQUEST_ID=valid_id)
        res_with_id = middleware(req_with_id)
        self.assertEqual(res_with_id[REQUEST_ID_HEADER], valid_id)

        req_invalid_id = factory.get("/health/live", HTTP_X_REQUEST_ID="not-a-uuid")
        res_invalid_id = middleware(req_invalid_id)
        generated_uuid = uuid.UUID(res_invalid_id[REQUEST_ID_HEADER])
        self.assertEqual(str(generated_uuid), res_invalid_id[REQUEST_ID_HEADER])


class JwtAuthenticationUnitTests(SimpleTestCase):
    def _build_claims(self, **overrides):
        now = int(time.time())
        claims = {
            "sub": str(uuid.uuid4()),
            "email": "agente@techdistribution.com",
            "role": "PURCHASES_AGENT",
            "system": "PURCHASES",
            "iat": now,
            "exp": now + 900,
            "iss": TEST_ISSUER,
            "aud": TEST_AUDIENCE,
        }
        claims.update(overrides)
        return claims

    def test_valid_tokens_for_purchases_and_admin(self):
        claims = self._build_claims()
        token = encode_hs256_jwt(claims, TEST_JWT_SECRET)
        actor = verify_access_token(
            token,
            secret=TEST_JWT_SECRET,
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
            max_ttl_seconds=900,
        )
        self.assertEqual(str(actor.user_id), claims["sub"])
        self.assertEqual(actor.role, "PURCHASES_AGENT")
        self.assertEqual(actor.system, "PURCHASES")
        self.assertFalse(actor.is_admin)

        admin_claims = self._build_claims(role="ADMIN", system="PURCHASES")
        admin_actor = verify_access_token(
            encode_hs256_jwt(admin_claims, TEST_JWT_SECRET),
            secret=TEST_JWT_SECRET,
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
            max_ttl_seconds=900,
        )
        self.assertTrue(admin_actor.is_admin)

    def test_rejects_invalid_signature_algorithm_issuer_audience_ttl_and_claims(self):
        now = int(time.time())
        invalid_cases = [
            encode_hs256_jwt(self._build_claims(), "wrong-secret-key-with-32-bytes-minimum!!"),
            encode_hs256_jwt(
                self._build_claims(),
                TEST_JWT_SECRET,
                header={"alg": "HS512", "typ": "JWT"},
            ),
            encode_hs256_jwt(self._build_claims(iss="other-issuer"), TEST_JWT_SECRET),
            encode_hs256_jwt(self._build_claims(aud="other-audience"), TEST_JWT_SECRET),
            encode_hs256_jwt(self._build_claims(exp=now - 1), TEST_JWT_SECRET),
            encode_hs256_jwt(self._build_claims(iat=now + 60, exp=now + 600), TEST_JWT_SECRET),
            encode_hs256_jwt(self._build_claims(exp=now + 901), TEST_JWT_SECRET),
            encode_hs256_jwt(self._build_claims(sub="not-a-uuid"), TEST_JWT_SECRET),
            encode_hs256_jwt(self._build_claims(email="bad-email"), TEST_JWT_SECRET),
            encode_hs256_jwt(
                self._build_claims(role="PURCHASES_AGENT", system="INVENTORY"),
                TEST_JWT_SECRET,
            ),
            encode_hs256_jwt(
                self._build_claims(role="INVENTORY_MANAGER", system="PURCHASES"),
                TEST_JWT_SECRET,
            ),
            encode_hs256_jwt(
                {**self._build_claims(), "roles": ["PURCHASES_AGENT"]},
                TEST_JWT_SECRET,
            ),
            encode_hs256_jwt(self._build_claims(iat=True), TEST_JWT_SECRET),
        ]

        for bad_token in invalid_cases:
            with self.subTest(token=bad_token[:24]), self.assertRaises(InvalidTokenError):
                verify_access_token(
                    bad_token,
                    secret=TEST_JWT_SECRET,
                    issuer=TEST_ISSUER,
                    audience=TEST_AUDIENCE,
                    max_ttl_seconds=900,
                )

    @override_settings(
        JWT_SECRET=TEST_JWT_SECRET,
        JWT_ISSUER=TEST_ISSUER,
        JWT_AUDIENCE=TEST_AUDIENCE,
        JWT_MAX_TTL_SECONDS=900,
    )
    def test_authentication_class_strips_untrusted_headers_and_checks_bearer(self):
        factory = RequestFactory()
        auth = PurchasesJwtAuthentication()

        req_missing = factory.get("/api/purchases/orders")
        with self.assertRaises(AuthenticationRequiredError):
            auth.authenticate(req_missing)

        req_basic = factory.get("/api/purchases/orders", HTTP_AUTHORIZATION="Basic abc")
        with self.assertRaises(InvalidTokenError):
            auth.authenticate(req_basic)

        token = encode_hs256_jwt(self._build_claims(), TEST_JWT_SECRET)
        req_forged = factory.get(
            "/api/purchases/orders",
            HTTP_AUTHORIZATION=f"Bearer {token}",
            HTTP_X_USER_ID=str(uuid.uuid4()),
            HTTP_X_USER_ROLES='["ADMIN"]',
        )
        actor, _ = auth.authenticate(req_forged)
        self.assertNotIn("HTTP_X_USER_ID", req_forged.META)
        self.assertNotIn("HTTP_X_USER_ROLES", req_forged.META)
        self.assertEqual(actor.role, "PURCHASES_AGENT")


@override_settings(
    JWT_SECRET=TEST_JWT_SECRET,
    JWT_ISSUER=TEST_ISSUER,
    JWT_AUDIENCE=TEST_AUDIENCE,
    JWT_MAX_TTL_SECONDS=900,
)
class PurchasesRbacAndProjectionPermissionTests(TestCase):
    def setUp(self):
        self.api_factory = APIRequestFactory()
        self.view = _ProtectedProbeView.as_view()
        self.user_id = uuid.uuid4()
        self.now = datetime(2026, 11, 11, 19, 0, 0, tzinfo=UTC)

    def _make_token(self, *, role: str = "PURCHASES_AGENT", system: str = "PURCHASES") -> str:
        now_ts = int(time.time())
        return encode_hs256_jwt(
            {
                "sub": str(self.user_id),
                "email": "compras@techdistribution.com",
                "role": role,
                "system": system,
                "iat": now_ts,
                "exp": now_ts + 900,
                "iss": TEST_ISSUER,
                "aud": TEST_AUDIENCE,
            },
            TEST_JWT_SECRET,
        )

    def test_rejects_inventory_system_token_with_403_forbidden(self):
        token = self._make_token(role="ADMIN", system="INVENTORY")
        request = self.api_factory.get(
            "/api/purchases/orders",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        response = self.view(request)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], ErrorCode.FORBIDDEN)

    def test_returns_409_projection_not_ready_when_user_not_projected(self):
        token = self._make_token()
        request = self.api_factory.get(
            "/api/purchases/orders",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        response = self.view(request)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], ErrorCode.PROJECTION_NOT_READY)
        self.assertEqual(response["Retry-After"], "2")

    def test_rejects_inactive_user_or_missing_purchases_assignment_in_projection(self):
        projection = UserProjection.objects.create(
            user_id=self.user_id,
            email="compras@techdistribution.com",
            display_name="Agente Compras",
            active=False,
            assignments=[{"system": "PURCHASES", "role": "PURCHASES_AGENT"}],
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )
        token = self._make_token()
        request = self.api_factory.get(
            "/api/purchases/orders",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        response = self.view(request)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], ErrorCode.FORBIDDEN)

        projection.active = True
        projection.assignments = [{"system": "INVENTORY", "role": "INVENTORY_MANAGER"}]
        projection.save()

        request_no_assign = self.api_factory.get(
            "/api/purchases/orders",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        response_no_assign = self.view(request_no_assign)
        self.assertEqual(response_no_assign.status_code, 403)
        self.assertEqual(response_no_assign.data["code"], ErrorCode.FORBIDDEN)

    def test_allows_active_projected_user_and_enforces_order_ownership(self):
        UserProjection.objects.create(
            user_id=self.user_id,
            email="compras@techdistribution.com",
            display_name="Agente Compras",
            active=True,
            assignments=[{"system": "PURCHASES", "role": "PURCHASES_AGENT"}],
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )
        token = self._make_token()
        request = self.api_factory.get(
            "/api/purchases/orders",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        response = self.view(request)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["userId"], str(self.user_id))

        agent_actor = verify_access_token(
            token,
            secret=TEST_JWT_SECRET,
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
            max_ttl_seconds=900,
        )
        ensure_order_ownership(agent_actor, self.user_id)
        with self.assertRaises(ForbiddenDomainError):
            ensure_order_ownership(agent_actor, uuid.uuid4())

        admin_actor = verify_access_token(
            self._make_token(role="ADMIN", system="PURCHASES"),
            secret=TEST_JWT_SECRET,
            issuer=TEST_ISSUER,
            audience=TEST_AUDIENCE,
            max_ttl_seconds=900,
        )
        ensure_order_ownership(admin_actor, uuid.uuid4())
        self.assertIsNotNone(PurchasesAccessPermission)
