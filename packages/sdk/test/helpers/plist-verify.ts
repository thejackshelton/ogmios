import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);

/**
 * The 9 VO plist keys snapshotted by Plan 01's configureSettings / restoreSettings.
 * Names are canonical — they must match zig/src/drivers/voiceover/defaults.zig's
 * keyCatalog() verbatim.
 */
export const PLIST_KEYS: readonly string[] = [
  'SCREnableAppleScript',
  'SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound',
  'SCRCategories_SCRCategoryRotorAndTables_SCRGeneralSettings_SCRRateAsPercent',
  'SCRCategories_SCRCategoryActivities_SCRVerbositySettings_SCRVerbosityLevel',
  'SCRCategories_SCRCategoryHintsAndTips_SCRHintDelay_SCRShouldSpeakHints',
  'SCRCategories_SCRCategoryPunctuationAndSymbols_SCRPunctuationSettings_SCRPunctuationLevel',
  'SCRCategories_SCRCategoryVerbosity_SCRShouldSpeakStaticText',
  'SCRCategories_SCRCategoryVoices_SCRSpeakChannel',
  'SCRShouldAnnounceKeyCommands',
];

/** Snapshot of plist state. A key maps to '__MISSING__' when absent. */
export type PlistSnapshot = Readonly<Record<string, string>>;

export async function resolveDomain(): Promise<string> {
  const { stdout } = await execFileP('/usr/bin/sw_vers', ['-productVersion']);
  const major = Number.parseInt(stdout.split('.')[0] ?? '', 10);
  if (major <= 14) return 'com.apple.VoiceOver4/default';
  const home = process.env.HOME;
  if (!home) throw new Error('HOME not set; cannot resolve Sequoia+ plist domain');
  return `${home}/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4`;
}

export async function readSnapshot(): Promise<PlistSnapshot> {
  const domain = await resolveDomain();
  const snap: Record<string, string> = {};
  for (const key of PLIST_KEYS) {
    try {
      const { stdout } = await execFileP('/usr/bin/defaults', ['read', domain, key]);
      snap[key] = stdout.trim();
    } catch {
      snap[key] = '__MISSING__';
    }
  }
  return snap;
}

/**
 * Poll `pgrep -x VoiceOver` every 100ms; resolve true when VO exits, false
 * if `timeoutMs` elapses first.
 */
export async function waitForVOExit(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await execFileP('/usr/bin/pgrep', ['-x', 'VoiceOver']);
      // exit 0 → still running
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      return true; // pgrep exit non-zero → VO gone
    }
  }
  return false;
}
