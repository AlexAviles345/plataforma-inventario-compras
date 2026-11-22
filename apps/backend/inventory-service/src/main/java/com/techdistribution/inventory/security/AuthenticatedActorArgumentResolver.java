package com.techdistribution.inventory.security;

import com.techdistribution.inventory.common.api.ApiException;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.context.request.RequestAttributes;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

/** Inyecta en los controladores el actor verificado por {@link JwtAuthenticationFilter}. */
public class AuthenticatedActorArgumentResolver implements HandlerMethodArgumentResolver {

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return AuthenticatedActor.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(
            MethodParameter parameter,
            ModelAndViewContainer mavContainer,
            NativeWebRequest webRequest,
            WebDataBinderFactory binderFactory) {
        Object actor = webRequest.getAttribute(JwtAuthenticationFilter.ACTOR_ATTRIBUTE, RequestAttributes.SCOPE_REQUEST);
        if (actor instanceof AuthenticatedActor authenticated) {
            return authenticated;
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_REQUIRED", "Token no proporcionado");
    }
}
