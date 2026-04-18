import { describe, expect, it } from 'vitest';
import { toHaveAnnounced } from '../../src/matchers/matchers.js';
import { makeEvent, resetClock } from '../../src/matchers/fixtures.js';

describe('toHaveAnnounced', () => {
  it('matches literal role + name', () => {
    resetClock();
    const log = [makeEvent({ role: 'button', name: 'Submit', phrase: 'Submit button' })];
    const r = toHaveAnnounced(log, { role: 'button', name: 'Submit' });
    expect(r.pass).toBe(true);
  });

  it('matches name via RegExp', () => {
    resetClock();
    const log = [makeEvent({ role: 'button', name: 'Submit form' })];
    expect(toHaveAnnounced(log, { role: 'button', name: /submit/i }).pass).toBe(true);
    expect(toHaveAnnounced(log, { role: 'button', name: /cancel/i }).pass).toBe(false);
  });

  it('filters by source', () => {
    const log = [makeEvent({ role: 'button', name: 'Submit', source: 'applescript' })];
    expect(toHaveAnnounced(log, { role: 'button', source: 'applescript' }).pass).toBe(true);
    expect(toHaveAnnounced(log, { role: 'button', source: 'ax' }).pass).toBe(false);
  });

  it('matches interrupt flag bit', () => {
    const log = [makeEvent({ role: 'status', flags: 1 })];
    expect(toHaveAnnounced(log, { role: 'status', interrupt: true }).pass).toBe(true);
    expect(toHaveAnnounced(log, { role: 'status', interrupt: false }).pass).toBe(false);
  });

  it('fails with a diff-friendly message listing actual log', () => {
    const log = [makeEvent({ role: 'button', name: 'Cancel', phrase: 'Cancel button' })];
    const r = toHaveAnnounced(log, { role: 'link', name: /go/i });
    expect(r.pass).toBe(false);
    const msg = r.message();
    expect(msg).toContain('Expected');
    expect(msg).toContain('role=');
    expect(msg).toContain('Cancel');
  });

  it('guards non-array input', () => {
    const r = toHaveAnnounced(undefined, { role: 'button' });
    expect(r.pass).toBe(false);
    expect(r.message()).toMatch(/MunadiEvent\[\] array/);
  });

  it('message on pass supports .not negation use', () => {
    const log = [makeEvent({ role: 'button', name: 'Submit' })];
    const r = toHaveAnnounced(log, { role: 'button' });
    expect(r.pass).toBe(true);
    expect(r.message()).toContain('NOT to contain');
  });

  it('handles empty log without throwing', () => {
    const r = toHaveAnnounced([], { role: 'button' });
    expect(r.pass).toBe(false);
  });

  it('truncates log at 10 entries and shows count', () => {
    const log = Array.from({ length: 15 }, (_, i) => makeEvent({ phrase: `p${i}` }));
    const r = toHaveAnnounced(log, { role: 'nonexistent' });
    expect(r.message()).toContain('...and 5 more');
  });
});
