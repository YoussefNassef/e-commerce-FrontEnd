import { Component, Input } from '@angular/core';

type StateTone = 'empty' | 'error';

@Component({
  selector: 'app-state-panel',
  templateUrl: './state-panel.component.html'
})
export class StatePanelComponent {
  @Input() title = '';
  @Input() message = '';
  @Input() tone: StateTone = 'empty';

  protected get containerClass(): string {
    const base = 'ui-state';
    if (this.tone === 'error') {
      return `${base} ui-state-error`;
    }
    return `${base} ui-state-empty`;
  }
}
