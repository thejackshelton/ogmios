/**
 * Browser-safe base class — does NOT import from the dicta Node entry because
 * the browser entry (`dicta/vitest/browser`) must not pull in Node-only modules.
 * Structurally compatible with the dicta `ShokiError` (Error + `.code`).
 */
export class ShokiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'ShokiError';
  }
}

export class ShokiConcurrentTestError extends ShokiError {
  constructor() {
    super(
      'VoiceOver is a system singleton; test.concurrent is not supported. ' +
        'Use test() or it() (serial) inside a VO-scoped test file.',
      'ERR_SHOKI_CONCURRENT_TEST',
    );
    this.name = 'ShokiConcurrentTestError';
  }
}

export class ShokiPlatformUnsupportedError extends ShokiError {
  constructor(public readonly platform: string) {
    super(
      `Shoki Vitest integration requires macOS; this host is ${platform}. ` +
        'Run `npx dicta doctor` or set up a macOS runner — see https://github.com/shoki/shoki.',
      'ERR_SHOKI_PLATFORM_UNSUPPORTED',
    );
    this.name = 'ShokiPlatformUnsupportedError';
  }
}

export class ShokiSessionNotFoundError extends ShokiError {
  constructor(public readonly sessionId: string) {
    super(
      `Shoki session "${sessionId}" is not active. Call voiceOver.start() first, or the session was already stopped.`,
      'ERR_SHOKI_SESSION_NOT_FOUND',
    );
    this.name = 'ShokiSessionNotFoundError';
  }
}

export class ShokiBindingNotAvailableError extends ShokiError {
  constructor(cause?: string) {
    super(
      'The dicta native binding is not available in this process. ' +
        (cause ? `Underlying error: ${cause}. ` : '') +
        'Run `npx dicta doctor` or check that the platform-specific binding is installed.',
      'ERR_SHOKI_BINDING_NOT_AVAILABLE',
    );
    this.name = 'ShokiBindingNotAvailableError';
  }
}
