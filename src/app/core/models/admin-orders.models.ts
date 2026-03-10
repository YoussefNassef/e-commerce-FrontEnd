import { DeliveryStatus } from './tracking.models';

export type AdminOrderStatus =
  | 'pending_payment'
  | 'payment_initiated'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type AdminOrderActionType = 'update_order_status' | 'update_delivery_tracking' | 'cancel_order';

export interface AddOrderAdminNotePayload {
  note: string;
}

export interface AdminOrderActionPayload {
  action: AdminOrderActionType;
  orderStatus?: AdminOrderStatus;
  deliveryStatus?: DeliveryStatus;
  trackingNumber?: string;
  shippingCarrier?: string;
  trackingUrl?: string;
  currentLocation?: string;
  trackingNote?: string;
  estimatedDeliveryAt?: string;
  note?: string;
}

export interface AdminOrderAuditMetadata {
  action?: string;
  fromOrderStatus?: string;
  toOrderStatus?: string;
  fromDeliveryStatus?: string;
  toDeliveryStatus?: string;
  payload?: Record<string, unknown>;
}

export type AdminOrderAuditAction =
  | 'note_added'
  | 'order_status_updated'
  | 'delivery_tracking_updated'
  | 'order_cancelled'
  | 'bulk_action_executed';

export interface AdminOrderAuditItem {
  id: string;
  orderId: string;
  action: AdminOrderAuditAction;
  adminUserId: number;
  note: string | null;
  metadata: AdminOrderAuditMetadata;
  createdAt: string;
}

export interface AdminOrderAuditMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AdminOrderAuditResponse {
  items: AdminOrderAuditItem[];
  meta: AdminOrderAuditMeta;
}

export interface BulkAdminOrderActionPayload {
  orderIds: string[];
  action: AdminOrderActionPayload;
}

export interface BulkAdminOrderActionFailure {
  orderId: string;
  message: string;
}

export interface BulkAdminOrderActionResponse {
  total: number;
  successCount: number;
  failureCount: number;
  successes: string[];
  failures: BulkAdminOrderActionFailure[];
}
