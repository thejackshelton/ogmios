/**
 * Unit tests for the legacy state-dir notice — Phase 12 Plan 06.
 *
 * Covers CONTEXT.md D-05 (clean-break, no auto-migrate):
 *   - If any of `~/.shoki/`, `~/.dicta/`, `~/.munadi/` exist, `warnOnLegacyStateDir`
 *     emits a single multi-line notice to stderr naming each detected dir and
 *     providing a one-shot `rm -rf` command.
 *   - If none exist, nothing is emitted and `noticeEmitted` is false.
 *   - Multiple dirs are all listed in a single notice (not one per dir).
 *
 * The helper accepts injectable `homedir` / `exists` / `stderr` so tests do
 * not touch the host filesystem.
 */
import { describe, expect, it } from 'vitest';

import { warnOnLegacyStateDir } from '../../src/cli/legacy-state.js';

function makeStderr(): { write: (chunk: string) => void; output: string[] } {
  const output: string[] = [];
  return {
    write(chunk: string) {
      output.push(chunk);
    },
    output,
  };
}

describe('warnOnLegacyStateDir', () => {
  const HOME = '/home/test';

  it('emits notice naming ~/.shoki and a correct rm -rf when only ~/.shoki exists', () => {
    const stderr = makeStderr();
    const result = warnOnLegacyStateDir({
      homedir: HOME,
      exists: (p) => p === `${HOME}/.shoki`,
      stderr,
    });

    expect(result.found).toEqual(['~/.shoki']);
    expect(result.noticeEmitted).toBe(true);
    expect(stderr.output).toHaveLength(1);
    const message = stderr.output[0];
    expect(message).toContain('[ogmios]');
    expect(message).toContain('~/.shoki');
    expect(message).toContain('rm -rf ~/.shoki');
    expect(message).not.toContain('~/.dicta');
    expect(message).not.toContain('~/.munadi');
  });

  it('emits notice naming ~/.dicta when only ~/.dicta exists', () => {
    const stderr = makeStderr();
    const result = warnOnLegacyStateDir({
      homedir: HOME,
      exists: (p) => p === `${HOME}/.dicta`,
      stderr,
    });

    expect(result.found).toEqual(['~/.dicta']);
    expect(result.noticeEmitted).toBe(true);
    expect(stderr.output[0]).toContain('rm -rf ~/.dicta');
  });

  it('emits notice naming ~/.munadi when only ~/.munadi exists', () => {
    const stderr = makeStderr();
    const result = warnOnLegacyStateDir({
      homedir: HOME,
      exists: (p) => p === `${HOME}/.munadi`,
      stderr,
    });

    expect(result.found).toEqual(['~/.munadi']);
    expect(result.noticeEmitted).toBe(true);
    expect(stderr.output[0]).toContain('rm -rf ~/.munadi');
  });

  it('emits a single notice listing all three when all legacy dirs exist', () => {
    const stderr = makeStderr();
    const result = warnOnLegacyStateDir({
      homedir: HOME,
      exists: () => true,
      stderr,
    });

    expect(result.found).toEqual(['~/.shoki', '~/.dicta', '~/.munadi']);
    expect(result.noticeEmitted).toBe(true);
    // Single write, not one per dir.
    expect(stderr.output).toHaveLength(1);
    const message = stderr.output[0];
    expect(message).toContain('~/.shoki');
    expect(message).toContain('~/.dicta');
    expect(message).toContain('~/.munadi');
    // Combined rm -rf command contains all three paths.
    expect(message).toMatch(/rm -rf ~\/\.shoki ~\/\.dicta ~\/\.munadi/);
  });

  it('emits nothing when none of the legacy dirs exist', () => {
    const stderr = makeStderr();
    const result = warnOnLegacyStateDir({
      homedir: HOME,
      exists: () => false,
      stderr,
    });

    expect(result.found).toEqual([]);
    expect(result.noticeEmitted).toBe(false);
    expect(stderr.output).toHaveLength(0);
  });

  it('does NOT flag the current ~/.ogmios state dir', () => {
    // If only ~/.ogmios exists (the current state dir), the helper must
    // remain silent — we only surface legacy names here.
    const stderr = makeStderr();
    const result = warnOnLegacyStateDir({
      homedir: HOME,
      exists: (p) => p === `${HOME}/.ogmios`,
      stderr,
    });

    expect(result.found).toEqual([]);
    expect(result.noticeEmitted).toBe(false);
    expect(stderr.output).toHaveLength(0);
  });

  it('preserves encounter order (shoki → dicta → munadi) in the notice', () => {
    const stderr = makeStderr();
    warnOnLegacyStateDir({
      homedir: HOME,
      exists: (p) => p === `${HOME}/.dicta` || p === `${HOME}/.munadi`,
      stderr,
    });
    const message = stderr.output[0];
    // dicta must appear before munadi in the listing regardless of which
    // subset is present.
    expect(message.indexOf('~/.dicta')).toBeLessThan(message.indexOf('~/.munadi'));
  });
});
