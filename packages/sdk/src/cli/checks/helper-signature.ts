import { execa } from 'execa';
import { type DoctorCheckResult, ExitCode } from '../report-types.js';

export interface CodesignOutput {
  /** The Developer ID Authority line, e.g. "Developer ID Application: Jack Shelton (TEAMIDXYZ)". Null if unsigned. */
  authority: string | null;
  /** True if the signature line reads `Signature=adhoc`. */
  adhoc: boolean;
  /** True when the output contains "code object is not signed at all". */
  unsigned: boolean;
  /** Identifier= value if present. */
  identifier: string | null;
  /** TeamIdentifier= value; "not set" becomes null. */
  teamIdentifier: string | null;
}

/**
 * Parse codesign -dvvv stderr output.
 * The Developer ID Authority is the FIRST "Authority=" line — subsequent Authority=
 * lines are the CA chain (Developer ID Certification Authority, Apple Root CA).
 */
export function parseCodesignOutput(stderr: string): CodesignOutput {
  const unsigned = /code object is not signed at all/.test(stderr);
  const adhoc =
    /^Signature=adhoc$/m.test(stderr) || /flags=0x[0-9a-f]*\(adhoc\)/i.test(stderr);

  let authority: string | null = null;
  const authMatch = stderr.match(/^Authority=(.+)$/m);
  if (authMatch) authority = authMatch[1]!.trim();

  let identifier: string | null = null;
  const idMatch = stderr.match(/^Identifier=(.+)$/m);
  if (idMatch) identifier = idMatch[1]!.trim();

  let teamIdentifier: string | null = null;
  const teamMatch = stderr.match(/^TeamIdentifier=(.+)$/m);
  if (teamMatch) {
    const v = teamMatch[1]!.trim();
    teamIdentifier = v === 'not set' ? null : v;
  }

  return { authority, adhoc, unsigned, identifier, teamIdentifier };
}

export interface CodesignResolver {
  (helperPath: string): Promise<string>;
}

const defaultCodesignResolver: CodesignResolver = async (helperPath) => {
  const { stderr } = await execa('/usr/bin/codesign', ['-dvvv', helperPath], {
    timeout: 10_000,
    reject: false,
  });
  return stderr;
};

export async function checkHelperSignature(
  helperPath: string,
  resolver: CodesignResolver = defaultCodesignResolver,
): Promise<DoctorCheckResult> {
  let stderr: string;
  try {
    stderr = await resolver(helperPath);
  } catch (err) {
    return {
      id: 'helper-signature',
      status: 'fail',
      summary: `Could not read codesign output for ${helperPath}`,
      detail: err instanceof Error ? err.message : String(err),
      exitCode: ExitCode.HELPER_UNSIGNED,
    };
  }

  const parsed = parseCodesignOutput(stderr);

  if (parsed.unsigned) {
    return {
      id: 'helper-signature',
      status: 'fail',
      summary: `MunadiRunner.app at ${helperPath} is UNSIGNED (dev build)`,
      detail:
        `Unsigned helpers trigger a TCC prompt on every launch and do not survive binary changes — ` +
        `see PITFALLS.md Pitfall 2. For release builds, Developer ID sign + notarize.`,
      exitCode: ExitCode.HELPER_UNSIGNED,
      meta: { helperPath, parsed },
    };
  }

  if (parsed.adhoc) {
    return {
      id: 'helper-signature',
      status: 'warn',
      summary: `MunadiRunner.app at ${helperPath} is ad-hoc signed (not Developer ID)`,
      detail:
        `Ad-hoc signatures are local-dev-only; they change on every rebuild and TCC will re-prompt.`,
      meta: { helperPath, parsed },
    };
  }

  if (!parsed.authority) {
    return {
      id: 'helper-signature',
      status: 'fail',
      summary: `codesign output for ${helperPath} did not contain an Authority= line`,
      detail: `The binary may be corrupted or codesign is reporting an unrecognized signature state.`,
      exitCode: ExitCode.HELPER_UNSIGNED,
      meta: { helperPath, parsed, rawStderrPreview: stderr.slice(0, 500) },
    };
  }

  return {
    id: 'helper-signature',
    status: 'pass',
    summary: `MunadiRunner.app signed: ${parsed.authority}`,
    meta: { helperPath, parsed },
  };
}
