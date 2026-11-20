import type { OrderFormValues } from '../schemas/order-form.schema';

const STORAGE_KEY = 'techdistribution:purchases:order-draft:v1';

export interface StoredOrderDraft {
  values: OrderFormValues;
  idempotencyKey: string;
  savedAt: string;
}

function storageAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.sessionStorage);
}

export function loadOrderDraft(): StoredOrderDraft | undefined {
  if (!storageAvailable()) return undefined;

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredOrderDraft>;
    if (
      !parsed.values ||
      typeof parsed.idempotencyKey !== 'string' ||
      typeof parsed.savedAt !== 'string'
    ) {
      return undefined;
    }
    return parsed as StoredOrderDraft;
  } catch {
    return undefined;
  }
}

export function saveOrderDraft(draft: StoredOrderDraft): void {
  if (!storageAvailable()) return;
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearOrderDraft(): void {
  if (!storageAvailable()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
}
