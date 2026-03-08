import {
  canCustomerCancelReturn,
  getAllowedNextAdminStatuses,
} from './returns.helpers';

describe('returns.helpers', () => {
  it('enforces status transitions helper', () => {
    expect(getAllowedNextAdminStatuses('requested')).toEqual([
      'approved',
      'rejected',
      'cancelled',
    ]);
    expect(getAllowedNextAdminStatuses('approved')).toEqual([
      'refund_initiated',
    ]);
    expect(getAllowedNextAdminStatuses('refund_initiated')).toEqual([
      'refunded',
    ]);
    expect(getAllowedNextAdminStatuses('rejected')).toEqual([]);
    expect(getAllowedNextAdminStatuses('refunded')).toEqual([]);
    expect(getAllowedNextAdminStatuses('cancelled')).toEqual([]);
  });

  it('handles customer cancel visibility logic', () => {
    expect(canCustomerCancelReturn('requested')).toBeTrue();
    expect(canCustomerCancelReturn('approved')).toBeFalse();
    expect(canCustomerCancelReturn('rejected')).toBeFalse();
    expect(canCustomerCancelReturn('refund_initiated')).toBeFalse();
    expect(canCustomerCancelReturn('refunded')).toBeFalse();
    expect(canCustomerCancelReturn('cancelled')).toBeFalse();
  });

  it('returns valid admin next statuses only', () => {
    expect(getAllowedNextAdminStatuses('requested').includes('approved')).toBeTrue();
    expect(getAllowedNextAdminStatuses('requested').includes('refunded')).toBeFalse();
    expect(getAllowedNextAdminStatuses('approved')).toEqual(['refund_initiated']);
  });
});
