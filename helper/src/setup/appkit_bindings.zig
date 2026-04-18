// Hand-written `extern` decls for the macOS AppKit + Objective-C runtime +
// CoreFoundation surface used by ShokiSetup.app.
//
// ShokiSetup.app's whole job is to trigger two TCC prompts (Accessibility +
// Automation-of-VoiceOver) and show a success modal. We need:
//
//   * Objective-C runtime     -> objc_getClass, sel_registerName, objc_msgSend variants
//   * AppKit (via runtime)    -> NSApplication, NSAlert, NSRunningApplication
//   * Foundation (via runtime)-> NSString, NSAppleScript, NSDictionary
//   * ApplicationServices     -> AXIsProcessTrustedWithOptions
//   * CoreFoundation          -> CFDictionaryCreate, kCFBooleanTrue, CFString* helpers
//
// ## Why hand-written and not `@cImport`?
//
// Same rationale as `src/runner/ax_bindings.zig` (see Plan 08-02 SUMMARY):
// `@cImport` re-parses Apple's megabyte-sized AppKit + Foundation umbrella
// headers on every Zig version bump and surfaces translator drift as opaque
// errors. Freezing the subset we actually use in one file:
//   - makes reviewer auditing trivial,
//   - keeps ABI drift to a single compile-error surface,
//   - avoids @cImport's habit of hiding Obj-C method dispatch behind macros.
//
// NOTE: Do not migrate to @cImport — see 08-CONTEXT.md § "Hand-written
// extern decls (avoid @cImport drift)".
//
// ## objc_msgSend per-signature variants
//
// libobjc exports a single `objc_msgSend(self, _cmd, ...)` with C-variadic
// ABI. Zig can't call a variadic C symbol portably, so we declare ONE Zig
// `extern` per call signature we need — the linker resolves all variants to
// the same underlying symbol via `@extern` at link time.
//
// The naming convention is `objc_msgSend_<ret>__<argtypes>` where:
//   - first slot is the return type (id, bool, void, i64, ...)
//   - args are listed after the double underscore (id for ?*anyopaque,
//     ptr for generic pointer, u64 for NSUInteger, etc.)
//
// If a new call signature is needed later, add one here rather than
// casting pointers at the call-site.

const std = @import("std");

// ---------------------------------------------------------------------------
// Objective-C runtime — libobjc.A.dylib
// ---------------------------------------------------------------------------

/// `objc_getClass(name)` — look up an Obj-C class by its registered name.
/// Returns `Class` (typed as `id` in <objc/objc.h>); null means the class
/// isn't registered (which in our code means AppKit/Foundation mis-linked).
pub extern "c" fn objc_getClass(name: [*:0]const u8) ?*anyopaque;

/// `sel_registerName(name)` — intern a selector string and return its SEL
/// handle. Called for every Obj-C method we dispatch through `objc_msgSend`.
pub extern "c" fn sel_registerName(name: [*:0]const u8) ?*anyopaque;

// --- objc_msgSend variants ---
//
// Each variant resolves to the SAME underlying `_objc_msgSend` symbol; Zig
// just needs a distinct prototype per call so the calling convention is
// settled at compile time. The signatures mirror the Obj-C selectors we
// invoke in setup_main.zig.

// ## Trick: all objc_msgSend variants resolve to the SAME C symbol.
//
// libobjc exports a single `_objc_msgSend(self, _cmd, ...)` with C-variadic
// ABI. Zig can't call a variadic C symbol portably, so each variant below
// uses `@extern` with an explicit `.name = "objc_msgSend"` — that binds our
// typed Zig function pointer to libobjc's real symbol at link time while
// pinning the calling convention to the specific signature we need.
//
// The pattern: `pub const objc_msgSend_id: *const fn(...) callconv(.c) ?*anyopaque =`
//                 `@extern(@TypeOf(objc_msgSend_id), .{ .name = "objc_msgSend" });`
//
// The function pointer IS a typed view into the raw symbol. Calling through
// it uses the declared signature, which is exactly what Obj-C method dispatch
// requires per Apple's libobjc docs.

const MsgSendIdFn = *const fn (self: ?*anyopaque, op: ?*anyopaque) callconv(.c) ?*anyopaque;
/// `id objc_msgSend(id self, SEL _cmd)` — no-arg method returning id.
pub const objc_msgSend_id: MsgSendIdFn = @extern(MsgSendIdFn, .{ .name = "objc_msgSend" });

const MsgSendIdIdFn = *const fn (self: ?*anyopaque, op: ?*anyopaque, arg1: ?*anyopaque) callconv(.c) ?*anyopaque;
/// `id objc_msgSend(id self, SEL _cmd, id arg1)` — one id arg, returns id.
pub const objc_msgSend_id_id: MsgSendIdIdFn = @extern(MsgSendIdIdFn, .{ .name = "objc_msgSend" });

const MsgSendBoolFn = *const fn (self: ?*anyopaque, op: ?*anyopaque) callconv(.c) bool;
/// `BOOL objc_msgSend(id self, SEL _cmd)` — no-arg predicate.
pub const objc_msgSend_bool: MsgSendBoolFn = @extern(MsgSendBoolFn, .{ .name = "objc_msgSend" });

const MsgSendBoolBoolFn = *const fn (self: ?*anyopaque, op: ?*anyopaque, arg1: bool) callconv(.c) bool;
/// `BOOL objc_msgSend(id self, SEL _cmd, BOOL arg1)` — e.g.
/// `[NSApp activateIgnoringOtherApps:YES]`.
pub const objc_msgSend_bool_bool: MsgSendBoolBoolFn = @extern(MsgSendBoolBoolFn, .{ .name = "objc_msgSend" });

const MsgSendVoidFn = *const fn (self: ?*anyopaque, op: ?*anyopaque) callconv(.c) void;
/// `void objc_msgSend(id self, SEL _cmd)` — no-arg void method.
pub const objc_msgSend_void: MsgSendVoidFn = @extern(MsgSendVoidFn, .{ .name = "objc_msgSend" });

const MsgSendVoidIdFn = *const fn (self: ?*anyopaque, op: ?*anyopaque, arg1: ?*anyopaque) callconv(.c) void;
/// `void objc_msgSend(id self, SEL _cmd, id arg1)` — e.g. setMessageText:,
/// setInformativeText:, addButtonWithTitle:, terminate:.
pub const objc_msgSend_void_id: MsgSendVoidIdFn = @extern(MsgSendVoidIdFn, .{ .name = "objc_msgSend" });

const MsgSendVoidI64Fn = *const fn (self: ?*anyopaque, op: ?*anyopaque, arg1: i64) callconv(.c) void;
/// `void objc_msgSend(id self, SEL _cmd, NSInteger arg1)` — setActivationPolicy:.
pub const objc_msgSend_void_i64: MsgSendVoidI64Fn = @extern(MsgSendVoidI64Fn, .{ .name = "objc_msgSend" });

const MsgSendI64Fn = *const fn (self: ?*anyopaque, op: ?*anyopaque) callconv(.c) i64;
/// `NSInteger objc_msgSend(id self, SEL _cmd)` — e.g. [alert runModal].
pub const objc_msgSend_i64: MsgSendI64Fn = @extern(MsgSendI64Fn, .{ .name = "objc_msgSend" });

const MsgSendIdCstrFn = *const fn (self: ?*anyopaque, op: ?*anyopaque, arg1: [*:0]const u8) callconv(.c) ?*anyopaque;
/// `id objc_msgSend(id self, SEL _cmd, const char* arg1)` — used with
/// [NSString stringWithUTF8String:] (which takes a raw C string, not an id).
pub const objc_msgSend_id_cstr: MsgSendIdCstrFn = @extern(MsgSendIdCstrFn, .{ .name = "objc_msgSend" });

const MsgSendIdIdpFn = *const fn (self: ?*anyopaque, op: ?*anyopaque, arg1: ?*?*anyopaque) callconv(.c) ?*anyopaque;
/// `id objc_msgSend(id self, SEL _cmd, id arg1, id* arg2)` — NSAppleScript's
/// `executeAndReturnError:` takes a pointer-to-NSDictionary-pointer out-arg
/// for error info. We pass null.
pub const objc_msgSend_id_idp: MsgSendIdIdpFn = @extern(MsgSendIdIdpFn, .{ .name = "objc_msgSend" });

// ---------------------------------------------------------------------------
// ApplicationServices — Accessibility trust check
// ---------------------------------------------------------------------------
//
// `AXIsProcessTrustedWithOptions(options)` — returns YES if this process has
// the Accessibility TCC grant; if options contains
// `{ kAXTrustedCheckOptionPrompt: true }` and the grant is MISSING, macOS
// displays the system Accessibility prompt dialog.
//
// This is THE call that makes ShokiSetup.app worth existing — CLI parents
// don't trigger this prompt because macOS gates it on a bundled app.

pub extern "c" fn AXIsProcessTrustedWithOptions(options: ?*anyopaque) bool;

/// `AXIsProcessTrusted()` — no-prompt probe for Accessibility grant.
/// Unlike `AXIsProcessTrustedWithOptions`, this variant NEVER surfaces a
/// system dialog; it just reports the current TCC state. We use it both
/// as a pre-check (to skip the prompt if already granted) and as a poll
/// target after the prompt is shown.
pub extern "c" fn AXIsProcessTrusted() bool;

// ---------------------------------------------------------------------------
// CoreFoundation — for the options dict passed to AXIsProcessTrustedWithOptions
// ---------------------------------------------------------------------------
//
// We need to build a CFDictionary{ kAXTrustedCheckOptionPrompt: kCFBooleanTrue }.
// The key is a CFString; we construct it from a C string at runtime because
// the `const CFStringRef kAXTrustedCheckOptionPrompt` symbol isn't always
// re-exported in a way Zig can resolve without `@cImport`.

/// `CFStringCreateWithCString(alloc, cstr, encoding)` — builds an immutable
/// CFString from a C string.
pub extern "c" fn CFStringCreateWithCString(
    allocator: ?*anyopaque,
    cstr: [*:0]const u8,
    encoding: u32,
) ?*anyopaque;

/// UTF-8 encoding constant from <CFString.h>.
pub const kCFStringEncodingUTF8: u32 = 0x08000100;

/// `CFDictionaryCreate(alloc, keys, values, n, keyCallBacks, valueCallBacks)`.
/// `keyCallBacks` and `valueCallBacks` are POINTERS to struct instances —
/// pass `&kCFTypeDictionaryKeyCallBacks` etc.
pub extern "c" fn CFDictionaryCreate(
    allocator: ?*anyopaque,
    keys: [*]const ?*anyopaque,
    values: [*]const ?*anyopaque,
    num_values: isize,
    key_callbacks: ?*const CFDictionaryKeyCallBacks,
    value_callbacks: ?*const CFDictionaryValueCallBacks,
) ?*anyopaque;

/// `kCFBooleanTrue` — CFBoolean singleton for YES.
/// Apple exports this as `const void * const` — a pointer VALUE, so direct use is correct.
pub extern const kCFBooleanTrue: ?*anyopaque;

/// `kCFTypeDictionaryKeyCallBacks` — opaque-struct instance (NOT a pointer).
/// Apple exports this as `const CFDictionaryKeyCallBacks kCFTypeDictionaryKeyCallBacks;`
/// — a struct variable, not a pointer. We must take `&` when passing to
/// CFDictionaryCreate. Previously declared as `*anyopaque` which caused a
/// SIGSEGV crash in AXIsProcessTrustedWithOptions → CFGetTypeID walking
/// a dict built with garbage callback pointers.
pub const CFDictionaryKeyCallBacks = opaque {};
pub extern const kCFTypeDictionaryKeyCallBacks: CFDictionaryKeyCallBacks;

/// `kCFTypeDictionaryValueCallBacks` — same story as the key callbacks.
pub const CFDictionaryValueCallBacks = opaque {};
pub extern const kCFTypeDictionaryValueCallBacks: CFDictionaryValueCallBacks;

/// `CFRelease(obj)` — drop a CF reference.
pub extern "c" fn CFRelease(obj: ?*anyopaque) void;
