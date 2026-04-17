/**
 * Simulated CSReq blobs for tests. The real binary format is:
 *   [magic 0xFA 0xDE 0x0C 0x00][length][code-requirement-language expression tree]
 * The expression tree contains the signing identity as an embedded ASCII string.
 *
 * Our Phase 2 comparator does a string-level match on the "Developer ID Application: ..."
 * substring plus the team identifier — sufficient for detecting stale entries.
 */

function asCSReq(authorityString: string, teamId: string): Buffer {
  const header = Buffer.from([0xfa, 0xde, 0x0c, 0x00]);
  // Fake "length" + body = ASCII bytes of the authority + team identifier + some padding
  const body = Buffer.from(
    `\u0000\u0000\u0000\u0020and anchor apple generic and certificate leaf[subject.CN] = "${authorityString}" and certificate leaf[subject.OU] = "${teamId}"\u0000`,
    'utf8',
  );
  return Buffer.concat([header, body]);
}

export const CSREQ_DEVELOPER_ID_JACK = asCSReq(
  'Developer ID Application: Jack Shelton (TEAMIDXYZ)',
  'TEAMIDXYZ',
);

export const CSREQ_DEVELOPER_ID_OLD = asCSReq(
  'Developer ID Application: Jack Shelton (OLDTEAMID)',
  'OLDTEAMID',
);

export const CSREQ_UNRECOGNIZED = Buffer.from(
  'not a valid csreq blob — no magic header, no authority',
  'utf8',
);

export const CSREQ_EMPTY = Buffer.alloc(0);
