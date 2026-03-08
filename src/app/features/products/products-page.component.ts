import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, finalize, map } from 'rxjs/operators';
import { Product } from '../../core/models/api.models';
import { getCategoryLabel, ProductCategory } from '../../core/models/product-category.model';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { ApiCategory, CategoriesService } from '../../core/services/categories.service';
import {
  GetProductsParams,
  ProductSortBy,
  ProductSortOrder,
  ProductsListResponse,
  ProductsMeta,
  ProductsService,
} from '../../core/services/products.service';
import { WishlistService } from '../../core/services/wishlist.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';
import { ProductsFiltersComponent } from './components/products-filters.component';
import { ProductsSortComponent, ProductsSortOption } from './components/products-sort.component';

interface ProductsQueryState {
  page: number;
  limit: number;
  search: string;
  categoryId: string;
  categorySlug: string;
  minPrice: number | null;
  maxPrice: number | null;
  isActive: boolean | undefined;
  sortBy: ProductSortBy;
  sortOrder: ProductSortOrder;
  inStockOnly: boolean;
}

const DEFAULT_LIMIT = 12;
const DEFAULT_SORT_BY: ProductSortBy = 'name';
const DEFAULT_SORT_ORDER: ProductSortOrder = 'asc';

@Component({
  selector: 'app-products-page',
  imports: [
    CurrencyPipe,
    RouterLink,
    BadgeComponent,
    ButtonComponent,
    LoadingSpinnerComponent,
    StatePanelComponent,
    ProductsFiltersComponent,
    ProductsSortComponent,
  ],
  templateUrl: './products-page.component.html',
  styleUrl: './products-page.component.css',
})
export class ProductsPageComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productsService = inject(ProductsService);
  private readonly categoriesService = inject(CategoriesService);
  private readonly auth = inject(AuthService);
  private readonly cartService = inject(CartService);
  private readonly wishlistService = inject(WishlistService);

  private readonly searchInput$ = new Subject<string>();
  private readonly responseCache = new Map<string, ProductsListResponse>();
  private activeAbortController: AbortController | null = null;
  private activeRequestSub: Subscription | null = null;

  protected readonly loading = signal(true);
  protected readonly loadingCategories = signal(true);
  protected readonly busyProductId = signal<string | null>(null);
  protected readonly busyWishlistProductId = signal<string | null>(null);
  protected readonly categories = signal<ApiCategory[]>([]);
  protected readonly searchDraft = signal('');
  protected readonly notice = signal('');
  protected readonly error = signal('');
  protected readonly validationError = signal('');
  protected readonly wishlistIds = signal<Set<string>>(new Set());
  protected readonly queryState = signal<ProductsQueryState>({
    page: 1,
    limit: DEFAULT_LIMIT,
    search: '',
    categoryId: '',
    categorySlug: '',
    minPrice: null,
    maxPrice: null,
    isActive: undefined,
    sortBy: DEFAULT_SORT_BY,
    sortOrder: DEFAULT_SORT_ORDER,
    inStockOnly: false,
  });
  protected readonly apiResponse = signal<ProductsListResponse>(
    this.createEmptyResponse(1, DEFAULT_LIMIT),
  );

  protected readonly products = computed(() => {
    const items = this.apiResponse().data.items;
    if (!this.queryState().inStockOnly) {
      return items;
    }
    return items.filter((item) => Number(item.stock) > 0);
  });

  protected readonly meta = computed<ProductsMeta>(() => this.apiResponse().data.meta);
  protected readonly isAdmin = computed(() => this.auth.user()?.role === 'admin');
  protected readonly selectedCategoryToken = computed(() => {
    const state = this.queryState();
    if (state.categorySlug) {
      return `slug:${state.categorySlug}`;
    }
    if (state.categoryId) {
      return `id:${state.categoryId}`;
    }
    return '';
  });

  protected readonly isActiveToken = computed<'all' | 'true' | 'false'>(() => {
    const value = this.queryState().isActive;
    if (value === true) {
      return 'true';
    }
    if (value === false) {
      return 'false';
    }
    return 'all';
  });

  protected readonly sortOption = computed<ProductsSortOption>(() => {
    const state = this.queryState();
    return `${state.sortBy}-${state.sortOrder}` as ProductsSortOption;
  });

  protected readonly hasAnyFilters = computed(() => {
    const state = this.queryState();
    return Boolean(
      state.search ||
      state.categoryId ||
      state.categorySlug ||
      state.minPrice != null ||
      state.maxPrice != null ||
      state.isActive !== undefined ||
      state.inStockOnly ||
      state.sortBy !== DEFAULT_SORT_BY ||
      state.sortOrder !== DEFAULT_SORT_ORDER,
    );
  });

  protected readonly pageNumbers = computed<number[]>(() => {
    const current = this.queryState().page;
    const total = Math.max(1, this.meta().totalPages);
    let start = Math.max(1, current - 2);
    let end = Math.min(total, start + 4);

    if (end - start < 4) {
      start = Math.max(1, end - 4);
    }

    const numbers: number[] = [];
    for (let page = start; page <= end; page += 1) {
      numbers.push(page);
    }
    return numbers;
  });

  constructor() {
    this.setupSearchDebounce();
    this.observeQueryParams();
    this.loadCategories();
    this.loadWishlistSnapshot();
  }

  protected onSearchInput(value: string): void {
    this.searchDraft.set(value);
    this.searchInput$.next(value);
  }

  protected onCategoryChanged(value: string): void {
    const next: Partial<ProductsQueryState> = {
      categoryId: '',
      categorySlug: '',
    };

    if (value.startsWith('slug:')) {
      next.categorySlug = value.slice(5).trim();
    } else if (value.startsWith('id:')) {
      next.categoryId = value.slice(3).trim();
    }

    this.navigateWithPatch(next, true);
  }

  protected onMinPriceChanged(rawValue: string): void {
    const minPrice = this.parseOptionalPrice(rawValue);
    const currentMax = this.queryState().maxPrice;
    const maxPrice =
      minPrice != null && currentMax != null && minPrice > currentMax ? minPrice : currentMax;
    this.navigateWithPatch({ minPrice, maxPrice }, true);
  }

  protected onMaxPriceChanged(rawValue: string): void {
    const maxPrice = this.parseOptionalPrice(rawValue);
    const currentMin = this.queryState().minPrice;
    const minPrice =
      maxPrice != null && currentMin != null && maxPrice < currentMin ? maxPrice : currentMin;
    this.navigateWithPatch({ minPrice, maxPrice }, true);
  }

  protected onIsActiveChanged(value: 'all' | 'true' | 'false'): void {
    const nextIsActive = value === 'all' ? undefined : value === 'true';
    this.navigateWithPatch({ isActive: nextIsActive }, true);
  }

  protected onInStockChanged(value: boolean): void {
    this.navigateWithPatch({ inStockOnly: value }, true);
  }

  protected onSortChanged(value: ProductsSortOption): void {
    const [sortByRaw, sortOrderRaw] = value.split('-');
    const sortBy: ProductSortBy =
      sortByRaw === 'price' || sortByRaw === 'stock' ? sortByRaw : 'name';
    const sortOrder: ProductSortOrder = sortOrderRaw === 'desc' ? 'desc' : 'asc';
    this.navigateWithPatch({ sortBy, sortOrder }, true);
  }

  protected resetFilters(): void {
    this.searchDraft.set('');
    this.navigateWithPatch(
      {
        search: '',
        categoryId: '',
        categorySlug: '',
        minPrice: null,
        maxPrice: null,
        isActive: undefined,
        inStockOnly: false,
        sortBy: DEFAULT_SORT_BY,
        sortOrder: DEFAULT_SORT_ORDER,
      },
      true,
    );
  }

  protected goToPage(page: number): void {
    const totalPages = Math.max(1, this.meta().totalPages);
    if (page < 1 || page > totalPages || page === this.queryState().page) {
      return;
    }
    this.navigateWithPatch({ page }, false);
  }

  protected retry(): void {
    this.loadProducts(true);
  }

  protected addToCart(product: Product): void {
    if (!this.auth.isAuthenticated()) {
      this.redirectToAuth();
      return;
    }

    if (Number(product.stock) <= 0 || !product.isActive) {
      this.error.set(
        product.stock <= 0 ? 'هذا المنتج غير متوفر في المخزون.' : 'هذا المنتج غير نشط حاليًا.',
      );
      return;
    }

    this.busyProductId.set(product.id);
    this.notice.set('');
    this.error.set('');

    this.cartService
      .addToCart(product.id, 1)
      .pipe(finalize(() => this.busyProductId.set(null)))
      .subscribe({
        next: () => this.notice.set(`تمت إضافة ${product.name} إلى السلة.`),
        error: (err) => {
          const serverMessage = this.extractServerMessage(err);
          this.error.set(
            serverMessage || `تعذر إضافة المنتج (status ${err?.status ?? 'unknown'}).`,
          );
        },
      });
  }

  protected toggleWishlist(product: Product): void {
    if (!this.auth.isAuthenticated()) {
      this.redirectToAuth();
      return;
    }

    this.busyWishlistProductId.set(product.id);
    this.error.set('');
    this.notice.set('');

    const inWishlist = this.isInWishlist(product.id);
    const request$ = inWishlist
      ? this.wishlistService.removeFromWishlist(product.id)
      : this.wishlistService.addToWishlist(product.id);

    request$.pipe(finalize(() => this.busyWishlistProductId.set(null))).subscribe({
      next: () => {
        this.wishlistIds.update((current) => {
          const next = new Set(current);
          if (inWishlist) {
            next.delete(product.id);
          } else {
            next.add(product.id);
          }
          return next;
        });
        this.notice.set(
          inWishlist
            ? `تمت إزالة ${product.name} من المفضلة.`
            : `تمت إضافة ${product.name} إلى المفضلة.`,
        );
      },
      error: (err) => {
        const serverMessage = this.extractServerMessage(err);
        this.error.set(serverMessage || `تعذر تحديث المفضلة (status ${err?.status ?? 'unknown'}).`);
      },
    });
  }

  protected isInWishlist(productId: string): boolean {
    return this.wishlistIds().has(productId);
  }

  protected categoryLabel(category: ProductCategory): string {
    return getCategoryLabel(category);
  }

  protected categoryTone(
    category: ProductCategory,
  ): 'blue' | 'emerald' | 'amber' | 'violet' | 'slate' {
    switch (category) {
      case 'phones':
        return 'blue';
      case 'laptops':
        return 'violet';
      case 'audio':
        return 'emerald';
      case 'gaming':
        return 'amber';
      default:
        return 'slate';
    }
  }

  private observeQueryParams(): void {
    this.route.queryParamMap
      .pipe(
        map((query) => this.parseStateFromQuery(query)),
        distinctUntilChanged((a, b) => this.toStateKey(a) === this.toStateKey(b)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => {
        this.queryState.set(state);
        this.searchDraft.set(state.search);
        this.loadProducts();
      });
  }

  private setupSearchDebounce(): void {
    this.searchInput$
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((search) => this.navigateWithPatch({ search }, true));
  }

  private loadProducts(forceReload = false): void {
    const state = this.queryState();

    if (state.minPrice != null && state.maxPrice != null && state.minPrice > state.maxPrice) {
      this.validationError.set('قيمة أقل سعر لا يمكن أن تكون أكبر من أعلى سعر.');
      this.loading.set(false);
      return;
    }

    this.validationError.set('');

    const params: GetProductsParams = {
      page: state.page,
      limit: state.limit,
      search: state.search || undefined,
      categoryId: state.categoryId || undefined,
      categorySlug: state.categorySlug || undefined,
      minPrice: state.minPrice ?? undefined,
      maxPrice: state.maxPrice ?? undefined,
      isActive: typeof state.isActive === 'boolean' ? state.isActive : undefined,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
    };

    const cacheKey = this.toApiQueryKey(params);
    if (!forceReload && this.responseCache.has(cacheKey)) {
      this.apiResponse.set(this.responseCache.get(cacheKey)!);
      this.loading.set(false);
      this.error.set('');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.abortInFlightRequest();

    const controller = new AbortController();
    this.activeAbortController = controller;
    this.activeRequestSub = this.productsService
      .getProducts(params, controller.signal)
      .pipe(
        finalize(() => {
          if (this.activeAbortController === controller) {
            this.loading.set(false);
          }
        }),
      )
      .subscribe({
        next: (response) => {
          this.responseCache.set(cacheKey, response);
          this.apiResponse.set(response);
        },
        error: (err) => {
          if (controller.signal.aborted) {
            return;
          }
          const serverMessage = this.extractServerMessage(err);
          this.error.set(
            serverMessage || `تعذر تحميل المنتجات (status ${err?.status ?? 'unknown'}).`,
          );
          this.apiResponse.set(this.createEmptyResponse(state.page, state.limit));
        },
      });
  }

  private loadCategories(): void {
    this.loadingCategories.set(true);
    this.categoriesService
      .getCategories()
      .pipe(finalize(() => this.loadingCategories.set(false)))
      .subscribe({
        next: (categories) => this.categories.set(categories),
        error: () => this.categories.set([]),
      });
  }

  private loadWishlistSnapshot(): void {
    if (!this.auth.isAuthenticated()) {
      this.wishlistIds.set(new Set());
      return;
    }

    this.wishlistService
      .getWishlist()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          this.wishlistIds.set(new Set(items.map((item) => item.product.id)));
        },
        error: () => {
          this.wishlistIds.set(new Set());
        },
      });
  }

  private navigateWithPatch(patch: Partial<ProductsQueryState>, resetPage: boolean): void {
    const current = this.queryState();
    const next: ProductsQueryState = {
      ...current,
      ...patch,
      page: resetPage ? 1 : (patch.page ?? current.page),
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: next.page !== 1 ? next.page : null,
        limit: next.limit !== DEFAULT_LIMIT ? next.limit : null,
        search: next.search || null,
        categoryId: next.categoryId || null,
        categorySlug: next.categorySlug || null,
        minPrice: next.minPrice != null ? next.minPrice : null,
        maxPrice: next.maxPrice != null ? next.maxPrice : null,
        isActive: typeof next.isActive === 'boolean' ? String(next.isActive) : null,
        sortBy: next.sortBy !== DEFAULT_SORT_BY ? next.sortBy : null,
        sortOrder: next.sortOrder !== DEFAULT_SORT_ORDER ? next.sortOrder : null,
        inStock: next.inStockOnly ? '1' : null,
      },
      replaceUrl: true,
    });
  }

  private parseStateFromQuery(query: import('@angular/router').ParamMap): ProductsQueryState {
    const page = this.parsePositiveInt(query.get('page'), 1);
    const limit = this.parsePositiveInt(query.get('limit'), DEFAULT_LIMIT);
    const search = (query.get('search') ?? '').trim();
    const categoryId = (query.get('categoryId') ?? '').trim();
    const categorySlug = (query.get('categorySlug') ?? '').trim();
    const minPrice = this.parseOptionalPrice(query.get('minPrice'));
    const maxPrice = this.parseOptionalPrice(query.get('maxPrice'));
    const isActive = this.parseOptionalBoolean(query.get('isActive'));
    const sortBy = this.parseSortBy(query.get('sortBy'));
    const sortOrder = this.parseSortOrder(query.get('sortOrder'));
    const inStockRaw = (query.get('inStock') ?? '').toLowerCase().trim();
    const inStockOnly = inStockRaw === '1' || inStockRaw === 'true';

    return {
      page,
      limit,
      search,
      categoryId,
      categorySlug,
      minPrice,
      maxPrice,
      isActive,
      sortBy,
      sortOrder,
      inStockOnly,
    };
  }

  private parsePositiveInt(value: string | null, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) {
      return fallback;
    }
    return Math.floor(num);
  }

  private parseOptionalPrice(value: string | null): number | null {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  private parseOptionalBoolean(value: string | null): boolean | undefined {
    const normalized = String(value ?? '')
      .toLowerCase()
      .trim();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
    return undefined;
  }

  private parseSortBy(value: string | null): ProductSortBy {
    const normalized = String(value ?? '')
      .toLowerCase()
      .trim();
    if (normalized === 'price' || normalized === 'stock') {
      return normalized;
    }
    return 'name';
  }

  private parseSortOrder(value: string | null): ProductSortOrder {
    return String(value ?? '')
      .toLowerCase()
      .trim() === 'desc'
      ? 'desc'
      : 'asc';
  }

  private toStateKey(state: ProductsQueryState): string {
    return JSON.stringify(state);
  }

  private toApiQueryKey(params: GetProductsParams): string {
    return JSON.stringify({
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_LIMIT,
      search: params.search ?? '',
      categoryId: params.categoryId ?? '',
      categorySlug: params.categorySlug ?? '',
      minPrice: params.minPrice ?? null,
      maxPrice: params.maxPrice ?? null,
      isActive: params.isActive ?? null,
      sortBy: params.sortBy ?? DEFAULT_SORT_BY,
      sortOrder: params.sortOrder ?? DEFAULT_SORT_ORDER,
    });
  }

  private abortInFlightRequest(): void {
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.activeRequestSub) {
      this.activeRequestSub.unsubscribe();
      this.activeRequestSub = null;
    }
  }

  ngOnDestroy(): void {
    this.abortInFlightRequest();
  }

  private createEmptyResponse(page: number, limit: number): ProductsListResponse {
    return {
      success: true,
      data: {
        items: [],
        meta: {
          page,
          limit,
          totalItems: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    };
  }

  private extractServerMessage(err: unknown): string {
    const response = (err as { error?: Record<string, unknown> } | null)?.error;
    if (!response || typeof response !== 'object') {
      return '';
    }

    const errorMessage = response['message'];
    const fieldErrors = response['errors'];

    const messages: string[] = [];

    if (typeof errorMessage === 'string' && errorMessage.trim()) {
      messages.push(errorMessage.trim());
    } else if (Array.isArray(errorMessage)) {
      messages.push(
        ...errorMessage.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        ),
      );
    }

    if (Array.isArray(fieldErrors)) {
      messages.push(
        ...fieldErrors.filter(
          (item): item is string => typeof item === 'string' && item.trim().length > 0,
        ),
      );
    }

    return [...new Set(messages)].join(' | ');
  }

  private redirectToAuth(): void {
    this.router.navigate(['/auth'], {
      queryParams: {
        redirect: this.router.url
      }
    });
  }
}
