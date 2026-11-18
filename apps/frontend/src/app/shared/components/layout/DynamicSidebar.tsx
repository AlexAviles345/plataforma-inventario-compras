import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { NAVIGATION_ITEMS } from '@shared/config/navigation.config';
import { logoutSession } from '@shared/services/auth-session.service';
import {
  selectActiveSession,
  useAuthSessionStore,
} from '@shared/stores/auth-session.store';
import { cn } from '@shared/utils/cn';
import { SignOutConfirmationDialog } from './SignOutConfirmationDialog';

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

  const items = NAVIGATION_ITEMS.filter((item) => {
    if (item.system && !sessions[item.system]) return false;
    if (
      item.roles &&
      !item.roles.includes(activeSession?.claims.role ?? 'PURCHASES_AGENT')
    ) {
      return false;
    }
    return true;
  });

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
        <div className="mb-2 rounded-lg bg-white/5 px-3 py-2">
          <p className="truncate text-xs font-medium">
            {activeSession?.claims.email}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {activeSession?.claims.role}
          </p>
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
