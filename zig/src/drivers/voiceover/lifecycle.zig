const std = @import("std");
const defaults_mod = @import("defaults.zig");
const applescript_mod = @import("applescript.zig");
const opts_mod = @import("../../core/options.zig");
const sync_mod = @import("../../core/sync.zig");
const clock_mod = @import("../../core/clock.zig");
const c = std.c;

pub const SubprocessRunner = defaults_mod.SubprocessRunner;

// ---------------------------------------------------------------------------
// Clock — local redeclaration to avoid a circular dependency with applescript.zig
// (which also defines Clock). Plan 05 unifies these into a single Clock import.
// The shape is intentionally identical so the two can interoperate via ptrCast.
// ---------------------------------------------------------------------------

pub const Clock = struct {
    ctx: *anyopaque,
    now_nanos_fn: *const fn (ctx: *anyopaque) u64,
    sleep_ms_fn: *const fn (ctx: *anyopaque, ms: u32) void,

    pub fn nowNanos(self: Clock) u64 {
        return self.now_nanos_fn(self.ctx);
    }
    pub fn sleepMs(self: Clock, ms: u32) void {
        self.sleep_ms_fn(self.ctx, ms);
    }
};

fn realNowNanos(_: *anyopaque) u64 {
    return clock_mod.nanoTimestamp();
}
fn realSleepMs(_: *anyopaque, ms: u32) void {
    clock_mod.sleepMs(ms);
}

var real_clock_ctx_sentinel: u8 = 0;
pub const realClock: Clock = .{
    .ctx = @ptrCast(&real_clock_ctx_sentinel),
    .now_nanos_fn = realNowNanos,
    .sleep_ms_fn = realSleepMs,
};

// ---------------------------------------------------------------------------
// Process verification helpers — pgrep / pkill
// ---------------------------------------------------------------------------

/// Returns true iff `pgrep -x VoiceOver` reports a running VoiceOver process.
/// pgrep exit codes: 0 = match found, 1 = no match (NOT an error), anything else = failure.
pub fn isVoiceOverRunning(allocator: std.mem.Allocator, runner: SubprocessRunner) !bool {
    const argv = [_][]const u8{ "/usr/bin/pgrep", "-x", "VoiceOver" };
    var result = try runner.run(allocator, &argv);
    defer result.deinit(allocator);
    return switch (result.exit_code) {
        0 => true,
        1 => false,
        else => error.PgrepFailed,
    };
}

/// Force-kill VoiceOver via `pkill -9 -x VoiceOver`.
/// pkill exit codes: 0 = killed, 1 = no match (idempotent — treat as ok), anything else = failure.
pub fn forceKillVO(allocator: std.mem.Allocator, runner: SubprocessRunner) !void {
    const argv = [_][]const u8{ "/usr/bin/pkill", "-9", "-x", "VoiceOver" };
    var result = try runner.run(allocator, &argv);
    defer result.deinit(allocator);
    switch (result.exit_code) {
        0, 1 => return,
        else => return error.PkillFailed,
    }
}

/// Poll `isVoiceOverRunning` every 100ms until VO exits or timeout elapses.
/// Returns true if VO exited in time; false on timeout.
pub fn waitForVOExit(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    clock: Clock,
    timeout_ms: u32,
) !bool {
    const poll_interval_ms: u32 = 100;
    var elapsed: u32 = 0;
    while (elapsed < timeout_ms) {
        const running = try isVoiceOverRunning(allocator, runner);
        if (!running) return true;
        clock.sleepMs(poll_interval_ms);
        elapsed += poll_interval_ms;
    }
    // One final check after the last sleep.
    const running = try isVoiceOverRunning(allocator, runner);
    return !running;
}

/// If VoiceOver is running at start time, force-kill it and wait up to 2s for
/// it to exit. Returns error.VOFailedToExit if VO is still alive after the
/// timeout. This is the "startup reconciliation" path from CONTEXT.md: we
/// trade preserving the user's VO state for deterministic test sessions.
pub fn reconcileStaleVO(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    clock: Clock,
) !void {
    const running = try isVoiceOverRunning(allocator, runner);
    if (!running) return;
    try forceKillVO(allocator, runner);
    const exited = try waitForVOExit(allocator, runner, clock, 2000);
    if (!exited) return error.VOFailedToExit;
}

// ---------------------------------------------------------------------------
// Lifecycle — refcounted session state: boot, stop, crash-restore.
// ---------------------------------------------------------------------------

/// AppleScript commands (verbatim from 03-CONTEXT.md boot_script).
const BOOT_SCRIPT = "tell application \"VoiceOver\" to activate";
const QUIT_SCRIPT = "tell application \"VoiceOver\" to quit";

pub const Lifecycle = struct {
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    clock: Clock,
    spawner: applescript_mod.ChildProcessSpawner,
    options: opts_mod.InitOptions,
    /// Owned plist domain string (resolved at first startHandle or provided by test).
    domain: ?[]const u8 = null,
    refcount: u32 = 0,
    snapshot: ?defaults_mod.PlistSnapshot = null,
    shell: ?*applescript_mod.OsascriptShell = null,
    mutex: sync_mod.Mutex = .init,
    /// Test seam: override the plist domain so tests don't need to shell out to sw_vers.
    domain_override: ?[]const u8 = null,
    /// Test observable — flipped true by crashRestore when the exit hooks fire.
    crash_restore_called: bool = false,

    pub fn init(
        allocator: std.mem.Allocator,
        runner: SubprocessRunner,
        clock: Clock,
        spawner: applescript_mod.ChildProcessSpawner,
        options: opts_mod.InitOptions,
    ) !Lifecycle {
        return .{
            .allocator = allocator,
            .runner = runner,
            .clock = clock,
            .spawner = spawner,
            .options = options,
        };
    }

    pub fn deinit(self: *Lifecycle) void {
        if (self.snapshot) |*snap| {
            snap.deinit();
            self.snapshot = null;
        }
        if (self.shell) |shell_ptr| {
            shell_ptr.deinit();
            self.allocator.destroy(shell_ptr);
            self.shell = null;
        }
        if (self.domain) |d| {
            self.allocator.free(d);
            self.domain = null;
        }
    }

    /// Override the plist domain — tests use this so they don't have to shell
    /// out to `sw_vers` + compute the Group Container path. Production callers
    /// leave this null; resolveDomain will detect the macOS version instead.
    pub fn setDomainOverride(self: *Lifecycle, domain: []const u8) void {
        self.domain_override = domain;
    }

    /// Resolve the plist domain — test-injected override wins; otherwise
    /// delegate to defaults.detectMacOSVersion + resolvePlistDomain.
    fn resolveDomain(self: *Lifecycle) ![]const u8 {
        if (self.domain_override) |d| return self.allocator.dupe(u8, d);
        const version = try defaults_mod.detectMacOSVersion(self.allocator);
        const home = try defaults_mod.detectHomeDir(self.allocator);
        defer self.allocator.free(home);
        return defaults_mod.resolvePlistDomain(self.allocator, version, home);
    }

    /// Expose the OsascriptShell so Plan 05 (driver glue) can hand it to PollLoop.
    pub fn getShell(self: *Lifecycle) ?*applescript_mod.OsascriptShell {
        return self.shell;
    }

    /// First caller boots VO + snapshots plist; subsequent callers just refcount.
    /// Idempotent across reentrant starts (CAP-01). Reconciles any stale VO
    /// BEFORE taking the snapshot so we don't capture a corrupted state.
    pub fn startHandle(self: *Lifecycle) !void {
        self.mutex.lock();
        defer self.mutex.unlock();

        if (self.refcount > 0) {
            self.refcount += 1;
            return;
        }

        // 1. Reconcile any stale VO process from a prior crashed run.
        try reconcileStaleVO(self.allocator, self.runner, self.clock);

        // 2. Resolve domain (tests override; production detects).
        const dom = try self.resolveDomain();
        self.domain = dom;

        // 3. Snapshot current plist values BEFORE writing shoki defaults.
        self.snapshot = try defaults_mod.snapshotSettings(self.allocator, self.runner, dom);

        // 4. Write shoki defaults.
        try defaults_mod.configureSettings(self.allocator, self.runner, dom, self.options);

        // 5. Spawn the long-lived osascript shell.
        const shell_ptr = try self.allocator.create(applescript_mod.OsascriptShell);
        errdefer self.allocator.destroy(shell_ptr);
        shell_ptr.* = try applescript_mod.OsascriptShell.init(self.allocator, self.spawner);
        self.shell = shell_ptr;

        // 6. Send the activation script.
        const reply = try shell_ptr.sendAndReceive(BOOT_SCRIPT, 5000);
        self.allocator.free(reply);

        // 7. Wait up to 2s for VO to appear in pgrep. Hard-fails per CAP-01.
        if (!try waitForVOBoot(self.allocator, self.runner, self.clock, 2000)) {
            return error.VOFailedToBoot;
        }

        self.refcount = 1;
    }

    /// Decrement refcount. Last stop quits VO (soft → force-kill fallback) and
    /// restores the plist snapshot.
    pub fn stopHandle(self: *Lifecycle) !void {
        self.mutex.lock();
        defer self.mutex.unlock();

        if (self.refcount == 0) return; // defensive
        self.refcount -= 1;
        if (self.refcount > 0) return;

        // 1. Soft-quit via shell (swallow errors — osascript may die mid-quit).
        if (self.shell) |shell_ptr| {
            const reply = shell_ptr.sendAndReceive(QUIT_SCRIPT, 2000) catch null;
            if (reply) |r| self.allocator.free(r);
        }

        // 2. Wait 100ms for last events to flush (CONTEXT.md D-04 step 5).
        self.clock.sleepMs(100);

        // 3. waitForVOExit 1s; if still running, escalate to forceKillVO.
        const exited = try waitForVOExit(self.allocator, self.runner, self.clock, 1000);
        if (!exited) {
            try forceKillVO(self.allocator, self.runner);
            _ = try waitForVOExit(self.allocator, self.runner, self.clock, 1000);
        }

        // 4. Restore plist snapshot.
        if (self.snapshot) |*snap| {
            try defaults_mod.restoreSettings(self.allocator, self.runner, snap);
            snap.deinit();
            self.snapshot = null;
        }

        // 5. Tear down the osascript shell.
        if (self.shell) |shell_ptr| {
            shell_ptr.deinit();
            self.allocator.destroy(shell_ptr);
            self.shell = null;
        }

        if (self.domain) |d| {
            self.allocator.free(d);
            self.domain = null;
        }
    }

    /// Non-throwing, best-effort restore called by signal handlers. Does NOT
    /// take the mutex (signal handlers run on the signal-delivery thread and
    /// must be async-signal-safe-ish; a poisoned mutex here would deadlock).
    /// Never frees resources — the process is about to die.
    ///
    /// T-03-20 note: this path avoids heap allocation beyond what restoreSettings
    /// already does (fork+exec is signal-safe).
    pub fn crashRestore(self: *Lifecycle) void {
        self.crash_restore_called = true;
        if (self.snapshot) |*snap| {
            defaults_mod.restoreSettings(self.allocator, self.runner, snap) catch |err| {
                std.log.warn("crashRestore: restoreSettings failed: {s}", .{@errorName(err)});
            };
        }
        forceKillVO(self.allocator, self.runner) catch |err| {
            std.log.warn("crashRestore: forceKillVO failed: {s}", .{@errorName(err)});
        };
    }
};

/// Helper: poll pgrep every 100ms, return true as soon as VO appears.
fn waitForVOBoot(
    allocator: std.mem.Allocator,
    runner: SubprocessRunner,
    clock: Clock,
    timeout_ms: u32,
) !bool {
    const poll_interval_ms: u32 = 100;
    var elapsed: u32 = 0;
    while (elapsed < timeout_ms) {
        const running = try isVoiceOverRunning(allocator, runner);
        if (running) return true;
        clock.sleepMs(poll_interval_ms);
        elapsed += poll_interval_ms;
    }
    const running = try isVoiceOverRunning(allocator, runner);
    return running;
}

// ---------------------------------------------------------------------------
// Native exit hooks — SIGINT, SIGTERM, SIGHUP → crashRestore.
//
// TS-side process.on('uncaughtException' | 'unhandledRejection') is handled
// by the SDK (Plan 06 in a separate wave); the signal handlers here are the
// last line of defense when TS unwind doesn't run (CONTEXT.md D-04 rule).
// ---------------------------------------------------------------------------

var active_lifecycle: std.atomic.Value(?*Lifecycle) = std.atomic.Value(?*Lifecycle).init(null);
var hooks_installed: std.atomic.Value(bool) = std.atomic.Value(bool).init(false);

/// Saved prior-disposition for each hooked signal, set by installExitHooks and
/// reinstalled by uninstallExitHooks.
var prev_sigint: std.c.Sigaction = undefined;
var prev_sigterm: std.c.Sigaction = undefined;
var prev_sighup: std.c.Sigaction = undefined;

fn signalHandler(sig: std.c.SIG) callconv(.c) void {
    const maybe = active_lifecycle.load(.acquire);
    if (maybe) |lc| lc.crashRestore();
    // Re-raise with default disposition so the process actually dies.
    var dfl: std.c.Sigaction = .{
        .handler = .{ .handler = std.c.SIG.DFL },
        .mask = std.mem.zeroes(std.c.sigset_t),
        .flags = 0,
    };
    _ = std.c.sigaction(sig, &dfl, null);
    _ = std.c.raise(sig);
}

/// Register crash-restore handlers for SIGINT, SIGTERM, SIGHUP. Idempotent.
/// SIGKILL is unhandleable — documented in Plan 07's crash-recovery test.
pub fn installExitHooks(lc: *Lifecycle) void {
    active_lifecycle.store(lc, .release);

    if (hooks_installed.load(.acquire)) return;

    var sa: std.c.Sigaction = .{
        .handler = .{ .handler = signalHandler },
        .mask = std.mem.zeroes(std.c.sigset_t),
        .flags = 0,
    };

    _ = std.c.sigaction(.INT, &sa, &prev_sigint);
    _ = std.c.sigaction(.TERM, &sa, &prev_sigterm);
    _ = std.c.sigaction(.HUP, &sa, &prev_sighup);

    hooks_installed.store(true, .release);
}

/// Restore the previously-installed signal handlers for SIGINT/SIGTERM/SIGHUP
/// and clear the active_lifecycle pointer. Idempotent.
pub fn uninstallExitHooks() void {
    if (hooks_installed.load(.acquire)) {
        _ = std.c.sigaction(.INT, &prev_sigint, null);
        _ = std.c.sigaction(.TERM, &prev_sigterm, null);
        _ = std.c.sigaction(.HUP, &prev_sighup, null);
        hooks_installed.store(false, .release);
    }
    active_lifecycle.store(null, .release);
}

/// Test-only accessor for the active_lifecycle atomic.
pub fn debugGetActiveLifecycle() ?*Lifecycle {
    return active_lifecycle.load(.acquire);
}

/// Test-only accessor for the hooks_installed atomic.
pub fn debugHooksInstalled() bool {
    return hooks_installed.load(.acquire);
}
