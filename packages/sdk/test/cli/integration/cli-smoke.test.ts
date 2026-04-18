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

  it('--help includes "doctor", "setup", "info" subcommands', async () => {
    const { stdout, exitCode } = await execa('node', [CLI, '--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('setup');
    expect(stdout).toContain('info');
  });

  it('doctor --json emits parseable JSON and exits with a classified code (0..9)', async () => {
    const result = await execa('node', [CLI, 'doctor', '--json'], {
      reject: false,
    });
    // exitCode is 0 when ready, or 2..9 per CONTEXT.md D-06.
    expect([0, 2, 3, 4, 5, 6, 7, 8, 9]).toContain(result.exitCode);
    const report = JSON.parse(result.stdout);
    expect(report).toHaveProperty('ok');
    expect(report).toHaveProperty('exitCode');
    expect(report).toHaveProperty('checks');
    expect(Array.isArray(report.checks)).toBe(true);
  });

  it('doctor --quiet prints one line and exits with a classified code', async () => {
    const result = await execa('node', [CLI, 'doctor', '--quiet'], {
      reject: false,
    });
    expect([0, 2, 3, 4, 5, 6, 7, 8, 9]).toContain(result.exitCode);
    expect(result.stdout.split('\n').filter(Boolean)).toHaveLength(1);
    expect(result.stdout).toMatch(/^dicta-doctor/);
  });

  it('info prints context and exits 0', async () => {
    const { stdout, exitCode } = await execa('node', [CLI, 'info']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/dicta v/);
    expect(stdout).toMatch(/node /);
    expect(stdout).toMatch(/platform darwin/);
  });
});
