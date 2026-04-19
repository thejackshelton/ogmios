/**
 * Browser-safe base class — does NOT import from the ogmios Node entry because
 * the browser entry (`ogmios/vitest/browser`) must not pull in Node-only modules.
 * Structurally compatible with the ogmios `OgmiosError` (Error + `.code`).
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

export class OgmiosConcurrentTestError extends OgmiosError {
  constructor() {
    super(
      'VoiceOver is a system singleton; test.concurrent is not supported. ' +
        'Use test() or it() (serial) inside a VO-scoped test file.',
      'ERR_OGMIOS_CONCURRENT_TEST',
    );
    this.name = 'OgmiosConcurrentTestError';
  }
}

export class OgmiosPlatformUnsupportedError extends OgmiosError {
  constructor(public readonly platform: string) {
    super(
      `Ogmios Vitest integration requires macOS; this host is ${platform}. ` +
        'Set up a macOS runner — see https://github.com/thejackshelton/ogmios.',
      'ERR_OGMIOS_PLATFORM_UNSUPPORTED',
    );
    this.name = 'OgmiosPlatformUnsupportedError';
  }
}

export class OgmiosSessionNotFoundError extends OgmiosError {
  constructor(public readonly sessionId: string) {
    super(
      `Ogmios session "${sessionId}" is not active. Call voiceOver.start() first, or the session was already stopped.`,
      'ERR_OGMIOS_SESSION_NOT_FOUND',
    );
    this.name = 'OgmiosSessionNotFoundError';
  }
}

export class OgmiosBindingNotAvailableError extends OgmiosError {
  constructor(cause?: string) {
    super(
      'The ogmios native binding is not available in this process. ' +
        (cause ? `Underlying error: ${cause}. ` : '') +
        'Run `npx ogmios info` or check that the platform-specific binding is installed.',
      'ERR_OGMIOS_BINDING_NOT_AVAILABLE',
    );
    this.name = 'OgmiosBindingNotAvailableError';
  }
}
