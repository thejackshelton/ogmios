import { describe, expect, it } from 'vitest';
import { createCommands } from '../src/commands/index.js';
import { ShokiConcurrentTestError } from '../src/errors.js';

describe('structured-clone safety (VITEST-06)', () => {
  const commands = createCommands();
  const ctx = {};

  it('shokiStart returns clone-safe { sessionId }', async () => {
    const r = await commands.shokiStart(ctx, {});
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.sessionId).toBe('string');
  });

  it('shokiStop returns clone-safe { stopped, remainingRefs }', async () => {
    const r = await commands.shokiStop(ctx, { sessionId: 'shoki-1' });
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.stopped).toBe('boolean');
    expect(typeof r.remainingRefs).toBe('number');
  });

  it.each([
    ['shokiListen', { sessionId: 'shoki-1' }],
    ['shokiDrain', { sessionId: 'shoki-1' }],
    ['shokiAwaitStable', { sessionId: 'shoki-1', quietMs: 10 }],
  ] as const)('%s returns clone-safe WireShokiEvent[]', async (name, args) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch over command bag
    const r = await (commands as any)[name](ctx, args);
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('shokiPhraseLog returns clone-safe string[]', async () => {
    const r = await commands.shokiPhraseLog(ctx, { sessionId: 'shoki-1' });
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('shokiLastPhrase returns null or string (never undefined)', async () => {
    const r = await commands.shokiLastPhrase(ctx, { sessionId: 'shoki-1' });
    expect(r === null || typeof r === 'string').toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it.each(['shokiClear', 'shokiReset'] as const)('%s returns { ok: true }', async (name) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch
    const r = await (commands as any)[name](ctx, { sessionId: 'shoki-1' });
    expect(r).toEqual({ ok: true });
    expect(structuredClone(r)).toEqual(r);
  });

  it('shokiGetDroppedCount returns number (not bigint)', async () => {
    const r = await commands.shokiGetDroppedCount(ctx, { sessionId: 'shoki-1' });
    expect(typeof r.droppedCount).toBe('number');
    expect(structuredClone(r)).toEqual(r);
  });
});

describe('ShokiConcurrentTestError', () => {
  it('carries the expected code and message prefix', () => {
    const e = new ShokiConcurrentTestError();
    expect(e.code).toBe('ERR_SHOKI_CONCURRENT_TEST');
    expect(e.message).toContain('VoiceOver is a system singleton');
  });
});
