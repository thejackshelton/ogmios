import { describe, expect, it } from 'vitest';
import { ogmiosVitest } from '../../src/vitest/plugin.js';

describe('ogmiosVitest plugin', () => {
  it('has the expected name and config hook', () => {
    const p = ogmiosVitest();
    expect(p.name).toBe('ogmios/vitest');
    expect(typeof p.config).toBe('function');
  });
});
