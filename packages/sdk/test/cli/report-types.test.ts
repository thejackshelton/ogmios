import { describe, expect, it } from 'vitest';
import {
  type DoctorCheckResult,
  EXIT_CODE_PRIORITY,
  ExitCode,
  resolveExitCode,
} from '../../src/cli/report-types.js';

/**
 * Smoke tests for the frozen contract.
 * Plans 02-02/03/04 add check-specific tests in their own test files.
 */

describe('ExitCode', () => {
  it('has the frozen numeric values from CONTEXT.md D-06', () => {
    expect(ExitCode.OK).toBe(0);
    expect(ExitCode.UNKNOWN_ERROR).toBe(1);
    expect(ExitCode.OS_UNSUPPORTED).toBe(2);
    expect(ExitCode.VO_APPLESCRIPT_DISABLED).toBe(3);
    expect(ExitCode.TCC_MISSING_ACCESSIBILITY).toBe(4);
    expect(ExitCode.TCC_MISSING_AUTOMATION).toBe(5);
    expect(ExitCode.SIGNATURE_MISMATCH).toBe(6);
    expect(ExitCode.NEEDS_FULL_DISK_ACCESS).toBe(7);
    expect(ExitCode.HELPER_MISSING).toBe(8);
    expect(ExitCode.HELPER_UNSIGNED).toBe(9);
  });
});

describe('resolveExitCode', () => {
  it('returns OK when no checks fail', () => {
    const checks: DoctorCheckResult[] = [
      { id: 'os-version', status: 'pass', summary: 'macOS 15.2' },
      { id: 'vo-plist', status: 'pass', summary: 'VO AppleScript enabled' },
    ];
    expect(resolveExitCode(checks)).toBe(ExitCode.OK);
  });

  it('picks the highest-priority failing exit code', () => {
    const checks: DoctorCheckResult[] = [
      {
        id: 'tcc-accessibility',
        status: 'fail',
        summary: 'missing',
        exitCode: ExitCode.TCC_MISSING_ACCESSIBILITY,
      },
      {
        id: 'os-version',
        status: 'fail',
        summary: 'macOS 12 too old',
        exitCode: ExitCode.OS_UNSUPPORTED,
      },
      {
        id: 'vo-plist',
        status: 'fail',
        summary: 'disabled',
        exitCode: ExitCode.VO_APPLESCRIPT_DISABLED,
      },
    ];
    // OS_UNSUPPORTED has priority 100 — highest — so it wins.
    expect(resolveExitCode(checks)).toBe(ExitCode.OS_UNSUPPORTED);
  });

  it('ignores non-fail statuses even if exitCode is set', () => {
    const checks: DoctorCheckResult[] = [
      {
        id: 'tcc-stale-entries',
        status: 'warn',
        summary: 'stale entry present',
        exitCode: ExitCode.SIGNATURE_MISMATCH, // not used because status != 'fail'
      },
    ];
    expect(resolveExitCode(checks)).toBe(ExitCode.OK);
  });

  it('OS_UNSUPPORTED is the highest priority', () => {
    const codes = Object.values(ExitCode).filter(
      (v): v is ExitCode => typeof v === 'number',
    );
    const osPriority = EXIT_CODE_PRIORITY[ExitCode.OS_UNSUPPORTED];
    for (const code of codes) {
      if (code === ExitCode.OS_UNSUPPORTED) continue;
      expect(osPriority).toBeGreaterThanOrEqual(EXIT_CODE_PRIORITY[code]);
    }
  });
});
