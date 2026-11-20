import { useState } from 'react';
import { Code2, KeyRound } from 'lucide-react';

import { Button } from '@shared/components/ui/button';
import { useAuthSessionStore } from '@shared/stores/auth-session.store';

interface DevelopmentTokenAccessProps {
  onAuthenticated: () => void;
}

export function DevelopmentTokenAccess({
  onAuthenticated,
}: DevelopmentTokenAccessProps) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string>();
  const setAccessToken = useAuthSessionStore((state) => state.setAccessToken);

  const applyToken = () => {
    try {
      setAccessToken(token);
      setToken('');
      setError(undefined);
      onAuthenticated();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'El token de desarrollo no es válido',
      );
    }
  };

  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-4">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2">
          <Code2 className="size-4 text-teal-700 dark:text-teal-300" />
          Acceso para desarrollo local
        </span>
        <span className="text-xs text-muted-foreground">
          {expanded ? 'Ocultar' : 'Configurar'}
        </span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-5 text-muted-foreground">
            Pega un JWT generado localmente. El token solo permanece en memoria
            y se elimina al recargar la página.
          </p>
          <textarea
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIs…"
            spellCheck={false}
            rows={4}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={!token.trim()}
            onClick={applyToken}
          >
            <KeyRound aria-hidden="true" />
            Usar token local
          </Button>
        </div>
      )}
    </div>
  );
}
