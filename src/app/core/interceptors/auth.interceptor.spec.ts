import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { environment } from '../models/environment';
import { AuthService } from '../services/auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let auth: AuthService;
  let navigateCalls: unknown[][];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    navigateCalls = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: Router,
          useValue: {
            navigate: (...args: unknown[]) => {
              navigateCalls.push(args);
              return Promise.resolve(true);
            }
          }
        },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('adds withCredentials to api requests', () => {
    http.get(`${environment.apiBaseUrl}/products`).subscribe();
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/products`);
    expect(req.request.withCredentials).toBeTruthy();
    req.flush({});
  });

  it('single 401 triggers one refresh and retries original request', () => {
    http.get(`${environment.apiBaseUrl}/orders`).subscribe();

    const firstReq = httpMock.expectOne(`${environment.apiBaseUrl}/orders`);
    firstReq.flush({}, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
    expect(refreshReq.request.withCredentials).toBeTruthy();
    refreshReq.flush({});

    const retriedReq = httpMock.expectOne(`${environment.apiBaseUrl}/orders`);
    expect(retriedReq.request.withCredentials).toBeTruthy();
    retriedReq.flush({ ok: true });
  });

  it('concurrent 401 requests share the same refresh call', () => {
    http.get(`${environment.apiBaseUrl}/products`).subscribe();
    http.get(`${environment.apiBaseUrl}/cart`).subscribe();

    const productsReq = httpMock.expectOne(`${environment.apiBaseUrl}/products`);
    const cartReq = httpMock.expectOne(`${environment.apiBaseUrl}/cart`);

    productsReq.flush({}, { status: 401, statusText: 'Unauthorized' });
    cartReq.flush({}, { status: 401, statusText: 'Unauthorized' });

    const refreshCalls = httpMock.match(`${environment.apiBaseUrl}/auth/refresh`);
    expect(refreshCalls.length).toBe(1);
    refreshCalls[0].flush({});

    const retriedProducts = httpMock.expectOne(`${environment.apiBaseUrl}/products`);
    const retriedCart = httpMock.expectOne(`${environment.apiBaseUrl}/cart`);
    expect(retriedProducts.request.withCredentials).toBeTruthy();
    expect(retriedCart.request.withCredentials).toBeTruthy();
    retriedProducts.flush({});
    retriedCart.flush({});
  });

  it('refresh failure clears auth state and navigates to /auth', () => {
    http.get(`${environment.apiBaseUrl}/profile`).subscribe({
      error: () => undefined
    });

    const protectedReq = httpMock.expectOne(`${environment.apiBaseUrl}/profile`);
    protectedReq.flush({}, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
    refreshReq.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBeFalsy();
    expect(navigateCalls.length > 0).toBeTruthy();
  });
});
