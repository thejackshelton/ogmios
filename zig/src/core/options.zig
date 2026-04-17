const std = @import("std");

pub const DriverPlatform = enum {
    darwin,
    windows,
    linux,
    any,
};

pub const SourceTag = enum(u8) {
    applescript = 0,
    ax = 1,
    caption = 2,
    commander = 3,
    noop = 255,
};

pub const InitOptions = struct {
    allocator: std.mem.Allocator,
    speech_rate: u32 = 90,
    mute: bool = true,
    take_over_existing: bool = false,
    timeout_ms: u32 = 5000,
    log_buffer_size: u32 = 10_000,
};

pub const Entry = struct {
    ts_nanos: u64,
    source: SourceTag,
    flags: u8,
    phrase: []const u8,
    role: ?[]const u8 = null,
    name: ?[]const u8 = null,
};
