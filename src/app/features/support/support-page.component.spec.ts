import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { SupportService } from '../../core/services/support.service';
import { SupportStreamService } from '../../core/services/support-stream.service';
import { SupportPageComponent } from './support-page.component';

describe('SupportPageComponent', () => {
  let fixture: ComponentFixture<SupportPageComponent>;
  let component: SupportPageComponent;

  const streamEvents$ = new Subject<{
    scope: 'customer' | 'admin';
    event: string;
    ticketId: string | null;
    payload: Record<string, unknown> | null;
    rawData: string;
  }>();
  const connectedState$ = new BehaviorSubject({ customer: true, admin: false });

  const supportServiceMock = {
    getMyTickets: vi.fn(),
    getMyUnreadCount: vi.fn(),
    getMyTicketDetails: vi.fn(),
    createTicket: vi.fn(),
    addMyMessage: vi.fn(),
    closeMyTicket: vi.fn(),
    reopenMyTicket: vi.fn()
  } as unknown as SupportService;

  const streamServiceMock = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    connectedState$: connectedState$.asObservable(),
    events$: streamEvents$.asObservable()
  } as unknown as SupportStreamService;

  const authServiceMock = {
    authHeaderValue: vi.fn(),
    refreshAccessToken: vi.fn()
  } as unknown as AuthService;

  beforeEach(async () => {
    (supportServiceMock.getMyTickets as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      of({
        items: [
          {
            id: 't-1',
            userId: 1,
            userName: 'User',
            unreadCount: 2,
            orderId: null,
            subject: 'Ticket',
            status: 'open',
            priority: 'normal',
            category: 'other',
            assignedAdminUserId: null,
            lastMessageAt: null,
            closedAt: null,
            createdAt: '2026-03-11T00:00:00.000Z',
            updatedAt: '2026-03-11T00:00:00.000Z'
          }
        ],
        meta: { page: 1, limit: 50, totalItems: 1, totalPages: 1 }
      })
    );

    let unreadCall = 0;
    (supportServiceMock.getMyUnreadCount as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      unreadCall += 1;
      return of(unreadCall >= 2 ? 1 : 3);
    });

    (supportServiceMock.getMyTicketDetails as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      of({
        id: 't-1',
        userId: 1,
        userName: 'User',
        unreadCount: 0,
        orderId: null,
        subject: 'Ticket',
        status: 'open',
        priority: 'normal',
        category: 'other',
        assignedAdminUserId: null,
        lastMessageAt: null,
        closedAt: null,
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:00.000Z',
        messages: []
      })
    );

    (authServiceMock.authHeaderValue as unknown as ReturnType<typeof vi.fn>).mockReturnValue('Bearer test-token');
    (authServiceMock.refreshAccessToken as unknown as ReturnType<typeof vi.fn>).mockReturnValue(of(void 0));

    await TestBed.configureTestingModule({
      imports: [SupportPageComponent],
      providers: [
        { provide: SupportService, useValue: supportServiceMock },
        { provide: SupportStreamService, useValue: streamServiceMock },
        { provide: AuthService, useValue: authServiceMock },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({}))
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SupportPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refreshes unread counter after opening ticket details', () => {
    const unreadSpy = supportServiceMock.getMyUnreadCount as unknown as ReturnType<typeof vi.fn>;
    const callsBeforeOpen = unreadSpy.mock.calls.length;

    (component as unknown as { openTicket: (id: string) => void }).openTicket('t-1');

    expect(supportServiceMock.getMyTicketDetails).toHaveBeenCalledWith('t-1');
    expect(unreadSpy.mock.calls.length).toBe(callsBeforeOpen + 1);
    expect(component['unreadCount']()).toBe(1);
  });
});
