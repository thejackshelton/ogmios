import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Plugin } from 'vitest/config';
import { createCommands } from './commands/index.js';
import { SessionStore } from './session-store.js';

export interface ShokiVitestPluginOptions {
  /** Auto-set poolOptions.threads.singleThread=true when VO imports are detected. Default true. */
  autoSingleThread?: boolean;
  /** Scan test files for shoki/vitest/browser imports during the config hook. Default true. */
  detectVoiceOverImports?: boolean;
}

const IMPORT_NEEDLE = 'shoki/vitest/browser';
const TEST_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs']);

/**
 * Walk a project tree looking for any JS/TS file that imports
 * `shoki/vitest/browser`. Skips node_modules, .git, dist, and dotfiles.
 * Bounded by test-file count; safe against read errors.
 */
export async function detectVoiceOverImports(rootDir: string): Promise<boolean> {
  async function walk(dir: string): Promise<boolean> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const e of entries) {
      if (
        e.name === 'node_modules' ||
        e.name === '.git' ||
        e.name === 'dist' ||
        e.name.startsWith('.')
      ) {
        continue;
      }
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (await walk(full)) return true;
        continue;
      }
      const idx = e.name.lastIndexOf('.');
      const ext = idx < 0 ? '' : e.name.slice(idx);
      if (!TEST_EXTS.has(ext)) continue;
      try {
        const src = await readFile(full, 'utf8');
        if (src.includes(IMPORT_NEEDLE)) return true;
      } catch {
        // ignore read errors
      }
    }
    return false;
  }
  return walk(resolve(rootDir));
}

export function shokiVitest(opts: ShokiVitestPluginOptions = {}): Plugin {
  const options = {
    autoSingleThread: opts.autoSingleThread ?? true,
    detectVoiceOverImports: opts.detectVoiceOverImports ?? true,
  };

  const sessionStore = new SessionStore();

  return {
    name: 'shoki/vitest',
    config: async (cfg) => {
      const commands = createCommands({ sessionStore });

      // Ensure nested shape exists.
      // biome-ignore lint/suspicious/noExplicitAny: Vitest config shape is internally mutable
      const c = cfg as any;
      c.test ??= {};
      c.test.browser ??= {};
      c.test.browser.commands ??= {};
      Object.assign(c.test.browser.commands, commands);

      if (options.autoSingleThread && options.detectVoiceOverImports) {
        const root = c.root ?? process.cwd();
        const found = await detectVoiceOverImports(root);
        if (found) {
          c.test.poolOptions ??= {};
          c.test.poolOptions.threads ??= {};
          const existing = c.test.poolOptions.threads.singleThread;
          if (existing === false) {
            console.warn(
              "[shoki/vitest] Detected `import ... from 'shoki/vitest/browser'` in test files, " +
                'but poolOptions.threads.singleThread is explicitly `false`. VoiceOver is a system singleton; ' +
                'cross-test interference is likely. Remove the override or set `shokiVitest({ autoSingleThread: false })`.',
            );
          } else if (existing === undefined) {
            c.test.poolOptions.threads.singleThread = true;
          }
        }
      }
      return cfg;
    },
  };
}
