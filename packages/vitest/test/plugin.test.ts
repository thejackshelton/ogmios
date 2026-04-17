import { describe, expect, it } from 'vitest';
import { shokiVitest } from '../src/plugin.js';

describe('shokiVitest plugin', () => {
  it('has the expected name and config hook', () => {
    const p = shokiVitest();
    expect(p.name).toBe('@shoki/vitest');
    expect(typeof p.config).toBe('function');
  });
});
