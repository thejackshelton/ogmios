import { describe, expect, it, vi } from 'vitest';
import { applyFixActions } from '../../src/cli/fix-executor.js';
import type { FixAction } from '../../src/cli/report-types.js';
import { resolveSetupAppPath } from '../../src/cli/setup-app-path.js';
import {
  checkTCCAccessibility,
  checkTCCAutomation,
  type EnumerateTCCGrantsResult,
} from '../../src/cli/checks/index-tcc.js';

function mkExists(knownPaths: string[]) {
  const set = new Set(knownPaths);
  return async (p: string) => set.has(p);
}

describe('resolveSetupAppPath', () => {
  it('prefers the env override when the path exists', async () => {
    const env = '/opt/OgmiosSetup.app';
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
      '/repo/node_modules/@ogmios/binding-darwin-arm64/helper/OgmiosSetup.app';
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
      '/repo/node_modules/@ogmios/binding-darwin-x64/helper/OgmiosSetup.app';
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      exists: mkExists([x64]),
    });
    expect(res.path).toBe(x64);
    expect(res.source).toBe('npm-x64');
  });

  it('falls through to monorepo dev path as last resort', async () => {
    const dev = '/repo/helper/.build/OgmiosSetup.app';
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
      envPath: '/nope/OgmiosSetup.app',
      exists: mkExists([]),
    });
    expect(res.path).toBeNull();
    expect(res.source).toBeNull();
    // Env + arm64 + x64 + dev = 4 entries.
    expect(res.searched).toHaveLength(4);
  });

  it('ignores env override when env path does not exist (still searches fallbacks)', async () => {
    const arm64 =
      '/repo/node_modules/@ogmios/binding-darwin-arm64/helper/OgmiosSetup.app';
    const res = await resolveSetupAppPath({
      cwd: '/repo',
      envPath: '/not/real/OgmiosSetup.app',
      exists: mkExists([arm64]),
    });
    expect(res.path).toBe(arm64);
    expect(res.source).toBe('npm-arm64');
  });
});

describe('launch-setup-app fix-action', () => {
  it('applies via the injected launcher when a path is pinned on the action', async () => {
    const launcher = vi.fn(async () => undefined);
    const resolver = vi.fn(async () => null);
    const actions: FixAction[] = [
      { kind: 'launch-setup-app', appPath: '/opt/OgmiosSetup.app' },
    ];
    const res = await applyFixActions(actions, {
      sipEnabled: true,
      setupAppLauncher: launcher,
      setupAppResolver: resolver,
    });
    expect(launcher).toHaveBeenCalledWith('/opt/OgmiosSetup.app');
    expect(resolver).not.toHaveBeenCalled();
    expect(res.appliedActions).toHaveLength(1);
    expect(res.errors).toHaveLength(0);
  });

  it('resolves path at fix time when the action has appPath=null', async () => {
    const launcher = vi.fn(async () => undefined);
    const resolver = vi.fn(async () => '/resolved/OgmiosSetup.app');
    const actions: FixAction[] = [{ kind: 'launch-setup-app', appPath: null }];
    const res = await applyFixActions(actions, {
      sipEnabled: true,
      setupAppLauncher: launcher,
      setupAppResolver: resolver,
    });
    expect(resolver).toHaveBeenCalledOnce();
    expect(launcher).toHaveBeenCalledWith('/resolved/OgmiosSetup.app');
    expect(res.appliedActions).toHaveLength(1);
    expect(res.appliedActions[0]).toEqual({
      kind: 'launch-setup-app',
      appPath: '/resolved/OgmiosSetup.app',
    });
  });

  it('records an error when resolver cannot find the app', async () => {
    const launcher = vi.fn(async () => undefined);
    const resolver = vi.fn(async () => null);
    const actions: FixAction[] = [{ kind: 'launch-setup-app', appPath: null }];
    const res = await applyFixActions(actions, {
      sipEnabled: true,
      setupAppLauncher: launcher,
      setupAppResolver: resolver,
    });
    expect(launcher).not.toHaveBeenCalled();
    expect(res.appliedActions).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.error).toMatch(/OgmiosSetup\.app not found/);
  });

  it('propagates launcher failures as errors (does not crash the batch)', async () => {
    const launcher = vi.fn(async () => {
      throw new Error('open: -10810');
    });
    const actions: FixAction[] = [
      { kind: 'launch-setup-app', appPath: '/opt/OgmiosSetup.app' },
    ];
    const res = await applyFixActions(actions, {
      sipEnabled: true,
      setupAppLauncher: launcher,
    });
    expect(res.appliedActions).toHaveLength(0);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]?.error).toBe('open: -10810');
  });
});

describe('TCC checks emit launch-setup-app fix-action', () => {
  it('checkTCCAccessibility emits launch-setup-app when Accessibility grant is missing', () => {
    const enumeration: EnumerateTCCGrantsResult = {
      rows: [],
      userDbAccessible: true,
      systemDbAccessible: true,
      warnings: [],
    };
    const result = checkTCCAccessibility(enumeration);
    expect(result.status).toBe('fail');
    const launchAction = (result.fixActions ?? []).find(
      (a) => a.kind === 'launch-setup-app',
    );
    expect(launchAction).toBeDefined();
  });

  it('checkTCCAutomation emits launch-setup-app when Automation grant is missing', () => {
    const enumeration: EnumerateTCCGrantsResult = {
      rows: [],
      userDbAccessible: true,
      systemDbAccessible: true,
      warnings: [],
    };
    const result = checkTCCAutomation(enumeration);
    expect(result.status).toBe('fail');
    const launchAction = (result.fixActions ?? []).find(
      (a) => a.kind === 'launch-setup-app',
    );
    expect(launchAction).toBeDefined();
  });
});
