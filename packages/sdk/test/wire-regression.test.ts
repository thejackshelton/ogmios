import { describe, expect, it } from 'vitest';
import { decodeEvents, EXPECTED_WIRE_VERSION } from '../src/wire.js';

/**
 * Wire regression — CAP-15 freeze enforcement (TS mirror of
 * zig/test/wire_regression_test.zig). The Zig encoder and TS decoder MUST
 * agree byte-for-byte on GOLDEN_HEX; any drift means one side drifted.
 *
 * Fixture entry:
 *   tsNanos = 0xAA
 *   source  = applescript (0)
 *   flags   = 0
 *   phrase  = "hi"
 *   role    = undefined
 *   name    = undefined
 */
const GOLDEN_HEX = new Uint8Array([
  0x01, 0x00, 0x00, 0x00, // version = 1
  0x01, 0x00, 0x00, 0x00, // count = 1
  0xaa, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ts_nanos
  0x00, // source_tag applescript
  0x00, // flags
  0x02, 0x00, // phrase_len
  0x68, 0x69, // "hi"
  0x00, 0x00, // role_len
  0x00, 0x00, // name_len
]);

describe('wire regression (CAP-15)', () => {
  it('decodes GOLDEN_HEX to exactly one entry with expected fields', () => {
    const events = decodeEvents(Buffer.from(GOLDEN_HEX));
    expect(events).toHaveLength(1);
    const event = events[0];
    expect(event).toBeDefined();
    expect(event?.tsNanos).toBe(0xaan);
    expect(event?.source).toBe('applescript');
    expect(event?.flags).toBe(0);
    expect(event?.phrase).toBe('hi');
    expect(event?.role).toBeUndefined();
    expect(event?.name).toBeUndefined();
  });

  it('EXPECTED_WIRE_VERSION is frozen at 1', () => {
    expect(EXPECTED_WIRE_VERSION).toBe(1);
  });

  it('decoder fails if version is not 1 (future version bumps require opt-in)', () => {
    const bad = new Uint8Array(GOLDEN_HEX);
    bad[0] = 0x02; // corrupt version field
    expect(() => decodeEvents(Buffer.from(bad))).toThrow(/version mismatch/i);
  });

  it('GOLDEN_HEX byte length matches computed encoded size (26 bytes)', () => {
    // 4 + 4 + 8 + 1 + 1 + 2 + 2 + 2 + 2 = 26 (no phrase padding, no role/name)
    expect(GOLDEN_HEX.length).toBe(26);
  });
});
