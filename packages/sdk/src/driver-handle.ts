import { loadBinding } from './binding-loader.js';
import { DriverNotFoundError, ShokiError } from './errors.js';
import { LogStore } from './handle-internals.js';
import { listenImpl } from './listen.js';
import type {
  AwaitStableLogOptions,
  ScreenReaderHandle,
  ShokiEvent,
} from './screen-reader.js';
import { decodeEvents } from './wire.js';

export interface CreateDriverHandleOptions {
  driverName: string;
  logBufferSize?: number;
  /** Polling interval for the listen() iterator. */
  pollMs?: number;
}

const DEFAULT_LOG_BUFFER_SIZE = 10_000;
const DEFAULT_POLL_MS = 50;

/**
 * Generic factory that wraps a Zig driver id in a ScreenReaderHandle.
 * Used by voiceOver (this plan), and by future drivers (nvda, orca).
 *
 * Behavior notes:
 * - On `start()` we begin a background drain interval at `pollMs` cadence (50ms
 *   default — matches the Zig PollLoop cadence). Each tick calls the native
 *   `driverDrain` once and funnels decoded events into an internal LogStore.
 * - `listen()` returns an async iterable backed by that LogStore, broadcast to
 *   any number of concurrent iterators.
 * - `clear()` empties the TS-side log ONLY; the ring buffer is untouched.
 * - `reset()` calls the native reset AND clears the TS log (matches CAP-12).
 */
export function createDriverHandle(opts: CreateDriverHandleOptions): ScreenReaderHandle {
  const binding = loadBinding();
  const logBufferSize = opts.logBufferSize ?? DEFAULT_LOG_BUFFER_SIZE;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;

  let id: bigint | null;
  try {
    id = binding.createDriver(opts.driverName, logBufferSize);
  } catch (err) {
    if (err instanceof Error && err.message.includes('DriverNotFound')) {
      throw new DriverNotFoundError(opts.driverName);
    }
    throw new ShokiError(
      `Failed to create driver "${opts.driverName}": ${(err as Error).message}`,
      'ERR_DRIVER_CREATE_FAILED',
    );
  }

  const store = new LogStore();
  let deinited = false;
  let drainInterval: ReturnType<typeof setInterval> | null = null;

  function assertAlive(): bigint {
    if (deinited || id === null) {
      throw new ShokiError(
        `Driver "${opts.driverName}" has been deinit'd; create a new handle.`,
        'ERR_DRIVER_DEINITED',
      );
    }
    return id;
  }

  function drainOnceSync(): ShokiEvent[] {
    const currentId = assertAlive();
    const buf = binding.driverDrain(currentId);
    const events = decodeEvents(buf);
    store.pushMany(events);
    return events;
  }

  function startDrainInterval() {
    if (drainInterval !== null) return;
    drainInterval = setInterval(() => {
      try {
        drainOnceSync();
      } catch {
        // Swallow here; callers will see the error on their next explicit
        // drain/phraseLog/etc. invocation.
      }
    }, pollMs);
    // Don't keep the process alive just because the interval is running.
    drainInterval.unref?.();
  }

  function stopDrainInterval() {
    if (drainInterval !== null) {
      clearInterval(drainInterval);
      drainInterval = null;
    }
  }

  async function doStop(): Promise<void> {
    stopDrainInterval();
    binding.driverStop(assertAlive());
  }

  return {
    name: opts.driverName,

    async start() {
      binding.driverStart(assertAlive());
      startDrainInterval();
    },

    stop: doStop,

    // end() is a v1+ alias for stop(). Both bindings point at the same
    // implementation so mock-call counts remain symmetric across the two names
    // (see packages/sdk/test/voice-over.test.ts "handle.end() is an alias").
    end: doStop,

    async drain() {
      return drainOnceSync();
    },

    async reset() {
      binding.driverReset(assertAlive());
      store.clear();
    },

    listen(): AsyncIterable<ShokiEvent> {
      return listenImpl(store);
    },

    async phraseLog() {
      drainOnceSync();
      return store.getAll().map((e) => e.phrase);
    },

    async lastPhrase() {
      drainOnceSync();
      return store.lastPhrase();
    },

    async clear() {
      // TS log only — preserve native ring buffer per CAP-11.
      store.clear();
    },

    async droppedCount() {
      const n = binding.droppedCount(assertAlive());
      store.setDroppedCount(n);
      return n;
    },

    async awaitStableLog(options: AwaitStableLogOptions): Promise<ShokiEvent[]> {
      return store.awaitStable(options);
    },

    async deinit() {
      if (deinited) return;
      stopDrainInterval();
      const currentId = assertAlive();
      binding.driverDeinit(currentId);
      deinited = true;
      id = null;
    },
  };
}
