import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// __dirname is packages/sdk/test/cli/integration — climb to packages/sdk and enter dist/cli/main.js.
const CLI = join(__dirname, '..', '..', '..', 'dist', 'cli', 'main.js');
const isDarwin = process.platform === 'darwin';

describe.skipIf(!isDarwin)('CLI integration (darwin, built dist)', () => {
  it('--version prints the package version and exits 0', async () => {
    const { stdout, exitCode } = await execa('node', [CLI, '--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('--help includes "setup", "info", "restore-vo-settings" subcommands', async () => {
    const { stdout, exitCode } = await execa('node', [CLI, '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('setup');
    expect(stdout).toContain('info');
    expect(stdout).toContain('restore-vo-settings');
    // `doctor` was removed in v0.1.7 — make sure it doesn't silently resurface.
    expect(stdout).not.toContain('doctor');
  });

  it('info prints context and exits 0', async () => {
    const { stdout, exitCode } = await execa('node', [CLI, 'info']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/ogmios v/);
    expect(stdout).toMatch(/node /);
    expect(stdout).toMatch(/platform darwin/);
  });
});
