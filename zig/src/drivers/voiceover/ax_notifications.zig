const std = @import("std");
const opts_mod = @import("../../core/options.zig");
const rb_mod = @import("../../core/ring_buffer.zig");
const sync_mod = @import("../../core/sync.zig");

pub const Entry = opts_mod.Entry;
pub const SourceTag = opts_mod.SourceTag;
pub const RingBuffer = rb_mod.RingBuffer;

/// Opaque handle owned by the Swift side (retained XPCClientSession pointer).
pub const XpcHandle = *anyopaque;

/// C ABI callback signature matching Swift's @convention(c) block in
/// ShokiXPCClient.swift's `receiveAXEvent` forwarder.
pub const EventCCallback = *const fn (
    phrase: [*:0]const u8,
    ts_nanos: u64,
    role: ?[*:0]const u8,
    name: ?[*:0]const u8,
    userdata: ?*anyopaque,
) callconv(.c) void;

// Real extern declarations — link against libShokiXPCClient.dylib (Plan 05 glue).
extern "c" fn shoki_xpc_connect() ?XpcHandle;
extern "c" fn shoki_xpc_set_event_callback(h: XpcHandle, cb: EventCCallback, userdata: ?*anyopaque) void;
extern "c" fn shoki_xpc_start_ax_observer(h: XpcHandle, pid: i32) i32;
extern "c" fn shoki_xpc_stop_ax_observer(h: XpcHandle) i32;
extern "c" fn shoki_xpc_disconnect(h: XpcHandle) void;

// ---------------------------------------------------------------------------
// XpcBackend — mockable abstraction over the C ABI. Tests inject a mock; Plan
// 05 wires the `realXpcBackend` (which forwards to the extern "c" functions).
// ---------------------------------------------------------------------------

pub const XpcBackend = struct {
    ctx: *anyopaque,
    vtable: *const VTable,

    pub const VTable = struct {
        connect: *const fn (ctx: *anyopaque) anyerror!XpcHandle,
        set_callback: *const fn (ctx: *anyopaque, h: XpcHandle, cb: EventCCallback, userdata: ?*anyopaque) void,
        start_observer: *const fn (ctx: *anyopaque, h: XpcHandle, pid: i32) anyerror!void,
        stop_observer: *const fn (ctx: *anyopaque, h: XpcHandle) void,
        disconnect: *const fn (ctx: *anyopaque, h: XpcHandle) void,
    };

    pub fn connect(self: XpcBackend) !XpcHandle {
        return self.vtable.connect(self.ctx);
    }
    pub fn setCallback(self: XpcBackend, h: XpcHandle, cb: EventCCallback, userdata: ?*anyopaque) void {
        self.vtable.set_callback(self.ctx, h, cb, userdata);
    }
    pub fn startObserver(self: XpcBackend, h: XpcHandle, pid: i32) !void {
        return self.vtable.start_observer(self.ctx, h, pid);
    }
    pub fn stopObserver(self: XpcBackend, h: XpcHandle) void {
        self.vtable.stop_observer(self.ctx, h);
    }
    pub fn disconnect(self: XpcBackend, h: XpcHandle) void {
        self.vtable.disconnect(self.ctx, h);
    }
};

// Real-backend wrappers that call the extern "c" symbols.
fn realConnect(_: *anyopaque) anyerror!XpcHandle {
    const h = shoki_xpc_connect() orelse return error.XpcConnectFailed;
    return h;
}
fn realSetCallback(_: *anyopaque, h: XpcHandle, cb: EventCCallback, userdata: ?*anyopaque) void {
    shoki_xpc_set_event_callback(h, cb, userdata);
}
fn realStartObserver(_: *anyopaque, h: XpcHandle, pid: i32) anyerror!void {
    const rc = shoki_xpc_start_ax_observer(h, pid);
    if (rc != 0) return error.XpcStartObserverFailed;
}
fn realStopObserver(_: *anyopaque, h: XpcHandle) void {
    _ = shoki_xpc_stop_ax_observer(h);
}
fn realDisconnect(_: *anyopaque, h: XpcHandle) void {
    shoki_xpc_disconnect(h);
}

const real_vtable: XpcBackend.VTable = .{
    .connect = realConnect,
    .set_callback = realSetCallback,
    .start_observer = realStartObserver,
    .stop_observer = realStopObserver,
    .disconnect = realDisconnect,
};

var real_ctx_sentinel: u8 = 0;
pub const realXpcBackend: XpcBackend = .{
    .ctx = @ptrCast(&real_ctx_sentinel),
    .vtable = &real_vtable,
};

// ---------------------------------------------------------------------------
// AxNotifications — composable module that owns the XpcHandle and funnels
// events into a ring buffer.
// ---------------------------------------------------------------------------

pub const AxNotifications = struct {
    allocator: std.mem.Allocator,
    ring: *RingBuffer,
    backend: XpcBackend,
    handle: ?XpcHandle = null,
    started: bool = false,
    mutex: sync_mod.Mutex = .init,

    pub fn init(allocator: std.mem.Allocator, ring: *RingBuffer, backend: XpcBackend) AxNotifications {
        return .{ .allocator = allocator, .ring = ring, .backend = backend };
    }

    /// Connect to the helper (if not already) and subscribe to AX events for
    /// `target_app_pid`.
    ///
    /// IMPORTANT (Phase 7 Plan 04): `target_app_pid` is the pid of the APP
    /// BEING OBSERVED (typically the Chromium renderer child process under
    /// vitest-browser-mode), NOT the VoiceOver process pid. The helper-side
    /// `AXObserverSession` now calls `AXUIElementCreateApplication(pid)` to
    /// scope the subscription so only the target app's AX events reach the
    /// callback — this is how shoki excludes Chrome URL-bar / tab-title noise
    /// from the capture log. See `resolveChromeRendererPid` in `driver.zig`
    /// and the `SHOKI_AX_TARGET_PID` env var override.
    pub fn start(self: *AxNotifications, target_app_pid: i32) !void {
        self.mutex.lock();
        defer self.mutex.unlock();
        if (self.started) return;

        const h = if (self.handle) |existing| existing else try self.backend.connect();
        if (self.handle == null) self.handle = h;

        self.backend.setCallback(h, cEventCallback, @ptrCast(self));
        try self.backend.startObserver(h, target_app_pid);
        self.started = true;
    }

    pub fn stop(self: *AxNotifications) void {
        self.mutex.lock();
        defer self.mutex.unlock();
        if (!self.started) return;
        if (self.handle) |h| self.backend.stopObserver(h);
        self.started = false;
    }

    pub fn deinit(self: *AxNotifications) void {
        self.mutex.lock();
        defer self.mutex.unlock();
        if (self.handle) |h| self.backend.disconnect(h);
        self.handle = null;
        self.started = false;
    }

    /// C callback invoked by the Swift shim on each AX event. Dupes the
    /// C strings (which are only valid for the duration of this call) and
    /// pushes an Entry into the ring buffer.
    ///
    /// CRITICAL: Swift's `withCString` makes the pointers invalid as soon
    /// as this function returns. We MUST dupe before doing anything async.
    fn cEventCallback(
        phrase: [*:0]const u8,
        ts_nanos: u64,
        role: ?[*:0]const u8,
        name: ?[*:0]const u8,
        userdata: ?*anyopaque,
    ) callconv(.c) void {
        const self: *AxNotifications = @ptrCast(@alignCast(userdata.?));
        const phrase_slice = std.mem.span(phrase);
        const role_slice: ?[]const u8 = if (role) |r| std.mem.span(r) else null;
        const name_slice: ?[]const u8 = if (name) |n| std.mem.span(n) else null;

        const phrase_dup = self.allocator.dupe(u8, phrase_slice) catch return;
        const role_dup: ?[]const u8 = if (role_slice) |rs|
            (self.allocator.dupe(u8, rs) catch null)
        else
            null;
        const name_dup: ?[]const u8 = if (name_slice) |ns|
            (self.allocator.dupe(u8, ns) catch null)
        else
            null;

        const entry = Entry{
            .ts_nanos = ts_nanos,
            .source = SourceTag.ax,
            .flags = 0,
            .phrase = phrase_dup,
            .role = role_dup,
            .name = name_dup,
        };
        self.ring.push(entry);
    }

    /// Test-only: invoke the c-callback path directly. Simulates an AX event
    /// arrival without requiring a real XPC connection or live VoiceOver.
    pub fn debugFireEvent(
        self: *AxNotifications,
        phrase: [*:0]const u8,
        ts_nanos: u64,
        role: ?[*:0]const u8,
        name: ?[*:0]const u8,
    ) void {
        cEventCallback(phrase, ts_nanos, role, name, @ptrCast(self));
    }
};
