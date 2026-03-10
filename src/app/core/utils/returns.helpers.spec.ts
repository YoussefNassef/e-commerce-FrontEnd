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
    expect(canCustomerCancelReturn('requested')).toBeTruthy();
    expect(canCustomerCancelReturn('approved')).toBeFalsy();
    expect(canCustomerCancelReturn('rejected')).toBeFalsy();
    expect(canCustomerCancelReturn('refund_initiated')).toBeFalsy();
    expect(canCustomerCancelReturn('refunded')).toBeFalsy();
    expect(canCustomerCancelReturn('cancelled')).toBeFalsy();
  });

  it('returns valid admin next statuses only', () => {
    expect(getAllowedNextAdminStatuses('requested').includes('approved')).toBeTruthy();
    expect(getAllowedNextAdminStatuses('requested').includes('refunded')).toBeFalsy();
    expect(getAllowedNextAdminStatuses('approved')).toEqual(['refund_initiated']);
  });
});
