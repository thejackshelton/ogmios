/**
 * Frozen command contracts for munadi/vitest BrowserCommands.
 *
 * Every return payload must be structured-clone-safe (VITEST-06):
 * - no bigint
 * - no Date / Map / Set / Function / Symbol
 * - no class instances (plain objects only)
 * - undefined fields are serialized via structuredClone but we prefer `null`
 *   when a missing value crosses the wire (lastPhrase is the prime example).
 */
export interface MunadiStartArgs {
  speechRate?: number;
  mute?: boolean;
  takeOverExisting?: boolean;
  timeoutMs?: number;
  logBufferSize?: number;
}

export interface MunadiStartResult {
  sessionId: string;
}

export interface MunadiSessionRef {
  sessionId: string;
}

/**
 * Wire form of a MunadiEvent. `tsMs` is the floor-to-ms integer of the
 * original bigint `tsNanos` — see SessionStore.toWireEvent.
 */
export interface WireMunadiEvent {
  tsMs: number;
  source: 'applescript' | 'ax' | 'caption' | 'commander' | 'noop';
  flags: number;
  phrase: string;
  role?: string;
  name?: string;
}

export interface MunadiListenArgs extends MunadiSessionRef {
  sinceMs?: number;
}
export type MunadiListenResult = WireMunadiEvent[];

export type MunadiDrainArgs = MunadiSessionRef;
export type MunadiDrainResult = WireMunadiEvent[];

export type MunadiPhraseLogArgs = MunadiSessionRef;
export type MunadiPhraseLogResult = string[];

export type MunadiLastPhraseArgs = MunadiSessionRef;
export type MunadiLastPhraseResult = string | null;

export type MunadiClearArgs = MunadiSessionRef;
export interface MunadiClearResult {
  ok: true;
}

export type MunadiResetArgs = MunadiSessionRef;
export interface MunadiResetResult {
  ok: true;
}

export type MunadiStopArgs = MunadiSessionRef;
export interface MunadiStopResult {
  stopped: boolean;
  remainingRefs: number;
}

export interface MunadiAwaitStableArgs extends MunadiSessionRef {
  quietMs: number;
  timeoutMs?: number;
}
export type MunadiAwaitStableResult = WireMunadiEvent[];

export type MunadiGetDroppedCountArgs = MunadiSessionRef;
export interface MunadiGetDroppedCountResult {
  droppedCount: number;
}
