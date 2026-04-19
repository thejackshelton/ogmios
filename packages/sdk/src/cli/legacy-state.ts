/**
 * Legacy state-directory notice — Phase 12 Plan 06.
 *
 * Per CONTEXT.md decision D-05 (locked — clean break): after the fourth rename
 * (shoki → @shoki/core → dicta → munadi → ogmios) the CLI deliberately does
 * NOT auto-migrate state from prior names. Instead, on first run of `ogmios
 * setup` or `ogmios info` we emit a one-line notice naming any surviving
 * legacy state dirs so the user can delete them safely.
 *
 * Matched legacy dirs: `~/.shoki/`, `~/.dicta/`, `~/.munadi/`. Current state
 * dir is `~/.ogmios/` and is never mentioned here.
 *
 * The notice is informational only. It writes to stderr so it does not
 * contaminate `--json`/`--quiet` stdout contracts.
 */
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LEGACY_DIRS = ['.shoki', '.dicta', '.munadi'] as const;

export interface WarnOnLegacyStateDirOptions {
  /** Override `os.homedir()` — primarily for tests. */
  homedir?: string;
  /** Override stderr writer — primarily for tests. */
  stderr?: { write: (chunk: string) => void };
  /**
   * Override existence check — primarily for tests. Receives the absolute
   * path of each candidate legacy dir under `homedir`.
   */
  exists?: (absolutePath: string) => boolean;
}

export interface WarnOnLegacyStateDirResult {
  /** The `~/<name>` presentation strings of detected legacy dirs. */
  found: readonly string[];
  /** Whether the notice was actually written to the stderr sink. */
  noticeEmitted: boolean;
}

/**
 * Detect legacy state dirs under the home directory and, if any exist, emit a
 * single multi-line notice to stderr. Returns the detection result so callers
 * can log, count, or chain additional behavior.
 */
export function warnOnLegacyStateDir(
  options: WarnOnLegacyStateDirOptions = {},
): WarnOnLegacyStateDirResult {
  const home = options.homedir ?? os.homedir();
  const exists = options.exists ?? existsSync;
  const stderr = options.stderr ?? process.stderr;

  const found: string[] = [];
  for (const dir of LEGACY_DIRS) {
    if (exists(path.join(home, dir))) {
      found.push(`~/${dir}`);
    }
  }

  if (found.length === 0) {
    return { found: [], noticeEmitted: false };
  }

  const message =
    `[ogmios] Detected legacy state dir(s): ${found.join(', ')}\n` +
    `         Delete safely with: rm -rf ${found.join(' ')}\n`;
  stderr.write(message);

  return { found, noticeEmitted: true };
}
