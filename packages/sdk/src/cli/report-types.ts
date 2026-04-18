/**
 * DoctorReport contract for Phase 2 — FROZEN.
 * Plans 02-02 (macos/plist/helper/sip checks), 02-03 (TCC enumeration),
 * and 02-04 (CLI wiring + reporters) implement AGAINST this file.
 *
 * Any change here requires re-agreement across those three plans.
 */

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

/** Every check that doctor runs. Additions go in the relevant plan, not here blindly. */
export type CheckId =
  // Plan 02-02 (PERM-01 + helper preconditions)
  | 'os-version'
  | 'vo-plist'
  | 'helper-present'
  | 'helper-signature'
  | 'sip-status'
  // Plan 02-03 (PERM-02, PERM-03)
  | 'tcc-accessibility'
  | 'tcc-automation'
  | 'tcc-stale-entries';

/** What `--fix` can attempt, or what the human must do themselves. */
export type FixAction =
  | {
      kind: 'defaults-write';
      plistPath: string;
      key: string;
      value: boolean;
    }
  | {
      kind: 'open-system-settings';
      url: string; // CONTEXT.md D-05 — stable 14-26
      pane: 'accessibility' | 'automation';
    }
  | {
      /**
       * Plan 08-04 — launch the bundled ShokiSetup.app GUI.
       * The GUI cleanly triggers macOS Accessibility + Automation TCC prompts
       * via a real `.app`-bundle trust anchor (Phase 7 proved CLI-parent
       * prompts don't fire). --fix executes this action automatically.
       */
      kind: 'launch-setup-app';
      /** Resolved path, or null if resolution should happen at fix time. */
      appPath?: string | null;
    }
  | { kind: 'manual'; instructions: string[] };

export interface DoctorCheckResult {
  id: CheckId;
  status: CheckStatus;
  /** One-line, human-readable. Rendered directly in the default reporter. */
  summary: string;
  /** Multi-line, optional. Shown under the summary in verbose mode. */
  detail?: string;
  /** Populated only on `fail` — the exit code that would be returned if this were the sole failure. */
  exitCode?: ExitCode;
  /** Populated when `--fix` can act, or when a deep link is the remediation. */
  fixActions?: FixAction[];
  /** Structured data passed through to --json consumers. */
  meta?: Record<string, unknown>;
}

export interface DoctorReport {
  ok: boolean;
  exitCode: ExitCode;
  /** `null` iff `sw_vers` itself failed (e.g. non-macOS host). */
  macOSVersion: string | null;
  /** Resolved helper path, or `null` if no helper located. */
  helperPath: string | null;
  /** codesign `Authority=` value, or `null` if unsigned / no helper. */
  helperSignature: string | null;
  checks: DoctorCheckResult[];
  /** ISO-8601 timestamp of the run. */
  ranAt: string;
  /** `report` = `shoki doctor`, `fix` = `shoki doctor --fix`. */
  mode: 'report' | 'fix';
}

/**
 * CONTEXT.md D-06 — numeric values are FROZEN and documented in README.md.
 * Do not renumber. CI scripts depend on exact exit codes.
 */
export enum ExitCode {
  OK = 0,
  UNKNOWN_ERROR = 1,
  OS_UNSUPPORTED = 2,
  VO_APPLESCRIPT_DISABLED = 3,
  TCC_MISSING_ACCESSIBILITY = 4,
  TCC_MISSING_AUTOMATION = 5,
  SIGNATURE_MISMATCH = 6,
  NEEDS_FULL_DISK_ACCESS = 7,
  HELPER_MISSING = 8,
  HELPER_UNSIGNED = 9,
}

/**
 * Map a failed check's exitCode to its priority.
 * If multiple checks fail, we return the HIGHEST-priority code (= most fundamental failure).
 * OS_UNSUPPORTED is the highest because nothing else can be trusted on an unsupported OS.
 */
export const EXIT_CODE_PRIORITY: Record<ExitCode, number> = {
  [ExitCode.OK]: 0,
  [ExitCode.OS_UNSUPPORTED]: 100,
  [ExitCode.HELPER_MISSING]: 90,
  [ExitCode.HELPER_UNSIGNED]: 80,
  [ExitCode.NEEDS_FULL_DISK_ACCESS]: 70,
  [ExitCode.SIGNATURE_MISMATCH]: 60,
  [ExitCode.TCC_MISSING_ACCESSIBILITY]: 50,
  [ExitCode.TCC_MISSING_AUTOMATION]: 40,
  [ExitCode.VO_APPLESCRIPT_DISABLED]: 30,
  [ExitCode.UNKNOWN_ERROR]: 10,
};

/**
 * Select the single ExitCode to return from a completed run.
 * Rules:
 *   - If any check has status 'fail', return the highest-priority exitCode among fails.
 *   - Otherwise return OK.
 */
export function resolveExitCode(checks: DoctorCheckResult[]): ExitCode {
  let picked: ExitCode = ExitCode.OK;
  let pickedPriority = EXIT_CODE_PRIORITY[ExitCode.OK];
  for (const c of checks) {
    if (c.status !== 'fail' || c.exitCode === undefined) continue;
    const p = EXIT_CODE_PRIORITY[c.exitCode];
    if (p > pickedPriority) {
      picked = c.exitCode;
      pickedPriority = p;
    }
  }
  return picked;
}
