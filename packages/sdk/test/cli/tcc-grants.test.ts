import { describe, expect, it } from 'vitest';
import {
  checkTCCAccessibility,
  checkTCCAutomation,
  checkTCCStaleEntries,
  enumerateTCCGrants,
} from '../../src/cli/checks/tcc-grants.js';
import { ExitCode } from '../../src/cli/report-types.js';
import {
  ROW_ACCESSIBILITY_DENIED,
  ROW_ACCESSIBILITY_GRANTED,
  ROW_ACCESSIBILITY_STALE,
  ROW_AUTOMATION_VOICEOVER_GRANTED,
  ROW_AUTOMATION_WRONG_TARGET,
  ROW_UNRELATED_TERMINAL,
} from './fixtures/tcc-rows.js';

const JACK_AUTHORITY = 'Developer ID Application: Jack Shelton (TEAMIDXYZ)';

describe('enumerateTCCGrants (with injected rows)', () => {
  it('returns rows restricted to the client allowlist', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: {
        user: [ROW_ACCESSIBILITY_GRANTED, ROW_UNRELATED_TERMINAL],
        system: [],
      },
      clientMatches: ['com.shoki.runner'], // Terminal NOT allowlisted
    });
    expect(e.rows).toHaveLength(1);
    expect(e.rows[0]!.client).toBe('com.shoki.runner');
  });

  it('annotates every row with csreqMatch', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: {
        user: [ROW_ACCESSIBILITY_GRANTED, ROW_ACCESSIBILITY_STALE],
        system: [],
      },
    });
    const matches = e.rows.map((r) => r.csreqMatch);
    expect(matches).toEqual(['match', 'mismatch']);
  });

  it('records a warning when system scope is inaccessible', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: {
        user: [ROW_ACCESSIBILITY_GRANTED],
        system: { ok: false, reason: 'permission-denied', error: 'EACCES' },
      },
    });
    expect(e.systemDbAccessible).toBe(false);
    expect(e.warnings.join(' ')).toMatch(/system TCC.db not accessible/);
  });
});

describe('checkTCCAccessibility', () => {
  it('passes when a matching grant exists', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [ROW_ACCESSIBILITY_GRANTED], system: [] },
    });
    const r = checkTCCAccessibility(e);
    expect(r.status).toBe('pass');
  });

  it('fails with SIGNATURE_MISMATCH when only a stale grant exists', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [ROW_ACCESSIBILITY_STALE], system: [] },
    });
    const r = checkTCCAccessibility(e);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.SIGNATURE_MISMATCH);
    // Plan 08-04: fix-actions array carries both the GUI launcher (preferred
    // --fix path) and the deep-link fallback. Assert both are present
    // rather than pinning the ordering.
    expect(r.fixActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'launch-setup-app' }),
        expect.objectContaining({
          kind: 'open-system-settings',
          pane: 'accessibility',
        }),
      ]),
    );
  });

  it('fails with TCC_MISSING_ACCESSIBILITY when no grant exists', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [], system: [] },
    });
    const r = checkTCCAccessibility(e);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.TCC_MISSING_ACCESSIBILITY);
  });

  it('fails when the grant is denied (auth_value=0)', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [ROW_ACCESSIBILITY_DENIED], system: [] },
    });
    const r = checkTCCAccessibility(e);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.TCC_MISSING_ACCESSIBILITY);
  });

  it('fails with NEEDS_FULL_DISK_ACCESS when user TCC.db is inaccessible', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: {
        user: { ok: false, reason: 'permission-denied', error: 'EACCES' },
        system: [],
      },
    });
    const r = checkTCCAccessibility(e);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.NEEDS_FULL_DISK_ACCESS);
  });
});

describe('checkTCCAutomation', () => {
  it('passes when VoiceOver Automation grant is present', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [ROW_AUTOMATION_VOICEOVER_GRANTED], system: [] },
    });
    const r = checkTCCAutomation(e);
    expect(r.status).toBe('pass');
    expect(r.meta?.target).toBe('com.apple.VoiceOver');
  });

  it('fails when Automation grants target something other than VoiceOver', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [ROW_AUTOMATION_WRONG_TARGET], system: [] },
    });
    const r = checkTCCAutomation(e);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.TCC_MISSING_AUTOMATION);
  });

  it('fails with TCC_MISSING_AUTOMATION when no Automation grants exist', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [ROW_ACCESSIBILITY_GRANTED], system: [] },
    });
    const r = checkTCCAutomation(e);
    expect(r.status).toBe('fail');
    expect(r.exitCode).toBe(ExitCode.TCC_MISSING_AUTOMATION);
  });

  it('emits an Automation deep-link FixAction on fail', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [], system: [] },
    });
    const r = checkTCCAutomation(e);
    // Plan 08-04: launch-setup-app is the primary fix path; the deep link
    // remains as a fallback. Assert both are present.
    expect(r.fixActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'launch-setup-app' }),
        expect.objectContaining({
          kind: 'open-system-settings',
          pane: 'automation',
          url: expect.stringContaining('Privacy_Automation'),
        }),
      ]),
    );
  });
});

describe('checkTCCStaleEntries', () => {
  it('passes when no stale entries exist', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: { user: [ROW_ACCESSIBILITY_GRANTED], system: [] },
    });
    const r = checkTCCStaleEntries(e);
    expect(r.status).toBe('pass');
  });

  it('warns (not fails) when stale entries are detected', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: {
        user: [ROW_ACCESSIBILITY_GRANTED, ROW_ACCESSIBILITY_STALE],
        system: [],
      },
    });
    const r = checkTCCStaleEntries(e);
    expect(r.status).toBe('warn');
    expect(r.meta?.staleCount).toBe(1);
    expect(r.detail).toMatch(/kTCCServiceAccessibility/);
  });

  it('lists each stale row in the detail', () => {
    const e = enumerateTCCGrants({
      currentHelperAuthority: JACK_AUTHORITY,
      rowSource: {
        user: [ROW_ACCESSIBILITY_STALE, ROW_ACCESSIBILITY_STALE],
        system: [],
      },
    });
    const r = checkTCCStaleEntries(e);
    expect(r.meta?.staleCount).toBe(2);
  });
});
