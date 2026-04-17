import {
  type DoctorReport,
  ExitCode,
  resolveExitCode,
} from './report-types.js';

export interface RunDoctorOptions {
  fix?: boolean;
  /** Path override for the helper app (CONTEXT.md D-09 — SHOKI_HELPER_PATH env escape). */
  helperPath?: string;
}

/**
 * Programmatic entry point for `shoki doctor`.
 *
 * PHASE 2 STATUS (Plan 02-01): this is the orchestrator skeleton.
 *   - Plan 02-02 wires in OS/plist/helper/SIP checks
 *   - Plan 02-03 wires in TCC enumeration + stale-entry detection
 *   - Plan 02-04 wires in --fix logic and reporters
 *
 * The shape of the returned DoctorReport is FROZEN by report-types.ts.
 */
export async function runDoctor(
  options: RunDoctorOptions = {},
): Promise<DoctorReport> {
  // Placeholder: Plans 02-02 and 02-03 replace this with real checks.
  const checks: DoctorReport['checks'] = [];
  void ExitCode.OK; // referenced for side-effect typing

  return {
    ok: resolveExitCode(checks) === ExitCode.OK,
    exitCode: resolveExitCode(checks),
    macOSVersion: null,
    helperPath: options.helperPath ?? null,
    helperSignature: null,
    checks,
    ranAt: new Date().toISOString(),
    mode: options.fix ? 'fix' : 'report',
  };
}
