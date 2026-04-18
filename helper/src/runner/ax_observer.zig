// Zig port of `helper/Sources/OgmiosRunnerService/AXObserver.swift` (Phase 08
// Plan 02 Task 1).
//
// ## What this module replaces
//
// `AXObserverSession` in the Swift helper wrapped an `AXObserver` subscribed
// to `kAXAnnouncementRequestedNotification` scoped to a specific target-app
// PID (Phase 7 Plan 04 — "DOM vs Chrome URL bar" filter). It spun up a
// dedicated thread running a private `CFRunLoop`, attached the observer's
// runloop source there, and forwarded every notification to a Swift closure
// (`EventCallback`) which dispatched back into `OgmiosRunnerService`.
//
// The Zig port keeps the same public surface — `init`, `start(pid)`, `stop()`,
// `debugEmit`, `isStarted` — but reads arguments and writes callback calls
// through plain Zig slices / function pointers. The thread-model is
// preserved (dedicated `std.Thread` with a `CFRunLoopRun`).
//
// ## Test mode (critical for CI)
//
// The real AX path calls `AXObserverCreateWithInfoCallback`, which requires
// TCC Accessibility grant and is therefore untestable in headless CI. The
// `test_hook_enabled` flag on `Session` short-circuits the attach path: when
// set, `start()` only runs the pre-attach guards (invalid-pid, already-started)
// and bumps a counter. This lets unit tests verify the guard ordering without
// needing TCC. The production `main.zig` never flips the flag on.
//
// See `helper/test/ax_observer_test.zig` for the guard-level coverage and
// 08-02-PLAN.md § "Note: actual AXObserverCreateWithInfoCallback is NOT
// invoked in unit tests".

const std = @import("std");
const builtin = @import("builtin");
// `ax_bindings.zig` is a sibling file in the same directory — imported by
// relative path (no named module needed; both files share the same module
// root subtree for every consumer module that contains them).
const ax = @import("ax_bindings.zig");

// ---------------------------------------------------------------------------
// Mutex shim
//
// Zig 0.16 removed `std.Thread.Mutex` / `std.Thread.Condition` in favor of
// the new `std.Io.Mutex` API that requires an `Io` instance. That doesn't
// match the "lock a struct field" pattern AXObserver.swift uses, so we
// inline a thin pthread-based Mutex here. Mirrors the pattern in
// `zig/src/core/sync.zig` (the Zig core's own shim) — kept local to this
// module to avoid a cross-tree dependency.
// ---------------------------------------------------------------------------

const c_mutex = struct {
    const pthread_mutex_t = extern struct {
        // Opaque pthread_mutex_t on Darwin — sized to fit the system layout.
        // sizeof(pthread_mutex_t) on macOS arm64 is 64 bytes (see
        // <sys/_pthread/_pthread_mutex_t.h>); we conservatively use 64.
        opaque_bytes: [64]u8 = [_]u8{0} ** 64,
    };

    // The `PTHREAD_MUTEX_INITIALIZER` constant expands to a specific struct
    // literal on Darwin (`{ _PTHREAD_MUTEX_SIG_init, {0} }`). The call
    // `pthread_mutex_init(&m, null)` produces the same state at runtime, so
    // we just call it in Mutex.init() rather than hardcode the macro body.
    extern "c" fn pthread_mutex_init(m: *pthread_mutex_t, attr: ?*anyopaque) c_int;
    extern "c" fn pthread_mutex_lock(m: *pthread_mutex_t) c_int;
    extern "c" fn pthread_mutex_unlock(m: *pthread_mutex_t) c_int;
    extern "c" fn pthread_mutex_destroy(m: *pthread_mutex_t) c_int;
};

const Mutex = struct {
    inner: c_mutex.pthread_mutex_t = .{},
    initialized: bool = false,

    fn ensureInit(self: *Mutex) void {
        if (!self.initialized) {
            _ = c_mutex.pthread_mutex_init(&self.inner, null);
            self.initialized = true;
        }
    }

    pub fn lock(self: *Mutex) void {
        self.ensureInit();
        _ = c_mutex.pthread_mutex_lock(&self.inner);
    }

    pub fn unlock(self: *Mutex) void {
        _ = c_mutex.pthread_mutex_unlock(&self.inner);
    }
};

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

/// Callback fired on every AX announcement. Invoked on the observer thread
/// in production; invoked synchronously by `debugEmit` in tests.
///
/// `ctx` is an opaque pointer the caller supplies at `Session.init`; it is
/// passed back verbatim on every callback invocation.
pub const EventCallback = *const fn (
    phrase: []const u8,
    ts_nanos: u64,
    role: ?[]const u8,
    name: ?[]const u8,
    ctx: *anyopaque,
) void;

/// Errors returned by `Session.start`. Mirrors the `NSError` codes produced
/// by `OgmiosRunnerService.swift` so a client can map them 1:1 on both sides
/// of the XPC boundary.
pub const AxError = error{
    /// Caller passed `target_pid <= 0`. Matches OgmiosRunnerService.swift:56.
    InvalidPid,
    /// `AXObserverCreateWithInfoCallback` failed (typically because the
    /// target process went away or the caller lacks AX TCC grants).
    CreateFailed,
    /// `AXObserverAddNotification` failed (observer went stale or the
    /// target app tree was inaccessible).
    AddNotificationFailed,
    /// Thread spawn failed — almost always OOM / ENOMEM.
    ThreadSpawnFailed,
    /// Allocating the CFString notification name failed.
    CfStringFailed,
};

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

pub const Session = struct {
    callback: EventCallback,
    ctx: *anyopaque,

    observer: ?ax.AXObserverRef = null,
    target_element: ?ax.AXUIElementRef = null,
    run_loop: ?ax.CFRunLoopRef = null,
    run_loop_source: ?ax.CFRunLoopSourceRef = null,
    notification_cfstring: ?ax.CFStringRef = null,
    observer_thread: ?std.Thread = null,

    started: bool = false,
    mu: Mutex = .{},

    // --- test-only hooks ---
    //
    // When `test_hook_enabled` is true, `start()` runs the pre-attach
    // guards (invalid-pid, already-started) and bumps `test_hook_attach_count`
    // instead of calling into the AX C API. This lets the unit tests in
    // `helper/test/ax_observer_test.zig` verify guard ordering without TCC.
    //
    // NOTE: Mirrors the `dispatchForTest` / `dispatch` split already in
    // `xpc_service.zig`. Production paths (main.zig) MUST NOT flip this on.
    test_hook_enabled: bool = false,
    test_hook_attach_count: u32 = 0,

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    pub fn init(callback: EventCallback, ctx: *anyopaque) Session {
        return .{
            .callback = callback,
            .ctx = ctx,
        };
    }

    /// Subscribe to announcement notifications for `target_pid`. Mirrors
    /// `AXObserverSession.start(targetAppPID:)` in AXObserver.swift:56.
    /// Idempotent: calling start twice returns without re-attaching.
    pub fn start(self: *Session, target_pid: ax.pid_t) AxError!void {
        if (target_pid <= 0) return AxError.InvalidPid;

        self.mu.lock();
        defer self.mu.unlock();

        // AXObserver.swift:58 — idempotent guard.
        if (self.started) return;

        // Test mode: skip the AX attach path entirely, just record that we
        // would have attached and flip `started` so callers see the same
        // state machine.
        if (self.test_hook_enabled) {
            self.test_hook_attach_count += 1;
            self.started = true;
            return;
        }

        // --- Production AX attach path ---------------------------------------
        //
        // 1. Create the observer bound to the target pid.
        // 2. Subscribe to kAXAnnouncementRequestedNotification on the app element.
        // 3. Spin a dedicated thread with its own CFRunLoop.
        // 4. Add the observer's runloop source to that thread's runloop.
        // 5. Run the runloop (blocks until stop()).

        var obs_out: ax.AXObserverRef = undefined;
        const create_err = ax.AXObserverCreateWithInfoCallback(
            target_pid,
            axCCallback,
            &obs_out,
        );
        if (create_err != ax.kAXErrorSuccess) return AxError.CreateFailed;
        self.observer = obs_out;

        const app_element = ax.AXUIElementCreateApplication(target_pid);
        self.target_element = app_element;

        // Build the notification name CFString once; we keep it around and
        // release it on stop().
        const notif_cf = ax.CFStringCreateWithCString(
            null,
            ax.kAXAnnouncementRequestedNotification,
            ax.kCFStringEncodingUTF8,
        );
        self.notification_cfstring = notif_cf;

        const add_err = ax.AXObserverAddNotification(
            obs_out,
            app_element,
            notif_cf,
            @ptrCast(self),
        );
        if (add_err != ax.kAXErrorSuccess) {
            ax.CFRelease(@ptrCast(notif_cf));
            self.notification_cfstring = null;
            self.observer = null;
            self.target_element = null;
            return AxError.AddNotificationFailed;
        }

        // Spin the dedicated observer thread. The Swift version uses
        // `Thread { ... }`; Zig's std.Thread.spawn is the equivalent.
        self.observer_thread = std.Thread.spawn(.{}, observerThreadMain, .{self}) catch {
            // Roll back any state created above.
            _ = ax.AXObserverRemoveNotification(obs_out, app_element, notif_cf);
            ax.CFRelease(@ptrCast(notif_cf));
            self.notification_cfstring = null;
            self.observer = null;
            self.target_element = null;
            return AxError.ThreadSpawnFailed;
        };

        self.started = true;
    }

    /// Tear down. Mirrors `AXObserverSession.stop()` in AXObserver.swift:110.
    /// No-op if the session was never started.
    pub fn stop(self: *Session) void {
        self.mu.lock();
        defer self.mu.unlock();

        // AXObserver.swift:111 — no-op guard.
        if (!self.started) return;

        if (self.test_hook_enabled) {
            // Test-mode sessions have no runloop / observer to tear down.
            self.started = false;
            return;
        }

        if (self.run_loop) |rl| {
            if (self.run_loop_source) |src| {
                ax.CFRunLoopRemoveSource(rl, src, ax.kCFRunLoopDefaultMode);
            }
            ax.CFRunLoopStop(rl);
        }

        // Join the observer thread so stop() is synchronous w.r.t. cleanup.
        if (self.observer_thread) |*t| {
            t.join();
        }

        if (self.notification_cfstring) |cf| {
            ax.CFRelease(@ptrCast(cf));
        }

        self.run_loop_source = null;
        self.run_loop = null;
        self.observer = null;
        self.target_element = null;
        self.notification_cfstring = null;
        self.observer_thread = null;
        self.started = false;
    }

    /// Returns whether `start()` has succeeded and `stop()` has not yet been
    /// called. Mirrors `AXObserverSession.isStarted` (the Swift computed var
    /// also takes the lock).
    pub fn isStarted(self: *Session) bool {
        self.mu.lock();
        defer self.mu.unlock();
        return self.started;
    }

    /// Test-only: invoke the user callback with synthetic values. Used by
    /// downstream XPC tests that want to simulate an AX event without a live
    /// AX runloop. Mirrors `AXObserverSession.debugEmit(phrase:tsNanos:role:name:)`.
    pub fn debugEmit(
        self: *Session,
        phrase: []const u8,
        ts_nanos: u64,
        role: ?[]const u8,
        name: ?[]const u8,
    ) void {
        self.callback(phrase, ts_nanos, role, name, self.ctx);
    }

    // -----------------------------------------------------------------------
    // Internal — observer thread body
    // -----------------------------------------------------------------------

    fn observerThreadMain(self: *Session) void {
        const rl = ax.CFRunLoopGetCurrent();
        // NOTE: we set these fields outside the session lock because only the
        // observer thread touches them before stop() is called. stop() takes
        // the lock AFTER we've populated them; it then reads them through the
        // lock and removes the source.
        self.run_loop = rl;
        if (self.observer) |obs| {
            const src = ax.AXObserverGetRunLoopSource(obs);
            self.run_loop_source = src;
            ax.CFRunLoopAddSource(rl, src, ax.kCFRunLoopDefaultMode);
        }
        ax.CFRunLoopRun();
    }

    // -----------------------------------------------------------------------
    // Internal — C-ABI AX callback
    // -----------------------------------------------------------------------
    //
    // AXObserverCallbackWithInfo signature:
    //     void (*)(AXObserverRef, AXUIElementRef, CFStringRef,
    //              CFDictionaryRef userInfo, void *refcon);
    //
    // `refcon` is the pointer we passed to AXObserverAddNotification — our
    // `*Session`. We extract the announcement phrase + optional element name
    // from `userInfo` (CFDictionary of CFString → CFString) and forward to
    // the user callback.

    fn axCCallback(
        _: ax.AXObserverRef,
        _: ax.AXUIElementRef,
        _: ax.CFStringRef,
        userInfo: ax.CFDictionaryRef,
        refcon: ?*anyopaque,
    ) callconv(.c) void {
        const self_ptr = refcon orelse return;
        const self: *Session = @ptrCast(@alignCast(self_ptr));

        // Build CFString keys on the fly; release when done.
        const announcement_key = ax.CFStringCreateWithCString(
            null,
            ax.kAXAnnouncementKey,
            ax.kCFStringEncodingUTF8,
        );
        defer ax.CFRelease(@ptrCast(announcement_key));

        const title_key = ax.CFStringCreateWithCString(
            null,
            ax.kAXUIElementTitleKey,
            ax.kCFStringEncodingUTF8,
        );
        defer ax.CFRelease(@ptrCast(title_key));

        const phrase_cf_raw = ax.CFDictionaryGetValue(userInfo, @ptrCast(announcement_key));
        const name_cf_raw = ax.CFDictionaryGetValue(userInfo, @ptrCast(title_key));

        // Each value is an (unretained) CFStringRef. CFStringGetCStringPtr
        // returns a direct pointer when it can; fall back to empty string
        // when it can't (rare — requires re-encoding into a local buffer).
        var phrase_buf: [512]u8 = undefined;
        var name_buf: [256]u8 = undefined;

        const phrase_slice: []const u8 = cfStringToSlice(
            @ptrCast(@constCast(phrase_cf_raw)),
            phrase_buf[0..],
        );

        const name_slice_opt: ?[]const u8 = if (name_cf_raw) |p|
            cfStringToSlice(@ptrCast(@constCast(p)), name_buf[0..])
        else
            null;

        // Nanosecond-precision timestamp matches Swift's
        // `UInt64(Date().timeIntervalSince1970 * 1_000_000_000)`.
        // Zig 0.16 removed std.time.nanoTimestamp; compute the same value
        // directly via clock_gettime (mirrors zig/src/core/clock.zig).
        const now_ns: u64 = blk: {
            var ts: std.c.timespec = undefined;
            _ = std.c.clock_gettime(std.c.clockid_t.REALTIME, &ts);
            const sec: u64 = @intCast(ts.sec);
            const nsec: u64 = @intCast(ts.nsec);
            break :blk sec * std.time.ns_per_s + nsec;
        };

        self.callback(phrase_slice, now_ns, null, name_slice_opt, self.ctx);
    }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract a `[]const u8` from a CFStringRef, falling back to the caller's
/// buffer when CFStringGetCStringPtr returns NULL. Returns an empty slice
/// if the CFString is null or unreadable.
fn cfStringToSlice(maybe_cf: ?ax.CFStringRef, buf: []u8) []const u8 {
    const cf = maybe_cf orelse return "";
    if (ax.CFStringGetCStringPtr(cf, ax.kCFStringEncodingUTF8)) |c| {
        return std.mem.span(c);
    }
    // Slow path — copy into buf. CFStringGetCString returns 0 on failure.
    const cap: ax.CFIndex = @intCast(buf.len);
    const ok = ax.CFStringGetCString(cf, buf.ptr, cap, ax.kCFStringEncodingUTF8);
    if (ok == 0) return "";
    // Length of the resulting C string (up to first NUL).
    return std.mem.sliceTo(buf, 0);
}
