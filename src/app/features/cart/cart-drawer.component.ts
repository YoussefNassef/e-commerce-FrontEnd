import { CurrencyPipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Cart } from '../../core/models/api.models';
import { getCategoryLabel, ProductCategory } from '../../core/models/product-category.model';
import { CartService } from '../../core/services/cart.service';
import { CheckoutAccessService } from '../../core/services/checkout-access.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-cart-drawer',
  imports: [CurrencyPipe, RouterLink, BadgeComponent, ButtonComponent, LoadingSpinnerComponent],
  templateUrl: './cart-drawer.component.html',
  styleUrl: './cart-drawer.component.css'
})
export class CartDrawerComponent implements OnChanges {
  private readonly cartService = inject(CartService);
  private readonly checkoutAccess = inject(CheckoutAccessService);
  private readonly router = inject(Router);

  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  protected readonly loading = signal(false);
  protected readonly cart = signal<Cart | null>(null);
  protected readonly notice = signal('');
  protected readonly error = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      this.loadCart();
    }
  }

  protected close(): void {
    this.closed.emit();
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

  protected checkout(): void {
    this.checkoutAccess.allowOnce();
    this.close();
    this.router.navigateByUrl('/checkout');
  }

  protected goToCart(): void {
    this.close();
    this.router.navigateByUrl('/cart');
  }

  protected categoryLabel(category: ProductCategory): string {
    return getCategoryLabel(category);
  }
}
