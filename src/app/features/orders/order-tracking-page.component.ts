import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { OrderTrackingDto, TrackingTimelineEvent } from '../../core/models/tracking.models';
import { TrackingService } from '../../core/services/tracking.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';
import { deliveryStatusLabel } from './order-tracking.helpers';

@Component({
  selector: 'app-order-tracking-page',
  imports: [DatePipe, RouterLink, ButtonComponent, CardComponent, StatePanelComponent],
  templateUrl: './order-tracking-page.component.html',
  styleUrl: './order-tracking-page.component.css',
})
export class OrderTrackingPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly trackingService = inject(TrackingService);

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly orderId = signal('');
  protected readonly tracking = signal<OrderTrackingDto | null>(null);

  protected readonly timeline = computed<TrackingTimelineEvent[]>(
    () => this.tracking()?.timeline ?? [],
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.orderId.set(id);
    this.load();
  }

  protected load(): void {
    const id = this.orderId();
    if (!id) {
      this.loading.set(false);
      this.error.set('رقم الطلب غير صالح.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.trackingService
      .getOrderTracking(id)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (tracking) => this.tracking.set(tracking),
        error: (err) => {
          this.tracking.set(null);
          const message =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : 'تعذر تحميل تتبع الطلب. حاول مجددًا.';
          this.error.set(message);
        },
      });
  }

  protected statusLabel(status: string): string {
    return deliveryStatusLabel(status);
  }
}
