import { OperationalOverviewSection } from './components/OperationalOverviewSection';

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
          Centro de operaciones
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Resumen</h1>
        <p className="max-w-2xl text-muted-foreground">
          Consulta las estadísticas generales de operación y los movimientos
          recientes.
        </p>
      </header>
      <OperationalOverviewSection />
    </div>
  );
}
