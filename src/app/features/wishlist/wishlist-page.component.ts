import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { getCategoryLabel, ProductCategory } from '../../core/models/product-category.model';
import { WishlistItem, WishlistService } from '../../core/services/wishlist.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-wishlist-page',
  imports: [CurrencyPipe, DatePipe, RouterLink, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './wishlist-page.component.html',
  styleUrl: './wishlist-page.component.css'
})
export class WishlistPageComponent {
  private readonly wishlistService = inject(WishlistService);

  protected readonly loading = signal(true);
  protected readonly removingProductId = signal<string | null>(null);
  protected readonly movingProductId = signal<string | null>(null);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly wishlist = signal<WishlistItem[]>([]);
  protected readonly totalItems = computed(() => this.wishlist().length);

  constructor() {
    this.loadWishlist();
  }

  protected loadWishlist(): void {
    this.loading.set(true);
    this.error.set('');

    this.wishlistService
      .getWishlist()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.wishlist.set(items),
        error: (err) => {
          const serverMessage = this.extractServerMessage(err);
          this.error.set(serverMessage || 'تعذر تحميل المفضلة.');
        }
      });
  }

  protected remove(productId: string): void {
    this.removingProductId.set(productId);
    this.error.set('');
    this.notice.set('');

    this.wishlistService
      .removeFromWishlist(productId)
      .pipe(finalize(() => this.removingProductId.set(null)))
      .subscribe({
        next: () => {
          this.wishlist.update((items) => items.filter((item) => item.product.id !== productId));
          this.notice.set('تمت إزالة المنتج من المفضلة.');
        },
        error: (err) => {
          const serverMessage = this.extractServerMessage(err);
          this.error.set(serverMessage || 'تعذر إزالة المنتج من المفضلة.');
        }
      });
  }

  protected moveToCart(productId: string): void {
    this.movingProductId.set(productId);
    this.error.set('');
    this.notice.set('');

    this.wishlistService
      .moveToCart(productId)
      .pipe(finalize(() => this.movingProductId.set(null)))
      .subscribe({
        next: () => {
          this.wishlist.update((items) => items.filter((item) => item.product.id !== productId));
          this.notice.set('تم نقل المنتج إلى السلة بنجاح.');
        },
        error: (err) => {
          const serverMessage = this.extractServerMessage(err);
          this.error.set(serverMessage || 'تعذر نقل المنتج إلى السلة.');
        }
      });
  }

  protected categoryLabel(category: ProductCategory): string {
    return getCategoryLabel(category);
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
      const values = message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      return values.join(' | ');
    }
    return '';
  }
}

