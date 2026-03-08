import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, catchError, switchMap } from 'rxjs/operators';
import { of } from 'rxjs';
import { Product } from '../models/api.models';
import { environment } from '../models/environment';
import { inferProductCategory, ProductCategory } from '../models/product-category.model';
import { parseApiBoolean } from '../utils/boolean.util';
import { normalizeImageUrl } from '../utils/image-url.util';

export interface CreateProductPayload {
  name: string;
  description?: string;
  price: number;
  stock: number;
  slug: string;
  sku: string;
  categoryId: string;
  mainPicture: File;
  subPictures?: File[];
}

export interface UpdateProductPayload {
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  slug?: string;
  sku?: string;
  categoryId?: string;
  isActive?: boolean;
}

export type ProductSortBy = 'name' | 'price' | 'stock';
export type ProductSortOrder = 'asc' | 'desc';

export interface GetProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  isActive?: boolean;
  sortBy?: ProductSortBy;
  sortOrder?: ProductSortOrder;
}

export interface ProductsMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface ProductsListData {
  items: Product[];
  meta: ProductsMeta;
}

export interface ProductsListResponse {
  success: boolean;
  data: ProductsListData;
}

@Injectable({ providedIn: 'root' })
export class ProductsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getProducts(params: GetProductsParams = {}, abortSignal?: AbortSignal) {
    const requestParams = this.buildProductsQueryParams(params);
    const requestOptions: Record<string, unknown> = { params: requestParams };
    if (abortSignal) {
      requestOptions['signal'] = abortSignal;
    }

    return this.http
      .get<unknown>(`${this.api}/products`, requestOptions as never)
      .pipe(map((response) => this.normalizeProductsListResponse(response, params.page ?? 1, params.limit ?? 10)));
  }

  getProductById(productId: string) {
    return this.http.get<unknown>(`${this.api}/products/${productId}`).pipe(
      map((response) => this.extractSingleProduct(response)),
      catchError(() =>
        this.getProducts({ page: 1, limit: 200 }).pipe(
          map((response) => response.data.items.find((product) => product.id === productId) ?? null),
          catchError(() => of(null))
        )
      ),
      switchMap((product) => (product ? of(this.normalizeProduct(product)) : of(null)))
    );
  }

  createProduct(payload: CreateProductPayload) {
    const formData = new FormData();
    formData.append('name', payload.name);
    formData.append('price', String(payload.price));
    formData.append('stock', String(payload.stock));
    formData.append('slug', payload.slug);
    formData.append('sku', payload.sku);
    formData.append('categoryId', payload.categoryId);
    if (payload.description) {
      formData.append('description', payload.description);
    }
    formData.append('mainPicture', payload.mainPicture);

    for (const file of payload.subPictures ?? []) {
      formData.append('subPictures', file);
    }

    return this.http.post<unknown>(`${this.api}/products`, formData).pipe(
      map((response) => this.extractSingleProduct(response)),
      switchMap((product) => of(product ? this.normalizeProduct(product) : null))
    );
  }

  updateProduct(productId: string, payload: UpdateProductPayload) {
    return this.http.patch<unknown>(`${this.api}/products/${productId}`, payload).pipe(
      map((response) => this.extractSingleProduct(response)),
      switchMap((product) => of(product ? this.normalizeProduct(product) : null))
    );
  }

  deleteProduct(productId: string) {
    return this.http.delete<unknown>(`${this.api}/products/${productId}`);
  }

  private buildProductsQueryParams(params: GetProductsParams): Record<string, string> {
    const query: Record<string, string> = {};
    if (params.page != null) {
      query['page'] = String(Math.max(1, Number(params.page)));
    }
    if (params.limit != null) {
      query['limit'] = String(Math.max(1, Number(params.limit)));
    }
    if (params.search?.trim()) {
      query['search'] = params.search.trim();
    }
    if (params.categoryId?.trim()) {
      query['categoryId'] = params.categoryId.trim();
    }
    if (params.categorySlug?.trim()) {
      query['categorySlug'] = params.categorySlug.trim();
    }
    if (params.minPrice != null && Number.isFinite(Number(params.minPrice))) {
      query['minPrice'] = String(Number(params.minPrice));
    }
    if (params.maxPrice != null && Number.isFinite(Number(params.maxPrice))) {
      query['maxPrice'] = String(Number(params.maxPrice));
    }
    if (typeof params.isActive === 'boolean') {
      query['isActive'] = String(params.isActive);
    }
    if (params.sortBy) {
      query['sortBy'] = params.sortBy;
    }
    if (params.sortOrder) {
      query['sortOrder'] = params.sortOrder;
    }
    return query;
  }

  private normalizeProductsListResponse(response: unknown, fallbackPage: number, fallbackLimit: number): ProductsListResponse {
    const record = this.toRecord(response) ?? {};
    const data = this.toRecord(record['data']);
    const nestedData = this.toRecord(data?.['data']);
    const source = nestedData ?? data ?? record;

    const itemsSource =
      source['items'] ??
      source['products'] ??
      data?.['items'] ??
      data?.['products'] ??
      record['items'] ??
      record['products'] ??
      record['data'];
    const rawItems = Array.isArray(itemsSource) ? itemsSource : [];
    const items = rawItems.map((item) => this.normalizeProduct((this.toRecord(item) ?? {}) as unknown as Product));

    const metaSource =
      this.toRecord(source['meta']) ??
      this.toRecord(data?.['meta']) ??
      this.toRecord(record['meta']) ??
      source;
    const totalItems = this.toNumber(metaSource?.['totalItems'] ?? source['totalItems'] ?? items.length, items.length);
    const page = this.toNumber(metaSource?.['page'], Math.max(1, fallbackPage));
    const limit = this.toNumber(metaSource?.['limit'], Math.max(1, fallbackLimit));
    const totalPages = this.toNumber(metaSource?.['totalPages'], Math.max(1, Math.ceil(totalItems / Math.max(1, limit))));
    const hasNextPage = this.toBoolean(metaSource?.['hasNextPage'], page < totalPages);
    const hasPreviousPage = this.toBoolean(metaSource?.['hasPreviousPage'], page > 1);
    const successRaw = record['success'] ?? data?.['success'];

    return {
      success: typeof successRaw === 'boolean' ? successRaw : true,
      data: {
        items,
        meta: {
          page,
          limit,
          totalItems,
          totalPages,
          hasNextPage,
          hasPreviousPage
        }
      }
    };
  }

  private normalizeProduct(product: Product): Product {
    const record = product as unknown as Record<string, unknown>;
    const category = this.normalizeCategory(product.category, product.categoryId, product.name, product.description);
    const rawCategoryId = typeof product.categoryId === 'string' ? product.categoryId.trim() : '';
    const normalizedStock = Number(record['stock'] ?? 0);
    const normalizedPrice = Number(record['price'] ?? 0);
    const isActive = parseApiBoolean(record['isActive'] ?? record['active'], true);

    return {
      ...product,
      price: Number.isFinite(normalizedPrice) ? normalizedPrice : 0,
      stock: Number.isFinite(normalizedStock) ? normalizedStock : 0,
      isActive,
      categoryId: rawCategoryId,
      category,
      mainPicture: normalizeImageUrl(product.mainPicture),
      subPictures: Array.isArray(product.subPictures)
        ? product.subPictures.map((url) => normalizeImageUrl(url))
        : []
    };
  }

  private extractSingleProduct(response: unknown): Product | null {
    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      if (record['data'] && typeof record['data'] === 'object') {
        const dataRecord = record['data'] as Record<string, unknown>;
        if (dataRecord['data'] && typeof dataRecord['data'] === 'object') {
          return dataRecord['data'] as Product;
        }
        return dataRecord as unknown as Product;
      }
      return record as unknown as Product;
    }

    return null;
  }

  private normalizeCategory(category: unknown, categoryId: string, name: string, description?: string): ProductCategory {
    const rawCategory = this.extractCategoryText(category);
    const knownCategoryFromField = this.mapKnownCategory(rawCategory);
    if (knownCategoryFromField) {
      return knownCategoryFromField;
    }

    const value = String(categoryId ?? '')
      .toLowerCase()
      .trim();

    const knownCategory = this.mapKnownCategory(value);
    if (knownCategory) {
      return knownCategory;
    }

    return inferProductCategory(value, name, description);
  }

  private extractCategoryText(category: unknown): string {
    if (typeof category === 'string') {
      return category.toLowerCase().trim();
    }

    if (category && typeof category === 'object') {
      const record = category as Record<string, unknown>;
      const fromName = typeof record['name'] === 'string' ? record['name'] : '';
      const fromSlug = typeof record['slug'] === 'string' ? record['slug'] : '';
      return `${fromName} ${fromSlug}`.toLowerCase().trim();
    }

    return '';
  }

  private mapKnownCategory(value: string): ProductCategory | null {
    switch (value) {
      case 'phones':
      case 'phone':
      case 'smartphone':
      case 'smartphones':
      case 'mobile':
        return 'phones';
      case 'laptops':
      case 'laptop':
      case 'notebook':
        return 'laptops';
      case 'audio':
      case 'earbuds':
      case 'headphones':
      case 'speaker':
        return 'audio';
      case 'gaming':
        return 'gaming';
      case 'accessories':
      case 'accessory':
        return 'accessories';
      case 'other':
        return 'other';
      default:
        return null;
    }
  }

  private toNumber(value: unknown, fallback: number): number {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  private toBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const normalized = value.toLowerCase().trim();
      if (normalized === 'true') {
        return true;
      }
      if (normalized === 'false') {
        return false;
      }
    }
    return fallback;
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}
