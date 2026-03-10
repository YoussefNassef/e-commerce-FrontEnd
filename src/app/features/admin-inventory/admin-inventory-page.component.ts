import { NgClass } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, switchMap } from 'rxjs/operators';
import {
  InventoryMovementReportResponse,
  InventoryReconciliationFixResponse,
  InventoryReconciliationResponse,
  LowStockAlertTriggerResponse
} from '../../core/models/inventory.models';
import { InventoryAdminService } from '../../core/services/inventory-admin.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';
import {
  anomalySeverity,
  anomalyTypeLabel,
  formatArabicDate,
  mapInventoryApiError
} from './admin-inventory.helpers';

@Component({
  selector: 'app-admin-inventory-page',
  imports: [NgClass, ReactiveFormsModule, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './admin-inventory-page.component.html',
  styleUrl: './admin-inventory-page.component.css'
})
export class AdminInventoryPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly inventoryAdminService = inject(InventoryAdminService);

  protected readonly loadingReport = signal(false);
  protected readonly runningChecker = signal(false);
  protected readonly runningDryRun = signal(false);
  protected readonly applyingFix = signal(false);
  protected readonly triggeringLowStock = signal(false);
  protected readonly confirmationOpen = signal(false);

  protected readonly report = signal<InventoryMovementReportResponse | null>(null);
  protected readonly reconciliation = signal<InventoryReconciliationResponse | null>(null);
  protected readonly fixResult = signal<InventoryReconciliationFixResponse | null>(null);
  protected readonly lowStockResult = signal<LowStockAlertTriggerResponse | null>(null);

  protected readonly notice = signal('');
  protected readonly error = signal('');

  protected readonly controlsForm = this.fb.nonNullable.group({
    days: [30, [Validators.required, Validators.min(1)]],
    notifyAdmins: [false],
    forceNotify: [false],
    forceLowStock: [false]
  });

  protected readonly hasAnomalies = computed(() => (this.reconciliation()?.anomaliesCount ?? 0) > 0);
  protected readonly hasSeries = computed(() => (this.report()?.series?.length ?? 0) > 0);
  protected readonly anyActionInFlight = computed(
    () =>
      this.loadingReport() ||
      this.runningChecker() ||
      this.runningDryRun() ||
      this.applyingFix() ||
      this.triggeringLowStock()
  );

  constructor() {
    this.loadReport();
  }

  protected loadReport(): void {
    if (this.loadingReport()) {
      return;
    }

    this.loadingReport.set(true);
    this.error.set('');
    const days = Number(this.controlsForm.controls.days.value) || 30;

    this.inventoryAdminService
      .getInventoryReport(days)
      .pipe(finalize(() => this.loadingReport.set(false)))
      .subscribe({
        next: (report) => this.report.set(report),
        error: (err) => this.error.set(mapInventoryApiError(err, 'تعذر تحميل تقرير حركة المخزون.'))
      });
  }

  protected runChecker(): void {
    if (this.runningChecker()) {
      return;
    }

    this.runningChecker.set(true);
    this.error.set('');
    this.notice.set('');
    const notify = !!this.controlsForm.controls.notifyAdmins.value;
    const forceNotify = !!this.controlsForm.controls.forceNotify.value;

    this.inventoryAdminService
      .runInventoryReconciliation(notify, forceNotify)
      .pipe(finalize(() => this.runningChecker.set(false)))
      .subscribe({
        next: (result) => {
          this.reconciliation.set(result);
          this.notice.set('تم تشغيل فحص التسوية بنجاح.');
        },
        error: (err) => this.error.set(mapInventoryApiError(err, 'تعذر تشغيل فحص التسوية.'))
      });
  }

  protected runDryRunFix(): void {
    if (this.runningDryRun()) {
      return;
    }

    this.runningDryRun.set(true);
    this.error.set('');
    this.notice.set('');
    const forceNotify = !!this.controlsForm.controls.forceNotify.value;

    this.inventoryAdminService
      .runInventoryReconciliationFix(true, forceNotify)
      .pipe(finalize(() => this.runningDryRun.set(false)))
      .subscribe({
        next: (result) => {
          this.fixResult.set(result);
          this.notice.set('تمت معاينة الإصلاح بنجاح.');
        },
        error: (err) => this.error.set(mapInventoryApiError(err, 'تعذر تشغيل المعاينة.'))
      });
  }

  protected openApplyConfirmation(): void {
    this.confirmationOpen.set(true);
  }

  protected closeApplyConfirmation(): void {
    if (this.applyingFix()) {
      return;
    }
    this.confirmationOpen.set(false);
  }

  protected confirmApplyFix(): void {
    if (this.applyingFix()) {
      return;
    }

    this.applyingFix.set(true);
    this.confirmationOpen.set(false);
    this.error.set('');
    this.notice.set('');
    const forceNotify = !!this.controlsForm.controls.forceNotify.value;

    this.inventoryAdminService
      .runInventoryReconciliationFix(false, forceNotify)
      .pipe(
        switchMap((result) => {
          this.fixResult.set(result);
          this.notice.set(`تم تطبيق الإصلاح. العناصر المصححة: ${result.fixedCount}.`);
          return this.inventoryAdminService.runInventoryReconciliation(false, forceNotify);
        }),
        finalize(() => this.applyingFix.set(false))
      )
      .subscribe({
        next: (checkerResult) => this.reconciliation.set(checkerResult),
        error: (err) => this.error.set(mapInventoryApiError(err, 'تعذر تطبيق الإصلاح.'))
      });
  }

  protected triggerLowStockAlerts(): void {
    if (this.triggeringLowStock()) {
      return;
    }

    this.triggeringLowStock.set(true);
    this.error.set('');
    this.notice.set('');
    const force = !!this.controlsForm.controls.forceLowStock.value;

    this.inventoryAdminService
      .triggerLowStockAlerts(force)
      .pipe(finalize(() => this.triggeringLowStock.set(false)))
      .subscribe({
        next: (result) => {
          this.lowStockResult.set(result);
          this.notice.set('تم تنفيذ تنبيه نقص المخزون بنجاح.');
        },
        error: (err) => this.error.set(mapInventoryApiError(err, 'تعذر إرسال تنبيه نقص المخزون.'))
      });
  }

  protected formatDate(iso: string, withTime = false): string {
    return formatArabicDate(iso, withTime);
  }

  protected anomalyTypeText(type: InventoryReconciliationResponse['anomalies'][number]['type']): string {
    return anomalyTypeLabel(type);
  }

  protected anomalySeverityClass(type: InventoryReconciliationResponse['anomalies'][number]['type']): string {
    return anomalySeverity(type) === 'critical' ? 'critical' : 'warning';
  }
}
