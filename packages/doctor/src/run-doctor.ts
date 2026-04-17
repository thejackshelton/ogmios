import {
  checkHelperSignature,
  checkMacOSVersion,
  checkSIPStatus,
  checkVOPlist,
  discoverHelper,
} from './checks/index.js';
import {
  checkTCCAccessibility,
  checkTCCAutomation,
  checkTCCStaleEntries,
  type EnumerateTCCGrantsResult,
  enumerateTCCGrants,
} from './checks/index-tcc.js';
import { applyFixActions } from './fix-executor.js';
import {
  type DoctorCheckResult,
  type DoctorReport,
  ExitCode,
  resolveExitCode,
} from './report-types.js';

export interface RunDoctorOptions {
  fix?: boolean;
  /** Path override for the helper app (CONTEXT.md D-09 — SHOKI_HELPER_PATH). */
  helperPath?: string;
  /** When true, runDoctor refuses to run on non-darwin hosts. Defaults to true. */
  requireDarwin?: boolean;
}

/**
 * Orchestrates the 8 Phase 2 checks in a deterministic order.
 * Fix mode re-runs affected checks once after applying fix actions.
 */
export async function runDoctor(
  options: RunDoctorOptions = {},
): Promise<DoctorReport> {
  const requireDarwin = options.requireDarwin !== false;
  if (requireDarwin && process.platform !== 'darwin') {
    return {
      ok: false,
      exitCode: ExitCode.OS_UNSUPPORTED,
      macOSVersion: null,
      helperPath: options.helperPath ?? null,
      helperSignature: null,
      checks: [
        {
          id: 'os-version',
          status: 'fail',
          summary: `shoki doctor only runs on macOS (detected: ${process.platform})`,
          exitCode: ExitCode.OS_UNSUPPORTED,
        },
      ],
      ranAt: new Date().toISOString(),
      mode: options.fix ? 'fix' : 'report',
    };
  }

  const checks: DoctorCheckResult[] = [];
  let macOSVersion: string | null = null;
  let helperPath: string | null = options.helperPath ?? null;
  let helperAuthority: string | null = null;

  // 1. OS version — gates everything else
  const osCheck = await checkMacOSVersion();
  checks.push(osCheck);
  if (osCheck.meta && typeof osCheck.meta.productVersion === 'string') {
    macOSVersion = osCheck.meta.productVersion;
  }
  const macOSMajor =
    osCheck.meta && typeof osCheck.meta.major === 'number' ? osCheck.meta.major : null;

  // 2. Helper discovery
  const { result: helperResult, location } = await discoverHelper({
    overridePath: options.helperPath,
  });
  checks.push(helperResult);
  if (location) helperPath = location.path;

  // 3. Helper signature (only if helper was found)
  if (helperPath) {
    const sigResult = await checkHelperSignature(helperPath);
    checks.push(sigResult);
    if (
      sigResult.status === 'pass' &&
      sigResult.meta &&
      typeof sigResult.meta === 'object' &&
      'parsed' in sigResult.meta &&
      sigResult.meta.parsed &&
      typeof (sigResult.meta.parsed as { authority?: string }).authority === 'string'
    ) {
      helperAuthority = (sigResult.meta.parsed as { authority: string }).authority;
    }
  } else {
    checks.push({
      id: 'helper-signature',
      status: 'skip',
      summary: 'Skipped — no helper found',
    });
  }

  // 4. SIP status (informational; --fix gates on this)
  const sipCheck = await checkSIPStatus();
  checks.push(sipCheck);
  const sipEnabled =
    sipCheck.meta && typeof sipCheck.meta.enabled === 'boolean'
      ? sipCheck.meta.enabled
      : true;

  // 5. VO plist (only if macOS major known)
  let plistCheck: DoctorCheckResult;
  if (macOSMajor === null) {
    plistCheck = {
      id: 'vo-plist',
      status: 'skip',
      summary: 'Skipped — macOS version unknown',
    };
  } else {
    plistCheck = await checkVOPlist({ macOSMajor });
  }
  checks.push(plistCheck);

  // 6-8. TCC enumeration + 3 checks
  let enumeration: EnumerateTCCGrantsResult | null = null;
  if (macOSMajor !== null) {
    enumeration = enumerateTCCGrants({ currentHelperAuthority: helperAuthority });
    checks.push(checkTCCAccessibility(enumeration));
    checks.push(checkTCCAutomation(enumeration));
    checks.push(checkTCCStaleEntries(enumeration));
  } else {
    for (const id of [
      'tcc-accessibility',
      'tcc-automation',
      'tcc-stale-entries',
    ] as const) {
      checks.push({ id, status: 'skip', summary: 'Skipped — macOS version unknown' });
    }
  }

  // --fix phase: apply safe actions, then re-check affected checks
  if (options.fix) {
    const fixable: DoctorCheckResult[] = checks.filter(
      (c) => c.status === 'fail' && c.fixActions && c.fixActions.length > 0,
    );
    const { appliedActions } = await applyFixActions(
      fixable.flatMap((c) => c.fixActions ?? []),
      { sipEnabled },
    );
    // Re-check VO plist if we wrote to it
    if (
      appliedActions.some((a) => a.kind === 'defaults-write') &&
      macOSMajor !== null
    ) {
      const recheck = await checkVOPlist({ macOSMajor });
      // Replace the earlier plist check result with the re-check
      const idx = checks.findIndex((c) => c.id === 'vo-plist');
      if (idx >= 0) checks[idx] = recheck;
      else checks.push(recheck);
    }
  }

  const exitCode = resolveExitCode(checks);
  return {
    ok: exitCode === ExitCode.OK,
    exitCode,
    macOSVersion,
    helperPath,
    helperSignature: helperAuthority,
    checks,
    ranAt: new Date().toISOString(),
    mode: options.fix ? 'fix' : 'report',
  };
}
