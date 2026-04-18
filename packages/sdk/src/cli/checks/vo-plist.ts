import { execa } from 'execa';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { type DoctorCheckResult, ExitCode, type FixAction } from '../report-types.js';

/**
 * CONTEXT.md D-02 — plist path per macOS major.
 *   14 (Sonoma):  ~/Library/Preferences/com.apple.VoiceOver4/default/com.apple.VoiceOver4.plist
 *   15 (Sequoia): ~/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist
 *   26 (Tahoe):   same as Sequoia, but CVE-2025-43530 adds an entitlement gate
 *                 at the AppleScript runtime — the plist still exists, it just
 *                 isn't sufficient on its own.
 */
export function resolvePlistPath(
  macOSMajor: number,
  home: string = homedir(),
): string {
  if (macOSMajor === 14) {
    return join(
      home,
      'Library/Preferences/com.apple.VoiceOver4/default/com.apple.VoiceOver4.plist',
    );
  }
  // 15 and 26 share the Group Container path.
  return join(
    home,
    'Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist',
  );
}

export interface PlistReader {
  (plistPath: string, key: string): Promise<boolean | null>;
}

/**
 * Default plist reader: `/usr/bin/defaults read <plist> SCREnableAppleScript`.
 * Returns true/false for 1/0, or null if the key is absent / file missing.
 */
export const defaultPlistReader: PlistReader = async (plistPath, key) => {
  try {
    const { stdout } = await execa('/usr/bin/defaults', ['read', plistPath, key], {
      timeout: 5_000,
    });
    const trimmed = stdout.trim();
    if (trimmed === '1' || trimmed.toLowerCase() === 'true') return true;
    if (trimmed === '0' || trimmed.toLowerCase() === 'false') return false;
    return null;
  } catch {
    // defaults exits non-zero when the key or file is missing — treat as absent.
    return null;
  }
};

/** Test-exposed helper that wraps defaultPlistReader for the SCREnableAppleScript key. */
export async function readSCREnableAppleScript(
  plistPath: string,
  reader: PlistReader = defaultPlistReader,
): Promise<boolean | null> {
  return reader(plistPath, 'SCREnableAppleScript');
}

export interface CheckVOPlistOptions {
  macOSMajor: number;
  home?: string;
  reader?: PlistReader;
}

export async function checkVOPlist(
  options: CheckVOPlistOptions,
): Promise<DoctorCheckResult> {
  const plistPath = resolvePlistPath(options.macOSMajor, options.home);
  const reader = options.reader ?? defaultPlistReader;
  const value = await reader(plistPath, 'SCREnableAppleScript');

  // Tahoe / CVE-2025-43530 — even when the plist says enabled, the AppleScript
  // surface is entitlement-gated at runtime. Surface as a WARN so the user
  // isn't shocked when Phase 3 driver runs into it. PITFALLS.md #11.
  const tahoeCaveat =
    options.macOSMajor === 26
      ? 'Note: macOS 26 (Tahoe) applies CVE-2025-43530 mitigations. Even with this plist key enabled, the AppleScript path may be constrained at runtime; the Phase 3 AX-notifications fallback will carry capture on this OS.'
      : undefined;

  if (value === true) {
    return {
      id: 'vo-plist',
      status: options.macOSMajor === 26 ? 'warn' : 'pass',
      summary: `VoiceOver AppleScript is enabled in ${plistPath}${options.macOSMajor === 26 ? ' (Tahoe: entitlement-gated at runtime)' : ''}`,
      detail: tahoeCaveat,
      meta: { plistPath, value: true, macOSMajor: options.macOSMajor },
    };
  }

  const fixActions: FixAction[] = [
    {
      kind: 'defaults-write',
      plistPath,
      key: 'SCREnableAppleScript',
      value: true,
    },
  ];

  return {
    id: 'vo-plist',
    status: 'fail',
    summary:
      value === false
        ? `VoiceOver AppleScript is explicitly disabled in ${plistPath}`
        : `VoiceOver AppleScript key SCREnableAppleScript is absent from ${plistPath}`,
    detail:
      `Run \`dicta doctor --fix\` to write the key, or manually: \`defaults write "${plistPath}" SCREnableAppleScript -bool true\`. ` +
      (tahoeCaveat ?? ''),
    exitCode: ExitCode.VO_APPLESCRIPT_DISABLED,
    fixActions,
    meta: { plistPath, value, macOSMajor: options.macOSMajor },
  };
}
