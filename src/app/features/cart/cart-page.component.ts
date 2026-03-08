import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { finalize } from 'rxjs/operators';
import { Cart } from '../../core/models/api.models';
import { getCategoryLabel, ProductCategory } from '../../core/models/product-category.model';
import { CartService } from '../../core/services/cart.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-cart-page',
  imports: [CurrencyPipe, BadgeComponent, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './cart-page.component.html',
  styleUrl: './cart-page.component.css'
})
export class CartPageComponent {
  private readonly cartService = inject(CartService);

  protected readonly loading = signal(true);
  protected readonly cart = signal<Cart | null>(null);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly couponCode = signal('');
  protected readonly applyingCoupon = signal(false);
  protected readonly removingCoupon = signal(false);

  constructor() {
    this.loadCart();
  }

  protected loadCart(): void {
    this.loading.set(true);
    this.error.set('');

    this.cartService
      .getCart()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (cart) => this.cart.set(cart),
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحميل السلة.')
      });
  }

  protected updateQuantity(itemId: string, quantity: number): void {
    if (quantity < 1) {
      return;
    }

    this.cartService.updateQuantity(itemId, quantity).subscribe({
      next: () => this.loadCart(),
      error: (err) => this.error.set(err?.error?.message ?? 'تعذر تحديث الكمية.')
    });
  }

  protected remove(itemId: string): void {
    this.cartService.removeItem(itemId).subscribe({
      next: () => {
        this.notice.set('تم حذف العنصر.');
        this.loadCart();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'تعذر حذف العنصر.')
    });
  }

  protected clear(): void {
    this.cartService.clearCart().subscribe({
      next: () => {
        this.notice.set('تم تفريغ السلة.');
        this.loadCart();
      },
      error: (err) => this.error.set(err?.error?.message ?? 'تعذر تفريغ السلة.')
    });
  }

  protected applyCoupon(): void {
    const code = this.couponCode().trim();
    if (!code) {
      this.error.set('اكتب كود الكوبون أولًا.');
      return;
    }

    this.applyingCoupon.set(true);
    this.error.set('');
    this.notice.set('');

    this.cartService
      .applyCoupon(code)
      .pipe(finalize(() => this.applyingCoupon.set(false)))
      .subscribe({
        next: (res) => {
          if (res.cart) {
            this.cart.set(res.cart);
          } else {
            this.loadCart();
          }
          this.notice.set(res.message || 'تم تطبيق الكوبون بنجاح.');
        },
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر تطبيق الكوبون.')
      });
  }

  protected removeCoupon(): void {
    this.removingCoupon.set(true);
    this.error.set('');
    this.notice.set('');

    this.cartService
      .removeCoupon()
      .pipe(finalize(() => this.removingCoupon.set(false)))
      .subscribe({
        next: (res) => {
          if (res.cart) {
            this.cart.set(res.cart);
          } else {
            this.loadCart();
          }
          this.notice.set(res.message || 'تمت إزالة الكوبون.');
        },
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر إزالة الكوبون.')
      });
  }

  protected categoryLabel(category: ProductCategory): string {
    return getCategoryLabel(category);
  }
}
