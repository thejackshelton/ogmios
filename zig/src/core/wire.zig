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

pub fn encode(entries: []const Entry, buf: []u8) !usize {
    if (buf.len < encodedSize(entries)) return error.BufferTooSmall;
    var w = std.io.fixedBufferStream(buf);
    const out = w.writer();

    try out.writeInt(u32, WIRE_VERSION, .little);
    try out.writeInt(u32, @intCast(entries.len), .little);

    for (entries) |e| {
        try out.writeInt(u64, e.ts_nanos, .little);
        try out.writeByte(@intFromEnum(e.source));
        try out.writeByte(e.flags);
        try out.writeInt(u16, @intCast(e.phrase.len), .little);
        try out.writeAll(e.phrase);
        const role_bytes = if (e.role) |r| r else "";
        try out.writeInt(u16, @intCast(role_bytes.len), .little);
        try out.writeAll(role_bytes);
        const name_bytes = if (e.name) |n| n else "";
        try out.writeInt(u16, @intCast(name_bytes.len), .little);
        try out.writeAll(name_bytes);
    }

    return w.pos;
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
    var r = std.io.fixedBufferStream(buf);
    const reader = r.reader();

    const version = try reader.readInt(u32, .little);
    const count = try reader.readInt(u32, .little);
    var entries = try allocator.alloc(Entry, count);
    errdefer allocator.free(entries);

    for (0..count) |i| {
        const ts = try reader.readInt(u64, .little);
        const src_raw = try reader.readByte();
        const flags = try reader.readByte();
        const phrase_len = try reader.readInt(u16, .little);
        const phrase = try allocator.alloc(u8, phrase_len);
        _ = try reader.readAll(phrase);
        const role_len = try reader.readInt(u16, .little);
        const role: ?[]const u8 = if (role_len > 0) blk: {
            const b = try allocator.alloc(u8, role_len);
            _ = try reader.readAll(b);
            break :blk b;
        } else null;
        const name_len = try reader.readInt(u16, .little);
        const name: ?[]const u8 = if (name_len > 0) blk: {
            const b = try allocator.alloc(u8, name_len);
            _ = try reader.readAll(b);
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
