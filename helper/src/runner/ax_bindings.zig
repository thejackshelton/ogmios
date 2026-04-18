// Hand-written `extern` declarations for the macOS AX (Accessibility) +
// CoreFoundation surface that the Ogmios helper uses to observe VoiceOver
// announcements.
//
// Why hand-written and not `@cImport`?
// Phase 8 CONTEXT.md § "Hand-written extern decls (avoid @cImport drift)":
// `@cImport` re-parses Apple's `<ApplicationServices/ApplicationServices.h>`
// and `<CoreFoundation/CoreFoundation.h>` on every Zig bump. Those headers
// include a lot of `__attribute__`, inline static, and nested-macro noise
// that drives @cImport's translator output. Freezing the subset we actually
// use in this single file means every ABI drift surfaces as a compile error
// in ONE file and makes reviewer auditing trivial.
//
// See also threat T-08-05 in 08-02-PLAN.md: any silent drift here produces
// memory corruption when the AX callback is invoked with the wrong argument
// layout.
//
// NOTE: Do not migrate to @cImport — see 08-CONTEXT.md § "Hand-written extern
// decls (avoid @cImport drift)".

const std = @import("std");

// ---------------------------------------------------------------------------
// Scalar aliases
// ---------------------------------------------------------------------------

/// `pid_t` from `<sys/types.h>` on Darwin. Zig uses `i32` — matches the
/// Darwin typedef `typedef __int32_t pid_t`.
pub const pid_t = i32;

/// `AXError` from `<HIServices/AXError.h>`. The enum values are declared as
/// `enum { kAXErrorSuccess = 0, kAXErrorFailure = -25200, ... };` — we model
/// them as signed 32-bit integers and compare against the `success` constant.
pub const AXError = i32;
pub const kAXErrorSuccess: AXError = 0;

/// `CFIndex` is `long` on 64-bit Darwin — same layout as Zig's `isize`.
pub const CFIndex = isize;

/// `CFStringEncoding` = `UInt32` in `<CoreFoundation/CFString.h>`.
pub const CFStringEncoding = u32;
pub const kCFStringEncodingUTF8: CFStringEncoding = 0x08000100;

// ---------------------------------------------------------------------------
// Opaque handle types
// ---------------------------------------------------------------------------

/// `AXUIElementRef` — opaque reference to an element in an app's AX tree.
pub const AXUIElementRef = *anyopaque;

/// `AXObserverRef` — opaque reference to a registered AX observer.
pub const AXObserverRef = *anyopaque;

/// `CFRunLoopRef` — opaque reference to a CoreFoundation runloop.
pub const CFRunLoopRef = *anyopaque;

/// `CFRunLoopSourceRef` — opaque reference to an installable runloop source.
pub const CFRunLoopSourceRef = *anyopaque;

/// `CFStringRef` — opaque reference to an immutable CFString.
pub const CFStringRef = *anyopaque;

/// `CFDictionaryRef` — opaque reference to an immutable CFDictionary.
pub const CFDictionaryRef = *anyopaque;

/// `CFTypeRef` — the root of the CF class hierarchy. All CF*Ref types can
/// be passed wherever `CFTypeRef` is expected.
pub const CFTypeRef = *anyopaque;

/// `CFAllocatorRef` — opaque reference to a CF allocator. We always pass
/// `kCFAllocatorDefault` (i.e. `null`).
pub const CFAllocatorRef = ?*anyopaque;

/// Signature of the AX observer callback as declared in
/// `<HIServices/AXNotificationConstants.h>`:
///
///     typedef void (*AXObserverCallbackWithInfo)(
///         AXObserverRef observer,
///         AXUIElementRef element,
///         CFStringRef notification,
///         CFDictionaryRef userInfo,
///         void *refcon);
pub const AXObserverCallbackWithInfo = *const fn (
    observer: AXObserverRef,
    element: AXUIElementRef,
    notification: CFStringRef,
    userInfo: CFDictionaryRef,
    refcon: ?*anyopaque,
) callconv(.c) void;

// ---------------------------------------------------------------------------
// AXUIElement
// ---------------------------------------------------------------------------

/// `AXUIElementRef AXUIElementCreateSystemWide(void);` — returns a reference
/// to the system-wide AX element, used for non-scoped observation. Phase 7
/// Plan 04 deprecates this usage in favor of `CreateApplication(pid)` below;
/// declared here for completeness.
pub extern "c" fn AXUIElementCreateSystemWide() AXUIElementRef;

/// `AXUIElementRef AXUIElementCreateApplication(pid_t pid);` — returns an
/// element scoped to a specific app. Plan 02 uses this exclusively.
pub extern "c" fn AXUIElementCreateApplication(pid: pid_t) AXUIElementRef;

// ---------------------------------------------------------------------------
// AXObserver
// ---------------------------------------------------------------------------

/// `AXError AXObserverCreateWithInfoCallback(pid_t application,
///     AXObserverCallbackWithInfo callback, AXObserverRef *outObserver);`
pub extern "c" fn AXObserverCreateWithInfoCallback(
    application: pid_t,
    callback: AXObserverCallbackWithInfo,
    outObserver: *AXObserverRef,
) AXError;

/// `AXError AXObserverAddNotification(AXObserverRef observer,
///     AXUIElementRef element, CFStringRef notification, void *refcon);`
pub extern "c" fn AXObserverAddNotification(
    observer: AXObserverRef,
    element: AXUIElementRef,
    notification: CFStringRef,
    refcon: ?*anyopaque,
) AXError;

/// `AXError AXObserverRemoveNotification(AXObserverRef observer,
///     AXUIElementRef element, CFStringRef notification);`
pub extern "c" fn AXObserverRemoveNotification(
    observer: AXObserverRef,
    element: AXUIElementRef,
    notification: CFStringRef,
) AXError;

/// `CFRunLoopSourceRef AXObserverGetRunLoopSource(AXObserverRef observer);`
pub extern "c" fn AXObserverGetRunLoopSource(observer: AXObserverRef) CFRunLoopSourceRef;

// ---------------------------------------------------------------------------
// CFRunLoop
// ---------------------------------------------------------------------------

/// `CFRunLoopRef CFRunLoopGetCurrent(void);`
pub extern "c" fn CFRunLoopGetCurrent() CFRunLoopRef;

/// `CFRunLoopRef CFRunLoopGetMain(void);`
pub extern "c" fn CFRunLoopGetMain() CFRunLoopRef;

/// `void CFRunLoopAddSource(CFRunLoopRef rl, CFRunLoopSourceRef source,
///     CFStringRef mode);`
pub extern "c" fn CFRunLoopAddSource(
    rl: CFRunLoopRef,
    source: CFRunLoopSourceRef,
    mode: CFStringRef,
) void;

/// `void CFRunLoopRemoveSource(CFRunLoopRef rl, CFRunLoopSourceRef source,
///     CFStringRef mode);`
pub extern "c" fn CFRunLoopRemoveSource(
    rl: CFRunLoopRef,
    source: CFRunLoopSourceRef,
    mode: CFStringRef,
) void;

/// `void CFRunLoopRun(void);`
pub extern "c" fn CFRunLoopRun() void;

/// `void CFRunLoopStop(CFRunLoopRef rl);`
pub extern "c" fn CFRunLoopStop(rl: CFRunLoopRef) void;

// Apple exports `kCFRunLoopDefaultMode` as an `extern const CFStringRef`
// symbol in the CoreFoundation framework. Declare the underlying constant
// and expose a pointer so callers can write `ax.kCFRunLoopDefaultMode`.
pub extern "c" const kCFRunLoopDefaultMode: CFStringRef;

// ---------------------------------------------------------------------------
// CFString
// ---------------------------------------------------------------------------

/// `CFStringRef CFStringCreateWithCString(CFAllocatorRef alloc,
///     const char *cStr, CFStringEncoding encoding);`
pub extern "c" fn CFStringCreateWithCString(
    alloc: CFAllocatorRef,
    cStr: [*:0]const u8,
    encoding: CFStringEncoding,
) CFStringRef;

/// `const char *CFStringGetCStringPtr(CFStringRef str, CFStringEncoding encoding);`
/// Returns NULL when the string cannot be represented as a direct C-string
/// reference — callers must then fall back to `CFStringGetCString` with a
/// buffer. Plan 02 handles the NULL case by emitting an empty announcement.
pub extern "c" fn CFStringGetCStringPtr(
    str: CFStringRef,
    encoding: CFStringEncoding,
) ?[*:0]const u8;

/// `Boolean CFStringGetCString(CFStringRef str, char *buffer,
///     CFIndex bufferSize, CFStringEncoding encoding);`
pub extern "c" fn CFStringGetCString(
    str: CFStringRef,
    buffer: [*]u8,
    bufferSize: CFIndex,
    encoding: CFStringEncoding,
) u8;

/// `CFIndex CFStringGetLength(CFStringRef str);`
pub extern "c" fn CFStringGetLength(str: CFStringRef) CFIndex;

// ---------------------------------------------------------------------------
// CFDictionary
// ---------------------------------------------------------------------------

/// `const void *CFDictionaryGetValue(CFDictionaryRef theDict, const void *key);`
/// For AX userInfo dictionaries the key is always a `CFStringRef`.
pub extern "c" fn CFDictionaryGetValue(
    theDict: CFDictionaryRef,
    key: *const anyopaque,
) ?*const anyopaque;

// ---------------------------------------------------------------------------
// CFRetain / CFRelease (CF memory management)
// ---------------------------------------------------------------------------

/// `CFTypeRef CFRetain(CFTypeRef cf);`
pub extern "c" fn CFRetain(cf: CFTypeRef) CFTypeRef;

/// `void CFRelease(CFTypeRef cf);`
pub extern "c" fn CFRelease(cf: CFTypeRef) void;

// ---------------------------------------------------------------------------
// AX notification name constants (as UTF-8 C strings)
// ---------------------------------------------------------------------------
//
// Apple ships these as `const CFStringRef kAXAnnouncementRequestedNotification`
// etc. Rather than importing the CF const symbol (which would add link-time
// brittleness), we keep the canonical UTF-8 text here and build a CFString at
// runtime via `CFStringCreateWithCString`. This matches Swift's
// `kAXAnnouncementRequestedNotification as CFString` in AXObserver.swift.

pub const kAXAnnouncementRequestedNotification: [*:0]const u8 = "AXAnnouncementRequested";
pub const kAXAnnouncementKey: [*:0]const u8 = "AXAnnouncement";
pub const kAXUIElementTitleKey: [*:0]const u8 = "AXUIElementTitle";

// NOTE: Do not migrate to @cImport — see 08-CONTEXT.md § "Hand-written extern
// decls (avoid @cImport drift)".
