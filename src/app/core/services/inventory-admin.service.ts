import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';
import {
  InventoryMovementReportResponse,
  InventoryReconciliationAnomaly,
  InventoryReconciliationAnomalyType,
  InventoryReconciliationFixItem,
  InventoryReconciliationFixResponse,
  InventoryReconciliationResponse,
  LowStockAlertTriggerResponse
} from '../models/inventory.models';

@Injectable({ providedIn: 'root' })
export class InventoryAdminService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getInventoryReport(days: number) {
    const safeDays = Math.max(1, Math.floor(days || 30));
    return this.http
      .get<unknown>(`${this.api}/products/inventory/report`, { params: { days: String(safeDays) } })
      .pipe(map((response) => this.normalizeInventoryReport(response, safeDays)));
  }

  runInventoryReconciliation(notify = false, forceNotify = false) {
    return this.http
      .get<unknown>(`${this.api}/products/inventory/reconciliation`, {
        params: {
          notify: String(!!notify),
          forceNotify: String(!!forceNotify)
        }
      })
      .pipe(map((response) => this.normalizeReconciliationResponse(response)));
  }

  runInventoryReconciliationFix(dryRun = true, forceNotify = false) {
    return this.http
      .post<unknown>(
        `${this.api}/products/inventory/reconciliation/fix`,
        {},
        {
          params: {
            dryRun: String(!!dryRun),
            forceNotify: String(!!forceNotify)
          }
        }
      )
      .pipe(map((response) => this.normalizeReconciliationFixResponse(response, dryRun)));
  }

  triggerLowStockAlerts(force = false) {
    return this.http
      .post<unknown>(`${this.api}/products/alerts/low-stock`, {}, { params: { force: String(!!force) } })
      .pipe(map((response) => this.normalizeLowStockResponse(response)));
  }

  private normalizeInventoryReport(response: unknown, fallbackDays: number): InventoryMovementReportResponse {
    const source = this.extractSource(response);
    const totals = this.toRecord(source['totals']) ?? {};
    const seriesSource = Array.isArray(source['series']) ? source['series'] : [];
    return {
      days: this.toNumber(source['days'], fallbackDays),
      startDate: this.toString(source['startDate']),
      endDate: this.toString(source['endDate']),
      totals: {
        inMovement: this.toNumber(totals['inMovement'], 0),
        outMovement: this.toNumber(totals['outMovement'], 0),
        netMovement: this.toNumber(totals['netMovement'], 0),
        adjustmentsCount: this.toNumber(totals['adjustmentsCount'], 0)
      },
      series: seriesSource
        .map((item) => this.normalizeSeriesItem(item))
        .filter((item): item is InventoryMovementReportResponse['series'][number] => !!item)
    };
  }

  private normalizeSeriesItem(input: unknown): InventoryMovementReportResponse['series'][number] | null {
    const row = this.toRecord(input);
    if (!row) {
      return null;
    }
    const date = this.toString(row['date']);
    if (!date) {
      return null;
    }
    return {
      date,
      inMovement: this.toNumber(row['inMovement'], 0),
      outMovement: this.toNumber(row['outMovement'], 0),
      netMovement: this.toNumber(row['netMovement'], 0),
      adjustmentsCount: this.toNumber(row['adjustmentsCount'], 0)
    };
  }

  private normalizeReconciliationResponse(response: unknown): InventoryReconciliationResponse {
    const source = this.extractSource(response);
    const anomaliesSource = Array.isArray(source['anomalies']) ? source['anomalies'] : [];
    return {
      checkedProducts: this.toNumber(source['checkedProducts'], 0),
      anomaliesCount: this.toNumber(source['anomaliesCount'], 0),
      generatedAt: this.toString(source['generatedAt']),
      anomalies: anomaliesSource
        .map((item) => this.normalizeAnomaly(item))
        .filter((item): item is InventoryReconciliationAnomaly => !!item),
      notificationsCreated: this.toNumber(source['notificationsCreated'], 0),
      notificationSkippedByCooldown: this.toBoolean(source['notificationSkippedByCooldown'], false)
    };
  }

  private normalizeAnomaly(input: unknown): InventoryReconciliationAnomaly | null {
    const row = this.toRecord(input);
    if (!row) {
      return null;
    }

    const productId = this.toString(row['productId']);
    if (!productId) {
      return null;
    }

    return {
      type: this.toAnomalyType(row['type']),
      productId,
      productName: this.toNullableString(row['productName']),
      sku: this.toNullableString(row['sku']),
      stock: this.toNumber(row['stock'], 0),
      reservedStock: this.toNumber(row['reservedStock'], 0),
      expectedReservedStock: this.toNullableNumber(row['expectedReservedStock']),
      difference: this.toNullableNumber(row['difference'])
    };
  }

  private normalizeReconciliationFixResponse(response: unknown, fallbackDryRun: boolean): InventoryReconciliationFixResponse {
    const source = this.extractSource(response);
    const fixedItemsSource = Array.isArray(source['fixedItems']) ? source['fixedItems'] : [];

    return {
      dryRun: this.toBoolean(source['dryRun'], fallbackDryRun),
      generatedAt: this.toString(source['generatedAt']),
      fixedCount: this.toNumber(source['fixedCount'], 0),
      candidatesCount: this.toNumber(source['candidatesCount'], 0),
      fixedItems: fixedItemsSource
        .map((item) => this.normalizeFixItem(item))
        .filter((item): item is InventoryReconciliationFixItem => !!item)
    };
  }

  private normalizeFixItem(input: unknown): InventoryReconciliationFixItem | null {
    const row = this.toRecord(input);
    if (!row) {
      return null;
    }

    const productId = this.toString(row['productId']);
    if (!productId) {
      return null;
    }

    return {
      productId,
      productName: this.toNullableString(row['productName']),
      sku: this.toNullableString(row['sku']),
      beforeReservedStock: this.toNumber(row['beforeReservedStock'], 0),
      expectedReservedStock: this.toNumber(row['expectedReservedStock'], 0),
      afterReservedStock: this.toNumber(row['afterReservedStock'], 0)
    };
  }

  private normalizeLowStockResponse(response: unknown): LowStockAlertTriggerResponse {
    const source = this.extractSource(response);
    return {
      threshold: this.toNumber(source['threshold'], 0),
      totalLowStockProducts: this.toNumber(source['totalLowStockProducts'], 0),
      notificationsCreated: this.toNumber(source['notificationsCreated'], 0),
      skippedByCooldown: this.toBoolean(source['skippedByCooldown'], false)
    };
  }

  private toAnomalyType(value: unknown): InventoryReconciliationAnomalyType {
    const type = this.toString(value).toLowerCase();
    switch (type) {
      case 'negative_stock':
      case 'negative_reserved_stock':
      case 'reserved_stock_mismatch':
        return type;
      default:
        return 'reserved_stock_mismatch';
    }
  }

  private extractSource(response: unknown): Record<string, unknown> {
    const record = this.toRecord(response) ?? {};
    const data = this.toRecord(record['data']);
    const nestedData = this.toRecord(data?.['data']);
    return nestedData ?? data ?? record;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private toString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private toNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private toNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private toNullableNumber(value: unknown): number | null {
    if (value == null) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return fallback;
  }
}
