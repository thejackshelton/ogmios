import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the voiceOver() factory. We mock createDriverHandle so the
 * factory can be exercised without an actual native binding — the wire-level
 * round-trip lives in integration (Plan 07).
 */

async function withPlatform(value: string, fn: () => void | Promise<void>): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value, configurable: true, writable: true });
  try {
    await fn();
  } finally {
    if (original) Object.defineProperty(process, 'platform', original);
  }
}

describe('voiceOver() factory', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('resolves to the voiceover driver on darwin', async () => {
    const createdCalls: unknown[] = [];
    vi.doMock('../src/driver-handle.js', () => ({
      createDriverHandle: (opts: unknown) => {
        createdCalls.push(opts);
        return { name: 'voiceover' };
      },
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      const handle = voiceOver({ logBufferSize: 500 });
      expect(handle.name).toBe('voiceover');
      expect(createdCalls).toHaveLength(1);
      expect(createdCalls[0]).toMatchObject({
        driverName: 'voiceover',
        logBufferSize: 500,
      });
    });
  });

  it('throws VoiceOverUnsupportedPlatformError on linux', async () => {
    await withPlatform('linux', async () => {
      const { voiceOver, VoiceOverUnsupportedPlatformError } = await import(
        '../src/voice-over.js'
      );
      expect(() => voiceOver({})).toThrow(VoiceOverUnsupportedPlatformError);
      expect(() => voiceOver({})).toThrow(/macOS-only/);
    });
  });

  it('throws VoiceOverUnsupportedPlatformError on win32', async () => {
    await withPlatform('win32', async () => {
      const { voiceOver, VoiceOverUnsupportedPlatformError } = await import(
        '../src/voice-over.js'
      );
      expect(() => voiceOver()).toThrow(VoiceOverUnsupportedPlatformError);
    });
  });

  it('passes logBufferSize through to createDriverHandle', async () => {
    const createdCalls: Array<Record<string, unknown>> = [];
    vi.doMock('../src/driver-handle.js', () => ({
      createDriverHandle: (opts: Record<string, unknown>) => {
        createdCalls.push(opts);
        return { name: 'voiceover' };
      },
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      voiceOver({ logBufferSize: 12345 });
      expect(createdCalls[0]?.logBufferSize).toBe(12345);
    });
  });
});

/**
 * API reshape (Phase 7 Plan 03): ScreenReaderHandle.end() alias,
 * top-level voiceOver.start()/voiceOver.end() process-singleton, and
 * proof that reset() does NOT respawn the native driver.
 *
 * These tests mock the native binding (binding-loader) so they exercise
 * the TS surface without booting real VoiceOver. Each test re-imports the
 * modules with a fresh vi.doMock so the singleton state never leaks across
 * test boundaries.
 */
describe('API reshape (Phase 7)', () => {
  beforeEach(() => {
    vi.resetModules();
    // Ensure the previous describe-block's doMock of driver-handle.js does
    // not bleed into this block — these tests want the REAL driver-handle
    // on top of a mocked binding-loader.
    vi.doUnmock('../src/driver-handle.js');
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../src/binding-loader.js');
    vi.restoreAllMocks();
  });

  function mockBinding(): {
    createDriver: ReturnType<typeof vi.fn>;
    driverStart: ReturnType<typeof vi.fn>;
    driverStop: ReturnType<typeof vi.fn>;
    driverReset: ReturnType<typeof vi.fn>;
    driverDrain: ReturnType<typeof vi.fn>;
    driverDeinit: ReturnType<typeof vi.fn>;
    droppedCount: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    version: ReturnType<typeof vi.fn>;
    wireVersion: ReturnType<typeof vi.fn>;
  } {
    let nextId = 1n;
    return {
      createDriver: vi.fn(() => {
        const id = nextId;
        nextId += 1n;
        return id;
      }),
      driverStart: vi.fn(() => true),
      driverStop: vi.fn(() => true),
      driverReset: vi.fn(() => true),
      driverDrain: vi.fn(() => Buffer.alloc(0)),
      driverDeinit: vi.fn(() => true),
      droppedCount: vi.fn(() => 0n),
      ping: vi.fn(() => 'pong'),
      version: vi.fn(() => '0.0.0-test'),
      wireVersion: vi.fn(() => 1),
    };
  }

  it('handle.end() is an alias for handle.stop()', async () => {
    const binding = mockBinding();
    vi.doMock('../src/binding-loader.js', () => ({
      loadBinding: () => binding,
      __resetBindingCacheForTests: () => {},
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      const handle = voiceOver();
      await handle.start();

      // Both end() and stop() must exist as functions.
      expect(typeof handle.end).toBe('function');
      expect(typeof handle.stop).toBe('function');

      // Calling end() once invokes the native stop.
      await handle.end();
      expect(binding.driverStop).toHaveBeenCalledTimes(1);

      // Calling stop() also invokes the native stop (same wire call).
      await handle.stop();
      expect(binding.driverStop).toHaveBeenCalledTimes(2);

      await handle.deinit();
    });
  });

  it('voiceOver.start() returns the same singleton handle on repeated calls', async () => {
    const binding = mockBinding();
    vi.doMock('../src/binding-loader.js', () => ({
      loadBinding: () => binding,
      __resetBindingCacheForTests: () => {},
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      const h1 = await voiceOver.start();
      const h2 = await voiceOver.start();
      expect(h1).toBe(h2);
      // Only one native driver was created.
      expect(binding.createDriver).toHaveBeenCalledTimes(1);
      // start was only called on the underlying handle once.
      expect(binding.driverStart).toHaveBeenCalledTimes(1);

      await voiceOver.end();
      await voiceOver.end();
    });
  });

  it('voiceOver.start() refcounts; only last end() tears down', async () => {
    const binding = mockBinding();
    vi.doMock('../src/binding-loader.js', () => ({
      loadBinding: () => binding,
      __resetBindingCacheForTests: () => {},
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      await voiceOver.start();
      await voiceOver.start();

      // First end -> still alive
      await voiceOver.end();
      expect(binding.driverDeinit).toHaveBeenCalledTimes(0);
      expect(binding.driverStop).toHaveBeenCalledTimes(0);

      // Second end -> tears down
      await voiceOver.end();
      expect(binding.driverStop).toHaveBeenCalledTimes(1);
      expect(binding.driverDeinit).toHaveBeenCalledTimes(1);
    });
  });

  it('voiceOver.end() is a no-op when no singleton is active', async () => {
    const binding = mockBinding();
    vi.doMock('../src/binding-loader.js', () => ({
      loadBinding: () => binding,
      __resetBindingCacheForTests: () => {},
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      // end() with no prior start() must NOT throw and must NOT call deinit.
      await expect(voiceOver.end()).resolves.toBeUndefined();
      expect(binding.driverDeinit).toHaveBeenCalledTimes(0);
      expect(binding.driverStop).toHaveBeenCalledTimes(0);

      // After a balanced start/end, further end() calls are also no-ops.
      await voiceOver.start();
      await voiceOver.end();
      expect(binding.driverDeinit).toHaveBeenCalledTimes(1);
      await voiceOver.end();
      expect(binding.driverDeinit).toHaveBeenCalledTimes(1);
    });
  });

  it('handle.reset() does not re-create the native driver', async () => {
    const binding = mockBinding();
    vi.doMock('../src/binding-loader.js', () => ({
      loadBinding: () => binding,
      __resetBindingCacheForTests: () => {},
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      const handle = voiceOver();
      await handle.start();
      // Three resets — must all go through the existing driver id,
      // not re-create a new one.
      await handle.reset();
      await handle.reset();
      await handle.reset();
      expect(binding.createDriver).toHaveBeenCalledTimes(1);
      expect(binding.driverReset).toHaveBeenCalledTimes(3);
      await handle.deinit();
    });
  });

  it('handle.reset() completes in <100ms on the mock path', async () => {
    const binding = mockBinding();
    vi.doMock('../src/binding-loader.js', () => ({
      loadBinding: () => binding,
      __resetBindingCacheForTests: () => {},
    }));

    await withPlatform('darwin', async () => {
      const { voiceOver } = await import('../src/voice-over.js');
      const handle = voiceOver();
      await handle.start();
      const start = performance.now();
      await handle.reset();
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
      await handle.deinit();
    });
  });
});
