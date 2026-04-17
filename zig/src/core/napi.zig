const std = @import("std");
const napi = @import("napi_zig").napi;
const registry = @import("registry.zig");
const driver_mod = @import("driver.zig");
const rb_mod = @import("ring_buffer.zig");
const opts_mod = @import("options.zig");
const wire = @import("wire.zig");

// Global allocator for the addon. napi-zig owns the Node runtime; we own memory
// for driver instances and ring buffers behind opaque numeric handles returned to JS.
var gpa: std.heap.DebugAllocator(.{}) = .init;
fn allocator() std.mem.Allocator {
    return gpa.allocator();
}

pub const SHOKI_VERSION: []const u8 = "0.0.0";

// --- Trivial surface ---

pub fn ping(env: napi.Env) !napi.Val {
    _ = env;
    return napi.Val.fromString("pong");
}

pub fn version(env: napi.Env) !napi.Val {
    _ = env;
    return napi.Val.fromString(SHOKI_VERSION);
}

pub fn wireVersion(env: napi.Env) !napi.Val {
    _ = env;
    return napi.Val.fromU32(wire.WIRE_VERSION);
}

// --- Driver surface ---
// JS holds one numeric handle per driver. Pointers never cross N-API.

const DriverSlot = struct {
    handle: driver_mod.DriverHandle,
    ring: rb_mod.RingBuffer,
};

var next_id: u64 = 1;
var slots: std.AutoHashMap(u64, *DriverSlot) = undefined;
var slots_initialized: bool = false;

fn ensureSlots() !void {
    if (!slots_initialized) {
        slots = std.AutoHashMap(u64, *DriverSlot).init(allocator());
        slots_initialized = true;
    }
}

/// createDriver(name: string, log_buffer_size: number) -> number (handle id)
pub fn createDriver(env: napi.Env, name: []const u8, log_buffer_size: u32) !napi.Val {
    _ = env;
    try ensureSlots();

    const entry = registry.findByName(name) orelse return error.DriverNotFound;
    const handle = try entry.create(allocator());
    const ring = try rb_mod.RingBuffer.init(allocator(), log_buffer_size);

    const slot = try allocator().create(DriverSlot);
    slot.* = .{ .handle = handle, .ring = ring };

    try handle.vtable.init(handle.ctx, .{
        .allocator = allocator(),
        .log_buffer_size = log_buffer_size,
    });

    const id = next_id;
    next_id += 1;
    try slots.put(id, slot);

    return napi.Val.fromU64(id);
}

fn getSlot(id: u64) !*DriverSlot {
    const slot = slots.get(id) orelse return error.InvalidDriverHandle;
    return slot;
}

pub fn driverStart(env: napi.Env, id: u64) !napi.Val {
    _ = env;
    const slot = try getSlot(id);
    try slot.handle.vtable.start(slot.handle.ctx);
    return napi.Val.fromBool(true);
}

pub fn driverStop(env: napi.Env, id: u64) !napi.Val {
    _ = env;
    const slot = try getSlot(id);
    try slot.handle.vtable.stop(slot.handle.ctx);
    return napi.Val.fromBool(true);
}

pub fn driverReset(env: napi.Env, id: u64) !napi.Val {
    _ = env;
    const slot = try getSlot(id);
    try slot.handle.vtable.reset(slot.handle.ctx);
    slot.ring.clear();
    return napi.Val.fromBool(true);
}

/// driverDrain(id) -> Buffer (wire-format encoded entries accumulated since last drain)
pub fn driverDrain(env: napi.Env, id: u64) !napi.Val {
    const slot = try getSlot(id);
    _ = try slot.handle.vtable.drain(slot.handle.ctx, &slot.ring);

    const n = slot.ring.len;
    const entries = try allocator().alloc(opts_mod.Entry, n);
    defer allocator().free(entries);

    _ = slot.ring.drain(entries);

    const size = wire.encodedSize(entries);
    const buf = try allocator().alloc(u8, size);
    defer allocator().free(buf);
    _ = try wire.encode(entries, buf);

    return napi.Val.fromBuffer(env, buf);
}

pub fn driverDeinit(env: napi.Env, id: u64) !napi.Val {
    _ = env;
    const slot = try getSlot(id);
    slot.handle.vtable.deinit(slot.handle.ctx);
    allocator().destroy(@constCast(slot.handle.vtable));
    slot.ring.deinit();
    allocator().destroy(slot);
    _ = slots.remove(id);
    return napi.Val.fromBool(true);
}

/// droppedCount(id) -> u64
pub fn droppedCount(env: napi.Env, id: u64) !napi.Val {
    _ = env;
    const slot = try getSlot(id);
    return napi.Val.fromU64(slot.ring.droppedCount);
}

comptime {
    napi.module(@This());
}
