import { describe, expect, it } from 'vitest';
import { LogStore } from '../src/handle-internals.js';
import type { MunadiEvent } from '../src/screen-reader.js';

function makeEvent(phrase: string): MunadiEvent {
  return {
    tsNanos: 0n,
    source: 'applescript',
    flags: 0,
    phrase,
  };
}

describe('LogStore phraseLog / lastPhrase / clear semantics', () => {
  it('getAll returns MunadiEvents in order; map(phrase) gives the Guidepup surface', () => {
    const store = new LogStore();
    store.push(makeEvent('one'));
    store.push(makeEvent('two'));
    store.push(makeEvent('three'));
    const phrases = store.getAll().map((e) => e.phrase);
    expect(phrases).toEqual(['one', 'two', 'three']);
  });

  it('lastPhrase returns undefined on empty; string on non-empty', () => {
    const store = new LogStore();
    expect(store.lastPhrase()).toBeUndefined();
    store.push(makeEvent('hello'));
    expect(store.lastPhrase()).toBe('hello');
  });

  it('clear empties the log without affecting the dropped counter', () => {
    const store = new LogStore();
    store.push(makeEvent('a'));
    store.setDroppedCount(7n);
    store.clear();
    expect(store.getAll()).toEqual([]);
    expect(store.droppedCount()).toBe(7n);
  });

  it('getAll returns defensive copies', () => {
    const store = new LogStore();
    store.push(makeEvent('immutable'));
    const snapshot = store.getAll();
    snapshot.length = 0;
    expect(store.getAll()).toHaveLength(1);
  });
});
