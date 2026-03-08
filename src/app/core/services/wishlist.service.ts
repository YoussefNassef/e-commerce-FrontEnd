import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Product } from '../models/api.models';
import { environment } from '../models/environment';
import { inferProductCategory, ProductCategory } from '../models/product-category.model';
import { parseApiBoolean } from '../utils/boolean.util';
import { normalizeImageUrl } from '../utils/image-url.util';

export interface WishlistItem {
  id: string;
  createdAt: string;
  product: Product;
}

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getWishlist() {
    return this.http.get<unknown>(`${this.api}/wishlist`).pipe(map((response) => this.normalizeWishlistResponse(response)));
  }

  addToWishlist(productId: string) {
    return this.http.post<unknown>(`${this.api}/wishlist/${productId}`, {});
  }

  removeFromWishlist(productId: string) {
    return this.http.delete<unknown>(`${this.api}/wishlist/${productId}`);
  }

  moveToCart(productId: string) {
    return this.http.post<unknown>(`${this.api}/wishlist/move-to-cart/${productId}`, {});
  }

  private normalizeWishlistResponse(response: unknown): WishlistItem[] {
    const items = this.extractWishlistItems(response);
    return items
      .map((item) => this.normalizeWishlistItem(item))
      .filter((item): item is WishlistItem => !!item)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private extractWishlistItems(response: unknown): unknown[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;

      if (Array.isArray(record['data'])) {
        return record['data'] as unknown[];
      }

      const data = this.toRecord(record['data']);
      if (data) {
        if (Array.isArray(data['items'])) {
          return data['items'] as unknown[];
        }
        if (Array.isArray(data['wishlist'])) {
          return data['wishlist'] as unknown[];
        }
        if (Array.isArray(data['data'])) {
          return data['data'] as unknown[];
        }
      }

      if (Array.isArray(record['items'])) {
        return record['items'] as unknown[];
      }
    }

    return [];
  }

  private normalizeWishlistItem(input: unknown): WishlistItem | null {
    const record = this.toRecord(input);
    if (!record) {
      return null;
    }

    const productRecord = this.toRecord(record['product']);
    if (!productRecord) {
      return null;
    }

    const product = this.normalizeProduct(productRecord);
    if (!product.id) {
      return null;
    }

    return {
      id: String(record['id'] ?? ''),
      createdAt: typeof record['createdAt'] === 'string' ? record['createdAt'] : new Date().toISOString(),
      product
    };
  }

  private normalizeProduct(record: Record<string, unknown>): Product {
    const name = String(record['name'] ?? '');
    const description = typeof record['description'] === 'string' ? record['description'] : '';
    const categoryId = String(record['categoryId'] ?? '');

    return {
      id: String(record['id'] ?? ''),
      name,
      slug: String(record['slug'] ?? ''),
      sku: String(record['sku'] ?? ''),
      price: Number(record['price'] ?? 0),
      stock: Number(record['stock'] ?? 0),
      isActive: parseApiBoolean(record['isActive'] ?? record['active'], true),
      description,
      mainPicture: normalizeImageUrl(String(record['mainPicture'] ?? record['image'] ?? '')),
      subPictures: Array.isArray(record['subPictures'])
        ? (record['subPictures'] as string[]).map((url) => normalizeImageUrl(url))
        : Array.isArray(record['images'])
          ? (record['images'] as string[]).map((url) => normalizeImageUrl(url))
          : [],
      categoryId,
      category: this.normalizeCategory(record['category'], categoryId, name, description)
    };
  }

  private normalizeCategory(category: unknown, categoryId: string, name: string, description: string): ProductCategory {
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
      default:
        return 'other';
    }
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}

