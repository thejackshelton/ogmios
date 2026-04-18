import { commands } from '@vitest/browser/context';
import type {
  MunadiAwaitStableArgs,
  MunadiStartArgs,
  MunadiStartResult,
  WireMunadiEvent,
} from './command-types.js';
import { MunadiConcurrentTestError } from './errors.js';

/**
 * Typed re-view of the generic `commands` object exposed by `@vitest/browser/context`.
 * Browser-side callers go through this proxy; the Node-side plugin supplies the
 * matching handlers (see `packages/vitest/src/commands/*`).
 */
interface MunadiRpc {
  munadiStart: (args: MunadiStartArgs) => Promise<MunadiStartResult>;
  munadiStop: (args: { sessionId: string }) => Promise<{
    stopped: boolean;
    remainingRefs: number;
  }>;
  munadiListen: (args: { sessionId: string; sinceMs?: number }) => Promise<WireMunadiEvent[]>;
  munadiDrain: (args: { sessionId: string }) => Promise<WireMunadiEvent[]>;
  munadiPhraseLog: (args: { sessionId: string }) => Promise<string[]>;
  munadiLastPhrase: (args: { sessionId: string }) => Promise<string | null>;
  munadiClear: (args: { sessionId: string }) => Promise<{ ok: true }>;
  munadiReset: (args: { sessionId: string }) => Promise<{ ok: true }>;
  munadiAwaitStable: (args: MunadiAwaitStableArgs) => Promise<WireMunadiEvent[]>;
  munadiGetDroppedCount: (args: { sessionId: string }) => Promise<{ droppedCount: number }>;
}
const rpc = commands as unknown as MunadiRpc;

export interface MunadiBrowserSession {
  readonly sessionId: string;
  stop(): Promise<{ stopped: boolean; remainingRefs: number }>;
  /**
   * Alias for {@link MunadiBrowserSession.stop}. Preferred in v1+ for symmetry
   * with `voiceOver.start()`; both names call the same command over tinyRPC.
   */
  end(): Promise<{ stopped: boolean; remainingRefs: number }>;
  drain(): Promise<WireMunadiEvent[]>;
  listen(sinceMs?: number): Promise<WireMunadiEvent[]>;
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | null>;
  clear(): Promise<void>;
  reset(): Promise<void>;
  awaitStable(opts: { quietMs: number; timeoutMs?: number }): Promise<WireMunadiEvent[]>;
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
  async start(args: MunadiStartArgs = {}): Promise<MunadiBrowserSession> {
    if (detectConcurrentContext()) {
      throw new MunadiConcurrentTestError();
    }
    const { sessionId } = await rpc.munadiStart(args);
    // Phase 7 API reshape: end() aliases stop() — both call the same tinyRPC
    // command so SessionStore refcount semantics are identical either way.
    const stop = () => rpc.munadiStop({ sessionId });
    return {
      sessionId,
      stop,
      end: stop,
      drain: () => rpc.munadiDrain({ sessionId }),
      listen: (sinceMs) => rpc.munadiListen({ sessionId, sinceMs }),
      phraseLog: () => rpc.munadiPhraseLog({ sessionId }),
      lastPhrase: () => rpc.munadiLastPhrase({ sessionId }),
      clear: async () => {
        await rpc.munadiClear({ sessionId });
      },
      reset: async () => {
        await rpc.munadiReset({ sessionId });
      },
      awaitStable: (opts) => rpc.munadiAwaitStable({ sessionId, ...opts }),
      droppedCount: async () => (await rpc.munadiGetDroppedCount({ sessionId })).droppedCount,
    };
  },
};

export type { MunadiStartArgs, WireMunadiEvent } from './command-types.js';
export { MunadiConcurrentTestError } from './errors.js';
