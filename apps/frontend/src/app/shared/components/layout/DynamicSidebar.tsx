import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Badge } from '@shared/components/ui/badge';
import { NAVIGATION_ITEMS } from '@shared/config/navigation.config';
import { logoutSession } from '@shared/services/auth-session.service';
import {
  selectActiveSession,
  useAuthSessionStore,
} from '@shared/stores/auth-session.store';
import type {
  SystemCode,
  SystemSession,
} from '@shared/types/auth-session.types';
import { isAccessTokenExpired } from '@shared/utils/access-token.util';
import { cn } from '@shared/utils/cn';
import { SignOutConfirmationDialog } from './SignOutConfirmationDialog';

const SYSTEM_LABELS: Record<SystemCode, string> = {
  INVENTORY: 'Inventario',
  PURCHASES: 'Compras',
};

interface DynamicSidebarProps {
  onNavigate?: () => void;
}

export function DynamicSidebar({ onNavigate }: DynamicSidebarProps) {
  const navigate = useNavigate();
  const [signOutDialogOpen, setSignOutDialogOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const activeSession = useAuthSessionStore(selectActiveSession);
  const sessions = useAuthSessionStore((state) => state.sessions);
  const clearSession = useAuthSessionStore((state) => state.clearSession);
  const appName = import.meta.env.VITE_APP_NAME || 'TechDistribution';

  const validSessions = (['INVENTORY', 'PURCHASES'] as const)
    .map((system) => sessions[system])
    .filter((session): session is SystemSession =>
      Boolean(session && !isAccessTokenExpired(session.claims)),
    );

  const items = NAVIGATION_ITEMS.filter((item) => {
    if (item.system) {
      const systemSession = sessions[item.system];
      if (!systemSession || isAccessTokenExpired(systemSession.claims)) {
        return false;
      }
      if (item.roles && !item.roles.includes(systemSession.claims.role)) {
        return false;
      }
      return true;
    }

    if (
      item.roles &&
      !validSessions.some((session) =>
        item.roles!.includes(session.claims.role),
      )
    ) {
      return false;
    }

    return true;
  });

  const displaySession = activeSession ?? validSessions[0];
  const displayRoles = Array.from(
    new Set(validSessions.map((session) => session.claims.role)),
  ).join(' · ');

  const confirmSignOut = async () => {
    setSigningOut(true);
    try {
      await logoutSession();
      setSignOutDialogOpen(false);
      clearSession();
      navigate('/login', { replace: true });
      onNavigate?.();
    } catch {
      toast.error('No fue posible cerrar la sesión. Inténtalo nuevamente.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-slate-950 text-slate-100">
      <div className="flex h-18 items-center gap-3 border-b border-white/10 px-5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-teal-400 font-bold text-slate-950">
          TD
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{appName}</p>
          <p className="text-xs text-slate-500">Panel operativo</p>
        </div>
      </div>

      <nav
        className="flex-1 space-y-1 overflow-y-auto p-3"
        aria-label="Principal"
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-teal-400 text-slate-950'
                    : 'text-slate-300 hover:bg-white/8 hover:text-white',
                )
              }
            >
              <Icon className="size-4.5" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="mb-2 space-y-1.5 rounded-lg bg-white/5 px-3 py-2">
          <p className="truncate text-xs font-medium">
            {displaySession?.claims.email}
          </p>
          <p className="text-[11px] text-slate-400">
            {displayRoles || displaySession?.claims.role}
          </p>
          {validSessions.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {validSessions.map((session) => (
                <Badge
                  key={session.claims.system}
                  variant="secondary"
                  className="bg-white/10 px-1.5 py-0 text-[10px] font-medium text-teal-300 hover:bg-white/15"
                >
                  {SYSTEM_LABELS[session.claims.system]}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSignOutDialogOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-white/8 hover:text-white"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Cerrar sesión
        </button>
      </div>

      <SignOutConfirmationDialog
        open={signOutDialogOpen}
        onOpenChange={setSignOutDialogOpen}
        onConfirm={confirmSignOut}
        pending={signingOut}
      />
    </div>
  );
}
