import type { ScreenReaderHandle, ShokiEvent } from '@shoki/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands } from '../src/commands/index.js';
import { ShokiConcurrentTestError } from '../src/errors.js';
import { SessionStore, type ShokiSdkDriver } from '../src/session-store.js';

function makeMockHandle(): ScreenReaderHandle {
  const stop = vi.fn(async () => {});
  return {
    name: 'mock',
    start: vi.fn(async () => {}),
    stop,
    // Phase 7 API reshape: end() aliases stop() — point both at the same mock.
    end: stop,
    deinit: vi.fn(async () => {}),
    drain: vi.fn(async () => [] as ShokiEvent[]),
    reset: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    listen: vi.fn(() => (async function* () {})()),
    phraseLog: vi.fn(async () => [] as string[]),
    lastPhrase: vi.fn(async () => undefined as string | undefined),
    droppedCount: vi.fn(async () => 0n),
    awaitStableLog: vi.fn(async () => [] as ShokiEvent[]),
  };
}

function mockDriver(h: ScreenReaderHandle): ShokiSdkDriver {
  return { create: () => h };
}

describe('structured-clone safety (VITEST-06)', () => {
  let commands: ReturnType<typeof createCommands>;
  let sessionId: string;
  const ctx = {};

  beforeEach(async () => {
    const store = new SessionStore();
    commands = createCommands({ sessionStore: store, driver: mockDriver(makeMockHandle()) });
    const r = await commands.shokiStart(ctx, {});
    sessionId = r.sessionId;
  });

  it('shokiStart returns clone-safe { sessionId }', async () => {
    const r = await commands.shokiStart(ctx, {});
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.sessionId).toBe('string');
  });

  it('shokiStop returns clone-safe { stopped, remainingRefs }', async () => {
    const r = await commands.shokiStop(ctx, { sessionId });
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.stopped).toBe('boolean');
    expect(typeof r.remainingRefs).toBe('number');
  });

  it.each([
    ['shokiListen', {}],
    ['shokiDrain', {}],
    ['shokiAwaitStable', { quietMs: 10 }],
  ] as const)('%s returns clone-safe WireShokiEvent[]', async (name, extra) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch over command bag
    const r = await (commands as any)[name](ctx, { sessionId, ...extra });
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('shokiPhraseLog returns clone-safe string[]', async () => {
    const r = await commands.shokiPhraseLog(ctx, { sessionId });
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('shokiLastPhrase returns null or string (never undefined)', async () => {
    const r = await commands.shokiLastPhrase(ctx, { sessionId });
    expect(r === null || typeof r === 'string').toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it.each(['shokiClear', 'shokiReset'] as const)('%s returns { ok: true }', async (name) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch
    const r = await (commands as any)[name](ctx, { sessionId });
    expect(r).toEqual({ ok: true });
    expect(structuredClone(r)).toEqual(r);
  });

  it('shokiGetDroppedCount returns number (not bigint)', async () => {
    const r = await commands.shokiGetDroppedCount(ctx, { sessionId });
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
