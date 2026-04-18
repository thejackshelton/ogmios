const std = @import("std");
const defaults_mod = @import("defaults.zig");
const applescript_mod = @import("applescript.zig");
const opts_mod = @import("../../core/options.zig");
const sync_mod = @import("../../core/sync.zig");
const clock_mod = @import("../../core/clock.zig");
const c = std.c;

pub const SubprocessRunner = defaults_mod.SubprocessRunner;

// ---------------------------------------------------------------------------
// Snapshot file on-disk format (Plan 07-05)
//
// After snapshotSettings() captures the 9 plist keys into Lifecycle.snapshot,
// we ALSO write them to ~/.ogmios/vo-snapshot.plist (or $OGMIOS_SNAPSHOT_PATH).
// This is the SIGKILL-recovery escape hatch: even if the process dies without
// running any exit hooks (SIGKILL, power loss, OOM killer), `ogmios restore-vo-
// settings` can read this file and re-apply the original values via
// `defaults write`.
//
// Format: Apple plist XML 1.0 with the 9 VO keys + three `_ogmios_*` metadata
// keys (version magic, pid, timestamp). The restore CLI uses the version
// magic to refuse unrecognized files and the timestamp to enforce a 7-day TTL.
// ---------------------------------------------------------------------------

pub const SNAPSHOT_VERSION: u32 = 1;

/// Resolve the snapshot-file path: $OGMIOS_SNAPSHOT_PATH if set, else
/// $HOME/.ogmios/vo-snapshot.plist. Caller owns the returned string.
pub fn resolveSnapshotPath(allocator: std.mem.Allocator) ![]u8 {
    if (c.getenv("OGMIOS_SNAPSHOT_PATH")) |ptr| {
        const slice = std.mem.span(@as([*:0]const u8, ptr));
        if (slice.len > 0) return allocator.dupe(u8, slice);
    }
    const home_ptr = c.getenv("HOME") orelse return error.HomeNotSet;
    const home = std.mem.span(@as([*:0]const u8, home_ptr));
    return std.fmt.allocPrint(allocator, "{s}/.ogmios/vo-snapshot.plist", .{home});
}

/// Escape a string for safe inclusion inside a plist `<string>` element.
/// Minimal XML escaping — enough for the handful of VO voice names we see
/// in practice (e.g. "com.apple.speech.synthesis.voice.Alex").
fn appendEscapedXml(allocator: std.mem.Allocator, buf: *std.ArrayListUnmanaged(u8), s: []const u8) !void {
    for (s) |ch| switch (ch) {
        '&' => try buf.appendSlice(allocator, "&amp;"),
        '<' => try buf.appendSlice(allocator, "&lt;"),
        '>' => try buf.appendSlice(allocator, "&gt;"),
        else => try buf.append(allocator, ch),
    };
}

fn appendPlistEntry(
    allocator: std.mem.Allocator,
    buf: *std.ArrayListUnmanaged(u8),
    key_name: []const u8,
    value: defaults_mod.PlistValue,
) !void {
    try buf.appendSlice(allocator, "    <key>");
    try appendEscapedXml(allocator, buf, key_name);
    try buf.appendSlice(allocator, "</key>\n");
    switch (value) {
        .boolean => |b| {
            try buf.appendSlice(allocator, if (b) "    <true/>\n" else "    <false/>\n");
        },
        .integer => |n| {
            try buf.appendSlice(allocator, "    <integer>");
            var numbuf: [32]u8 = undefined;
            const s = try std.fmt.bufPrint(&numbuf, "{d}", .{n});
            try buf.appendSlice(allocator, s);
            try buf.appendSlice(allocator, "</integer>\n");
        },
        .string => |s| {
            try buf.appendSlice(allocator, "    <string>");
            try appendEscapedXml(allocator, buf, s);
            try buf.appendSlice(allocator, "</string>\n");
        },
        .missing => {
            // Emit a distinct marker so the restore CLI can round-trip
            // `.missing` → `defaults delete`. Plist has no native "absent"
            // value so we use an empty string wrapped in a sentinel dict.
            try buf.appendSlice(allocator, "    <string>__OGMIOS_MISSING__</string>\n");
        },
    }
}

fn appendPlistMetaInt(
    allocator: std.mem.Allocator,
    buf: *std.ArrayListUnmanaged(u8),
    key_name: []const u8,
    value: i64,
) !void {
    try buf.appendSlice(allocator, "    <key>");
    try buf.appendSlice(allocator, key_name);
    try buf.appendSlice(allocator, "</key>\n    <integer>");
    var numbuf: [32]u8 = undefined;
    const s = try std.fmt.bufPrint(&numbuf, "{d}", .{value});
    try buf.appendSlice(allocator, s);
    try buf.appendSlice(allocator, "</integer>\n");
}

/// Serialize a PlistSnapshot to plist XML with ogmios metadata keys.
/// Pure fn — no I/O — for ease of testing.
pub fn serializeSnapshot(
    allocator: std.mem.Allocator,
    snap: *const defaults_mod.PlistSnapshot,
    pid: i64,
    ts_unix: i64,
) ![]u8 {
    var buf: std.ArrayListUnmanaged(u8) = .empty;
    errdefer buf.deinit(allocator);

    try buf.appendSlice(allocator,
        \\<?xml version="1.0" encoding="UTF-8"?>
        \\<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        \\<plist version="1.0">
        \\<dict>
        \\
    );

    // Write the domain the snapshot came from so `ogmios restore-vo-settings`
    // writes back to the same place (Sonoma vs Sequoia+ Group Container path).
    try buf.appendSlice(allocator, "    <key>_ogmios_snapshot_domain</key>\n    <string>");
    try appendEscapedXml(allocator, &buf, snap.domain);
    try buf.appendSlice(allocator, "</string>\n");

    const catalog = defaults_mod.keyCatalog();
    var i: usize = 0;
    while (i < defaults_mod.CATALOG_LEN) : (i += 1) {
        try appendPlistEntry(allocator, &buf, catalog[i].name, snap.entries[i]);
    }

    try appendPlistMetaInt(allocator, &buf, "_ogmios_snapshot_version", @intCast(SNAPSHOT_VERSION));
    try appendPlistMetaInt(allocator, &buf, "_ogmios_snapshot_pid", pid);
    try appendPlistMetaInt(allocator, &buf, "_ogmios_snapshot_ts_unix", ts_unix);

    try buf.appendSlice(allocator, "</dict>\n</plist>\n");
    return buf.toOwnedSlice(allocator);
}

/// Recursively create parent directories via libc mkdir. Returns when the
/// directory already exists (EEXIST is treated as success).
fn makePathAll(allocator: std.mem.Allocator, dir: []const u8) !void {
    // Walk from root to leaf, calling mkdir on each prefix.
    var i: usize = 0;
    while (i < dir.len) {
        // Skip separators.
        while (i < dir.len and dir[i] == '/') : (i += 1) {}
        // Advance to next separator (or end).
        while (i < dir.len and dir[i] != '/') : (i += 1) {}
        const prefix = dir[0..i];
        if (prefix.len == 0) continue;
        const z = try allocator.dupeZ(u8, prefix);
        defer allocator.free(z);
        const rc = c.mkdir(z.ptr, 0o700);
        if (rc != 0) {
            // Accept EEXIST; fail on anything else.
            const errno_val = std.c._errno().*;
            const EEXIST: c_int = 17;
            if (errno_val != EEXIST) return error.MkdirFailed;
        }
    }
}

/// Write a plist snapshot to disk atomically (write to <path>.tmp, rename).
/// Creates parent directory if missing. File permission is 0600 (user-only).
pub fn writeSnapshotFile(
    allocator: std.mem.Allocator,
    snap: *const defaults_mod.PlistSnapshot,
    path: []const u8,
) !void {
    // Ensure parent dir exists.
    if (std.fs.path.dirname(path)) |dir| {
        try makePathAll(allocator, dir);
    }

    const pid: i64 = @intCast(std.c.getpid());
    // clock_mod.nanoTimestamp returns wall-clock nanoseconds since the epoch;
    // divide to get Unix seconds. This avoids depending on std.time.timestamp
    // which was removed in Zig 0.16.
    const ts_unix: i64 = @intCast(clock_mod.nanoTimestamp() / std.time.ns_per_s);

    const xml = try serializeSnapshot(allocator, snap, pid, ts_unix);
    defer allocator.free(xml);

    const tmp_path = try std.fmt.allocPrint(allocator, "{s}.tmp", .{path});
    defer allocator.free(tmp_path);
    const tmp_path_z = try allocator.dupeZ(u8, tmp_path);
    defer allocator.free(tmp_path_z);
    const path_z = try allocator.dupeZ(u8, path);
    defer allocator.free(path_z);

    var flags: std.c.O = .{};
    flags.ACCMODE = .WRONLY;
    flags.CREAT = true;
    flags.TRUNC = true;

    const mode_arg: c.mode_t = 0o600;
    const fd = c.open(tmp_path_z.ptr, flags, mode_arg);
    if (fd < 0) return error.OpenFailed;

    // Write in a loop until all bytes are committed.
    {
        defer _ = c.close(fd);
        var written: usize = 0;
        while (written < xml.len) {
            const n = c.write(fd, xml.ptr + written, xml.len - written);
            if (n < 0) return error.WriteFailed;
            const nz: usize = @intCast(n);
            if (nz == 0) return error.WriteFailed;
            written += nz;
        }
    }

    // Atomic rename.
    if (c.rename(tmp_path_z.ptr, path_z.ptr) != 0) return error.RenameFailed;
}

/// Delete the snapshot file if it exists. Called on clean stopHandle — a
/// stale file means the last ogmios run crashed without running cleanup.
pub fn deleteSnapshotFile(path: []const u8) void {
    // Best-effort — absent is fine.
    var pathbuf: [std.posix.PATH_MAX]u8 = undefined;
    if (path.len >= pathbuf.len) return;
    @memcpy(pathbuf[0..path.len], path);
    pathbuf[path.len] = 0;
    const path_z: [*:0]const u8 = @ptrCast(&pathbuf);
    _ = c.unlink(path_z);
}

/// Test-only re-export so test files can exercise writeSnapshotFile without
/// spinning up a full Lifecycle.startHandle.
pub const writeSnapshotFileForTest = writeSnapshotFile;
pub const serializeSnapshotForTest = serializeSnapshot;

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

        // 3. Snapshot current plist values BEFORE writing ogmios defaults.
        self.snapshot = try defaults_mod.snapshotSettings(self.allocator, self.runner, dom);

        // 3b. Persist snapshot to disk for SIGKILL recovery (Plan 07-05).
        // If this fails we still proceed — the in-memory snapshot is enough
        // for graceful shutdown; we only lose the crash-recovery escape hatch.
        if (self.snapshot) |*snap| {
            const snap_path = resolveSnapshotPath(self.allocator) catch null;
            if (snap_path) |p| {
                defer self.allocator.free(p);
                writeSnapshotFile(self.allocator, snap, p) catch |err| {
                    std.log.warn("writeSnapshotFile failed: {s}", .{@errorName(err)});
                };
            }
        }

        // 4. Write ogmios defaults.
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

        // 4b. Delete the on-disk snapshot — clean shutdown means we don't
        // need the SIGKILL-recovery escape hatch anymore. If the file is
        // still present on next boot, something crashed (Plan 07-05).
        if (resolveSnapshotPath(self.allocator) catch null) |p| {
            defer self.allocator.free(p);
            deleteSnapshotFile(p);
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
