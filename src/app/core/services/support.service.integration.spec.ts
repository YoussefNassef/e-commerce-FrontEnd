import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../models/environment';
import { SupportService } from './support.service';

describe('SupportService integration flow', () => {
  let service: SupportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), SupportService]
    });
    service = TestBed.inject(SupportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('create ticket -> admin reply -> unread decreases after opening thread', async () => {
    const createPromise = firstValueFrom(
      service.createTicket({
        subject: 'Payment issue',
        message: 'Initial message',
        category: 'payment',
        priority: 'normal'
      })
    );

    const createReq = httpMock.expectOne(`${environment.apiBaseUrl}/support/tickets`);
    expect(createReq.request.method).toBe('POST');
    createReq.flush({
      success: true,
      statusCode: 201,
      message: 'created',
      timestamp: '2026-03-11T10:00:00.000Z',
      path: '/api/support/tickets',
      data: {
        id: 'ticket-1',
        userId: 10,
        subject: 'Payment issue',
        status: 'open',
        priority: 'normal',
        category: 'payment',
        unreadCount: 0,
        createdAt: '2026-03-11T10:00:00.000Z',
        updatedAt: '2026-03-11T10:00:00.000Z',
        messages: []
      }
    });

    const createdTicket = await createPromise;
    expect(createdTicket.id).toBe('ticket-1');

    const adminReplyPromise = firstValueFrom(service.addAdminMessage('ticket-1', { message: 'We are checking' }));
    const adminReplyReq = httpMock.expectOne(`${environment.apiBaseUrl}/admin/support/tickets/ticket-1/messages`);
    expect(adminReplyReq.request.method).toBe('POST');
    adminReplyReq.flush({
      success: true,
      statusCode: 201,
      message: 'sent',
      timestamp: '2026-03-11T10:05:00.000Z',
      path: '/api/admin/support/tickets/ticket-1/messages',
      data: {
        id: 'msg-1',
        ticketId: 'ticket-1',
        authorUserId: 1,
        authorRole: 'admin',
        message: 'We are checking',
        isInternal: false,
        createdAt: '2026-03-11T10:05:00.000Z'
      }
    });
    await adminReplyPromise;

    const unreadBeforePromise = firstValueFrom(service.getMyUnreadCount());
    const unreadBeforeReq = httpMock.expectOne(`${environment.apiBaseUrl}/support/tickets/unread-count`);
    unreadBeforeReq.flush({
      success: true,
      statusCode: 200,
      message: 'ok',
      timestamp: '2026-03-11T10:06:00.000Z',
      path: '/api/support/tickets/unread-count',
      data: { unreadCount: 1 }
    });
    expect(await unreadBeforePromise).toBe(1);

    const detailsPromise = firstValueFrom(service.getMyTicketDetails('ticket-1'));
    const detailsReq = httpMock.expectOne(`${environment.apiBaseUrl}/support/tickets/ticket-1`);
    detailsReq.flush({
      success: true,
      statusCode: 200,
      message: 'ok',
      timestamp: '2026-03-11T10:07:00.000Z',
      path: '/api/support/tickets/ticket-1',
      data: {
        id: 'ticket-1',
        userId: 10,
        subject: 'Payment issue',
        status: 'open',
        priority: 'normal',
        category: 'payment',
        unreadCount: 0,
        createdAt: '2026-03-11T10:00:00.000Z',
        updatedAt: '2026-03-11T10:07:00.000Z',
        messages: [
          {
            id: 'msg-1',
            ticketId: 'ticket-1',
            authorUserId: 1,
            authorRole: 'admin',
            message: 'We are checking',
            isInternal: false,
            createdAt: '2026-03-11T10:05:00.000Z'
          }
        ]
      }
    });
    const details = await detailsPromise;
    expect(details.id).toBe('ticket-1');

    const unreadAfterPromise = firstValueFrom(service.getMyUnreadCount());
    const unreadAfterReq = httpMock.expectOne(`${environment.apiBaseUrl}/support/tickets/unread-count`);
    unreadAfterReq.flush({
      success: true,
      statusCode: 200,
      message: 'ok',
      timestamp: '2026-03-11T10:08:00.000Z',
      path: '/api/support/tickets/unread-count',
      data: { unreadCount: 0 }
    });
    expect(await unreadAfterPromise).toBe(0);
  });
});
