const std = @import("std");
const wire = @import("../src/core/wire.zig");
const options = @import("../src/core/options.zig");

// Wire regression — CAP-15 freeze enforcement.
//
// GOLDEN_HEX is the exact byte sequence produced by `wire.encode` for the
// fixture Entry below. If ANY field width, field ordering, endianness, or
// enum value changes in future phases, this test fails — that is the point.
//
// Fixture entry:
//   ts_nanos = 0xAA
//   source   = .applescript (u8 = 0)
//   flags    = 0
//   phrase   = "hi"
//   role     = null  (encoded as length=0)
//   name     = null  (encoded as length=0)
//
// Expected byte layout (little-endian):
//   [01 00 00 00]                         version = 1
//   [01 00 00 00]                         count = 1
//   [AA 00 00 00 00 00 00 00]             ts_nanos (u64 LE)
//   [00]                                  source_tag (applescript)
//   [00]                                  flags
//   [02 00]                               phrase_len = 2
//   [68 69]                               phrase = "hi"
//   [00 00]                               role_len = 0
//   [00 00]                               name_len = 0
const GOLDEN_HEX = [_]u8{
    0x01, 0x00, 0x00, 0x00, // version
    0x01, 0x00, 0x00, 0x00, // count
    0xAA, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // ts_nanos
    0x00, // source_tag
    0x00, // flags
    0x02, 0x00, // phrase_len
    0x68, 0x69, // "hi"
    0x00, 0x00, // role_len
    0x00, 0x00, // name_len
};

test "wire regression: encode single entry produces GOLDEN_HEX byte-for-byte" {
    const entries = [_]options.Entry{
        .{
            .ts_nanos = 0xAA,
            .source = .applescript,
            .flags = 0,
            .phrase = "hi",
        },
    };
    const size = wire.encodedSize(&entries);
    try std.testing.expectEqual(@as(usize, GOLDEN_HEX.len), size);

    var buf: [GOLDEN_HEX.len]u8 = undefined;
    const n = try wire.encode(&entries, &buf);
    try std.testing.expectEqual(@as(usize, GOLDEN_HEX.len), n);
    try std.testing.expectEqualSlices(u8, &GOLDEN_HEX, &buf);
}

test "wire regression: WIRE_VERSION is frozen at 1" {
    try std.testing.expectEqual(@as(u32, 1), wire.WIRE_VERSION);
}

test "wire regression: SourceTag enum values are frozen" {
    try std.testing.expectEqual(@as(u8, 0), @intFromEnum(options.SourceTag.applescript));
    try std.testing.expectEqual(@as(u8, 1), @intFromEnum(options.SourceTag.ax));
    try std.testing.expectEqual(@as(u8, 2), @intFromEnum(options.SourceTag.caption));
    try std.testing.expectEqual(@as(u8, 3), @intFromEnum(options.SourceTag.commander));
    try std.testing.expectEqual(@as(u8, 255), @intFromEnum(options.SourceTag.noop));
}

test "wire regression: GOLDEN_HEX decodes back to the fixture entry" {
    var decoded = try wire.decode(std.testing.allocator, &GOLDEN_HEX);
    defer decoded.deinit();

    try std.testing.expectEqual(@as(u32, 1), decoded.version);
    try std.testing.expectEqual(@as(usize, 1), decoded.entries.len);
    try std.testing.expectEqual(@as(u64, 0xAA), decoded.entries[0].ts_nanos);
    try std.testing.expectEqual(options.SourceTag.applescript, decoded.entries[0].source);
    try std.testing.expectEqual(@as(u8, 0), decoded.entries[0].flags);
    try std.testing.expectEqualStrings("hi", decoded.entries[0].phrase);
    try std.testing.expectEqual(@as(?[]const u8, null), decoded.entries[0].role);
    try std.testing.expectEqual(@as(?[]const u8, null), decoded.entries[0].name);
}
