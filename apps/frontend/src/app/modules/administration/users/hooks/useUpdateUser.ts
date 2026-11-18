import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';

import { GatewayApiError } from '@shared/services/gateway-api-error';

import {
  userEditSchema,
  type UserEditFormValues,
} from '../schemas/user-form.schema';
import { updateAdminUser } from '../services/users-admin.service';
import type { AdminUser } from '../types/users-admin.types';
import { fromAssignments, toAssignments } from '../utils/user-assignments';
import { userQueryKeys } from './user-query-keys';

export function useUpdateUser(
  user: AdminUser | undefined,
  onUpdated: () => void,
) {
  const queryClient = useQueryClient();
  const assignments = fromAssignments(user);
  const form = useForm<UserEditFormValues>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      userId: user?.id ?? '',
      expectedVersion: user?.version ?? 1,
      email: user?.email ?? '',
      displayName: user?.displayName ?? '',
      active: user?.active ?? true,
      ...assignments,
    },
  });
  const mutation = useMutation({
    mutationFn: (values: UserEditFormValues) =>
      updateAdminUser(values.userId, {
        expectedVersion: values.expectedVersion,
        email: values.email.trim().toLowerCase(),
        displayName: values.displayName.trim(),
        active: values.active,
        assignments: toAssignments(values.inventoryRole, values.purchasesRole),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
      toast.success('Usuario actualizado correctamente');
      onUpdated();
    },
    onError: (error) => {
      if (!(error instanceof GatewayApiError)) return;
      if (error.code === 'VERSION_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: userQueryKeys.all });
      }
      error.details?.forEach((detail) => {
        if (detail.field) {
          form.setError(detail.field as FieldPath<UserEditFormValues>, {
            type: 'server',
            message: detail.message,
          });
        }
      });
    },
  });

  return {
    form,
    mutation,
    submit: form.handleSubmit((values) => mutation.mutate(values)),
  };
}
