import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import * as FetchEventSourceModule from '@microsoft/fetch-event-source';
import type { FetchEventSourceInit } from '@microsoft/fetch-event-source';
import { SupportStreamService } from './support-stream.service';

describe('SupportStreamService', () => {
  let service: SupportStreamService;
  let fetchEventSourceSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SupportStreamService);
    fetchEventSourceSpy = vi.spyOn(FetchEventSourceModule, 'fetchEventSource');
  });

  afterEach(() => {
    service.disconnect('customer');
    service.disconnect('admin');
    fetchEventSourceSpy.mockReset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends Authorization bearer header when connecting', async () => {
    fetchEventSourceSpy.mockImplementation(async (_url: RequestInfo, init: FetchEventSourceInit) => {
      await init.onopen?.(new Response(null, { status: 200 }));
      init.onmessage?.({ event: 'message', data: '{"ticketId":"t-1"}', id: '' });
    });

    service.connect('customer', 'Bearer token-123');
    await Promise.resolve();

    expect(fetchEventSourceSpy).toHaveBeenCalled();
    const [, init] = fetchEventSourceSpy.mock.calls[0] as [string, { headers?: Record<string, string> }];
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer token-123');
    service.disconnect('customer');
  });

  it('reconnects with exponential backoff when stream connect fails', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    let attempts = 0;
    fetchEventSourceSpy.mockImplementation(async (_url: RequestInfo, init: FetchEventSourceInit) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('network');
      }
      await init.onopen?.(new Response(null, { status: 200 }));
    });

    service.connect('admin', 'Bearer admin-token');
    await Promise.resolve();
    expect(fetchEventSourceSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    expect(fetchEventSourceSpy).toHaveBeenCalledTimes(2);
  });
});
