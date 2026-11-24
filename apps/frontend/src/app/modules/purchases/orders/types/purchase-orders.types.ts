import type { PaginationMeta } from '@shared/types/api-envelope.types';

export const ORDER_STATUSES = ['DRAFT', 'SUBMITTED', 'CANCELLED'] as const;
export type PurchaseOrderStatus = (typeof ORDER_STATUSES)[number];
export type PurchaseOrderAction =
  | 'CREATED'
  | 'UPDATED'
  | 'SUBMITTED'
  | 'CANCELLED';

export interface CurrentCatalogReference {
  sku: string;
  name: string;
  unit: string;
  active: boolean;
  stockOnHand: number;
  entityVersion: number;
}

export interface PurchaseOrderLine {
  id: string;
  position: number;
  productId: string;
  skuSnapshot: string;
  nameSnapshot: string;
  unit: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
  createdAt: string;
  updatedAt: string;
  currentCatalog?: CurrentCatalogReference;
}

export interface PurchaseOrder {
  id: string;
  requesterId: string;
  supplierName: string;
  currency: 'MXN';
  status: PurchaseOrderStatus;
  totalAmount: string;
  version: number;
  lastModifiedBy: string;
  submittedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLine[];
}

export interface PurchaseOrderHistoryEntry {
  id: string;
  orderId: string;
  orderVersion: number;
  action: PurchaseOrderAction;
  fromStatus: PurchaseOrderStatus | null;
  toStatus: PurchaseOrderStatus;
  actorUserId: string;
  requestId: string;
  changes: Record<string, unknown>;
  createdAt: string;
}

export interface OrderLineInput {
  productId: string;
  quantity: number;
  unitPrice: string;
}

export interface CreatePurchaseOrderInput {
  supplierName: string;
  lines: OrderLineInput[];
}

export interface UpdatePurchaseOrderInput extends CreatePurchaseOrderInput {
  expectedVersion: number;
}

export interface OrderTransitionInput {
  expectedVersion: number;
  reason?: string;
}

export interface OrdersListFilters {
  page: number;
  limit: number;
  status?: PurchaseOrderStatus;
  requesterId?: string;
}

export interface PaginatedPurchaseOrders {
  orders: PurchaseOrder[];
  meta: PaginationMeta;
}

export interface TopSupplierStat {
  supplierName: string;
  orderCount: number;
  totalAmount: string;
}

export interface PurchaseOrdersStats {
  totalOrders: number;
  draftOrders: number;
  submittedOrders: number;
  cancelledOrders: number;
  submittedAmount: string;
  draftAmount: string;
  currency: 'MXN';
  topSuppliers?: TopSupplierStat[];
}
