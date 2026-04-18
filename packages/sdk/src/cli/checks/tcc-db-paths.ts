import { homedir } from 'node:os';
import { join } from 'node:path';
import Database, { type Database as SqliteDatabase } from 'better-sqlite3';

export const USER_TCC_DB_PATH = join(
  homedir(),
  'Library/Application Support/com.apple.TCC/TCC.db',
);

export const SYSTEM_TCC_DB_PATH =
  '/Library/Application Support/com.apple.TCC/TCC.db';

export type TCCOpenResult =
  | { ok: true; db: SqliteDatabase; path: string }
  | {
      ok: false;
      reason: 'not-found' | 'permission-denied' | 'other';
      path: string;
      error: string;
    };

/**
 * Open a TCC.db file read-only.
 * CONTEXT.md D-03: user-scope TCC.db is readable without special permission on macOS 14+;
 * system-scope requires Full Disk Access and usually fails with EACCES/SQLITE_AUTH.
 *
 * Returns a discriminated result so the caller can branch on permission-denied vs not-found.
 */
export function openTCCDatabase(path: string): TCCOpenResult {
  try {
    const db = new Database(path, { readonly: true, fileMustExist: true });
    return { ok: true, db, path };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const reason: 'not-found' | 'permission-denied' | 'other' =
      /EACCES|operation not permitted|SQLITE_AUTH/i.test(msg)
        ? 'permission-denied'
        : /no such file|ENOENT|fileMustExist/i.test(msg)
          ? 'not-found'
          : 'other';
    return { ok: false, reason, path, error: msg };
  }
}
