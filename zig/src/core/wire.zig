const std = @import("std");
const Entry = @import("options.zig").Entry;

/// Wire format per CONTEXT.md D-14.
/// Buffer layout: [u32 version][u32 count][entry]*
/// entry = [u64 ts_nanos][u8 source_tag][u8 flags]
///         [u16 phrase_len][phrase bytes]
///         [u16 role_len][role bytes?]
///         [u16 name_len][name bytes?]
///
/// DO NOT CHANGE the version in Phase 1 — Phase 3 adds a regression test
/// that fails if any field width or ordering changes.
pub const WIRE_VERSION: u32 = 1;

pub fn encodedSize(entries: []const Entry) usize {
    var total: usize = @sizeOf(u32) + @sizeOf(u32);
    for (entries) |e| {
        total += @sizeOf(u64) + 1 + 1;
        total += @sizeOf(u16) + e.phrase.len;
        total += @sizeOf(u16) + if (e.role) |r| r.len else 0;
        total += @sizeOf(u16) + if (e.name) |n| n.len else 0;
    }
    return total;
}

/// Minimal manual little-endian writer. Zig 0.16 moved the writer/reader APIs
/// behind an `Io` interface; for a straightforward fixed-buffer encode/decode
/// we just pack bytes directly.
pub fn encode(entries: []const Entry, buf: []u8) !usize {
    if (buf.len < encodedSize(entries)) return error.BufferTooSmall;
    var pos: usize = 0;

    pos += writeU32LE(buf[pos..], WIRE_VERSION);
    pos += writeU32LE(buf[pos..], @intCast(entries.len));

    for (entries) |e| {
        pos += writeU64LE(buf[pos..], e.ts_nanos);
        buf[pos] = @intFromEnum(e.source);
        pos += 1;
        buf[pos] = e.flags;
        pos += 1;

        pos += writeU16LE(buf[pos..], @intCast(e.phrase.len));
        @memcpy(buf[pos .. pos + e.phrase.len], e.phrase);
        pos += e.phrase.len;

        const role_bytes: []const u8 = if (e.role) |r| r else "";
        pos += writeU16LE(buf[pos..], @intCast(role_bytes.len));
        @memcpy(buf[pos .. pos + role_bytes.len], role_bytes);
        pos += role_bytes.len;

        const name_bytes: []const u8 = if (e.name) |n| n else "";
        pos += writeU16LE(buf[pos..], @intCast(name_bytes.len));
        @memcpy(buf[pos .. pos + name_bytes.len], name_bytes);
        pos += name_bytes.len;
    }

    return pos;
}

fn writeU16LE(buf: []u8, v: u16) usize {
    buf[0] = @intCast(v & 0xff);
    buf[1] = @intCast((v >> 8) & 0xff);
    return 2;
}
fn writeU32LE(buf: []u8, v: u32) usize {
    buf[0] = @intCast(v & 0xff);
    buf[1] = @intCast((v >> 8) & 0xff);
    buf[2] = @intCast((v >> 16) & 0xff);
    buf[3] = @intCast((v >> 24) & 0xff);
    return 4;
}
fn writeU64LE(buf: []u8, v: u64) usize {
    var i: usize = 0;
    while (i < 8) : (i += 1) {
        buf[i] = @intCast((v >> @as(u6, @intCast(i * 8))) & 0xff);
    }
    return 8;
}

fn readU16LE(buf: []const u8) u16 {
    return @as(u16, buf[0]) | (@as(u16, buf[1]) << 8);
}
fn readU32LE(buf: []const u8) u32 {
    return @as(u32, buf[0]) |
        (@as(u32, buf[1]) << 8) |
        (@as(u32, buf[2]) << 16) |
        (@as(u32, buf[3]) << 24);
}
fn readU64LE(buf: []const u8) u64 {
    var v: u64 = 0;
    var i: usize = 0;
    while (i < 8) : (i += 1) {
        v |= @as(u64, buf[i]) << @as(u6, @intCast(i * 8));
    }
    return v;
}

pub const Decoded = struct {
    allocator: std.mem.Allocator,
    version: u32,
    entries: []Entry,

    pub fn deinit(self: *Decoded) void {
        for (self.entries) |e| {
            self.allocator.free(e.phrase);
            if (e.role) |r| self.allocator.free(r);
            if (e.name) |n| self.allocator.free(n);
        }
        self.allocator.free(self.entries);
    }
};

pub fn decode(allocator: std.mem.Allocator, buf: []const u8) !Decoded {
    if (buf.len < 8) return error.BufferTooSmall;
    var pos: usize = 0;

    const version = readU32LE(buf[pos..]);
    pos += 4;
    const count = readU32LE(buf[pos..]);
    pos += 4;

    var entries = try allocator.alloc(Entry, count);
    errdefer allocator.free(entries);

    for (0..count) |i| {
        if (pos + 10 > buf.len) return error.BufferTooSmall;
        const ts = readU64LE(buf[pos..]);
        pos += 8;
        const src_raw = buf[pos];
        pos += 1;
        const flags = buf[pos];
        pos += 1;

        if (pos + 2 > buf.len) return error.BufferTooSmall;
        const phrase_len = readU16LE(buf[pos..]);
        pos += 2;
        if (pos + phrase_len > buf.len) return error.BufferTooSmall;
        const phrase = try allocator.alloc(u8, phrase_len);
        @memcpy(phrase, buf[pos .. pos + phrase_len]);
        pos += phrase_len;

        if (pos + 2 > buf.len) return error.BufferTooSmall;
        const role_len = readU16LE(buf[pos..]);
        pos += 2;
        const role: ?[]const u8 = if (role_len > 0) blk: {
            if (pos + role_len > buf.len) return error.BufferTooSmall;
            const b = try allocator.alloc(u8, role_len);
            @memcpy(b, buf[pos .. pos + role_len]);
            pos += role_len;
            break :blk b;
        } else null;

        if (pos + 2 > buf.len) return error.BufferTooSmall;
        const name_len = readU16LE(buf[pos..]);
        pos += 2;
        const name: ?[]const u8 = if (name_len > 0) blk: {
            if (pos + name_len > buf.len) return error.BufferTooSmall;
            const b = try allocator.alloc(u8, name_len);
            @memcpy(b, buf[pos .. pos + name_len]);
            pos += name_len;
            break :blk b;
        } else null;

        entries[i] = .{
            .ts_nanos = ts,
            .source = @enumFromInt(src_raw),
            .flags = flags,
            .phrase = phrase,
            .role = role,
            .name = name,
        };
    }

    return .{ .allocator = allocator, .version = version, .entries = entries };
}
