import { execa } from 'execa';
import { type DoctorCheckResult, ExitCode } from '../report-types.js';

const SUPPORTED_MAJORS = [14, 15, 26] as const;
export type SupportedMajor = (typeof SUPPORTED_MAJORS)[number];

/**
 * Parse the leading integer major from a `sw_vers -productVersion` string.
 * Accepts `"14.6.1"`, `"15.2"`, `"26.0"`, `" 15.2 \r\n"`.
 * Returns NaN for unparseable input.
 */
export function parseMajorVersion(sw_vers: string): number {
  const trimmed = sw_vers.trim();
  const m = trimmed.match(/^(\d+)/);
  if (!m) return Number.NaN;
  return Number.parseInt(m[1]!, 10);
}

/** Shape that the real check consumes; exposed so tests can inject fixtures. */
export interface SwVersResolver {
  (): Promise<string>;
}

const defaultSwVersResolver: SwVersResolver = async () => {
  const { stdout } = await execa('/usr/bin/sw_vers', ['-productVersion'], {
    timeout: 5_000,
  });
  return stdout;
};

export async function checkMacOSVersion(
  resolver: SwVersResolver = defaultSwVersResolver,
): Promise<DoctorCheckResult> {
  let raw: string;
  try {
    raw = await resolver();
  } catch (err) {
    return {
      id: 'os-version',
      status: 'fail',
      summary: 'Could not read macOS version (sw_vers failed)',
      detail: err instanceof Error ? err.message : String(err),
      exitCode: ExitCode.OS_UNSUPPORTED,
    };
  }

  const major = parseMajorVersion(raw);
  const productVersion = raw.trim();

  if (!Number.isFinite(major)) {
    return {
      id: 'os-version',
      status: 'fail',
      summary: `Unable to parse macOS version from "${raw}"`,
      exitCode: ExitCode.OS_UNSUPPORTED,
    };
  }

  if (!SUPPORTED_MAJORS.includes(major as SupportedMajor)) {
    return {
      id: 'os-version',
      status: 'fail',
      summary: `macOS ${productVersion} is not supported (major=${major}; supported: 14, 15, 26)`,
      detail:
        `ogmios supports macOS 14 (Sonoma), 15 (Sequoia), 26 (Tahoe). ` +
        `Earlier versions predate the current VoiceOver AppleScript surface; ` +
        `later versions have not been tested — check for a ogmios release that explicitly covers macOS ${major}.`,
      exitCode: ExitCode.OS_UNSUPPORTED,
      meta: { major, productVersion },
    };
  }

  return {
    id: 'os-version',
    status: 'pass',
    summary: `macOS ${productVersion} (major ${major}) — supported`,
    meta: { major, productVersion },
  };
}
