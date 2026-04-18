import { describe, expect, it } from 'vitest';
import { munadiVitest } from '../../src/vitest/plugin.js';

describe('munadiVitest plugin', () => {
  it('has the expected name and config hook', () => {
    const p = munadiVitest();
    expect(p.name).toBe('munadi/vitest');
    expect(typeof p.config).toBe('function');
  });
});
