import { deliveryStatusLabel, toStableTimeline } from './order-tracking.helpers';
import { TrackingTimelineEvent } from '../../core/models/tracking.models';

describe('order-tracking.helpers', () => {
  it('maps delivery status to Arabic labels', () => {
    expect(deliveryStatusLabel('pending')).toBe('بانتظار المعالجة');
    expect(deliveryStatusLabel('processing')).toBe('قيد المعالجة');
    expect(deliveryStatusLabel('shipped')).toBe('تم الشحن');
    expect(deliveryStatusLabel('out_for_delivery')).toBe('خرج للتسليم');
    expect(deliveryStatusLabel('delivered')).toBe('تم التسليم');
    expect(deliveryStatusLabel('cancelled')).toBe('تم الإلغاء');
  });

  it('keeps timeline oldest to newest with stable ordering for same timestamps', () => {
    const input: TrackingTimelineEvent[] = [
      {
        id: '3',
        deliveryStatus: 'delivered',
        trackingNumber: null,
        shippingCarrier: null,
        trackingUrl: null,
        currentLocation: null,
        trackingNote: null,
        eventAt: '2026-03-08T10:00:00.000Z',
        actorType: 'admin',
        actorUserId: 1,
      },
      {
        id: '1',
        deliveryStatus: 'processing',
        trackingNumber: null,
        shippingCarrier: null,
        trackingUrl: null,
        currentLocation: null,
        trackingNote: null,
        eventAt: '2026-03-08T08:00:00.000Z',
        actorType: 'system',
        actorUserId: null,
      },
      {
        id: '2',
        deliveryStatus: 'shipped',
        trackingNumber: null,
        shippingCarrier: null,
        trackingUrl: null,
        currentLocation: null,
        trackingNote: null,
        eventAt: '2026-03-08T08:00:00.000Z',
        actorType: 'admin',
        actorUserId: 1,
      },
    ];

    const sorted = toStableTimeline(input);
    expect(sorted.map((item) => item.id)).toEqual(['1', '2', '3']);
  });
});
