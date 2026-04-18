/**
 * Frozen command contracts for ogmios/vitest BrowserCommands.
 *
 * Every return payload must be structured-clone-safe (VITEST-06):
 * - no bigint
 * - no Date / Map / Set / Function / Symbol
 * - no class instances (plain objects only)
 * - undefined fields are serialized via structuredClone but we prefer `null`
 *   when a missing value crosses the wire (lastPhrase is the prime example).
 */
export interface OgmiosStartArgs {
  speechRate?: number;
  mute?: boolean;
  takeOverExisting?: boolean;
  timeoutMs?: number;
  logBufferSize?: number;
}

export interface OgmiosStartResult {
  sessionId: string;
}

export interface OgmiosSessionRef {
  sessionId: string;
}

/**
 * Wire form of a OgmiosEvent. `tsMs` is the floor-to-ms integer of the
 * original bigint `tsNanos` — see SessionStore.toWireEvent.
 */
export interface WireOgmiosEvent {
  tsMs: number;
  source: 'applescript' | 'ax' | 'caption' | 'commander' | 'noop';
  flags: number;
  phrase: string;
  role?: string;
  name?: string;
}

export interface OgmiosListenArgs extends OgmiosSessionRef {
  sinceMs?: number;
}
export type OgmiosListenResult = WireOgmiosEvent[];

export type OgmiosDrainArgs = OgmiosSessionRef;
export type OgmiosDrainResult = WireOgmiosEvent[];

export type OgmiosPhraseLogArgs = OgmiosSessionRef;
export type OgmiosPhraseLogResult = string[];

export type OgmiosLastPhraseArgs = OgmiosSessionRef;
export type OgmiosLastPhraseResult = string | null;

export type OgmiosClearArgs = OgmiosSessionRef;
export interface OgmiosClearResult {
  ok: true;
}

export type OgmiosResetArgs = OgmiosSessionRef;
export interface OgmiosResetResult {
  ok: true;
}

export type OgmiosStopArgs = OgmiosSessionRef;
export interface OgmiosStopResult {
  stopped: boolean;
  remainingRefs: number;
}

export interface OgmiosAwaitStableArgs extends OgmiosSessionRef {
  quietMs: number;
  timeoutMs?: number;
}
export type OgmiosAwaitStableResult = WireOgmiosEvent[];

export type OgmiosGetDroppedCountArgs = OgmiosSessionRef;
export interface OgmiosGetDroppedCountResult {
  droppedCount: number;
}
