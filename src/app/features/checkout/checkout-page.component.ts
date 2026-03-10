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
import { mapCheckoutPaymentError } from './checkout-payment-errors';

@Component({
  selector: 'app-checkout-page',
  imports: [CurrencyPipe, RouterLink, ReactiveFormsModule, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './checkout-page.component.html',
  styleUrl: './checkout-page.component.css'
})
export class CheckoutPageComponent {
  private static readonly pendingOrderStorageKey = 'checkout_pending_order_id';

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
    name: [this.auth.userName() || 'John Doe', [Validators.required, Validators.minLength(2), Validators.pattern(/^[A-Za-z ]+$/)]],
    number: ['', [Validators.required, Validators.minLength(13), Validators.maxLength(19)]],
    month: [12, [Validators.required, Validators.min(1), Validators.max(12)]],
    year: [new Date().getFullYear(), [Validators.required, Validators.min(new Date().getFullYear())]],
    cvc: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(4)]]
  });

  constructor() {
    this.consumePaymentReturnParams();
    this.restorePendingOrder();
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
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';

          const normalizedMessage = serverMessage.toLowerCase();
          if (normalizedMessage.includes('cart is empty')) {
            // Empty cart is expected when resuming an already-created order.
            return;
          }

          this.error.set(serverMessage || 'تعذر تحميل بيانات الدفع.');
        }
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
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';

          const normalizedMessage = serverMessage.toLowerCase();
          this.quote.set(null);

          if (normalizedMessage.includes('cart is empty')) {
            // Expected while resuming payment for an already-created order.
            return;
          }

          this.error.set(serverMessage || 'تعذر حساب تقدير الطلب.');
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
              this.persistPendingOrder(order.id);
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
    if (this.paying()) {
      return;
    }

    if (!this.orderId()) {
      this.paymentError.set('أنشئ الطلب أولًا ثم ادفع.');
      return;
    }

    const value = this.paymentForm.getRawValue();
    const cardholderName = String(value.name ?? '').trim().replace(/\s+/g, ' ');
    const cardNumber = this.normalizeAsciiDigits(
      String(value.number ?? '').replace(/\s+/g, ''),
    );
    const monthRaw = this.normalizeAsciiDigits(String(value.month ?? ''));
    const yearRaw = this.normalizeAsciiDigits(String(value.year ?? ''));
    const cvc = this.normalizeAsciiDigits(String(value.cvc ?? '').trim());

    const validationMessage = this.validatePaymentInput(
      cardholderName,
      cardNumber,
      monthRaw,
      yearRaw,
      cvc,
    );
    if (validationMessage) {
      this.paymentForm.markAllAsTouched();
      this.paymentError.set(validationMessage);
      return;
    }

    this.paying.set(true);
    this.paymentError.set('');
    this.paymentStatus.set('');

    this.paymentsService
      .createPayment({
        orderId: this.orderId(),
        name: cardholderName,
        number: cardNumber,
        month: Number(monthRaw),
        year: Number(yearRaw),
        cvc,
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
          const mapped = mapCheckoutPaymentError(err);
          if (mapped.shouldResetAttemptKey && this.orderId()) {
            this.paymentsService.startNewAttempt(this.orderId());
          }
          this.paymentError.set(
            mapped.message || `فشلت عملية الدفع (status ${err?.status ?? 'unknown'}).`,
          );
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
        this.paymentsService.handleOrderStatusChange(id, order.status);
        this.syncPendingOrderStorageByStatus(order.status);
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
      this.persistPendingOrder(orderId);
      this.refreshOrderStatus();
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
          this.refreshOrderStatus();
        },
        error: () => {
          // Ignore sync errors to avoid blocking checkout after redirect.
        }
      });
    }
  }

  protected canCancelUnpaidOrder(): boolean {
    return ['pending_payment', 'payment_initiated'].includes(
      this.currentOrderStatus() || '',
    );
  }

  protected cancelUnpaidOrder(): void {
    const id = this.orderId();
    if (!id || !this.canCancelUnpaidOrder()) {
      return;
    }

    this.paying.set(true);
    this.paymentError.set('');
    this.paymentStatus.set('');

    this.ordersService
      .cancelOrder(id)
      .pipe(finalize(() => this.paying.set(false)))
      .subscribe({
        next: (order) => {
          this.currentOrderStatus.set(order.status);
          this.paymentStatus.set('تم إلغاء الطلب غير المدفوع.');
          this.paymentsService.clearPaymentAttemptKey(id);
          this.clearPendingOrderStorage();
          this.orderId.set('');
          this.loadCart();
        },
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';

          this.paymentError.set(
            serverMessage || `تعذر إلغاء الطلب (status ${err?.status ?? 'unknown'}).`,
          );
        },
      });
  }

  private restorePendingOrder(): void {
    if (this.orderId()) {
      return;
    }

    const savedOrderId = this.readPendingOrderStorage();
    if (!savedOrderId) {
      return;
    }

    this.ordersService.getOrderById(savedOrderId).subscribe({
      next: (order) => {
        if (['pending_payment', 'payment_initiated'].includes(order.status)) {
          this.orderId.set(order.id);
          this.currentOrderStatus.set(order.status);
          this.paymentStatus.set('تم استرجاع طلب غير مدفوع. يمكنك إكمال الدفع أو إلغاؤه.');
          return;
        }

        this.paymentsService.clearPaymentAttemptKey(savedOrderId);
        this.clearPendingOrderStorage();
      },
      error: () => {
        this.paymentsService.clearPaymentAttemptKey(savedOrderId);
        this.clearPendingOrderStorage();
      },
    });
  }

  private persistPendingOrder(orderId: string): void {
    sessionStorage.setItem(CheckoutPageComponent.pendingOrderStorageKey, orderId);
    localStorage.removeItem(CheckoutPageComponent.pendingOrderStorageKey);
  }

  private clearPendingOrderStorage(): void {
    sessionStorage.removeItem(CheckoutPageComponent.pendingOrderStorageKey);
    localStorage.removeItem(CheckoutPageComponent.pendingOrderStorageKey);
  }

  private syncPendingOrderStorageByStatus(status: string): void {
    if (['pending_payment', 'payment_initiated'].includes(status)) {
      if (this.orderId()) {
        this.persistPendingOrder(this.orderId());
      }
      return;
    }

    if (this.orderId()) {
      this.paymentsService.clearPaymentAttemptKey(this.orderId());
    }
    this.clearPendingOrderStorage();
  }

  protected startNewPaymentAttempt(): void {
    if (!this.orderId()) {
      return;
    }
    this.paymentsService.startNewAttempt(this.orderId());
    this.paymentStatus.set('تم إنشاء محاولة دفع جديدة. يمكنك إعادة المحاولة الآن.');
    this.paymentError.set('');
  }

  private normalizeAsciiDigits(value: string): string {
    return value
      .replace(/[٠-٩]/g, (char) => String(char.charCodeAt(0) - 1632))
      .replace(/[۰-۹]/g, (char) => String(char.charCodeAt(0) - 1776));
  }

  private validatePaymentInput(
    cardholderName: string,
    cardNumber: string,
    monthRaw: string,
    yearRaw: string,
    cvc: string,
  ): string | null {
    if (!cardholderName) {
      return 'اسم حامل البطاقة مطلوب.';
    }

    if (cardholderName.length < 2) {
      return 'اسم حامل البطاقة يجب أن يكون حرفين على الأقل.';
    }

    if (!/^[A-Za-z ]+$/.test(cardholderName)) {
      return 'اسم حامل البطاقة يجب أن يكون بالإنجليزية فقط (A-Z).';
    }

    if (!/^\d{13,19}$/.test(cardNumber)) {
      return 'رقم البطاقة يجب أن يحتوي على أرقام فقط وبطول من 13 إلى 19 رقم.';
    }

    if (!/^\d+$/.test(monthRaw)) {
      return 'شهر الانتهاء يجب أن يكون رقمًا من 1 إلى 12.';
    }

    const month = Number(monthRaw);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return 'شهر الانتهاء يجب أن يكون رقمًا من 1 إلى 12.';
    }

    if (!/^\d{4}$/.test(yearRaw)) {
      return 'سنة الانتهاء يجب أن تكون 4 أرقام.';
    }

    const year = Number(yearRaw);
    const currentYear = new Date().getFullYear();
    if (!Number.isInteger(year) || year < currentYear) {
      return `سنة الانتهاء يجب أن تكون ${currentYear} أو أحدث.`;
    }

    if (!/^\d{3,4}$/.test(cvc)) {
      return 'رمز CVC يجب أن يكون 3 أو 4 أرقام.';
    }

    return null;
  }

  private readPendingOrderStorage(): string {
    const sessionValue =
      sessionStorage.getItem(CheckoutPageComponent.pendingOrderStorageKey) ?? '';
    if (sessionValue) {
      return sessionValue;
    }

    const legacyValue =
      localStorage.getItem(CheckoutPageComponent.pendingOrderStorageKey) ?? '';
    if (legacyValue) {
      sessionStorage.setItem(
        CheckoutPageComponent.pendingOrderStorageKey,
        legacyValue,
      );
      localStorage.removeItem(CheckoutPageComponent.pendingOrderStorageKey);
    }

    return legacyValue;
  }

}
