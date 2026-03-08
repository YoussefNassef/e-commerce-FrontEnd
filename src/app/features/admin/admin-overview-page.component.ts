import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AdminService, DashboardOverview } from '../../core/services/admin.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-admin-overview-page',
  imports: [CurrencyPipe, DatePipe, RouterLink, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './admin-overview-page.component.html',
  styleUrl: './admin-overview-page.component.css'
})
export class AdminOverviewPageComponent {
  private readonly adminService = inject(AdminService);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly overview = signal<DashboardOverview | null>(null);

  constructor() {
    this.loadOverview();
  }

  protected loadOverview(): void {
    this.loading.set(true);
    this.error.set('');

    this.adminService
      .getOverview()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (overview) => this.overview.set(overview),
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحميل إحصائيات الإدارة.')
      });
  }

  protected orderStatusLabel(status: string): string {
    switch (status) {
      case 'pending_payment':
        return 'بانتظار الدفع';
      case 'payment_initiated':
        return 'بدأ الدفع';
      case 'paid':
        return 'مدفوع';
      case 'in_progress':
        return 'قيد التنفيذ';
      case 'completed':
        return 'مكتمل';
      case 'cancelled':
        return 'ملغي';
      default:
        return status;
    }
  }

  protected deliveryStatusLabel(status: string): string {
    switch (status) {
      case 'pending':
        return 'معلق';
      case 'processing':
        return 'تجهيز';
      case 'shipped':
        return 'تم الشحن';
      case 'out_for_delivery':
        return 'خرج للتسليم';
      case 'delivered':
        return 'تم التسليم';
      case 'cancelled':
        return 'ملغي';
      default:
        return status;
    }
  }

  protected paymentStatusLabel(status: string): string {
    switch (status) {
      case 'initiated':
        return 'مبدئي';
      case 'paid':
        return 'مدفوع';
      case 'failed':
        return 'فشل';
      default:
        return status;
    }
  }

  protected statusWidth(count: number, total: number): string {
    if (!total || total <= 0) {
      return '0%';
    }
    const ratio = Math.max(6, Math.min(100, Math.round((count / total) * 100)));
    return `${ratio}%`;
  }

  protected completionRate(kpis: DashboardOverview['kpis']): number {
    if (!kpis.totalOrders) {
      return 0;
    }
    return Math.round((kpis.completedOrders / kpis.totalOrders) * 100);
  }

  protected activeOrderLoad(kpis: DashboardOverview['kpis']): number {
    if (!kpis.totalOrders) {
      return 0;
    }
    return Math.round(((kpis.inProgressOrders + kpis.pendingPaymentOrders) / kpis.totalOrders) * 100);
  }

  protected inventoryCoverage(kpis: DashboardOverview['kpis']): number {
    if (!kpis.totalProducts) {
      return 100;
    }
    return Math.max(0, 100 - Math.round((kpis.lowStockProducts / kpis.totalProducts) * 100));
  }

  protected revenueCaptureRate(kpis: DashboardOverview['kpis']): number {
    if (!kpis.grossRevenuePaidFlow) {
      return 0;
    }
    return Math.round((kpis.completedRevenue / kpis.grossRevenuePaidFlow) * 100);
  }

  protected averageOrderValue(kpis: DashboardOverview['kpis']): number {
    return kpis.averageOrderValue || 0;
  }

  protected deliverySuccessRate(rows: DashboardOverview['deliveryStatusCounts'], totalOrders: number): number {
    if (!totalOrders) {
      return 0;
    }
    const delivered = rows.find((row) => row.status === 'delivered')?.count ?? 0;
    return Math.round((delivered / totalOrders) * 100);
  }

  protected maxRevenue(rows: DashboardOverview['salesLast7Days']): number {
    return rows.reduce((max, row) => Math.max(max, row.revenue), 0);
  }

  protected salesColumnHeight(revenue: number, maxRevenue: number): string {
    if (!maxRevenue) {
      return '18%';
    }
    const ratio = Math.max(18, Math.min(100, Math.round((revenue / maxRevenue) * 100)));
    return `${ratio}%`;
  }

  protected inventoryHealth(summary: DashboardOverview['inventorySummary']): number {
    if (!summary.totalProducts) {
      return 100;
    }
    return Math.max(0, 100 - Math.round((summary.outOfStockProducts / summary.totalProducts) * 100));
  }

  protected inventoryUtilization(summary: DashboardOverview['inventorySummary']): number {
    const totalUnits = summary.totalAvailableUnits + summary.totalReservedUnits;
    if (!totalUnits) {
      return 0;
    }
    return Math.round((summary.totalReservedUnits / totalUnits) * 100);
  }

  protected paymentTotalCount(rows: DashboardOverview['paymentStatusCounts']): number {
    return rows.reduce((sum, row) => sum + row.count, 0);
  }
}
