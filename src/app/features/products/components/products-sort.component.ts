import { Component, EventEmitter, Input, Output } from '@angular/core';

export type ProductsSortOption = 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-desc' | 'stock-asc';

@Component({
  selector: 'app-products-sort',
  templateUrl: './products-sort.component.html',
  styleUrl: './products-sort.component.css'
})
export class ProductsSortComponent {
  @Input() value: ProductsSortOption = 'name-asc';
  @Input() disabled = false;
  @Output() valueChanged = new EventEmitter<ProductsSortOption>();
}
