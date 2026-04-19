/**
 * Plan 10-02 — unzip a verified ogmios-<platform>.zip into ~/Applications,
 * strip the quarantine xattr that `fetch` stamped onto the download, and
 * expose a tiny plist reader so the orchestrator can ask "is the installed
 * app version still compatible?".
 *
 * We shell out to macOS-native tooling (`/usr/bin/ditto`, `/usr/bin/xattr`)
 * instead of implementing unzip/xattr logic in Node — `ditto` preserves
 * bundle metadata and symlinks the way `unzip` doesn't, and `xattr -dr`
 * recursively clears the quarantine flag in a single syscall batch.
 *
 * `execa` is already a dependency for the rest of the CLI; the `exec`
 * injection points below let tests stub execa without pulling it in as a
 * test-time fixture.
 */

import { execa } from 'execa';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Execa {
  (
    file: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

export interface InstallOptions {
  zipPath: string;
  installDir: string;
  exec?: Execa;
}

export interface InstallResult {
  installedPaths: string[];
}

const DEFAULT_EXEC: Execa = async (file, args) => {
  const result = await execa(file, args, { reject: false });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.exitCode ?? 1,
  };
};

/**
 * Extract the unified zip into installDir via `/usr/bin/ditto -x -k`.
 * Creates installDir if absent. Returns the predicted bundle paths; the
 * caller verifies them on disk if it needs proof.
 */
export async function installFromZip(
  opts: InstallOptions,
): Promise<InstallResult> {
  const exec = opts.exec ?? DEFAULT_EXEC;
  await mkdir(opts.installDir, { recursive: true });

  const result = await exec('/usr/bin/ditto', [
    '-x',
    '-k',
    opts.zipPath,
    opts.installDir,
  ]);
  if (result.exitCode !== 0) {
    throw new Error(
      `ditto failed extracting ${opts.zipPath} → ${opts.installDir}: exit ${result.exitCode}${result.stderr ? `: ${result.stderr}` : ''}`,
    );
  }

  return {
    installedPaths: [
      join(opts.installDir, 'OgmiosRunner.app'),
      join(opts.installDir, 'Ogmios.app'),
    ],
  };
}

/**
 * Clear `com.apple.quarantine` recursively from each bundle. Tolerant of
 * xattr exit code 1 (attribute not found) — freshly-extracted bundles
 * don't always carry the xattr, and `xattr -dr` then exits 1 harmlessly.
 * Any other non-zero exit is surfaced to the caller.
 */
export async function stripQuarantine(
  paths: string[],
  execParam?: Execa,
): Promise<void> {
  const exec = execParam ?? DEFAULT_EXEC;
  for (const path of paths) {
    const result = await exec('/usr/bin/xattr', [
      '-dr',
      'com.apple.quarantine',
      path,
    ]);
    if (result.exitCode === 0 || result.exitCode === 1) continue;
    throw new Error(
      `xattr -dr com.apple.quarantine ${path} failed: exit ${result.exitCode}${result.stderr ? `: ${result.stderr}` : ''}`,
    );
  }
}

/**
 * Read `CFBundleShortVersionString` out of `<appPath>/Contents/Info.plist`.
 * Returns null if Info.plist is missing, unreadable, or doesn't carry the
 * key. Uses a narrow regex — Ogmios's Info.plist format is stable enough
 * (Phase 8's `build-app-bundle.sh`) that we don't need a plist parser.
 */
export async function readInstalledAppVersion(
  appPath: string,
): Promise<string | null> {
  const plistPath = join(appPath, 'Contents', 'Info.plist');
  let xml: string;
  try {
    xml = await readFile(plistPath, 'utf8');
  } catch {
    return null;
  }
  const match = xml.match(
    /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/,
  );
  return match?.[1] ?? null;
}
