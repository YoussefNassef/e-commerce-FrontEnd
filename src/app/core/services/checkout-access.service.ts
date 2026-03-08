import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class CheckoutAccessService {
  private readonly allowCheckout = signal(false);

  allowOnce(): void {
    this.allowCheckout.set(true);
  }

  consume(): boolean {
    const allowed = this.allowCheckout();
    this.allowCheckout.set(false);
    return allowed;
  }
}

