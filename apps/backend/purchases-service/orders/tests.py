import base64
import hashlib
import hmac
import json
import time
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models.deletion import RestrictedError
from django.test import TestCase

from orders.models import (
    IdempotencyKey,
    IdempotencyOperation,
    OrderCurrency,
    OrderHistoryAction,
    OrderStatus,
    ProductUnit,
    PurchaseOrder,
    PurchaseOrderHistory,
    PurchaseOrderLine,
)
from projections.models import ProductProjection, ProjectionProductUnit, UserProjection


def _encode_b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _mint_jwt(
    *,
    user_id: uuid.UUID,
    email: str = "agente@techdistribution.com",
    role: str = "PURCHASES_AGENT",
    system: str = "PURCHASES",
) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "system": system,
        "iat": now,
        "exp": now + 600,
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE,
    }
    h_b64 = _encode_b64url(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    p_b64 = _encode_b64url(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_b64}.{p_b64}".encode("ascii")
    sig = hmac.new(settings.JWT_SECRET.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return f"{h_b64}.{p_b64}.{_encode_b64url(sig)}"


class PurchaseOrderDomainModelTests(TestCase):
    def setUp(self):
        self.requester_id = uuid.uuid4()
        self.actor_id = self.requester_id
        self.product_id = uuid.uuid4()
        self.now = datetime(2026, 11, 11, 18, 0, 0, tzinfo=UTC)

    def _create_draft_order(self, **overrides) -> PurchaseOrder:
        defaults = {
            "requester_id": self.requester_id,
            "supplier_name": "Proveedor Tecnológico S.A.",
            "currency": OrderCurrency.MXN,
            "status": OrderStatus.DRAFT,
            "total_amount": Decimal("2500.50"),
            "version": 1,
            "last_modified_by": self.actor_id,
            "created_at": self.now,
            "updated_at": self.now,
        }
        defaults.update(overrides)
        return PurchaseOrder.objects.create(**defaults)

    def test_create_order_lines_idempotency_and_history_transactional_integrity(self):
        order = self._create_draft_order()
        line = PurchaseOrderLine.objects.create(
            order=order,
            position=1,
            product_id=self.product_id,
            sku_snapshot="LAP-001",
            name_snapshot="Laptop Empresarial",
            unit=ProductUnit.UNIT,
            quantity=2,
            unit_price=Decimal("1250.25"),
            line_total=Decimal("2500.50"),
        )
        idem = IdempotencyKey.objects.create(
            requester_id=self.requester_id,
            idempotency_key=uuid.uuid4(),
            operation=IdempotencyOperation.CREATE_ORDER,
            order=order,
            request_hash="a" * 64,
            response_status=201,
            response_body={"error": False, "statusCode": 201, "data": {"id": str(order.id)}},
        )
        history = PurchaseOrderHistory.objects.create(
            order=order,
            order_version=1,
            action=OrderHistoryAction.CREATED,
            from_status=None,
            to_status=OrderStatus.DRAFT,
            actor_user_id=self.actor_id,
            request_id=uuid.uuid4(),
            changes={"supplierName": order.supplier_name, "lineCount": 1},
        )

        self.assertEqual(order.lines.count(), 1)
        self.assertEqual(line.line_total, Decimal("2500.50"))
        self.assertEqual(idem.order_id, order.id)
        self.assertEqual(history.order_version, 1)

        with self.assertRaises(RestrictedError):
            order.delete()

    def test_order_status_timestamp_constraints(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self._create_draft_order(submitted_at=self.now)

        with self.assertRaises(IntegrityError), transaction.atomic():
            self._create_draft_order(status=OrderStatus.SUBMITTED, submitted_at=None)

        with self.assertRaises(IntegrityError), transaction.atomic():
            self._create_draft_order(status=OrderStatus.CANCELLED, cancelled_at=None)

        submitted_then_cancelled = self._create_draft_order(
            status=OrderStatus.CANCELLED,
            submitted_at=self.now,
            cancelled_at=self.now,
        )
        self.assertEqual(submitted_then_cancelled.status, OrderStatus.CANCELLED)

    def test_order_line_uniqueness_and_range_constraints(self):
        order = self._create_draft_order()
        PurchaseOrderLine.objects.create(
            order=order,
            position=1,
            product_id=self.product_id,
            sku_snapshot="LAP-001",
            name_snapshot="Laptop",
            unit=ProductUnit.UNIT,
            quantity=1,
            unit_price=Decimal("100.00"),
            line_total=Decimal("100.00"),
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseOrderLine.objects.create(
                order=order,
                position=2,
                product_id=self.product_id,
                sku_snapshot="LAP-001",
                name_snapshot="Laptop",
                unit=ProductUnit.UNIT,
                quantity=1,
                unit_price=Decimal("100.00"),
                line_total=Decimal("100.00"),
            )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseOrderLine.objects.create(
                order=order,
                position=101,
                product_id=uuid.uuid4(),
                sku_snapshot="MON-002",
                name_snapshot="Monitor",
                unit=ProductUnit.UNIT,
                quantity=1,
                unit_price=Decimal("100.00"),
                line_total=Decimal("100.00"),
            )

    def test_idempotency_and_history_uniqueness_constraints(self):
        order = self._create_draft_order()
        shared_key = uuid.uuid4()

        IdempotencyKey.objects.create(
            requester_id=self.requester_id,
            idempotency_key=shared_key,
            operation=IdempotencyOperation.CREATE_ORDER,
            order=order,
            request_hash="b" * 64,
            response_status=201,
            response_body={"error": False},
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            IdempotencyKey.objects.create(
                requester_id=self.requester_id,
                idempotency_key=shared_key,
                operation=IdempotencyOperation.SUBMIT_ORDER,
                order=order,
                request_hash="c" * 64,
                response_status=200,
                response_body={"error": False},
            )

        PurchaseOrderHistory.objects.create(
            order=order,
            order_version=1,
            action=OrderHistoryAction.CREATED,
            from_status=None,
            to_status=OrderStatus.DRAFT,
            actor_user_id=self.actor_id,
            request_id=uuid.uuid4(),
            changes={},
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            PurchaseOrderHistory.objects.create(
                order=order,
                order_version=1,
                action=OrderHistoryAction.UPDATED,
                from_status=OrderStatus.DRAFT,
                to_status=OrderStatus.DRAFT,
                actor_user_id=self.actor_id,
                request_id=uuid.uuid4(),
                changes={},
            )


class PurchaseOrderEndpointsTests(TestCase):
    def setUp(self):
        self.now = datetime(2026, 11, 12, 15, 0, 0, tzinfo=UTC)
        self.agent_id = uuid.uuid4()
        self.other_agent_id = uuid.uuid4()
        self.admin_id = uuid.uuid4()

        UserProjection.objects.create(
            user_id=self.agent_id,
            email="agent1@techdistribution.com",
            display_name="Agente Uno",
            active=True,
            assignments=[{"system": "PURCHASES", "role": "PURCHASES_AGENT"}],
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )
        UserProjection.objects.create(
            user_id=self.other_agent_id,
            email="agent2@techdistribution.com",
            display_name="Agente Dos",
            active=True,
            assignments=[{"system": "PURCHASES", "role": "PURCHASES_AGENT"}],
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )
        UserProjection.objects.create(
            user_id=self.admin_id,
            email="admin@techdistribution.com",
            display_name="Admin Compras",
            active=True,
            assignments=[{"system": "PURCHASES", "role": "ADMIN"}],
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )

        self.product_1 = ProductProjection.objects.create(
            product_id=uuid.uuid4(),
            sku="LAP-PRO-16",
            name="Laptop Pro 16 Pulgadas",
            unit=ProjectionProductUnit.UNIT,
            stock_on_hand=30,
            active=True,
            created_by=self.admin_id,
            updated_by=self.admin_id,
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )
        self.product_2 = ProductProjection.objects.create(
            product_id=uuid.uuid4(),
            sku="MON-27-4K",
            name="Monitor 27 4K IPS",
            unit=ProjectionProductUnit.UNIT,
            stock_on_hand=12,
            active=True,
            created_by=self.admin_id,
            updated_by=self.admin_id,
            entity_version=1,
            source_event_id=uuid.uuid4(),
            source_event_at=self.now,
            projected_at=self.now,
        )

        self.agent_token = _mint_jwt(
            user_id=self.agent_id,
            email="agent1@techdistribution.com",
            role="PURCHASES_AGENT",
        )
        self.other_agent_token = _mint_jwt(
            user_id=self.other_agent_id,
            email="agent2@techdistribution.com",
            role="PURCHASES_AGENT",
        )
        self.admin_token = _mint_jwt(
            user_id=self.admin_id,
            email="admin@techdistribution.com",
            role="ADMIN",
        )

    def _headers(
        self,
        token: str,
        *,
        idempotency_key: uuid.UUID | str | None = None,
    ) -> dict[str, str]:
        headers = {"HTTP_AUTHORIZATION": f"Bearer {token}"}
        if idempotency_key is not None:
            headers["HTTP_IDEMPOTENCY_KEY"] = str(idempotency_key)
        return headers

    def test_create_order_idempotency_replay_and_conflict(self):
        idem_key = uuid.uuid4()
        payload = {
            "supplierName": "Mayorista Cómputo MX",
            "lines": [
                {
                    "productId": str(self.product_1.product_id),
                    "quantity": 3,
                    "unitPrice": "18500.50",
                },
                {
                    "productId": str(self.product_2.product_id),
                    "quantity": 2,
                    "unitPrice": "6200.25",
                },
            ],
        }

        res1 = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(payload),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=idem_key),
        )
        self.assertEqual(res1.status_code, 201)
        body1 = res1.json()
        self.assertFalse(body1["error"])
        self.assertEqual(body1["statusCode"], 201)
        self.assertEqual(body1["data"]["status"], "DRAFT")
        self.assertEqual(body1["data"]["version"], 1)
        self.assertEqual(body1["data"]["totalAmount"], "67902.00")
        self.assertEqual(len(body1["data"]["lines"]), 2)
        self.assertEqual(body1["data"]["lines"][0]["skuSnapshot"], "LAP-PRO-16")
        self.assertEqual(body1["data"]["lines"][0]["lineTotal"], "55501.50")

        # Repetir el mismo request con la misma key devuelve exactamente el resultado original
        res_replay = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(payload),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=idem_key),
        )
        self.assertEqual(res_replay.status_code, 201)
        self.assertEqual(res_replay.json(), body1)
        self.assertEqual(PurchaseOrder.objects.count(), 1)

        # Cambiar el cuerpo con la misma key devuelve 409 IDEMPOTENCY_CONFLICT
        modified_payload = {
            **payload,
            "supplierName": "Otro Proveedor Distinto",
        }
        res_conflict = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(modified_payload),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=idem_key),
        )
        self.assertEqual(res_conflict.status_code, 409)
        self.assertEqual(res_conflict.json()["code"], "IDEMPOTENCY_CONFLICT")

    def test_validation_rejections_do_not_consume_idempotency_key(self):
        reusable_key = uuid.uuid4()

        # 1. Más de dos decimales -> 400 INVALID_DECIMAL_SCALE
        bad_scale = {
            "supplierName": "Proveedor",
            "lines": [
                {
                    "productId": str(self.product_1.product_id),
                    "quantity": 1,
                    "unitPrice": "199.999",
                }
            ],
        }
        res_scale = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(bad_scale),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=reusable_key),
        )
        self.assertEqual(res_scale.status_code, 400)
        self.assertEqual(res_scale.json()["details"][0]["code"], "INVALID_DECIMAL_SCALE")

        # 2. Producto repetido -> 400 DUPLICATE_PRODUCT_LINE
        dup_prod = {
            "supplierName": "Proveedor",
            "lines": [
                {
                    "productId": str(self.product_1.product_id),
                    "quantity": 1,
                    "unitPrice": "100.00",
                },
                {
                    "productId": str(self.product_1.product_id),
                    "quantity": 2,
                    "unitPrice": "100.00",
                },
            ],
        }
        res_dup = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(dup_prod),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=reusable_key),
        )
        self.assertEqual(res_dup.status_code, 400)
        self.assertEqual(res_dup.json()["details"][0]["code"], "DUPLICATE_PRODUCT_LINE")

        # 3. Producto ausente en proyección -> 409 PROJECTION_NOT_READY con Retry-After: 2
        missing_prod = {
            "supplierName": "Proveedor",
            "lines": [
                {
                    "productId": str(uuid.uuid4()),
                    "quantity": 1,
                    "unitPrice": "100.00",
                }
            ],
        }
        res_missing = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(missing_prod),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=reusable_key),
        )
        self.assertEqual(res_missing.status_code, 409)
        self.assertEqual(res_missing.json()["code"], "PROJECTION_NOT_READY")
        self.assertEqual(res_missing["Retry-After"], "2")

        # La key sigue libre porque ningún intento anterior hizo commit
        valid_payload = {
            "supplierName": "Proveedor Válido",
            "lines": [
                {
                    "productId": str(self.product_1.product_id),
                    "quantity": 1,
                    "unitPrice": "100.00",
                }
            ],
        }
        res_ok = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(valid_payload),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=reusable_key),
        )
        self.assertEqual(res_ok.status_code, 201)

    def test_edit_submit_freeze_snapshots_and_cancel_lifecycle(self):
        # 1. Crear orden DRAFT (v1)
        create_res = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(
                {
                    "supplierName": "Proveedor Inicial",
                    "lines": [
                        {
                            "productId": str(self.product_1.product_id),
                            "quantity": 1,
                            "unitPrice": "15000.00",
                        }
                    ],
                }
            ),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=uuid.uuid4()),
        )
        self.assertEqual(create_res.status_code, 201)
        order_id = create_res.json()["data"]["id"]

        # 2. Editar DRAFT con PUT (v1 -> v2)
        update_res = self.client.put(
            f"/api/purchases/orders/{order_id}",
            data=json.dumps(
                {
                    "expectedVersion": 1,
                    "supplierName": "Proveedor Actualizado S.A.",
                    "lines": [
                        {
                            "productId": str(self.product_1.product_id),
                            "quantity": 2,
                            "unitPrice": "14500.00",
                        }
                    ],
                }
            ),
            content_type="application/json",
            **self._headers(self.agent_token),
        )
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["data"]["version"], 2)
        self.assertEqual(update_res.json()["data"]["totalAmount"], "29000.00")

        # Conflicto optimista si se intenta editar con expectedVersion=1 obsoleta
        stale_put = self.client.put(
            f"/api/purchases/orders/{order_id}",
            data=json.dumps(
                {
                    "expectedVersion": 1,
                    "supplierName": "Intento Obsoleto",
                    "lines": [
                        {
                            "productId": str(self.product_1.product_id),
                            "quantity": 1,
                            "unitPrice": "14500.00",
                        }
                    ],
                }
            ),
            content_type="application/json",
            **self._headers(self.agent_token),
        )
        self.assertEqual(stale_put.status_code, 409)
        self.assertEqual(stale_put.json()["code"], "VERSION_CONFLICT")

        # 3. Enviar orden (DRAFT -> SUBMITTED, v2 -> v3)
        submit_key = uuid.uuid4()
        submit_res = self.client.post(
            f"/api/purchases/orders/{order_id}/submit",
            data=json.dumps({"expectedVersion": 2}),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=submit_key),
        )
        self.assertEqual(submit_res.status_code, 200)
        submit_body = submit_res.json()
        self.assertEqual(submit_body["data"]["status"], "SUBMITTED")
        self.assertEqual(submit_body["data"]["version"], 3)
        self.assertIsNotNone(submit_body["data"]["submittedAt"])

        # Reintentar submit con la misma key devuelve 200 original
        submit_replay = self.client.post(
            f"/api/purchases/orders/{order_id}/submit",
            data=json.dumps({"expectedVersion": 2}),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=submit_key),
        )
        self.assertEqual(submit_replay.status_code, 200)
        self.assertEqual(submit_replay.json(), submit_body)

        # Intentar editar orden ya SUBMITTED devuelve 409 ORDER_STATE_CONFLICT
        put_after_submit = self.client.put(
            f"/api/purchases/orders/{order_id}",
            data=json.dumps(
                {
                    "expectedVersion": 3,
                    "supplierName": "No Permitido",
                    "lines": [
                        {
                            "productId": str(self.product_1.product_id),
                            "quantity": 1,
                            "unitPrice": "100.00",
                        }
                    ],
                }
            ),
            content_type="application/json",
            **self._headers(self.agent_token),
        )
        self.assertEqual(put_after_submit.status_code, 409)
        self.assertEqual(put_after_submit.json()["code"], "ORDER_STATE_CONFLICT")

        # 4. Cambiar catálogo en ProductProjection NO altera los snapshots históricos de la orden
        self.product_1.sku = "LAP-NEW-SKU"
        self.product_1.name = "Nombre Cambiado en Catálogo"
        self.product_1.active = False
        self.product_1.entity_version = 2
        self.product_1.save()

        detail_res = self.client.get(
            f"/api/purchases/orders/{order_id}",
            **self._headers(self.agent_token),
        )
        self.assertEqual(detail_res.status_code, 200)
        line_data = detail_res.json()["data"]["lines"][0]
        self.assertEqual(line_data["skuSnapshot"], "LAP-PRO-16")
        self.assertEqual(line_data["nameSnapshot"], "Laptop Pro 16 Pulgadas")
        self.assertEqual(line_data["currentCatalog"]["sku"], "LAP-NEW-SKU")
        self.assertFalse(line_data["currentCatalog"]["active"])

        # 5. Cancelar orden SUBMITTED (SUBMITTED -> CANCELLED, v3 -> v4)
        cancel_key = uuid.uuid4()
        cancel_res = self.client.post(
            f"/api/purchases/orders/{order_id}/cancel",
            data=json.dumps({"expectedVersion": 3, "reason": "Cancelado por proveedor"}),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=cancel_key),
        )
        self.assertEqual(cancel_res.status_code, 200)
        cancel_data = cancel_res.json()["data"]
        self.assertEqual(cancel_data["status"], "CANCELLED")
        self.assertEqual(cancel_data["version"], 4)
        self.assertIsNotNone(cancel_data["submittedAt"])
        self.assertIsNotNone(cancel_data["cancelledAt"])

        # 6. Verificar historial auditable (4 versiones: CREATED, UPDATED, SUBMITTED, CANCELLED)
        hist_res = self.client.get(
            f"/api/purchases/orders/{order_id}/history",
            **self._headers(self.agent_token),
        )
        self.assertEqual(hist_res.status_code, 200)
        history_items = hist_res.json()["data"]
        self.assertEqual(
            [item["action"] for item in history_items],
            ["CREATED", "UPDATED", "SUBMITTED", "CANCELLED"],
        )

    def test_ownership_isolation_between_agents_and_admin_access(self):
        create_res = self.client.post(
            "/api/purchases/orders",
            data=json.dumps(
                {
                    "supplierName": "Proveedor Agente 1",
                    "lines": [
                        {
                            "productId": str(self.product_1.product_id),
                            "quantity": 1,
                            "unitPrice": "500.00",
                        }
                    ],
                }
            ),
            content_type="application/json",
            **self._headers(self.agent_token, idempotency_key=uuid.uuid4()),
        )
        order_id = create_res.json()["data"]["id"]

        # Otro PURCHASES_AGENT no ve la orden en su listado y recibe 403 al consultarla
        list_other = self.client.get(
            "/api/purchases/orders",
            **self._headers(self.other_agent_token),
        )
        self.assertEqual(list_other.status_code, 200)
        self.assertEqual(list_other.json()["data"], [])
        self.assertEqual(list_other.json()["meta"]["total"], 0)

        get_other = self.client.get(
            f"/api/purchases/orders/{order_id}",
            **self._headers(self.other_agent_token),
        )
        self.assertEqual(get_other.status_code, 403)
        self.assertEqual(get_other.json()["code"], "FORBIDDEN")

        # ADMIN sí puede listar todas las órdenes y operar sobre la orden de cualquier agente
        list_admin = self.client.get(
            "/api/purchases/orders",
            **self._headers(self.admin_token),
        )
        self.assertEqual(list_admin.status_code, 200)
        self.assertEqual(list_admin.json()["meta"]["total"], 1)

        cancel_admin = self.client.post(
            f"/api/purchases/orders/{order_id}/cancel",
            data=json.dumps({"expectedVersion": 1, "reason": "Cancelación administrativa"}),
            content_type="application/json",
            **self._headers(self.admin_token, idempotency_key=uuid.uuid4()),
        )
        self.assertEqual(cancel_admin.status_code, 200)
        self.assertEqual(cancel_admin.json()["data"]["status"], "CANCELLED")
