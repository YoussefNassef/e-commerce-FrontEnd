import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ApiCategory } from '../../../core/services/categories.service';
import { ButtonComponent } from '../../../shared/ui/button/button.component';

@Component({
  selector: 'app-products-filters',
  imports: [ButtonComponent],
  templateUrl: './products-filters.component.html',
  styleUrl: './products-filters.component.css'
})
export class ProductsFiltersComponent {
  protected readonly priceOptions: ReadonlyArray<{ value: string; label: string }> = [
    { value: '', label: 'بدون حد' },
    { value: '500', label: '500 ر.س' },
    { value: '1000', label: '1,000 ر.س' },
    { value: '2000', label: '2,000 ر.س' },
    { value: '3000', label: '3,000 ر.س' },
    { value: '5000', label: '5,000 ر.س' },
    { value: '7000', label: '7,000 ر.س' },
    { value: '10000', label: '10,000 ر.س' },
    { value: '15000', label: '15,000 ر.س' },
    { value: '20000', label: '20,000 ر.س' }
  ];

  @Input() search = '';
  @Input() selectedCategory = '';
  @Input() minPrice: number | null = null;
  @Input() maxPrice: number | null = null;
  @Input() isActive: 'all' | 'true' | 'false' = 'all';
  @Input() inStockOnly = false;
  @Input() loading = false;
  @Input() categories: ApiCategory[] = [];
  @Input() minMaxError = '';

  @Output() searchChanged = new EventEmitter<string>();
  @Output() categoryChanged = new EventEmitter<string>();
  @Output() minPriceChanged = new EventEmitter<string>();
  @Output() maxPriceChanged = new EventEmitter<string>();
  @Output() isActiveChanged = new EventEmitter<'all' | 'true' | 'false'>();
  @Output() inStockChanged = new EventEmitter<boolean>();
  @Output() resetPressed = new EventEmitter<void>();

  protected minPriceOptions(): ReadonlyArray<{ value: string; label: string }> {
    if (this.maxPrice == null) {
      return this.priceOptions;
    }

    return this.priceOptions.filter((option) => {
      if (!option.value) {
        return true;
      }
      return Number(option.value) <= this.maxPrice!;
    });
  }

  protected maxPriceOptions(): ReadonlyArray<{ value: string; label: string }> {
    if (this.minPrice == null) {
      return this.priceOptions;
    }

    return this.priceOptions.filter((option) => {
      if (!option.value) {
        return true;
      }
      return Number(option.value) >= this.minPrice!;
    });
  }
}
