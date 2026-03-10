import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { AdminOrdersService } from '../../core/services/admin-orders.service';
import { AdminService } from '../../core/services/admin.service';
import { OrdersService } from '../../core/services/orders.service';
import { PaymentsService } from '../../core/services/payments.service';
import { TrackingService } from '../../core/services/tracking.service';
import { AdminOrdersPageComponent } from './admin-orders-page.component';

describe('AdminOrdersPageComponent', () => {
  const bulkSubject = new Subject<{
    total: number;
    successCount: number;
    failureCount: number;
    successes: string[];
    failures: Array<{ orderId: string; message: string }>;
  }>();

  const adminServiceMock = {
    getOverview: () =>
      of({
        recentOrders: []
      })
  };

  const adminOrdersServiceMock = {
    addOrderAdminNote: () => of({}),
    runOrderAdminAction: () => of({}),
    getOrderAdminAudit: () =>
      of({
        items: [],
        meta: { page: 1, limit: 10, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false }
      }),
    runBulkOrderAdminAction: () => bulkSubject.asObservable()
  };

  const ordersServiceMock = {
    getOrderById: () => of(null)
  };

  const trackingServiceMock = {
    getOrderTracking: () => of(null)
  };

  const paymentsServiceMock = {
    reconcilePayments: () => of({ scanned: 0, paid: 0, failed: 0, unchanged: 0, errors: 0 })
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminOrdersPageComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: AdminService, useValue: adminServiceMock },
        { provide: AdminOrdersService, useValue: adminOrdersServiceMock },
        { provide: OrdersService, useValue: ordersServiceMock },
        { provide: TrackingService, useValue: trackingServiceMock },
        { provide: PaymentsService, useValue: paymentsServiceMock }
      ]
    }).compileComponents();
  });

  it('prevents duplicate bulk submit while in-flight', () => {
    const fixture = TestBed.createComponent(AdminOrdersPageComponent);
    const component = fixture.componentInstance as unknown as {
      selectedOrderIds: { set: (value: string[]) => void };
      bulkActionForm: { patchValue: (value: Record<string, unknown>) => void };
      runBulkAction: () => void;
      runningBulkAction: () => boolean;
    };
    const bulkSpy = vi.spyOn(adminOrdersServiceMock, 'runBulkOrderAdminAction');

    component.selectedOrderIds.set(['o-1', 'o-2']);
    component.bulkActionForm.patchValue({ action: 'cancel_order' });

    component.runBulkAction();
    component.runBulkAction();

    expect(component.runningBulkAction()).toBeTruthy();
    expect(bulkSpy).toHaveBeenCalledTimes(1);

    bulkSubject.next({
      total: 2,
      successCount: 2,
      failureCount: 0,
      successes: ['o-1', 'o-2'],
      failures: []
    });
    bulkSubject.complete();

    expect(component.runningBulkAction()).toBeFalsy();
  });
});
