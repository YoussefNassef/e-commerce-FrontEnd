import { FormControl, FormGroup } from '@angular/forms';
import { trackingNumberRequiredForShippingValidator } from './admin-tracking.validators';

describe('trackingNumberRequiredForShippingValidator', () => {
  it('returns error when status is shipped and tracking number is missing', () => {
    const form = new FormGroup(
      {
        deliveryStatus: new FormControl('shipped'),
        trackingNumber: new FormControl(''),
      },
      { validators: [trackingNumberRequiredForShippingValidator] },
    );

    expect(form.errors).toEqual({ trackingNumberRequiredForShipping: true });
  });

  it('returns null when status is shipped and tracking number exists', () => {
    const form = new FormGroup(
      {
        deliveryStatus: new FormControl('shipped'),
        trackingNumber: new FormControl('TRK-123'),
      },
      { validators: [trackingNumberRequiredForShippingValidator] },
    );

    expect(form.errors).toBeNull();
  });

  it('returns null when status does not require tracking number', () => {
    const form = new FormGroup(
      {
        deliveryStatus: new FormControl('processing'),
        trackingNumber: new FormControl(''),
      },
      { validators: [trackingNumberRequiredForShippingValidator] },
    );

    expect(form.errors).toBeNull();
  });
});
