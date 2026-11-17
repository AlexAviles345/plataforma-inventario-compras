import { z } from 'zod';

export const systemTtlSchema = z.object({
  accessTokenTtlSeconds: z
    .number({ error: 'La vigencia es obligatoria' })
    .int('La vigencia debe expresarse en segundos enteros')
    .min(60, 'La vigencia mínima administrable es de 60 segundos')
    .max(3600, 'La vigencia no puede superar 3600 segundos'),
});

export type SystemTtlFormValues = z.infer<typeof systemTtlSchema>;
