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
