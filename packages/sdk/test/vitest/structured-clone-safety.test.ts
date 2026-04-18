import type { ScreenReaderHandle, MunadiEvent } from '../../src/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands } from '../../src/vitest/commands/index.js';
import { MunadiConcurrentTestError } from '../../src/vitest/errors.js';
import { SessionStore, type MunadiSdkDriver } from '../../src/vitest/session-store.js';

function makeMockHandle(): ScreenReaderHandle {
  const stop = vi.fn(async () => {});
  return {
    name: 'mock',
    start: vi.fn(async () => {}),
    stop,
    // Phase 7 API reshape: end() aliases stop() — point both at the same mock.
    end: stop,
    deinit: vi.fn(async () => {}),
    drain: vi.fn(async () => [] as MunadiEvent[]),
    reset: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    listen: vi.fn(() => (async function* () {})()),
    phraseLog: vi.fn(async () => [] as string[]),
    lastPhrase: vi.fn(async () => undefined as string | undefined),
    droppedCount: vi.fn(async () => 0n),
    awaitStableLog: vi.fn(async () => [] as MunadiEvent[]),
  };
}

function mockDriver(h: ScreenReaderHandle): MunadiSdkDriver {
  return { create: () => h };
}

describe('structured-clone safety (VITEST-06)', () => {
  let commands: ReturnType<typeof createCommands>;
  let sessionId: string;
  const ctx = {};

  beforeEach(async () => {
    const store = new SessionStore();
    commands = createCommands({ sessionStore: store, driver: mockDriver(makeMockHandle()) });
    const r = await commands.munadiStart(ctx, {});
    sessionId = r.sessionId;
  });

  it('munadiStart returns clone-safe { sessionId }', async () => {
    const r = await commands.munadiStart(ctx, {});
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.sessionId).toBe('string');
  });

  it('munadiStop returns clone-safe { stopped, remainingRefs }', async () => {
    const r = await commands.munadiStop(ctx, { sessionId });
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.stopped).toBe('boolean');
    expect(typeof r.remainingRefs).toBe('number');
  });

  it.each([
    ['munadiListen', {}],
    ['munadiDrain', {}],
    ['munadiAwaitStable', { quietMs: 10 }],
  ] as const)('%s returns clone-safe WireMunadiEvent[]', async (name, extra) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch over command bag
    const r = await (commands as any)[name](ctx, { sessionId, ...extra });
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('munadiPhraseLog returns clone-safe string[]', async () => {
    const r = await commands.munadiPhraseLog(ctx, { sessionId });
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('munadiLastPhrase returns null or string (never undefined)', async () => {
    const r = await commands.munadiLastPhrase(ctx, { sessionId });
    expect(r === null || typeof r === 'string').toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it.each(['munadiClear', 'munadiReset'] as const)('%s returns { ok: true }', async (name) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch
    const r = await (commands as any)[name](ctx, { sessionId });
    expect(r).toEqual({ ok: true });
    expect(structuredClone(r)).toEqual(r);
  });

  it('munadiGetDroppedCount returns number (not bigint)', async () => {
    const r = await commands.munadiGetDroppedCount(ctx, { sessionId });
    expect(typeof r.droppedCount).toBe('number');
    expect(structuredClone(r)).toEqual(r);
  });
});

describe('MunadiConcurrentTestError', () => {
  it('carries the expected code and message prefix', () => {
    const e = new MunadiConcurrentTestError();
    expect(e.code).toBe('ERR_MUNADI_CONCURRENT_TEST');
    expect(e.message).toContain('VoiceOver is a system singleton');
  });
});
