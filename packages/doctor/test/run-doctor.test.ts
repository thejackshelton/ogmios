import { describe, expect, it } from 'vitest';
import { ExitCode } from '../src/report-types.js';
import { runDoctor } from '../src/run-doctor.js';

const isDarwin = process.platform === 'darwin';

describe('runDoctor (non-darwin short-circuit)', () => {
  it.skipIf(isDarwin)(
    'fails immediately with OS_UNSUPPORTED on non-darwin',
    async () => {
      const report = await runDoctor();
      expect(report.ok).toBe(false);
      expect(report.exitCode).toBe(ExitCode.OS_UNSUPPORTED);
      expect(report.checks).toHaveLength(1);
      expect(report.checks[0]!.id).toBe('os-version');
    },
  );
});

describe('runDoctor shape invariants', () => {
  it('produces a DoctorReport with the expected top-level fields', async () => {
    const report = await runDoctor({ requireDarwin: false });
    expect(report).toHaveProperty('ok');
    expect(report).toHaveProperty('exitCode');
    expect(report).toHaveProperty('checks');
    expect(report).toHaveProperty('ranAt');
    expect(report).toHaveProperty('mode');
    expect(report.mode).toBe('report');
    // Every check result has an id and status
    for (const c of report.checks) {
      expect(c.id).toBeDefined();
      expect(['pass', 'fail', 'warn', 'skip']).toContain(c.status);
    }
  });

  it('mode is "fix" when fix: true', async () => {
    const report = await runDoctor({ requireDarwin: false, fix: true });
    expect(report.mode).toBe('fix');
  });
});
