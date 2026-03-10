export interface CheckoutPaymentErrorMapping {
  message: string;
  shouldResetAttemptKey: boolean;
}

export function mapCheckoutPaymentError(err: unknown): CheckoutPaymentErrorMapping {
  const serverMessage = extractServerMessage(err);
  const normalized = serverMessage.toLowerCase();

  if (
    normalized.includes('idempotency') &&
    (normalized.includes('missing') || normalized.includes('required') || normalized.includes('invalid'))
  ) {
    return {
      message: 'تعذر بدء عملية الدفع بسبب مشكلة تقنية. حاول مرة أخرى.',
      shouldResetAttemptKey: false
    };
  }

  if (
    normalized.includes('idempotency') &&
    (normalized.includes('another order') || normalized.includes('different order') || normalized.includes('other order'))
  ) {
    return {
      message: 'مفتاح محاولة الدفع مرتبط بطلب آخر. تم إنشاء محاولة جديدة، أعد المحاولة.',
      shouldResetAttemptKey: true
    };
  }

  if (
    normalized.includes('english letters only') ||
    normalized.includes('should be english letters only')
  ) {
    return {
      message: 'اسم حامل البطاقة يجب أن يكون بالإنجليزية فقط (A-Z).',
      shouldResetAttemptKey: false
    };
  }

  if (normalized.includes('order reservation expired')) {
    return {
      message: 'انتهت مهلة هذا الطلب. أنشئ طلبًا جديدًا أو أعد المحاولة.',
      shouldResetAttemptKey: false
    };
  }

  if (normalized.includes('order already paid')) {
    return {
      message: 'هذا الطلب مدفوع بالفعل.',
      shouldResetAttemptKey: false
    };
  }

  if (normalized.includes('payment is already being processed')) {
    return {
      message: 'يوجد طلب دفع قيد المعالجة لهذا الطلب. انتظر لحظة ثم حدّث الحالة.',
      shouldResetAttemptKey: false
    };
  }

  if (normalized.includes('order has no payable amount')) {
    return {
      message: 'قيمة الطلب غير صالحة للدفع. راجع الطلب ثم حاول مرة أخرى.',
      shouldResetAttemptKey: false
    };
  }

  if (normalized.includes('you are not allowed')) {
    return {
      message: 'لا يمكنك الدفع لهذا الطلب.',
      shouldResetAttemptKey: false
    };
  }

  return {
    message: serverMessage,
    shouldResetAttemptKey: false
  };
}

function extractServerMessage(err: unknown): string {
  const errorRecord =
    err && typeof err === 'object' ? (err as Record<string, unknown>) : {};
  const response =
    errorRecord['error'] && typeof errorRecord['error'] === 'object'
      ? (errorRecord['error'] as Record<string, unknown>)
      : {};

  const messageValue = response['message'];
  if (typeof messageValue === 'string') {
    return messageValue;
  }
  if (Array.isArray(messageValue)) {
    return messageValue.join(', ');
  }
  return '';
}
