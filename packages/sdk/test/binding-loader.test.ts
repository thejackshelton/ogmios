import { describe, expect, it } from 'vitest';
import { loadBinding, resolveBindingPackage } from '../src/binding-loader.js';
import { UnsupportedPlatformError } from '../src/errors.js';

describe('resolveBindingPackage', () => {
  it('returns the darwin-arm64 package on darwin-arm64', () => {
    expect(resolveBindingPackage('darwin', 'arm64')).toBe('@shoki/binding-darwin-arm64');
  });

  it('returns the darwin-x64 package on darwin-x64', () => {
    expect(resolveBindingPackage('darwin', 'x64')).toBe('@shoki/binding-darwin-x64');
  });

  it('throws UnsupportedPlatformError on unsupported combos', () => {
    expect(() => resolveBindingPackage('linux', 'x64')).toThrow(UnsupportedPlatformError);
    expect(() => resolveBindingPackage('win32', 'x64')).toThrow(UnsupportedPlatformError);
  });
});

describe('loadBinding', () => {
  it('loads the native addon exposing the Phase 1 N-API surface', () => {
    // Runs on darwin only in CI; skips elsewhere so local non-mac devs can lint.
    if (process.platform !== 'darwin') return;
    // Also skip if the native binding hasn't been built yet (e.g., developer
    // checked out before running `zig build`). Document via env var so CI is
    // explicit about when the native surface should be present.
    if (!process.env.SHOKI_NATIVE_BUILT) return;
    const binding = loadBinding();
    expect(typeof binding.ping).toBe('function');
    expect(typeof binding.createDriver).toBe('function');
    expect(typeof binding.wireVersion).toBe('function');
  });
});
