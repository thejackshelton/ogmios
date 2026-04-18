/**
 * `@shoki/sdk/cli` (doctor) typed error taxonomy.
 * Mirrors the `@shoki/sdk` ShokiError pattern (stable `code` string + `name`).
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
      `This macOS version (${version}) is not supported by shoki. ` +
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
      `ShokiRunner.app was not found in any known location. Searched:\n  - ${searchedPaths.join('\n  - ')}\n` +
        `Install @shoki/sdk (which pulls in the platform binding containing the helper), ` +
        `or set SHOKI_HELPER_PATH to override.`,
      'ERR_HELPER_NOT_FOUND',
    );
    this.name = 'HelperNotFoundError';
  }
}

export class NonDarwinHostError extends DoctorError {
  constructor(public readonly platform: string) {
    super(
      `shoki doctor only runs on macOS (detected platform: ${platform}). ` +
        `Windows/Linux variants are tracked for v2+.`,
      'ERR_NON_DARWIN_HOST',
    );
    this.name = 'NonDarwinHostError';
  }
}
