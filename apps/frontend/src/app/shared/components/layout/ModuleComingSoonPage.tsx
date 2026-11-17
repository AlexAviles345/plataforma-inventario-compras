import { Construction } from 'lucide-react';

import { Badge } from '@shared/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@shared/components/ui/card';

interface ModuleComingSoonPageProps {
  title: string;
  phase: number;
  description: string;
}

export function ModuleComingSoonPage({
  title,
  phase,
  description,
}: ModuleComingSoonPageProps) {
  return (
    <div className="mx-auto max-w-2xl py-12">
      <Card>
        <CardHeader>
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <Construction aria-hidden="true" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-2xl">{title}</CardTitle>
            <Badge variant="outline">Fase {phase}</Badge>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          La navegación y los permisos ya están preparados. La funcionalidad del
          dominio se incorporará en su fase correspondiente.
        </CardContent>
      </Card>
    </div>
  );
}
