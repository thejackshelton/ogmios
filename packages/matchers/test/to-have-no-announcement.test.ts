import { describe, expect, it } from 'vitest';
import { toHaveNoAnnouncement } from '../src/matchers.js';
import { makeEvent } from '../src/fixtures.js';

describe('toHaveNoAnnouncement', () => {
  it('passes on empty log', () => {
    expect(toHaveNoAnnouncement([]).pass).toBe(true);
  });

  it('fails on non-empty log and lists phrases', () => {
    const log = [makeEvent({ phrase: 'leaked notification' })];
    const r = toHaveNoAnnouncement(log);
    expect(r.pass).toBe(false);
    expect(r.message()).toContain('leaked notification');
    expect(r.message()).toContain('1 entries');
  });

  it('guards non-array input', () => {
    const r = toHaveNoAnnouncement('not an array');
    expect(r.pass).toBe(false);
  });
});
