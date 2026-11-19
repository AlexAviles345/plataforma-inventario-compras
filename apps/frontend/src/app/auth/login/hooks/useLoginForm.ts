import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { useAuthSessionStore } from '@shared/stores/auth-session.store';
import { InvalidAccessTokenError } from '@shared/utils/access-token.util';

import { loginSchema, type LoginFormValues } from '../schemas/login.schema';
import { login } from '../services/auth-login.service';

interface UseLoginFormOptions {
  onAuthenticated: () => void;
}

export function useLoginForm({ onAuthenticated }: UseLoginFormOptions) {
  const setRenewableSessionBundle = useAuthSessionStore(
    (state) => state.setRenewableSessionBundle,
  );
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const mutation = useMutation({
    mutationFn: async (credentials: LoginFormValues) => {
      const response = await login(credentials);

      if (
        response.tokenType !== 'Bearer' ||
        !Number.isInteger(response.expiresIn) ||
        response.expiresIn <= 0
      ) {
        throw new InvalidAccessTokenError(
          'Auth devolvió una respuesta de sesión inválida',
        );
      }

      setRenewableSessionBundle(
        response.accessToken,
        response.tokens?.map((entry) => entry.accessToken),
      );

      return credentials;
    },
    onSuccess: (credentials) => {
      form.reset({ ...credentials, password: '' });
      onAuthenticated();
    },
  });

  const submit = form.handleSubmit((values) => mutation.mutate(values));

  return { form, mutation, submit };
}
