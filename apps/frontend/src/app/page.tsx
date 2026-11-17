import { Badge } from '@shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';

const foundations = [
  ['React 19', 'Interfaz modular y tipada'],
  ['Vite 6', 'Desarrollo rápido en el puerto 5173'],
  ['Tailwind CSS 4', 'Sistema visual basado en tokens'],
];

export function FoundationPage() {
  const appName = import.meta.env.VITE_APP_NAME || 'TechDistribution';

  return (
    <main className="min-h-screen bg-background px-6 py-16 text-foreground">
      <section className="mx-auto flex max-w-5xl flex-col gap-12">
        <header className="max-w-3xl space-y-5">
          <Badge variant="secondary" className="tracking-[0.16em] uppercase">
            Fase 1 · Fundamentos
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            {appName}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            Base del frontend empresarial para administrar autenticación,
            inventario y compras a través del API Gateway.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {foundations.map(([title, description]) => (
            <Card key={title} className="border-border/70 shadow-sm">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent className="text-xs font-medium tracking-wider text-teal-700 uppercase dark:text-teal-300">
                Configurado
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
