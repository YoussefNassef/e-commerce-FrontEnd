import { Component, Input } from '@angular/core';

type BadgeTone = 'slate' | 'blue' | 'emerald' | 'amber' | 'rose' | 'violet';

@Component({
  selector: 'app-badge',
  templateUrl: './badge.component.html'
})
export class BadgeComponent {
  @Input() tone: BadgeTone = 'slate';

  protected get classes(): string {
    const base = 'ui-badge inline-flex items-center';
    const toneClass =
      this.tone === 'blue'
        ? ' ui-badge-blue'
        : this.tone === 'emerald'
          ? ' ui-badge-emerald'
          : this.tone === 'amber'
            ? ' ui-badge-amber'
            : this.tone === 'rose'
              ? ' ui-badge-rose'
              : this.tone === 'violet'
                ? ' ui-badge-violet'
                : ' ui-badge-slate';
    return `${base}${toneClass}`;
  }
}
