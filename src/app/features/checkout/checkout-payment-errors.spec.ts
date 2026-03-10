import { mapCheckoutPaymentError } from './checkout-payment-errors';

describe('mapCheckoutPaymentError', () => {
  it('maps missing idempotency header error to friendly Arabic', () => {
    const result = mapCheckoutPaymentError({
      error: { message: 'idempotency-key header is required' }
    });

    expect(result.message).toBe('تعذر بدء عملية الدفع بسبب مشكلة تقنية. حاول مرة أخرى.');
    expect(result.shouldResetAttemptKey).toBeFalsy();
  });

  it('maps key reused for another order and requests attempt reset', () => {
    const result = mapCheckoutPaymentError({
      error: { message: 'idempotency key was already used for another order' }
    });

    expect(result.message).toContain('تم إنشاء محاولة جديدة');
    expect(result.shouldResetAttemptKey).toBeTruthy();
  });
});
