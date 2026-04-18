import { execFileSync } from 'node:child_process';
import {
  type ScreenReaderHandle,
  type OgmiosEvent,
  voiceOver,
  type VoiceOverOptions,
} from '../index.js';
import type { WireOgmiosEvent } from './command-types.js';
import { OgmiosSessionNotFoundError } from './errors.js';

/**
 * Phase 7 Plan 04 — "DOM vs Chrome URL bar" filter support.
 *
 * Resolve the youngest Chromium renderer-helper child pid via `pgrep -f`.
 * Under Vitest browser-mode with Playwright/Chromium, the parent Chromium
 * process owns the URL bar / tab title (chrome surface); each tab runs in
 * a renderer-helper child process. Scoping ogmios's AX observer to that
 * renderer pid keeps URL-bar announcements out of the capture log.
 *
 * Returns null on any error (wrong platform, no Chromium, pgrep missing) so
 * callers can continue without the filter — the test-file-level focus-body
 * pattern still provides defense-in-depth.
 */
export function resolveChromeRendererPid(): number | null {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('/usr/bin/pgrep', ['-f', 'Chromium Helper (Renderer)'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const pids = out
      .trim()
      .split('\n')
      .map((s) => Number.parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (pids.length === 0) return null;
    // Most-recently-spawned is typically the Vitest-spawned tab under the
    // headless browser-mode run. T-07-42 in the plan's threat register
    // explicitly accepts the "multiple tabs" edge case.
    return pids[pids.length - 1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Abstraction over the ogmios factory so tests can inject a fake driver.
 */
export interface OgmiosSdkDriver {
  create(opts: VoiceOverOptions): ScreenReaderHandle;
}

export const realOgmiosSdkDriver: OgmiosSdkDriver = {
  create: (opts) => voiceOver(opts),
};

interface SessionState {
  sessionId: string;
  active: boolean;
  /** Index into the shared event log; events at index >= cursor are new to this session. */
  cursor: number;
}

/**
 * Refcounted, process-local Ogmios session registry (VITEST-05).
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
  private sharedEventLog: OgmiosEvent[] = [];

  async start(driver: OgmiosSdkDriver, opts: VoiceOverOptions): Promise<string> {
    if (this.handle === null) {
      // Phase 7 Plan 04: resolve the Chromium renderer pid and expose it to
      // the Zig driver via OGMIOS_AX_TARGET_PID before the handle boots. The
      // Zig driver reads the env var inside startImpl to scope the AX
      // observer to the test-viewport renderer process (not the browser
      // chrome). If resolution fails we leave the env var alone — the driver
      // falls back to the Phase 3 VO-pid default and the per-test focus-body
      // pattern still provides defense-in-depth.
      if (!process.env.OGMIOS_AX_TARGET_PID) {
        const rendererPid = resolveChromeRendererPid();
        if (rendererPid !== null) {
          process.env.OGMIOS_AX_TARGET_PID = String(rendererPid);
        }
      }

      const h = driver.create(opts);
      // DO NOT increment refcount on failure — next successful start() begins at refs=1.
      await h.start();
      this.handle = h;
    }
    this.startRefs += 1;
    this.counter += 1;
    const sessionId = `ogmios-${this.counter}`;
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

  async drain(sessionId: string): Promise<WireOgmiosEvent[]> {
    const s = this.getSession(sessionId);
    await this.pumpHandleIntoSharedLog();
    const slice = this.sharedEventLog.slice(s.cursor);
    s.cursor = this.sharedEventLog.length;
    return slice.map(toWireEvent);
  }

  async listen(sessionId: string, sinceMs?: number): Promise<WireOgmiosEvent[]> {
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
  ): Promise<WireOgmiosEvent[]> {
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
    if (!s) throw new OgmiosSessionNotFoundError(sessionId);
    return s;
  }

  private requireHandle(): ScreenReaderHandle {
    if (this.handle === null) {
      throw new OgmiosSessionNotFoundError('<handle-already-torn-down>');
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
 * Convert a OgmiosEvent (with bigint tsNanos) into a structured-clone-safe
 * WireOgmiosEvent. tsMs is an integer millisecond count (bigint-division,
 * floor toward zero).
 */
export function toWireEvent(e: OgmiosEvent): WireOgmiosEvent {
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
