import { type DoctorCheckResult, ExitCode, type FixAction } from '../report-types.js';
import { type CSReqCompareResult, compareCSReq } from './csreq-compare.js';
import {
  openTCCDatabase,
  SYSTEM_TCC_DB_PATH,
  USER_TCC_DB_PATH,
} from './tcc-db-paths.js';

/**
 * CONTEXT.md D-05 deep links. These URLs are stable across macOS 14-26.
 * FullDiskAccess URL is included for NEEDS_FULL_DISK_ACCESS (exit 7) guidance.
 */
const DEEP_LINK_ACCESSIBILITY =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility';
const DEEP_LINK_AUTOMATION =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation';
const DEEP_LINK_FULL_DISK_ACCESS =
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';

/**
 * CONTEXT.md D-03 client allowlist — clients shoki cares about when filtering TCC.db rows.
 * Developers may also have granted their terminal or IDE; we surface those too.
 */
const DEFAULT_CLIENT_MATCHES = [
  'com.shoki.runner', // release helper bundle
  'node', // un-wrapped node invocation
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'com.microsoft.VSCode',
];

const VOICEOVER_BUNDLE_ID = 'com.apple.VoiceOver';

export interface TCCGrantRow {
  client: string;
  service: string;
  auth_value: number;
  csreq: Buffer;
  indirect_object_identifier: string | null;
  /** Which DB the row came from. */
  scope: 'user' | 'system';
  /** Signature-match classification against the current helper signature. */
  csreqMatch: CSReqCompareResult;
}

export type InjectedScopeError = {
  ok: false;
  reason: 'not-found' | 'permission-denied' | 'other';
  error: string;
};

export type InjectedScope =
  | Array<Omit<TCCGrantRow, 'scope' | 'csreqMatch'>>
  | InjectedScopeError;

export interface EnumerateTCCGrantsOptions {
  currentHelperAuthority: string | null;
  clientMatches?: string[];
  /** Testing seam: pass `rowSource` to bypass the real sqlite open. */
  rowSource?: {
    user?: InjectedScope;
    system?: InjectedScope;
  };
}

export interface EnumerateTCCGrantsResult {
  rows: TCCGrantRow[];
  userDbAccessible: boolean;
  systemDbAccessible: boolean;
  warnings: string[];
}

/**
 * Read user + system TCC.db, filter to services we care about and clients in the allowlist,
 * return rows annotated with their csreq-match classification.
 *
 * Tests inject `rowSource` to avoid real sqlite calls.
 */
export function enumerateTCCGrants(
  options: EnumerateTCCGrantsOptions,
): EnumerateTCCGrantsResult {
  const clientMatches = options.clientMatches ?? DEFAULT_CLIENT_MATCHES;
  const wantedServices = ['kTCCServiceAccessibility', 'kTCCServiceAppleEvents'];
  const rows: TCCGrantRow[] = [];
  const warnings: string[] = [];

  const readScope = (
    scope: 'user' | 'system',
    dbPath: string,
  ): {
    accessible: boolean;
    rows: Array<Omit<TCCGrantRow, 'scope' | 'csreqMatch'>>;
  } => {
    // Test seam
    const injected = options.rowSource?.[scope];
    if (injected !== undefined) {
      if (Array.isArray(injected)) return { accessible: true, rows: injected };
      warnings.push(
        `${scope} TCC.db not accessible (${injected.reason}): ${injected.error}`,
      );
      return { accessible: false, rows: [] };
    }

    const opened = openTCCDatabase(dbPath);
    if (!opened.ok) {
      warnings.push(
        `${scope} TCC.db not accessible (${opened.reason}): ${opened.error}`,
      );
      return { accessible: false, rows: [] };
    }
    try {
      const stmt = opened.db.prepare(
        `SELECT client, service, auth_value, csreq, indirect_object_identifier
         FROM access
         WHERE service IN (?, ?)`,
      );
      const raw = stmt.all(...wantedServices) as Array<{
        client: string;
        service: string;
        auth_value: number;
        csreq: Buffer | null;
        indirect_object_identifier: string | null;
      }>;
      return {
        accessible: true,
        rows: raw.map((r) => ({
          client: r.client,
          service: r.service,
          auth_value: r.auth_value,
          csreq: r.csreq ?? Buffer.alloc(0),
          indirect_object_identifier: r.indirect_object_identifier,
        })),
      };
    } finally {
      opened.db.close();
    }
  };

  const user = readScope('user', USER_TCC_DB_PATH);
  const system = readScope('system', SYSTEM_TCC_DB_PATH);

  const ingest = (
    scope: 'user' | 'system',
    raw: Array<Omit<TCCGrantRow, 'scope' | 'csreqMatch'>>,
  ) => {
    for (const r of raw) {
      if (!clientMatches.includes(r.client)) continue;
      rows.push({
        ...r,
        scope,
        csreqMatch: compareCSReq(r.csreq, options.currentHelperAuthority),
      });
    }
  };

  ingest('user', user.rows);
  ingest('system', system.rows);

  return {
    rows,
    userDbAccessible: user.accessible,
    systemDbAccessible: system.accessible,
    warnings,
  };
}

/**
 * CONTEXT.md D-03 — PERM-02: Accessibility grant present for the shoki trust anchor.
 * auth_value must be 2 (allowed) AND csreq must match the current helper signature.
 */
export function checkTCCAccessibility(
  enumeration: EnumerateTCCGrantsResult,
): DoctorCheckResult {
  if (!enumeration.userDbAccessible) {
    return buildFullDiskAccessFailure('tcc-accessibility', enumeration);
  }

  const matches = enumeration.rows.filter(
    (r) => r.service === 'kTCCServiceAccessibility' && r.auth_value === 2,
  );
  const matching = matches.find((r) => r.csreqMatch === 'match');
  const staleMatch = matches.find((r) => r.csreqMatch === 'mismatch');

  if (matching) {
    return {
      id: 'tcc-accessibility',
      status: 'pass',
      summary: `Accessibility grant present for ${matching.client} (scope=${matching.scope})`,
      meta: { client: matching.client, scope: matching.scope },
    };
  }

  if (staleMatch) {
    return {
      id: 'tcc-accessibility',
      status: 'fail',
      summary: `Accessibility grant exists for ${staleMatch.client} but the signature is STALE — helper has been re-signed since the grant`,
      detail:
        `The TCC entry was granted to a prior signature of ShokiRunner. macOS treats re-signed binaries as different apps ` +
        `(PITFALLS.md Pitfall 2). You must remove the old entry in System Settings and re-grant.`,
      exitCode: ExitCode.SIGNATURE_MISMATCH,
      fixActions: accessibilityFix(),
      meta: { staleClient: staleMatch.client, scope: staleMatch.scope },
    };
  }

  return {
    id: 'tcc-accessibility',
    status: 'fail',
    summary: 'No Accessibility grant found for the shoki trust anchor',
    detail:
      'Grant Accessibility permission to ShokiRunner.app (or your terminal, if running un-wrapped) in System Settings.',
    exitCode: ExitCode.TCC_MISSING_ACCESSIBILITY,
    fixActions: accessibilityFix(),
  };
}

/**
 * CONTEXT.md D-03 — PERM-02: Automation grant for VoiceOver (kTCCServiceAppleEvents with indirect_object = com.apple.VoiceOver).
 */
export function checkTCCAutomation(
  enumeration: EnumerateTCCGrantsResult,
): DoctorCheckResult {
  if (!enumeration.userDbAccessible) {
    return buildFullDiskAccessFailure('tcc-automation', enumeration);
  }

  const matches = enumeration.rows.filter(
    (r) =>
      r.service === 'kTCCServiceAppleEvents' &&
      r.auth_value === 2 &&
      r.indirect_object_identifier === VOICEOVER_BUNDLE_ID,
  );
  const matching = matches.find((r) => r.csreqMatch === 'match');
  const staleMatch = matches.find((r) => r.csreqMatch === 'mismatch');

  if (matching) {
    return {
      id: 'tcc-automation',
      status: 'pass',
      summary: `Automation grant for VoiceOver present (client=${matching.client}, scope=${matching.scope})`,
      meta: {
        client: matching.client,
        scope: matching.scope,
        target: VOICEOVER_BUNDLE_ID,
      },
    };
  }

  if (staleMatch) {
    return {
      id: 'tcc-automation',
      status: 'fail',
      summary: `Automation→VoiceOver grant exists but the signature is STALE for ${staleMatch.client}`,
      detail:
        `The Automation grant was issued to an older signature. Remove the old entry in System Settings → Privacy → Automation and re-grant.`,
      exitCode: ExitCode.SIGNATURE_MISMATCH,
      fixActions: automationFix(),
      meta: { staleClient: staleMatch.client, scope: staleMatch.scope },
    };
  }

  return {
    id: 'tcc-automation',
    status: 'fail',
    summary: 'No Automation→VoiceOver grant found for the shoki trust anchor',
    detail:
      'Grant Automation permission for VoiceOver to ShokiRunner.app (or your terminal) in System Settings → Privacy → Automation. ' +
      'Without this grant, AppleScript commands to VoiceOver will silently no-op.',
    exitCode: ExitCode.TCC_MISSING_AUTOMATION,
    fixActions: automationFix(),
  };
}

/**
 * CONTEXT.md D-03 — PERM-03: Any TCC grant whose csreq doesn't match the current helper signature.
 */
export function checkTCCStaleEntries(
  enumeration: EnumerateTCCGrantsResult,
): DoctorCheckResult {
  const stale = enumeration.rows.filter((r) => r.csreqMatch === 'mismatch');
  if (stale.length === 0) {
    return {
      id: 'tcc-stale-entries',
      status: 'pass',
      summary: 'No stale/orphaned TCC entries detected',
    };
  }

  return {
    id: 'tcc-stale-entries',
    status: 'warn',
    summary: `${stale.length} stale TCC entr${stale.length === 1 ? 'y' : 'ies'} detected — prior signatures of ShokiRunner`,
    detail: `${stale
      .map(
        (r) =>
          `  ${r.service} → ${r.client}${r.indirect_object_identifier ? ` (target: ${r.indirect_object_identifier})` : ''} (scope=${r.scope})`,
      )
      .join('\n')}\n\nOpen System Settings → Privacy & Security → Accessibility/Automation and remove the stale entries before re-granting. ` +
      'macOS cannot auto-clean these; tccutil only resets grants for bundles still at the expected path.',
    fixActions: [...accessibilityFix(), ...automationFix()],
    meta: {
      staleCount: stale.length,
      rows: stale.map((r) => ({
        service: r.service,
        client: r.client,
        scope: r.scope,
        indirect: r.indirect_object_identifier,
      })),
    },
  };
}

// ---- helpers ----

function accessibilityFix(): FixAction[] {
  // Plan 08-04: emit the GUI launcher FIRST so `doctor --fix` launches the
  // bundled ShokiSetup.app (which triggers the TCC prompt cleanly via a real
  // .app trust anchor). The open-system-settings deep link remains as a
  // fallback that the reporter prints for users who prefer the manual path.
  return [
    { kind: 'launch-setup-app', appPath: null },
    {
      kind: 'open-system-settings',
      url: DEEP_LINK_ACCESSIBILITY,
      pane: 'accessibility',
    },
  ];
}

function automationFix(): FixAction[] {
  return [
    { kind: 'launch-setup-app', appPath: null },
    {
      kind: 'open-system-settings',
      url: DEEP_LINK_AUTOMATION,
      pane: 'automation',
    },
  ];
}

function buildFullDiskAccessFailure(
  id: 'tcc-accessibility' | 'tcc-automation',
  enumeration: EnumerateTCCGrantsResult,
): DoctorCheckResult {
  return {
    id,
    status: 'fail',
    summary:
      'Cannot read user TCC.db — shoki doctor needs Full Disk Access (or the DB is unreadable)',
    detail: `${enumeration.warnings.join('\n')}\n\nGrant Full Disk Access to your terminal/IDE in System Settings → Privacy → Full Disk Access, then rerun doctor.`,
    exitCode: ExitCode.NEEDS_FULL_DISK_ACCESS,
    fixActions: [
      {
        kind: 'open-system-settings',
        url: DEEP_LINK_FULL_DISK_ACCESS,
        // Falls through the FixAction type as `accessibility` pane since there's no FDA pane enum — CONTEXT.md D-05 only enumerates accessibility/automation.
        pane: 'accessibility',
      },
    ],
  };
}
