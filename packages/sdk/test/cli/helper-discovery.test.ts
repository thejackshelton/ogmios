import { describe, expect, it } from 'vitest';
import { discoverHelper } from '../../src/cli/checks/helper-discovery.js';
import { ExitCode } from '../../src/cli/report-types.js';

function mkExists(knownPaths: string[]) {
  const set = new Set(knownPaths);
  return async (p: string) => set.has(p);
}

describe('discoverHelper', () => {
  it('returns env/flag override when the override path exists', async () => {
    const override = '/tmp/custom/ShokiRunner.app';
    const { location, result } = await discoverHelper({
      overridePath: override,
      exists: mkExists([override]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toEqual({ path: override, source: 'env' });
    expect(result.status).toBe('pass');
  });

  it('falls through to npm path when override does not exist', async () => {
    const npmPath = '/repo/node_modules/@shoki/binding-darwin-arm64/helper/ShokiRunner.app';
    const { location, result } = await discoverHelper({
      overridePath: '/nope',
      exists: mkExists([npmPath]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toEqual({ path: npmPath, source: 'npm' });
    expect(result.status).toBe('pass');
  });

  it('falls through to dev path only when Package.swift sibling is present', async () => {
    const devPath = '/repo/helper/.build/ShokiRunner.app';
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
    const devPath = '/repo/helper/.build/ShokiRunner.app';
    const { location, result } = await discoverHelper({
      exists: mkExists([devPath]), // no Package.swift
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toBeNull();
    expect(result.status).toBe('fail');
  });

  it('fails with HELPER_MISSING when no path exists', async () => {
    const { location, result } = await discoverHelper({
      exists: mkExists([]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'arm64',
    });
    expect(location).toBeNull();
    expect(result.status).toBe('fail');
    expect(result.exitCode).toBe(ExitCode.HELPER_MISSING);
    expect(result.detail).toMatch(/node_modules\/@shoki\/binding-darwin-arm64/);
  });

  it('uses the right binding package name for darwin-x64', async () => {
    const npmPath = '/repo/node_modules/@shoki/binding-darwin-x64/helper/ShokiRunner.app';
    const { location } = await discoverHelper({
      exists: mkExists([npmPath]),
      cwd: '/repo',
      platform: 'darwin',
      arch: 'x64',
    });
    expect(location).toMatchObject({ path: npmPath });
  });
});
