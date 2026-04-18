import type { ScreenReaderHandle, MunadiEvent } from '../../src/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands } from '../../src/vitest/commands/index.js';
import { MunadiSessionNotFoundError } from '../../src/vitest/errors.js';
import { SessionStore, type MunadiSdkDriver } from '../../src/vitest/session-store.js';

function makeMockHandle() {
  const queue: MunadiEvent[][] = [];
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
    awaitStableLog: vi.fn(async () => [] as MunadiEvent[]),
  };
  return { handle: h, queueDrain: (evs: MunadiEvent[]) => queue.push(evs) };
}

function mockDriver(h: ScreenReaderHandle): MunadiSdkDriver {
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

  it('munadiStart returns { sessionId: "munadi-1" } on first call', async () => {
    const r = await cmds.munadiStart({}, {});
    expect(r).toEqual({ sessionId: 'munadi-1' });
    expect(mh.handle.start).toHaveBeenCalledOnce();
  });

  it('munadiDrain returns WireMunadiEvent[] with tsMs numbers', async () => {
    const { sessionId } = await cmds.munadiStart({}, {});
    mh.queueDrain([{ tsNanos: 5_000_000n, source: 'applescript', flags: 0, phrase: 'hi' }]);
    const r = await cmds.munadiDrain({}, { sessionId });
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

  it('munadiStop returns { stopped, remainingRefs }', async () => {
    const { sessionId } = await cmds.munadiStart({}, {});
    const r = await cmds.munadiStop({}, { sessionId });
    expect(r).toEqual({ stopped: true, remainingRefs: 0 });
  });

  it('any command on unknown sessionId throws MunadiSessionNotFoundError', async () => {
    await expect(cmds.munadiDrain({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      MunadiSessionNotFoundError,
    );
    await expect(cmds.munadiReset({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      MunadiSessionNotFoundError,
    );
    await expect(cmds.munadiPhraseLog({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      MunadiSessionNotFoundError,
    );
  });

  it('munadiAwaitStable forwards timeoutMs as AbortSignal', async () => {
    const { sessionId } = await cmds.munadiStart({}, {});
    await cmds.munadiAwaitStable({}, { sessionId, quietMs: 10, timeoutMs: 100 });
    const args = (mh.handle.awaitStableLog as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(args.quietMs).toBe(10);
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('munadiGetDroppedCount returns number (never bigint)', async () => {
    const { sessionId } = await cmds.munadiStart({}, {});
    const r = await cmds.munadiGetDroppedCount({}, { sessionId });
    expect(r.droppedCount).toBe(7);
    expect(typeof r.droppedCount).toBe('number');
  });

  it('munadiLastPhrase returns null when undefined', async () => {
    (mh.handle.lastPhrase as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { sessionId } = await cmds.munadiStart({}, {});
    const r = await cmds.munadiLastPhrase({}, { sessionId });
    expect(r).toBeNull();
  });

  it('every live-path return passes structuredClone round-trip', async () => {
    const { sessionId } = await cmds.munadiStart({}, {});
    mh.queueDrain([
      { tsNanos: 1n, source: 'ax', flags: 1, phrase: 'x', role: 'button', name: 'Go' },
    ]);
    const calls = [
      await cmds.munadiStart({}, {}),
      await cmds.munadiDrain({}, { sessionId }),
      await cmds.munadiListen({}, { sessionId, sinceMs: 0 }),
      await cmds.munadiPhraseLog({}, { sessionId }),
      await cmds.munadiLastPhrase({}, { sessionId }),
      await cmds.munadiClear({}, { sessionId }),
      await cmds.munadiReset({}, { sessionId }),
      await cmds.munadiAwaitStable({}, { sessionId, quietMs: 10 }),
      await cmds.munadiGetDroppedCount({}, { sessionId }),
      await cmds.munadiStop({}, { sessionId }),
    ];
    for (const r of calls) {
      expect(() => structuredClone(r)).not.toThrow();
      expect(structuredClone(r)).toEqual(r);
    }
  });
});
