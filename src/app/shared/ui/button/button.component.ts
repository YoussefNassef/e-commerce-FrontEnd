import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  imports: [CommonModule],
  templateUrl: './button.component.html'
})
export class ButtonComponent {
  @Input() type: 'button' | 'submit' | 'reset' = 'button';
  @Input() variant: ButtonVariant = 'primary';
  @Input() size: ButtonSize = 'md';
  @Input() disabled = false;
  @Input() fullWidth = false;
  @Input() ariaLabel = '';

  @Output() pressed = new EventEmitter<MouseEvent>();

  protected get classes(): string {
    const base = 'ui-btn inline-flex items-center justify-center';
    const width = this.fullWidth ? ' w-full' : '';

    const sizeClass =
      this.size === 'sm' ? ' ui-btn-sm' : this.size === 'lg' ? ' ui-btn-lg' : ' ui-btn-md';

    const variantClass =
      this.variant === 'secondary'
        ? ' ui-btn-secondary'
        : this.variant === 'danger'
          ? ' ui-btn-danger'
          : this.variant === 'ghost'
            ? ' ui-btn-ghost'
            : ' ui-btn-primary';

    const disabledClass = this.disabled ? ' ui-btn-disabled' : '';
    return `${base}${width}${sizeClass}${variantClass}${disabledClass}`;
  }

  protected onClick(event: MouseEvent): void {
    if (this.disabled) {
      event.preventDefault();
      return;
    }
    this.pressed.emit(event);
  }
}
