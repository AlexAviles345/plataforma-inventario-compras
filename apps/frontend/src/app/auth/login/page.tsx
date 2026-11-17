import { useNavigate, useSearchParams } from 'react-router-dom';

import { AuthLayout } from '@auth/layout';

import { DevelopmentTokenAccess } from './components/DevelopmentTokenAccess';
import { LoginFormCard } from './components/LoginFormCard';

function safeReturnPath(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//')
    ? value
    : '/dashboard';
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const onAuthenticated = () => {
    navigate(safeReturnPath(searchParams.get('returnTo')), { replace: true });
  };

  return (
    <AuthLayout>
      <div className="space-y-4">
        <LoginFormCard onAuthenticated={onAuthenticated} />
        {import.meta.env.DEV && (
          <DevelopmentTokenAccess onAuthenticated={onAuthenticated} />
        )}
        <p className="text-center text-xs leading-5 text-muted-foreground">
          El access token permanece únicamente en memoria. Al expirar deberás
          autenticarte nuevamente.
        </p>
      </div>
    </AuthLayout>
  );
}
