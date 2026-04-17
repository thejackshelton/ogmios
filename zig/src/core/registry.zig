const std = @import("std");
const driver_mod = @import("driver.zig");
const noop_mod = @import("../drivers/noop/driver.zig");

/// Comptime driver registry per CONTEXT.md Driver Interface D-12.
/// Adding a driver: (1) drop a new file at src/drivers/<name>/driver.zig,
/// (2) add one entry below. No core edits.
pub const RegisteredDriver = struct {
    name: []const u8,
    platform: driver_mod.DriverPlatform,
    create: *const fn (allocator: std.mem.Allocator) anyerror!driver_mod.DriverHandle,
};

fn makeNoop(allocator: std.mem.Allocator) anyerror!driver_mod.DriverHandle {
    const instance = try noop_mod.NoopDriver.create(allocator);
    const vt_slot = try allocator.create(driver_mod.ShokiDriver);
    vt_slot.* = noop_mod.NoopDriver.vtable();
    return .{ .ctx = @ptrCast(instance), .vtable = vt_slot };
}

pub const drivers = [_]RegisteredDriver{
    .{ .name = "noop", .platform = .any, .create = makeNoop },
    // .{ .name = "voiceover", .platform = .darwin, .create = makeVoiceOver }, // Phase 3
};

pub fn findByName(name: []const u8) ?RegisteredDriver {
    for (drivers) |d| {
        if (std.mem.eql(u8, d.name, name)) return d;
    }
    return null;
}
