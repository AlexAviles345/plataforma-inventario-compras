import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';

import { GatewayApiError } from '@shared/services/gateway-api-error';

import {
  userCreateSchema,
  type UserCreateFormValues,
} from '../schemas/user-form.schema';
import { createAdminUser } from '../services/users-admin.service';
import type { AdminUser } from '../types/users-admin.types';
import { toAssignments } from '../utils/user-assignments';
import { userQueryKeys } from './user-query-keys';

export function useCreateUser(onCreated: () => void) {
  const queryClient = useQueryClient();
  const form = useForm<UserCreateFormValues>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: {
      email: '',
      displayName: '',
      password: '',
      inventoryRole: 'NONE',
      purchasesRole: 'NONE',
    },
  });
  const mutation = useMutation({
    mutationFn: (values: UserCreateFormValues) =>
      createAdminUser({
        email: values.email.trim().toLowerCase(),
        displayName: values.displayName.trim(),
        password: values.password,
        assignments: toAssignments(values.inventoryRole, values.purchasesRole),
      }),
    onSuccess: (createdUser) => {
      queryClient.setQueryData<AdminUser[]>(
        userQueryKeys.known(),
        (current) => [
          createdUser,
          ...(current ?? []).filter((user) => user.id !== createdUser.id),
        ],
      );
      toast.success('Usuario creado correctamente');
      form.reset();
      onCreated();
    },
    onError: (error) => {
      if (error instanceof GatewayApiError) {
        error.details?.forEach((detail) => {
          if (detail.field) {
            form.setError(detail.field as FieldPath<UserCreateFormValues>, {
              type: 'server',
              message: detail.message,
            });
          }
        });
      }
    },
  });

  return {
    form,
    mutation,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
  };
}
