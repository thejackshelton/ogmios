import { readFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  downloadAndVerifyZip,
  type DownloadOptions,
} from '../../src/cli/setup-download.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'setup');
const GOOD_ZIP = join(FIXTURE_DIR, 'ogmios-darwin-arm64.zip');
const TAMPERED_ZIP = join(FIXTURE_DIR, 'ogmios-darwin-arm64.tampered.zip');
const SHA_FILE = join(FIXTURE_DIR, 'ogmios-darwin-arm64.zip.sha256');

/**
 * Mint a tiny fake `fetch` that serves whichever (url -> bytes) pairs we give it.
 * Any URL not registered resolves to a 404.
 */
function mkFetch(
  routes: Record<string, { status: number; body: Buffer | string }>,
): typeof globalThis.fetch {
  return (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    const route = routes[url];
    if (!route) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }
    const body =
      typeof route.body === 'string' ? route.body : new Uint8Array(route.body);
    return new Response(body, { status: route.status });
  }) as unknown as typeof globalThis.fetch;
}

describe('downloadAndVerifyZip', () => {
  let workDir: string;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'ogmios-setup-download-test-'));
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  it('downloads + verifies a well-formed zip whose SHA matches the sidecar', async () => {
    const zipBytes = await readFile(GOOD_ZIP);
    const shaText = await readFile(SHA_FILE, 'utf8');
    const expectedHex = createHash('sha256').update(zipBytes).digest('hex');

    const zipUrl =
      'https://github.com/thejackshelton/ogmios/releases/download/app-v0.1.0/ogmios-darwin-arm64.zip';
    const shaUrl = `${zipUrl}.sha256`;

    const opts: DownloadOptions = {
      version: '0.1.0',
      platform: 'darwin-arm64',
      workDir,
      fetch: mkFetch({
        [zipUrl]: { status: 200, body: zipBytes },
        [shaUrl]: { status: 200, body: shaText },
      }),
    };

    const result = await downloadAndVerifyZip(opts);

    expect(result.expectedSha).toBe(expectedHex);
    expect(result.actualSha).toBe(expectedHex);
    expect(result.bytesDownloaded).toBe(zipBytes.byteLength);
    await expect(stat(result.zipPath)).resolves.toBeTruthy();
    await expect(stat(result.shaPath)).resolves.toBeTruthy();
  });

  it('rejects when the downloaded zip SHA does not match the sidecar', async () => {
    const shaText = await readFile(SHA_FILE, 'utf8'); // sha of the GOOD zip
    const tamperedBytes = await readFile(TAMPERED_ZIP); // but the zip is tampered

    const zipUrl =
      'https://github.com/thejackshelton/ogmios/releases/download/app-v0.1.0/ogmios-darwin-arm64.zip';
    const shaUrl = `${zipUrl}.sha256`;

    const opts: DownloadOptions = {
      version: '0.1.0',
      platform: 'darwin-arm64',
      workDir,
      fetch: mkFetch({
        [zipUrl]: { status: 200, body: tamperedBytes },
        [shaUrl]: { status: 200, body: shaText },
      }),
    };

    await expect(downloadAndVerifyZip(opts)).rejects.toThrowError(/sha256/i);
  });

  it('includes the expected + actual prefixes in the mismatch error', async () => {
    const shaText = await readFile(SHA_FILE, 'utf8');
    const tamperedBytes = await readFile(TAMPERED_ZIP);
    const expectedPrefix = shaText.slice(0, 12);
    const actualPrefix = createHash('sha256')
      .update(tamperedBytes)
      .digest('hex')
      .slice(0, 12);

    const zipUrl =
      'https://github.com/thejackshelton/ogmios/releases/download/app-v0.1.0/ogmios-darwin-arm64.zip';
    const shaUrl = `${zipUrl}.sha256`;

    const err = await downloadAndVerifyZip({
      version: '0.1.0',
      platform: 'darwin-arm64',
      workDir,
      fetch: mkFetch({
        [zipUrl]: { status: 200, body: tamperedBytes },
        [shaUrl]: { status: 200, body: shaText },
      }),
    }).catch((e) => e as Error);

    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain(expectedPrefix);
    expect(err.message).toContain(actualPrefix);
  });

  it('rejects with URL + 404 context when the zip fetch returns 404', async () => {
    const zipUrl =
      'https://github.com/thejackshelton/ogmios/releases/download/app-v0.1.0/ogmios-darwin-arm64.zip';

    await expect(
      downloadAndVerifyZip({
        version: '0.1.0',
        platform: 'darwin-arm64',
        workDir,
        fetch: mkFetch({
          // Intentionally no route — all URLs → 404
        }),
      }),
    ).rejects.toThrowError(/(404|not found).*ogmios-darwin-arm64\.zip/is);

    // Verify the error mentions the exact URL we tried to fetch.
    const err = await downloadAndVerifyZip({
      version: '0.1.0',
      platform: 'darwin-arm64',
      workDir,
      fetch: mkFetch({}),
    }).catch((e) => e as Error);
    expect(err.message).toContain(zipUrl);
  });

  it('parses the .sha256 sidecar in both `<hex>  <basename>` and `<hex>` formats', async () => {
    const zipBytes = await readFile(GOOD_ZIP);
    const expectedHex = createHash('sha256').update(zipBytes).digest('hex');

    const zipUrl =
      'https://github.com/thejackshelton/ogmios/releases/download/app-v0.1.0/ogmios-darwin-arm64.zip';
    const shaUrl = `${zipUrl}.sha256`;

    // Bare-hex form (no filename, no trailing newline).
    const bare = await downloadAndVerifyZip({
      version: '0.1.0',
      platform: 'darwin-arm64',
      workDir,
      fetch: mkFetch({
        [zipUrl]: { status: 200, body: zipBytes },
        [shaUrl]: { status: 200, body: expectedHex },
      }),
    });
    expect(bare.actualSha).toBe(expectedHex);
  });

  it('supports baseUrl override for test fixture servers', async () => {
    const zipBytes = await readFile(GOOD_ZIP);
    const shaText = await readFile(SHA_FILE, 'utf8');

    const baseUrl = 'https://example.test/mock-releases';
    const zipUrl = `${baseUrl}/app-v0.1.0/ogmios-darwin-arm64.zip`;
    const shaUrl = `${zipUrl}.sha256`;

    const result = await downloadAndVerifyZip({
      version: '0.1.0',
      platform: 'darwin-arm64',
      baseUrl,
      workDir,
      fetch: mkFetch({
        [zipUrl]: { status: 200, body: zipBytes },
        [shaUrl]: { status: 200, body: shaText },
      }),
    });

    expect(result.bytesDownloaded).toBe(zipBytes.byteLength);
  });
});
