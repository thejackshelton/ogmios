/**
 * Plan 10-02 — download + verify the unified `ogmios-<platform>.zip` artifact
 * from GitHub Releases.
 *
 * The surface is intentionally small and dependency-free: Node 24's native
 * `fetch`, `crypto.createHash('sha256')`, and `fs/promises`. Release URLs are
 * constructed from a `baseUrl + /<version>/<platform>` pattern (see
 * CONTEXT.md § GitHub Release publish workflow) and the SHA256 sidecar is
 * parsed in either `<hex>  <basename>` or bare `<hex>` shape.
 *
 * Download timeout: 60s (overridable via AbortSignal in future). Zip size
 * expected < 50MB, so buffering in memory before hashing is fine.
 */

import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type OgmiosAppPlatform = 'darwin-arm64' | 'darwin-x64';

export interface DownloadOptions {
  /** Release version without the `app-v` prefix (e.g. "0.1.0"). */
  version: string;
  /** Override base URL — tests point this at a fixture server. */
  baseUrl?: string;
  /** Resolved platform key. */
  platform: OgmiosAppPlatform;
  /** Where to write the zip + sha sidecar. Defaults to a fresh tmp dir. */
  workDir?: string;
  /** Injected fetch — defaults to `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /** Injected fs — used by callers that want to stub disk writes. */
  fs?: {
    writeFile: typeof import('node:fs/promises').writeFile;
    mkdtemp: typeof import('node:fs/promises').mkdtemp;
  };
  /** Download timeout in ms (applied per-fetch). Default: 60_000. */
  timeoutMs?: number;
}

export interface DownloadResult {
  zipPath: string;
  shaPath: string;
  expectedSha: string;
  actualSha: string;
  bytesDownloaded: number;
  downloadedFromUrl: string;
}

const DEFAULT_BASE_URL = 'https://github.com/thejackshelton/ogmios/releases/download';
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Parse an `shasum -a 256` style sidecar: first whitespace-delimited token
 * is the 64-char hex. Handles both `<hex>  <basename>\n` and bare `<hex>`.
 */
export function parseShaSidecar(body: string): string {
  const first = body.trim().split(/\s+/)[0] ?? '';
  if (!/^[0-9a-f]{64}$/i.test(first)) {
    throw new Error(
      `Malformed .sha256 sidecar: expected a 64-char hex hash as the first token, got "${first.slice(0, 64)}"`,
    );
  }
  return first.toLowerCase();
}

/**
 * Assemble the release URL for a given (baseUrl, version, platform). The
 * `app-v` tag prefix is documented in CONTEXT.md and matches Phase 10-03's
 * release workflow.
 */
function buildUrls(opts: DownloadOptions): { zipUrl: string; shaUrl: string } {
  const base = opts.baseUrl ?? DEFAULT_BASE_URL;
  const trimmed = base.replace(/\/+$/, '');
  const zipUrl = `${trimmed}/app-v${opts.version}/ogmios-${opts.platform}.zip`;
  return { zipUrl, shaUrl: `${zipUrl}.sha256` };
}

async function fetchOrThrow(
  url: string,
  fetchImpl: typeof globalThis.fetch,
  timeoutMs: number,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error fetching ${url}: ${message}`);
  }
  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} ${response.statusText || 'Not Found'} fetching ${url}`,
    );
  }
  return response;
}

export async function downloadAndVerifyZip(
  opts: DownloadOptions,
): Promise<DownloadResult> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const writeFileImpl = opts.fs?.writeFile ?? writeFile;
  const mkdtempImpl = opts.fs?.mkdtemp ?? mkdtemp;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { zipUrl, shaUrl } = buildUrls(opts);

  const workDir =
    opts.workDir ?? (await mkdtempImpl(join(tmpdir(), 'ogmios-setup-')));

  // 1. Fetch the SHA sidecar first — cheap, and fails fast on a wrong URL.
  const shaResponse = await fetchOrThrow(shaUrl, fetchImpl, timeoutMs);
  const shaText = await shaResponse.text();
  const expectedSha = parseShaSidecar(shaText);

  // 2. Fetch the zip itself.
  const zipResponse = await fetchOrThrow(zipUrl, fetchImpl, timeoutMs);
  const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());

  // 3. Hash the in-memory buffer.
  const actualSha = createHash('sha256').update(zipBuffer).digest('hex');

  if (actualSha !== expectedSha) {
    throw new Error(
      `sha256 mismatch for ${zipUrl}: expected ${expectedSha} (from ${shaUrl}), got ${actualSha}. Refusing to install a zip whose contents do not match the published hash.`,
    );
  }

  // 4. Persist the verified zip + sidecar so the install stage can ditto from disk.
  const zipPath = join(workDir, `ogmios-${opts.platform}.zip`);
  const shaPath = `${zipPath}.sha256`;
  await writeFileImpl(zipPath, zipBuffer);
  await writeFileImpl(shaPath, shaText, 'utf8');

  return {
    zipPath,
    shaPath,
    expectedSha,
    actualSha,
    bytesDownloaded: zipBuffer.byteLength,
    downloadedFromUrl: zipUrl,
  };
}

/**
 * Resolve the GitHub owner from `packages/sdk/package.json` `repository.url`.
 * Exposed so setup-command.ts can surface the right release base URL.
 * Throws loudly if the repository format ever changes.
 */
export function resolveReleaseBaseUrlFromPackageJson(pkg: {
  repository?: { url?: string } | string;
}): string {
  const raw =
    typeof pkg.repository === 'string'
      ? pkg.repository
      : (pkg.repository?.url ?? '');
  // Accept git+https://github.com/<owner>/<repo>.git or https://github.com/<owner>/<repo>(.git)
  const match = raw.match(
    /(?:^|\/\/)github\.com\/([^/]+)\/([^./]+)(?:\.git)?\/?$/,
  );
  if (!match) {
    throw new Error(
      `Unable to parse github owner/repo from package.json repository.url: "${raw}". Expected "git+https://github.com/<owner>/<repo>.git".`,
    );
  }
  const [, owner, repo] = match;
  return `https://github.com/${owner}/${repo}/releases/download`;
}
