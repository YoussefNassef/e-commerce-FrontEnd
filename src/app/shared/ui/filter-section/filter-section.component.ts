import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-filter-section',
  templateUrl: './filter-section.component.html'
})
export class FilterSectionComponent {
  @Input() title = 'الفلاتر';
  @Input() subtitle = '';
}
