import { describe, expect, it } from 'vitest';
import { toHaveAnnouncedText } from '../../src/matchers/matchers.js';
import { makeEvent, resetClock } from '../../src/matchers/fixtures.js';

describe('toHaveAnnouncedText', () => {
  it('matches substring (string pattern)', () => {
    resetClock();
    const log = [makeEvent({ phrase: 'Form submitted successfully' })];
    expect(toHaveAnnouncedText(log, 'Form submitted').pass).toBe(true);
    expect(toHaveAnnouncedText(log, 'Form cancelled').pass).toBe(false);
  });

  it('matches case-insensitive via RegExp', () => {
    const log = [makeEvent({ phrase: 'Form SUBMITTED' })];
    expect(toHaveAnnouncedText(log, /form submitted/i).pass).toBe(true);
  });

  it('failure message lists all actual phrases', () => {
    const log = [makeEvent({ phrase: 'first' }), makeEvent({ phrase: 'second' })];
    const r = toHaveAnnouncedText(log, 'nope');
    expect(r.pass).toBe(false);
    expect(r.message()).toContain('first');
    expect(r.message()).toContain('second');
  });

  it('guards non-array input', () => {
    const r = toHaveAnnouncedText(null, 'x');
    expect(r.pass).toBe(false);
  });
});
