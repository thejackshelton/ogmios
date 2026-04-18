import type { AwaitStableLogOptions, MunadiEvent } from './screen-reader.js';

/**
 * Internal TS-side log store. Mirrors events streamed in from the native drain
 * loop and drives the public convenience surface (`phraseLog`, `lastPhrase`,
 * `clear`, `listen`, `awaitStableLog`).
 *
 * Thread model: all pushes happen on the JS main thread (the drain interval
 * runs in Node's event loop), so no internal locking is required. Subscribers
 * are invoked synchronously during `push`.
 *
 * Event broadcast is implemented via an explicit callback list rather than
 * EventTarget/CustomEvent because (a) it avoids the boxing/unboxing cost per
 * event, (b) callbacks receive a typed MunadiEvent directly instead of needing
 * to unwrap `CustomEvent.detail`, and (c) it keeps the hot path allocation-free.
 */
export class LogStore {
  private events: MunadiEvent[] = [];
  private subscribers: Set<(event: MunadiEvent) => void> = new Set();
  private _droppedCount = 0n;

  /** Append a single event and synchronously notify all subscribers. */
  push(event: MunadiEvent): void {
    this.events.push(event);
    for (const fn of this.subscribers) fn(event);
  }

  /** Append many events. Single pass; each event broadcast individually. */
  pushMany(events: MunadiEvent[]): void {
    for (const e of events) this.push(e);
  }

  /** Update the dropped counter without emitting a broadcast. */
  setDroppedCount(n: bigint): void {
    this._droppedCount = n;
  }

  droppedCount(): bigint {
    return this._droppedCount;
  }

  /** Defensive copy so callers can't mutate the backing array. */
  getAll(): MunadiEvent[] {
    return this.events.slice();
  }

  lastPhrase(): string | undefined {
    return this.events[this.events.length - 1]?.phrase;
  }

  /**
   * Clear the in-memory event log. Intentionally does NOT reset `_droppedCount`
   * — users can observe total loss across clears by reading droppedCount.
   */
  clear(): void {
    this.events.length = 0;
  }

  /**
   * Subscribe to push events. Returns an unsubscribe function.
   * Safe to call during a push (subscribers added mid-broadcast receive the
   * next event, not the in-flight one). Safe to unsubscribe during broadcast.
   */
  subscribe(fn: (event: MunadiEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  /**
   * Promise that resolves once `quietMs` has elapsed without any `push`.
   * Snapshot returned at resolution is the full event log at that moment.
   *
   * The timer resets on every push — so the resolution time equals
   * `quietMs` after the LAST push. Input validated synchronously.
   */
  awaitStable(opts: AwaitStableLogOptions): Promise<MunadiEvent[]> {
    const { quietMs, signal } = opts;
    if (!Number.isFinite(quietMs) || quietMs < 0) {
      throw new TypeError(
        `awaitStableLog: quietMs must be a non-negative finite number, got ${quietMs}`,
      );
    }
    return new Promise<MunadiEvent[]>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let unsubscribe: () => void = () => {};
      let abortHandler: () => void = () => {};

      const cleanup = () => {
        if (timer !== undefined) clearTimeout(timer);
        unsubscribe();
        signal?.removeEventListener('abort', abortHandler);
      };

      const settle = () => {
        cleanup();
        resolve(this.getAll());
      };

      abortHandler = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      if (signal) {
        if (signal.aborted) {
          abortHandler();
          return;
        }
        signal.addEventListener('abort', abortHandler, { once: true });
      }

      unsubscribe = this.subscribe(() => {
        if (timer !== undefined) clearTimeout(timer);
        timer = setTimeout(settle, quietMs);
      });

      timer = setTimeout(settle, quietMs);
    });
  }

  /** Current log length (used internally by awaitStableLog's cursor logic). */
  now(): number {
    return this.events.length;
  }
}
