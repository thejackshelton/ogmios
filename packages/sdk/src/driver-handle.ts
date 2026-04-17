import { loadBinding } from './binding-loader.js';
import { DriverNotFoundError, ShokiError } from './errors.js';
import type { ScreenReaderHandle, ShokiEvent } from './screen-reader.js';
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

  const phraseLog: string[] = [];
  let deinited = false;

  function assertAlive(): bigint {
    if (deinited || id === null) {
      throw new ShokiError(
        `Driver "${opts.driverName}" has been deinit'd; create a new handle.`,
        'ERR_DRIVER_DEINITED',
      );
    }
    return id;
  }

  async function drainOnce(): Promise<ShokiEvent[]> {
    const currentId = assertAlive();
    const buf = binding.driverDrain(currentId);
    const events = decodeEvents(buf);
    for (const e of events) phraseLog.push(e.phrase);
    return events;
  }

  return {
    name: opts.driverName,

    async start() {
      binding.driverStart(assertAlive());
    },

    async stop() {
      binding.driverStop(assertAlive());
    },

    async drain() {
      return drainOnce();
    },

    async reset() {
      binding.driverReset(assertAlive());
      phraseLog.length = 0;
    },

    async *listen(): AsyncGenerator<ShokiEvent> {
      while (!deinited) {
        const events = await drainOnce();
        for (const e of events) yield e;
        await new Promise((r) => setTimeout(r, pollMs));
      }
    },

    async phraseLog() {
      await drainOnce();
      return [...phraseLog];
    },

    async lastPhrase() {
      await drainOnce();
      return phraseLog[phraseLog.length - 1];
    },

    async clear() {
      binding.driverReset(assertAlive());
      phraseLog.length = 0;
    },

    async droppedCount() {
      return binding.droppedCount(assertAlive());
    },

    async deinit() {
      if (deinited) return;
      const currentId = assertAlive();
      binding.driverDeinit(currentId);
      deinited = true;
      id = null;
    },
  };
}
