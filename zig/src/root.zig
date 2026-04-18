// Root entry point for the shoki shared library.
//
// Declaring the root at `src/root.zig` (rather than `src/core/napi.zig`)
// makes `src/` the module root directory so imports like `core/registry.zig`
// that reference `../drivers/...` work under Zig 0.16's stricter module path
// enforcement.
//
// This file uses napi-zig 0.1.0's Standard Mode bridge: functions declared
// here with `(env: napi.Env, ...args) -> !napi.Val` or plain zig types are
// auto-converted to N-API callbacks by `napi.module(@This())`. For raw control
// (Buffer creation), the function takes an Env and manually builds the Val.

const std = @import("std");
const napi = @import("napi_zig");
const registry = @import("core/registry.zig");
const driver_mod = @import("core/driver.zig");
const rb_mod = @import("core/ring_buffer.zig");
const opts_mod = @import("core/options.zig");
const wire = @import("core/wire.zig");

// Global allocator for the addon. napi-zig owns the Node runtime; we own memory
// for driver instances and ring buffers behind opaque numeric handles returned to JS.
var gpa: std.heap.DebugAllocator(.{}) = .init;
fn allocator() std.mem.Allocator {
    return gpa.allocator();
}

pub const SHOKI_VERSION: []const u8 = "0.0.0";

// --- Trivial surface ---
// Standard Mode: napi-zig auto-converts `[]const u8` to JS string and `u32` to Number.

pub fn ping() []const u8 {
    return "pong";
}

pub fn version() []const u8 {
    return SHOKI_VERSION;
}

pub fn wireVersion() u32 {
    return wire.WIRE_VERSION;
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

/// createDriver(name: string, log_buffer_size: number) -> bigint (handle id)
pub fn createDriver(name: []const u8, log_buffer_size: u32) !u64 {
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

    return id;
}

fn getSlot(id: u64) !*DriverSlot {
    const slot = slots.get(id) orelse return error.InvalidDriverHandle;
    return slot;
}

pub fn driverStart(id: u64) !bool {
    const slot = try getSlot(id);
    try slot.handle.vtable.start(slot.handle.ctx);
    return true;
}

pub fn driverStop(id: u64) !bool {
    const slot = try getSlot(id);
    try slot.handle.vtable.stop(slot.handle.ctx);
    return true;
}

pub fn driverReset(id: u64) !bool {
    const slot = try getSlot(id);
    try slot.handle.vtable.reset(slot.handle.ctx);
    slot.ring.clear();
    return true;
}

/// driverDrain(id) -> Buffer (wire-format encoded entries accumulated since last drain)
/// Raw mode: takes the Env directly because we need to allocate a Node.js Buffer.
pub fn driverDrain(env: napi.Env, id: u64) !napi.Val {
    const slot = try getSlot(id);
    _ = try slot.handle.vtable.drain(slot.handle.ctx, &slot.ring);

    const n = slot.ring.len;
    const entries = try allocator().alloc(opts_mod.Entry, n);
    defer allocator().free(entries);

    _ = slot.ring.drain(entries);

    const size = wire.encodedSize(entries);
    const result = try env.createBuffer(size);
    _ = try wire.encode(entries, result.data);
    return result.val;
}

pub fn driverDeinit(id: u64) !bool {
    const slot = try getSlot(id);
    slot.handle.vtable.deinit(slot.handle.ctx);
    allocator().destroy(@constCast(slot.handle.vtable));
    slot.ring.deinit();
    allocator().destroy(slot);
    _ = slots.remove(id);
    return true;
}

/// droppedCount(id) -> bigint
pub fn droppedCount(id: u64) !u64 {
    const slot = try getSlot(id);
    return slot.ring.droppedCount;
}

comptime {
    napi.module(@This());
}
