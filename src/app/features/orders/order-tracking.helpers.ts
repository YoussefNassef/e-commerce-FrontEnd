import { DeliveryStatus, TrackingTimelineEvent } from '../../core/models/tracking.models';

export function deliveryStatusLabel(status: DeliveryStatus | string): string {
  switch (String(status ?? '').toLowerCase().trim()) {
    case 'pending':
      return 'بانتظار المعالجة';
    case 'processing':
      return 'قيد المعالجة';
    case 'shipped':
      return 'تم الشحن';
    case 'out_for_delivery':
      return 'خرج للتسليم';
    case 'delivered':
      return 'تم التسليم';
    case 'cancelled':
      return 'تم الإلغاء';
    default:
      return 'غير معروف';
  }
}

export function toStableTimeline(
  timeline: readonly TrackingTimelineEvent[],
): TrackingTimelineEvent[] {
  return timeline
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const aTime = new Date(a.event.eventAt).getTime();
      const bTime = new Date(b.event.eventAt).getTime();

      if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
        return aTime - bTime;
      }

      return a.index - b.index;
    })
    .map(({ event }) => event);
}
