/**
 * Unit tests for the `munadi restore-vo-settings` CLI logic — Plan 07-05.
 *
 * `restoreVoSettingsFromSnapshot` reads a plist snapshot written by the Zig
 * lifecycle layer (zig/src/drivers/voiceover/lifecycle.zig → writeSnapshotFile)
 * and re-applies each of the 9 VO catalog keys via `defaults write`. The
 * snapshot file includes `_munadi_snapshot_{version,pid,ts_unix}` magic keys
 * so this module can refuse stale or unrecognized files.
 *
 * We spy on `execa` so tests don't actually mutate the host's plist. Each test
 * writes a fixture plist to a tempfile and asserts the expected result code +
 * argv pattern of the spawned `defaults` processes.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist an execa spy — vi.mock('execa') replaces the module with our spy.
// Each test resets mockReturnValue as needed.
const execaSpy = vi.fn();
vi.mock('execa', () => ({
  execa: (...args: unknown[]) => execaSpy(...args),
}));

// Import under test AFTER the mock is in place.
import { restoreVoSettingsFromSnapshot } from '../../src/cli/restore-vo-settings.js';

const tmpRoot = mkdtempSync(join(tmpdir(), 'munadi-restore-test-'));

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => {
  execaSpy.mockReset();
  execaSpy.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
});

/** Build a fixture plist mirroring the Zig writer's output. */
function buildFixturePlist(opts: {
  version?: number;
  tsUnix?: number;
  domain?: string;
  includeKeys?: boolean;
  voice?: string;
  extraKeys?: Array<{ key: string; xml: string }>;
}): string {
  const version = opts.version ?? 1;
  const ts = opts.tsUnix ?? Math.floor(Date.now() / 1000);
  const domain = opts.domain ?? 'com.apple.VoiceOver4/default';
  const voice = opts.voice ?? 'com.apple.speech.synthesis.voice.Alex';
  const includeKeys = opts.includeKeys ?? true;
  const extras = opts.extraKeys ?? [];

  const keys = includeKeys
    ? `    <key>SCREnableAppleScript</key>
    <true/>
    <key>SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound</key>
    <false/>
    <key>SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent</key>
    <integer>72</integer>
    <key>SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel</key>
    <integer>1</integer>
    <key>SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints</key>
    <true/>
    <key>SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel</key>
    <integer>2</integer>
    <key>SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText</key>
    <true/>
    <key>SCRCategories_SCRCategoryVoices_SCRSpeakChannel</key>
    <string>${voice}</string>
    <key>SCRShouldAnnounceKeyCommands</key>
    <false/>
`
    : '';

  const extrasXml = extras.map((e) => `    <key>${e.key}</key>\n${e.xml}\n`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>_munadi_snapshot_domain</key>
    <string>${domain}</string>
${keys}${extrasXml}    <key>_munadi_snapshot_version</key>
    <integer>${version}</integer>
    <key>_munadi_snapshot_pid</key>
    <integer>12345</integer>
    <key>_munadi_snapshot_ts_unix</key>
    <integer>${ts}</integer>
</dict>
</plist>
`;
}

function writeFixture(name: string, contents: string): string {
  const p = join(tmpRoot, `${name}.plist`);
  writeFileSync(p, contents);
  return p;
}

describe('restoreVoSettingsFromSnapshot', () => {
  it('rejects with SNAPSHOT_MISSING when the file does not exist', async () => {
    const result = await restoreVoSettingsFromSnapshot({
      snapshotPath: join(tmpRoot, 'does-not-exist.plist'),
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('SNAPSHOT_MISSING');
    expect(execaSpy).not.toHaveBeenCalled();
  });

  it('rejects with SNAPSHOT_UNRECOGNIZED when the magic key is absent', async () => {
    // Plist without the _munadi_snapshot_version marker.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>SomeOtherKey</key><string>whatever</string>
</dict></plist>`;
    const path = writeFixture('unrecognized', xml);
    const result = await restoreVoSettingsFromSnapshot({ snapshotPath: path });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('SNAPSHOT_UNRECOGNIZED');
    expect(execaSpy).not.toHaveBeenCalled();
  });

  it('rejects with SNAPSHOT_STALE when the snapshot is older than 7 days', async () => {
    const tenDaysAgo = Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60;
    const xml = buildFixturePlist({ tsUnix: tenDaysAgo });
    const path = writeFixture('stale', xml);
    const result = await restoreVoSettingsFromSnapshot({ snapshotPath: path });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('SNAPSHOT_STALE');
    expect(result.snapshotAgeSeconds).toBeGreaterThan(7 * 24 * 60 * 60);
    expect(execaSpy).not.toHaveBeenCalled();
  });

  it('applies a stale snapshot when force: true is passed', async () => {
    const tenDaysAgo = Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60;
    const xml = buildFixturePlist({ tsUnix: tenDaysAgo });
    const path = writeFixture('stale-force', xml);
    const result = await restoreVoSettingsFromSnapshot({
      snapshotPath: path,
      force: true,
    });
    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    // 9 keys applied.
    expect(result.restoredKeys).toHaveLength(9);
  });

  it('happy path: calls defaults write for each of the 9 keys with the expected argv', async () => {
    const xml = buildFixturePlist({});
    const path = writeFixture('happy', xml);
    const result = await restoreVoSettingsFromSnapshot({ snapshotPath: path });

    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.restoredKeys).toHaveLength(9);

    // Exactly 9 invocations, one per key in catalog order.
    expect(execaSpy).toHaveBeenCalledTimes(9);

    // First invocation is the boolean SCREnableAppleScript (from fixture: true).
    expect(execaSpy).toHaveBeenNthCalledWith(1, 'defaults', [
      'write',
      'com.apple.VoiceOver4/default',
      'SCREnableAppleScript',
      '-bool',
      'true',
    ]);
    // Third invocation is the integer RateAsPercent (from fixture: 72).
    expect(execaSpy).toHaveBeenNthCalledWith(3, 'defaults', [
      'write',
      'com.apple.VoiceOver4/default',
      'SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent',
      '-int',
      '72',
    ]);
    // Eighth invocation is the string SpeakChannel (from fixture: Alex).
    expect(execaSpy).toHaveBeenNthCalledWith(8, 'defaults', [
      'write',
      'com.apple.VoiceOver4/default',
      'SCRCategories_SCRCategoryVoices_SCRSpeakChannel',
      '-string',
      'com.apple.speech.synthesis.voice.Alex',
    ]);
  });

  it('reports per-key failures via WRITE_FAILED with details', async () => {
    const xml = buildFixturePlist({});
    const path = writeFixture('partial-fail', xml);

    // Make the 5th invocation (SCRShouldSpeakHints) fail.
    execaSpy.mockImplementation(async (_bin: unknown, args: unknown) => {
      const argv = args as string[];
      if (argv[2] === 'SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints') {
        throw new Error('defaults write: exit 1');
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const result = await restoreVoSettingsFromSnapshot({ snapshotPath: path });
    expect(result.ok).toBe(false);
    expect(result.code).toBe('WRITE_FAILED');
    expect(result.failures).toBeDefined();
    expect(result.failures!.length).toBe(1);
    expect(result.failures![0]!.key).toBe(
      'SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints',
    );
    // Other 8 keys still restored.
    expect(result.restoredKeys).toHaveLength(8);
  });

  it('uses the snapshot file\'s recorded domain, not a hardcoded default', async () => {
    const domain = `${process.env.HOME ?? '/Users/test'}/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4`;
    const xml = buildFixturePlist({ domain });
    const path = writeFixture('custom-domain', xml);
    const result = await restoreVoSettingsFromSnapshot({ snapshotPath: path });
    expect(result.ok).toBe(true);
    expect(execaSpy).toHaveBeenCalledWith('defaults', [
      'write',
      domain,
      'SCREnableAppleScript',
      '-bool',
      'true',
    ]);
  });
});
