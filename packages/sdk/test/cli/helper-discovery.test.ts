import { describe, expect, it } from 'vitest';
import { discoverHelper } from '../../src/cli/helper-discovery.js';

function mkExists(knownPaths: string[]) {
  const set = new Set(knownPaths);
  return async (p: string) => set.has(p);
}

describe('discoverHelper', () => {
  it('returns env/flag override when the override path exists', async () => {
    const override = '/tmp/custom/OgmiosRunner.app';
    const { location, searched } = await discoverHelper({
      overridePath: override,
      exists: mkExists([override]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toEqual({ path: override, source: 'env' });
    expect(searched[0]).toBe(override);
  });

  it('falls through to installed path (~/Applications) when override does not exist', async () => {
    const { location } = await discoverHelper({
      overridePath: '/nope',
      // Simulate the installed bundle: accept whatever path ~/Applications resolved to.
      exists: async (p) => p.endsWith('/Applications/OgmiosRunner.app'),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).not.toBeNull();
    expect(location?.source).toBe('installed');
    expect(location?.path.endsWith('/Applications/OgmiosRunner.app')).toBe(true);
  });

  it('falls through to npm path when installed path is absent', async () => {
    const npmPath = '/repo/node_modules/ogmios-darwin-arm64/helper/OgmiosRunner.app';
    const { location } = await discoverHelper({
      exists: mkExists([npmPath]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toEqual({ path: npmPath, source: 'npm' });
  });

  it('falls through to dev path only when Package.swift sibling is present', async () => {
    const devPath = '/repo/helper/.build/OgmiosRunner.app';
    const manifest = '/repo/helper/Package.swift';
    const { location } = await discoverHelper({
      exists: mkExists([devPath, manifest]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toEqual({ path: devPath, source: 'dev' });
  });

  it('does NOT match dev path when Package.swift is missing (avoids false positive on a stale build dir)', async () => {
    const devPath = '/repo/helper/.build/OgmiosRunner.app';
    const { location } = await discoverHelper({
      exists: mkExists([devPath]), // no Package.swift
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toBeNull();
  });

  it('returns null with all searched paths when nothing exists', async () => {
    const { location, searched } = await discoverHelper({
      exists: mkExists([]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toBeNull();
    // installed + npm + dev = 3 (no override provided).
    expect(searched.length).toBeGreaterThanOrEqual(3);
  });

  it('uses the right binding package name for darwin-x64', async () => {
    const npmPath = '/repo/node_modules/ogmios-darwin-x64/helper/OgmiosRunner.app';
    const { location } = await discoverHelper({
      exists: mkExists([npmPath]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'x64',
    });
    expect(location).toMatchObject({ path: npmPath });
  });
});
