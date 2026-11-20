import { ActiveSystemSessionCard } from './components/ActiveSystemSessionCard';
import { OperationalOverviewSection } from './components/OperationalOverviewSection';
import { QuickModuleAccessGrid } from './components/QuickModuleAccessGrid';

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
          Centro de operaciones
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Resumen</h1>
        <p className="max-w-2xl text-muted-foreground">
          Monitorea la actividad reciente, indicadores clave y accesos
          autorizados en tu sesión.
        </p>
      </header>
      <OperationalOverviewSection />
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Módulos disponibles</h2>
        <QuickModuleAccessGrid />
      </section>
      <ActiveSystemSessionCard />
    </div>
  );
}
