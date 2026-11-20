import { useParams } from 'react-router-dom';

import { ApiErrorAlert } from '@shared/components/data-display/ApiErrorAlert';
import { Skeleton } from '@shared/components/ui/skeleton';

import { OrderFormEditor } from '../components/OrderFormEditor';
import { useOrderDetail } from '../hooks/useOrderDetail';

export function OrderFormPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const orderQuery = useOrderDetail(orderId);

  if (orderId && orderQuery.isLoading) {
    return <Skeleton className="h-[36rem]" />;
  }

  if (orderId && orderQuery.error) {
    return <ApiErrorAlert error={orderQuery.error} />;
  }

  if (orderQuery.data && orderQuery.data.status !== 'DRAFT') {
    return (
      <ApiErrorAlert
        error={new Error('Solo las órdenes en borrador pueden editarse')}
      />
    );
  }

  return <OrderFormEditor order={orderQuery.data} />;
}
