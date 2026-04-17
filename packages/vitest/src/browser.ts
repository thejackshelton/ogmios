import { commands } from '@vitest/browser/context';
import { ShokiConcurrentTestError } from './errors.js';
import type {
  ShokiAwaitStableArgs,
  ShokiStartArgs,
  ShokiStartResult,
  WireShokiEvent,
} from './command-types.js';

/**
 * Typed re-view of the generic `commands` object exposed by `@vitest/browser/context`.
 * Browser-side callers go through this proxy; the Node-side plugin supplies the
 * matching handlers (see `packages/vitest/src/commands/*`).
 */
interface ShokiRpc {
  shokiStart: (args: ShokiStartArgs) => Promise<ShokiStartResult>;
  shokiStop: (args: { sessionId: string }) => Promise<{
    stopped: boolean;
    remainingRefs: number;
  }>;
  shokiListen: (args: { sessionId: string; sinceMs?: number }) => Promise<WireShokiEvent[]>;
  shokiDrain: (args: { sessionId: string }) => Promise<WireShokiEvent[]>;
  shokiPhraseLog: (args: { sessionId: string }) => Promise<string[]>;
  shokiLastPhrase: (args: { sessionId: string }) => Promise<string | null>;
  shokiClear: (args: { sessionId: string }) => Promise<{ ok: true }>;
  shokiReset: (args: { sessionId: string }) => Promise<{ ok: true }>;
  shokiAwaitStable: (args: ShokiAwaitStableArgs) => Promise<WireShokiEvent[]>;
  shokiGetDroppedCount: (args: { sessionId: string }) => Promise<{ droppedCount: number }>;
}
const rpc = commands as unknown as ShokiRpc;

export interface ShokiBrowserSession {
  readonly sessionId: string;
  stop(): Promise<{ stopped: boolean; remainingRefs: number }>;
  drain(): Promise<WireShokiEvent[]>;
  listen(sinceMs?: number): Promise<WireShokiEvent[]>;
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | null>;
  clear(): Promise<void>;
  reset(): Promise<void>;
  awaitStable(opts: { quietMs: number; timeoutMs?: number }): Promise<WireShokiEvent[]>;
  droppedCount(): Promise<number>;
}

/**
 * Best-effort detection of `test.concurrent` in the browser runtime. Vitest's
 * `vi.getTestMeta()` exposes `concurrent` when available; otherwise we treat
 * the context as serial and let Vitest's serial model apply.
 */
function detectConcurrentContext(): boolean {
  const g = globalThis as {
    vi?: { getTestMeta?: () => { concurrent?: boolean } | undefined };
  };
  try {
    const meta = g.vi?.getTestMeta?.();
    return meta?.concurrent === true;
  } catch {
    return false;
  }
}

export const voiceOver = {
  async start(args: ShokiStartArgs = {}): Promise<ShokiBrowserSession> {
    if (detectConcurrentContext()) {
      throw new ShokiConcurrentTestError();
    }
    const { sessionId } = await rpc.shokiStart(args);
    return {
      sessionId,
      stop: () => rpc.shokiStop({ sessionId }),
      drain: () => rpc.shokiDrain({ sessionId }),
      listen: (sinceMs) => rpc.shokiListen({ sessionId, sinceMs }),
      phraseLog: () => rpc.shokiPhraseLog({ sessionId }),
      lastPhrase: () => rpc.shokiLastPhrase({ sessionId }),
      clear: async () => {
        await rpc.shokiClear({ sessionId });
      },
      reset: async () => {
        await rpc.shokiReset({ sessionId });
      },
      awaitStable: (opts) => rpc.shokiAwaitStable({ sessionId, ...opts }),
      droppedCount: async () => (await rpc.shokiGetDroppedCount({ sessionId })).droppedCount,
    };
  },
};

export type { ShokiStartArgs, WireShokiEvent } from './command-types.js';
export { ShokiConcurrentTestError } from './errors.js';
