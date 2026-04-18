/**
 * `ogmios restore-vo-settings` — Plan 07-05 SIGKILL-recovery escape hatch.
 *
 * Reads the plist snapshot file that `voiceOver.start()` writes (see
 * zig/src/drivers/voiceover/lifecycle.zig `writeSnapshotFile`) and re-applies
 * each of the 9 VO catalog keys via `defaults write`.
 *
 * Rejection modes:
 *  - `SNAPSHOT_MISSING` — file absent (nothing to recover, exit 1)
 *  - `SNAPSHOT_UNRECOGNIZED` — magic `_ogmios_snapshot_version` absent (2)
 *  - `SNAPSHOT_STALE` — snapshot >7 days old and `--force` not passed (2)
 *  - `WRITE_FAILED` — one or more `defaults write` invocations failed (2)
 *  - `OK` — every key applied (0)
 *
 * The snapshot file records the domain string (Sonoma vs Sequoia+ Group
 * Container path) so restore writes back to the same place.
 */
import { execa } from 'execa';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_SNAPSHOT_PATH = join(homedir(), '.ogmios', 'vo-snapshot.plist');

/** Snapshot TTL — snapshots older than this require `--force`. */
export const STALE_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;

export type RestoreCode =
  | 'OK'
  | 'SNAPSHOT_MISSING'
  | 'SNAPSHOT_UNRECOGNIZED'
  | 'SNAPSHOT_STALE'
  | 'WRITE_FAILED';

export interface RestoreResult {
  ok: boolean;
  code: RestoreCode;
  restoredKeys?: string[];
  failures?: Array<{ key: string; error: string }>;
  snapshotAgeSeconds?: number;
}

export interface RestoreOptions {
  snapshotPath?: string;
  force?: boolean;
}

/** Ogmios's 9 canonical VO plist keys + their `defaults` type flag.
 *  Order matches zig/src/drivers/voiceover/defaults.zig `keyCatalog()`.
 *  The string-typed key (index 7) is the voice channel; everything else is
 *  bool or int. Values in the snapshot file use the corresponding XML tag
 *  (`<true/>`/`<false/>`/`<integer>N</integer>`/`<string>…</string>`).
 */
const OGMIOS_KEYS: ReadonlyArray<{
  key: string;
  type: 'bool' | 'int' | 'string';
}> = [
  { key: 'SCREnableAppleScript', type: 'bool' },
  {
    key: 'SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound',
    type: 'bool',
  },
  {
    key: 'SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent',
    type: 'int',
  },
  {
    key: 'SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel',
    type: 'int',
  },
  {
    key: 'SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints',
    type: 'bool',
  },
  {
    key: 'SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel',
    type: 'int',
  },
  {
    key: 'SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText',
    type: 'bool',
  },
  { key: 'SCRCategories_SCRCategoryVoices_SCRSpeakChannel', type: 'string' },
  { key: 'SCRShouldAnnounceKeyCommands', type: 'bool' },
];

/** Escape a key name for use inside a RegExp literal. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extract a key's value from the snapshot plist XML. Ogmios-written snapshots
 * use a narrow set of tag shapes — we don't need a full plist parser.
 * Returns `null` when the key is absent or matches the `__OGMIOS_MISSING__`
 * sentinel (meaning the pre-snapshot plist did not have the key either; the
 * caller should `defaults delete` rather than write).
 */
function extractValue(
  xml: string,
  key: string,
  type: 'bool' | 'int' | 'string',
): { kind: 'present'; value: string } | { kind: 'missing' } | null {
  const k = escapeRegex(key);
  if (type === 'bool') {
    // <key>K</key>\n<true/>  or  <false/>
    const re = new RegExp(`<key>${k}</key>\\s*<(true|false)\\s*/>`);
    const m = xml.match(re);
    if (!m) return null;
    return { kind: 'present', value: m[1] === 'true' ? 'true' : 'false' };
  }
  if (type === 'int') {
    const re = new RegExp(`<key>${k}</key>\\s*<integer>(-?\\d+)</integer>`);
    const m = xml.match(re);
    if (!m) return null;
    return { kind: 'present', value: m[1]! };
  }
  // string
  const re = new RegExp(`<key>${k}</key>\\s*<string>([^<]*)</string>`);
  const m = xml.match(re);
  if (!m) return null;
  if (m[1] === '__OGMIOS_MISSING__') return { kind: 'missing' };
  return { kind: 'present', value: m[1]! };
}

function extractDomain(xml: string): string {
  const m = xml.match(/<key>_ogmios_snapshot_domain<\/key>\s*<string>([^<]+)<\/string>/);
  return m?.[1] ?? 'com.apple.VoiceOver4/default';
}

/**
 * Re-apply every key in a ogmios snapshot file to the host's plist via
 * `defaults write`. See module-level docstring for rejection modes.
 */
export async function restoreVoSettingsFromSnapshot(
  opts: RestoreOptions = {},
): Promise<RestoreResult> {
  const path = opts.snapshotPath ?? DEFAULT_SNAPSHOT_PATH;

  let xml: string;
  try {
    xml = await readFile(path, 'utf8');
  } catch {
    return { ok: false, code: 'SNAPSHOT_MISSING' };
  }

  // Magic version check — reject files that don't look like ogmios snapshots.
  const versionMatch = xml.match(
    /<key>_ogmios_snapshot_version<\/key>\s*<integer>(\d+)<\/integer>/,
  );
  if (!versionMatch) return { ok: false, code: 'SNAPSHOT_UNRECOGNIZED' };

  // Staleness gate — 7-day TTL, override via force: true.
  const tsMatch = xml.match(
    /<key>_ogmios_snapshot_ts_unix<\/key>\s*<integer>(\d+)<\/integer>/,
  );
  const now = Math.floor(Date.now() / 1000);
  const ts = tsMatch ? Number.parseInt(tsMatch[1]!, 10) : 0;
  const ageSeconds = now - ts;
  if (ageSeconds > STALE_THRESHOLD_SECONDS && !opts.force) {
    return {
      ok: false,
      code: 'SNAPSHOT_STALE',
      snapshotAgeSeconds: ageSeconds,
    };
  }

  const domain = extractDomain(xml);
  const restored: string[] = [];
  const failures: Array<{ key: string; error: string }> = [];

  for (const { key, type } of OGMIOS_KEYS) {
    const extracted = extractValue(xml, key, type);
    if (!extracted) {
      // Key absent from snapshot — skip silently.
      continue;
    }
    if (extracted.kind === 'missing') {
      // The pre-snapshot plist didn't have this key; restoring means deleting.
      try {
        await execa('defaults', ['delete', domain, key]);
        restored.push(key);
      } catch (err) {
        // `defaults delete` on an absent key is harmless — ignore "does not exist".
        const message = err instanceof Error ? err.message : String(err);
        if (/does not exist/.test(message)) {
          restored.push(key);
        } else {
          failures.push({ key, error: message });
        }
      }
      continue;
    }
    try {
      await execa('defaults', [
        'write',
        domain,
        key,
        `-${type}`,
        extracted.value,
      ]);
      restored.push(key);
    } catch (err) {
      failures.push({
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      code: 'WRITE_FAILED',
      restoredKeys: restored,
      failures,
      snapshotAgeSeconds: ageSeconds,
    };
  }
  return {
    ok: true,
    code: 'OK',
    restoredKeys: restored,
    snapshotAgeSeconds: ageSeconds,
  };
}
