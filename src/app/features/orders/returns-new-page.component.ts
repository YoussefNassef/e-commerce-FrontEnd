import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Order } from '../../core/models/api.models';
import { ReturnReason } from '../../core/models/returns.models';
import { OrdersService } from '../../core/services/orders.service';
import { ReturnsService } from '../../core/services/returns.service';
import { returnReasonLabel } from '../../core/utils/returns.helpers';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';

@Component({
  selector: 'app-returns-new-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    ButtonComponent,
    CardComponent,
  ],
  templateUrl: './returns-new-page.component.html',
  styleUrl: './returns-new-page.component.css',
})
export class ReturnsNewPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly returnsService = inject(ReturnsService);
  private readonly ordersService = inject(OrdersService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly loadingOrders = signal(true);
  protected readonly ordersError = signal('');
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly recentOrders = signal<Order[]>([]);
  protected readonly reasons: readonly ReturnReason[] = [
    'damaged',
    'wrong_item',
    'not_as_described',
    'changed_mind',
    'other',
  ];

  protected readonly form = this.fb.nonNullable.group({
    orderId: [
      '',
      [
        Validators.required,
        Validators.pattern(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
      ],
    ],
    reason: ['damaged' as ReturnReason, [Validators.required]],
    reasonDetails: ['', [Validators.maxLength(500)]],
  });

  constructor() {
    this.loadRecentOrders();
  }

  protected loadRecentOrders(): void {
    this.loadingOrders.set(true);
    this.ordersError.set('');

    this.ordersService
      .getMyOrders(1, 20)
      .pipe(finalize(() => this.loadingOrders.set(false)))
      .subscribe({
        next: (orders) => {
          const eligibleOrders = orders.filter((order) => {
            const status = String(order.status ?? '').toLowerCase().trim();
            return status === 'completed';
          });

          const sorted = [...eligibleOrders].sort((a, b) => {
            const aTime = new Date(a.createdAt).getTime();
            const bTime = new Date(b.createdAt).getTime();
            return bTime - aTime;
          });
          this.recentOrders.set(sorted.slice(0, 8));
        },
        error: (err) => {
          this.ordersError.set(
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر تحميل الطلبات. يمكنك كتابة رقم الطلب يدويًا.',
          );
        },
      });
  }

  protected chooseOrder(order: Order): void {
    this.form.controls.orderId.setValue(order.id);
    this.form.controls.orderId.markAsTouched();
    this.error.set('');
  }

  protected reasonLabel(reason: ReturnReason): string {
    return returnReasonLabel(reason);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('يرجى إدخال بيانات الطلب بشكل صحيح.');
      return;
    }

    const value = this.form.getRawValue();
    this.submitting.set(true);
    this.error.set('');
    this.notice.set('');

    this.returnsService
      .createReturnRequest({
        orderId: value.orderId.trim(),
        reason: value.reason,
        reasonDetails: value.reasonDetails.trim() || undefined,
      })
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.notice.set('تم إرسال طلب الإرجاع بنجاح.');
          setTimeout(() => {
            void this.router.navigate(['/returns/my']);
          }, 450);
        },
        error: (err) => {
          this.error.set(
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر إرسال طلب الإرجاع. حاول مجددًا.',
          );
        },
      });
  }
}
