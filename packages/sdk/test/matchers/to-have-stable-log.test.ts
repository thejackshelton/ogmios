import { describe, expect, it } from 'vitest';
import { toHaveStableLog } from '../../src/matchers/matchers.js';
import { makeEvent } from '../../src/matchers/fixtures.js';

describe('toHaveStableLog', () => {
  it('passes when log length does not change during quietMs', async () => {
    const log = [makeEvent({ phrase: 'hello' })];
    const r = await toHaveStableLog(log, { quietMs: 30 });
    expect(r.pass).toBe(true);
  });

  it('fails when log grows during quietMs', async () => {
    const log = [makeEvent({ phrase: 'first' })];
    setTimeout(() => log.push(makeEvent({ phrase: 'second' })), 10);
    const r = await toHaveStableLog(log, { quietMs: 40 });
    expect(r.pass).toBe(false);
    expect(r.message()).toContain('1 to 2');
  });

  it('guards non-array input', async () => {
    const r = await toHaveStableLog(42, { quietMs: 10 });
    expect(r.pass).toBe(false);
  });
});
