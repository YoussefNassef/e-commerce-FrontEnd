export type DeliveryStatus =
  | 'pending'
  | 'processing'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface TrackingTimelineEvent {
  id: string;
  deliveryStatus: DeliveryStatus;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  trackingUrl: string | null;
  currentLocation: string | null;
  trackingNote: string | null;
  eventAt: string;
  actorType: 'admin' | 'system';
  actorUserId: number | null;
}

export interface OrderTrackingDto {
  orderId: string;
  deliveryStatus: DeliveryStatus;
  trackingNumber: string | null;
  shippingCarrier: string | null;
  trackingUrl: string | null;
  currentLocation: string | null;
  trackingNote: string | null;
  estimatedDeliveryAt: string | null;
  shippedAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  deliveryStatusUpdatedAt: string | null;
  timeline: TrackingTimelineEvent[];
}

export interface UpdateOrderTrackingPayload {
  deliveryStatus: DeliveryStatus;
  trackingNumber?: string;
  shippingCarrier?: string;
  trackingUrl?: string;
  currentLocation?: string;
  trackingNote?: string;
  estimatedDeliveryAt?: string;
}
