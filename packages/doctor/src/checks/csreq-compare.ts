export type CSReqCompareResult = 'match' | 'mismatch' | 'cannot-parse';

const CSREQ_MAGIC = Buffer.from([0xfa, 0xde, 0x0c, 0x00]);

/**
 * Extract the "Developer ID Application: ..." authority string from a CSReq blob.
 * Returns null when:
 *   - buf is empty
 *   - magic header is absent
 *   - no "Developer ID Application:" substring is present
 */
export function parseCSReqBlob(buf: Buffer): string | null {
  if (buf.byteLength < CSREQ_MAGIC.byteLength) return null;
  if (
    buf.compare(
      CSREQ_MAGIC,
      0,
      CSREQ_MAGIC.byteLength,
      0,
      CSREQ_MAGIC.byteLength,
    ) !== 0
  ) {
    return null;
  }
  // Scan the remaining bytes as latin1 (we only care about ASCII substrings).
  const text = buf.toString('latin1');
  const m = text.match(/Developer ID Application: ([^"\u0000]+)/);
  if (!m) return null;
  return m[1]!.trim();
}

/**
 * Compare a TCC row's csreq blob against the current helper's signature Authority line.
 *
 * Semantics:
 *   - 'match':        csreq decodes and matches the current helper signature (modulo surrounding whitespace/quotes)
 *   - 'mismatch':     csreq decodes but the Authority string does not match — this is the PERM-03 stale-entry signal
 *   - 'cannot-parse': csreq is empty, or doesn't contain the magic, or has no Authority substring
 *
 * `currentHelperAuthority` is the Authority= line from `checkHelperSignature` (Plan 02-02),
 * e.g. "Developer ID Application: Jack Shelton (TEAMIDXYZ)".
 */
export function compareCSReq(
  csreq: Buffer,
  currentHelperAuthority: string | null,
): CSReqCompareResult {
  const parsed = parseCSReqBlob(csreq);
  if (parsed === null) return 'cannot-parse';
  if (currentHelperAuthority === null) return 'cannot-parse';

  // Strip "Developer ID Application: " prefix from both sides so we compare just the identity.
  const normalize = (s: string) =>
    s.replace(/^Developer ID Application:\s*/, '').trim();

  return normalize(parsed) === normalize(currentHelperAuthority)
    ? 'match'
    : 'mismatch';
}
