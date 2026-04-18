import type { OgmiosEventSource } from '../index.js';

// Anchor `vitest` into the compilation graph so the `declare module 'vitest'`
// augmentation below resolves under TS NodeNext + composite builds. Without
// this, TS emits TS2664 even though the module is installed — TS needs at
// least one concrete reference to open the augmentation target.
// biome-ignore lint/correctness/noUnusedImports: anchor for `declare module 'vitest'`
import type {} from 'vitest';

export interface AnnouncementShape {
  role?: string | RegExp;
  name?: string | RegExp;
  source?: OgmiosEventSource;
  interrupt?: boolean;
}

export interface ToHaveStableLogOptions {
  quietMs: number;
}

// The default type parameter for Vitest's `Assertion` is `any`, not `unknown`.
// Augmentation must keep the same default so the declarations merge cleanly.
//
// Vitest re-exports `Assertion` from `@vitest/expect`, so augmenting both module
// specifiers keeps both `import { type Assertion } from 'vitest'` and the direct
// `'@vitest/expect'` view working for consumers.

// Vitest's public `Assertion<T>` extends `Matchers<T>`. Augmenting `Matchers<T>`
// (instead of `Assertion<T>`) propagates through both the direct `vitest`
// re-export and the underlying `@vitest/expect` surface without needing a
// second `declare module` block.

interface OgmiosExpectMatchers {
  toHaveAnnounced(shape: AnnouncementShape): void;
  toHaveAnnouncedText(pattern: string | RegExp): void;
  toHaveNoAnnouncement(): void;
  toHaveStableLog(opts: ToHaveStableLogOptions): Promise<void>;
}

interface OgmiosAsymmetricMatchers {
  toHaveAnnounced(shape: AnnouncementShape): unknown;
  toHaveAnnouncedText(pattern: string | RegExp): unknown;
  toHaveNoAnnouncement(): unknown;
  toHaveStableLog(opts: ToHaveStableLogOptions): unknown;
}

declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: match vitest's own Assertion<T = any>
  interface Assertion<T = any> extends OgmiosExpectMatchers {
    _ogmiosAssertionT?: T;
  }
  // biome-ignore lint/suspicious/noExplicitAny: match @vitest/expect's own Matchers<T = any>
  interface Matchers<T = any> extends OgmiosExpectMatchers {
    _ogmiosMatchersT?: T;
  }
  interface AsymmetricMatchersContaining extends OgmiosAsymmetricMatchers {}
}
