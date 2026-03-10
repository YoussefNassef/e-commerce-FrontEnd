import { InventoryReconciliationAnomalyType } from '../../core/models/inventory.models';

export type AnomalySeverity = 'critical' | 'warning';

export function anomalyTypeLabel(type: InventoryReconciliationAnomalyType): string {
  switch (type) {
    case 'negative_stock':
      return 'مخزون سالب';
    case 'negative_reserved_stock':
      return 'محجوز سالب';
    case 'reserved_stock_mismatch':
      return 'عدم تطابق المخزون المحجوز';
    default:
      return 'عدم تطابق المخزون المحجوز';
  }
}

export function anomalySeverity(type: InventoryReconciliationAnomalyType): AnomalySeverity {
  if (type === 'negative_stock' || type === 'negative_reserved_stock') {
    return 'critical';
  }
  return 'warning';
}

export function mapInventoryApiError(err: unknown, fallback = 'تعذر تنفيذ العملية.'): string {
  const message = extractServerMessage(err).toLowerCase();
  if (!message) {
    return fallback;
  }

  if (message.includes('forbidden') || message.includes('unauthorized')) {
    return 'لا تملك صلاحية تنفيذ هذا الإجراء.';
  }
  if (message.includes('validation') || message.includes('invalid')) {
    return 'البيانات المدخلة غير صحيحة. تحقق من القيم ثم أعد المحاولة.';
  }
  if (message.includes('network') || message.includes('failed to fetch')) {
    return 'تعذر الاتصال بالخادم. تحقق من الشبكة ثم أعد المحاولة.';
  }
  return extractServerMessage(err) || fallback;
}

export function formatArabicDate(iso: string, withTime = false): string {
  if (!iso) {
    return '-';
  }

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }

  const formatter = new Intl.DateTimeFormat('ar-SA', withTime
    ? { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: '2-digit' });
  return formatter.format(parsed);
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
