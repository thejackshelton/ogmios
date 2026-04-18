// In-process unit tests for the Plan 08-01 XPC dispatcher. These exercise
// `dispatchForTest` — the pure-Zig path that uses `TestDict` instead of a
// real `xpc_object_t`. Plan 02 adds a second test file that exercises the
// production `dispatch` against an actual XPC connection.
//
// Test list (matches 08-01-PLAN.md `<behavior>` block):
//   1. ping returns "shoki-runner-pong"
//   2. startAXObserver({voicePID=-1}) returns invalid_arg
//   3. startAXObserver({voicePID=12345}) returns ok=1
//   4. stopAXObserver({subscriberID="s1"}) returns ok=1 unconditionally
//   5. dispatch("unknownMethod", …) returns ok=0, errorCode=unknown_method
//   6. mach_service_name constant equals "org.shoki.runner"

const std = @import("std");
const testing = std.testing;
const svc = @import("../src/runner/xpc_service.zig");

test "ping handler returns shoki-runner-pong" {
    const allocator = testing.allocator;
    var req = svc.TestDict.init(allocator);
    defer req.deinit();
    var resp = svc.TestDict.init(allocator);
    defer resp.deinit();

    try svc.dispatchForTest(&req, "ping", &resp);

    const reply = resp.getString("reply") orelse return error.MissingReplyField;
    try testing.expectEqualStrings("shoki-runner-pong", reply);
}

test "startAXObserver rejects negative voicePID with invalid_arg" {
    const allocator = testing.allocator;
    var req = svc.TestDict.init(allocator);
    defer req.deinit();
    try req.setInt64("voicePID", -1);
    try req.setString("subscriberID", "s1");

    var resp = svc.TestDict.init(allocator);
    defer resp.deinit();

    try svc.dispatchForTest(&req, "startAXObserver", &resp);

    try testing.expectEqual(@as(i64, 0), resp.getInt64("ok").?);
    try testing.expectEqual(
        @as(i64, @intFromEnum(svc.ErrorCode.invalid_arg)),
        resp.getInt64("errorCode").?,
    );
    const err_msg = resp.getString("errorMessage") orelse return error.MissingErrorMessage;
    try testing.expect(err_msg.len > 0);
}

test "startAXObserver accepts valid voicePID and returns ok=1" {
    const allocator = testing.allocator;
    var req = svc.TestDict.init(allocator);
    defer req.deinit();
    try req.setInt64("voicePID", 12345);
    try req.setString("subscriberID", "s1");

    var resp = svc.TestDict.init(allocator);
    defer resp.deinit();

    try svc.dispatchForTest(&req, "startAXObserver", &resp);

    try testing.expectEqual(@as(i64, 1), resp.getInt64("ok").?);
    try testing.expectEqual(
        @as(i64, @intFromEnum(svc.ErrorCode.ok)),
        resp.getInt64("errorCode").?,
    );
}

test "stopAXObserver returns ok=1 unconditionally (Plan 01 stub)" {
    const allocator = testing.allocator;
    var req = svc.TestDict.init(allocator);
    defer req.deinit();
    try req.setString("subscriberID", "s1");

    var resp = svc.TestDict.init(allocator);
    defer resp.deinit();

    try svc.dispatchForTest(&req, "stopAXObserver", &resp);

    try testing.expectEqual(@as(i64, 1), resp.getInt64("ok").?);
    try testing.expectEqual(
        @as(i64, @intFromEnum(svc.ErrorCode.ok)),
        resp.getInt64("errorCode").?,
    );
}

test "unknown method returns ok=0 with errorCode=unknown_method" {
    const allocator = testing.allocator;
    var req = svc.TestDict.init(allocator);
    defer req.deinit();
    var resp = svc.TestDict.init(allocator);
    defer resp.deinit();

    try svc.dispatchForTest(&req, "bogusMethodName", &resp);

    try testing.expectEqual(@as(i64, 0), resp.getInt64("ok").?);
    try testing.expectEqual(
        @as(i64, @intFromEnum(svc.ErrorCode.unknown_method)),
        resp.getInt64("errorCode").?,
    );
    const err_msg = resp.getString("errorMessage") orelse return error.MissingErrorMessage;
    try testing.expect(err_msg.len > 0);
}

test "mach_service_name is the frozen wire constant org.shoki.runner" {
    const c_name: [*:0]const u8 = svc.mach_service_name;
    const name_slice = std.mem.span(c_name);
    try testing.expectEqualStrings("org.shoki.runner", name_slice);
}
