import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-auth-page',
  imports: [ReactiveFormsModule],
  templateUrl: './auth-page.component.html',
  styleUrl: './auth-page.component.css',
})
export class AuthPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private pendingRegisterPhone = '';

  protected readonly mode = signal<'signin' | 'register'>('signin');
  protected readonly stage = signal<'phone' | 'otp' | 'register-otp'>('phone');
  protected readonly loading = signal(false);
  protected readonly message = signal('');
  protected readonly error = signal('');

  protected readonly registerForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern(/^9665\d{8}$/)]],
  });

  protected readonly signInForm = this.fb.group({
    phone: ['', [Validators.required, Validators.pattern(/^9665\d{8}$/)]],
  });

  protected readonly otpForm = this.fb.group({
    code: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
  });

  protected setMode(mode: 'signin' | 'register'): void {
    this.mode.set(mode);
    this.stage.set('phone');
    this.pendingRegisterPhone = '';
    this.error.set('');
    this.message.set('');
    this.otpForm.reset();
  }

  protected submitRegister(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.message.set('');

    this.auth
      .register(this.registerForm.getRawValue() as { fullName: string; phone: string })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.pendingRegisterPhone = this.registerForm.value.phone ?? '';
          this.message.set('تم إنشاء الحساب. أدخل رمز التفعيل المرسل إلى الجوال لإتمام التفعيل.');
          this.stage.set('register-otp');
          this.otpForm.reset();
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'تعذر إنشاء الحساب.');
        },
      });
  }

  protected submitSignIn(): void {
    if (this.signInForm.invalid) {
      this.signInForm.markAllAsTouched();
      return;
    }

    const phone = this.signInForm.value.phone ?? '';

    this.loading.set(true);
    this.error.set('');
    this.message.set('');

    this.auth
      .signIn(phone)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.stage.set('otp');
          this.message.set('تم إرسال رمز OTP بنجاح.');
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'تعذر إرسال رمز OTP.');
        },
      });
  }

  protected verifyOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    const phone = this.signInForm.value.phone ?? '';
    const code = this.otpForm.value.code ?? '';

    this.loading.set(true);
    this.error.set('');

    this.auth
      .verifyOtp(phone, code)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          const redirectUrl = this.route.snapshot.queryParamMap.get('redirect')?.trim();
          this.router.navigateByUrl(redirectUrl || '/products');
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'فشل التحقق من رمز OTP.');
        },
      });
  }

  protected verifyRegisterOtp(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    if (!this.pendingRegisterPhone) {
      this.error.set('أعد إنشاء الحساب أولًا.');
      return;
    }

    const code = this.otpForm.value.code ?? '';

    this.loading.set(true);
    this.error.set('');

    this.auth
      .verifyOtpCode(this.pendingRegisterPhone, code)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => {
          this.signInForm.patchValue({ phone: this.pendingRegisterPhone });
          this.pendingRegisterPhone = '';
          this.mode.set('signin');
          this.stage.set('phone');
          this.otpForm.reset();
          this.message.set('تم تفعيل الحساب بنجاح. يمكنك الآن تسجيل الدخول.');
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'فشل تفعيل الحساب.');
        },
      });
  }
}
