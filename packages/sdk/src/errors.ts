/**
 * Ogmios error taxonomy. Every error thrown by the SDK inherits from OgmiosError
 * and carries a stable `code` suitable for programmatic handling.
 */
export class OgmiosError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'OgmiosError';
  }
}

export class UnsupportedPlatformError extends OgmiosError {
  constructor(
    public readonly platform: string,
    public readonly arch: string,
  ) {
    super(
      `Ogmios does not support platform=${platform} arch=${arch}. ` +
        `Supported in v1: darwin-arm64, darwin-x64. ` +
        `See https://github.com/thejackshelton/ogmios/blob/main/README.md for the current platform matrix.`,
      'ERR_UNSUPPORTED_PLATFORM',
    );
    this.name = 'UnsupportedPlatformError';
  }
}

export class BindingNotInstalledError extends OgmiosError {
  constructor(public readonly expectedPackage: string) {
    super(
      `The native binding package "${expectedPackage}" is not installed. ` +
        `This usually means your package manager skipped optionalDependencies — ` +
        `check your install (npm, pnpm, yarn) and confirm ${expectedPackage} is in node_modules. ` +
        `Run 'npx ogmios info' to see which binding path was searched.`,
      'ERR_BINDING_NOT_INSTALLED',
    );
    this.name = 'BindingNotInstalledError';
  }
}

export class DriverNotFoundError extends OgmiosError {
  constructor(public readonly driverName: string) {
    super(
      `Driver "${driverName}" is not registered in this binding. ` +
        `Phase 1 v1 ships with drivers: noop. Phase 3 adds: voiceover (darwin).`,
      'ERR_DRIVER_NOT_FOUND',
    );
    this.name = 'DriverNotFoundError';
  }
}
