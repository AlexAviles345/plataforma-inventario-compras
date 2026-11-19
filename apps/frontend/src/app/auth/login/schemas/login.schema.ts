import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Ingresa tu correo electrónico')
    .email('Ingresa un correo electrónico válido')
    .max(254, 'El correo es demasiado largo'),
  password: z
    .string()
    .min(1, 'Ingresa tu contraseña')
    .max(200, 'La contraseña es demasiado larga'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
