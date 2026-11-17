import type { PropsWithChildren } from 'react';
import { Boxes, ShieldCheck, ShoppingCart } from 'lucide-react';

export function AuthLayout({ children }: PropsWithChildren) {
  const appName = import.meta.env.VITE_APP_NAME || 'TechDistribution';

  return (
    <main className="min-h-screen bg-slate-950 lg:grid lg:grid-cols-[1.15fr_0.85fr]">
      <section className="relative hidden overflow-hidden p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(20,184,166,0.28),transparent_35%),radial-gradient(circle_at_90%_80%,rgba(59,130,246,0.2),transparent_30%)]" />
        <div className="relative flex items-center gap-3 text-sm font-semibold tracking-wide">
          <span className="flex size-10 items-center justify-center rounded-xl bg-white text-slate-950">
            TD
          </span>
          {appName}
        </div>

        <div className="relative max-w-xl space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-medium tracking-[0.24em] text-teal-300 uppercase">
              Operación unificada
            </p>
            <h1 className="text-5xl font-semibold tracking-tight">
              Inventario y compras, en un mismo lugar.
            </h1>
            <p className="max-w-lg text-lg leading-8 text-slate-300">
              Accede al sistema autorizado para tu rol. Cada sesión conserva su
              contexto y permisos de forma independiente.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <Boxes className="mb-3 size-5 text-teal-300" />
              Inventario
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <ShoppingCart className="mb-3 size-5 text-blue-300" />
              Compras
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <ShieldCheck className="mb-3 size-5 text-emerald-300" />
              Acceso RBAC
            </div>
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          Plataforma interna · Acceso exclusivo para personal autorizado
        </p>
      </section>

      <section className="flex min-h-screen items-center bg-background px-5 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
