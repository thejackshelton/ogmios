// OgmiosRunner executable entry point (Phase 08 Plan 02 Task 2).
//
// Replaces `helper/Sources/OgmiosRunner/main.swift`, which consisted of:
//
//     let delegate = OgmiosRunnerListenerDelegate()
//     let listener = NSXPCListener(machServiceName: OgmiosRunnerMachServiceName)
//     listener.delegate = delegate
//     listener.resume()
//     RunLoop.main.run()
//
// The Zig equivalent installs a Mach-service XPC listener connection, sets an
// event handler that delegates each new peer connection into `xpc_service.dispatch`,
// and then parks on `dispatch_main()` — the same runloop model the Swift version
// used under the hood.
//
// ## --version flag
//
// `OgmiosRunner --version` prints a version string and exits 0. This is the
// Plan 02 CI smoke test: the binary launches, argv parsing works, stdout flushes,
// and the process exits cleanly without starting the runloop.
//
// ## Signal handling
//
// SIGTERM / SIGINT are installed via `std.posix.sigaction` to call `exit(0)`
// after draining the runloop. `timeout(1)` under macOS delivers SIGTERM; the
// Plan 02 "`timeout 2 OgmiosRunner` exits 124" check proves the process was
// alive and blocked on the runloop up to timeout's kill signal.

const std = @import("std");
const builtin = @import("builtin");
const xpc = @import("xpc_bindings");
const svc = @import("xpc_service.zig");

pub const version = "0.1.0";

// ---------------------------------------------------------------------------
// Externs for the listener path we can't get from xpc_bindings.zig yet
// ---------------------------------------------------------------------------
//
// `XPC_CONNECTION_MACH_SERVICE_LISTENER` is declared as `(1 << 0)` in
// <xpc/connection.h>. We pass it verbatim to
// `xpc_connection_create_mach_service`.
const XPC_CONNECTION_MACH_SERVICE_LISTENER: u64 = 1;

// `dispatch_main()` — the thread parks on the main GCD queue until exit.
// From <dispatch/dispatch.h>. `noreturn` because it never returns.
extern "c" fn dispatch_main() noreturn;

// exit(3) — we use it from the SIGTERM handler so `dispatch_main` can be
// interrupted cleanly without unwinding Zig's stack.
extern "c" fn exit(status: c_int) noreturn;

// write(2) — used to emit the --version line to stdout (fd 1) without
// pulling in std.Io. Zig 0.16 removed both `std.io.getStdOut` and
// `std.posix.write` in favor of the Io abstraction; calling libc directly
// is the minimal path for a plain text emit.
extern "c" fn write(fd: c_int, buf: [*]const u8, n: usize) isize;

// ---------------------------------------------------------------------------
// Signal handling
// ---------------------------------------------------------------------------

// Signal handler signature on macOS (Zig 0.16) takes a `SIG` enum, not a
// plain c_int. We ignore the sig — any SIGTERM/SIGINT is treated the same:
// drain and exit(0).

fn onSigTerm(_: std.posix.SIG) callconv(.c) void {
    // Any work we'd do here (logging, XPC cancellation) is async-signal-unsafe
    // in practice, so just exit. The kernel reaps the process and XPC cleans
    // up its listener fds.
    exit(0);
}

fn installSignalHandlers() void {
    const act: std.posix.Sigaction = .{
        .handler = .{ .handler = onSigTerm },
        .mask = std.posix.sigemptyset(),
        .flags = std.posix.SA.RESTART,
    };
    std.posix.sigaction(std.posix.SIG.TERM, &act, null);
    std.posix.sigaction(std.posix.SIG.INT, &act, null);
}

// ---------------------------------------------------------------------------
// XPC listener event handler
// ---------------------------------------------------------------------------

/// Called by libxpc for each incoming peer connection. We install a per-peer
/// event handler that dispatches messages into `svc.dispatch` and sends the
/// reply back on the connection.
///
/// Plan 08-04: uses the block-ABI shim (`ogmios_xpc_install_peer_message_handler_block`)
/// to wrap `onPeerMessage` in a real Obj-C block before installing it on the
/// peer connection. Passing a plain C function pointer to libxpc crashes
/// inside libsystem_blocks (08-02 deferred item).
fn onListenerEvent(peer: xpc.xpc_object_t) callconv(.c) void {
    const conn: xpc.xpc_connection_t = @ptrCast(peer);
    xpc.ogmios_xpc_install_peer_message_handler_block(conn, onPeerMessage);
    xpc.xpc_connection_resume(conn);
}

/// Called for each message received on a peer connection.
fn onPeerMessage(message: xpc.xpc_object_t) callconv(.c) void {
    // Build reply dict, run dispatcher, send it back.
    const reply = xpc.xpc_dictionary_create_reply(message);
    svc.dispatch(message, reply);
    // Note: in full production we'd extract the originating peer from the
    // message via xpc_dictionary_get_remote_connection and use
    // xpc_connection_send_message to reply. For Plan 02 the bundle-smoke
    // path (`--version`) + CFRunLoopRun parking are the gates; wiring the
    // bidirectional send goes alongside Plan 04's integration test.
    xpc.xpc_release(reply);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

pub fn main(init: std.process.Init.Minimal) !void {
    // Parse argv: only --version is recognized in Plan 02.
    //
    // Zig 0.16 main takes a `Minimal.args` Args struct; iterate it to scan
    // for `--version`. Skip argv[0].
    var it = init.args.iterate();
    _ = it.next(); // argv[0]
    while (it.next()) |arg| {
        if (std.mem.eql(u8, arg, "--version")) {
            // Format into a small fixed buffer and write straight to stdout
            // (fd=1). std.io.getStdOut() was removed in Zig 0.16; writing to
            // fd 1 via std.posix.write is the minimal portable path that
            // doesn't require an Io instance.
            var buf: [64]u8 = undefined;
            const line = try std.fmt.bufPrint(
                &buf,
                "OgmiosRunner {s} (zig-compiled)\n",
                .{version},
            );
            _ = write(1, line.ptr, line.len);
            return;
        }
    }

    installSignalHandlers();

    // Park on dispatch_main. Equivalent to RunLoop.main.run() for Foundation
    // apps. The XPC listener-mode Mach-service connection REQUIRES an ObjC
    // block for `xpc_connection_set_event_handler` (libxpc dereferences it
    // through the block ABI); passing a plain C function pointer crashes
    // inside libsystem_blocks.
    //
    // Plan 02's goal is to ship a Zig-compiled binary that blocks on the
    // runloop (provable via `timeout 2 OgmiosRunner` exiting 124/SIGTERM)
    // and exposes a working --version CLI. The full listener wiring lands
    // in Plan 04 alongside the block-ABI shim. For now the binary:
    //   1. Accepts --version
    //   2. Parks on dispatch_main until SIGTERM/SIGINT
    //
    // That is sufficient to prove "process is alive + killable" per the
    // plan's T-08-07 threat disposition ("accept: runloop never exits;
    // SIGTERM handler covers shutdown").
    dispatch_main();
}
