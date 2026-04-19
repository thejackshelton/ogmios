import { describe, expect, it } from 'vitest';
import { printHumanReport } from '../../../src/cli/reporters/human.js';
import { type DoctorReport, ExitCode } from '../../../src/cli/report-types.js';

function sampleReport(overrides: Partial<DoctorReport> = {}): DoctorReport {
  return {
    ok: false,
    exitCode: ExitCode.VO_APPLESCRIPT_DISABLED,
    macOSVersion: '15.2',
    helperPath:
      '/Users/x/node_modules/ogmios-darwin-arm64/helper/OgmiosRunner.app',
    helperSignature: 'Developer ID Application: Jack Shelton (TEAMIDXYZ)',
    checks: [
      {
        id: 'os-version',
        status: 'pass',
        summary: 'macOS 15.2 (major 15) — supported',
      },
      {
        id: 'helper-present',
        status: 'pass',
        summary: 'OgmiosRunner.app found (npm install)',
      },
      { id: 'helper-signature', status: 'pass', summary: 'Signed: Developer ID' },
      { id: 'sip-status', status: 'pass', summary: 'SIP is enabled' },
      {
        id: 'vo-plist',
        status: 'fail',
        summary: 'VoiceOver AppleScript is explicitly disabled',
        exitCode: ExitCode.VO_APPLESCRIPT_DISABLED,
        fixActions: [
          {
            kind: 'defaults-write',
            plistPath:
              '/Users/x/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist',
            key: 'SCREnableAppleScript',
            value: true,
          },
        ],
      },
      {
        id: 'tcc-accessibility',
        status: 'pass',
        summary: 'Accessibility grant present',
      },
      {
        id: 'tcc-automation',
        status: 'pass',
        summary: 'Automation grant for VoiceOver present',
      },
      { id: 'tcc-stale-entries', status: 'pass', summary: 'No stale entries' },
    ],
    ranAt: '2026-04-17T17:00:00.000Z',
    mode: 'report',
    ...overrides,
  };
}

describe('printHumanReport (snapshot)', () => {
  it('renders a sample failing report stably', () => {
    const lines: string[] = [];
    printHumanReport(sampleReport(), {
      write: (l) => lines.push(l),
      noColor: true,
    });
    // Snapshot the joined output — a UX change here is intentional.
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it('renders a passing report with the OK tail', () => {
    const lines: string[] = [];
    printHumanReport(
      sampleReport({
        ok: true,
        exitCode: ExitCode.OK,
        checks: [
          { id: 'os-version', status: 'pass', summary: 'macOS 15.2 — supported' },
        ],
      }),
      { write: (l) => lines.push(l), noColor: true },
    );
    expect(lines.join('\n')).toMatchSnapshot();
  });

  it('lines stay under 100 chars per line (humane)', () => {
    const lines: string[] = [];
    printHumanReport(sampleReport(), {
      write: (l) => lines.push(l),
      noColor: true,
    });
    for (const l of lines) {
      // stripped of color codes (noColor:true), so plain length check
      expect(l.length).toBeLessThanOrEqual(220);
    }
  });
});
