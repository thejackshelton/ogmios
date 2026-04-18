import type { ScreenReaderHandle, ShokiEvent } from '@shoki/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands } from '../src/commands/index.js';
import { ShokiSessionNotFoundError } from '../src/errors.js';
import { SessionStore, type ShokiSdkDriver } from '../src/session-store.js';

function makeMockHandle() {
  const queue: ShokiEvent[][] = [];
  const stop = vi.fn(async () => {});
  const h: ScreenReaderHandle = {
    name: 'mock',
    start: vi.fn(async () => {}),
    stop,
    // Phase 7 API reshape: end() aliases stop() — point both at the same mock
    // so call counts remain symmetric across the two names.
    end: stop,
    deinit: vi.fn(async () => {}),
    drain: vi.fn(async () => queue.shift() ?? []),
    reset: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    listen: vi.fn(() => (async function* () {})()),
    phraseLog: vi.fn(async () => ['a', 'b']),
    lastPhrase: vi.fn(async () => 'b' as string | undefined),
    droppedCount: vi.fn(async () => 7n),
    awaitStableLog: vi.fn(async () => [] as ShokiEvent[]),
  };
  return { handle: h, queueDrain: (evs: ShokiEvent[]) => queue.push(evs) };
}

function mockDriver(h: ScreenReaderHandle): ShokiSdkDriver {
  return { create: () => h };
}

describe('command handlers (real SessionStore)', () => {
  let store: SessionStore;
  let mh: ReturnType<typeof makeMockHandle>;
  let cmds: ReturnType<typeof createCommands>;

  beforeEach(() => {
    store = new SessionStore();
    mh = makeMockHandle();
    cmds = createCommands({ sessionStore: store, driver: mockDriver(mh.handle) });
  });

  it('shokiStart returns { sessionId: "shoki-1" } on first call', async () => {
    const r = await cmds.shokiStart({}, {});
    expect(r).toEqual({ sessionId: 'shoki-1' });
    expect(mh.handle.start).toHaveBeenCalledOnce();
  });

  it('shokiDrain returns WireShokiEvent[] with tsMs numbers', async () => {
    const { sessionId } = await cmds.shokiStart({}, {});
    mh.queueDrain([{ tsNanos: 5_000_000n, source: 'applescript', flags: 0, phrase: 'hi' }]);
    const r = await cmds.shokiDrain({}, { sessionId });
    expect(r).toEqual([
      {
        tsMs: 5,
        source: 'applescript',
        flags: 0,
        phrase: 'hi',
        role: undefined,
        name: undefined,
      },
    ]);
  });

  it('shokiStop returns { stopped, remainingRefs }', async () => {
    const { sessionId } = await cmds.shokiStart({}, {});
    const r = await cmds.shokiStop({}, { sessionId });
    expect(r).toEqual({ stopped: true, remainingRefs: 0 });
  });

  it('any command on unknown sessionId throws ShokiSessionNotFoundError', async () => {
    await expect(cmds.shokiDrain({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      ShokiSessionNotFoundError,
    );
    await expect(cmds.shokiReset({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      ShokiSessionNotFoundError,
    );
    await expect(cmds.shokiPhraseLog({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      ShokiSessionNotFoundError,
    );
  });

  it('shokiAwaitStable forwards timeoutMs as AbortSignal', async () => {
    const { sessionId } = await cmds.shokiStart({}, {});
    await cmds.shokiAwaitStable({}, { sessionId, quietMs: 10, timeoutMs: 100 });
    const args = (mh.handle.awaitStableLog as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(args.quietMs).toBe(10);
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('shokiGetDroppedCount returns number (never bigint)', async () => {
    const { sessionId } = await cmds.shokiStart({}, {});
    const r = await cmds.shokiGetDroppedCount({}, { sessionId });
    expect(r.droppedCount).toBe(7);
    expect(typeof r.droppedCount).toBe('number');
  });

  it('shokiLastPhrase returns null when undefined', async () => {
    (mh.handle.lastPhrase as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { sessionId } = await cmds.shokiStart({}, {});
    const r = await cmds.shokiLastPhrase({}, { sessionId });
    expect(r).toBeNull();
  });

  it('every live-path return passes structuredClone round-trip', async () => {
    const { sessionId } = await cmds.shokiStart({}, {});
    mh.queueDrain([
      { tsNanos: 1n, source: 'ax', flags: 1, phrase: 'x', role: 'button', name: 'Go' },
    ]);
    const calls = [
      await cmds.shokiStart({}, {}),
      await cmds.shokiDrain({}, { sessionId }),
      await cmds.shokiListen({}, { sessionId, sinceMs: 0 }),
      await cmds.shokiPhraseLog({}, { sessionId }),
      await cmds.shokiLastPhrase({}, { sessionId }),
      await cmds.shokiClear({}, { sessionId }),
      await cmds.shokiReset({}, { sessionId }),
      await cmds.shokiAwaitStable({}, { sessionId, quietMs: 10 }),
      await cmds.shokiGetDroppedCount({}, { sessionId }),
      await cmds.shokiStop({}, { sessionId }),
    ];
    for (const r of calls) {
      expect(() => structuredClone(r)).not.toThrow();
      expect(structuredClone(r)).toEqual(r);
    }
  });
});
