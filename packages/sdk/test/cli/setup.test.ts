import { describe, expect, it } from 'vitest';
import { resolveSetupAppPath } from '../../src/cli/setup-app-path.js';

function mkExists(knownPaths: string[]) {
  const set = new Set(knownPaths);
  return async (p: string) => set.has(p);
}

describe('resolveSetupAppPath', () => {
  it('prefers the env override when the path exists', async () => {
    const env = '/opt/Ogmios.app';
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      envPath: env,
      exists: mkExists([env]),
    });
    expect(res.path).toBe(env);
    expect(res.source).toBe('env');
  });

  it('falls through to arm64 node_modules path when env is absent', async () => {
    const arm64 =
      '/repo/node_modules/ogmios-darwin-arm64/helper/Ogmios.app';
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      envPath: undefined,
      exists: mkExists([arm64]),
    });
    expect(res.path).toBe(arm64);
    expect(res.source).toBe('npm-arm64');
  });

  it('falls through to x64 node_modules path when arm64 absent', async () => {
    const x64 =
      '/repo/node_modules/ogmios-darwin-x64/helper/Ogmios.app';
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      exists: mkExists([x64]),
    });
    expect(res.path).toBe(x64);
    expect(res.source).toBe('npm-x64');
  });

  it('falls through to monorepo dev path as last resort', async () => {
    const dev = '/repo/helper/.build/Ogmios.app';
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      exists: mkExists([dev]),
    });
    expect(res.path).toBe(dev);
    expect(res.source).toBe('dev');
  });

  it('returns path=null with all searched paths when nothing exists', async () => {
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      envPath: '/nope/Ogmios.app',
      exists: mkExists([]),
    });
    expect(res.path).toBeNull();
    expect(res.source).toBeNull();
    // Env + arm64 + x64 + dev = 4 entries.
    expect(res.searched).toHaveLength(4);
  });

  it('ignores env override when env path does not exist (still searches fallbacks)', async () => {
    const arm64 =
      '/repo/node_modules/ogmios-darwin-arm64/helper/Ogmios.app';
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      envPath: '/not/real/Ogmios.app',
      exists: mkExists([arm64]),
    });
    expect(res.path).toBe(arm64);
    expect(res.source).toBe('npm-arm64');
  });
});
