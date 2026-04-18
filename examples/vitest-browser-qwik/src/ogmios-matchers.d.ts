// Local type augmentation for the Qwik example.
//
// The pre-built `ogmios/matchers` type augmentation in
// `dist/matchers/types.d.ts` targets `declare module 'vitest'` with
// `interface Assertion<T = any>` / `interface Matchers<T = any>`. In Vitest 4,
// those interfaces live in `@vitest/expect` (re-exported by `vitest`), and
// the augmentation shipped with `ogmios/matchers` — which was built
// against Vitest 3 — does not always merge cleanly into the Vitest-4 graph
// when both versions coexist in the monorepo (the main `ogmios` package stays
// on Vitest 3; this Qwik example needs Vitest 4 because
// vitest-browser-qwik@0.3+ peer-depends on `vitest ^4`).
//
// This file MUST be a module (contain at least one top-level `import` or
// `export`) so that `declare module 'vitest'` below MERGES with the real
// vitest types instead of REPLACING them. The empty `export {}` at the
// bottom is the idiomatic way to mark an ambient-augmentation file as a
// module under verbatimModuleSyntax.

interface OgmiosAnnouncementShape {
  role?: string | RegExp;
  name?: string | RegExp;
  source?: 'applescript' | 'ax';
  interrupt?: boolean;
}

interface OgmiosToHaveStableLogOptions {
  quietMs: number;
}

interface OgmiosExpectMatchers {
  toHaveAnnounced(shape: OgmiosAnnouncementShape): void;
  toHaveAnnouncedText(pattern: string | RegExp): void;
  toHaveNoAnnouncement(): void;
  toHaveStableLog(opts: OgmiosToHaveStableLogOptions): Promise<void>;
}

interface OgmiosAsymmetricMatchers {
  toHaveAnnounced(shape: OgmiosAnnouncementShape): unknown;
  toHaveAnnouncedText(pattern: string | RegExp): unknown;
  toHaveNoAnnouncement(): unknown;
  toHaveStableLog(opts: OgmiosToHaveStableLogOptions): unknown;
}

declare module '@vitest/expect' {
  // biome-ignore lint/suspicious/noExplicitAny: match @vitest/expect's own Matchers<T = any>
  interface Matchers<T = any> extends OgmiosExpectMatchers {
    _ogmiosMatchersT?: T;
  }
  interface AsymmetricMatchersContaining extends OgmiosAsymmetricMatchers {}
}

declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: match vitest's own Assertion<T = any>
  interface Assertion<T = any> extends OgmiosExpectMatchers {
    _ogmiosAssertionT?: T;
  }
}

export {};
