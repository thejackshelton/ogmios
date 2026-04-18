import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installFromZip,
  readInstalledAppVersion,
  stripQuarantine,
} from '../../src/cli/setup-install.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'setup');
const GOOD_ZIP = join(FIXTURE_DIR, 'ogmios-darwin-arm64.zip');
const INFO_PLIST_FIXTURE = join(FIXTURE_DIR, 'Info.plist');

function mkExec() {
  return vi.fn(
    async (_file: string, _args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  );
}

describe('installFromZip', () => {
  let installDir: string;

  beforeEach(async () => {
    installDir = await mkdtemp(join(tmpdir(), 'ogmios-install-'));
  });

  afterEach(async () => {
    await rm(installDir, { recursive: true, force: true });
  });

  it('invokes ditto -x -k with [zipPath, installDir] (exact arg order)', async () => {
    const exec = mkExec();
    const result = await installFromZip({
      zipPath: GOOD_ZIP,
      installDir,
      exec,
    });
    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(
      '/usr/bin/ditto',
      ['-x', '-k', GOOD_ZIP, installDir],
    );
    expect(result.installedPaths).toEqual([
      join(installDir, 'Ogmios.app'),
      join(installDir, 'Ogmios Setup.app'),
    ]);
  });

  it('creates the install dir if it does not exist', async () => {
    const newDir = join(installDir, 'new', 'nested', 'applications');
    const exec = mkExec();
    await installFromZip({ zipPath: GOOD_ZIP, installDir: newDir, exec });
    // mkdir recursive should have been done before exec.
    expect(exec).toHaveBeenCalledOnce();
  });
});

describe('stripQuarantine', () => {
  it('calls xattr -dr com.apple.quarantine once per path', async () => {
    const exec = mkExec();
    await stripQuarantine(
      ['/tmp/Ogmios.app', '/tmp/Ogmios Setup.app'],
      exec as unknown as Parameters<typeof stripQuarantine>[1],
    );
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenNthCalledWith(
      1,
      '/usr/bin/xattr',
      ['-dr', 'com.apple.quarantine', '/tmp/Ogmios.app'],
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      '/usr/bin/xattr',
      ['-dr', 'com.apple.quarantine', '/tmp/Ogmios Setup.app'],
    );
  });

  it('tolerates xattr exit code 1 (attribute not found)', async () => {
    const exec = vi.fn(async () => ({
      stdout: '',
      stderr: 'xattr: No such xattr: com.apple.quarantine',
      exitCode: 1,
    }));
    await expect(
      stripQuarantine(
        ['/tmp/Ogmios.app'],
        exec as unknown as Parameters<typeof stripQuarantine>[1],
      ),
    ).resolves.toBeUndefined();
  });

  it('re-throws on unexpected xattr failures (non-1 exit codes)', async () => {
    const exec = vi.fn(async () => ({
      stdout: '',
      stderr: 'permission denied',
      exitCode: 77,
    }));
    await expect(
      stripQuarantine(
        ['/tmp/Ogmios.app'],
        exec as unknown as Parameters<typeof stripQuarantine>[1],
      ),
    ).rejects.toThrowError(/xattr/i);
  });
});

describe('readInstalledAppVersion', () => {
  let appRoot: string;

  beforeEach(async () => {
    appRoot = await mkdtemp(join(tmpdir(), 'ogmios-fixture-app-'));
    await mkdir(join(appRoot, 'Contents'), { recursive: true });
  });

  afterEach(async () => {
    await rm(appRoot, { recursive: true, force: true });
  });

  it('returns the CFBundleShortVersionString from Contents/Info.plist', async () => {
    const plist = await readFile(INFO_PLIST_FIXTURE, 'utf8');
    await writeFile(join(appRoot, 'Contents', 'Info.plist'), plist, 'utf8');

    const version = await readInstalledAppVersion(appRoot);
    expect(version).toBe('0.1.0');
  });

  it('returns null when Info.plist is missing', async () => {
    const version = await readInstalledAppVersion(appRoot);
    expect(version).toBeNull();
  });

  it('returns null when CFBundleShortVersionString is absent from the plist', async () => {
    await writeFile(
      join(appRoot, 'Contents', 'Info.plist'),
      '<?xml version="1.0"?><plist><dict><key>Other</key><string>x</string></dict></plist>',
      'utf8',
    );
    const version = await readInstalledAppVersion(appRoot);
    expect(version).toBeNull();
  });
});
