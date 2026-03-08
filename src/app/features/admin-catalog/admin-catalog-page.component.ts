import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Product } from '../../core/models/api.models';
import { ApiCategory, CategoriesService, CreateCategoryPayload, UpdateCategoryPayload } from '../../core/services/categories.service';
import { CreateProductPayload, ProductsService } from '../../core/services/products.service';
import { BadgeComponent } from '../../shared/ui/badge/badge.component';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';

@Component({
  selector: 'app-admin-catalog-page',
  imports: [CurrencyPipe, ReactiveFormsModule, BadgeComponent, ButtonComponent, CardComponent, LoadingSpinnerComponent],
  templateUrl: './admin-catalog-page.component.html',
  styleUrl: './admin-catalog-page.component.css'
})
export class AdminCatalogPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly categoriesService = inject(CategoriesService);
  private readonly productsService = inject(ProductsService);
  private readonly pageSize = 12;

  protected readonly loading = signal(true);
  protected readonly productsLoading = signal(false);
  protected readonly creatingCategory = signal(false);
  protected readonly updatingCategoryId = signal<string | null>(null);
  protected readonly deletingCategoryId = signal<string | null>(null);
  protected readonly creatingProduct = signal(false);
  protected readonly togglingProductId = signal<string | null>(null);
  protected readonly deletingProductId = signal<string | null>(null);
  protected readonly categories = signal<ApiCategory[]>([]);
  protected readonly products = signal<Product[]>([]);
  protected readonly currentPage = signal(1);
  protected readonly totalPages = signal(1);
  protected readonly totalItems = signal(0);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly mainPictureFile = signal<File | null>(null);
  protected readonly subPictureFiles = signal<File[]>([]);

  protected readonly hasCategories = computed(() => this.categories().length > 0);
  protected readonly hasProducts = computed(() => this.products().length > 0);
  protected readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const start = Math.max(1, current - 2);
    const end = Math.min(total, start + 4);
    const normalizedStart = Math.max(1, end - 4);
    return Array.from({ length: end - normalizedStart + 1 }, (_, index) => normalizedStart + index);
  });

  protected readonly categoryForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['']
  });
  protected readonly categoryEditForm = this.fb.nonNullable.group({
    id: [''],
    name: ['', [Validators.required, Validators.minLength(2)]],
    slug: ['']
  });

  protected readonly productForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: [''],
    price: [100, [Validators.required, Validators.min(1)]],
    stock: [1, [Validators.required, Validators.min(0)]],
    categoryId: ['', [Validators.required]]
  });

  constructor() {
    this.loadInitial();
  }

  protected loadInitial(): void {
    this.loading.set(true);
    this.error.set('');

    this.categoriesService.getCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        const firstCategoryId = categories[0]?.id ?? '';
        if (firstCategoryId) {
          this.productForm.patchValue({ categoryId: firstCategoryId });
        }
        this.loading.set(false);
        this.loadProductsPage(1);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.extractServerMessage(err) || 'تعذر تحميل التصنيفات.');
      }
    });
  }

  protected goToPage(page: number): void {
    const targetPage = Math.min(Math.max(1, page), this.totalPages());
    if (targetPage === this.currentPage() || this.productsLoading()) {
      return;
    }
    this.loadProductsPage(targetPage);
  }

  protected createCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.creatingCategory.set(true);
    this.error.set('');
    this.notice.set('');

    const value = this.categoryForm.getRawValue();
    const name = value.name.trim();
    const payload: CreateCategoryPayload = {
      name,
      slug: value.slug.trim() || this.toSlug(name)
    };

    this.categoriesService
      .createCategory(payload)
      .pipe(finalize(() => this.creatingCategory.set(false)))
      .subscribe({
        next: (created) => {
          if (created) {
            this.categories.update((items) => [created, ...items.filter((item) => item.id !== created.id)]);
            this.productForm.patchValue({ categoryId: created.id });
          }
          this.notice.set('تم إنشاء التصنيف بنجاح.');
          this.categoryForm.reset({ name: '', slug: '' });
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر إنشاء التصنيف.')
      });
  }

  protected startCategoryEdit(category: ApiCategory): void {
    this.categoryEditForm.setValue({
      id: category.id,
      name: category.name,
      slug: category.slug ?? ''
    });
    this.notice.set('');
    this.error.set('');
  }

  protected updateCategory(): void {
    if (this.categoryEditForm.invalid) {
      this.categoryEditForm.markAllAsTouched();
      return;
    }

    const value = this.categoryEditForm.getRawValue();
    if (!value.id) {
      this.error.set('اختر تصنيفًا للتعديل أولًا.');
      return;
    }

    this.updatingCategoryId.set(value.id);
    this.notice.set('');
    this.error.set('');

    const name = value.name.trim();
    const payload: UpdateCategoryPayload = {
      name,
      slug: value.slug.trim() || this.toSlug(name)
    };

    this.categoriesService
      .updateCategory(value.id, payload)
      .pipe(finalize(() => this.updatingCategoryId.set(null)))
      .subscribe({
        next: (updated) => {
          if (updated) {
            this.categories.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          }
          this.notice.set('تم تحديث التصنيف بنجاح.');
          this.categoryEditForm.reset({ id: '', name: '', slug: '' });
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر تحديث التصنيف.')
      });
  }

  protected deleteCategory(category: ApiCategory): void {
    this.deletingCategoryId.set(category.id);
    this.notice.set('');
    this.error.set('');

    this.categoriesService
      .deleteCategory(category.id)
      .pipe(finalize(() => this.deletingCategoryId.set(null)))
      .subscribe({
        next: () => {
          this.categories.update((items) => items.filter((item) => item.id !== category.id));
          if (this.productForm.controls.categoryId.value === category.id) {
            this.productForm.patchValue({ categoryId: this.categories()[0]?.id ?? '' });
          }
          if (this.categoryEditForm.controls.id.value === category.id) {
            this.categoryEditForm.reset({ id: '', name: '', slug: '' });
          }
          this.notice.set('تم حذف التصنيف.');
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر حذف التصنيف.')
      });
  }

  protected createProduct(): void {
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    const mainPicture = this.mainPictureFile();
    if (!mainPicture) {
      this.error.set('الصورة الرئيسية مطلوبة.');
      return;
    }

    this.creatingProduct.set(true);
    this.error.set('');
    this.notice.set('');

    const value = this.productForm.getRawValue();
    const name = value.name.trim();

    const payload: CreateProductPayload = {
      name,
      description: value.description.trim() || undefined,
      price: Number(value.price),
      stock: Number(value.stock),
      categoryId: value.categoryId,
      slug: this.toSlug(name),
      sku: this.toSku(name),
      mainPicture,
      subPictures: this.subPictureFiles()
    };

    this.productsService
      .createProduct(payload)
      .pipe(finalize(() => this.creatingProduct.set(false)))
      .subscribe({
        next: () => {
          this.notice.set('تم إنشاء المنتج بنجاح.');
          this.productForm.reset({
            name: '',
            description: '',
            price: 100,
            stock: 1,
            categoryId: this.categories()[0]?.id ?? ''
          });
          this.mainPictureFile.set(null);
          this.subPictureFiles.set([]);
          this.loadProductsPage(1);
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر إنشاء المنتج.')
      });
  }

  protected onMainPictureSelected(fileList: FileList | null): void {
    this.mainPictureFile.set(fileList?.item(0) ?? null);
  }

  protected onSubPicturesSelected(fileList: FileList | null): void {
    const files = fileList ? Array.from(fileList) : [];
    this.subPictureFiles.set(files.slice(0, 3));
  }

  protected toggleProductActive(product: Product): void {
    this.togglingProductId.set(product.id);
    this.error.set('');
    this.notice.set('');

    this.productsService
      .updateProduct(product.id, { isActive: !product.isActive })
      .pipe(finalize(() => this.togglingProductId.set(null)))
      .subscribe({
        next: (updated) => {
          if (updated) {
            this.products.update((items) => items.map((item) => (item.id === updated.id ? updated : item)));
          } else {
            this.products.update((items) =>
              items.map((item) => (item.id === product.id ? { ...item, isActive: !item.isActive } : item))
            );
          }
          this.notice.set(product.isActive ? 'تم تعطيل المنتج.' : 'تم تفعيل المنتج.');
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر تحديث حالة المنتج.')
      });
  }

  protected deleteProduct(product: Product): void {
    this.deletingProductId.set(product.id);
    this.error.set('');
    this.notice.set('');

    this.productsService
      .deleteProduct(product.id)
      .pipe(finalize(() => this.deletingProductId.set(null)))
      .subscribe({
        next: () => {
          this.notice.set('تم حذف المنتج.');
          const shouldGoBack = this.products().length === 1 && this.currentPage() > 1;
          this.loadProductsPage(shouldGoBack ? this.currentPage() - 1 : this.currentPage());
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر حذف المنتج.')
      });
  }

  private loadProductsPage(page: number): void {
    this.productsLoading.set(true);
    this.error.set('');

    this.productsService
      .getProducts({ page, limit: this.pageSize, sortBy: 'name', sortOrder: 'asc' })
      .pipe(finalize(() => this.productsLoading.set(false)))
      .subscribe({
        next: (res) => {
          this.products.set(res.data.items);
          this.currentPage.set(res.data.meta.page);
          this.totalPages.set(Math.max(1, res.data.meta.totalPages));
          this.totalItems.set(res.data.meta.totalItems);
        },
        error: (err) => this.error.set(this.extractServerMessage(err) || 'تعذر تحميل المنتجات.')
      });
  }

  private toSlug(name: string): string {
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || `category-${Date.now()}`;
  }

  private toSku(name: string): string {
    const base = name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'PRD';
    return `${base}-${Date.now().toString().slice(-6)}`;
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
      return message.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' | ');
    }
    return '';
  }
}
