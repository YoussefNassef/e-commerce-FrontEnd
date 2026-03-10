export type StockAdjustmentReason = 'restock' | 'damage' | 'return' | 'cycle_count' | 'manual';
export type InventoryReconciliationAnomalyType =
  | 'negative_stock'
  | 'negative_reserved_stock'
  | 'reserved_stock_mismatch';

export interface UpdateProductCommercialPayload {
  name?: string;
  price?: number;
}

export interface CreateStockAdjustmentPayload {
  delta: number;
  reason?: StockAdjustmentReason;
  reference?: string;
  note?: string;
}

export interface StockAdjustmentItem {
  id: string;
  productId: string;
  previousStock: number;
  delta: number;
  newStock: number;
  reason: StockAdjustmentReason;
  reference: string | null;
  note: string | null;
  createdByAdminUserId: number;
  createdAt: string;
}

export interface StockAdjustmentsMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface StockAdjustmentsListResponse {
  items: StockAdjustmentItem[];
  meta: StockAdjustmentsMeta;
}

export interface GetStockAdjustmentsQuery {
  page?: number;
  limit?: number;
  reason?: StockAdjustmentReason;
}

export interface InventoryMovementTotals {
  inMovement: number;
  outMovement: number;
  netMovement: number;
  adjustmentsCount: number;
}

export interface InventoryMovementSeriesItem {
  date: string;
  inMovement: number;
  outMovement: number;
  netMovement: number;
  adjustmentsCount: number;
}

export interface InventoryMovementReportResponse {
  days: number;
  startDate: string;
  endDate: string;
  totals: InventoryMovementTotals;
  series: InventoryMovementSeriesItem[];
}

export interface InventoryReconciliationAnomaly {
  type: InventoryReconciliationAnomalyType;
  productId: string;
  productName: string | null;
  sku: string | null;
  stock: number;
  reservedStock: number;
  expectedReservedStock: number | null;
  difference: number | null;
}

export interface InventoryReconciliationResponse {
  checkedProducts: number;
  anomaliesCount: number;
  generatedAt: string;
  anomalies: InventoryReconciliationAnomaly[];
  notificationsCreated: number;
  notificationSkippedByCooldown: boolean;
}

export interface InventoryReconciliationFixItem {
  productId: string;
  productName: string | null;
  sku: string | null;
  beforeReservedStock: number;
  expectedReservedStock: number;
  afterReservedStock: number;
}

export interface InventoryReconciliationFixResponse {
  dryRun: boolean;
  generatedAt: string;
  fixedCount: number;
  candidatesCount: number;
  fixedItems: InventoryReconciliationFixItem[];
}

export interface LowStockAlertTriggerResponse {
  threshold: number;
  totalLowStockProducts: number;
  notificationsCreated: number;
  skippedByCooldown: boolean;
}
