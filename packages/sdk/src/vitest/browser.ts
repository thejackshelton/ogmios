import { commands } from '@vitest/browser/context';
import type {
  OgmiosAwaitStableArgs,
  OgmiosStartArgs,
  OgmiosStartResult,
  WireOgmiosEvent,
} from './command-types.js';
import { OgmiosConcurrentTestError } from './errors.js';

/**
 * Typed re-view of the generic `commands` object exposed by `@vitest/browser/context`.
 * Browser-side callers go through this proxy; the Node-side plugin supplies the
 * matching handlers (see `packages/vitest/src/commands/*`).
 */
interface OgmiosRpc {
  ogmiosStart: (args: OgmiosStartArgs) => Promise<OgmiosStartResult>;
  ogmiosStop: (args: { sessionId: string }) => Promise<{
    stopped: boolean;
    remainingRefs: number;
  }>;
  ogmiosListen: (args: { sessionId: string; sinceMs?: number }) => Promise<WireOgmiosEvent[]>;
  ogmiosDrain: (args: { sessionId: string }) => Promise<WireOgmiosEvent[]>;
  ogmiosPhraseLog: (args: { sessionId: string }) => Promise<string[]>;
  ogmiosLastPhrase: (args: { sessionId: string }) => Promise<string | null>;
  ogmiosClear: (args: { sessionId: string }) => Promise<{ ok: true }>;
  ogmiosReset: (args: { sessionId: string }) => Promise<{ ok: true }>;
  ogmiosAwaitStable: (args: OgmiosAwaitStableArgs) => Promise<WireOgmiosEvent[]>;
  ogmiosGetDroppedCount: (args: { sessionId: string }) => Promise<{ droppedCount: number }>;
}
const rpc = commands as unknown as OgmiosRpc;

export interface OgmiosBrowserSession {
  readonly sessionId: string;
  stop(): Promise<{ stopped: boolean; remainingRefs: number }>;
  /**
   * Alias for {@link OgmiosBrowserSession.stop}. Preferred in v1+ for symmetry
   * with `voiceOver.start()`; both names call the same command over tinyRPC.
   */
  end(): Promise<{ stopped: boolean; remainingRefs: number }>;
  drain(): Promise<WireOgmiosEvent[]>;
  listen(sinceMs?: number): Promise<WireOgmiosEvent[]>;
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | null>;
  clear(): Promise<void>;
  reset(): Promise<void>;
  awaitStable(opts: { quietMs: number; timeoutMs?: number }): Promise<WireOgmiosEvent[]>;
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
  async start(args: OgmiosStartArgs = {}): Promise<OgmiosBrowserSession> {
    if (detectConcurrentContext()) {
      throw new OgmiosConcurrentTestError();
    }
    const { sessionId } = await rpc.ogmiosStart(args);
    // Phase 7 API reshape: end() aliases stop() — both call the same tinyRPC
    // command so SessionStore refcount semantics are identical either way.
    const stop = () => rpc.ogmiosStop({ sessionId });
    return {
      sessionId,
      stop,
      end: stop,
      drain: () => rpc.ogmiosDrain({ sessionId }),
      listen: (sinceMs) => rpc.ogmiosListen({ sessionId, sinceMs }),
      phraseLog: () => rpc.ogmiosPhraseLog({ sessionId }),
      lastPhrase: () => rpc.ogmiosLastPhrase({ sessionId }),
      clear: async () => {
        await rpc.ogmiosClear({ sessionId });
      },
      reset: async () => {
        await rpc.ogmiosReset({ sessionId });
      },
      awaitStable: (opts) => rpc.ogmiosAwaitStable({ sessionId, ...opts }),
      droppedCount: async () => (await rpc.ogmiosGetDroppedCount({ sessionId })).droppedCount,
    };
  },
};

export type { OgmiosStartArgs, WireOgmiosEvent } from './command-types.js';
export { OgmiosConcurrentTestError } from './errors.js';
