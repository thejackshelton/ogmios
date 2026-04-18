// Zig port of `helper/Sources/MunadiXPCClient/MunadiXPCClient.swift` — the
// C-callable shim that Zig core (`zig/src/drivers/voiceover/ax_notifications.zig`)
// dynamically links against.
//
// ## Symbol surface (frozen)
//
// The Zig core imports these symbols via `extern "c"`:
//
//     munadi_xpc_connect()                           -> ?*anyopaque
//     munadi_xpc_set_event_callback(h, cb, userdata) -> void
//     munadi_xpc_start_ax_observer(h, pid)           -> i32
//     munadi_xpc_stop_ax_observer(h)                 -> i32
//     munadi_xpc_disconnect(h)                       -> void
//
// These names MUST match the Swift originals byte-for-byte, because zig-core
// has already been compiled against the Swift-built dylib. Any rename breaks
// the linker on the next consumer build.
//
// The handle returned by `munadi_xpc_connect` is opaque to callers — we use it
// to index into a process-global table of `Session` structs. The Swift
// implementation returned a retained Objective-C pointer; the Zig version
// returns a *Session pointer but the semantics (opaque handle → AX events
// forwarded to a C callback) are identical.
//
// ## Plan 02 scope
//
// Plan 02 lands the symbol-surface replacement — the dylib compiles, exports
// the correct symbols, and the Zig core linker resolves them. Actual XPC
// message routing (sending `startAXObserver` to the helper, receiving
// `receiveAXEvent` callbacks) is Plan 04's wave. For now:
//
//   * `munadi_xpc_connect`      → creates a Session, opens a Mach-service
//                                 connection to org.munadi.runner, returns
//                                 the Session pointer.
//   * `munadi_xpc_set_event_callback` → stores the C function pointer.
//   * `munadi_xpc_start_ax_observer`  → sends a `startAXObserver` XPC message.
//   * `munadi_xpc_stop_ax_observer`   → sends a `stopAXObserver` XPC message.
//   * `munadi_xpc_disconnect`         → cancels the connection and frees the
//                                       Session.

const std = @import("std");
const xpc = @import("xpc_bindings");

/// Opaque handle — must match the shape zig-core's `XpcHandle = *anyopaque`.
pub const XpcHandle = *anyopaque;

/// C-ABI callback the client invokes for each AX event received from the
/// helper. Signature matches `zig/src/drivers/voiceover/ax_notifications.zig`
/// `EventCCallback`.
pub const EventCCallback = *const fn (
    phrase: [*:0]const u8,
    ts_nanos: u64,
    role: ?[*:0]const u8,
    name: ?[*:0]const u8,
    userdata: ?*anyopaque,
) callconv(.c) void;

/// Per-connection state. Leaked on `munadi_xpc_disconnect` via std.heap.c_allocator.
const Session = struct {
    connection: ?xpc.xpc_connection_t = null,
    callback: ?EventCCallback = null,
    userdata: ?*anyopaque = null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn allocSession() ?*Session {
    const mem = std.heap.c_allocator.create(Session) catch return null;
    mem.* = .{};
    return mem;
}

fn releaseSession(s: *Session) void {
    if (s.connection) |c| xpc.xpc_connection_cancel(c);
    std.heap.c_allocator.destroy(s);
}

// ---------------------------------------------------------------------------
// Exported C symbols
// ---------------------------------------------------------------------------

/// Open an XPC connection to the helper and return an opaque handle. Returns
/// null on allocation failure.
///
/// Production semantics MATCH Swift's `munadi_xpc_connect`:
///  - creates NSXPCConnection against `org.munadi.runner`
///  - exports this side as the "client" (receives receiveAXEvent callbacks)
///  - returns a retained handle
export fn munadi_xpc_connect() ?XpcHandle {
    const session = allocSession() orelse return null;
    const conn = xpc.xpc_connection_create_mach_service(
        xpc.mach_service_name,
        null,
        0, // no listener flag — this is a regular client
    );
    xpc.xpc_connection_set_event_handler(conn, onClientEvent);
    xpc.xpc_connection_resume(conn);
    session.connection = conn;
    return @ptrCast(session);
}

/// Install the C callback that receives AX events. Plan 02 only stores the
/// pointer; Plan 04's XPC message routing uses it when the helper pushes
/// `receiveAXEvent` replies back.
export fn munadi_xpc_set_event_callback(
    h: XpcHandle,
    cb: EventCCallback,
    userdata: ?*anyopaque,
) void {
    const session: *Session = @ptrCast(@alignCast(h));
    session.callback = cb;
    session.userdata = userdata;
}

/// Ask the helper to start observing AX events for the target app pid.
/// Returns 0 on success; non-zero on any failure (the same semantics as
/// the Swift version's `rc == 0` / `rc == -2` return code). Plan 02 sends
/// the XPC message synchronously and reports success if the connection
/// was healthy.
export fn munadi_xpc_start_ax_observer(h: XpcHandle, pid: i32) i32 {
    const session: *Session = @ptrCast(@alignCast(h));
    const conn = session.connection orelse return -1;

    // Build the request dict: { _method: "startAXObserver", voicePID: pid }
    const req = xpc.xpc_dictionary_create(null, null, 0);
    xpc.xpc_dictionary_set_string(req, "_method", "startAXObserver");
    xpc.xpc_dictionary_set_int64(req, "voicePID", @intCast(pid));
    xpc.xpc_connection_send_message(conn, req);
    xpc.xpc_release(req);
    return 0;
}

/// Ask the helper to stop observing AX events. Returns 0 always (the
/// Swift version's wait-with-timeout path is re-implemented as fire-and-
/// forget in Plan 02; Plan 04 adds the reply channel).
export fn munadi_xpc_stop_ax_observer(h: XpcHandle) i32 {
    const session: *Session = @ptrCast(@alignCast(h));
    const conn = session.connection orelse return -1;

    const req = xpc.xpc_dictionary_create(null, null, 0);
    xpc.xpc_dictionary_set_string(req, "_method", "stopAXObserver");
    xpc.xpc_connection_send_message(conn, req);
    xpc.xpc_release(req);
    return 0;
}

/// Tear down the connection and free the session handle. After this call
/// `h` is invalid.
export fn munadi_xpc_disconnect(h: XpcHandle) void {
    const session: *Session = @ptrCast(@alignCast(h));
    releaseSession(session);
}

// ---------------------------------------------------------------------------
// Internal: client-side peer event handler
// ---------------------------------------------------------------------------
//
// Receives messages pushed FROM the helper (axAnnouncement callbacks).
// Plan 02 wires the handler but delivers only a debug-log path; Plan 04
// replaces this with the real `receiveAXEvent` decoder that looks up the
// owning Session from the connection's context and invokes the stored
// C callback.

fn onClientEvent(event: xpc.xpc_object_t) callconv(.c) void {
    // Intentionally a no-op for Plan 02. Even for an "unused" pending
    // message, libxpc requires an event handler to avoid dropping peer
    // events — the registration above prevents that drop.
    _ = event;
}
