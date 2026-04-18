import { mkdir, mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSetup, type SetupOptions } from '../../src/cli/setup-command.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'setup');
const GOOD_ZIP = join(FIXTURE_DIR, 'shoki-darwin-arm64.zip');
const SHA_FILE = join(FIXTURE_DIR, 'shoki-darwin-arm64.zip.sha256');
const INFO_PLIST_FIXTURE = join(FIXTURE_DIR, 'Info.plist');

/**
 * Build a fetch that serves the release URLs the orchestrator asks for,
 * regardless of baseUrl — we only care that the download path is exercised.
 */
async function mkReleaseFetch(): Promise<typeof globalThis.fetch> {
  const zipBytes = await readFile(GOOD_ZIP);
  const shaText = await readFile(SHA_FILE, 'utf8');
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    if (url.endsWith('.sha256')) {
      return new Response(shaText, { status: 200 });
    }
    if (url.endsWith('.zip')) {
      return new Response(new Uint8Array(zipBytes), { status: 200 });
    }
    return new Response('', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
}

function mkExec() {
  return vi.fn(
    async (_file: string, _args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  );
}

/** Pre-seed both app bundles with the given version at `installDir`. */
async function seedInstalledApps(installDir: string, version = '0.1.0') {
  const plist = (await readFile(INFO_PLIST_FIXTURE, 'utf8')).replace(
    /<string>0\.1\.0<\/string>/g,
    `<string>${version}</string>`,
  );
  for (const name of ['Shoki.app', 'Shoki Setup.app']) {
    await mkdir(join(installDir, name, 'Contents'), { recursive: true });
    await writeFile(join(installDir, name, 'Contents', 'Info.plist'), plist, 'utf8');
  }
}

describe('runSetup', () => {
  let installDir: string;

  beforeEach(async () => {
    installDir = await mkdtemp(join(tmpdir(), 'shoki-setup-cmd-'));
  });

  afterEach(async () => {
    await rm(installDir, { recursive: true, force: true });
  });

  it('both apps installed at compatibleAppVersion → launched-only, exit 0', async () => {
    await seedInstalledApps(installDir, '0.1.0');
    const exec = mkExec();
    const result = await runSetup({
      installDir,
      fetch: await mkReleaseFetch(),
      exec,
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    expect(result.action).toBe('launched-only');
    expect(result.launched).toBe(true);
    expect(result.exitCode).toBe(0);
    // The only exec should be the `open -W` launch.
    expect(exec).toHaveBeenCalledWith('/usr/bin/open', [
      '-W',
      join(installDir, 'Shoki Setup.app'),
    ]);
  });

  it('both apps installed at older version → reinstalled', async () => {
    await seedInstalledApps(installDir, '0.0.9');
    const result = await runSetup({
      installDir,
      fetch: await mkReleaseFetch(),
      exec: mkExec(),
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    expect(result.action).toBe('reinstalled');
    expect(result.exitCode).toBe(0);
    expect(result.downloadedFromUrl).toContain('app-v0.1.0');
  });

  it('apps missing → downloaded', async () => {
    const result = await runSetup({
      installDir,
      fetch: await mkReleaseFetch(),
      exec: mkExec(),
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    expect(result.action).toBe('downloaded');
    expect(result.exitCode).toBe(0);
    expect(result.shaVerified).toBe(true);
    expect(result.launched).toBe(true);
  });

  it('--force redownloads even when apps are already installed + fresh', async () => {
    await seedInstalledApps(installDir, '0.1.0');
    const result = await runSetup({
      installDir,
      force: true,
      fetch: await mkReleaseFetch(),
      exec: mkExec(),
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    expect(result.action).toBe('reinstalled');
  });

  it('--no-download with missing apps rejects (non-zero exit)', async () => {
    const result = await runSetup({
      installDir,
      noDownload: true,
      fetch: await mkReleaseFetch(),
      exec: mkExec(),
      compatibleAppVersion: '0.1.0',
    } as SetupOptions).catch((err) => err);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/no-download|not present|missing/i);
  });

  it('--skip-launch does not call open -W', async () => {
    const exec = mkExec();
    const result = await runSetup({
      installDir,
      skipLaunch: true,
      fetch: await mkReleaseFetch(),
      exec,
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    expect(result.launched).toBe(false);
    expect(result.exitCode).toBe(0);
    const openCalls = exec.mock.calls.filter(
      ([file]) => file === '/usr/bin/open',
    );
    expect(openCalls).toHaveLength(0);
  });

  it('--dry-run prints nothing to fs or network; returns noop with URL context', async () => {
    const fetchFn = vi.fn(
      () => new Response('should not be called', { status: 500 }),
    ) as unknown as typeof globalThis.fetch;
    const exec = mkExec();
    const result = await runSetup({
      installDir,
      dryRun: true,
      fetch: fetchFn,
      exec,
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    expect(result.action).toBe('noop');
    expect(result.launched).toBe(false);
    expect(result.downloadedFromUrl).toContain('shoki-darwin');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(exec).not.toHaveBeenCalled();
  });

  it('--install-dir <path> routes everything into the custom dir', async () => {
    const altDir = await mkdtemp(join(tmpdir(), 'shoki-altdir-'));
    try {
      const result = await runSetup({
        installDir: altDir,
        fetch: await mkReleaseFetch(),
        exec: mkExec(),
        compatibleAppVersion: '0.1.0',
      } as SetupOptions);
      expect(result.installDir).toBe(altDir);
      for (const p of result.appPaths) {
        expect(p.startsWith(altDir)).toBe(true);
      }
    } finally {
      await rm(altDir, { recursive: true, force: true });
    }
  });

  it('--version <ver> downloads that tag (app-v<ver> url)', async () => {
    const result = await runSetup({
      installDir,
      version: '9.9.9',
      fetch: await mkReleaseFetch(),
      exec: mkExec(),
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    expect(result.downloadedFromUrl).toContain('app-v9.9.9');
  });

  it('returns a platform identifier that can be serialized in --json output', async () => {
    const result = await runSetup({
      installDir,
      fetch: await mkReleaseFetch(),
      exec: mkExec(),
      compatibleAppVersion: '0.1.0',
    } as SetupOptions);
    // Roundtrip: JSON.stringify then parse → must equal the in-memory object.
    const json = JSON.parse(JSON.stringify(result));
    expect(json.action).toBe(result.action);
    expect(json.exitCode).toBe(result.exitCode);
    expect(json.appPaths).toEqual(result.appPaths);
  });

  it('rejects on non-darwin platforms with a clear error', async () => {
    const result = await runSetup({
      installDir,
      fetch: await mkReleaseFetch(),
      exec: mkExec(),
      compatibleAppVersion: '0.1.0',
      platformOverride: 'linux-x64',
    } as unknown as SetupOptions).catch((e) => e);
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toMatch(/darwin|platform/i);
  });
});
