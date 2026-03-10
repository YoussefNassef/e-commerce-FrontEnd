import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { CreateStockAdjustmentPayload, StockAdjustmentReason, UpdateProductCommercialPayload } from '../../core/models/inventory.models';

export const STOCK_REASON_OPTIONS: readonly StockAdjustmentReason[] = ['restock', 'damage', 'return', 'cycle_count', 'manual'];

export interface CommercialInitialState {
  name: string;
  price: number;
}

export function stockReasonLabel(reason: StockAdjustmentReason): string {
  switch (reason) {
    case 'restock':
      return 'إعادة تخزين';
    case 'damage':
      return 'تلف';
    case 'return':
      return 'مرتجع';
    case 'cycle_count':
      return 'جرد دوري';
    case 'manual':
      return 'تعديل يدوي';
    default:
      return 'تعديل يدوي';
  }
}

export function isValidDelta(value: unknown): boolean {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) && numericValue !== 0;
}

export function hasCommercialChanges(
  payload: UpdateProductCommercialPayload,
  initial: CommercialInitialState | null
): boolean {
  if (!initial) {
    return false;
  }

  const nameChanged = typeof payload.name === 'string' && payload.name.trim() !== initial.name.trim();
  const priceChanged = typeof payload.price === 'number' && Number(payload.price) !== Number(initial.price);
  return nameChanged || priceChanged;
}

export function buildCommercialPayload(
  formValue: { name: string; price: number | null },
  initial: CommercialInitialState | null
): UpdateProductCommercialPayload {
  if (!initial) {
    return {};
  }
  const payload: UpdateProductCommercialPayload = {};
  const nextName = formValue.name.trim();
  if (nextName && nextName !== initial.name.trim()) {
    payload.name = nextName;
  }
  if (typeof formValue.price === 'number' && Number.isFinite(formValue.price) && formValue.price !== initial.price) {
    payload.price = formValue.price;
  }
  return payload;
}

export function mapStockAdjustmentError(err: unknown): string {
  const message = extractServerMessage(err).toLowerCase();
  if (message.includes('cannot') && message.includes('below 0')) {
    return 'لا يمكن خصم كمية أكبر من المخزون المتاح';
  }
  if (message.includes('final stock') && message.includes('0')) {
    return 'لا يمكن خصم كمية أكبر من المخزون المتاح';
  }
  return extractServerMessage(err) || 'تعذر تنفيذ تعديل المخزون.';
}

export function commercialChangedValidator(getInitialState: () => CommercialInitialState | null): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = (control.value ?? {}) as { name?: unknown; price?: unknown };
    const initial = getInitialState();
    const payload: UpdateProductCommercialPayload = {
      name: typeof value.name === 'string' ? value.name : '',
      price: typeof value.price === 'number' ? value.price : undefined
    };

    return hasCommercialChanges(payload, initial) ? null : { commercialUnchanged: true };
  };
}

export function stockDeltaValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  return isValidDelta(value) ? null : { invalidDelta: true };
}

export function sanitizeStockAdjustmentPayload(value: {
  delta: number;
  reason: StockAdjustmentReason | '';
  reference: string;
  note: string;
}): CreateStockAdjustmentPayload {
  return {
    delta: value.delta,
    reason: value.reason || undefined,
    reference: value.reference.trim() || undefined,
    note: value.note.trim() || undefined
  };
}

function extractServerMessage(err: unknown): string {
  const response = (err as { error?: Record<string, unknown> } | null)?.error;
  if (!response || typeof response !== 'object') {
    return '';
  }
  const message = response['message'];
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' | ');
  }
  return '';
}
