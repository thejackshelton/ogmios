import { ShokiError } from './errors.js';
import type { ShokiEvent, ShokiEventSource } from './screen-reader.js';

/**
 * Mirror of zig/src/core/wire.zig WIRE_VERSION.
 * Bump in lockstep with the Zig side — a mismatch throws at decode time.
 */
export const EXPECTED_WIRE_VERSION = 1;

const SOURCE_TAGS: Record<number, ShokiEventSource> = {
  0: 'applescript',
  1: 'ax',
  2: 'caption',
  3: 'commander',
  255: 'noop',
};

/**
 * Decode the wire-format buffer produced by binding.driverDrain(id).
 * Layout (little-endian):
 *   [u32 version][u32 count][entry]*
 *   entry = [u64 ts_nanos][u8 source][u8 flags]
 *           [u16 phrase_len][phrase]
 *           [u16 role_len][role?]
 *           [u16 name_len][name?]
 *
 * Mirrors zig/src/core/wire.zig byte-for-byte. Zig is the source of truth;
 * any divergence here is a bug.
 */
export function decodeEvents(buf: Buffer): ShokiEvent[] {
  if (buf.byteLength < 8) {
    throw new ShokiError(
      `Wire buffer too short: ${buf.byteLength} bytes (need at least 8 for header)`,
      'ERR_WIRE_SHORT',
    );
  }

  const version = buf.readUInt32LE(0);
  if (version !== EXPECTED_WIRE_VERSION) {
    throw new ShokiError(
      `Wire format version mismatch: binding produced ${version}, SDK expects ${EXPECTED_WIRE_VERSION}. ` +
        `Reinstall dicta and @shoki/binding-* so their versions match.`,
      'ERR_WIRE_VERSION_MISMATCH',
    );
  }

  const count = buf.readUInt32LE(4);
  const events: ShokiEvent[] = [];
  let offset = 8;

  for (let i = 0; i < count; i++) {
    const tsNanos = buf.readBigUInt64LE(offset);
    offset += 8;
    const sourceRaw = buf.readUInt8(offset);
    offset += 1;
    const flags = buf.readUInt8(offset);
    offset += 1;
    const source = SOURCE_TAGS[sourceRaw];
    if (!source) {
      throw new ShokiError(
        `Unknown source tag ${sourceRaw} at entry ${i}; binding/SDK out of sync.`,
        'ERR_WIRE_UNKNOWN_SOURCE',
      );
    }

    const phraseLen = buf.readUInt16LE(offset);
    offset += 2;
    const phrase = buf.toString('utf8', offset, offset + phraseLen);
    offset += phraseLen;

    const roleLen = buf.readUInt16LE(offset);
    offset += 2;
    const role = roleLen > 0 ? buf.toString('utf8', offset, offset + roleLen) : undefined;
    offset += roleLen;

    const nameLen = buf.readUInt16LE(offset);
    offset += 2;
    const name = nameLen > 0 ? buf.toString('utf8', offset, offset + nameLen) : undefined;
    offset += nameLen;

    events.push({ tsNanos, source, flags, phrase, role, name });
  }

  if (offset !== buf.byteLength) {
    throw new ShokiError(
      `Wire buffer has ${buf.byteLength - offset} trailing bytes after ${count} entries — decoder/encoder disagree.`,
      'ERR_WIRE_TRAILING_BYTES',
    );
  }

  return events;
}
