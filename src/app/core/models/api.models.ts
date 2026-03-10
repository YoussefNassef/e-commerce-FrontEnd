import { ProductCategory } from './product-category.model';

export interface ApiUser {
  id: number;
  fullName: string;
  phone: string;
  role: 'user' | 'admin';
  isVerified: boolean;
}

export interface AuthVerifyResponse {
  accessToken: string;
  user: ApiUser;
  message: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  price: number;
  stock: number;
  isActive: boolean;
  description?: string;
  mainPicture: string;
  subPictures: string[];
  categoryId: string;
  category: ProductCategory;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface Cart {
  id: string;
  items: CartItem[];
  totalPrice: number;
  totalItems: number;
  subtotalAmount?: number;
  discountAmount?: number;
  finalTotalAmount?: number;
  appliedCouponCode?: string | null;
}

export interface OrderItem {
  id: string;
  product: Product;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Order {
  id: string;
  status: 'pending_payment' | 'payment_initiated' | 'paid' | 'in_progress' | 'completed' | 'cancelled';
  deliveryStatus?: 'pending' | 'processing' | 'shipped' | 'out_for_delivery' | 'delivered' | 'cancelled';
  totalAmount: number;
  items: OrderItem[];
  createdAt: string;
}

export type ShippingMethod = 'standard' | 'express';

export interface Address {
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  isDefault: boolean;
}

export interface OrderQuote {
  subtotalAmount: number;
  discountAmount: number;
  couponCode?: string | null;
  shippingMethod: ShippingMethod;
  shippingCost: number;
  shippingEtaDays: number;
  totalAmount: number;
}

export interface PaymentResult {
  id?: string;
  status?: 'initiated' | 'paid' | 'failed';
  message?: string;
  redirectUrl?: string;
}

export interface AuthSessionInfo {
  id: string;
  createdAt: string;
  lastUsedAt?: string | null;
  expiresAt: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  isCurrent: boolean;
  isRevoked: boolean;
  revokedAt?: string | null;
}
