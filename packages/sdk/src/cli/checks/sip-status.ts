import { execa } from 'execa';
import type { DoctorCheckResult } from '../report-types.js';

export interface CsrutilParsed {
  enabled: boolean;
  raw: string;
}

/**
 * Parse `csrutil status` output. Example lines:
 *   "System Integrity Protection status: enabled."
 *   "System Integrity Protection status: disabled."
 * A custom configuration may produce a longer multi-line output; we only care
 * about the top-level enabled/disabled state.
 */
export function parseCsrutilOutput(stdout: string): CsrutilParsed {
  const raw = stdout.trim();
  const m = raw.match(/System Integrity Protection status:\s*(enabled|disabled)/i);
  if (m) {
    return { enabled: m[1]!.toLowerCase() === 'enabled', raw };
  }
  // Unknown: default to enabled=true (the safer assumption — act as if SIP blocks writes).
  return { enabled: true, raw };
}

export interface CsrutilResolver {
  (): Promise<string>;
}

const defaultCsrutilResolver: CsrutilResolver = async () => {
  const { stdout } = await execa('/usr/bin/csrutil', ['status'], {
    timeout: 5_000,
    reject: false,
  });
  return stdout;
};

export async function checkSIPStatus(
  resolver: CsrutilResolver = defaultCsrutilResolver,
): Promise<DoctorCheckResult> {
  let stdout: string;
  try {
    stdout = await resolver();
  } catch (err) {
    return {
      id: 'sip-status',
      status: 'warn',
      summary: 'Could not read SIP status (csrutil failed)',
      detail: err instanceof Error ? err.message : String(err),
      meta: { error: true },
    };
  }

  const parsed = parseCsrutilOutput(stdout);
  return {
    id: 'sip-status',
    // SIP enabled is the NORMAL state; we pass either way but include the value for downstream logic.
    status: 'pass',
    summary: `SIP is ${parsed.enabled ? 'enabled' : 'DISABLED'}`,
    detail: parsed.enabled
      ? 'SIP is enabled — shoki doctor --fix can write the VoiceOver plist in user scope; TCC.db writes are not attempted (sealed database).'
      : 'SIP is disabled — this is UNUSUAL on a dev machine but expected inside tart VMs for CI.',
    meta: { enabled: parsed.enabled, raw: parsed.raw.slice(0, 200) },
  };
}
