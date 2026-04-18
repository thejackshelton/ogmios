import type { MunadiEvent } from '../index.js';

let clock = 0n;

export function resetClock(): void {
  clock = 0n;
}

export function nextTs(): bigint {
  clock += 1_000_000n;
  return clock;
}

export function makeEvent(partial: Partial<MunadiEvent>): MunadiEvent {
  return {
    tsNanos: partial.tsNanos ?? nextTs(),
    source: partial.source ?? 'applescript',
    flags: partial.flags ?? 0,
    phrase: partial.phrase ?? '',
    role: partial.role,
    name: partial.name,
  };
}
