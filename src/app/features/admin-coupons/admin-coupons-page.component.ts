import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Coupon, CouponsService } from '../../core/services/coupons.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-admin-coupons-page',
  imports: [DatePipe, ReactiveFormsModule, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './admin-coupons-page.component.html',
  styleUrl: './admin-coupons-page.component.css'
})
export class AdminCouponsPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly couponsService = inject(CouponsService);

  protected readonly loading = signal(true);
  protected readonly creating = signal(false);
  protected readonly updatingCouponId = signal<string | null>(null);
  protected readonly deletingCouponId = signal<string | null>(null);
  protected readonly coupons = signal<Coupon[]>([]);
  protected readonly notice = signal('');
  protected readonly error = signal('');

  protected readonly createForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(3)]],
    discountType: ['percentage' as 'percentage' | 'fixed', [Validators.required]],
    value: [10, [Validators.required, Validators.min(1)]],
    minOrderAmount: [0, [Validators.min(0)]],
    maxDiscount: [null as number | null],
    usageLimit: [null as number | null],
    startsAt: [''],
    endsAt: [''],
    isActive: [true]
  });

  constructor() {
    this.loadCoupons();
  }

  protected loadCoupons(): void {
    this.loading.set(true);
    this.error.set('');

    this.couponsService
      .getCoupons()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (coupons) => this.coupons.set(coupons),
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر تحميل الكوبونات.')
      });
  }

  protected createCoupon(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.creating.set(true);
    this.error.set('');
    this.notice.set('');
    const value = this.createForm.getRawValue();

    this.couponsService
      .createCoupon({
        code: value.code.trim().toUpperCase(),
        discountType: value.discountType,
        value: Number(value.value),
        minOrderAmount: Number(value.minOrderAmount || 0),
        maxDiscount: value.maxDiscount == null ? null : Number(value.maxDiscount),
        usageLimit: value.usageLimit == null ? null : Number(value.usageLimit),
        startsAt: value.startsAt ? new Date(value.startsAt).toISOString() : null,
        endsAt: value.endsAt ? new Date(value.endsAt).toISOString() : null,
        isActive: Boolean(value.isActive)
      })
      .pipe(finalize(() => this.creating.set(false)))
      .subscribe({
        next: (coupon) => {
          if (coupon) {
            this.coupons.update((items) => [coupon, ...items.filter((i) => i.id !== coupon.id)]);
          } else {
            this.loadCoupons();
          }
          this.notice.set('تم إنشاء الكوبون بنجاح.');
          this.createForm.reset({
            code: '',
            discountType: 'percentage',
            value: 10,
            minOrderAmount: 0,
            maxDiscount: null,
            usageLimit: null,
            startsAt: '',
            endsAt: '',
            isActive: true
          });
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر إنشاء الكوبون.')
      });
  }

  protected toggleActive(coupon: Coupon): void {
    this.updatingCouponId.set(coupon.id);
    this.error.set('');
    this.notice.set('');

    this.couponsService
      .updateCoupon(coupon.id, { isActive: !coupon.isActive })
      .pipe(finalize(() => this.updatingCouponId.set(null)))
      .subscribe({
        next: (updated) => {
          if (updated) {
            this.coupons.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          } else {
            this.coupons.update((items) =>
              items.map((item) => (item.id === coupon.id ? { ...item, isActive: !item.isActive } : item))
            );
          }
          this.notice.set('تم تحديث حالة الكوبون.');
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر تحديث الكوبون.')
      });
  }

  protected removeCoupon(coupon: Coupon): void {
    this.deletingCouponId.set(coupon.id);
    this.error.set('');
    this.notice.set('');

    this.couponsService
      .deleteCoupon(coupon.id)
      .pipe(finalize(() => this.deletingCouponId.set(null)))
      .subscribe({
        next: () => {
          this.coupons.update((items) => items.filter((item) => item.id !== coupon.id));
          this.notice.set('تم حذف الكوبون.');
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر حذف الكوبون.')
      });
  }

  private extractServerMessage(err: unknown): string {
    const response = (err as { error?: Record<string, unknown> } | null)?.error;
    if (!response || typeof response !== 'object') {
      return '';
    }
    const message = response['message'];
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
    if (Array.isArray(message)) {
      return message
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join(' | ');
    }
    return '';
  }
}

