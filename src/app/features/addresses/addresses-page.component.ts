import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { Address } from '../../core/models/api.models';
import { AddressesService, CreateAddressPayload } from '../../core/services/addresses.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';
import { LoadingSpinnerComponent } from '../../shared/ui/loading-spinner/loading-spinner.component';
import { StatePanelComponent } from '../../shared/ui/state-panel/state-panel.component';

@Component({
  selector: 'app-addresses-page',
  imports: [ReactiveFormsModule, ButtonComponent, CardComponent, LoadingSpinnerComponent, StatePanelComponent],
  templateUrl: './addresses-page.component.html',
  styleUrl: './addresses-page.component.css'
})
export class AddressesPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly addressesService = inject(AddressesService);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly deletingAddressId = signal<string | null>(null);
  protected readonly defaultingAddressId = signal<string | null>(null);
  protected readonly editingAddressId = signal<string | null>(null);
  protected readonly addresses = signal<Address[]>([]);
  protected readonly notice = signal('');
  protected readonly error = signal('');

  protected readonly form = this.fb.nonNullable.group({
    label: ['', [Validators.required, Validators.minLength(2)]],
    recipientName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.minLength(8)]],
    line1: ['', [Validators.required, Validators.minLength(3)]],
    line2: [''],
    city: ['', [Validators.required, Validators.minLength(2)]],
    state: [''],
    postalCode: [''],
    country: ['Saudi Arabia', [Validators.required, Validators.minLength(2)]]
  });

  constructor() {
    this.loadAddresses();
  }

  protected loadAddresses(): void {
    this.loading.set(true);
    this.error.set('');

    this.addressesService
      .getAddresses()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (addresses) => this.addresses.set(addresses),
        error: (err) => {
          this.error.set(this.extractServerMessage(err) || 'تعذر تحميل العناوين.');
        }
      });
  }

  protected saveAddress(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value = this.form.getRawValue();
    const payload: CreateAddressPayload = {
      label: value.label.trim(),
      recipientName: value.recipientName.trim(),
      phone: value.phone.trim(),
      line1: value.line1.trim(),
      line2: value.line2.trim() || null,
      city: value.city.trim(),
      state: value.state.trim() || null,
      postalCode: value.postalCode.trim() || null,
      country: value.country.trim()
    };

    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    const editingId = this.editingAddressId();
    const request$ = editingId
      ? this.addressesService.updateAddress(editingId, payload)
      : this.addressesService.createAddress(payload);

    request$
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.notice.set(editingId ? 'تم تحديث العنوان بنجاح.' : 'تم إضافة العنوان بنجاح.');
          this.cancelEdit();
          this.loadAddresses();
        },
        error: (err) => {
          this.error.set(this.extractServerMessage(err) || (editingId ? 'تعذر تحديث العنوان.' : 'تعذر إضافة العنوان.'));
        }
      });
  }

  protected startEdit(address: Address): void {
    this.editingAddressId.set(address.id);
    this.error.set('');
    this.notice.set('');
    this.form.setValue({
      label: address.label,
      recipientName: address.recipientName,
      phone: address.phone,
      line1: address.line1,
      line2: address.line2 ?? '',
      city: address.city,
      state: address.state ?? '',
      postalCode: address.postalCode ?? '',
      country: address.country
    });
  }

  protected cancelEdit(): void {
    this.editingAddressId.set(null);
    this.form.reset({
      label: '',
      recipientName: '',
      phone: '',
      line1: '',
      line2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'Saudi Arabia'
    });
  }

  protected removeAddress(address: Address): void {
    this.deletingAddressId.set(address.id);
    this.error.set('');
    this.notice.set('');

    this.addressesService
      .deleteAddress(address.id)
      .pipe(finalize(() => this.deletingAddressId.set(null)))
      .subscribe({
        next: () => {
          this.addresses.update((items) => items.filter((item) => item.id !== address.id));
          if (this.editingAddressId() === address.id) {
            this.cancelEdit();
          }
          this.notice.set('تم حذف العنوان.');
        },
        error: (err) => {
          this.error.set(this.extractServerMessage(err) || 'تعذر حذف العنوان.');
        }
      });
  }

  protected setAsDefault(address: Address): void {
    if (address.isDefault) {
      return;
    }

    this.defaultingAddressId.set(address.id);
    this.error.set('');
    this.notice.set('');

    this.addressesService
      .setDefaultAddress(address.id)
      .pipe(finalize(() => this.defaultingAddressId.set(null)))
      .subscribe({
        next: () => {
          this.addresses.update((items) =>
            items.map((item) => ({
              ...item,
              isDefault: item.id === address.id
            }))
          );
          this.notice.set('تم تعيين العنوان كافتراضي.');
        },
        error: (err) => {
          this.error.set(this.extractServerMessage(err) || 'تعذر تعيين العنوان الافتراضي.');
        }
      });
  }

  private extractServerMessage(err: unknown): string {
    const response = (err as { error?: Record<string, unknown> } | null)?.error;
    if (!response || typeof response !== 'object') {
      return '';
    }
    const message = response['message'];
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
    if (Array.isArray(message)) {
      return message
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join(' | ');
    }
    return '';
  }
}
