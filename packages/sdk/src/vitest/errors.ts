/**
 * Browser-safe base class — does NOT import from the munadi Node entry because
 * the browser entry (`munadi/vitest/browser`) must not pull in Node-only modules.
 * Structurally compatible with the munadi `MunadiError` (Error + `.code`).
 */
export class MunadiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MunadiError';
  }
}

export class MunadiConcurrentTestError extends MunadiError {
  constructor() {
    super(
      'VoiceOver is a system singleton; test.concurrent is not supported. ' +
        'Use test() or it() (serial) inside a VO-scoped test file.',
      'ERR_MUNADI_CONCURRENT_TEST',
    );
    this.name = 'MunadiConcurrentTestError';
  }
}

export class MunadiPlatformUnsupportedError extends MunadiError {
  constructor(public readonly platform: string) {
    super(
      `Munadi Vitest integration requires macOS; this host is ${platform}. ` +
        'Run `npx munadi doctor` or set up a macOS runner — see https://github.com/thejackshelton/munadi.',
      'ERR_MUNADI_PLATFORM_UNSUPPORTED',
    );
    this.name = 'MunadiPlatformUnsupportedError';
  }
}

export class MunadiSessionNotFoundError extends MunadiError {
  constructor(public readonly sessionId: string) {
    super(
      `Munadi session "${sessionId}" is not active. Call voiceOver.start() first, or the session was already stopped.`,
      'ERR_MUNADI_SESSION_NOT_FOUND',
    );
    this.name = 'MunadiSessionNotFoundError';
  }
}

export class MunadiBindingNotAvailableError extends MunadiError {
  constructor(cause?: string) {
    super(
      'The munadi native binding is not available in this process. ' +
        (cause ? `Underlying error: ${cause}. ` : '') +
        'Run `npx munadi doctor` or check that the platform-specific binding is installed.',
      'ERR_MUNADI_BINDING_NOT_AVAILABLE',
    );
    this.name = 'MunadiBindingNotAvailableError';
  }
}
