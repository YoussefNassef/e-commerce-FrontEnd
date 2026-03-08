import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import {
  ReturnRequestDto,
  ReturnStatus,
  UpdateReturnRequestStatusPayload,
} from '../../core/models/returns.models';
import { ReturnsService } from '../../core/services/returns.service';
import {
  getAllowedNextAdminStatuses,
  returnReasonLabel,
  returnStatusLabel,
  returnStatusTone,
} from '../../core/utils/returns.helpers';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';

@Component({
  selector: 'app-admin-returns-page',
  imports: [CurrencyPipe, DatePipe, ReactiveFormsModule, ButtonComponent, CardComponent],
  templateUrl: './admin-returns-page.component.html',
  styleUrl: './admin-returns-page.component.css',
})
export class AdminReturnsPageComponent {
  private readonly returnsService = inject(ReturnsService);
  private readonly fb = inject(FormBuilder);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly toast = signal('');
  protected readonly filterStatus = signal<ReturnStatus | ''>('');
  protected readonly requests = signal<ReturnRequestDto[]>([]);
  protected readonly selected = signal<ReturnRequestDto | null>(null);

  protected readonly statusOptions: readonly ReturnStatus[] = [
    'requested',
    'approved',
    'rejected',
    'refund_initiated',
    'refunded',
    'cancelled',
  ];

  protected readonly form = this.fb.group({
    status: ['', [Validators.required]],
    adminNote: [''],
    refundAmount: [''],
  });

  protected readonly allowedStatuses = computed(() => {
    const item = this.selected();
    if (!item) {
      return [] as Array<Exclude<ReturnStatus, 'requested'>>;
    }
    return getAllowedNextAdminStatuses(item.status);
  });

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.returnsService
      .getAllReturnRequests(this.filterStatus() || undefined)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.requests.set(items),
        error: (err) =>
          this.error.set(
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر تحميل طلبات الإرجاع.',
          ),
      });
  }

  protected onFilterChange(value: string): void {
    this.filterStatus.set((value || '') as ReturnStatus | '');
    this.selected.set(null);
    this.load();
  }

  protected openDetails(item: ReturnRequestDto): void {
    this.selected.set(item);
    const allowed = getAllowedNextAdminStatuses(item.status);
    this.form.patchValue({
      status: allowed[0] ?? '',
      adminNote: item.adminNote ?? '',
      refundAmount: item.refundAmount > 0 ? String(item.refundAmount) : '',
    });
  }

  protected closeDetails(): void {
    this.selected.set(null);
    this.form.reset();
  }

  protected saveStatus(): void {
    const current = this.selected();
    if (!current) {
      return;
    }

    if (this.form.invalid || !this.form.value.status) {
      this.form.markAllAsTouched();
      return;
    }

    const nextStatus = this.form.value.status as Exclude<ReturnStatus, 'requested'>;
    if (!this.allowedStatuses().includes(nextStatus)) {
      this.error.set('الانتقال المختار غير مسموح لحالة الطلب الحالية.');
      return;
    }

    const payload: UpdateReturnRequestStatusPayload = {
      status: nextStatus,
      adminNote: this.form.value.adminNote?.trim() || undefined,
    };

    const refundAmountRaw = (this.form.value.refundAmount ?? '').toString().trim();
    if (refundAmountRaw) {
      const parsed = Number(refundAmountRaw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        payload.refundAmount = parsed;
      }
    }

    this.saving.set(true);
    this.error.set('');

    this.returnsService
      .updateReturnRequestStatus(current.id, payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.toast.set('تم تحديث حالة طلب الإرجاع.');
          this.requests.update((items) =>
            items.map((item) => (item.id === updated.id ? updated : item)),
          );
          this.selected.set(updated);
          const allowed = getAllowedNextAdminStatuses(updated.status);
          this.form.patchValue({ status: allowed[0] ?? '' });
          setTimeout(() => this.toast.set(''), 2600);
        },
        error: (err) =>
          this.error.set(
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر تحديث حالة طلب الإرجاع.',
          ),
      });
  }

  protected statusLabel(status: string): string {
    return returnStatusLabel(status);
  }

  protected statusTone(status: string): string {
    return returnStatusTone(status);
  }

  protected reasonLabel(reason: string): string {
    return returnReasonLabel(reason);
  }
}
