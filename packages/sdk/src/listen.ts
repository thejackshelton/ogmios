import type { ShokiEvent } from './screen-reader.js';
import type { LogStore } from './handle-internals.js';

/**
 * Async generator yielding ShokiEvents as they arrive in a LogStore.
 *
 * Semantics:
 * - First iteration yields the full existing log in order (from LogStore.getAll()).
 * - Subsequent iterations await the next `push` event and yield it.
 * - Broadcast-safe: multiple concurrent listenImpl generators on the same
 *   LogStore each receive every event (they subscribe independently).
 * - Cancellable via `.return()` — the finally block unsubscribes from the
 *   LogStore so no event-listener leak remains.
 * - AbortSignal: if provided, abort ends the iteration cleanly (no throw);
 *   the generator exits like a natural `break`.
 */
export async function* listenImpl(
  store: LogStore,
  signal?: AbortSignal,
): AsyncGenerator<ShokiEvent> {
  const queue: ShokiEvent[] = store.getAll();
  const waiters: Array<(e: ShokiEvent | null) => void> = [];
  let closed = false;

  const unsubscribe = store.subscribe((ev) => {
    if (closed) return;
    if (waiters.length > 0) {
      const waiter = waiters.shift();
      waiter?.(ev);
    } else {
      queue.push(ev);
    }
  });

  const abortHandler = () => {
    closed = true;
    // Drain waiters with null so they resolve and the loop exits.
    while (waiters.length > 0) {
      const w = waiters.shift();
      w?.(null);
    }
  };

  if (signal) {
    if (signal.aborted) {
      unsubscribe();
      return;
    }
    signal.addEventListener('abort', abortHandler, { once: true });
  }

  try {
    while (!closed) {
      if (queue.length > 0) {
        const ev = queue.shift();
        if (ev) yield ev;
        continue;
      }
      const next = await new Promise<ShokiEvent | null>((resolve) => {
        waiters.push(resolve);
      });
      if (next === null) break;
      yield next;
    }
  } finally {
    unsubscribe();
    signal?.removeEventListener('abort', abortHandler);
  }
}
