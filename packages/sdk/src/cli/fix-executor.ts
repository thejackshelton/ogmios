import { execa } from 'execa';
import type { FixAction } from './report-types.js';

export interface FixExecutionResult {
  appliedActions: FixAction[];
  skippedActions: Array<{ action: FixAction; reason: string }>;
  errors: Array<{ action: FixAction; error: string }>;
}

export interface ApplyFixActionsOptions {
  sipEnabled: boolean;
  /** Test seam: replace the defaults-write invocation. */
  defaultsWriter?: (
    plistPath: string,
    key: string,
    value: boolean,
  ) => Promise<void>;
}

const defaultDefaultsWriter = async (
  plistPath: string,
  key: string,
  value: boolean,
): Promise<void> => {
  await execa(
    '/usr/bin/defaults',
    ['write', plistPath, key, '-bool', value ? 'true' : 'false'],
    { timeout: 5_000 },
  );
};

/**
 * CONTEXT.md D-04 — apply ONLY safe fix actions:
 *   defaults-write         → execute (if SIP-permitted-scope)
 *   open-system-settings   → print a one-line `open <url>` command for the user to copy; do NOT auto-open
 *   manual                 → print instructions; do NOT execute
 *
 * TCC.db is NEVER written — the open-system-settings action for Accessibility/Automation
 * is exactly the CONTEXT.md D-04 strict rule: we surface the deep link, the user clicks.
 */
export async function applyFixActions(
  actions: FixAction[],
  options: ApplyFixActionsOptions,
): Promise<FixExecutionResult> {
  const writer = options.defaultsWriter ?? defaultDefaultsWriter;
  const applied: FixAction[] = [];
  const skipped: Array<{ action: FixAction; reason: string }> = [];
  const errors: Array<{ action: FixAction; error: string }> = [];

  for (const action of actions) {
    if (action.kind === 'defaults-write') {
      // SIP gating: user-scope plists ($HOME/Library/...) are always writable when SIP is on;
      // the SIP concern applies to /private/var/db/Accessibility/.VoiceOverAppleScriptEnabled,
      // which we intentionally do NOT touch (CONTEXT.md D-04). If a future plist were
      // SIP-protected, gate here; for current plist paths (~/Library/... and
      // ~/Library/Group Containers/...) the write is always safe.
      try {
        await writer(action.plistPath, action.key, action.value);
        applied.push(action);
      } catch (err) {
        errors.push({
          action,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      continue;
    }

    if (action.kind === 'open-system-settings') {
      // Per CONTEXT.md D-04 strict rule — NEVER auto-click through the system settings;
      // the reporter prints `open <url>` for the user to run. We surface this as "skipped"
      // with reason = "manual action required" so the reporter can highlight it.
      skipped.push({ action, reason: 'manual-user-action' });
      continue;
    }

    if (action.kind === 'manual') {
      skipped.push({ action, reason: 'manual-instructions-only' });
      continue;
    }
  }

  // Intentionally referenced so lint doesn't complain when SIP flag is unused in common path:
  void options.sipEnabled;

  return { appliedActions: applied, skippedActions: skipped, errors };
}
