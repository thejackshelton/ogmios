const std = @import("std");
const driver_mod = @import("../../core/driver.zig");
const opts_mod = @import("../../core/options.zig");
const clock_mod = @import("../../core/clock.zig");

pub const NoopDriver = struct {
    allocator: std.mem.Allocator,
    running: bool = false,
    drain_count: u64 = 0,

    pub fn create(allocator: std.mem.Allocator) !*NoopDriver {
        const self = try allocator.create(NoopDriver);
        self.* = .{ .allocator = allocator };
        return self;
    }

    pub fn vtable() driver_mod.ShokiDriver {
        return .{
            .init = initImpl,
            .start = startImpl,
            .stop = stopImpl,
            .drain = drainImpl,
            .reset = resetImpl,
            .deinit = deinitImpl,
            .name = "noop",
            .platform = .any,
        };
    }

    fn initImpl(ctx: *anyopaque, opts: opts_mod.InitOptions) anyerror!void {
        const self: *NoopDriver = @ptrCast(@alignCast(ctx));
        _ = self;
        _ = opts;
    }
    fn startImpl(ctx: *anyopaque) anyerror!void {
        const self: *NoopDriver = @ptrCast(@alignCast(ctx));
        self.running = true;
    }
    fn stopImpl(ctx: *anyopaque) anyerror!void {
        const self: *NoopDriver = @ptrCast(@alignCast(ctx));
        self.running = false;
    }
    fn drainImpl(ctx: *anyopaque, out: *driver_mod.RingBuffer) anyerror!usize {
        const self: *NoopDriver = @ptrCast(@alignCast(ctx));
        self.drain_count += 1;
        // One synthetic entry per drain so Phase 1 round-trip tests see data flowing.
        const entry = opts_mod.Entry{
            .ts_nanos = clock_mod.nanoTimestamp(),
            .source = .noop,
            .flags = 0,
            .phrase = "noop-ping",
        };
        out.push(entry);
        return 1;
    }
    fn resetImpl(ctx: *anyopaque) anyerror!void {
        const self: *NoopDriver = @ptrCast(@alignCast(ctx));
        self.drain_count = 0;
    }
    fn deinitImpl(ctx: *anyopaque) void {
        const self: *NoopDriver = @ptrCast(@alignCast(ctx));
        self.allocator.destroy(self);
    }
};
