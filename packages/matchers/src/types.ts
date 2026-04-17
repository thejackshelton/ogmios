import type { ShokiEventSource } from '@shoki/sdk';

export interface AnnouncementShape {
  role?: string | RegExp;
  name?: string | RegExp;
  source?: ShokiEventSource;
  interrupt?: boolean;
}

export interface ToHaveStableLogOptions {
  quietMs: number;
}

// The default type parameter for Vitest's `Assertion` is `any`, not `unknown`.
// Augmentation must keep the same default so the declarations merge cleanly.
// biome-ignore lint/suspicious/noExplicitAny: mirrors vitest's own Assertion<T = any> default
declare module 'vitest' {
  // biome-ignore lint/suspicious/noExplicitAny: match vitest's own Assertion<T = any>
  interface Assertion<T = any> {
    toHaveAnnounced(shape: AnnouncementShape): void;
    toHaveAnnouncedText(pattern: string | RegExp): void;
    toHaveNoAnnouncement(): void;
    toHaveStableLog(opts: ToHaveStableLogOptions): Promise<void>;
  }
  interface AsymmetricMatchersContaining {
    toHaveAnnounced(shape: AnnouncementShape): unknown;
    toHaveAnnouncedText(pattern: string | RegExp): unknown;
    toHaveNoAnnouncement(): unknown;
    toHaveStableLog(opts: ToHaveStableLogOptions): unknown;
  }
}
