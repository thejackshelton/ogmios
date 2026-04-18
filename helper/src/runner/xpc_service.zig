// ShokiRunner XPC dispatcher (Plan 08-01 scaffold).
//
// This module implements the server-side message dispatch for the frozen
// wire protocol defined in
// `helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift`:
//
//     ping()                                     -> { reply: "shoki-runner-pong" }
//     startAXObserver(voicePID, subscriberID)    -> { ok, errorCode, errorMessage? }
//     stopAXObserver(subscriberID)               -> { ok, errorCode, errorMessage? }
//
// Plan 01 scope: land the dispatch surface with AX handlers stubbed to
// success-noop. Plan 02 replaces the stubs with real AXObserver attach/detach
// and wires the production `dispatch` into an `xpc_connection_set_event_handler`
// block from a listener in `main.zig`.
//
// The module exposes TWO entry points:
//
//   * `dispatch`         — production path; reads and writes real
//                          `xpc.xpc_object_t` dictionaries.
//   * `dispatchForTest`  — test path; reads and writes `TestDict` — a pure-Zig,
//                          allocator-backed stand-in for an XPC dictionary.
//                          Used by `helper/test/xpc_service_test.zig` to run
//                          end-to-end without requiring a live XPC runtime.
//
// Test-only invariants are documented inline and enforced by the unit tests.

const std = @import("std");
// Imported as a named module (see helper/build.zig) so consumers that create
// their own xpc_service module can share the same xpc_bindings decls across
// module-subtree boundaries (Zig 0.16 rule).
const xpc = @import("xpc_bindings");

// ---------------------------------------------------------------------------
// Error codes (mirrors `helper/Sources/ShokiRunnerService/ShokiRunnerService.swift`)
// ---------------------------------------------------------------------------

/// XPC-protocol-level error codes. Kept in sync with the NSError codes used
/// by `ShokiRunnerService.swift` so a v1 Zig client speaking to a v0 Swift
/// helper (or vice versa) sees the same numeric codes during Plan 01/02
/// coexistence.
pub const ErrorCode = enum(i64) {
    ok = 0,
    /// Unknown method name — dispatcher fell through its lookup table.
    unknown_method = -2,
    /// Caller supplied an invalid or missing argument (e.g. voicePID <= 0).
    /// Matches `ShokiRunnerService.swift` line 59.
    invalid_arg = -11,
    /// AX observer already started before a matching `stopAXObserver` call.
    /// Matches `ShokiRunnerService.swift` line 36 (code -10). Currently
    /// unused by the stub but reserved so Plan 02 can emit it.
    already_started = -10,
    /// Internal/unexpected failure.
    internal = -1,
};

// ---------------------------------------------------------------------------
// TestDict — in-memory XPC-dictionary stand-in for unit tests
// ---------------------------------------------------------------------------

/// Subset of XPC-value shapes the helper traffics in today. Plan 02 may add
/// `array`, `data`, and `bool` variants; Plan 01 only needs `string` and
/// `int64` to cover the four methods in the wire protocol.
pub const DictVal = union(enum) {
    string: []const u8,
    int64: i64,
};

/// Test-only analogue of an XPC dictionary. Backed by `std.StringHashMap`;
/// keys and string values are copied on set so the dict fully owns them
/// once inserted (matches XPC's "insert retains" semantics).
///
/// NOTE: this type is exported publicly because the test file imports it
/// via `@import("../src/runner/xpc_service.zig")`. It is NOT used by the
/// production `dispatch` path. The naming (`TestDict`, `dispatchForTest`)
/// and the doc comments are a deliberate guardrail against threat T-08-02
/// (test double leaking into production).
pub const TestDict = struct {
    allocator: std.mem.Allocator,
    entries: std.StringHashMapUnmanaged(DictVal),
    /// Arena owning every copied string (both keys and string values) so
    /// `deinit` frees them with a single pass.
    arena: std.heap.ArenaAllocator,

    pub fn init(allocator: std.mem.Allocator) TestDict {
        return .{
            .allocator = allocator,
            .entries = .{},
            .arena = std.heap.ArenaAllocator.init(allocator),
        };
    }

    pub fn deinit(self: *TestDict) void {
        self.entries.deinit(self.allocator);
        self.arena.deinit();
    }

    pub fn setString(self: *TestDict, key: []const u8, value: []const u8) !void {
        const arena_alloc = self.arena.allocator();
        const owned_key = try arena_alloc.dupe(u8, key);
        const owned_val = try arena_alloc.dupe(u8, value);
        try self.entries.put(self.allocator, owned_key, .{ .string = owned_val });
    }

    pub fn setInt64(self: *TestDict, key: []const u8, value: i64) !void {
        const arena_alloc = self.arena.allocator();
        const owned_key = try arena_alloc.dupe(u8, key);
        try self.entries.put(self.allocator, owned_key, .{ .int64 = value });
    }

    pub fn getString(self: *const TestDict, key: []const u8) ?[]const u8 {
        const v = self.entries.get(key) orelse return null;
        return switch (v) {
            .string => |s| s,
            else => null,
        };
    }

    pub fn getInt64(self: *const TestDict, key: []const u8) ?i64 {
        const v = self.entries.get(key) orelse return null;
        return switch (v) {
            .int64 => |n| n,
            else => null,
        };
    }

    pub fn has(self: *const TestDict, key: []const u8) bool {
        return self.entries.contains(key);
    }
};

// ---------------------------------------------------------------------------
// Shared dispatch logic
// ---------------------------------------------------------------------------

/// Abstracts the "read an arg / write an arg" surface so the same dispatch
/// code can drive both `TestDict` and real XPC dictionaries in Plan 02.
/// Plan 01 only uses the TestDict path; the production `dispatch` function
/// below is a thin structural placeholder.
const Ops = struct {
    /// Returns the int64 field named `key`, or null if missing / wrong type.
    getInt64: *const fn (ctx: *anyopaque, key: []const u8) ?i64,
    /// Sets a string field. Returns an error only if the backing store runs
    /// out of memory.
    setString: *const fn (ctx: *anyopaque, key: []const u8, value: []const u8) anyerror!void,
    /// Sets an int64 field.
    setInt64: *const fn (ctx: *anyopaque, key: []const u8, value: i64) anyerror!void,
};

fn testDictGetInt64(ctx: *anyopaque, key: []const u8) ?i64 {
    const self: *const TestDict = @ptrCast(@alignCast(ctx));
    return self.getInt64(key);
}
fn testDictSetString(ctx: *anyopaque, key: []const u8, value: []const u8) anyerror!void {
    const self: *TestDict = @ptrCast(@alignCast(ctx));
    return self.setString(key, value);
}
fn testDictSetInt64(ctx: *anyopaque, key: []const u8, value: i64) anyerror!void {
    const self: *TestDict = @ptrCast(@alignCast(ctx));
    return self.setInt64(key, value);
}

const test_dict_ops: Ops = .{
    .getInt64 = testDictGetInt64,
    .setString = testDictSetString,
    .setInt64 = testDictSetInt64,
};

/// Core dispatch routine. `method` is the wire-format method name; `req_ctx`
/// and `resp_ctx` are opaque pointers through the `Ops` vtable.
fn dispatchCore(
    method: []const u8,
    req_ctx: *anyopaque,
    resp_ctx: *anyopaque,
    ops: Ops,
) anyerror!void {
    if (std.mem.eql(u8, method, "ping")) {
        try ops.setString(resp_ctx, "reply", "shoki-runner-pong");
        return;
    }

    if (std.mem.eql(u8, method, "startAXObserver")) {
        const voice_pid_opt = ops.getInt64(req_ctx, "voicePID");
        if (voice_pid_opt == null) {
            try ops.setInt64(resp_ctx, "ok", 0);
            try ops.setInt64(resp_ctx, "errorCode", @intFromEnum(ErrorCode.invalid_arg));
            try ops.setString(resp_ctx, "errorMessage", "missing voicePID");
            return;
        }
        const voice_pid = voice_pid_opt.?;
        if (voice_pid <= 0) {
            try ops.setInt64(resp_ctx, "ok", 0);
            try ops.setInt64(resp_ctx, "errorCode", @intFromEnum(ErrorCode.invalid_arg));
            try ops.setString(resp_ctx, "errorMessage", "invalid voicePID");
            return;
        }
        // Plan 01 stub: accept a well-formed PID without actually attaching
        // an AXObserver. Plan 02 calls into ax_observer.zig here.
        try ops.setInt64(resp_ctx, "ok", 1);
        try ops.setInt64(resp_ctx, "errorCode", @intFromEnum(ErrorCode.ok));
        return;
    }

    if (std.mem.eql(u8, method, "stopAXObserver")) {
        // Idempotent stub in Plan 01 — no session to tear down yet.
        try ops.setInt64(resp_ctx, "ok", 1);
        try ops.setInt64(resp_ctx, "errorCode", @intFromEnum(ErrorCode.ok));
        return;
    }

    // Unknown method — never panic; emit a structured error reply.
    try ops.setInt64(resp_ctx, "ok", 0);
    try ops.setInt64(resp_ctx, "errorCode", @intFromEnum(ErrorCode.unknown_method));
    try ops.setString(resp_ctx, "errorMessage", "unknown method");
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/// Test-only dispatcher. Drives the same `dispatchCore` as production but
/// reads from / writes to a `TestDict` instead of a live `xpc_object_t`.
///
/// Real XPC runtime is not required to exercise this function; call it
/// directly from Zig unit tests.
pub fn dispatchForTest(req: *TestDict, method: []const u8, resp: *TestDict) !void {
    try dispatchCore(method, @ptrCast(req), @ptrCast(resp), test_dict_ops);
}

// ---------------------------------------------------------------------------
// Production dispatch path
// ---------------------------------------------------------------------------
//
// Plan 01 wires only the structural shell: we can safely accept real XPC
// dictionaries, read the "_method" key, and delegate to `dispatchCore`.
// Plan 02 wires this into `xpc_connection_set_event_handler` and replaces
// the AX stubs with real attach/detach logic. The adapters below are tiny
// so Plan 02 only touches the AX observer wiring.

/// Read the method name out of the request dictionary. Convention:
/// the Zig client puts the method name at the `_method` key. Swift callers
/// will continue using NSXPCConnection's built-in routing until Plan 02
/// finalizes the transport.
fn xpcGetMethod(req: xpc.xpc_object_t) ?[]const u8 {
    const c_str = xpc.xpc_dictionary_get_string(req, "_method") orelse return null;
    return std.mem.span(c_str);
}

fn xpcGetInt64(ctx: *anyopaque, key: []const u8) ?i64 {
    const dict: xpc.xpc_object_t = @ptrCast(@alignCast(ctx));
    // XPC returns 0 on missing keys, so probe with `get_value` first.
    var buf: [128]u8 = undefined;
    if (key.len >= buf.len) return null;
    @memcpy(buf[0..key.len], key);
    buf[key.len] = 0;
    const ckey: [*:0]const u8 = @ptrCast(&buf);
    if (xpc.xpc_dictionary_get_value(dict, ckey) == null) return null;
    return xpc.xpc_dictionary_get_int64(dict, ckey);
}

fn xpcSetString(ctx: *anyopaque, key: []const u8, value: []const u8) anyerror!void {
    const dict: xpc.xpc_object_t = @ptrCast(@alignCast(ctx));
    var kbuf: [128]u8 = undefined;
    var vbuf: [512]u8 = undefined;
    if (key.len >= kbuf.len) return error.KeyTooLong;
    if (value.len >= vbuf.len) return error.ValueTooLong;
    @memcpy(kbuf[0..key.len], key);
    kbuf[key.len] = 0;
    @memcpy(vbuf[0..value.len], value);
    vbuf[value.len] = 0;
    xpc.xpc_dictionary_set_string(
        dict,
        @ptrCast(&kbuf),
        @ptrCast(&vbuf),
    );
}

fn xpcSetInt64(ctx: *anyopaque, key: []const u8, value: i64) anyerror!void {
    const dict: xpc.xpc_object_t = @ptrCast(@alignCast(ctx));
    var kbuf: [128]u8 = undefined;
    if (key.len >= kbuf.len) return error.KeyTooLong;
    @memcpy(kbuf[0..key.len], key);
    kbuf[key.len] = 0;
    xpc.xpc_dictionary_set_int64(dict, @ptrCast(&kbuf), value);
}

const xpc_ops: Ops = .{
    .getInt64 = xpcGetInt64,
    .setString = xpcSetString,
    .setInt64 = xpcSetInt64,
};

/// Production dispatcher. Reads `_method` out of `req`, dispatches, and
/// writes the response back into `resp`. The caller is responsible for
/// sending `resp` on the XPC connection.
///
/// Plan 01 does not route real XPC traffic through this yet (the listener
/// lands in Plan 02); it compiles and can be invoked, but the helper binary
/// produced by this plan does not start an xpc_main loop.
pub fn dispatch(req: xpc.xpc_object_t, resp: xpc.xpc_object_t) void {
    const method = xpcGetMethod(req) orelse {
        xpcSetInt64(@ptrCast(resp), "ok", 0) catch return;
        xpcSetInt64(@ptrCast(resp), "errorCode", @intFromEnum(ErrorCode.invalid_arg)) catch return;
        xpcSetString(@ptrCast(resp), "errorMessage", "missing _method") catch return;
        return;
    };
    dispatchCore(method, @ptrCast(req), @ptrCast(resp), xpc_ops) catch {
        // Any error in dispatch is converted to an "internal" error reply.
        xpcSetInt64(@ptrCast(resp), "ok", 0) catch return;
        xpcSetInt64(@ptrCast(resp), "errorCode", @intFromEnum(ErrorCode.internal)) catch return;
        xpcSetString(@ptrCast(resp), "errorMessage", "internal dispatch error") catch return;
        return;
    };
}

/// Re-export so consumers can `@import("xpc_service.zig").mach_service_name`
/// without also importing `xpc_bindings.zig`.
pub const mach_service_name = xpc.mach_service_name;
