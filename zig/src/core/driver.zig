const std = @import("std");
const opts_mod = @import("options.zig");
const rb_mod = @import("ring_buffer.zig");

pub const DriverPlatform = opts_mod.DriverPlatform;
pub const InitOptions = opts_mod.InitOptions;
pub const RingBuffer = rb_mod.RingBuffer;

/// Frozen vtable per CONTEXT.md Driver Interface D-10.
/// DO NOT extend without a wire-format version bump. EXT-01 depends on stability.
pub const ShokiDriver = struct {
    init: *const fn (ctx: *anyopaque, opts: InitOptions) anyerror!void,
    start: *const fn (ctx: *anyopaque) anyerror!void,
    stop: *const fn (ctx: *anyopaque) anyerror!void,
    drain: *const fn (ctx: *anyopaque, out: *RingBuffer) anyerror!usize,
    reset: *const fn (ctx: *anyopaque) anyerror!void,
    deinit: *const fn (ctx: *anyopaque) void,
    name: []const u8,
    platform: DriverPlatform,
};

pub const DriverHandle = struct {
    ctx: *anyopaque,
    vtable: *const ShokiDriver,
};
