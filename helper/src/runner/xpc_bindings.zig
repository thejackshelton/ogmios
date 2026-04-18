// Hand-written `extern` declarations for the macOS `<xpc/xpc.h>` C API
// surface that the Shoki helper uses.
//
// Why hand-written and not `@cImport`?
// Phase 8 CONTEXT.md § "Hand-written extern decls (avoid @cImport drift)":
// `@cImport` re-parses Apple's headers on every Zig compiler bump and can
// silently change how Zig sees these types (Apple headers include a lot of
// `__attribute__` noise that drives @cImport's translator output). Freezing
// the subset we actually use in a single file makes every ABI change show
// up as a compile error in ONE file, and makes reviewer auditing trivial.
//
// See also threat T-08-01 in 08-01-PLAN.md: any drift here produces silent
// memory corruption at runtime.

const std = @import("std");

// ---------------------------------------------------------------------------
// Opaque handle types
// ---------------------------------------------------------------------------

/// `xpc_object_t` in `<xpc/xpc.h>` — an opaque, retained reference to any
/// XPC object (dictionary, array, string, int64, …). Zig side models it as
/// a non-null pointer to an opaque struct so it can be stored, compared,
/// and passed through externs without losing type discipline.
pub const xpc_object_t = *anyopaque;

/// `xpc_connection_t` — an opaque handle to an XPC connection. Distinct
/// type at the C level; we alias it to the same opaque pointer for now.
pub const xpc_connection_t = *anyopaque;

/// `xpc_type_t` — opaque pointer to the type-identity singleton returned by
/// `xpc_get_type` (used with `XPC_TYPE_DICTIONARY`, etc.).
pub const xpc_type_t = *anyopaque;

/// `xpc_handler_t` — C block-typed event handler. Zig can't emit ObjC blocks
/// without clang's block runtime, but we can still pass a C function pointer
/// to the subset of XPC APIs that accept a plain `void(*)(xpc_object_t)`.
/// When we need a real block (for `xpc_connection_set_event_handler`) we
/// will synthesize one in Plan 02 using the documented block ABI.
pub const xpc_event_handler_fn = *const fn (event: xpc_object_t) callconv(.c) void;

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

/// `xpc_connection_t xpc_connection_create_mach_service(const char *name,
///     dispatch_queue_t targetq, uint64_t flags);`
pub extern "c" fn xpc_connection_create_mach_service(
    name: [*:0]const u8,
    targetq: ?*anyopaque,
    flags: u64,
) xpc_connection_t;

/// `void xpc_connection_set_event_handler(xpc_connection_t connection,
///     xpc_handler_t handler);`
///
/// The real C API takes an ObjC block; we declare the Zig-side signature as
/// accepting a plain function pointer. Plan 02 wraps a real block around
/// this when the listener is wired up.
pub extern "c" fn xpc_connection_set_event_handler(
    connection: xpc_connection_t,
    handler: xpc_event_handler_fn,
) void;

/// `void xpc_connection_resume(xpc_connection_t connection);`
pub extern "c" fn xpc_connection_resume(connection: xpc_connection_t) void;

/// `void xpc_connection_send_message(xpc_connection_t connection,
///     xpc_object_t message);`
pub extern "c" fn xpc_connection_send_message(
    connection: xpc_connection_t,
    message: xpc_object_t,
) void;

/// `void xpc_connection_cancel(xpc_connection_t connection);`
pub extern "c" fn xpc_connection_cancel(connection: xpc_connection_t) void;

/// `void xpc_main(xpc_connection_handler_t handler);` — normally takes a
/// block; the daemon-registered helper will use `xpc_connection_set_event_handler`
/// on an explicit listener rather than `xpc_main` directly, but we expose the
/// declaration for completeness.
pub extern "c" fn xpc_main(handler: xpc_event_handler_fn) noreturn;

// ---------------------------------------------------------------------------
// Object construction / inspection
// ---------------------------------------------------------------------------

/// `xpc_object_t xpc_dictionary_create(const char * const *keys,
///     const xpc_object_t *values, size_t count);`
pub extern "c" fn xpc_dictionary_create(
    keys: ?[*]const [*:0]const u8,
    values: ?[*]const xpc_object_t,
    count: usize,
) xpc_object_t;

/// `xpc_object_t xpc_dictionary_create_reply(xpc_object_t original);` —
/// produces a dict suitable for use as a reply to `original`.
pub extern "c" fn xpc_dictionary_create_reply(original: xpc_object_t) xpc_object_t;

/// `void xpc_dictionary_set_string(xpc_object_t dict, const char *key,
///     const char *value);`
pub extern "c" fn xpc_dictionary_set_string(
    dict: xpc_object_t,
    key: [*:0]const u8,
    value: [*:0]const u8,
) void;

/// `void xpc_dictionary_set_int64(xpc_object_t dict, const char *key,
///     int64_t value);`
pub extern "c" fn xpc_dictionary_set_int64(
    dict: xpc_object_t,
    key: [*:0]const u8,
    value: i64,
) void;

/// `void xpc_dictionary_set_bool(xpc_object_t dict, const char *key,
///     bool value);`
pub extern "c" fn xpc_dictionary_set_bool(
    dict: xpc_object_t,
    key: [*:0]const u8,
    value: bool,
) void;

/// `const char *xpc_dictionary_get_string(xpc_object_t dict,
///     const char *key);` — returns NULL if key is missing or not a string.
pub extern "c" fn xpc_dictionary_get_string(
    dict: xpc_object_t,
    key: [*:0]const u8,
) ?[*:0]const u8;

/// `int64_t xpc_dictionary_get_int64(xpc_object_t dict, const char *key);` —
/// returns 0 if the key is missing; the dispatcher must therefore probe with
/// `xpc_dictionary_get_value` when zero is semantically meaningful.
pub extern "c" fn xpc_dictionary_get_int64(
    dict: xpc_object_t,
    key: [*:0]const u8,
) i64;

/// `xpc_object_t xpc_dictionary_get_value(xpc_object_t dict, const char *key);`
pub extern "c" fn xpc_dictionary_get_value(
    dict: xpc_object_t,
    key: [*:0]const u8,
) ?xpc_object_t;

// ---------------------------------------------------------------------------
// Type identification
// ---------------------------------------------------------------------------

/// `xpc_type_t xpc_get_type(xpc_object_t object);`
pub extern "c" fn xpc_get_type(object: xpc_object_t) xpc_type_t;

// Apple exports `XPC_TYPE_DICTIONARY` as an `extern struct _xpc_type_s`
// symbol; expose it as an opaque pointer. Plan 02 callers use
// `xpc_get_type(obj) == &XPC_TYPE_DICTIONARY`.
pub extern "c" const _xpc_type_dictionary: anyopaque;
pub const XPC_TYPE_DICTIONARY: *const anyopaque = &_xpc_type_dictionary;

// ---------------------------------------------------------------------------
// Retain / release
// ---------------------------------------------------------------------------

/// `xpc_object_t xpc_retain(xpc_object_t object);`
pub extern "c" fn xpc_retain(object: xpc_object_t) xpc_object_t;

/// `void xpc_release(xpc_object_t object);`
pub extern "c" fn xpc_release(object: xpc_object_t) void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// The Mach service name used by ShokiRunner. Keep in sync with
/// `helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift`
/// (`ShokiRunnerMachServiceName`).
pub const mach_service_name: [*:0]const u8 = "org.shoki.runner";

// ---------------------------------------------------------------------------
// Block-ABI shim (Plan 08-04 — previously deferred by 08-02)
// ---------------------------------------------------------------------------
//
// libxpc's `xpc_connection_set_event_handler` takes an Obj-C block, not a
// function pointer. See `helper/src/runner/xpc_block_shim.c` for the clang-
// compiled bridge that wraps a Zig-exported C handler in a real block and
// passes it to libxpc. Calling `xpc_connection_set_event_handler` directly
// (above) with a plain function pointer crashes inside libsystem_blocks; the
// shim functions below are the safe entry point.

/// Install a connection-level event handler block. Used on a peer connection
/// to handle incoming XPC_TYPE_CONNECTION events (new peer, error, cancel).
pub extern "c" fn shoki_xpc_install_event_handler_block(
    connection: xpc_connection_t,
    handler: xpc_event_handler_fn,
) void;

/// Install a message-level event handler block. Used on an already-accepted
/// peer connection to receive XPC_TYPE_DICTIONARY messages from the client.
pub extern "c" fn shoki_xpc_install_peer_message_handler_block(
    connection: xpc_connection_t,
    handler: xpc_event_handler_fn,
) void;

/// Self-test — invokes `handler(arg)` through a heap-copied block. Used by
/// the helper's unit test to prove the block ABI works end-to-end without
/// needing a live Mach service. Callable with any non-null `arg`.
pub extern "c" fn shoki_xpc_self_test_invoke_handler_block(
    handler: xpc_event_handler_fn,
    arg: xpc_object_t,
) void;

// NOTE: Do not migrate to @cImport — see 08-CONTEXT.md § "Hand-written extern decls (avoid @cImport drift)".
