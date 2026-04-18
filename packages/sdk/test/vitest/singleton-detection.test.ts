import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { detectVoiceOverImports, munadiVitest } from '../../src/vitest/plugin.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = resolve(__dirname, './fixtures');

// biome-ignore lint/suspicious/noExplicitAny: test-only casts around vitest plugin config mutation
type AnyConfig = any;

describe('detectVoiceOverImports', () => {
  it('returns true when a test file imports munadi/vitest/browser', async () => {
    expect(await detectVoiceOverImports(resolve(FIXTURES, 'has-import'))).toBe(true);
  });

  it('returns false when no test file imports munadi/vitest/browser', async () => {
    expect(await detectVoiceOverImports(resolve(FIXTURES, 'no-import'))).toBe(false);
  });
});

describe('munadiVitest plugin config hook', () => {
  it('sets poolOptions.threads.singleThread = true when detected', async () => {
    const p = munadiVitest({ autoSingleThread: true });
    const cfg: AnyConfig = { root: resolve(FIXTURES, 'has-import') };
    await (p.config as AnyConfig)(cfg);
    expect(cfg.test.poolOptions.threads.singleThread).toBe(true);
  });

  it('does not touch singleThread when no import found', async () => {
    const p = munadiVitest({ autoSingleThread: true });
    const cfg: AnyConfig = { root: resolve(FIXTURES, 'no-import') };
    await (p.config as AnyConfig)(cfg);
    expect(cfg.test.poolOptions?.threads?.singleThread).toBeUndefined();
  });

  it('warns but does not overwrite when user set singleThread=false', async () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = munadiVitest({ autoSingleThread: true });
    const cfg: AnyConfig = {
      root: resolve(FIXTURES, 'opt-out'),
      test: { poolOptions: { threads: { singleThread: false } } },
    };
    await (p.config as AnyConfig)(cfg);
    expect(cfg.test.poolOptions.threads.singleThread).toBe(false);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.[0]).toContain('[munadi/vitest]');
    spy.mockRestore();
  });

  it('skips detection when autoSingleThread=false', async () => {
    const p = munadiVitest({ autoSingleThread: false });
    const cfg: AnyConfig = { root: resolve(FIXTURES, 'has-import') };
    await (p.config as AnyConfig)(cfg);
    expect(cfg.test.poolOptions?.threads?.singleThread).toBeUndefined();
  });

  it('registers all 10 BrowserCommands regardless of detection', async () => {
    const p = munadiVitest({ autoSingleThread: false });
    const cfg: AnyConfig = {};
    await (p.config as AnyConfig)(cfg);
    const names = Object.keys(cfg.test.browser.commands).sort();
    expect(names).toEqual([
      'munadiAwaitStable',
      'munadiClear',
      'munadiDrain',
      'munadiGetDroppedCount',
      'munadiLastPhrase',
      'munadiListen',
      'munadiPhraseLog',
      'munadiReset',
      'munadiStart',
      'munadiStop',
    ]);
  });
});
