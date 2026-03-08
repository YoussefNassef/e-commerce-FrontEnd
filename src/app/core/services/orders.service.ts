import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Order, OrderQuote, ShippingMethod } from '../models/api.models';
import { environment } from '../models/environment';
import { inferProductCategory, ProductCategory } from '../models/product-category.model';
import { parseApiBoolean } from '../utils/boolean.util';
import { normalizeImageUrl } from '../utils/image-url.util';

export type DeliveryStatus = 'pending' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled';

export interface OrderTrackingInfo {
  orderId: string;
  deliveryStatus: DeliveryStatus | string;
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

@Injectable({ providedIn: 'root' })
export class OrdersService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  createOrder(payload: { addressId: string; shippingMethod: ShippingMethod }) {
    return this.http
      .post<unknown>(`${this.api}/orders`, payload)
      .pipe(map((response) => this.normalizeOrder(this.extractSingleOrder(response))));
  }

  getOrderQuote(payload: { addressId: string; shippingMethod: ShippingMethod }) {
    return this.http.post<unknown>(`${this.api}/orders/quote`, payload).pipe(map((response) => this.extractOrderQuote(response)));
  }

  getOrderById(orderId: string) {
    return this.http
      .get<unknown>(`${this.api}/orders/${orderId}`)
      .pipe(map((response) => this.normalizeOrder(this.extractSingleOrder(response))));
  }

  getMyOrders(page = 1, limit = 20) {
    return this.http
      .get<unknown>(`${this.api}/orders/me`, {
        params: { page, limit }
      })
      .pipe(map((response) => this.extractOrdersList(response).map((order) => this.normalizeOrder(order))));
  }

  getOrderTracking(orderId: string) {
    return this.http
      .get<unknown>(`${this.api}/orders/${orderId}/tracking`)
      .pipe(map((response) => this.extractOrderTracking(response)));
  }

  updateOrderTracking(orderId: string, payload: UpdateOrderTrackingPayload) {
    return this.http
      .post<unknown>(`${this.api}/orders/${orderId}/tracking`, payload)
      .pipe(map((response) => this.normalizeOrder(this.extractSingleOrder(response))));
  }

  private normalizeOrder(order: Order): Order {
    const items = Array.isArray(order.items) ? order.items : [];
    const normalizedStatus = String(order.status ?? 'pending_payment').toLowerCase().trim();

    return {
      ...order,
      status: (normalizedStatus || 'pending_payment') as Order['status'],
      totalAmount: Number(order.totalAmount ?? 0),
      createdAt: typeof order.createdAt === 'string' ? order.createdAt : new Date().toISOString(),
      items: items.map((item) => ({
        ...item,
        product: {
          ...item.product,
          mainPicture: normalizeImageUrl(item.product?.mainPicture),
          subPictures: Array.isArray(item.product?.subPictures)
            ? item.product.subPictures.map((url) => normalizeImageUrl(url))
            : []
        }
      }))
    };
  }

  private extractSingleOrder(response: unknown): Order {
    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      const data = this.toRecord(record['data']);
      const nested = this.toRecord(data?.['data']);
      return this.toOrder((nested ?? data ?? record) as Record<string, unknown>);
    }

    return { id: '', status: 'pending_payment', totalAmount: 0, items: [], createdAt: '' };
  }

  private extractOrdersList(response: unknown): Order[] {
    if (Array.isArray(response)) {
      return response as Order[];
    }

    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;

      if (Array.isArray(record['data'])) {
        return record['data'] as Order[];
      }

      if (record['data'] && typeof record['data'] === 'object') {
        const nested = record['data'] as Record<string, unknown>;
        if (Array.isArray(nested['items'])) {
          return (nested['items'] as unknown[]).map((item) => this.toOrder(this.toRecord(item) ?? {}));
        }
        if (Array.isArray(nested['orders'])) {
          return (nested['orders'] as unknown[]).map((item) => this.toOrder(this.toRecord(item) ?? {}));
        }
      }

      if (Array.isArray(record['items'])) {
        return (record['items'] as unknown[]).map((item) => this.toOrder(this.toRecord(item) ?? {}));
      }
    }

    return [];
  }

  private toOrder(record: Record<string, unknown>): Order {
    const rawItems = Array.isArray(record['items']) ? (record['items'] as unknown[]) : [];
    return {
      id: String(record['id'] ?? ''),
      status: String(record['status'] ?? 'pending_payment').toLowerCase().trim() as Order['status'],
      totalAmount: Number(record['totalAmount'] ?? record['total'] ?? record['amount'] ?? 0),
      createdAt: typeof record['createdAt'] === 'string' ? (record['createdAt'] as string) : new Date().toISOString(),
      items: rawItems.map((item) => this.toOrderItem(this.toRecord(item) ?? {}))
    };
  }

  private toOrderItem(record: Record<string, unknown>) {
    const product = this.toRecord(record['product']) ?? {};
    const category = this.normalizeCategory(product['category'], String(product['categoryId'] ?? ''), String(product['name'] ?? ''));

    return {
      id: String(record['id'] ?? ''),
      price: Number(record['price'] ?? 0),
      quantity: Number(record['quantity'] ?? 0),
      subtotal: Number(record['subtotal'] ?? record['total'] ?? 0),
      product: {
        id: String(product['id'] ?? ''),
        name: String(product['name'] ?? ''),
        slug: String(product['slug'] ?? ''),
        sku: String(product['sku'] ?? ''),
        price: Number(product['price'] ?? 0),
        stock: Number(product['stock'] ?? 0),
        isActive: parseApiBoolean(product['isActive'] ?? product['active'], true),
        description: typeof product['description'] === 'string' ? product['description'] : '',
        mainPicture: String(product['mainPicture'] ?? product['image'] ?? ''),
        subPictures: Array.isArray(product['subPictures']) ? (product['subPictures'] as string[]) : [],
        categoryId: String(product['categoryId'] ?? ''),
        category
      }
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private extractOrderQuote(response: unknown): OrderQuote {
    const record = this.toRecord(response) ?? {};
    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    const source = (nested ?? data ?? record) as Record<string, unknown>;

    const shippingMethodRaw = String(source['shippingMethod'] ?? 'standard').toLowerCase().trim();
    const shippingMethod: ShippingMethod = shippingMethodRaw === 'express' ? 'express' : 'standard';

    return {
      subtotalAmount: Number(source['subtotalAmount'] ?? 0),
      discountAmount: Number(source['discountAmount'] ?? 0),
      couponCode: typeof source['couponCode'] === 'string' ? source['couponCode'] : null,
      shippingMethod,
      shippingCost: Number(source['shippingCost'] ?? 0),
      shippingEtaDays: Number(source['shippingEtaDays'] ?? 0),
      totalAmount: Number(source['totalAmount'] ?? 0)
    };
  }

  private normalizeCategory(category: unknown, categoryId: string, name: string): ProductCategory {
    const rawCategory = this.extractCategoryText(category);
    const knownCategoryFromField = this.mapKnownCategory(rawCategory);
    if (knownCategoryFromField) {
      return knownCategoryFromField;
    }

    const value = String(categoryId ?? '')
      .toLowerCase()
      .trim();

    const knownCategory = this.mapKnownCategory(value);
    if (knownCategory) {
      return knownCategory;
    }

    return inferProductCategory(value, name);
  }

  private extractCategoryText(category: unknown): string {
    if (typeof category === 'string') {
      return category.toLowerCase().trim();
    }

    if (category && typeof category === 'object') {
      const record = category as Record<string, unknown>;
      const fromName = typeof record['name'] === 'string' ? record['name'] : '';
      const fromSlug = typeof record['slug'] === 'string' ? record['slug'] : '';
      return `${fromName} ${fromSlug}`.toLowerCase().trim();
    }

    return '';
  }

  private mapKnownCategory(value: string): ProductCategory | null {
    switch (value) {
      case 'phones':
      case 'phone':
      case 'smartphone':
      case 'smartphones':
      case 'mobile':
        return 'phones';
      case 'laptops':
      case 'laptop':
      case 'notebook':
        return 'laptops';
      case 'audio':
      case 'earbuds':
      case 'headphones':
      case 'speaker':
        return 'audio';
      case 'gaming':
        return 'gaming';
      case 'accessories':
      case 'accessory':
        return 'accessories';
      case 'other':
        return 'other';
      default:
        return null;
    }
  }

  private extractOrderTracking(response: unknown): OrderTrackingInfo {
    const record = this.toRecord(response) ?? {};
    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    const source = nested ?? data ?? record;

    const readText = (value: unknown): string | null => {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      return null;
    };

    return {
      orderId: String(source['orderId'] ?? ''),
      deliveryStatus: String(source['deliveryStatus'] ?? 'pending'),
      trackingNumber: readText(source['trackingNumber']),
      shippingCarrier: readText(source['shippingCarrier']),
      trackingUrl: readText(source['trackingUrl']),
      currentLocation: readText(source['currentLocation']),
      trackingNote: readText(source['trackingNote']),
      estimatedDeliveryAt: readText(source['estimatedDeliveryAt']),
      shippedAt: readText(source['shippedAt']),
      outForDeliveryAt: readText(source['outForDeliveryAt']),
      deliveredAt: readText(source['deliveredAt']),
      deliveryStatusUpdatedAt: readText(source['deliveryStatusUpdatedAt'])
    };
  }
}
