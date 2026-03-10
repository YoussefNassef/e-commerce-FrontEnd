import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import {
  InventoryMovementReportResponse,
  InventoryReconciliationFixResponse,
  InventoryReconciliationResponse,
  LowStockAlertTriggerResponse
} from '../../core/models/inventory.models';
import { InventoryAdminService } from '../../core/services/inventory-admin.service';
import { AdminInventoryPageComponent } from './admin-inventory-page.component';

function createReport(): InventoryMovementReportResponse {
  return {
    days: 30,
    startDate: '2026-02-10',
    endDate: '2026-03-10',
    totals: { inMovement: 12, outMovement: 6, netMovement: 6, adjustmentsCount: 3 },
    series: [{ date: '2026-03-10', inMovement: 4, outMovement: 1, netMovement: 3, adjustmentsCount: 1 }]
  };
}

describe('AdminInventoryPageComponent', () => {
  let checkerSubject: Subject<InventoryReconciliationResponse>;
  let dryRunSubject: Subject<InventoryReconciliationFixResponse>;
  let applyFixSubject: Subject<InventoryReconciliationFixResponse>;

  const serviceMock: Pick<
    InventoryAdminService,
    'getInventoryReport' | 'runInventoryReconciliation' | 'runInventoryReconciliationFix' | 'triggerLowStockAlerts'
  > = {
    getInventoryReport: () => of(createReport()),
    runInventoryReconciliation: () =>
      checkerSubject.asObservable(),
    runInventoryReconciliationFix: (dryRun = true) =>
      (dryRun ? dryRunSubject : applyFixSubject).asObservable(),
    triggerLowStockAlerts: () =>
      of({
        threshold: 5,
        totalLowStockProducts: 1,
        notificationsCreated: 1,
        skippedByCooldown: false
      } as LowStockAlertTriggerResponse)
  };

  beforeEach(async () => {
    checkerSubject = new Subject<InventoryReconciliationResponse>();
    dryRunSubject = new Subject<InventoryReconciliationFixResponse>();
    applyFixSubject = new Subject<InventoryReconciliationFixResponse>();

    await TestBed.configureTestingModule({
      imports: [AdminInventoryPageComponent],
      providers: [{ provide: InventoryAdminService, useValue: serviceMock }]
    }).compileComponents();
  });

  it('handles dryRun and apply fix state transitions', () => {
    const fixture = TestBed.createComponent(AdminInventoryPageComponent);
    const component = fixture.componentInstance as unknown as {
      runDryRunFix: () => void;
      openApplyConfirmation: () => void;
      confirmApplyFix: () => void;
      runningDryRun: () => boolean;
      applyingFix: () => boolean;
      confirmationOpen: () => boolean;
      fixResult: () => InventoryReconciliationFixResponse | null;
      reconciliation: () => InventoryReconciliationResponse | null;
    };

    component.runDryRunFix();
    expect(component.runningDryRun()).toBeTruthy();

    dryRunSubject.next({
      dryRun: true,
      generatedAt: '2026-03-10T00:00:00.000Z',
      fixedCount: 0,
      candidatesCount: 2,
      fixedItems: []
    });
    dryRunSubject.complete();
    expect(component.runningDryRun()).toBeFalsy();
    expect(component.fixResult()?.dryRun).toBeTruthy();

    component.openApplyConfirmation();
    expect(component.confirmationOpen()).toBeTruthy();

    component.confirmApplyFix();
    expect(component.applyingFix()).toBeTruthy();
    expect(component.confirmationOpen()).toBeFalsy();

    applyFixSubject.next({
      dryRun: false,
      generatedAt: '2026-03-10T00:00:00.000Z',
      fixedCount: 2,
      candidatesCount: 2,
      fixedItems: []
    });
    applyFixSubject.complete();

    checkerSubject.next({
      checkedProducts: 10,
      anomaliesCount: 0,
      generatedAt: '2026-03-10T00:00:00.000Z',
      anomalies: [],
      notificationsCreated: 0,
      notificationSkippedByCooldown: false
    });
    checkerSubject.complete();

    expect(component.applyingFix()).toBeFalsy();
    expect(component.reconciliation()?.anomaliesCount).toBe(0);
  });

  it('prevents duplicate checker request while in-flight', () => {
    const fixture = TestBed.createComponent(AdminInventoryPageComponent);
    const component = fixture.componentInstance as unknown as {
      runChecker: () => void;
      runningChecker: () => boolean;
      anyActionInFlight: () => boolean;
    };
    const checkerSpy = vi.spyOn(serviceMock, 'runInventoryReconciliation');

    component.runChecker();
    component.runChecker();

    expect(component.runningChecker()).toBeTruthy();
    expect(component.anyActionInFlight()).toBeTruthy();
    expect(checkerSpy).toHaveBeenCalledTimes(1);

    checkerSubject.next({
      checkedProducts: 1,
      anomaliesCount: 0,
      generatedAt: '2026-03-10T00:00:00.000Z',
      anomalies: [],
      notificationsCreated: 0,
      notificationSkippedByCooldown: false
    });
    checkerSubject.complete();

    expect(component.runningChecker()).toBeFalsy();
  });
});
