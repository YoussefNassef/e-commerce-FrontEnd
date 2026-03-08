import { AbstractControl, ValidationErrors } from '@angular/forms';

export function trackingNumberRequiredForShippingValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value =
    control && typeof control.value === 'object' && control.value
      ? (control.value as Record<string, unknown>)
      : {};

  const deliveryStatus = String(value['deliveryStatus'] ?? '')
    .toLowerCase()
    .trim();
  const trackingNumber = String(value['trackingNumber'] ?? '').trim();

  if (
    (deliveryStatus === 'shipped' || deliveryStatus === 'out_for_delivery') &&
    !trackingNumber
  ) {
    return { trackingNumberRequiredForShipping: true };
  }

  return null;
}
