import { describe, expect, it } from 'vitest';
import { decodeEvents, EXPECTED_WIRE_VERSION } from '../src/wire.js';

/**
 * TS-only wire decoder tests. Zig-side encoder is tested in zig/test/wire_test.zig.
 * These build hand-crafted buffers to exercise every decoder path.
 */

function encodeHeader(count: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt32LE(EXPECTED_WIRE_VERSION, 0);
  buf.writeUInt32LE(count, 4);
  return buf;
}

function encodeEntry(
  tsNanos: bigint,
  source: number,
  flags: number,
  phrase: string,
  role = '',
  name = '',
): Buffer {
  const p = Buffer.from(phrase, 'utf8');
  const r = Buffer.from(role, 'utf8');
  const n = Buffer.from(name, 'utf8');
  const buf = Buffer.alloc(8 + 1 + 1 + 2 + p.length + 2 + r.length + 2 + n.length);
  let off = 0;
  buf.writeBigUInt64LE(tsNanos, off);
  off += 8;
  buf.writeUInt8(source, off);
  off += 1;
  buf.writeUInt8(flags, off);
  off += 1;
  buf.writeUInt16LE(p.length, off);
  off += 2;
  p.copy(buf, off);
  off += p.length;
  buf.writeUInt16LE(r.length, off);
  off += 2;
  r.copy(buf, off);
  off += r.length;
  buf.writeUInt16LE(n.length, off);
  off += 2;
  n.copy(buf, off);
  return buf;
}

describe('decodeEvents', () => {
  it('decodes an empty buffer (count=0)', () => {
    const buf = encodeHeader(0);
    expect(decodeEvents(buf)).toEqual([]);
  });

  it('decodes a single entry without role/name', () => {
    const buf = Buffer.concat([encodeHeader(1), encodeEntry(42n, 0, 0, 'hello')]);
    const events = decodeEvents(buf);
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event).toBeDefined();
    expect(event).toMatchObject({
      tsNanos: 42n,
      source: 'applescript',
      phrase: 'hello',
    });
    expect(event?.role).toBeUndefined();
    expect(event?.name).toBeUndefined();
  });

  it('decodes an entry with role and name', () => {
    const buf = Buffer.concat([
      encodeHeader(1),
      encodeEntry(100n, 1, 1, 'Submit', 'button', 'Submit button'),
    ]);
    const [event] = decodeEvents(buf);
    expect(event).toBeDefined();
    expect(event?.source).toBe('ax');
    expect(event?.flags).toBe(1);
    expect(event?.role).toBe('button');
    expect(event?.name).toBe('Submit button');
  });

  it('throws on wire version mismatch', () => {
    const buf = Buffer.alloc(8);
    buf.writeUInt32LE(999, 0);
    buf.writeUInt32LE(0, 4);
    expect(() => decodeEvents(buf)).toThrow(/version mismatch/i);
  });

  it('throws on unknown source tag', () => {
    const entry = encodeEntry(1n, 77, 0, 'x');
    const buf = Buffer.concat([encodeHeader(1), entry]);
    expect(() => decodeEvents(buf)).toThrow(/unknown source tag/i);
  });

  it('throws on short buffer', () => {
    expect(() => decodeEvents(Buffer.alloc(4))).toThrow(/too short/i);
  });

  it('decodes the noop source tag (255)', () => {
    const buf = Buffer.concat([encodeHeader(1), encodeEntry(1n, 255, 0, 'noop-ping')]);
    const [event] = decodeEvents(buf);
    expect(event).toBeDefined();
    expect(event?.source).toBe('noop');
  });
});
