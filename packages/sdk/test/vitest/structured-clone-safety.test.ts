import type { ScreenReaderHandle, OgmiosEvent } from '../../src/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCommands } from '../../src/vitest/commands/index.js';
import { OgmiosConcurrentTestError } from '../../src/vitest/errors.js';
import { SessionStore, type OgmiosSdkDriver } from '../../src/vitest/session-store.js';

function makeMockHandle(): ScreenReaderHandle {
  const stop = vi.fn(async () => {});
  return {
    name: 'mock',
    start: vi.fn(async () => {}),
    stop,
    // Phase 7 API reshape: end() aliases stop() — point both at the same mock.
    end: stop,
    deinit: vi.fn(async () => {}),
    drain: vi.fn(async () => [] as OgmiosEvent[]),
    reset: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    listen: vi.fn(() => (async function* () {})()),
    phraseLog: vi.fn(async () => [] as string[]),
    lastPhrase: vi.fn(async () => undefined as string | undefined),
    droppedCount: vi.fn(async () => 0n),
    awaitStableLog: vi.fn(async () => [] as OgmiosEvent[]),
  };
}

function mockDriver(h: ScreenReaderHandle): OgmiosSdkDriver {
  return { create: () => h };
}

describe('structured-clone safety (VITEST-06)', () => {
  let commands: ReturnType<typeof createCommands>;
  let sessionId: string;
  const ctx = {};

  beforeEach(async () => {
    const store = new SessionStore();
    commands = createCommands({ sessionStore: store, driver: mockDriver(makeMockHandle()) });
    const r = await commands.ogmiosStart(ctx, {});
    sessionId = r.sessionId;
  });

  it('ogmiosStart returns clone-safe { sessionId }', async () => {
    const r = await commands.ogmiosStart(ctx, {});
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.sessionId).toBe('string');
  });

  it('ogmiosStop returns clone-safe { stopped, remainingRefs }', async () => {
    const r = await commands.ogmiosStop(ctx, { sessionId });
    expect(structuredClone(r)).toEqual(r);
    expect(typeof r.stopped).toBe('boolean');
    expect(typeof r.remainingRefs).toBe('number');
  });

  it.each([
    ['ogmiosListen', {}],
    ['ogmiosDrain', {}],
    ['ogmiosAwaitStable', { quietMs: 10 }],
  ] as const)('%s returns clone-safe WireOgmiosEvent[]', async (name, extra) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch over command bag
    const r = await (commands as any)[name](ctx, { sessionId, ...extra });
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('ogmiosPhraseLog returns clone-safe string[]', async () => {
    const r = await commands.ogmiosPhraseLog(ctx, { sessionId });
    expect(Array.isArray(r)).toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it('ogmiosLastPhrase returns null or string (never undefined)', async () => {
    const r = await commands.ogmiosLastPhrase(ctx, { sessionId });
    expect(r === null || typeof r === 'string').toBe(true);
    expect(structuredClone(r)).toEqual(r);
  });

  it.each(['ogmiosClear', 'ogmiosReset'] as const)('%s returns { ok: true }', async (name) => {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic dispatch
    const r = await (commands as any)[name](ctx, { sessionId });
    expect(r).toEqual({ ok: true });
    expect(structuredClone(r)).toEqual(r);
  });

  it('ogmiosGetDroppedCount returns number (not bigint)', async () => {
    const r = await commands.ogmiosGetDroppedCount(ctx, { sessionId });
    expect(typeof r.droppedCount).toBe('number');
    expect(structuredClone(r)).toEqual(r);
  });
});

describe('OgmiosConcurrentTestError', () => {
  it('carries the expected code and message prefix', () => {
    const e = new OgmiosConcurrentTestError();
    expect(e.code).toBe('ERR_OGMIOS_CONCURRENT_TEST');
    expect(e.message).toContain('VoiceOver is a system singleton');
  });
});
