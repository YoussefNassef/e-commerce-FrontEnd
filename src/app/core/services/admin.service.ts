import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';

export interface DashboardOverview {
  generatedAt: string;
  rangeDays: number;
  kpis: {
    totalUsers: number;
    totalProducts: number;
    activeProducts: number;
    lowStockProducts: number;
    totalOrders: number;
    pendingPaymentOrders: number;
    paidOrders: number;
    inProgressOrders: number;
    completedOrders: number;
    cancelledOrders: number;
    grossRevenuePaidFlow: number;
    completedRevenue: number;
    todayRevenue: number;
    averageOrderValue: number;
    paidOrdersInRange: number;
    ordersInRange: number;
  };
  orderStatusCounts: Array<{
    status: string;
    count: number;
  }>;
  deliveryStatusCounts: Array<{
    status: string;
    count: number;
  }>;
  paymentStatusCounts: Array<{
    status: string;
    count: number;
    amount: number;
  }>;
  inventorySummary: {
    totalProducts: number;
    outOfStockProducts: number;
    lowStockProducts: number;
    totalReservedUnits: number;
    totalAvailableUnits: number;
  };
  topProducts: Array<{
    productId: string;
    name: string;
    sku: string;
    quantitySold: number;
    revenue: number;
    stock: number;
    reservedStock: number;
  }>;
  salesLast7Days: Array<{
    date: string;
    totalOrders: number;
    paidFlowOrders: number;
    revenue: number;
  }>;
  recentOrders: Array<{
    id: string;
    status: string;
    deliveryStatus: string;
    totalAmount: number;
    userId: number;
    userName: string;
    createdAt: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getOverview() {
    return this.http.get<unknown>(`${this.api}/admin/dashboard/overview`).pipe(map((response) => this.normalizeOverview(response)));
  }

  private normalizeOverview(response: unknown): DashboardOverview {
    const record = this.toRecord(response) ?? {};
    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    const source = nested ?? data ?? record;

    const toNum = (value: unknown) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };

    const kpisRaw = this.toRecord(source['kpis']) ?? {};
    const orderStatusCounts = Array.isArray(source['orderStatusCounts']) ? source['orderStatusCounts'] : [];
    const deliveryStatusCounts = Array.isArray(source['deliveryStatusCounts']) ? source['deliveryStatusCounts'] : [];
    const paymentStatusCounts = Array.isArray(source['paymentStatusCounts']) ? source['paymentStatusCounts'] : [];
    const inventorySummaryRaw = this.toRecord(source['inventorySummary']) ?? {};
    const topProducts = Array.isArray(source['topProducts']) ? source['topProducts'] : [];
    const salesLast7Days = Array.isArray(source['salesLast7Days']) ? source['salesLast7Days'] : [];
    const recentOrders = Array.isArray(source['recentOrders']) ? source['recentOrders'] : [];

    return {
      generatedAt: String(source['generatedAt'] ?? ''),
      rangeDays: toNum(source['rangeDays']),
      kpis: {
        totalUsers: toNum(kpisRaw['totalUsers']),
        totalProducts: toNum(kpisRaw['totalProducts']),
        activeProducts: toNum(kpisRaw['activeProducts']),
        lowStockProducts: toNum(kpisRaw['lowStockProducts']),
        totalOrders: toNum(kpisRaw['totalOrders']),
        pendingPaymentOrders: toNum(kpisRaw['pendingPaymentOrders']),
        paidOrders: toNum(kpisRaw['paidOrders']),
        inProgressOrders: toNum(kpisRaw['inProgressOrders']),
        completedOrders: toNum(kpisRaw['completedOrders']),
        cancelledOrders: toNum(kpisRaw['cancelledOrders']),
        grossRevenuePaidFlow: toNum(kpisRaw['grossRevenuePaidFlow']),
        completedRevenue: toNum(kpisRaw['completedRevenue']),
        todayRevenue: toNum(kpisRaw['todayRevenue']),
        averageOrderValue: toNum(kpisRaw['averageOrderValue']),
        paidOrdersInRange: toNum(kpisRaw['paidOrdersInRange']),
        ordersInRange: toNum(kpisRaw['ordersInRange'])
      },
      orderStatusCounts: orderStatusCounts.map((item) => {
        const row = this.toRecord(item) ?? {};
        return {
          status: String(row['status'] ?? ''),
          count: toNum(row['count'])
        };
      }),
      deliveryStatusCounts: deliveryStatusCounts.map((item) => {
        const row = this.toRecord(item) ?? {};
        return {
          status: String(row['status'] ?? ''),
          count: toNum(row['count'])
        };
      }),
      paymentStatusCounts: paymentStatusCounts.map((item) => {
        const row = this.toRecord(item) ?? {};
        return {
          status: String(row['status'] ?? ''),
          count: toNum(row['count']),
          amount: toNum(row['amount'])
        };
      }),
      inventorySummary: {
        totalProducts: toNum(inventorySummaryRaw['totalProducts']),
        outOfStockProducts: toNum(inventorySummaryRaw['outOfStockProducts']),
        lowStockProducts: toNum(inventorySummaryRaw['lowStockProducts']),
        totalReservedUnits: toNum(inventorySummaryRaw['totalReservedUnits']),
        totalAvailableUnits: toNum(inventorySummaryRaw['totalAvailableUnits'])
      },
      topProducts: topProducts.map((item) => {
        const row = this.toRecord(item) ?? {};
        return {
          productId: String(row['productId'] ?? ''),
          name: String(row['name'] ?? ''),
          sku: String(row['sku'] ?? ''),
          quantitySold: toNum(row['quantitySold']),
          revenue: toNum(row['revenue']),
          stock: toNum(row['stock']),
          reservedStock: toNum(row['reservedStock'])
        };
      }),
      salesLast7Days: salesLast7Days.map((item) => {
        const row = this.toRecord(item) ?? {};
        return {
          date: String(row['date'] ?? ''),
          totalOrders: toNum(row['totalOrders']),
          paidFlowOrders: toNum(row['paidFlowOrders']),
          revenue: toNum(row['revenue'])
        };
      }),
      recentOrders: recentOrders.map((item) => {
        const row = this.toRecord(item) ?? {};
        return {
          id: String(row['id'] ?? ''),
          status: String(row['status'] ?? ''),
          deliveryStatus: String(row['deliveryStatus'] ?? ''),
          totalAmount: toNum(row['totalAmount']),
          userId: toNum(row['userId']),
          userName: String(row['userName'] ?? ''),
          createdAt: String(row['createdAt'] ?? '')
        };
      })
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}
