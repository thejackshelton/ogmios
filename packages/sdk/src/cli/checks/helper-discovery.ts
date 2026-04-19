import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { type DoctorCheckResult, ExitCode } from '../report-types.js';

export interface HelperLocation {
  path: string;
  source: 'npm' | 'dev' | 'env';
}

export interface DiscoverHelperOptions {
  /** Explicit override — skips search and returns this path if it exists. */
  overridePath?: string;
  /** Root for "npm" search (node_modules/ogmios-<platform>-<arch>) — defaults to cwd. */
  cwd?: string;
  /** Platform for the ogmios-<platform>-<arch> name. Defaults to process.platform/arch. */
  platform?: NodeJS.Platform;
  arch?: string;
  /** Injected existence check for unit tests — default uses node:fs/promises access(). */
  exists?: (path: string) => Promise<boolean>;
}

const defaultExists = async (p: string): Promise<boolean> => {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * CONTEXT.md D-09 search order:
 *   1. explicit override (CLI flag or $OGMIOS_HELPER_PATH)
 *   2. node_modules/ogmios-<platform>-<arch>/helper/OgmiosRunner.app (npm install path)
 *   3. helper/.build/OgmiosRunner.app  (dev build, detected by sibling Package.swift)
 *
 * Returns a DoctorCheckResult. On miss → HELPER_MISSING (exit code 8).
 */
export async function discoverHelper(
  options: DiscoverHelperOptions = {},
): Promise<{ result: DoctorCheckResult; location: HelperLocation | null }> {
  const exists = options.exists ?? defaultExists;
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;

  const searched: string[] = [];

  // 1. Explicit override
  if (options.overridePath) {
    searched.push(options.overridePath);
    if (await exists(options.overridePath)) {
      return {
        location: { path: options.overridePath, source: 'env' },
        result: {
          id: 'helper-present',
          status: 'pass',
          summary: `OgmiosRunner.app found at ${options.overridePath} (env/flag override)`,
          meta: { path: options.overridePath, source: 'env' },
        },
      };
    }
  }

  // 2. npm install path
  const npmPath = join(
    cwd,
    'node_modules',
    `ogmios-${platform}-${arch}`,
    'helper',
    'OgmiosRunner.app',
  );
  searched.push(npmPath);
  if (await exists(npmPath)) {
    return {
      location: { path: npmPath, source: 'npm' },
      result: {
        id: 'helper-present',
        status: 'pass',
        summary: `OgmiosRunner.app found at ${npmPath} (npm install)`,
        meta: { path: npmPath, source: 'npm' },
      },
    };
  }

  // 3. dev build path — detected by sibling Package.swift
  const devPath = join(cwd, 'helper', '.build', 'OgmiosRunner.app');
  const devSiblingManifest = join(cwd, 'helper', 'Package.swift');
  searched.push(devPath);
  if ((await exists(devPath)) && (await exists(devSiblingManifest))) {
    return {
      location: { path: devPath, source: 'dev' },
      result: {
        id: 'helper-present',
        status: 'pass',
        summary: `OgmiosRunner.app found at ${devPath} (dev build)`,
        meta: { path: devPath, source: 'dev' },
      },
    };
  }

  return {
    location: null,
    result: {
      id: 'helper-present',
      status: 'fail',
      summary: 'OgmiosRunner.app was not found in any known location',
      detail: `Searched:\n  - ${searched.join('\n  - ')}`,
      exitCode: ExitCode.HELPER_MISSING,
      meta: { searched },
    },
  };
}
