import { describe, expect, it } from 'vitest';
import { compareCSReq, parseCSReqBlob } from '../../src/cli/checks/csreq-compare.js';
import {
  CSREQ_DEVELOPER_ID_JACK,
  CSREQ_DEVELOPER_ID_OLD,
  CSREQ_EMPTY,
  CSREQ_UNRECOGNIZED,
} from './fixtures/csreq-blobs.js';

describe('parseCSReqBlob', () => {
  it('extracts the Developer ID Application identity (capture group, prefix stripped)', () => {
    // The regex captures the identity AFTER the "Developer ID Application: " prefix;
    // compareCSReq normalizes both sides consistently.
    expect(parseCSReqBlob(CSREQ_DEVELOPER_ID_JACK)).toBe(
      'Jack Shelton (TEAMIDXYZ)',
    );
  });

  it('returns null on unrecognized blob (no magic header)', () => {
    expect(parseCSReqBlob(CSREQ_UNRECOGNIZED)).toBeNull();
  });

  it('returns null on empty buffer', () => {
    expect(parseCSReqBlob(CSREQ_EMPTY)).toBeNull();
  });
});

describe('compareCSReq', () => {
  const JACK_AUTHORITY = 'Developer ID Application: Jack Shelton (TEAMIDXYZ)';

  it('returns "match" when csreq authority equals current helper authority', () => {
    expect(compareCSReq(CSREQ_DEVELOPER_ID_JACK, JACK_AUTHORITY)).toBe('match');
  });

  it('returns "mismatch" for stale csreq with a different team identifier', () => {
    expect(compareCSReq(CSREQ_DEVELOPER_ID_OLD, JACK_AUTHORITY)).toBe('mismatch');
  });

  it('returns "cannot-parse" on unrecognized csreq', () => {
    expect(compareCSReq(CSREQ_UNRECOGNIZED, JACK_AUTHORITY)).toBe('cannot-parse');
  });

  it('returns "cannot-parse" when current helper authority is null', () => {
    expect(compareCSReq(CSREQ_DEVELOPER_ID_JACK, null)).toBe('cannot-parse');
  });

  it('tolerates "Developer ID Application:" prefix differences (normalization)', () => {
    // Both sides have the prefix — should still match (exercises the normalize() helper).
    expect(compareCSReq(CSREQ_DEVELOPER_ID_JACK, JACK_AUTHORITY)).toBe('match');
  });

  it('returns "mismatch" not "cannot-parse" when csreq parses but identity differs', () => {
    expect(compareCSReq(CSREQ_DEVELOPER_ID_OLD, JACK_AUTHORITY)).toBe('mismatch');
    expect(compareCSReq(CSREQ_DEVELOPER_ID_OLD, JACK_AUTHORITY)).not.toBe(
      'cannot-parse',
    );
  });
});
