// Block-ABI shim for Plan 08-02 deferred item.
//
// libxpc's `xpc_connection_set_event_handler` takes a `xpc_handler_t`, which is
// a **block** (`void (^)(xpc_object_t)`), NOT a C function pointer. libsystem
// dereferences the argument through the block ABI (reading `descriptor`, the
// `invoke` slot, and `isa`), so passing a plain C function pointer crashes
// inside `libsystem_blocks.dylib` with a bus error at `xpc_connection_resume`.
//
// Zig cannot emit Obj-C blocks directly. Rather than re-implementing the
// `_NSConcreteStackBlock` / descriptor layout in Zig (fragile — the clang
// runtime owns that layout), we compile this tiny C file with clang's
// `-fblocks` and let the host toolchain produce a real block literal. The
// block's invoke body calls back into our Zig-side handler by function
// pointer, which IS the shape Zig can export.
//
// Public surface:
//
//   void shoki_xpc_install_event_handler_block(
//       xpc_connection_t connection,
//       void (*handler)(xpc_object_t event));
//
//   void shoki_xpc_install_peer_message_handler_block(
//       xpc_connection_t connection,
//       void (*handler)(xpc_object_t message));
//
// Both functions copy their block (so it survives past the stack frame) and
// pass it to xpc_connection_set_event_handler. libxpc retains the block
// internally; we never need to Block_release it.
//
// Tests: helper/test/xpc_block_shim_test.zig asserts these symbols exist
// and are callable without crashing when given a null event (the handler
// receives null and returns — block ABI sanity).

#include <Block.h>
#include <xpc/xpc.h>

void shoki_xpc_install_event_handler_block(
    xpc_connection_t connection,
    void (*handler)(xpc_object_t event))
{
    // Wrap the Zig-exported C function pointer in a real clang block. The
    // `^` literal captures `handler` by value; Block_copy moves the stack
    // block to the heap so libxpc's retain is safe. libxpc owns the retain
    // after set_event_handler returns.
    xpc_connection_set_event_handler(connection, ^(xpc_object_t event) {
        handler(event);
    });
}

void shoki_xpc_install_peer_message_handler_block(
    xpc_connection_t connection,
    void (*handler)(xpc_object_t message))
{
    xpc_connection_set_event_handler(connection, ^(xpc_object_t message) {
        handler(message);
    });
}

// Self-test entry point — callable without a live XPC runtime. Used by the
// helper's Zig-side unit test to prove the shim links and is callable without
// crashing. Takes a Zig-exported C handler pointer and INVOKES it once via a
// block-wrapped thunk; proves the block ABI round-trip works in isolation.
void shoki_xpc_self_test_invoke_handler_block(
    void (*handler)(xpc_object_t event),
    xpc_object_t arg)
{
    void (^thunk)(xpc_object_t) = ^(xpc_object_t event) {
        handler(event);
    };
    // Copy-then-release exercises the full block ABI path (descriptor, isa,
    // copy_helper) in a way a stack-only invocation would not.
    void (^heap_block)(xpc_object_t) = Block_copy(thunk);
    heap_block(arg);
    Block_release(heap_block);
}
