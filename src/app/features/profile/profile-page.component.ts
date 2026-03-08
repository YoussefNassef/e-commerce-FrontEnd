import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';
import { ButtonComponent } from '../../shared/ui/button/button.component';
import { CardComponent } from '../../shared/ui/card/card.component';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, ButtonComponent, CardComponent],
  templateUrl: './profile-page.component.html',
  styleUrl: './profile-page.component.css'
})
export class ProfilePageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  protected readonly userName = this.auth.userName;
  protected readonly userPhone = this.auth.userPhone;

  protected readonly saving = signal(false);
  protected readonly requestingPhoneOtp = signal(false);
  protected readonly verifyingPhoneOtp = signal(false);
  protected readonly pendingPhone = signal('');
  protected readonly notice = signal('');
  protected readonly error = signal('');

  protected readonly profileForm = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]]
  });

  protected readonly phoneRequestForm = this.fb.nonNullable.group({
    phone: ['', [Validators.required, Validators.pattern(/^9665\d{8}$/)]]
  });

  protected readonly phoneVerifyForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
  });

  constructor() {
    const user = this.auth.user();
    this.profileForm.setValue({
      fullName: user?.fullName ?? ''
    });
    this.phoneRequestForm.setValue({
      phone: user?.phone ?? ''
    });
  }

  protected saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set('');
    this.notice.set('');

    const value = this.profileForm.getRawValue();
    this.auth
      .updateProfile({
        fullName: value.fullName,
        phone: this.auth.userPhone()
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.notice.set('تم تحديث الملف الشخصي بنجاح.');
        },
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';
          this.error.set(serverMessage || `تعذر تحديث الملف الشخصي (status ${err?.status ?? 'unknown'}).`);
        }
      });
  }

  protected requestPhoneChangeOtp(): void {
    if (this.phoneRequestForm.invalid) {
      this.phoneRequestForm.markAllAsTouched();
      return;
    }

    this.requestingPhoneOtp.set(true);
    this.error.set('');
    this.notice.set('');
    const phone = this.phoneRequestForm.controls.phone.value;

    this.auth
      .requestPhoneChange(phone)
      .pipe(finalize(() => this.requestingPhoneOtp.set(false)))
      .subscribe({
        next: (res) => {
          this.pendingPhone.set(phone);
          this.notice.set(res?.message || 'تم إرسال رمز OTP إلى رقم الجوال الجديد.');
          this.phoneVerifyForm.reset({ code: '' });
        },
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';
          this.error.set(serverMessage || `تعذر طلب تغيير رقم الجوال (status ${err?.status ?? 'unknown'}).`);
        }
      });
  }

  protected verifyPhoneChangeOtp(): void {
    if (!this.pendingPhone()) {
      this.error.set('اطلب رمز OTP أولًا.');
      return;
    }

    if (this.phoneVerifyForm.invalid) {
      this.phoneVerifyForm.markAllAsTouched();
      return;
    }

    this.verifyingPhoneOtp.set(true);
    this.error.set('');
    this.notice.set('');
    const code = this.phoneVerifyForm.controls.code.value;

    this.auth
      .verifyPhoneChange({
        phone: this.pendingPhone(),
        code
      })
      .pipe(finalize(() => this.verifyingPhoneOtp.set(false)))
      .subscribe({
        next: () => {
          this.notice.set('تم تحديث رقم الجوال بنجاح.');
          this.pendingPhone.set('');
          this.phoneVerifyForm.reset({ code: '' });
          this.phoneRequestForm.patchValue({ phone: this.auth.userPhone() });
        },
        error: (err) => {
          const serverMessage =
            typeof err?.error?.message === 'string'
              ? err.error.message
              : Array.isArray(err?.error?.message)
                ? err.error.message.join(', ')
                : '';
          this.error.set(serverMessage || `تعذر التحقق من OTP (status ${err?.status ?? 'unknown'}).`);
        }
      });
  }
}
