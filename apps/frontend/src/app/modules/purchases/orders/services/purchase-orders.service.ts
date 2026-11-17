import { apiRequest } from '@shared/services/http-client';

import type {
  CreatePurchaseOrderInput,
  OrderTransitionInput,
  OrdersListFilters,
  PaginatedPurchaseOrders,
  PurchaseOrder,
  PurchaseOrderHistoryEntry,
  UpdatePurchaseOrderInput,
} from '../types/purchase-orders.types';

const ORDERS_PATH = '/api/purchases/orders';

export async function listPurchaseOrders(
  filters: OrdersListFilters,
): Promise<PaginatedPurchaseOrders> {
  const result = await apiRequest<PurchaseOrder[]>({
    method: 'GET',
    url: ORDERS_PATH,
    requiredSystem: 'PURCHASES',
    params: {
      page: filters.page,
      limit: filters.limit,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.requesterId ? { requesterId: filters.requesterId } : {}),
    },
  });

  if (!result.meta) {
    throw new Error('El listado de órdenes no incluyó metadatos de paginación');
  }

  return { orders: result.data, meta: result.meta };
}

export async function getPurchaseOrder(
  orderId: string,
): Promise<PurchaseOrder> {
  const result = await apiRequest<PurchaseOrder>({
    method: 'GET',
    url: `${ORDERS_PATH}/${orderId}`,
    requiredSystem: 'PURCHASES',
  });
  return result.data;
}

export async function getPurchaseOrderHistory(
  orderId: string,
): Promise<PurchaseOrderHistoryEntry[]> {
  const result = await apiRequest<PurchaseOrderHistoryEntry[]>({
    method: 'GET',
    url: `${ORDERS_PATH}/${orderId}/history`,
    requiredSystem: 'PURCHASES',
  });
  return result.data;
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
  idempotencyKey: string,
): Promise<PurchaseOrder> {
  const result = await apiRequest<PurchaseOrder, CreatePurchaseOrderInput>({
    method: 'POST',
    url: ORDERS_PATH,
    data: input,
    requiredSystem: 'PURCHASES',
    idempotencyKey,
  });
  return result.data;
}

export async function updatePurchaseOrder(
  orderId: string,
  input: UpdatePurchaseOrderInput,
): Promise<PurchaseOrder> {
  const result = await apiRequest<PurchaseOrder, UpdatePurchaseOrderInput>({
    method: 'PUT',
    url: `${ORDERS_PATH}/${orderId}`,
    data: input,
    requiredSystem: 'PURCHASES',
  });
  return result.data;
}

export async function submitPurchaseOrder(
  orderId: string,
  input: OrderTransitionInput,
  idempotencyKey: string,
): Promise<PurchaseOrder> {
  const result = await apiRequest<PurchaseOrder, OrderTransitionInput>({
    method: 'POST',
    url: `${ORDERS_PATH}/${orderId}/submit`,
    data: input,
    requiredSystem: 'PURCHASES',
    idempotencyKey,
  });
  return result.data;
}

export async function cancelPurchaseOrder(
  orderId: string,
  input: OrderTransitionInput,
  idempotencyKey: string,
): Promise<PurchaseOrder> {
  const result = await apiRequest<PurchaseOrder, OrderTransitionInput>({
    method: 'POST',
    url: `${ORDERS_PATH}/${orderId}/cancel`,
    data: input,
    requiredSystem: 'PURCHASES',
    idempotencyKey,
  });
  return result.data;
}
