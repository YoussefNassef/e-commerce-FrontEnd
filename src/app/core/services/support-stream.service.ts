import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable, BehaviorSubject } from 'rxjs';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { environment } from '../models/environment';

export type SupportStreamScope = 'customer' | 'admin';

export interface SupportStreamEvent {
  scope: SupportStreamScope;
  event: string;
  ticketId: string | null;
  payload: Record<string, unknown> | null;
  rawData: string;
}

interface StreamState {
  abortController: AbortController | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  manuallyClosed: boolean;
  authHeaderProvider: (() => string | null) | null;
}

class SupportStreamHttpError extends Error {
  constructor(readonly status: number) {
    super(`SSE connect failed (${status})`);
  }
}

@Injectable({ providedIn: 'root' })
export class SupportStreamService implements OnDestroy {
  private readonly streams = new Map<SupportStreamScope, StreamState>();
  private readonly eventsSubject = new Subject<SupportStreamEvent>();
  private readonly connectedState = new BehaviorSubject<Record<SupportStreamScope, boolean>>({
    customer: false,
    admin: false
  });

  readonly events$: Observable<SupportStreamEvent> = this.eventsSubject.asObservable();
  readonly connectedState$ = this.connectedState.asObservable();

  connect(scope: SupportStreamScope, authHeaderOrProvider: string | (() => string | null)): void {
    const provider =
      typeof authHeaderOrProvider === 'function'
        ? authHeaderOrProvider
        : () => authHeaderOrProvider;
    const firstHeader = provider();
    if (!firstHeader?.trim()) {
      return;
    }

    const existing = this.streams.get(scope);
    if (existing?.abortController && existing.authHeaderProvider === provider) {
      return;
    }

    if (existing?.abortController && existing.authHeaderProvider !== provider) {
      this.disconnect(scope);
    }

    const state: StreamState = existing ?? {
      abortController: null,
      reconnectTimer: null,
      reconnectAttempt: 0,
      manuallyClosed: false,
      authHeaderProvider: null
    };
    state.manuallyClosed = false;
    state.authHeaderProvider = provider;
    this.streams.set(scope, state);
    void this.open(scope, state);
  }

  disconnect(scope: SupportStreamScope): void {
    const state = this.streams.get(scope);
    if (!state) {
      return;
    }

    state.manuallyClosed = true;
    this.clearTimer(state);
    state.abortController?.abort();
    state.abortController = null;
    this.setConnected(scope, false);
  }

  ngOnDestroy(): void {
    this.disconnect('customer');
    this.disconnect('admin');
    this.eventsSubject.complete();
    this.connectedState.complete();
  }

  private async open(scope: SupportStreamScope, state: StreamState): Promise<void> {
    const authHeader = state.authHeaderProvider?.();
    if (!authHeader?.trim()) {
      this.setConnected(scope, false);
      this.scheduleReconnect(scope, state);
      return;
    }

    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      await fetchEventSource(this.streamUrl(scope), {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          Authorization: authHeader
        },
        credentials: 'include',
        openWhenHidden: true,
        signal: abortController.signal,
        onopen: async (response) => {
          if (!response.ok) {
            throw new SupportStreamHttpError(response.status);
          }
          this.setConnected(scope, true);
          state.reconnectAttempt = 0;
        },
        onmessage: (message) => {
          this.emitParsedEvent(scope, message.event || 'message', message.data);
        },
        onclose: () => {
          throw new Error('SSE stream closed by server');
        },
        onerror: () => {
          this.setConnected(scope, false);
          throw new Error('SSE transport error');
        }
      });
    } catch (error) {
      this.setConnected(scope, false);
      if (error instanceof SupportStreamHttpError) {
        const status = error.status;
        if (status === 401 || status === 403) {
          state.reconnectAttempt = 0;
        }
      }
    } finally {
      if (state.abortController === abortController) {
        state.abortController = null;
      }

      if (!state.manuallyClosed) {
        this.scheduleReconnect(scope, state);
      }
    }
  }

  private emitParsedEvent(scope: SupportStreamScope, eventName: string, rawData: string): void {
    if (!rawData) {
      return;
    }

    let payload: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(rawData) as unknown;
      if (parsed && typeof parsed === 'object') {
        payload = parsed as Record<string, unknown>;
      }
    } catch {
      payload = null;
    }

    const innerData = this.asRecord(payload?.['data']);
    const nestedData = this.asRecord(innerData?.['data']);
    const ticketIdCandidate =
      payload?.['ticketId'] ??
      payload?.['ticket_id'] ??
      innerData?.['ticketId'] ??
      innerData?.['ticket_id'] ??
      nestedData?.['ticketId'] ??
      nestedData?.['ticket_id'] ??
      payload?.['id'] ??
      innerData?.['id'] ??
      nestedData?.['id'] ??
      null;
    const normalizedTicketId =
      typeof ticketIdCandidate === 'number'
        ? String(ticketIdCandidate)
        : typeof ticketIdCandidate === 'string'
          ? ticketIdCandidate.trim()
          : '';

    this.eventsSubject.next({
      scope,
      event: eventName,
      ticketId: normalizedTicketId || null,
      payload,
      rawData
    });
  }

  private scheduleReconnect(scope: SupportStreamScope, state: StreamState): void {
    this.clearTimer(state);
    state.reconnectAttempt += 1;
    const attempt = Math.min(state.reconnectAttempt, 8);
    const baseDelay = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 350);
    const delayMs = baseDelay + jitter;

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.manuallyClosed) {
        return;
      }
      void this.open(scope, state);
    }, delayMs);
  }

  private clearTimer(state: StreamState): void {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
  }

  private setConnected(scope: SupportStreamScope, connected: boolean): void {
    const current = this.connectedState.value;
    if (current[scope] === connected) {
      return;
    }
    this.connectedState.next({ ...current, [scope]: connected });
  }

  private streamUrl(scope: SupportStreamScope): string {
    const path = scope === 'admin' ? '/admin/support/tickets/stream' : '/support/tickets/stream';
    const base = environment.apiBaseUrl.replace(/\/+$/, '');
    if (/^https?:\/\//i.test(base)) {
      return `${base}${path}`;
    }
    if (base.startsWith('/')) {
      return `${window.location.origin}${base}${path}`;
    }
    return `${window.location.origin}/${base}${path}`;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  }
}
