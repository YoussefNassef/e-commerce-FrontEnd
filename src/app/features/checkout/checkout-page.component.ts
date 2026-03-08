import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Address, Cart, OrderQuote, ShippingMethod } from '../../core/models/api.models';
import { AddressesService } from '../../core/services/addresses.service';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { OrdersService } from '../../core/services/orders.service';
import { PaymentsService } from '../../core/services/payments.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-checkout-page',
  imports: [CurrencyPipe, RouterLink, ReactiveFormsModule, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './checkout-page.component.html',
  styleUrl: './checkout-page.component.css'
})
export class CheckoutPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly addressesService = inject(AddressesService);
  private readonly cartService = inject(CartService);
  private readonly ordersService = inject(OrdersService);
  private readonly paymentsService = inject(PaymentsService);

  protected readonly loading = signal(true);
  protected readonly loadingQuote = signal(false);
  protected readonly placing = signal(false);
  protected readonly paying = signal(false);
  protected readonly cart = signal<Cart | null>(null);
  protected readonly addresses = signal<Address[]>([]);
  protected readonly selectedAddressId = signal('');
  protected readonly shippingMethod = signal<ShippingMethod>('standard');
  protected readonly quote = signal<OrderQuote | null>(null);
  protected readonly orderId = signal('');
  protected readonly paymentStatus = signal('');
  protected readonly currentOrderStatus = signal('');
  protected readonly error = signal('');
  protected readonly paymentError = signal('');

  protected readonly paymentForm = this.fb.group({
    name: [this.auth.userName() || 'محمد أحمد', [Validators.required, Validators.minLength(2)]],
    number: ['', [Validators.required, Validators.minLength(13), Validators.maxLength(19)]],
    month: [12, [Validators.required, Validators.min(1), Validators.max(12)]],
    year: [new Date().getFullYear(), [Validators.required, Validators.min(new Date().getFullYear())]],
    cvc: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(4)]]
  });

  constructor() {
    this.consumePaymentReturnParams();
    this.loadCart();
    this.loadAddresses();
  }

  protected loadCart(): void {
    this.loading.set(true);
    this.error.set('');

    this.cartService
      .getCart()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (cart) => this.cart.set(cart),
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحميل بيانات الدفع.')
      });
  }

  protected loadAddresses(): void {
    this.addressesService.getAddresses().subscribe({
      next: (addresses) => {
        this.addresses.set(addresses);
        const defaultAddress = addresses.find((item) => item.isDefault) ?? addresses[0];
        if (defaultAddress && !this.selectedAddressId()) {
          this.selectedAddressId.set(defaultAddress.id);
        }
        if (this.selectedAddressId()) {
          this.refreshQuote();
        }
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'تعذر تحميل العناوين.');
      }
    });
  }

  protected selectAddress(addressId: string): void {
    if (this.selectedAddressId() === addressId) {
      return;
    }
    this.selectedAddressId.set(addressId);
    this.refreshQuote();
  }

  protected selectShippingMethod(method: string): void {
    const normalized: ShippingMethod = method === 'express' ? 'express' : 'standard';
    if (this.shippingMethod() === normalized) {
      return;
    }
    this.shippingMethod.set(normalized);
    this.refreshQuote();
  }

  protected refreshQuote(): void {
    const addressId = this.selectedAddressId();
    if (!addressId) {
      this.quote.set(null);
      return;
    }

    this.loadingQuote.set(true);
    this.error.set('');

    this.ordersService
      .getOrderQuote({
        addressId,
        shippingMethod: this.shippingMethod()
      })
      .pipe(finalize(() => this.loadingQuote.set(false)))
      .subscribe({
        next: (quote) => this.quote.set(quote),
        error: (err) => {
          this.quote.set(null);
          this.error.set(err?.error?.message ?? 'تعذر حساب تقدير الطلب.');
        }
      });
  }

  protected placeOrder(): void {
    if (!this.cart() || this.cart()!.items.length === 0) {
      this.error.set('السلة فارغة. أضف منتجات أولًا.');
      return;
    }
    if (!this.selectedAddressId()) {
      this.error.set('اختر عنوان الشحن أولًا.');
      return;
    }

    this.placing.set(true);
    this.error.set('');
    this.paymentStatus.set('');
    this.paymentError.set('');

    this.cartService.validateCart().subscribe({
      next: (result) => {
        if (!result.valid) {
          this.placing.set(false);
          const issuesText = result.issues.map((issue) => issue.message).filter(Boolean).join(' | ');
          this.error.set(issuesText || result.message || 'السلة غير صالحة لإتمام الطلب.');
          if (result.cart) {
            this.cart.set(result.cart);
          }
          return;
        }

        this.ordersService
          .createOrder({
            addressId: this.selectedAddressId(),
            shippingMethod: this.shippingMethod()
          })
          .pipe(finalize(() => this.placing.set(false)))
          .subscribe({
            next: (order) => {
              this.orderId.set(order.id);
              this.currentOrderStatus.set(order.status);
              this.paymentStatus.set(`تم إنشاء الطلب بحالة: ${order.status}`);
            },
            error: (err) => this.error.set(err?.error?.message ?? 'تعذر إنشاء الطلب.')
          });
      },
      error: (err) => {
        this.placing.set(false);
        this.error.set(err?.error?.message ?? 'تعذر التحقق من السلة قبل إنشاء الطلب.');
      }
    });
  }

  protected payOrder(): void {
    if (!this.orderId()) {
      this.paymentError.set('أنشئ الطلب أولًا ثم ادفع.');
      return;
    }

    if (this.paymentForm.invalid) {
      this.paymentForm.markAllAsTouched();
      this.paymentError.set('يرجى تعبئة جميع حقول الدفع بشكل صحيح.');
      return;
    }

    this.paying.set(true);
    this.paymentError.set('');
    this.paymentStatus.set('');

    const value = this.paymentForm.getRawValue();

    this.paymentsService
      .createPayment({
        orderId: this.orderId(),
        name: String(value.name ?? '').trim(),
        number: String(value.number ?? '').replace(/\s+/g, ''),
        month: Number(value.month),
        year: Number(value.year),
        cvc: String(value.cvc ?? '').trim()
      })
      .pipe(finalize(() => this.paying.set(false)))
      .subscribe({
        next: (res) => {
          if (res.redirectUrl) {
            this.paymentStatus.set('جاري التحويل لتأكيد الدفع...');
            window.location.href = res.redirectUrl;
            return;
          }

          this.paymentStatus.set(res.status ? `حالة الدفع: ${res.status}` : (res.message ?? 'تم إرسال طلب الدفع بنجاح.'));
        },
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';

          this.paymentError.set(serverMessage || `فشلت عملية الدفع (status ${err?.status ?? 'unknown'}).`);
        }
      });
  }

  protected refreshOrderStatus(): void {
    const id = this.orderId();
    if (!id) {
      return;
    }

    this.ordersService.getOrderById(id).subscribe({
      next: (order) => {
        this.currentOrderStatus.set(order.status);
        this.paymentStatus.set(`حالة الطلب: ${order.status}`);
      },
      error: (err) => {
        const serverMessage =
          typeof err?.error?.message === 'string'
            ? err.error.message
            : Array.isArray(err?.error?.message)
              ? err.error.message.join(', ')
              : '';
        this.paymentError.set(serverMessage || `تعذر تحديث حالة الطلب (status ${err?.status ?? 'unknown'}).`);
      }
    });
  }

  private consumePaymentReturnParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const orderId = params.get('orderId') ?? params.get('order_id') ?? '';
    const paymentStatus = params.get('status') ?? params.get('paymentStatus') ?? params.get('payment_status') ?? '';
    const paymentId = params.get('id') ?? params.get('paymentId') ?? params.get('payment_id') ?? '';

    if (orderId) {
      this.orderId.set(orderId);
    }

    if (paymentStatus) {
      this.paymentStatus.set(`حالة الدفع: ${paymentStatus}`);
    }

    if (paymentId) {
      this.paymentsService.syncPayment(paymentId).subscribe({
        next: (res) => {
          if (res.status) {
            this.paymentStatus.set(`حالة الدفع: ${res.status}`);
          }
        },
        error: () => {
          // Ignore sync errors to avoid blocking checkout after redirect.
        }
      });
    }
  }
}
