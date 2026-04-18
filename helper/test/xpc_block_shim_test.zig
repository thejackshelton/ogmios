// Tests for the Plan 08-04 block-ABI shim
// (`helper/src/runner/xpc_block_shim.c`).
//
// libxpc's `xpc_connection_set_event_handler` takes an Obj-C block, not a
// function pointer — passing a plain C function pointer crashes inside
// libsystem_blocks.dylib at `xpc_connection_resume`. The shim wraps a Zig-
// exported C function pointer in a real clang-compiled block literal.
//
// Testing note: we can't test `xpc_connection_set_event_handler` directly
// in a unit test without a live Mach service + entitlements. What we CAN
// test is the shim's block-ABI correctness in isolation via the
// `shoki_xpc_self_test_invoke_handler_block` entry point, which:
//
//   1. Takes a Zig-exported C handler pointer + an argument
//   2. Wraps it in a block (`^(xpc_object_t){ handler(event); }`)
//   3. Block_copy() moves it to the heap (exercises descriptor / isa / copy_helper)
//   4. Invokes the heap block with the argument
//   5. Block_release() frees it
//
// If block-ABI wiring is broken (mis-linked blocks runtime, malformed
// descriptor), these tests crash instead of green — the whole point.

const std = @import("std");
const xpc = @import("xpc_bindings");
const testing = std.testing;

// Counter state updated by the test-only handler. Zig tests in the default
// configuration run single-threaded so a simple comptime-mutable global is
// safe here.
var invoke_count: u32 = 0;
var last_arg: ?xpc.xpc_object_t = null;

fn testHandler(event: xpc.xpc_object_t) callconv(.c) void {
    invoke_count += 1;
    last_arg = event;
}

test "block-ABI shim: install_event_handler symbol is linkable" {
    // Just taking the address proves the linker resolved the C symbol. If
    // the blocks runtime or the C file weren't linked in, this test file
    // wouldn't compile.
    const ptr = @intFromPtr(&xpc.shoki_xpc_install_event_handler_block);
    try testing.expect(ptr != 0);
}

test "block-ABI shim: install_peer_message_handler symbol is linkable" {
    const ptr = @intFromPtr(&xpc.shoki_xpc_install_peer_message_handler_block);
    try testing.expect(ptr != 0);
}

test "block-ABI shim: self_test_invoke exercises block copy + release round-trip" {
    // Reset counters
    invoke_count = 0;
    last_arg = null;

    // Use a stable, non-null sentinel as the "xpc_object_t" argument. The
    // shim doesn't dereference it — it just passes it through — so any
    // non-null pointer works for proving the call landed.
    const sentinel: *anyopaque = @ptrFromInt(0xDEADBEEF);
    xpc.shoki_xpc_self_test_invoke_handler_block(testHandler, sentinel);

    try testing.expectEqual(@as(u32, 1), invoke_count);
    try testing.expect(last_arg != null);
    try testing.expectEqual(@intFromPtr(sentinel), @intFromPtr(last_arg.?));
}

test "block-ABI shim: self_test_invoke is re-entrant (two sequential calls)" {
    invoke_count = 0;
    last_arg = null;

    const a: *anyopaque = @ptrFromInt(0x1111);
    const b: *anyopaque = @ptrFromInt(0x2222);
    xpc.shoki_xpc_self_test_invoke_handler_block(testHandler, a);
    xpc.shoki_xpc_self_test_invoke_handler_block(testHandler, b);

    // Two calls, last_arg observes the second invocation.
    try testing.expectEqual(@as(u32, 2), invoke_count);
    try testing.expectEqual(@intFromPtr(b), @intFromPtr(last_arg.?));
}
