/**
 * Frozen command contracts for shoki/vitest BrowserCommands.
 *
 * Every return payload must be structured-clone-safe (VITEST-06):
 * - no bigint
 * - no Date / Map / Set / Function / Symbol
 * - no class instances (plain objects only)
 * - undefined fields are serialized via structuredClone but we prefer `null`
 *   when a missing value crosses the wire (lastPhrase is the prime example).
 */
export interface ShokiStartArgs {
  speechRate?: number;
  mute?: boolean;
  takeOverExisting?: boolean;
  timeoutMs?: number;
  logBufferSize?: number;
}

export interface ShokiStartResult {
  sessionId: string;
}

export interface ShokiSessionRef {
  sessionId: string;
}

/**
 * Wire form of a ShokiEvent. `tsMs` is the floor-to-ms integer of the
 * original bigint `tsNanos` — see SessionStore.toWireEvent.
 */
export interface WireShokiEvent {
  tsMs: number;
  source: 'applescript' | 'ax' | 'caption' | 'commander' | 'noop';
  flags: number;
  phrase: string;
  role?: string;
  name?: string;
}

export interface ShokiListenArgs extends ShokiSessionRef {
  sinceMs?: number;
}
export type ShokiListenResult = WireShokiEvent[];

export type ShokiDrainArgs = ShokiSessionRef;
export type ShokiDrainResult = WireShokiEvent[];

export type ShokiPhraseLogArgs = ShokiSessionRef;
export type ShokiPhraseLogResult = string[];

export type ShokiLastPhraseArgs = ShokiSessionRef;
export type ShokiLastPhraseResult = string | null;

export type ShokiClearArgs = ShokiSessionRef;
export interface ShokiClearResult {
  ok: true;
}

export type ShokiResetArgs = ShokiSessionRef;
export interface ShokiResetResult {
  ok: true;
}

export type ShokiStopArgs = ShokiSessionRef;
export interface ShokiStopResult {
  stopped: boolean;
  remainingRefs: number;
}

export interface ShokiAwaitStableArgs extends ShokiSessionRef {
  quietMs: number;
  timeoutMs?: number;
}
export type ShokiAwaitStableResult = WireShokiEvent[];

export type ShokiGetDroppedCountArgs = ShokiSessionRef;
export interface ShokiGetDroppedCountResult {
  droppedCount: number;
}
