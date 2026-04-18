import type { ScreenReaderHandle, OgmiosEvent } from '../../src/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands } from '../../src/vitest/commands/index.js';
import { OgmiosSessionNotFoundError } from '../../src/vitest/errors.js';
import { SessionStore, type OgmiosSdkDriver } from '../../src/vitest/session-store.js';

function makeMockHandle() {
  const queue: OgmiosEvent[][] = [];
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
    awaitStableLog: vi.fn(async () => [] as OgmiosEvent[]),
  };
  return { handle: h, queueDrain: (evs: OgmiosEvent[]) => queue.push(evs) };
}

function mockDriver(h: ScreenReaderHandle): OgmiosSdkDriver {
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

  it('ogmiosStart returns { sessionId: "ogmios-1" } on first call', async () => {
    const r = await cmds.ogmiosStart({}, {});
    expect(r).toEqual({ sessionId: 'ogmios-1' });
    expect(mh.handle.start).toHaveBeenCalledOnce();
  });

  it('ogmiosDrain returns WireOgmiosEvent[] with tsMs numbers', async () => {
    const { sessionId } = await cmds.ogmiosStart({}, {});
    mh.queueDrain([{ tsNanos: 5_000_000n, source: 'applescript', flags: 0, phrase: 'hi' }]);
    const r = await cmds.ogmiosDrain({}, { sessionId });
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

  it('ogmiosStop returns { stopped, remainingRefs }', async () => {
    const { sessionId } = await cmds.ogmiosStart({}, {});
    const r = await cmds.ogmiosStop({}, { sessionId });
    expect(r).toEqual({ stopped: true, remainingRefs: 0 });
  });

  it('any command on unknown sessionId throws OgmiosSessionNotFoundError', async () => {
    await expect(cmds.ogmiosDrain({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      OgmiosSessionNotFoundError,
    );
    await expect(cmds.ogmiosReset({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      OgmiosSessionNotFoundError,
    );
    await expect(cmds.ogmiosPhraseLog({}, { sessionId: 'nope' })).rejects.toBeInstanceOf(
      OgmiosSessionNotFoundError,
    );
  });

  it('ogmiosAwaitStable forwards timeoutMs as AbortSignal', async () => {
    const { sessionId } = await cmds.ogmiosStart({}, {});
    await cmds.ogmiosAwaitStable({}, { sessionId, quietMs: 10, timeoutMs: 100 });
    const args = (mh.handle.awaitStableLog as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(args.quietMs).toBe(10);
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('ogmiosGetDroppedCount returns number (never bigint)', async () => {
    const { sessionId } = await cmds.ogmiosStart({}, {});
    const r = await cmds.ogmiosGetDroppedCount({}, { sessionId });
    expect(r.droppedCount).toBe(7);
    expect(typeof r.droppedCount).toBe('number');
  });

  it('ogmiosLastPhrase returns null when undefined', async () => {
    (mh.handle.lastPhrase as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const { sessionId } = await cmds.ogmiosStart({}, {});
    const r = await cmds.ogmiosLastPhrase({}, { sessionId });
    expect(r).toBeNull();
  });

  it('every live-path return passes structuredClone round-trip', async () => {
    const { sessionId } = await cmds.ogmiosStart({}, {});
    mh.queueDrain([
      { tsNanos: 1n, source: 'ax', flags: 1, phrase: 'x', role: 'button', name: 'Go' },
    ]);
    const calls = [
      await cmds.ogmiosStart({}, {}),
      await cmds.ogmiosDrain({}, { sessionId }),
      await cmds.ogmiosListen({}, { sessionId, sinceMs: 0 }),
      await cmds.ogmiosPhraseLog({}, { sessionId }),
      await cmds.ogmiosLastPhrase({}, { sessionId }),
      await cmds.ogmiosClear({}, { sessionId }),
      await cmds.ogmiosReset({}, { sessionId }),
      await cmds.ogmiosAwaitStable({}, { sessionId, quietMs: 10 }),
      await cmds.ogmiosGetDroppedCount({}, { sessionId }),
      await cmds.ogmiosStop({}, { sessionId }),
    ];
    for (const r of calls) {
      expect(() => structuredClone(r)).not.toThrow();
      expect(structuredClone(r)).toEqual(r);
    }
  });
});
