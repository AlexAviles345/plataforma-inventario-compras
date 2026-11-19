import { ArrowRight, LoaderCircle, LockKeyhole, Mail } from 'lucide-react';

import { GatewayApiError } from '@shared/services/gateway-api-error';
import { Button } from '@shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';
import { Input } from '@shared/components/ui/input';
import { Label } from '@shared/components/ui/label';

import { useLoginForm } from '../hooks/useLoginForm';

interface LoginFormCardProps {
  onAuthenticated: () => void;
}

function LoginError({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof Error
      ? error.message
      : 'No fue posible iniciar sesión. Intenta nuevamente.';
  const requestId =
    error instanceof GatewayApiError ? error.requestId : undefined;

  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
    >
      <p className="font-medium">{message}</p>
      {requestId && (
        <p className="mt-1 font-mono text-xs opacity-80">
          Solicitud: {requestId}
        </p>
      )}
    </div>
  );
}

export function LoginFormCard({ onAuthenticated }: LoginFormCardProps) {
  const { form, mutation, submit } = useLoginForm({ onAuthenticated });
  const disabled = mutation.isPending;

  return (
    <Card className="border-border/70 shadow-xl shadow-slate-950/5">
      <CardHeader className="space-y-2">
        <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-white dark:text-slate-950">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl">Inicia sesión</CardTitle>
        <CardDescription>
          Ingresa tus credenciales para acceder a los módulos autorizados para
          tu rol.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="usuario@techdistribution.com"
                className="pl-9"
                aria-invalid={Boolean(form.formState.errors.email)}
                disabled={disabled}
                {...form.register('email')}
              />
            </div>
            {form.formState.errors.email && (
              <p className="text-sm text-destructive">
                {form.formState.errors.email.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                className="pl-9"
                aria-invalid={Boolean(form.formState.errors.password)}
                disabled={disabled}
                {...form.register('password')}
              />
            </div>
            {form.formState.errors.password && (
              <p className="text-sm text-destructive">
                {form.formState.errors.password.message}
              </p>
            )}
          </div>

          <LoginError error={mutation.error} />

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={disabled}
          >
            {disabled ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight aria-hidden="true" />
            )}
            {disabled ? 'Validando acceso…' : 'Continuar'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
