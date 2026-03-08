export type ProductCategory = 'phones' | 'laptops' | 'audio' | 'accessories' | 'gaming' | 'other';

export interface ProductCategoryOption {
  value: ProductCategory;
  label: string;
}

export const PRODUCT_CATEGORY_OPTIONS: ProductCategoryOption[] = [
  { value: 'phones', label: 'هواتف' },
  { value: 'laptops', label: 'لابتوبات' },
  { value: 'audio', label: 'صوتيات' },
  { value: 'accessories', label: 'إكسسوارات' },
  { value: 'gaming', label: 'ألعاب' },
  { value: 'other', label: 'أخرى' }
];

const CATEGORY_KEYWORDS: ReadonlyArray<{ category: ProductCategory; keywords: ReadonlyArray<string> }> = [
  { category: 'phones', keywords: ['phone', 'iphone', 'galaxy', 'mobile'] },
  { category: 'laptops', keywords: ['laptop', 'macbook', 'notebook', 'ultrabook'] },
  { category: 'audio', keywords: ['headphone', 'earbuds', 'speaker', 'audio', 'airpods'] },
  { category: 'gaming', keywords: ['gaming', 'console', 'ps5', 'xbox', 'controller'] },
  { category: 'accessories', keywords: ['case', 'charger', 'cable', 'adapter', 'accessory'] }
];

export function getCategoryLabel(category: ProductCategory): string {
  return PRODUCT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? 'أخرى';
}

export function inferProductCategory(...inputs: Array<string | null | undefined>): ProductCategory {
  const normalized = inputs
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();

  if (!normalized) {
    return 'other';
  }

  const matched = CATEGORY_KEYWORDS.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)));
  return matched?.category ?? 'other';
}
