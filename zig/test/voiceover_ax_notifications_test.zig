const std = @import("std");
const ax = @import("../src/drivers/voiceover/ax_notifications.zig");
const rb_mod = @import("../src/core/ring_buffer.zig");
const opts_mod = @import("../src/core/options.zig");

// ---------------------------------------------------------------------------
// MockXpcBackend — records every call, optionally rejects start, and stores
// the callback so tests can invoke it directly.
// ---------------------------------------------------------------------------

const MockXpcBackend = struct {
    allocator: std.mem.Allocator,
    connect_calls: usize = 0,
    set_callback_calls: usize = 0,
    start_observer_calls: usize = 0,
    stop_observer_calls: usize = 0,
    disconnect_calls: usize = 0,
    last_pid: i32 = 0,
    /// A sentinel handle returned by connect(); tests compare identity.
    handle_sentinel: u8 = 42,
    /// Captured callback + userdata from set_callback.
    captured_cb: ?ax.EventCCallback = null,
    captured_userdata: ?*anyopaque = null,
    /// If true, connect returns error.
    fail_connect: bool = false,
    /// If true, start_observer returns error.
    fail_start: bool = false,

    fn init(allocator: std.mem.Allocator) MockXpcBackend {
        return .{ .allocator = allocator };
    }

    fn asBackend(self: *MockXpcBackend) ax.XpcBackend {
        return .{ .ctx = @ptrCast(self), .vtable = &vtable };
    }

    const vtable: ax.XpcBackend.VTable = .{
        .connect = connectImpl,
        .set_callback = setCallbackImpl,
        .start_observer = startObserverImpl,
        .stop_observer = stopObserverImpl,
        .disconnect = disconnectImpl,
    };

    fn connectImpl(ctx: *anyopaque) anyerror!ax.XpcHandle {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.connect_calls += 1;
        if (self.fail_connect) return error.MockConnectFailed;
        return @ptrCast(&self.handle_sentinel);
    }
    fn setCallbackImpl(ctx: *anyopaque, _: ax.XpcHandle, cb: ax.EventCCallback, userdata: ?*anyopaque) void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.set_callback_calls += 1;
        self.captured_cb = cb;
        self.captured_userdata = userdata;
    }
    fn startObserverImpl(ctx: *anyopaque, _: ax.XpcHandle, pid: i32) anyerror!void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.start_observer_calls += 1;
        self.last_pid = pid;
        if (self.fail_start) return error.MockStartFailed;
    }
    fn stopObserverImpl(ctx: *anyopaque, _: ax.XpcHandle) void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.stop_observer_calls += 1;
    }
    fn disconnectImpl(ctx: *anyopaque, _: ax.XpcHandle) void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.disconnect_calls += 1;
    }
};

/// Drain and free a ring buffer's current contents — tests allocate the phrase
/// via allocator.dupe in cEventCallback and must free it.
fn drainAndFree(allocator: std.mem.Allocator, ring: *rb_mod.RingBuffer) !void {
    var buf: [1]opts_mod.Entry = undefined;
    while (ring.drain(&buf) > 0) {
        allocator.free(buf[0].phrase);
        if (buf[0].role) |r| allocator.free(r);
        if (buf[0].name) |n| allocator.free(n);
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test "AxNotifications.start wires connect + set_callback + start_observer in order" {
    const allocator = std.testing.allocator;
    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var backend = MockXpcBackend.init(allocator);
    var axn = ax.AxNotifications.init(allocator, &ring, backend.asBackend());
    defer axn.deinit();

    try axn.start(12345);

    try std.testing.expectEqual(@as(usize, 1), backend.connect_calls);
    try std.testing.expectEqual(@as(usize, 1), backend.set_callback_calls);
    try std.testing.expectEqual(@as(usize, 1), backend.start_observer_calls);
    try std.testing.expectEqual(@as(i32, 12345), backend.last_pid);
    try std.testing.expect(backend.captured_cb != null);
    try std.testing.expect(backend.captured_userdata != null);
    try std.testing.expect(axn.started);
}

test "AxNotifications pushes Entry with source=.ax on debugFireEvent" {
    const allocator = std.testing.allocator;
    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var backend = MockXpcBackend.init(allocator);
    var axn = ax.AxNotifications.init(allocator, &ring, backend.asBackend());
    defer axn.deinit();
    defer drainAndFree(allocator, &ring) catch {};

    try axn.start(1);

    axn.debugFireEvent("live region update", 999_000_000, null, "Toast");

    try std.testing.expectEqual(@as(usize, 1), ring.len);
    var out: [1]opts_mod.Entry = undefined;
    _ = ring.drain(&out);
    defer allocator.free(out[0].phrase);
    defer if (out[0].name) |n| allocator.free(n);

    try std.testing.expectEqualStrings("live region update", out[0].phrase);
    try std.testing.expectEqual(opts_mod.SourceTag.ax, out[0].source);
    try std.testing.expectEqual(@as(u64, 999_000_000), out[0].ts_nanos);
    try std.testing.expect(out[0].role == null);
    try std.testing.expect(out[0].name != null);
    try std.testing.expectEqualStrings("Toast", out[0].name.?);
}

test "AxNotifications.stop calls backend.stop_observer; double-stop is a no-op" {
    const allocator = std.testing.allocator;
    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var backend = MockXpcBackend.init(allocator);
    var axn = ax.AxNotifications.init(allocator, &ring, backend.asBackend());
    defer axn.deinit();

    try axn.start(1);
    axn.stop();
    try std.testing.expectEqual(@as(usize, 1), backend.stop_observer_calls);

    // Second stop is a no-op (guarded by `started` flag).
    axn.stop();
    try std.testing.expectEqual(@as(usize, 1), backend.stop_observer_calls);
}

test "AxNotifications.deinit calls backend.disconnect" {
    const allocator = std.testing.allocator;
    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var backend = MockXpcBackend.init(allocator);
    var axn = ax.AxNotifications.init(allocator, &ring, backend.asBackend());

    try axn.start(1);
    axn.deinit();

    try std.testing.expectEqual(@as(usize, 1), backend.disconnect_calls);
}

test "AxNotifications.start propagates backend errors" {
    const allocator = std.testing.allocator;
    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var backend = MockXpcBackend.init(allocator);
    backend.fail_connect = true;
    var axn = ax.AxNotifications.init(allocator, &ring, backend.asBackend());
    defer axn.deinit();

    const result = axn.start(1);
    try std.testing.expectError(error.MockConnectFailed, result);
    try std.testing.expect(!axn.started);
}

test "AxNotifications.debugFireEvent with role and name dupes both strings" {
    const allocator = std.testing.allocator;
    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var backend = MockXpcBackend.init(allocator);
    var axn = ax.AxNotifications.init(allocator, &ring, backend.asBackend());
    defer axn.deinit();
    defer drainAndFree(allocator, &ring) catch {};

    try axn.start(1);
    axn.debugFireEvent("click", 1, "button", "Submit");

    try std.testing.expectEqual(@as(usize, 1), ring.len);
    var out: [1]opts_mod.Entry = undefined;
    _ = ring.drain(&out);
    defer allocator.free(out[0].phrase);
    defer if (out[0].role) |r| allocator.free(r);
    defer if (out[0].name) |n| allocator.free(n);

    try std.testing.expectEqualStrings("button", out[0].role.?);
    try std.testing.expectEqualStrings("Submit", out[0].name.?);
}
