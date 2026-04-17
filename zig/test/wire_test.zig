const std = @import("std");
const wire = @import("../src/core/wire.zig");
const opts = @import("../src/core/options.zig");

test "round-trip single entry" {
    const entries = [_]opts.Entry{
        .{ .ts_nanos = 42, .source = .applescript, .flags = 0, .phrase = "hello" },
    };
    const size = wire.encodedSize(&entries);
    const buf = try std.testing.allocator.alloc(u8, size);
    defer std.testing.allocator.free(buf);

    const written = try wire.encode(&entries, buf);
    try std.testing.expectEqual(size, written);

    var decoded = try wire.decode(std.testing.allocator, buf);
    defer decoded.deinit();

    try std.testing.expectEqual(wire.WIRE_VERSION, decoded.version);
    try std.testing.expectEqual(@as(usize, 1), decoded.entries.len);
    try std.testing.expectEqualStrings("hello", decoded.entries[0].phrase);
    try std.testing.expectEqual(opts.SourceTag.applescript, decoded.entries[0].source);
    try std.testing.expectEqual(@as(u64, 42), decoded.entries[0].ts_nanos);
}

test "round-trip multiple entries with role and name" {
    const entries = [_]opts.Entry{
        .{ .ts_nanos = 1, .source = .applescript, .flags = 0, .phrase = "Submit" },
        .{ .ts_nanos = 2, .source = .ax, .flags = 1, .phrase = "Cancel", .role = "button", .name = "Cancel button" },
    };
    const size = wire.encodedSize(&entries);
    const buf = try std.testing.allocator.alloc(u8, size);
    defer std.testing.allocator.free(buf);
    _ = try wire.encode(&entries, buf);

    var decoded = try wire.decode(std.testing.allocator, buf);
    defer decoded.deinit();

    try std.testing.expectEqual(@as(usize, 2), decoded.entries.len);
    try std.testing.expectEqualStrings("button", decoded.entries[1].role.?);
    try std.testing.expectEqualStrings("Cancel button", decoded.entries[1].name.?);
    try std.testing.expectEqual(@as(u8, 1), decoded.entries[1].flags);
}

test "wire version is 1 (frozen for Phase 1)" {
    try std.testing.expectEqual(@as(u32, 1), wire.WIRE_VERSION);
}
