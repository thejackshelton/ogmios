import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface HelperLocation {
  path: string;
  source: 'npm' | 'dev' | 'env' | 'installed';
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

export interface DiscoverHelperResult {
  /** Resolved location, or `null` if nothing matched. */
  location: HelperLocation | null;
  /** All paths consulted, in order. Useful for diagnostics / `ogmios info`. */
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

/**
 * Search order (matches CONTEXT.md D-09):
 *   1. explicit override (CLI flag or $OGMIOS_HELPER_PATH)
 *   2. ~/Applications/OgmiosRunner.app  (installed via `ogmios setup`)
 *   3. node_modules/ogmios-<platform>-<arch>/helper/OgmiosRunner.app (legacy npm install path)
 *   4. helper/.build/OgmiosRunner.app    (dev build, detected by sibling Package.swift)
 *
 * Returns the resolved location and the list of paths searched.
 */
export async function discoverHelper(
  options: DiscoverHelperOptions = {},
): Promise<DiscoverHelperResult> {
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
        searched,
      };
    }
  }

  // 2. ~/Applications path — where `ogmios setup` installs the downloaded bundle
  const installedPath = join(homedir(), 'Applications', 'OgmiosRunner.app');
  searched.push(installedPath);
  if (await exists(installedPath)) {
    return {
      location: { path: installedPath, source: 'installed' },
      searched,
    };
  }

  // 3. Legacy npm install path (kept for forward-compat when the binding tarball
  //    might ship the .app directly)
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
      searched,
    };
  }

  // 4. Dev build path — detected by sibling Package.swift
  const devPath = join(cwd, 'helper', '.build', 'OgmiosRunner.app');
  const devSiblingManifest = join(cwd, 'helper', 'Package.swift');
  searched.push(devPath);
  if ((await exists(devPath)) && (await exists(devSiblingManifest))) {
    return {
      location: { path: devPath, source: 'dev' },
      searched,
    };
  }

  return { location: null, searched };
}
