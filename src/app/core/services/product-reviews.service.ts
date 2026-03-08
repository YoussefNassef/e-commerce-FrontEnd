import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { environment } from '../models/environment';

export interface ProductReview {
  id: string;
  productId: string;
  userId: number | null;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ProductReviewsService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getReviews(productId: string, page = 1, limit = 20) {
    return this.http
      .get<unknown>(`${this.api}/reviews/product/${productId}`, {
        params: { page, limit }
      })
      .pipe(map((response) => this.normalizeReviewsResponse(response, productId)));
  }

  addReview(payload: Omit<ProductReview, 'id' | 'createdAt' | 'author' | 'userId'>) {
    return this.http
      .post<unknown>(`${this.api}/reviews`, {
        productId: payload.productId,
        rating: payload.rating,
        comment: payload.comment
      })
      .pipe(map((response) => this.extractSingleReview(response, payload.productId)));
  }

  updateReview(reviewId: string, payload: { rating: number; comment: string }) {
    return this.http
      .patch<unknown>(`${this.api}/reviews/${reviewId}`, {
        rating: payload.rating,
        comment: payload.comment
      })
      .pipe(map((response) => this.extractSingleReview(response, '')));
  }

  private normalizeReviewsResponse(response: unknown, fallbackProductId: string): ProductReview[] {
    const list = this.extractReviewsList(response, fallbackProductId);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  private extractReviewsList(response: unknown, fallbackProductId: string): ProductReview[] {
    if (Array.isArray(response)) {
      return response.map((item) => this.toReview(item, fallbackProductId)).filter((item): item is ProductReview => !!item);
    }

    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      const data = record['data'];

      if (Array.isArray(data)) {
        return data.map((item) => this.toReview(item, fallbackProductId)).filter((item): item is ProductReview => !!item);
      }

      if (data && typeof data === 'object') {
        const nested = data as Record<string, unknown>;
        const nestedItems = nested['items'] ?? nested['reviews'] ?? nested['data'];
        if (Array.isArray(nestedItems)) {
          return nestedItems
            .map((item) => this.toReview(item, fallbackProductId))
            .filter((item): item is ProductReview => !!item);
        }
      }
    }

    return [];
  }

  private extractSingleReview(response: unknown, fallbackProductId: string): ProductReview | null {
    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      const data = record['data'];
      if (data && typeof data === 'object') {
        return this.toReview(data, fallbackProductId);
      }
      return this.toReview(record, fallbackProductId);
    }

    return null;
  }

  private toReview(input: unknown, fallbackProductId: string): ProductReview | null {
    if (!input || typeof input !== 'object') {
      return null;
    }

    const record = input as Record<string, unknown>;
    const user = record['user'] && typeof record['user'] === 'object' ? (record['user'] as Record<string, unknown>) : null;
    const product =
      record['product'] && typeof record['product'] === 'object' ? (record['product'] as Record<string, unknown>) : null;

    return {
      id: String(record['id'] ?? ''),
      productId: String(record['productId'] ?? product?.['id'] ?? fallbackProductId),
      userId: typeof user?.['id'] === 'number' ? (user['id'] as number) : null,
      author: String(user?.['fullName'] ?? user?.['name'] ?? 'Anonymous'),
      rating: Number(record['rating'] ?? 0),
      comment: String(record['comment'] ?? ''),
      createdAt: typeof record['createdAt'] === 'string' ? record['createdAt'] : new Date().toISOString()
    };
  }
}
