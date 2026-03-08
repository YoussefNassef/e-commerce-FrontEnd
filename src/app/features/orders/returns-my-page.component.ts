import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { ReturnRequestDto } from '../../core/models/returns.models';
import { ReturnsService } from '../../core/services/returns.service';
import {
  canCustomerCancelReturn,
  returnReasonLabel,
  returnStatusLabel,
  returnStatusTone,
} from '../../core/utils/returns.helpers';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-returns-my-page',
  imports: [CurrencyPipe, DatePipe, RouterLink, ButtonComponent, CardComponent, StatePanelComponent],
  templateUrl: './returns-my-page.component.html',
  styleUrl: './returns-my-page.component.css',
})
export class ReturnsMyPageComponent {
  private readonly returnsService = inject(ReturnsService);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly cancellingId = signal('');
  protected readonly requests = signal<ReturnRequestDto[]>([]);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.returnsService
      .getMyReturnRequests()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (items) => this.requests.set(items),
        error: (err) =>
          this.error.set(
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر تحميل طلبات الإرجاع.',
          ),
      });
  }

  protected cancelRequest(request: ReturnRequestDto): void {
    if (!canCustomerCancelReturn(request.status) || this.cancellingId()) {
      return;
    }

    this.cancellingId.set(request.id);
    this.error.set('');

    this.returnsService
      .cancelMyReturnRequest(request.id)
      .pipe(finalize(() => this.cancellingId.set('')))
      .subscribe({
        next: (updated) => {
          this.requests.update((list) =>
            list.map((item) => (item.id === updated.id ? updated : item)),
          );
        },
        error: (err) =>
          this.error.set(
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر إلغاء طلب الإرجاع.',
          ),
      });
  }

  protected reasonLabel(reason: string): string {
    return returnReasonLabel(reason);
  }

  protected statusLabel(status: string): string {
    return returnStatusLabel(status);
  }

  protected statusTone(status: string): string {
    return returnStatusTone(status);
  }

  protected canCancel(status: string): boolean {
    return canCustomerCancelReturn(status);
  }
}
