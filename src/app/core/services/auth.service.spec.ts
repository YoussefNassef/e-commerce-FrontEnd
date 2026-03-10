import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('verifyOtp uses withCredentials and authenticates user session', () => {
    service.verifyOtp('966512345678', '123456').subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/auth/verify-otp'));
    expect(req.request.withCredentials).toBeTruthy();
    req.flush({});

    const meReq = httpMock.expectOne((r) => r.url.endsWith('/users/me'));
    meReq.flush({
      data: {
        id: 1,
        fullName: 'Test User',
        phone: '966512345678',
        role: 'user',
        isVerified: true
      }
    });

    expect(service.isAuthenticated()).toBeTruthy();
  });

  it('logout calls backend withCredentials and clears auth state', () => {
    service.verifyOtp('966512345678', '123456').subscribe();

    const otpReq = httpMock.expectOne((r) => r.url.endsWith('/auth/verify-otp'));
    otpReq.flush({});
    const meReq = httpMock.expectOne((r) => r.url.endsWith('/users/me'));
    meReq.flush({
      data: {
        id: 1,
        fullName: 'Test User',
        phone: '966512345678',
        role: 'user',
        isVerified: true
      }
    });

    expect(service.isAuthenticated()).toBeTruthy();

    service.logout().subscribe();

    const req = httpMock.expectOne((r) => r.url.endsWith('/auth/logout'));
    expect(req.request.withCredentials).toBeTruthy();
    req.flush({});

    expect(service.token()).toBeNull();
    expect(service.isAuthenticated()).toBeFalsy();
  });
});
