import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, of } from 'rxjs';
import { Cart } from '../models/api.models';
import { environment } from '../models/environment';
import { inferProductCategory, ProductCategory } from '../models/product-category.model';
import { parseApiBoolean } from '../utils/boolean.util';
import { normalizeImageUrl } from '../utils/image-url.util';

export interface CartValidationResult {
  valid: boolean;
  message: string;
  issues: Array<{
    itemId: string;
    productId: string;
    code: string;
    message: string;
  }>;
  cart: Cart | null;
}

export interface CartMutationResponse {
  cart: Cart | null;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiBaseUrl;

  getCart() {
    return this.http.get<unknown>(`${this.api}/cart`).pipe(map((response) => this.normalizeCartResponse(response)));
  }

  addToCart(productId: string, quantity = 1) {
    return this.http.post(`${this.api}/cart/add`, { productId, quantity });
  }

  removeItem(cartItemId: string) {
    return this.http.delete(`${this.api}/cart/item/${cartItemId}`);
  }

  updateQuantity(cartItemId: string, quantity: number) {
    return this.http.patch(`${this.api}/cart/item/${cartItemId}`, { quantity });
  }

  clearCart() {
    return this.http.delete(`${this.api}/cart`);
  }

  applyCoupon(code: string) {
    return this.http
      .post<unknown>(`${this.api}/cart/coupon/apply`, { code: code.trim() })
      .pipe(map((response) => this.toCartMutationResponse(response)));
  }

  removeCoupon() {
    return this.http.delete<unknown>(`${this.api}/cart/coupon`).pipe(map((response) => this.toCartMutationResponse(response)));
  }

  validateCart() {
    return this.http.post<unknown>(`${this.api}/cart/validate`, {}).pipe(map((response) => this.normalizeValidateCartResponse(response)));
  }

  private normalizeCartResponse(response: unknown): Cart {
    const cart = this.extractCart(response);
    const items = Array.isArray(cart.items) ? cart.items : [];
    const normalizedItems = items.map((item) => ({
      ...item,
      quantity: Number(item.quantity ?? 0),
      price: Number(item.price ?? item.product?.price ?? 0),
      subtotal: Number(item.subtotal ?? Number(item.price ?? 0) * Number(item.quantity ?? 0)),
      product: {
        ...item.product,
        mainPicture: normalizeImageUrl(item.product?.mainPicture),
        subPictures: Array.isArray(item.product?.subPictures)
          ? item.product.subPictures.map((url) => normalizeImageUrl(url))
          : []
      }
    }));
    const totalItems = Number(cart.totalItems ?? normalizedItems.reduce((acc, item) => acc + Number(item.quantity ?? 0), 0));
    const totalPrice = Number(
      cart.totalPrice ?? normalizedItems.reduce((acc, item) => acc + Number(item.subtotal ?? 0), 0)
    );
    const subtotalAmount = Number(cart.subtotalAmount ?? totalPrice);
    const discountAmount = Number(cart.discountAmount ?? 0);
    const calculatedFinal = Number(cart.finalTotalAmount ?? subtotalAmount - discountAmount);
    const finalTotalAmount = Number.isFinite(calculatedFinal) ? Math.max(0, calculatedFinal) : totalPrice;

    return {
      ...cart,
      items: normalizedItems,
      totalItems,
      totalPrice,
      subtotalAmount,
      discountAmount,
      finalTotalAmount
    };
  }

  private extractCart(response: unknown): Cart {
    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      const data = this.toRecord(record['data']);
      const nested = this.toRecord(data?.['data']);
      const source = nested ?? data ?? record;
      const cartRecord = this.toRecord(source['cart']);
      const cartSource = cartRecord ?? source;

      const rawItems = cartSource['items'] ?? cartSource['cartItems'] ?? cartSource['products'];
      const items = Array.isArray(rawItems) ? rawItems : [];

      return {
        id: String(cartSource['id'] ?? ''),
        items: items.map((item) => this.normalizeCartItem(item)),
        totalPrice: this.pickNumber(
          cartSource['totalPrice'],
          cartSource['total'],
          cartSource['totalAmount'],
          0
        ),
        totalItems: Number(cartSource['totalItems'] ?? cartSource['itemsCount'] ?? cartSource['count'] ?? items.length),
        subtotalAmount: this.pickOptionalNumber(
          cartSource['subtotalAmount'],
          cartSource['subtotal'],
          cartSource['itemsSubtotal']
        ),
        discountAmount: this.pickNumber(
          cartSource['discountAmount'] ??
            cartSource['discount'] ??
            cartSource['couponDiscount'] ??
            cartSource['totalDiscount'] ??
            0
        ),
        finalTotalAmount: this.pickOptionalNumber(
          cartSource['payableTotal'],
          cartSource['finalTotalAmount'],
          cartSource['finalAmount'] ??
            cartSource['payableAmount'] ??
            cartSource['grandTotal'] ??
            cartSource['amountAfterDiscount'] ??
            cartSource['totalAfterDiscount'] ??
            cartSource['totalPriceAfterDiscount']
        ),
        appliedCouponCode: this.extractCouponCode(cartSource)
      };
    }

    return {
      id: '',
      items: [],
      totalPrice: 0,
      totalItems: 0,
      subtotalAmount: 0,
      discountAmount: 0,
      finalTotalAmount: 0,
      appliedCouponCode: null
    };
  }

  private normalizeCartItem(input: unknown) {
    const record = this.toRecord(input) ?? {};
    const product = this.toRecord(record['product']) ?? this.toRecord(record['item']) ?? {};
    const category = this.normalizeCategory(product['category'], String(product['categoryId'] ?? ''), String(product['name'] ?? ''));

    return {
      id: String(record['id'] ?? record['cartItemId'] ?? ''),
      quantity: Number(record['quantity'] ?? record['qty'] ?? 0),
      price: Number(record['price'] ?? record['unitPrice'] ?? product['price'] ?? 0),
      subtotal: Number(record['subtotal'] ?? record['total'] ?? 0),
      product: {
        id: String(product['id'] ?? ''),
        name: String(product['name'] ?? ''),
        slug: String(product['slug'] ?? ''),
        sku: String(product['sku'] ?? ''),
        price: Number(product['price'] ?? 0),
        stock: Number(product['stock'] ?? 0),
        isActive: parseApiBoolean(product['isActive'] ?? product['active'], true),
        description: typeof product['description'] === 'string' ? product['description'] : '',
        mainPicture: String(product['mainPicture'] ?? product['image'] ?? ''),
        subPictures: Array.isArray(product['subPictures'])
          ? (product['subPictures'] as string[])
          : Array.isArray(product['images'])
            ? (product['images'] as string[])
            : [],
        categoryId: String(product['categoryId'] ?? ''),
        category
      }
    };
  }

  private toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }

  private normalizeValidateCartResponse(response: unknown): CartValidationResult {
    const record = this.toRecord(response) ?? {};
    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    const source = nested ?? data ?? record;

    const validRaw = source['valid'];
    const valid = typeof validRaw === 'boolean' ? validRaw : false;
    const issuesRaw = Array.isArray(source['issues']) ? source['issues'] : [];
    const issues = issuesRaw.map((issue) => this.normalizeValidationIssue(issue)).filter((issue) => !!issue) as CartValidationResult['issues'];
    const cartRaw = this.toRecord(source['cart']);
    const cart = cartRaw ? this.normalizeCartResponse(cartRaw) : null;
    const message =
      (issues[0]?.message ?? '') ||
      (typeof source['message'] === 'string' ? source['message'] : '') ||
      (valid ? 'السلة صالحة لإتمام الطلب.' : 'السلة غير صالحة لإتمام الطلب.');

    return {
      valid,
      message: message.trim(),
      issues,
      cart
    };
  }

  private normalizeValidationIssue(input: unknown):
    | {
        itemId: string;
        productId: string;
        code: string;
        message: string;
      }
    | null {
    const record = this.toRecord(input);
    if (!record) {
      return null;
    }
    return {
      itemId: String(record['itemId'] ?? ''),
      productId: String(record['productId'] ?? ''),
      code: String(record['code'] ?? ''),
      message: String(record['message'] ?? '')
    };
  }

  private pickNumber(...values: unknown[]): number {
    const found = this.pickOptionalNumber(...values);
    return found ?? 0;
  }

  private pickOptionalNumber(...values: unknown[]): number | undefined {
    for (const value of values) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
    return undefined;
  }

  private toCartMutationResponse(response: unknown): CartMutationResponse {
    const cart = this.tryNormalizeCartFromResponse(response);
    return {
      cart,
      message: this.extractServerMessage(response)
    };
  }

  private tryNormalizeCartFromResponse(response: unknown): Cart | null {
    try {
      const cart = this.normalizeCartResponse(response);
      if (!cart.id && cart.items.length === 0 && cart.totalItems === 0 && cart.totalPrice === 0) {
        return null;
      }
      return cart;
    } catch {
      return null;
    }
  }

  private extractServerMessage(response: unknown): string {
    const record = this.toRecord(response);
    if (!record) {
      return '';
    }
    const messageDirect = typeof record['message'] === 'string' ? record['message'] : '';
    if (messageDirect.trim()) {
      return messageDirect.trim();
    }

    const data = this.toRecord(record['data']);
    const nested = this.toRecord(data?.['data']);
    const source = nested ?? data;
    const messageNested = typeof source?.['message'] === 'string' ? source['message'] : '';
    return messageNested.trim();
  }

  private extractCouponCode(cartSource: Record<string, unknown>): string | null {
    if (typeof cartSource['couponCode'] === 'string' && cartSource['couponCode'].trim()) {
      return cartSource['couponCode'].trim();
    }
    const coupon = this.toRecord(cartSource['coupon']);
    if (coupon && typeof coupon['code'] === 'string' && coupon['code'].trim()) {
      return coupon['code'].trim();
    }
    return null;
  }

  private normalizeCategory(category: unknown, categoryId: string, name: string): ProductCategory {
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

    return inferProductCategory(value, name);
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
}
