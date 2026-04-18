/**
 * `ogmios setup` / `LAUNCH_SETUP_APP` fix-action path resolution.
 *
 * Plan 08-03 introduced OgmiosSetup.app — a tiny Zig-compiled GUI whose sole
 * purpose is to trigger macOS Accessibility + Automation TCC prompts cleanly.
 * Plan 08-04 wires the CLI `ogmios setup` subcommand + the `launch-setup-app`
 * fix-action to find and open the bundle from npm-installed binding packages
 * (primary) or the monorepo dev build (fallback).
 *
 * Resolution order (first match wins):
 *   1. `$OGMIOS_SETUP_APP_PATH` env override — escape hatch for QA / custom layouts
 *   2. node_modules/@ogmios/binding-darwin-arm64/helper/OgmiosSetup.app
 *   3. node_modules/@ogmios/binding-darwin-x64/helper/OgmiosSetup.app
 *   4. helper/.build/OgmiosSetup.app (local monorepo dev)
 *
 * Returns `null` when nothing is found — callers emit a user-facing "not
 * installed" error with the search paths enumerated.
 */

import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

export interface ResolveSetupAppOptions {
  /** Root to search for node_modules/ + helper/ — defaults to process.cwd(). */
  cwd?: string;
  /** Env override (OGMIOS_SETUP_APP_PATH). */
  envPath?: string;
  /** Injected existence check for unit tests. */
  exists?: (path: string) => Promise<boolean>;
}

export interface ResolveSetupAppResult {
  path: string | null;
  source: 'env' | 'npm-arm64' | 'npm-x64' | 'dev' | null;
  searched: string[];
}

const defaultExists = async (p: string): Promise<boolean> => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export async function resolveSetupAppPath(
  options: ResolveSetupAppOptions = {},
): Promise<ResolveSetupAppResult> {
  const exists = options.exists ?? defaultExists;
  const cwd = options.cwd ?? process.cwd();
  const searched: string[] = [];

  // 1. Env override — highest priority so QA can point at a staging bundle.
  const env = options.envPath ?? process.env.OGMIOS_SETUP_APP_PATH;
  if (env && env.length > 0) {
    searched.push(env);
    if (await exists(env)) {
      return { path: env, source: 'env', searched };
    }
  }

  // 2. arm64 binding install path.
  const arm64Path = join(
    cwd,
    'node_modules',
    '@ogmios',
    'binding-darwin-arm64',
    'helper',
    'OgmiosSetup.app',
  );
  searched.push(arm64Path);
  if (await exists(arm64Path)) {
    return { path: arm64Path, source: 'npm-arm64', searched };
  }

  // 3. x64 binding install path.
  const x64Path = join(
    cwd,
    'node_modules',
    '@ogmios',
    'binding-darwin-x64',
    'helper',
    'OgmiosSetup.app',
  );
  searched.push(x64Path);
  if (await exists(x64Path)) {
    return { path: x64Path, source: 'npm-x64', searched };
  }

  // 4. Monorepo dev build — the path `zig build` stages to.
  const devPath = join(cwd, 'helper', '.build', 'OgmiosSetup.app');
  searched.push(devPath);
  if (await exists(devPath)) {
    return { path: devPath, source: 'dev', searched };
  }

  return { path: null, source: null, searched };
}
