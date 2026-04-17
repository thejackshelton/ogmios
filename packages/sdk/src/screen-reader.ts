/**
 * TS mirror of zig/src/core/driver.zig ShokiDriver vtable (CONTEXT.md D-11).
 * Every concrete screen reader (voiceOver, nvda, orca, ...) is a factory
 * returning this interface. DO NOT extend without bumping the wire format
 * and updating every driver — EXT-01 depends on stability.
 */
export type ShokiEventSource = 'applescript' | 'ax' | 'caption' | 'commander' | 'noop';

export interface ShokiEvent {
  /** Nanoseconds since epoch; bigint to preserve precision across JS number boundary. */
  tsNanos: bigint;
  source: ShokiEventSource;
  /** Driver-defined bit flags. Current drivers: 0 = none, 1 = interrupted prior. */
  flags: number;
  phrase: string;
  role?: string;
  name?: string;
}

export interface ScreenReaderHandle {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  drain(): Promise<ShokiEvent[]>;
  reset(): Promise<void>;
  /** Async iterator yielding events as they're drained. Phase 1 polls drain at a fixed 50ms cadence. */
  listen(): AsyncIterable<ShokiEvent>;
  /** Guidepup-compat: flat string array of phrases captured so far. */
  phraseLog(): Promise<string[]>;
  lastPhrase(): Promise<string | undefined>;
  /** Clear the internal event buffer without stopping the driver. */
  clear(): Promise<void>;
  droppedCount(): Promise<bigint>;
  /** Release all driver resources. After this call, the handle is unusable. */
  deinit(): Promise<void>;
}
