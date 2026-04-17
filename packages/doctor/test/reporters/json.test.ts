import { describe, expect, it } from 'vitest';
import { printJsonReport } from '../../src/reporters/json.js';
import { type DoctorReport, ExitCode } from '../../src/report-types.js';

const report: DoctorReport = {
  ok: false,
  exitCode: ExitCode.TCC_MISSING_ACCESSIBILITY,
  macOSVersion: '15.2',
  helperPath: '/path/to/helper',
  helperSignature: 'Developer ID Application: X (YYY)',
  checks: [
    {
      id: 'tcc-accessibility',
      status: 'fail',
      summary: 'No grant',
      exitCode: ExitCode.TCC_MISSING_ACCESSIBILITY,
      fixActions: [
        {
          kind: 'open-system-settings',
          url: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
          pane: 'accessibility',
        },
      ],
    },
  ],
  ranAt: '2026-04-17T17:00:00.000Z',
  mode: 'report',
};

describe('printJsonReport', () => {
  it('emits valid JSON that round-trips', () => {
    const lines: string[] = [];
    printJsonReport(report, { write: (l) => lines.push(l) });
    const parsed = JSON.parse(lines.join('\n'));
    expect(parsed).toEqual(report);
  });

  it('matches the snapshot (locks the schema)', () => {
    const lines: string[] = [];
    printJsonReport(report, { write: (l) => lines.push(l) });
    expect(lines.join('\n')).toMatchSnapshot();
  });
});
