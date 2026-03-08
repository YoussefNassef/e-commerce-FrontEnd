import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map } from 'rxjs/operators';
import {
  DeliveryStatus,
  OrderTrackingDto,
  TrackingTimelineEvent,
  UpdateOrderTrackingPayload,
} from '../models/tracking.models';
import { environment } from '../models/environment';
import { toStableTimeline } from '../../features/orders/order-tracking.helpers';

@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getOrderTracking(orderId: string) {
    return this.http
      .get<unknown>(`${this.api}/orders/${orderId}/tracking`)
      .pipe(map((response) => this.toOrderTrackingDto(response)));
  }

  updateOrderTracking(orderId: string, payload: UpdateOrderTrackingPayload) {
    return this.http
      .patch<unknown>(`${this.api}/orders/${orderId}/tracking`, payload)
      .pipe(map(() => undefined));
  }

  private toOrderTrackingDto(response: unknown): OrderTrackingDto {
    const source = this.extractSource(response);
    const timelineSource = Array.isArray(source['timeline'])
      ? source['timeline']
      : [];

    const timeline = toStableTimeline(
      timelineSource.map((item) =>
        this.toTimelineEvent(this.toRecord(item) ?? {}),
      ),
    );

    return {
      orderId: String(source['orderId'] ?? ''),
      deliveryStatus: this.toDeliveryStatus(source['deliveryStatus']),
      trackingNumber: this.toNullableString(source['trackingNumber']),
      shippingCarrier: this.toNullableString(source['shippingCarrier']),
      trackingUrl: this.toNullableString(source['trackingUrl']),
      currentLocation: this.toNullableString(source['currentLocation']),
      trackingNote: this.toNullableString(source['trackingNote']),
      estimatedDeliveryAt: this.toNullableString(source['estimatedDeliveryAt']),
      shippedAt: this.toNullableString(source['shippedAt']),
      outForDeliveryAt: this.toNullableString(source['outForDeliveryAt']),
      deliveredAt: this.toNullableString(source['deliveredAt']),
      deliveryStatusUpdatedAt: this.toNullableString(
        source['deliveryStatusUpdatedAt'],
      ),
      timeline,
    };
  }

  private toTimelineEvent(source: Record<string, unknown>): TrackingTimelineEvent {
    const actorType =
      String(source['actorType'] ?? '').toLowerCase().trim() === 'admin'
        ? 'admin'
        : 'system';

    const actorUserIdRaw = source['actorUserId'];
    const actorUserId =
      typeof actorUserIdRaw === 'number' && Number.isFinite(actorUserIdRaw)
        ? actorUserIdRaw
        : null;

    return {
      id: String(source['id'] ?? ''),
      deliveryStatus: this.toDeliveryStatus(source['deliveryStatus']),
      trackingNumber: this.toNullableString(source['trackingNumber']),
      shippingCarrier: this.toNullableString(source['shippingCarrier']),
      trackingUrl: this.toNullableString(source['trackingUrl']),
      currentLocation: this.toNullableString(source['currentLocation']),
      trackingNote: this.toNullableString(source['trackingNote']),
      eventAt: String(source['eventAt'] ?? ''),
      actorType,
      actorUserId,
    };
  }

  private extractSource(value: unknown): Record<string, unknown> {
    const record = this.toRecord(value);
    const data = this.toRecord(record?.['data']);
    const nested = this.toRecord(data?.['data']);
    return nested ?? data ?? record ?? {};
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized ? normalized : null;
  }

  private toDeliveryStatus(value: unknown): DeliveryStatus {
    const status = String(value ?? '').toLowerCase().trim();
    switch (status) {
      case 'pending':
      case 'processing':
      case 'shipped':
      case 'out_for_delivery':
      case 'delivered':
      case 'cancelled':
        return status;
      default:
        return 'pending';
    }
  }
}
