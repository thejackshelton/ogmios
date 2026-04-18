// In-process unit tests for the Plan 08-02 Task 1 AX observer port.
//
// These tests exercise the Zig-port of `AXObserverSession.swift`. They run
// ENTIRELY without invoking the AX C API — `start()` is the only code path
// that touches `AXObserverCreateWithInfoCallback` / friends, and that call is
// guarded by `invalidate-pid` / `already-started` predicates so we can test
// both guard behaviors without AX TCC grants.
//
// Plan mapping (08-02-PLAN.md § "Test list"):
//   1. init + isStarted() returns false
//   2. debugEmit forwards (phrase, ts, role, name) to the callback
//   3. stop() before start() is a no-op (AXObserver.swift:111)
//   4. start(0) returns error.InvalidPid without touching the AX C API
//   5. start(pid) is idempotent (second call is a no-op — AXObserver.swift:58)
//
// Test 5 uses a small hook on Session that lets the test observe how many
// times the "attach to AX" path ran without actually invoking AXObserverCreate.
// The hook is documented + test-only and mirrors the `dispatchForTest` /
// `dispatch` split already in xpc_service.zig.

const std = @import("std");
const testing = std.testing;
const ax = @import("../src/runner/ax_observer.zig");

// Shared context for capturing callback arguments across tests.
const Capture = struct {
    called: u32 = 0,
    last_phrase: [128]u8 = undefined,
    last_phrase_len: usize = 0,
    last_ts: u64 = 0,
    last_has_role: bool = false,
    last_role: [64]u8 = undefined,
    last_role_len: usize = 0,
    last_has_name: bool = false,
    last_name: [64]u8 = undefined,
    last_name_len: usize = 0,
};

fn captureCallback(
    phrase: []const u8,
    ts_nanos: u64,
    role: ?[]const u8,
    name: ?[]const u8,
    ctx: *anyopaque,
) void {
    const cap: *Capture = @ptrCast(@alignCast(ctx));
    cap.called += 1;
    cap.last_ts = ts_nanos;
    std.mem.copyForwards(u8, cap.last_phrase[0..phrase.len], phrase);
    cap.last_phrase_len = phrase.len;
    if (role) |r| {
        cap.last_has_role = true;
        std.mem.copyForwards(u8, cap.last_role[0..r.len], r);
        cap.last_role_len = r.len;
    } else {
        cap.last_has_role = false;
        cap.last_role_len = 0;
    }
    if (name) |n| {
        cap.last_has_name = true;
        std.mem.copyForwards(u8, cap.last_name[0..n.len], n);
        cap.last_name_len = n.len;
    } else {
        cap.last_has_name = false;
        cap.last_name_len = 0;
    }
}

test "Session.init returns a session with isStarted=false and does not panic" {
    var cap: Capture = .{};
    var session = ax.Session.init(captureCallback, @ptrCast(&cap));
    try testing.expectEqual(false, session.isStarted());
}

test "debugEmit forwards phrase/ts/role/name to the callback exactly" {
    var cap: Capture = .{};
    var session = ax.Session.init(captureCallback, @ptrCast(&cap));

    session.debugEmit("Hello", 1_700_000_000_000_000_000, null, "button");

    try testing.expectEqual(@as(u32, 1), cap.called);
    try testing.expectEqualStrings("Hello", cap.last_phrase[0..cap.last_phrase_len]);
    try testing.expectEqual(@as(u64, 1_700_000_000_000_000_000), cap.last_ts);
    try testing.expectEqual(false, cap.last_has_role);
    try testing.expectEqual(true, cap.last_has_name);
    try testing.expectEqualStrings("button", cap.last_name[0..cap.last_name_len]);
}

test "stop() before start() is a no-op (mirrors AXObserver.swift:111)" {
    var cap: Capture = .{};
    var session = ax.Session.init(captureCallback, @ptrCast(&cap));
    // Must not panic, must not touch any AX state.
    session.stop();
    try testing.expectEqual(false, session.isStarted());
    try testing.expectEqual(@as(u32, 0), cap.called);
}

test "start(target_pid=0) returns error.InvalidPid without invoking AX" {
    var cap: Capture = .{};
    var session = ax.Session.init(captureCallback, @ptrCast(&cap));
    // Route through the test hook so a failure to guard surfaces as an
    // AttachedInTest flag flip.
    session.test_hook_attach_count = 0;
    session.test_hook_enabled = true;

    try testing.expectError(ax.AxError.InvalidPid, session.start(0));
    try testing.expectEqual(false, session.isStarted());
    try testing.expectEqual(@as(u32, 0), session.test_hook_attach_count);
}

test "start(pid) twice is idempotent (second call no-op, AXObserver.swift:58)" {
    var cap: Capture = .{};
    var session = ax.Session.init(captureCallback, @ptrCast(&cap));
    // Stub mode — `start` must use the test hook instead of the real AX API
    // so this test doesn't need TCC grants.
    session.test_hook_enabled = true;
    session.test_hook_attach_count = 0;

    try session.start(12345);
    try testing.expectEqual(true, session.isStarted());
    try testing.expectEqual(@as(u32, 1), session.test_hook_attach_count);

    // Second start must return immediately without re-attaching.
    try session.start(12345);
    try testing.expectEqual(true, session.isStarted());
    try testing.expectEqual(@as(u32, 1), session.test_hook_attach_count);

    // stop() should flip started back to false and let us see it's gone.
    session.stop();
    try testing.expectEqual(false, session.isStarted());
}
