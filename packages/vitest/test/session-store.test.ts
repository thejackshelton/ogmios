import type { ScreenReaderHandle, ShokiEvent } from '@shoki/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShokiSessionNotFoundError } from '../src/errors.js';
import { SessionStore, type ShokiSdkDriver, toWireEvent } from '../src/session-store.js';

function makeMockHandle() {
  const eventsOnNextDrain: ShokiEvent[][] = [];
  const handle: ScreenReaderHandle = {
    name: 'mock',
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    deinit: vi.fn(async () => {}),
    drain: vi.fn(async () => eventsOnNextDrain.shift() ?? []),
    reset: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    listen: vi.fn(() => (async function* () {})()),
    phraseLog: vi.fn(async () => ['alpha', 'beta']),
    lastPhrase: vi.fn(async () => 'beta' as string | undefined),
    droppedCount: vi.fn(async () => 0n),
    awaitStableLog: vi.fn(async () => [] as ShokiEvent[]),
  };
  return { handle, queueNextDrain: (evs: ShokiEvent[]) => eventsOnNextDrain.push(evs) };
}

function mockDriver(factory: () => ScreenReaderHandle): ShokiSdkDriver & { createCalls: number } {
  let calls = 0;
  const d = {
    create: (): ScreenReaderHandle => {
      calls += 1;
      return factory();
    },
    get createCalls() {
      return calls;
    },
  };
  return d as ShokiSdkDriver & { createCalls: number };
}

function ev(tsNanos: bigint, phrase: string, role?: string): ShokiEvent {
  return { tsNanos, source: 'applescript', flags: 0, phrase, role, name: undefined };
}

describe('SessionStore', () => {
  let store: SessionStore;
  beforeEach(() => {
    store = new SessionStore();
  });

  it('first start boots VO; second start reuses handle (refcount=2)', async () => {
    const mh = makeMockHandle();
    const driver = mockDriver(() => mh.handle);
    const id1 = await store.start(driver, {});
    const id2 = await store.start(driver, {});
    expect(id1).toBe('shoki-1');
    expect(id2).toBe('shoki-2');
    expect(driver.createCalls).toBe(1);
    expect(mh.handle.start).toHaveBeenCalledTimes(1);
    expect(store._startRefs).toBe(2);
  });

  it('refcount is NOT incremented when start fails', async () => {
    const driver: ShokiSdkDriver = {
      create: () => {
        throw new Error('boom');
      },
    };
    await expect(store.start(driver, {})).rejects.toThrow('boom');
    expect(store._startRefs).toBe(0);

    const mh = makeMockHandle();
    const d2 = mockDriver(() => mh.handle);
    const id = await store.start(d2, {});
    expect(id).toBe('shoki-1'); // counter advances from 0, not 1
    expect(store._startRefs).toBe(1);
  });

  it('stop decrements; last stop calls handle.stop then handle.deinit', async () => {
    const mh = makeMockHandle();
    const driver = mockDriver(() => mh.handle);
    const id1 = await store.start(driver, {});
    const id2 = await store.start(driver, {});
    let r = await store.stop(id1);
    expect(r.stopped).toBe(false);
    expect(r.remainingRefs).toBe(1);
    expect(mh.handle.stop).toHaveBeenCalledTimes(0);
    r = await store.stop(id2);
    expect(r.stopped).toBe(true);
    expect(r.remainingRefs).toBe(0);
    expect(mh.handle.stop).toHaveBeenCalledOnce();
    expect(mh.handle.deinit).toHaveBeenCalledOnce();
    const stopOrder = (mh.handle.stop as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0] as number;
    const deinitOrder = (mh.handle.deinit as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0] as number;
    expect(stopOrder).toBeLessThan(deinitOrder);
  });

  it('stop on unknown id throws ShokiSessionNotFoundError', async () => {
    await expect(store.stop('does-not-exist')).rejects.toBeInstanceOf(ShokiSessionNotFoundError);
  });

  it('reset clears cursors and calls handle.reset', async () => {
    const mh = makeMockHandle();
    mh.queueNextDrain([ev(1_000_000n, 'a'), ev(2_000_000n, 'b')]);
    const driver = mockDriver(() => mh.handle);
    const id = await store.start(driver, {});
    const drained = await store.drain(id);
    expect(drained.length).toBe(2);
    mh.queueNextDrain([]);
    await store.reset(id);
    expect(mh.handle.reset).toHaveBeenCalledOnce();
    expect(await store.drain(id)).toEqual([]);
  });

  it('two sessions keep independent cursors', async () => {
    const mh = makeMockHandle();
    mh.queueNextDrain([ev(1_000_000n, 'a'), ev(2_000_000n, 'b')]);
    const driver = mockDriver(() => mh.handle);
    const id1 = await store.start(driver, {});
    const d1 = await store.drain(id1);
    expect(d1.length).toBe(2);

    const id2 = await store.start(driver, {});
    // session 2 was created AFTER events landed — its initial cursor is at the
    // current tail so it sees nothing new:
    expect(await store.drain(id2)).toEqual([]);

    // Push 3 more; session 1 sees those 3; session 2 sees those 3 too (independent cursor).
    mh.queueNextDrain([ev(3_000_000n, 'c'), ev(4_000_000n, 'd'), ev(5_000_000n, 'e')]);
    const d1b = await store.drain(id1);
    expect(d1b.length).toBe(3);
    const d2b = await store.drain(id2);
    expect(d2b.length).toBe(3);
  });

  it('awaitStable forwards quietMs and passes AbortSignal when timeoutMs given', async () => {
    const mh = makeMockHandle();
    const driver = mockDriver(() => mh.handle);
    const id = await store.start(driver, {});
    await store.awaitStable(id, { quietMs: 30, timeoutMs: 500 });
    const args = (mh.handle.awaitStableLog as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(args.quietMs).toBe(30);
    expect(args.signal).toBeInstanceOf(AbortSignal);
  });

  it('getDroppedCount returns number, not bigint', async () => {
    const mh = makeMockHandle();
    (mh.handle.droppedCount as ReturnType<typeof vi.fn>).mockResolvedValue(42n);
    const driver = mockDriver(() => mh.handle);
    const id = await store.start(driver, {});
    const r = await store.getDroppedCount(id);
    expect(typeof r.droppedCount).toBe('number');
    expect(r.droppedCount).toBe(42);
  });

  it('lastPhrase converts undefined -> null', async () => {
    const mh = makeMockHandle();
    (mh.handle.lastPhrase as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const driver = mockDriver(() => mh.handle);
    const id = await store.start(driver, {});
    expect(await store.lastPhrase(id)).toBeNull();
  });
});

describe('toWireEvent', () => {
  it('floors tsNanos to ms', () => {
    const w = toWireEvent({
      tsNanos: 1_500_000n,
      source: 'applescript',
      flags: 1,
      phrase: 'hi',
    });
    expect(w).toEqual({
      tsMs: 1,
      source: 'applescript',
      flags: 1,
      phrase: 'hi',
      role: undefined,
      name: undefined,
    });
  });

  it('handles zero tsNanos', () => {
    const w = toWireEvent({ tsNanos: 0n, source: 'ax', flags: 0, phrase: '' });
    expect(w.tsMs).toBe(0);
  });
});
