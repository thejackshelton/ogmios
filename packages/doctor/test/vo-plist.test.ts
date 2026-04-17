import { describe, expect, it } from 'vitest';
import { checkVOPlist, resolvePlistPath } from '../src/checks/vo-plist.js';
import { ExitCode } from '../src/report-types.js';

const HOME = '/Users/tester';

describe('resolvePlistPath', () => {
  it('returns the Sonoma path for macOS 14', () => {
    expect(resolvePlistPath(14, HOME)).toBe(
      '/Users/tester/Library/Preferences/com.apple.VoiceOver4/default/com.apple.VoiceOver4.plist',
    );
  });

  it('returns the Group Container path for macOS 15 (Sequoia)', () => {
    expect(resolvePlistPath(15, HOME)).toBe(
      '/Users/tester/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist',
    );
  });

  it('returns the Group Container path for macOS 26 (Tahoe)', () => {
    expect(resolvePlistPath(26, HOME)).toBe(
      '/Users/tester/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist',
    );
  });
});

describe('checkVOPlist', () => {
  it('passes on macOS 15 when SCREnableAppleScript=true', async () => {
    const r = await checkVOPlist({
      macOSMajor: 15,
      home: HOME,
      reader: async () => true,
    });
    expect(r.status).toBe('pass');
    expect(r.meta).toMatchObject({ value: true, macOSMajor: 15 });
  });

  it('WARNS on macOS 26 even when plist says enabled (CVE-2025-43530)', async () => {
    const r = await checkVOPlist({
      macOSMajor: 26,
      home: HOME,
      reader: async () => true,
    });
    expect(r.status).toBe('warn');
    expect(r.summary).toMatch(/entitlement-gated/i);
    expect(r.detail).toMatch(/Tahoe/i);
  });

  it('fails with VO_APPLESCRIPT_DISABLED when key is false', async () => {
    const r = await checkVOPlist({
      macOSMajor: 15,
      home: HOME,
      reader: async () => false,
    });
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.VO_APPLESCRIPT_DISABLED);
    expect(r.summary).toMatch(/explicitly disabled/i);
  });

  it('fails with VO_APPLESCRIPT_DISABLED when key is missing', async () => {
    const r = await checkVOPlist({
      macOSMajor: 14,
      home: HOME,
      reader: async () => null,
    });
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.VO_APPLESCRIPT_DISABLED);
    expect(r.summary).toMatch(/absent/i);
  });

  it('emits a defaults-write FixAction on fail', async () => {
    const r = await checkVOPlist({
      macOSMajor: 15,
      home: HOME,
      reader: async () => false,
    });
    expect(r.fixActions?.[0]).toMatchObject({
      kind: 'defaults-write',
      key: 'SCREnableAppleScript',
      value: true,
    });
  });

  it('emits the correct Sonoma plist path in the fail detail', async () => {
    const r = await checkVOPlist({
      macOSMajor: 14,
      home: HOME,
      reader: async () => false,
    });
    expect(r.detail).toMatch(
      /com\.apple\.VoiceOver4\/default\/com\.apple\.VoiceOver4\.plist/,
    );
  });
});
