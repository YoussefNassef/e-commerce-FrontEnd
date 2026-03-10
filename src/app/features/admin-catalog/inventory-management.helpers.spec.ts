import { hasCommercialChanges, isValidDelta, mapStockAdjustmentError, stockReasonLabel } from './inventory-management.helpers';

describe('inventory management helpers', () => {
  describe('isValidDelta', () => {
    it('accepts non-zero integers only', () => {
      expect(isValidDelta(5)).toBeTruthy();
      expect(isValidDelta(-3)).toBeTruthy();
      expect(isValidDelta(0)).toBeFalsy();
      expect(isValidDelta(1.5)).toBeFalsy();
      expect(isValidDelta('3')).toBeTruthy();
    });
  });

  describe('hasCommercialChanges', () => {
    it('requires at least one changed field', () => {
      const initial = { name: 'Laptop X', price: 1000 };
      expect(hasCommercialChanges({ name: 'Laptop X', price: 1000 }, initial)).toBeFalsy();
      expect(hasCommercialChanges({ name: 'Laptop Y' }, initial)).toBeTruthy();
      expect(hasCommercialChanges({ price: 1200 }, initial)).toBeTruthy();
    });
  });

  describe('stockReasonLabel', () => {
    it('maps reason keys to Arabic labels', () => {
      expect(stockReasonLabel('restock')).toBe('إعادة تخزين');
      expect(stockReasonLabel('damage')).toBe('تلف');
      expect(stockReasonLabel('return')).toBe('مرتجع');
      expect(stockReasonLabel('cycle_count')).toBe('جرد دوري');
      expect(stockReasonLabel('manual')).toBe('تعديل يدوي');
    });
  });

  describe('mapStockAdjustmentError', () => {
    it('maps stock underflow backend error to Arabic message', () => {
      const error = { error: { message: 'Final stock cannot go below 0' } };
      expect(mapStockAdjustmentError(error)).toBe('لا يمكن خصم كمية أكبر من المخزون المتاح');
    });
  });
});
