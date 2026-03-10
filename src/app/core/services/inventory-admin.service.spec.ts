import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { InventoryReconciliationResponse } from '../models/inventory.models';
import { environment } from '../models/environment';
import { InventoryAdminService } from './inventory-admin.service';

describe('InventoryAdminService', () => {
  let service: InventoryAdminService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(InventoryAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('parses reconciliation anomalies with optional expectedReservedStock/difference', () => {
    let result: InventoryReconciliationResponse | null = null;

    service.runInventoryReconciliation().subscribe((res) => (result = res));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/products/inventory/reconciliation?notify=false&forceNotify=false`);
    expect(req.request.method).toBe('GET');
    req.flush({
      checkedProducts: 2,
      anomaliesCount: 2,
      generatedAt: '2026-03-10T00:00:00.000Z',
      anomalies: [
        {
          type: 'reserved_stock_mismatch',
          productId: 'p1',
          productName: 'Product A',
          sku: 'SKU-A',
          stock: 10,
          reservedStock: 4,
          expectedReservedStock: 2,
          difference: 2
        },
        {
          type: 'negative_stock',
          productId: 'p2',
          productName: 'Product B',
          sku: 'SKU-B',
          stock: -1,
          reservedStock: 0
        }
      ],
      notificationsCreated: 0,
      notificationSkippedByCooldown: false
    });

    expect(result).not.toBeNull();
    if (!result) {
      throw new Error('Expected reconciliation result to be defined');
    }
    const parsed: InventoryReconciliationResponse = result;
    expect(parsed.anomalies[0].expectedReservedStock).toBe(2);
    expect(parsed.anomalies[0].difference).toBe(2);
    expect(parsed.anomalies[1].expectedReservedStock).toBeNull();
    expect(parsed.anomalies[1].difference).toBeNull();
  });
});
