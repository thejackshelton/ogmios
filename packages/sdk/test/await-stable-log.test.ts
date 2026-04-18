import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LogStore } from '../src/handle-internals.js';
import type { OgmiosEvent } from '../src/screen-reader.js';

function makeEvent(phrase: string): OgmiosEvent {
  return { tsNanos: 0n, source: 'applescript', flags: 0, phrase };
}

describe('LogStore.awaitStable (awaitStableLog)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after quietMs with empty log when nothing pushes', async () => {
    const store = new LogStore();
    const promise = store.awaitStable({ quietMs: 100 });

    await vi.advanceTimersByTimeAsync(99);
    // Still pending at 99ms.
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const snapshot = await promise;
    expect(snapshot).toEqual([]);
  });

  it('resets the timer on each push; resolves quietMs after the LAST push', async () => {
    const store = new LogStore();
    const promise = store.awaitStable({ quietMs: 100 });

    // Push at t=50 — timer resets, next resolution at t=50+100=150.
    await vi.advanceTimersByTimeAsync(50);
    store.push(makeEvent('hello'));

    await vi.advanceTimersByTimeAsync(99);
    // Still pending at total 149ms.
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const snapshot = await promise;
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.phrase).toBe('hello');
  });

  it('three pushes in sequence defer resolution to 100ms after the last', async () => {
    const store = new LogStore();
    const promise = store.awaitStable({ quietMs: 100 });

    await vi.advanceTimersByTimeAsync(20);
    store.push(makeEvent('a'));
    await vi.advanceTimersByTimeAsync(20);
    store.push(makeEvent('b'));
    await vi.advanceTimersByTimeAsync(20);
    store.push(makeEvent('c'));

    // Now at t=60 with 3 events pushed. Resolution should fire at t=60+100=160.
    await vi.advanceTimersByTimeAsync(99);
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const snapshot = await promise;
    expect(snapshot.map((e) => e.phrase)).toEqual(['a', 'b', 'c']);
  });

  it('quietMs=0 resolves on next tick with current snapshot', async () => {
    const store = new LogStore();
    store.push(makeEvent('x'));
    const promise = store.awaitStable({ quietMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    const snapshot = await promise;
    expect(snapshot.map((e) => e.phrase)).toEqual(['x']);
  });

  it('AbortSignal aborts the pending promise with AbortError', async () => {
    const store = new LogStore();
    const ac = new AbortController();
    const promise = store.awaitStable({ quietMs: 1000, signal: ac.signal });
    ac.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('negative / NaN quietMs throws TypeError synchronously', () => {
    const store = new LogStore();
    expect(() => store.awaitStable({ quietMs: -1 })).toThrow(TypeError);
    expect(() => store.awaitStable({ quietMs: Number.NaN })).toThrow(TypeError);
    expect(() => store.awaitStable({ quietMs: Number.POSITIVE_INFINITY })).toThrow(TypeError);
  });
});
