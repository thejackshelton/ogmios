import type { ShokiEvent } from '../index.js';
import type { AnnouncementShape, ToHaveStableLogOptions } from './types.js';

interface MatcherResult {
  pass: boolean;
  message: () => string;
  actual?: unknown;
  expected?: unknown;
}

/**
 * Minimal shape of the log events the matchers consume.
 *
 * Matchers are intentionally lenient — they operate on any iterable of
 * objects with the subset of ShokiEvent fields we actually assert on
 * (`role`, `name`, `source`, `phrase`, `flags`). This lets the same matchers
 * work against both `ShokiEvent[]` (Node-side, bigint timestamps) and
 * `WireShokiEvent[]` (browser-side RPC payloads with numeric timestamps).
 */
interface MatchableEvent {
  source?: ShokiEvent['source'];
  flags?: number;
  phrase?: string;
  role?: string;
  name?: string;
}

function isShokiEventArray(x: unknown): x is MatchableEvent[] {
  return Array.isArray(x);
}

function fieldMatches(
  expected: string | RegExp | undefined,
  actual: string | undefined,
): boolean {
  if (expected === undefined) return true;
  const a = actual ?? '';
  if (expected instanceof RegExp) return expected.test(a);
  return a === expected;
}

function serializeShape(shape: AnnouncementShape): string {
  const parts: string[] = [];
  if (shape.role !== undefined) {
    parts.push(
      `role=${shape.role instanceof RegExp ? shape.role.toString() : JSON.stringify(shape.role)}`,
    );
  }
  if (shape.name !== undefined) {
    parts.push(
      `name=${shape.name instanceof RegExp ? shape.name.toString() : JSON.stringify(shape.name)}`,
    );
  }
  if (shape.source !== undefined) parts.push(`source=${JSON.stringify(shape.source)}`);
  if (shape.interrupt !== undefined) parts.push(`interrupt=${shape.interrupt}`);
  return `{ ${parts.join(', ')} }`;
}

function serializeLog(log: MatchableEvent[], max = 10): string {
  const head = log.slice(0, max).map((e) => ({
    source: e.source,
    role: e.role,
    name: e.name,
    phrase: e.phrase,
    interrupt: ((e.flags ?? 0) & 1) === 1,
  }));
  const tail = log.length > max ? `, ...and ${log.length - max} more` : '';
  return `${JSON.stringify(head, null, 2)}${tail}`;
}

export function toHaveAnnounced(received: unknown, shape: AnnouncementShape): MatcherResult {
  if (!isShokiEventArray(received)) {
    return {
      pass: false,
      message: () =>
        'Expected received to be a ShokiEvent[] array (from voiceOver.drain() or the browser-side session.drain()).',
      actual: received,
      expected: shape,
    };
  }
  const log = received;
  const found = log.some((e) => {
    if (!fieldMatches(shape.role, e.role)) return false;
    if (!fieldMatches(shape.name, e.name)) return false;
    if (shape.source !== undefined && e.source !== shape.source) return false;
    if (shape.interrupt !== undefined) {
      const actualInterrupt = ((e.flags ?? 0) & 1) === 1;
      if (actualInterrupt !== shape.interrupt) return false;
    }
    return true;
  });
  return {
    pass: found,
    actual: log,
    expected: shape,
    message: () =>
      found
        ? `Expected log NOT to contain an announcement matching ${serializeShape(shape)}, but found one.\n\nActual log:\n${serializeLog(log)}`
        : `Expected log to contain an announcement matching ${serializeShape(shape)}.\n\nActual log:\n${serializeLog(log)}`,
  };
}

export function toHaveAnnouncedText(
  received: unknown,
  pattern: string | RegExp,
): MatcherResult {
  if (!isShokiEventArray(received)) {
    return {
      pass: false,
      message: () => 'Expected received to be a ShokiEvent[] array.',
      actual: received,
      expected: pattern,
    };
  }
  const log = received;
  const found = log.some((e) => {
    const phrase = e.phrase ?? '';
    return pattern instanceof RegExp ? pattern.test(phrase) : phrase.includes(pattern);
  });
  return {
    pass: found,
    actual: log,
    expected: pattern,
    message: () =>
      found
        ? `Expected log NOT to contain an announcement matching text ${pattern instanceof RegExp ? pattern : JSON.stringify(pattern)}, but found one.\n\nActual phrases:\n${log.map((e) => `  - ${JSON.stringify(e.phrase ?? '')}`).join('\n')}`
        : `Expected log to contain an announcement matching text ${pattern instanceof RegExp ? pattern : JSON.stringify(pattern)}.\n\nActual phrases:\n${log.map((e) => `  - ${JSON.stringify(e.phrase ?? '')}`).join('\n')}`,
  };
}

export function toHaveNoAnnouncement(received: unknown): MatcherResult {
  if (!isShokiEventArray(received)) {
    return {
      pass: false,
      message: () => 'Expected received to be a ShokiEvent[] array.',
      actual: received,
    };
  }
  const log = received;
  return {
    pass: log.length === 0,
    actual: log,
    expected: [],
    message: () =>
      log.length === 0
        ? `Expected log to contain at least one announcement.`
        : `Expected log to be empty, but it has ${log.length} entries:\n${serializeLog(log)}`,
  };
}

export async function toHaveStableLog(
  received: unknown,
  opts: ToHaveStableLogOptions,
): Promise<MatcherResult> {
  if (!isShokiEventArray(received)) {
    return {
      pass: false,
      message: () => 'Expected received to be a ShokiEvent[] array.',
      actual: received,
      expected: opts,
    };
  }
  const log = received;
  const initialLen = log.length;
  await new Promise<void>((r) => setTimeout(r, opts.quietMs));
  const finalLen = log.length;
  const pass = initialLen === finalLen;
  return {
    pass,
    actual: { initialLen, finalLen },
    expected: { quietMs: opts.quietMs, sameLen: initialLen },
    message: () =>
      pass
        ? `Expected log to be UNSTABLE over ${opts.quietMs}ms, but length stayed at ${initialLen}.`
        : `Expected log to be stable over ${opts.quietMs}ms, but length grew from ${initialLen} to ${finalLen}.`,
  };
}
