/**
 * Plan 10-02 — `shoki setup` orchestrator.
 *
 * Decision tree (runSetup):
 *   1. installDir = opts.installDir ?? ~/Applications
 *   2. If --dry-run: compute URL + installDir, return noop (no fs/network).
 *   3. Reject non-darwin platforms up front.
 *   4. Check both bundles exist + read Info.plist versions.
 *      - Fresh (versions match + no --force) → launch only.
 *      - Stale or --force → fall through to download.
 *   5. --no-download + missing bundles → reject.
 *   6. Otherwise: download+verify → install (ditto) → strip quarantine.
 *   7. --skip-launch? return without launching. Else: open -W Shoki Setup.app.
 *
 * The commander subcommand in main.ts is a thin wrapper that calls runSetup,
 * formats the SetupResult (human vs JSON), and maps it to a process exit code.
 */

import { access, constants } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  downloadAndVerifyZip,
  resolveReleaseBaseUrlFromPackageJson,
  type ShokiAppPlatform,
} from './setup-download.js';
import {
  installFromZip,
  readInstalledAppVersion,
  stripQuarantine,
  type Execa,
} from './setup-install.js';

export interface SetupOptions {
  /** --force: redownload + reinstall even when apps are present + fresh. */
  force?: boolean;
  /** --no-download: fail if apps are missing, never make a network request. */
  noDownload?: boolean;
  /** --install-dir <path>: override ~/Applications. */
  installDir?: string;
  /** --skip-launch: don't call `open -W` at the end. */
  skipLaunch?: boolean;
  /** --json: caller reads SetupResult; runSetup itself stays silent. */
  json?: boolean;
  /** --version <ver>: download a specific release tag. */
  version?: string;
  /** --dry-run: compute + return the plan; no fs/network side-effects. */
  dryRun?: boolean;

  // --- Non-commander options, injected by tests or main.ts -----------------

  /** Shoki.app version this SDK is pinned against (packages/sdk/package.json). */
  compatibleAppVersion?: string;
  /** Release base URL, e.g. https://github.com/shoki/shoki/releases/download */
  releaseBaseUrl?: string;
  /** Injected fetch for tests (default: globalThis.fetch). */
  fetch?: typeof globalThis.fetch;
  /** Injected exec for tests (default: execa wrapper). */
  exec?: Execa;
  /** Force a specific platform (tests only). */
  platformOverride?: string;
}

export type SetupAction =
  | 'noop' // dry-run or other non-acting path
  | 'downloaded' // apps were missing, we downloaded + installed them
  | 'reinstalled' // apps were present but stale / --force
  | 'launched-only'; // apps already fresh; we only launched Shoki Setup.app

export interface SetupResult {
  action: SetupAction;
  installDir: string;
  appPaths: string[];
  platform: string;
  downloadedFromUrl?: string;
  shaVerified?: boolean;
  launched: boolean;
  exitCode: number;
}

/** Exit codes (CONTEXT.md § `shoki setup` flags + plan verify step). */
export const SETUP_EXIT = {
  OK: 0,
  GENERIC: 1,
  MISSING_DEP: 2,
  CHECKSUM_MISMATCH: 3,
  NETWORK: 4,
  UNZIP: 5,
  QUARANTINE: 6,
  UNSUPPORTED_PLATFORM: 7,
} as const;

function resolvePlatform(opts: SetupOptions): ShokiAppPlatform {
  const raw =
    opts.platformOverride ?? `${process.platform}-${process.arch}`;
  if (raw !== 'darwin-arm64' && raw !== 'darwin-x64') {
    const err = new Error(
      `shoki setup only supports macOS (darwin-arm64 / darwin-x64). Detected: ${raw}. Windows/Linux support is tracked for v2+.`,
    );
    (err as Error & { exitCode?: number }).exitCode =
      SETUP_EXIT.UNSUPPORTED_PLATFORM;
    throw err;
  }
  return raw as ShokiAppPlatform;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Main orchestrator. Tests inject fetch + exec; production main.ts uses the
 * defaults that fall through to `globalThis.fetch` + the execa wrapper inside
 * setup-install.ts.
 */
export async function runSetup(opts: SetupOptions): Promise<SetupResult> {
  const installDir = opts.installDir ?? join(homedir(), 'Applications');
  const platform = resolvePlatform(opts);
  const version = opts.version ?? opts.compatibleAppVersion ?? '0.0.0';
  const baseUrl =
    opts.releaseBaseUrl ??
    'https://github.com/shoki/shoki/releases/download';

  // URL we would download in the non-dry-run branch — computed up front so
  // both --dry-run and --json callers can log it.
  const plannedZipUrl = `${baseUrl.replace(/\/+$/, '')}/app-v${version}/shoki-${platform}.zip`;

  const appPaths = [
    join(installDir, 'Shoki.app'),
    join(installDir, 'Shoki Setup.app'),
  ];

  if (opts.dryRun) {
    return {
      action: 'noop',
      installDir,
      appPaths,
      platform,
      downloadedFromUrl: plannedZipUrl,
      launched: false,
      exitCode: SETUP_EXIT.OK,
    };
  }

  const bothPresent =
    (await pathExists(appPaths[0]!)) && (await pathExists(appPaths[1]!));

  // Decide whether we need to download.
  let shouldInstall = opts.force === true;
  if (!bothPresent) {
    if (opts.noDownload) {
      const err = new Error(
        `shoki setup --no-download: apps are missing at ${installDir} and download is disabled.\n` +
          `Place Shoki.app + "Shoki Setup.app" into ${installDir} manually, or re-run without --no-download.`,
      );
      (err as Error & { exitCode?: number }).exitCode = SETUP_EXIT.MISSING_DEP;
      throw err;
    }
    shouldInstall = true;
  } else if (!shouldInstall) {
    // Both present + no --force — consult installed version.
    const installedVersion = await readInstalledAppVersion(appPaths[0]!);
    if (installedVersion !== version) {
      shouldInstall = true;
    }
  }

  let action: SetupAction;
  let downloadedFromUrl: string | undefined;
  let shaVerified: boolean | undefined;

  if (shouldInstall) {
    const download = await downloadAndVerifyZip({
      version,
      baseUrl,
      platform,
      fetch: opts.fetch,
    });
    downloadedFromUrl = download.downloadedFromUrl;
    shaVerified = download.actualSha === download.expectedSha;

    await installFromZip({
      zipPath: download.zipPath,
      installDir,
      exec: opts.exec,
    });

    try {
      await stripQuarantine(appPaths, opts.exec);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const wrapped = new Error(
        `shoki setup failed while stripping quarantine: ${message}`,
      );
      (wrapped as Error & { exitCode?: number }).exitCode =
        SETUP_EXIT.QUARANTINE;
      throw wrapped;
    }

    action = bothPresent ? 'reinstalled' : 'downloaded';
  } else {
    action = 'launched-only';
  }

  let launched = false;
  if (!opts.skipLaunch) {
    const exec = opts.exec ?? (await importDefaultExec());
    const launchResult = await exec('/usr/bin/open', [
      '-W',
      appPaths[1]!,
    ]);
    if (launchResult.exitCode !== 0) {
      const err = new Error(
        `shoki setup: failed to launch ${appPaths[1]} (open exit ${launchResult.exitCode})${launchResult.stderr ? `: ${launchResult.stderr}` : ''}`,
      );
      (err as Error & { exitCode?: number }).exitCode = SETUP_EXIT.GENERIC;
      throw err;
    }
    launched = true;
  }

  return {
    action,
    installDir,
    appPaths,
    platform,
    downloadedFromUrl,
    shaVerified,
    launched,
    exitCode: SETUP_EXIT.OK,
  };
}

/**
 * Lazy import of the execa wrapper so tests that never hit the launch branch
 * don't pay the import cost. Only invoked when opts.exec is undefined AND
 * skipLaunch is false.
 */
async function importDefaultExec(): Promise<Execa> {
  const { execa } = await import('execa');
  return async (file, args) => {
    const res = await execa(file, args, { reject: false });
    return {
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      exitCode: res.exitCode ?? 1,
    };
  };
}

/** Re-export so main.ts can resolve the base URL from its own package.json. */
export { resolveReleaseBaseUrlFromPackageJson };
