/**
 * Shoki error taxonomy. Every error thrown by the SDK inherits from ShokiError
 * and carries a stable `code` suitable for programmatic handling.
 */
export class ShokiError extends Error {
	constructor(
		message: string,
		public readonly code: string,
	) {
		super(message);
		this.name = "ShokiError";
	}
}

export class UnsupportedPlatformError extends ShokiError {
	constructor(
		public readonly platform: string,
		public readonly arch: string,
	) {
		super(
			`Shoki does not support platform=${platform} arch=${arch}. ` +
				`Supported in v1: darwin-arm64, darwin-x64. ` +
				`See https://github.com/shoki/shoki/blob/main/README.md for the current platform matrix.`,
			"ERR_UNSUPPORTED_PLATFORM",
		);
		this.name = "UnsupportedPlatformError";
	}
}

export class BindingNotInstalledError extends ShokiError {
	constructor(public readonly expectedPackage: string) {
		super(
			`The native binding package "${expectedPackage}" is not installed. ` +
				`This usually means your package manager skipped optionalDependencies — ` +
				`check your install (npm, pnpm, yarn) and confirm ${expectedPackage} is in node_modules. ` +
				`Phase 2 ships a 'shoki doctor' CLI that diagnoses this automatically.`,
			"ERR_BINDING_NOT_INSTALLED",
		);
		this.name = "BindingNotInstalledError";
	}
}

export class DriverNotFoundError extends ShokiError {
	constructor(public readonly driverName: string) {
		super(
			`Driver "${driverName}" is not registered in this binding. ` +
				`Phase 1 v1 ships with drivers: noop. Phase 3 adds: voiceover (darwin).`,
			"ERR_DRIVER_NOT_FOUND",
		);
		this.name = "DriverNotFoundError";
	}
}
