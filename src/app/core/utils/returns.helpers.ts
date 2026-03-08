import { ReturnReason, ReturnStatus } from '../models/returns.models';

export function returnReasonLabel(reason: ReturnReason | string): string {
  switch (String(reason ?? '').toLowerCase().trim()) {
    case 'damaged':
      return 'منتج تالف';
    case 'wrong_item':
      return 'منتج خاطئ';
    case 'not_as_described':
      return 'غير مطابق للوصف';
    case 'changed_mind':
      return 'تغيير رأي';
    case 'other':
      return 'سبب آخر';
    default:
      return 'غير محدد';
  }
}

export function returnStatusLabel(status: ReturnStatus | string): string {
  switch (String(status ?? '').toLowerCase().trim()) {
    case 'requested':
      return 'تم طلب الإرجاع';
    case 'approved':
      return 'تمت الموافقة';
    case 'rejected':
      return 'مرفوض';
    case 'refund_initiated':
      return 'بدأ الاسترجاع المالي';
    case 'refunded':
      return 'تم الاسترجاع المالي';
    case 'cancelled':
      return 'ملغي';
    default:
      return 'غير معروف';
  }
}

export function returnStatusTone(status: ReturnStatus | string): string {
  switch (String(status ?? '').toLowerCase().trim()) {
    case 'requested':
      return 'tone-requested';
    case 'approved':
      return 'tone-approved';
    case 'rejected':
      return 'tone-rejected';
    case 'refund_initiated':
      return 'tone-progress';
    case 'refunded':
      return 'tone-refunded';
    case 'cancelled':
      return 'tone-cancelled';
    default:
      return 'tone-requested';
  }
}

export function canCustomerCancelReturn(status: ReturnStatus | string): boolean {
  return String(status ?? '').toLowerCase().trim() === 'requested';
}

export function getAllowedNextAdminStatuses(
  currentStatus: ReturnStatus | string,
): Array<Exclude<ReturnStatus, 'requested'>> {
  const status = String(currentStatus ?? '').toLowerCase().trim();
  switch (status) {
    case 'requested':
      return ['approved', 'rejected', 'cancelled'];
    case 'approved':
      return ['refund_initiated'];
    case 'refund_initiated':
      return ['refunded'];
    default:
      return [];
  }
}
