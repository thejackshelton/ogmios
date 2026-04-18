import { describe, expect, it } from 'vitest';
import { ping, version, wireVersion } from '../src/index.js';

const isMac = process.platform === 'darwin';
// Native-binding tests only run when the Zig addon has been built locally or in CI.
// See packages/sdk/README.md for how to set OGMIOS_NATIVE_BUILT=1 after `zig build`.
const nativeReady = isMac && !!process.env.OGMIOS_NATIVE_BUILT;

describe.skipIf(!nativeReady)('native binding round-trip', () => {
  it('ping returns "pong"', () => {
    expect(ping()).toBe('pong');
  });

  it('version returns a non-empty string', () => {
    const v = version();
    expect(typeof v).toBe('string');
    expect(v.length).toBeGreaterThan(0);
  });

  it('wireVersion matches the TS EXPECTED_WIRE_VERSION', async () => {
    const { EXPECTED_WIRE_VERSION } = await import('../src/wire.js');
    expect(wireVersion()).toBe(EXPECTED_WIRE_VERSION);
  });
});
