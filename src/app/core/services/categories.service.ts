import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';

export interface ApiCategory {
  id: string;
  name: string;
  slug?: string;
}

export interface CreateCategoryPayload {
  name: string;
  slug: string;
}

export interface UpdateCategoryPayload {
  name?: string;
  slug?: string;
}

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getCategories() {
    return this.http.get<unknown>(`${this.api}/categories`).pipe(map((response) => this.normalizeCategoriesResponse(response)));
  }

  createCategory(payload: CreateCategoryPayload) {
    return this.http
      .post<unknown>(`${this.api}/categories`, payload)
      .pipe(map((response) => this.extractSingleCategory(response)));
  }

  updateCategory(categoryId: string, payload: UpdateCategoryPayload) {
    return this.http
      .patch<unknown>(`${this.api}/categories/${categoryId}`, payload)
      .pipe(map((response) => this.extractSingleCategory(response)));
  }

  deleteCategory(categoryId: string) {
    return this.http.delete<unknown>(`${this.api}/categories/${categoryId}`);
  }

  private normalizeCategoriesResponse(response: unknown): ApiCategory[] {
    const normalize = (items: unknown[]): ApiCategory[] =>
      items
        .map((item) => this.normalizeCategory(item))
        .filter((item): item is ApiCategory => !!item && item.id.length > 0);

    if (Array.isArray(response)) {
      return normalize(response);
    }

    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      if (Array.isArray(record['data'])) {
        return normalize(record['data']);
      }
      const data = record['data'];
      if (data && typeof data === 'object') {
        const nested = data as Record<string, unknown>;
        if (Array.isArray(nested['categories'])) {
          return normalize(nested['categories']);
        }
        if (Array.isArray(nested['items'])) {
          return normalize(nested['items']);
        }
      }
    }

    return [];
  }

  private normalizeCategory(input: unknown): ApiCategory | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const record = input as Record<string, unknown>;
    const id = String(record['id'] ?? '').trim();
    const name = String(record['name'] ?? record['title'] ?? '').trim();
    const slugValue = record['slug'];
    const slug = typeof slugValue === 'string' ? slugValue.trim() : undefined;

    if (!id || !name) {
      return null;
    }

    return { id, name, slug };
  }

  private extractSingleCategory(response: unknown): ApiCategory | null {
    if (!response || typeof response !== 'object') {
      return null;
    }

    const record = response as Record<string, unknown>;
    const direct = this.normalizeCategory(record);
    if (direct) {
      return direct;
    }

    const data = record['data'];
    if (data && typeof data === 'object') {
      const nested = data as Record<string, unknown>;
      const nestedDirect = this.normalizeCategory(nested);
      if (nestedDirect) {
        return nestedDirect;
      }

      const nestedData = nested['data'];
      if (nestedData && typeof nestedData === 'object') {
        return this.normalizeCategory(nestedData);
      }
    }

    return null;
  }
}
