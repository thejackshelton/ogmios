import {
  type ScreenReaderHandle,
  type ShokiEvent,
  voiceOver,
  type VoiceOverOptions,
} from '@shoki/sdk';
import type { WireShokiEvent } from './command-types.js';
import { ShokiSessionNotFoundError } from './errors.js';

/**
 * Abstraction over the @shoki/sdk factory so tests can inject a fake driver.
 */
export interface ShokiSdkDriver {
  create(opts: VoiceOverOptions): ScreenReaderHandle;
}

export const realShokiSdkDriver: ShokiSdkDriver = {
  create: (opts) => voiceOver(opts),
};

interface SessionState {
  sessionId: string;
  active: boolean;
  /** Index into the shared event log; events at index >= cursor are new to this session. */
  cursor: number;
}

/**
 * Refcounted, process-local Shoki session registry (VITEST-05).
 *
 * Model:
 * - ONE underlying ScreenReaderHandle serves many sessionIds.
 * - First start() boots VO; subsequent starts mint a new sessionId and increment the refcount.
 * - Last stop() tears the handle down (stop + deinit).
 * - reset(sessionId) calls handle.reset() AND rewinds every session's cursor to 0 (the
 *   log was cleared, so "new events since last cursor" starts fresh for everyone).
 * - Each session keeps its own cursor so two concurrent `session.drain()` callers don't
 *   steal each other's events.
 *
 * NOT safe for cross-process sharing — each Vitest process has its own SessionStore.
 */
export class SessionStore {
  private handle: ScreenReaderHandle | null = null;
  private startRefs = 0;
  private counter = 0;
  private sessions = new Map<string, SessionState>();

  /**
   * Mirror of the SDK's LogStore. We keep our own copy so per-session cursors
   * can emit index-based deltas (the SDK's drain() empties its local list; if we
   * don't mirror, two sessions racing on drain() would see different subsets).
   */
  private sharedEventLog: ShokiEvent[] = [];

  async start(driver: ShokiSdkDriver, opts: VoiceOverOptions): Promise<string> {
    if (this.handle === null) {
      const h = driver.create(opts);
      // DO NOT increment refcount on failure — next successful start() begins at refs=1.
      await h.start();
      this.handle = h;
    }
    this.startRefs += 1;
    this.counter += 1;
    const sessionId = `shoki-${this.counter}`;
    this.sessions.set(sessionId, {
      sessionId,
      active: true,
      cursor: this.sharedEventLog.length,
    });
    return sessionId;
  }

  async stop(sessionId: string): Promise<{ stopped: boolean; remainingRefs: number }> {
    const s = this.getSession(sessionId);
    if (!s.active) return { stopped: false, remainingRefs: this.startRefs };
    s.active = false;
    this.startRefs -= 1;
    const stopped = this.startRefs === 0;
    if (stopped && this.handle !== null) {
      const h = this.handle;
      this.handle = null;
      try {
        await h.stop();
      } finally {
        await h.deinit();
      }
      this.sharedEventLog = [];
    }
    return { stopped, remainingRefs: this.startRefs };
  }

  async reset(sessionId: string): Promise<void> {
    this.getSession(sessionId);
    const h = this.requireHandle();
    await h.reset();
    this.sharedEventLog = [];
    for (const s of this.sessions.values()) {
      s.cursor = 0;
    }
  }

  async clear(sessionId: string): Promise<void> {
    this.getSession(sessionId);
    const h = this.requireHandle();
    await h.clear();
    this.sharedEventLog = [];
    for (const s of this.sessions.values()) {
      s.cursor = 0;
    }
  }

  async drain(sessionId: string): Promise<WireShokiEvent[]> {
    const s = this.getSession(sessionId);
    await this.pumpHandleIntoSharedLog();
    const slice = this.sharedEventLog.slice(s.cursor);
    s.cursor = this.sharedEventLog.length;
    return slice.map(toWireEvent);
  }

  async listen(sessionId: string, sinceMs?: number): Promise<WireShokiEvent[]> {
    if (sinceMs === undefined) return this.drain(sessionId);
    this.getSession(sessionId);
    await this.pumpHandleIntoSharedLog();
    const cutoffNs = BigInt(sinceMs) * 1_000_000n;
    return this.sharedEventLog.filter((e) => e.tsNanos >= cutoffNs).map(toWireEvent);
  }

  async phraseLog(sessionId: string): Promise<string[]> {
    this.getSession(sessionId);
    const h = this.requireHandle();
    return h.phraseLog();
  }

  async lastPhrase(sessionId: string): Promise<string | null> {
    this.getSession(sessionId);
    const h = this.requireHandle();
    return (await h.lastPhrase()) ?? null;
  }

  async awaitStable(
    sessionId: string,
    opts: { quietMs: number; timeoutMs?: number },
  ): Promise<WireShokiEvent[]> {
    const s = this.getSession(sessionId);
    const h = this.requireHandle();
    const signal =
      opts.timeoutMs !== undefined ? AbortSignal.timeout(opts.timeoutMs) : undefined;
    const snapshot = await h.awaitStableLog({ quietMs: opts.quietMs, signal });
    // Refresh shared log + advance session cursor so follow-up drain() returns
    // nothing until new events arrive after the stable point.
    this.sharedEventLog = snapshot.slice();
    s.cursor = this.sharedEventLog.length;
    return snapshot.map(toWireEvent);
  }

  async getDroppedCount(sessionId: string): Promise<{ droppedCount: number }> {
    this.getSession(sessionId);
    const h = this.requireHandle();
    const n = await h.droppedCount();
    // droppedCount is a bigint; structured-clone requires number. Practical values
    // fit in safe-int; if we ever hit 2^53 drops the test has bigger problems.
    return { droppedCount: Number(n) };
  }

  private async pumpHandleIntoSharedLog(): Promise<void> {
    const h = this.requireHandle();
    const events = await h.drain();
    this.sharedEventLog.push(...events);
  }

  private getSession(sessionId: string): SessionState {
    const s = this.sessions.get(sessionId);
    if (!s) throw new ShokiSessionNotFoundError(sessionId);
    return s;
  }

  private requireHandle(): ScreenReaderHandle {
    if (this.handle === null) {
      throw new ShokiSessionNotFoundError('<handle-already-torn-down>');
    }
    return this.handle;
  }

  /** Test-only introspection. */
  get _startRefs(): number {
    return this.startRefs;
  }
  get _handle(): ScreenReaderHandle | null {
    return this.handle;
  }
}

/**
 * Convert a ShokiEvent (with bigint tsNanos) into a structured-clone-safe
 * WireShokiEvent. tsMs is an integer millisecond count (bigint-division,
 * floor toward zero).
 */
export function toWireEvent(e: ShokiEvent): WireShokiEvent {
  const tsMs = Number(e.tsNanos / 1_000_000n);
  return {
    tsMs,
    source: e.source,
    flags: e.flags,
    phrase: e.phrase,
    role: e.role,
    name: e.name,
  };
}
