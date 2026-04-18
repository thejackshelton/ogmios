// Local type augmentation for the Qwik example.
//
// The pre-built `@shoki/sdk/matchers` type augmentation in
// `dist/matchers/types.d.ts` targets `declare module 'vitest'` with
// `interface Assertion<T = any>` / `interface Matchers<T = any>`. In Vitest 4,
// those interfaces live in `@vitest/expect` (re-exported by `vitest`), and
// the augmentation shipped with `@shoki/sdk/matchers` — which was built
// against Vitest 3 — does not always merge cleanly into the Vitest-4 graph
// when both versions coexist in the monorepo (the main `@shoki/*` packages
// stay on Vitest 3; this Qwik example needs Vitest 4 because
// vitest-browser-qwik@0.3+ peer-depends on `vitest ^4`).
//
// This file MUST be a module (contain at least one top-level `import` or
// `export`) so that `declare module 'vitest'` below MERGES with the real
// vitest types instead of REPLACING them. The empty `export {}` at the
// bottom is the idiomatic way to mark an ambient-augmentation file as a
// module under verbatimModuleSyntax.

interface ShokiAnnouncementShape {
  role?: string | RegExp;
  name?: string | RegExp;
  source?: 'applescript' | 'ax';
  interrupt?: boolean;
}

interface ShokiToHaveStableLogOptions {
  quietMs: number;
}

interface ShokiExpectMatchers {
  toHaveAnnounced(shape: ShokiAnnouncementShape): void;
  toHaveAnnouncedText(pattern: string | RegExp): void;
  toHaveNoAnnouncement(): void;
  toHaveStableLog(opts: ShokiToHaveStableLogOptions): Promise<void>;
}

interface ShokiAsymmetricMatchers {
  toHaveAnnounced(shape: ShokiAnnouncementShape): unknown;
  toHaveAnnouncedText(pattern: string | RegExp): unknown;
  toHaveNoAnnouncement(): unknown;
  toHaveStableLog(opts: ShokiToHaveStableLogOptions): unknown;
}

declare module '@vitest/expect' {
  // biome-ignore lint/suspicious/noExplicitAny: match @vitest/expect's own Matchers<T = any>
  interface Matchers<T = any> extends ShokiExpectMatchers {
    _shokiMatchersT?: T;
  }
  interface AsymmetricMatchersContaining extends ShokiAsymmetricMatchers {}
}

declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: match vitest's own Assertion<T = any>
  interface Assertion<T = any> extends ShokiExpectMatchers {
    _shokiAssertionT?: T;
  }
}

export {};
