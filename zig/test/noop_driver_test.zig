const std = @import("std");
const registry = @import("../src/core/registry.zig");
const rb = @import("../src/core/ring_buffer.zig");
const opts = @import("../src/core/options.zig");

test "noop driver end-to-end via registry" {
    const entry = registry.findByName("noop") orelse return error.NoopNotRegistered;
    const handle = try entry.create(std.testing.allocator);
    defer {
        handle.vtable.deinit(handle.ctx);
        std.testing.allocator.destroy(@constCast(handle.vtable));
    }

    try handle.vtable.init(handle.ctx, .{ .allocator = std.testing.allocator });
    try handle.vtable.start(handle.ctx);

    var buf = try rb.RingBuffer.init(std.testing.allocator, 16);
    defer buf.deinit();

    const produced = try handle.vtable.drain(handle.ctx, &buf);
    try std.testing.expectEqual(@as(usize, 1), produced);
    try std.testing.expectEqual(@as(usize, 1), buf.len);

    var out: [1]opts.Entry = undefined;
    _ = buf.drain(&out);
    try std.testing.expectEqualStrings("noop-ping", out[0].phrase);

    try handle.vtable.reset(handle.ctx);
    try handle.vtable.stop(handle.ctx);
}

test "unregistered driver lookup returns null" {
    try std.testing.expectEqual(@as(?registry.RegisteredDriver, null), registry.findByName("nonexistent"));
}
