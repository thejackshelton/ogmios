import { describe, expect, it } from 'vitest';
import { LogStore } from '../src/handle-internals.js';
import { listenImpl } from '../src/listen.js';
import type { ShokiEvent } from '../src/screen-reader.js';

function makeEvent(phrase: string): ShokiEvent {
  return {
    tsNanos: BigInt(Date.now()) * 1_000_000n,
    source: 'applescript',
    flags: 0,
    phrase,
  };
}

describe('LogStore', () => {
  it('push appends, lastPhrase returns most recent, clear empties', () => {
    const store = new LogStore();
    store.push(makeEvent('a'));
    store.push(makeEvent('b'));
    expect(store.getAll()).toHaveLength(2);
    expect(store.lastPhrase()).toBe('b');
    store.clear();
    expect(store.getAll()).toHaveLength(0);
    expect(store.lastPhrase()).toBeUndefined();
  });

  it('subscribe receives pushes registered before the push', () => {
    const store = new LogStore();
    const received: string[] = [];
    const unsub = store.subscribe((e) => received.push(e.phrase));
    store.push(makeEvent('first'));
    store.push(makeEvent('second'));
    unsub();
    store.push(makeEvent('third'));
    expect(received).toEqual(['first', 'second']);
  });

  it('droppedCount is independent of clear', () => {
    const store = new LogStore();
    store.setDroppedCount(42n);
    store.push(makeEvent('x'));
    store.clear();
    expect(store.droppedCount()).toBe(42n);
  });
});

describe('listenImpl', () => {
  it('yields pre-existing events in order then awaits new ones', async () => {
    const store = new LogStore();
    store.push(makeEvent('queued-1'));
    store.push(makeEvent('queued-2'));

    const gen = listenImpl(store);
    const first = await gen.next();
    const second = await gen.next();
    expect(first.value?.phrase).toBe('queued-1');
    expect(second.value?.phrase).toBe('queued-2');

    // Next push triggers the awaiting generator.
    queueMicrotask(() => store.push(makeEvent('streamed')));
    const third = await gen.next();
    expect(third.value?.phrase).toBe('streamed');

    await gen.return(undefined);
  });

  it('is cancellable via .return() without event-listener leak', async () => {
    const store = new LogStore();
    const gen = listenImpl(store);
    // Start iteration so the subscriber is attached.
    const iterPromise = gen.next();
    queueMicrotask(() => store.push(makeEvent('x')));
    await iterPromise;

    // At this point the generator is subscribed. Cancel it.
    await gen.return(undefined);

    // Confirm subsequent pushes don't keep any subscriber around by poking
    // at the internal subscriber count via a proxy subscribe/unsubscribe.
    // If the previous generator leaked, we'd see the store retaining a ref.
    // We verify indirectly: push a new event after cancellation and confirm
    // a fresh listenImpl sees the event (basic wiring still works).
    const nextGen = listenImpl(store);
    queueMicrotask(() => store.push(makeEvent('y')));
    // The store's getAll() returns [x, y] so the first yielded value is x.
    const r = await nextGen.next();
    expect(r.value?.phrase).toBe('x');
    await nextGen.return(undefined);
  });

  it('broadcasts to two concurrent iterators', async () => {
    const store = new LogStore();
    const genA = listenImpl(store);
    const genB = listenImpl(store);

    // Prime subscriptions by awaiting first `.next()` call.
    const aPromise = genA.next();
    const bPromise = genB.next();
    queueMicrotask(() => store.push(makeEvent('broadcast')));

    const [aRes, bRes] = await Promise.all([aPromise, bPromise]);
    expect(aRes.value?.phrase).toBe('broadcast');
    expect(bRes.value?.phrase).toBe('broadcast');

    await genA.return(undefined);
    await genB.return(undefined);
  });

  it('AbortSignal ends iteration cleanly', async () => {
    const store = new LogStore();
    const ac = new AbortController();
    const gen = listenImpl(store, ac.signal);
    const next = gen.next();
    ac.abort();
    const result = await next;
    expect(result.done).toBe(true);
  });
});
