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
  const developmentTokenAccessEnabled =
    import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_DEV_TOKEN_ACCESS === 'true';
  const onAuthenticated = () => {
    navigate(safeReturnPath(searchParams.get('returnTo')), { replace: true });
  };

  return (
    <AuthLayout>
      <div className="space-y-4">
        <LoginFormCard onAuthenticated={onAuthenticated} />
        {developmentTokenAccessEnabled && (
          <DevelopmentTokenAccess onAuthenticated={onAuthenticated} />
        )}
      </div>
    </AuthLayout>
  );
}
