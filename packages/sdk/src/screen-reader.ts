/**
 * TS mirror of zig/src/core/driver.zig OgmiosDriver vtable (CONTEXT.md D-11).
 * Every concrete screen reader (voiceOver, nvda, orca, ...) is a factory
 * returning this interface. DO NOT extend without bumping the wire format
 * and updating every driver — EXT-01 depends on stability.
 */
export type OgmiosEventSource = 'applescript' | 'ax' | 'caption' | 'commander' | 'noop';

export interface OgmiosEvent {
  /** Nanoseconds since epoch; bigint to preserve precision across JS number boundary. */
  tsNanos: bigint;
  source: OgmiosEventSource;
  /** Driver-defined bit flags. Current drivers: 0 = none, 1 = interrupted prior. */
  flags: number;
  phrase: string;
  role?: string;
  name?: string;
}

/** Options for {@link ScreenReaderHandle.awaitStableLog}. */
export interface AwaitStableLogOptions {
  /** Milliseconds of silence (no new events) before the promise resolves. */
  quietMs: number;
  /** Optional AbortSignal to reject the promise early with AbortError. */
  signal?: AbortSignal;
}

export interface ScreenReaderHandle {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /**
   * Alias for {@link ScreenReaderHandle.stop}. Preferred in v1+ for symmetry
   * with {@link ScreenReaderHandle.start}; both names call the same underlying
   * implementation and remain available indefinitely for back-compat.
   */
  end(): Promise<void>;
  drain(): Promise<OgmiosEvent[]>;
  reset(): Promise<void>;
  /** Async iterator yielding events as they're drained. Phase 1 polls drain at a fixed 50ms cadence. */
  listen(): AsyncIterable<OgmiosEvent>;
  /** Guidepup-compat: flat string array of phrases captured so far. */
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | undefined>;
  /** Clear the internal event buffer without stopping the driver. */
  clear(): Promise<void>;
  droppedCount(): Promise<bigint>;
  /**
   * Resolve when `quietMs` milliseconds have elapsed without any new event
   * arriving in the log; resolves with a snapshot of the log at that moment.
   * Used between test steps to wait for VoiceOver to finish announcing.
   */
  awaitStableLog(opts: AwaitStableLogOptions): Promise<OgmiosEvent[]>;
  /** Release all driver resources. After this call, the handle is unusable. */
  deinit(): Promise<void>;
}
