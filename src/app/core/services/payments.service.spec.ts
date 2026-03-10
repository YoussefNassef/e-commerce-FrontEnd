import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('payment_attempts_v1');
    sessionStorage.removeItem('payment_attempts_v1');

    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });

    service = TestBed.inject(PaymentsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.removeItem('payment_attempts_v1');
    sessionStorage.removeItem('payment_attempts_v1');
  });

  it('generates and reuses idempotency key for the same order attempt', () => {
    let firstKey = '';

    service
      .createPayment({
        orderId: 'order-1',
        name: 'JOHN DOE',
        number: '4111111111111111',
        month: 12,
        year: 2030,
        cvc: '123'
      })
      .subscribe({ error: () => undefined });

    const firstReq = httpMock.expectOne((r) => r.url.endsWith('/payments/moyasar'));
    firstKey = firstReq.request.headers.get('idempotency-key') ?? '';
    expect(firstKey.startsWith('pay:order-1:')).toBeTruthy();
    firstReq.flush({ message: 'network issue' }, { status: 500, statusText: 'Server Error' });

    service
      .createPayment({
        orderId: 'order-1',
        name: 'JOHN DOE',
        number: '4111111111111111',
        month: 12,
        year: 2030,
        cvc: '123'
      })
      .subscribe({ error: () => undefined });

    const retryReq = httpMock.expectOne((r) => r.url.endsWith('/payments/moyasar'));
    const retryKey = retryReq.request.headers.get('idempotency-key') ?? '';
    expect(retryKey).toBe(firstKey);
    retryReq.flush({ message: 'still failing' }, { status: 500, statusText: 'Server Error' });
  });

  it('sends only one in-flight request for duplicate clicks on the same order', () => {
    service
      .createPayment({
        orderId: 'order-2',
        name: 'JOHN DOE',
        number: '4111111111111111',
        month: 12,
        year: 2030,
        cvc: '123'
      })
      .subscribe();

    service
      .createPayment({
        orderId: 'order-2',
        name: 'JOHN DOE',
        number: '4111111111111111',
        month: 12,
        year: 2030,
        cvc: '123'
      })
      .subscribe();

    const requests = httpMock.match((r) => r.url.endsWith('/payments/moyasar'));
    expect(requests.length).toBe(1);
    requests[0].flush({ status: 'initiated', redirectUrl: 'https://pay.local/test' });
  });

  it('clears attempt key when payment succeeds and when order is cancelled', () => {
    service
      .createPayment({
        orderId: 'order-3',
        name: 'JOHN DOE',
        number: '4111111111111111',
        month: 12,
        year: 2030,
        cvc: '123'
      })
      .subscribe();

    const firstReq = httpMock.expectOne((r) => r.url.endsWith('/payments/moyasar'));
    const keyBeforePaid = firstReq.request.headers.get('idempotency-key') ?? '';
    firstReq.flush({ status: 'paid' });

    service
      .createPayment({
        orderId: 'order-3',
        name: 'JOHN DOE',
        number: '4111111111111111',
        month: 12,
        year: 2030,
        cvc: '123'
      })
      .subscribe();

    const secondReq = httpMock.expectOne((r) => r.url.endsWith('/payments/moyasar'));
    const keyAfterPaid = secondReq.request.headers.get('idempotency-key') ?? '';
    expect(keyAfterPaid).not.toBe(keyBeforePaid);
    secondReq.flush({ status: 'initiated' });

    const keyBeforeCancel = service.getOrCreateAttemptKey('order-4');
    service.handleOrderStatusChange('order-4', 'cancelled');
    const keyAfterCancel = service.getOrCreateAttemptKey('order-4');
    expect(keyAfterCancel).not.toBe(keyBeforeCancel);
  });
});
