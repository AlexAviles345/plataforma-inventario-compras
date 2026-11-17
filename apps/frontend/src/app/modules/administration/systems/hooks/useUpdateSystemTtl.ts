import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, type FieldPath } from 'react-hook-form';
import { toast } from 'sonner';

import { GatewayApiError } from '@shared/services/gateway-api-error';

import {
  systemTtlSchema,
  type SystemTtlFormValues,
} from '../schemas/system-ttl.schema';
import { updateSystemTtl } from '../services/systems-admin.service';
import type { AuthSystemConfiguration } from '../types/systems-admin.types';
import { systemQueryKeys } from './system-query-keys';

export function useUpdateSystemTtl(
  system: AuthSystemConfiguration,
  onUpdated: () => void,
) {
  const queryClient = useQueryClient();
  const form = useForm<SystemTtlFormValues>({
    resolver: zodResolver(systemTtlSchema),
    defaultValues: {
      accessTokenTtlSeconds: system.accessTokenTtlSeconds,
    },
  });
  const mutation = useMutation({
    mutationFn: (values: SystemTtlFormValues) =>
      updateSystemTtl(system.code, {
        accessTokenTtlSeconds: values.accessTokenTtlSeconds,
        expectedVersion: system.version,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: systemQueryKeys.all });
      toast.success(`Vigencia de ${system.code} actualizada`);
      onUpdated();
    },
    onError: (error) => {
      if (!(error instanceof GatewayApiError)) return;
      if (error.code === 'VERSION_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: systemQueryKeys.all });
      }
      error.details?.forEach((detail) => {
        if (detail.field) {
          form.setError(detail.field as FieldPath<SystemTtlFormValues>, {
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
