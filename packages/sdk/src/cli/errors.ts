/**
 * `ogmios/cli` (doctor) typed error taxonomy.
 * Mirrors the `ogmios` OgmiosError pattern (stable `code` string + `name`).
 */

export class DoctorError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'DoctorError';
  }
}

export class UnsupportedMacOSError extends DoctorError {
  constructor(public readonly version: string) {
    super(
      `This macOS version (${version}) is not supported by ogmios. ` +
        `Supported: 14.x (Sonoma), 15.x (Sequoia), 26.x (Tahoe). ` +
        `See the platform-risk docs for the current matrix.`,
      'ERR_UNSUPPORTED_MACOS',
    );
    this.name = 'UnsupportedMacOSError';
  }
}

export class HelperNotFoundError extends DoctorError {
  constructor(public readonly searchedPaths: string[]) {
    super(
      `OgmiosRunner.app was not found in any known location. Searched:\n  - ${searchedPaths.join('\n  - ')}\n` +
        `Install ogmios (which pulls in the platform binding containing the helper), ` +
        `or set OGMIOS_HELPER_PATH to override.`,
      'ERR_HELPER_NOT_FOUND',
    );
    this.name = 'HelperNotFoundError';
  }
}

export class NonDarwinHostError extends DoctorError {
  constructor(public readonly platform: string) {
    super(
      `ogmios doctor only runs on macOS (detected platform: ${platform}). ` +
        `Windows/Linux variants are tracked for v2+.`,
      'ERR_NON_DARWIN_HOST',
    );
    this.name = 'NonDarwinHostError';
  }
}
