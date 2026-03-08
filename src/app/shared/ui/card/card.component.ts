import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-card',
  templateUrl: './card.component.html'
})
export class CardComponent {
  @Input() compact = false;

  protected get classes(): string {
    return this.compact ? 'ui-card ui-card-compact' : 'ui-card';
  }
}
