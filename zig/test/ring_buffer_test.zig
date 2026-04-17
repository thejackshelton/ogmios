const std = @import("std");
const rb = @import("../src/core/ring_buffer.zig");
const opts = @import("../src/core/options.zig");

test "push and drain FIFO" {
    var buf = try rb.RingBuffer.init(std.testing.allocator, 4);
    defer buf.deinit();

    buf.push(.{ .ts_nanos = 1, .source = .noop, .flags = 0, .phrase = "a" });
    buf.push(.{ .ts_nanos = 2, .source = .noop, .flags = 0, .phrase = "b" });

    var out: [4]opts.Entry = undefined;
    const n = buf.drain(&out);
    try std.testing.expectEqual(@as(usize, 2), n);
    try std.testing.expectEqualStrings("a", out[0].phrase);
    try std.testing.expectEqualStrings("b", out[1].phrase);
    try std.testing.expectEqual(@as(usize, 0), buf.len);
}

test "overflow increments droppedCount" {
    var buf = try rb.RingBuffer.init(std.testing.allocator, 2);
    defer buf.deinit();

    buf.push(.{ .ts_nanos = 1, .source = .noop, .flags = 0, .phrase = "a" });
    buf.push(.{ .ts_nanos = 2, .source = .noop, .flags = 0, .phrase = "b" });
    buf.push(.{ .ts_nanos = 3, .source = .noop, .flags = 0, .phrase = "c" });

    try std.testing.expectEqual(@as(u64, 1), buf.droppedCount);
    try std.testing.expectEqual(@as(usize, 2), buf.len);

    var out: [2]opts.Entry = undefined;
    _ = buf.drain(&out);
    try std.testing.expectEqualStrings("b", out[0].phrase);
    try std.testing.expectEqualStrings("c", out[1].phrase);
}

test "clear resets len but preserves droppedCount" {
    var buf = try rb.RingBuffer.init(std.testing.allocator, 2);
    defer buf.deinit();
    buf.push(.{ .ts_nanos = 1, .source = .noop, .flags = 0, .phrase = "a" });
    buf.push(.{ .ts_nanos = 2, .source = .noop, .flags = 0, .phrase = "b" });
    buf.push(.{ .ts_nanos = 3, .source = .noop, .flags = 0, .phrase = "c" });
    buf.clear();
    try std.testing.expectEqual(@as(usize, 0), buf.len);
    try std.testing.expectEqual(@as(u64, 1), buf.droppedCount);
}
