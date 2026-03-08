import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, switchMap } from 'rxjs/operators';
import { Product } from '../../core/models/api.models';
import { getCategoryLabel } from '../../core/models/product-category.model';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { ProductReview, ProductReviewsService } from '../../core/services/product-reviews.service';
import { ProductsService } from '../../core/services/products.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-product-details-page',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    BadgeComponent,
    ButtonComponent,
    CardComponent,
    LoadingSpinnerComponent,
    StatePanelComponent
  ],
  templateUrl: './product-details-page.component.html',
  styleUrl: './product-details-page.component.css'
})
export class ProductDetailsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly productsService = inject(ProductsService);
  private readonly cartService = inject(CartService);
  private readonly wishlistService = inject(WishlistService);
  private readonly reviewsService = inject(ProductReviewsService);

  protected readonly loading = signal(true);
  protected readonly adding = signal(false);
  protected readonly togglingWishlist = signal(false);
  protected readonly submittingReview = signal(false);
  protected readonly updatingReviewId = signal<string | null>(null);
  protected readonly editingReviewId = signal<string | null>(null);
  protected readonly product = signal<Product | null>(null);
  protected readonly selectedImage = signal('');
  protected readonly quantity = signal(1);
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly reviews = signal<ProductReview[]>([]);
  protected readonly inWishlist = signal(false);
  protected readonly canPurchaseCurrentProduct = computed(() => {
    const currentProduct = this.product();
    return !!currentProduct && Number(currentProduct.stock) > 0 && currentProduct.isActive;
  });
  protected readonly averageRating = computed(() => {
    const data = this.reviews();
    if (!data.length) {
      return 0;
    }
    const sum = data.reduce((acc, item) => acc + item.rating, 0);
    return Number((sum / data.length).toFixed(1));
  });

  protected readonly reviewForm = this.fb.nonNullable.group({
    rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
    comment: ['', [Validators.required, Validators.minLength(3)]]
  });
  protected readonly editReviewForm = this.fb.nonNullable.group({
    rating: [5, [Validators.required, Validators.min(1), Validators.max(5)]],
    comment: ['', [Validators.required, Validators.minLength(3)]]
  });

  constructor() {
    this.loadProduct();
  }

  protected loadProduct(): void {
    this.loading.set(true);
    this.error.set('');

    this.route.paramMap
      .pipe(
        switchMap((params) =>
          this.productsService.getProductById(params.get('id') ?? '').pipe(finalize(() => this.loading.set(false)))
        )
      )
      .subscribe({
        next: (product) => {
          if (!product) {
            this.product.set(null);
            this.error.set('المنتج غير موجود.');
            return;
          }

          const images = this.extractImages(product);
          this.product.set(product);
          this.quantity.set(1);
          this.selectedImage.set(images[0] ?? '');
          this.syncWishlistState(product.id);
          this.loadReviews(product.id);
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'تعذر تحميل تفاصيل المنتج.');
        }
      });
  }

  protected addToCart(): void {
    const currentProduct = this.product();
    if (!currentProduct) {
      return;
    }
    if (!this.auth.isAuthenticated()) {
      this.redirectToAuth();
      return;
    }
    if (!this.canPurchaseCurrentProduct()) {
      this.error.set(currentProduct.stock <= 0 ? 'هذا المنتج غير متوفر في المخزون.' : 'هذا المنتج غير نشط حاليًا.');
      return;
    }

    this.adding.set(true);
    this.notice.set('');
    this.error.set('');

    this.cartService
      .addToCart(currentProduct.id, this.quantity())
      .pipe(finalize(() => this.adding.set(false)))
      .subscribe({
        next: () => this.notice.set(`تمت إضافة ${currentProduct.name} إلى السلة.`),
        error: (err) => this.error.set(err?.error?.message ?? 'تعذر إضافة المنتج إلى السلة.')
      });
  }

  protected toggleWishlist(): void {
    const currentProduct = this.product();
    if (!currentProduct) {
      return;
    }
    if (!this.auth.isAuthenticated()) {
      this.redirectToAuth();
      return;
    }

    this.togglingWishlist.set(true);
    this.error.set('');
    this.notice.set('');

    const request$ = this.inWishlist()
      ? this.wishlistService.removeFromWishlist(currentProduct.id)
      : this.wishlistService.addToWishlist(currentProduct.id);

    request$
      .pipe(finalize(() => this.togglingWishlist.set(false)))
      .subscribe({
        next: () => {
          const wasInWishlist = this.inWishlist();
          this.inWishlist.set(!wasInWishlist);
          this.notice.set(wasInWishlist ? 'تمت إزالة المنتج من المفضلة.' : 'تمت إضافة المنتج إلى المفضلة.');
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'تعذر تحديث المفضلة.');
        }
      });
  }

  protected submitReview(): void {
    const currentProduct = this.product();
    if (!currentProduct) {
      return;
    }
    if (!this.auth.isAuthenticated()) {
      this.redirectToAuth();
      return;
    }

    if (this.reviewForm.invalid) {
      this.reviewForm.markAllAsTouched();
      return;
    }

    this.submittingReview.set(true);
    const value = this.reviewForm.getRawValue();
    this.reviewsService
      .addReview({
        productId: currentProduct.id,
        rating: Number(value.rating),
        comment: String(value.comment).trim()
      })
      .pipe(finalize(() => this.submittingReview.set(false)))
      .subscribe({
        next: () => {
          this.loadReviews(currentProduct.id);
          this.reviewForm.reset({ rating: 5, comment: '' });
          this.notice.set('تم إرسال تقييمك بنجاح.');
          this.error.set('');
        },
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';
          this.error.set(serverMessage || 'تعذر إرسال التقييم.');
        }
      });
  }

  protected increaseQty(): void {
    const maxStock = Math.max(1, Number(this.product()?.stock ?? 1));
    this.quantity.update((value) => Math.min(value + 1, maxStock));
  }

  protected decreaseQty(): void {
    this.quantity.update((value) => Math.max(value - 1, 1));
  }

  protected selectImage(url: string): void {
    this.selectedImage.set(url);
  }

  protected canEditReview(review: ProductReview): boolean {
    const currentUserId = this.auth.user()?.id;
    return typeof currentUserId === 'number' && currentUserId > 0 && review.userId === currentUserId;
  }

  protected startEditReview(review: ProductReview): void {
    if (!this.canEditReview(review)) {
      return;
    }

    this.editingReviewId.set(review.id);
    this.editReviewForm.setValue({
      rating: review.rating,
      comment: review.comment
    });
  }

  protected cancelEditReview(): void {
    this.editingReviewId.set(null);
    this.editReviewForm.reset({ rating: 5, comment: '' });
  }

  protected saveReviewEdit(review: ProductReview): void {
    if (!this.canEditReview(review)) {
      this.error.set('يمكنك تعديل تقييماتك فقط.');
      return;
    }

    if (this.editReviewForm.invalid) {
      this.editReviewForm.markAllAsTouched();
      return;
    }

    this.updatingReviewId.set(review.id);
    const value = this.editReviewForm.getRawValue();
    this.reviewsService
      .updateReview(review.id, {
        rating: Number(value.rating),
        comment: String(value.comment).trim()
      })
      .pipe(finalize(() => this.updatingReviewId.set(null)))
      .subscribe({
        next: () => {
          const productId = this.product()?.id;
          if (productId) {
            this.loadReviews(productId);
          }
          this.notice.set('تم تحديث التقييم بنجاح.');
          this.error.set('');
          this.cancelEditReview();
        },
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';
          this.error.set(serverMessage || 'تعذر تحديث التقييم.');
        }
      });
  }

  protected categoryLabel(): string {
    const category = this.product()?.category;
    return category ? getCategoryLabel(category) : 'أخرى';
  }

  protected productImages(): string[] {
    const data = this.product();
    return data ? this.extractImages(data) : [];
  }

  private extractImages(product: Product): string[] {
    const images = [product.mainPicture, ...(product.subPictures ?? [])].filter((url) => !!url);
    return [...new Set(images)];
  }

  private loadReviews(productId: string): void {
    this.reviewsService.getReviews(productId).subscribe({
      next: (reviews) => this.reviews.set(reviews),
      error: () => this.reviews.set([])
    });
  }

  private syncWishlistState(productId: string): void {
    if (!this.auth.isAuthenticated()) {
      this.inWishlist.set(false);
      return;
    }

    this.wishlistService.getWishlist().subscribe({
      next: (items) => {
        this.inWishlist.set(items.some((item) => item.product.id === productId));
      },
      error: () => {
        this.inWishlist.set(false);
      }
    });
  }

  private redirectToAuth(): void {
    this.router.navigate(['/auth'], {
      queryParams: {
        redirect: this.router.url
      }
    });
  }
}
