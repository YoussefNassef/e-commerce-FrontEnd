import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { NotificationsService } from './core/services/notifications.service';
import { App } from './app';

describe('App', () => {
  const authStub = {
    isAuthenticated: () => false,
    ensureAuthReady: () => of(true),
    ensureCsrfCookie: () => of({ csrfToken: 'test' }),
    bootstrapSession: () => of(true),
    logout: () => of(void 0),
    user: () => null,
    userName: () => '',
    userPhone: () => ''
  };

  const notificationsStub = {
    getUnreadCount: () => of(0),
    getNotifications: () => of({ items: [], meta: { page: 1, limit: 6, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false } }),
    markAsRead: () => of(null)
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: NotificationsService, useValue: notificationsStub }
      ]
    }).compileComponents();

    localStorage.clear();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render brand', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.biz-brand strong')?.textContent).toContain('متجر الأجهزة');
  });
});
