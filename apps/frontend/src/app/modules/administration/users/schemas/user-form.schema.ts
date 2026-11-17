import { z } from 'zod';

const emailSchema = z
  .email('Ingresa un correo electrónico válido')
  .trim()
  .max(254, 'El correo no puede exceder 254 caracteres');

const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Ingresa el nombre visible')
  .max(200, 'El nombre no puede exceder 200 caracteres');

const assignmentFields = {
  inventoryRole: z.enum(['NONE', 'ADMIN', 'INVENTORY_MANAGER']),
  purchasesRole: z.enum(['NONE', 'ADMIN', 'PURCHASES_AGENT']),
};

const hasAssignment = (value: {
  inventoryRole: string;
  purchasesRole: string;
}) => value.inventoryRole !== 'NONE' || value.purchasesRole !== 'NONE';

const assignmentError = {
  path: ['inventoryRole'],
  message: 'Asigna al menos un sistema al usuario',
};

export const userCreateSchema = z
  .object({
    email: emailSchema,
    displayName: displayNameSchema,
    password: z
      .string()
      .min(12, 'La contraseña inicial debe tener al menos 12 caracteres')
      .max(128, 'La contraseña no puede exceder 128 caracteres'),
    ...assignmentFields,
  })
  .refine(hasAssignment, assignmentError);

export const userEditSchema = z
  .object({
    userId: z.uuid('Ingresa un UUID de usuario válido'),
    expectedVersion: z
      .number({ error: 'Ingresa la versión conocida' })
      .int('La versión debe ser un entero')
      .positive('La versión debe ser positiva'),
    email: emailSchema,
    displayName: displayNameSchema,
    active: z.boolean(),
    ...assignmentFields,
  })
  .refine(hasAssignment, assignmentError);

export type UserCreateFormValues = z.infer<typeof userCreateSchema>;
export type UserEditFormValues = z.infer<typeof userEditSchema>;
export type InventoryAssignmentRole = UserCreateFormValues['inventoryRole'];
export type PurchasesAssignmentRole = UserCreateFormValues['purchasesRole'];
