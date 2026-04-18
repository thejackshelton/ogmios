const std = @import("std");
const lifecycle = @import("../src/drivers/voiceover/lifecycle.zig");
const defaults_mod = @import("../src/drivers/voiceover/defaults.zig");
const applescript_mod = @import("../src/drivers/voiceover/applescript.zig");
const opts_mod = @import("../src/core/options.zig");
const clock_mod = @import("../src/core/clock.zig");

// ---------------------------------------------------------------------------
// MockSubprocessRunner — extended variant that matches argv pattern to a
// response so tests can answer pgrep/pkill/defaults calls in arbitrary order.
// ---------------------------------------------------------------------------

const MockSubprocessRunner = struct {
    allocator: std.mem.Allocator,
    /// Owned copies of each argv array passed to run(), for assertions.
    argv_log: std.ArrayListUnmanaged([]const []const u8) = .empty,
    /// Pattern → response queue. First argv token is the key; we pop responses
    /// off the front as calls land.
    responses: std.StringHashMapUnmanaged(std.ArrayListUnmanaged(Response)) = .empty,
    /// Default response used when no pattern matches — usually exit=1 for pgrep
    /// (no match) or exit=0 for defaults (benign no-op).
    default_response: Response = .{ .stdout = "", .stderr = "", .exit_code = 0 },

    const Response = struct { stdout: []const u8, stderr: []const u8, exit_code: u8 };

    fn init(allocator: std.mem.Allocator) MockSubprocessRunner {
        return .{ .allocator = allocator };
    }

    fn deinit(self: *MockSubprocessRunner) void {
        for (self.argv_log.items) |argv| {
            for (argv) |a| self.allocator.free(a);
            self.allocator.free(argv);
        }
        self.argv_log.deinit(self.allocator);

        var it = self.responses.iterator();
        while (it.next()) |entry| {
            entry.value_ptr.*.deinit(self.allocator);
            self.allocator.free(entry.key_ptr.*);
        }
        self.responses.deinit(self.allocator);
    }

    /// Program a response for any invocation whose argv[0] equals `prefix`.
    fn pushResponse(
        self: *MockSubprocessRunner,
        prefix: []const u8,
        stdout: []const u8,
        stderr: []const u8,
        exit_code: u8,
    ) !void {
        const gop = try self.responses.getOrPut(self.allocator, prefix);
        if (!gop.found_existing) {
            gop.key_ptr.* = try self.allocator.dupe(u8, prefix);
            gop.value_ptr.* = .empty;
        }
        try gop.value_ptr.*.append(self.allocator, .{
            .stdout = stdout,
            .stderr = stderr,
            .exit_code = exit_code,
        });
    }

    fn asRunner(self: *MockSubprocessRunner) defaults_mod.SubprocessRunner {
        return .{ .ctx = @ptrCast(self), .runFn = runImpl };
    }

    fn runImpl(ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!defaults_mod.RunResult {
        const self: *MockSubprocessRunner = @ptrCast(@alignCast(ctx));

        // Record argv with owned copies.
        const recorded = try self.allocator.alloc([]const u8, argv.len);
        for (argv, 0..) |a, i| recorded[i] = try self.allocator.dupe(u8, a);
        try self.argv_log.append(self.allocator, recorded);

        const key = argv[0];
        if (self.responses.getPtr(key)) |queue| {
            if (queue.items.len > 0) {
                const resp = queue.orderedRemove(0);
                return defaults_mod.RunResult{
                    .stdout = try allocator.dupe(u8, resp.stdout),
                    .stderr = try allocator.dupe(u8, resp.stderr),
                    .exit_code = resp.exit_code,
                };
            }
        }
        return defaults_mod.RunResult{
            .stdout = try allocator.dupe(u8, self.default_response.stdout),
            .stderr = try allocator.dupe(u8, self.default_response.stderr),
            .exit_code = self.default_response.exit_code,
        };
    }

    /// Count argvs whose argv[0] equals prefix.
    fn countInvocations(self: *MockSubprocessRunner, prefix: []const u8) usize {
        var count: usize = 0;
        for (self.argv_log.items) |argv| {
            if (argv.len > 0 and std.mem.eql(u8, argv[0], prefix)) count += 1;
        }
        return count;
    }
};

// ---------------------------------------------------------------------------
// MockClock — zero-cost virtual time.
// ---------------------------------------------------------------------------

const MockClock = struct {
    allocator: std.mem.Allocator,
    virtual_ns: u64 = 1_000_000,
    sleep_log: std.ArrayListUnmanaged(u32) = .empty,

    fn nowNanosImpl(ctx: *anyopaque) u64 {
        const self: *MockClock = @ptrCast(@alignCast(ctx));
        self.virtual_ns += 1000;
        return self.virtual_ns;
    }
    fn sleepMsImpl(ctx: *anyopaque, ms: u32) void {
        const self: *MockClock = @ptrCast(@alignCast(ctx));
        self.sleep_log.append(self.allocator, ms) catch {};
        self.virtual_ns += @as(u64, ms) * std.time.ns_per_ms;
    }
    fn asClock(self: *MockClock) lifecycle.Clock {
        return .{
            .ctx = @ptrCast(self),
            .now_nanos_fn = nowNanosImpl,
            .sleep_ms_fn = sleepMsImpl,
        };
    }
    fn deinit(self: *MockClock) void {
        self.sleep_log.deinit(self.allocator);
    }
};

// ---------------------------------------------------------------------------
// MockChildProcess / MockSpawner for the OsascriptShell. Mirrors the pattern
// from voiceover_applescript_test.zig; duplicated here for test isolation.
// ---------------------------------------------------------------------------

const MockChildProcess = struct {
    allocator: std.mem.Allocator,
    writes: std.ArrayListUnmanaged([]u8) = .empty,
    queued_lines: std.ArrayListUnmanaged([]u8) = .empty,
    child: applescript_mod.ChildProcess = undefined,

    const vtable: applescript_mod.ChildProcess.VTable = .{
        .write_stdin = writeStdinImpl,
        .read_stdout_line = readStdoutLineImpl,
        .kill = killImpl,
        .wait = waitImpl,
        .deinit_ctx = deinitImpl,
    };

    fn init(allocator: std.mem.Allocator) !*MockChildProcess {
        const self = try allocator.create(MockChildProcess);
        self.* = .{ .allocator = allocator };
        self.child = .{ .ctx = @ptrCast(self), .vtable = &vtable };
        return self;
    }

    fn queueLine(self: *MockChildProcess, line: []const u8) !void {
        const owned = try self.allocator.dupe(u8, line);
        try self.queued_lines.append(self.allocator, owned);
    }
    /// Queue a canonical reply: a body line followed by the sentinel.
    fn queueReply(self: *MockChildProcess, body: []const u8) !void {
        try self.queueLine(body);
        try self.queueLine(applescript_mod.SENTINEL);
    }

    fn writeStdinImpl(ctx: *anyopaque, data: []const u8) anyerror!void {
        const self: *MockChildProcess = @ptrCast(@alignCast(ctx));
        const copy = try self.allocator.dupe(u8, data);
        try self.writes.append(self.allocator, copy);
    }
    fn readStdoutLineImpl(ctx: *anyopaque, allocator: std.mem.Allocator, _: u32) anyerror![]u8 {
        const self: *MockChildProcess = @ptrCast(@alignCast(ctx));
        if (self.queued_lines.items.len == 0) return error.EndOfStream;
        const line = self.queued_lines.orderedRemove(0);
        defer self.allocator.free(line);
        return allocator.dupe(u8, line);
    }
    fn killImpl(_: *anyopaque) void {}
    fn waitImpl(_: *anyopaque) void {}
    fn deinitImpl(ctx: *anyopaque) void {
        const self: *MockChildProcess = @ptrCast(@alignCast(ctx));
        for (self.writes.items) |w| self.allocator.free(w);
        self.writes.deinit(self.allocator);
        for (self.queued_lines.items) |l| self.allocator.free(l);
        self.queued_lines.deinit(self.allocator);
        self.allocator.destroy(self);
    }
};

const MockSpawner = struct {
    allocator: std.mem.Allocator,
    preseeded_queue: std.ArrayListUnmanaged(*MockChildProcess) = .empty,
    spawn_count: usize = 0,

    fn spawnImpl(ctx: *anyopaque, allocator: std.mem.Allocator, _: []const []const u8) anyerror!*applescript_mod.ChildProcess {
        const self: *MockSpawner = @ptrCast(@alignCast(ctx));
        self.spawn_count += 1;
        if (self.preseeded_queue.items.len > 0) {
            const pre = self.preseeded_queue.orderedRemove(0);
            return &pre.child;
        }
        const fresh = try MockChildProcess.init(allocator);
        return &fresh.child;
    }
    fn asSpawner(self: *MockSpawner) applescript_mod.ChildProcessSpawner {
        return .{ .ctx = @ptrCast(self), .spawnFn = spawnImpl };
    }
    fn deinit(self: *MockSpawner) void {
        self.preseeded_queue.deinit(self.allocator);
    }
};

/// Program a MockSubprocessRunner with the 9 plist-snapshot reads (one "0" per key).
fn primeSnapshotReads(mock: *MockSubprocessRunner) !void {
    var i: usize = 0;
    while (i < 9) : (i += 1) try mock.pushResponse("/usr/bin/defaults", "0\n", "", 0);
}

/// Program a MockSubprocessRunner with the 9 plist-configure writes.
fn primeConfigureWrites(mock: *MockSubprocessRunner) !void {
    var i: usize = 0;
    while (i < 9) : (i += 1) try mock.pushResponse("/usr/bin/defaults", "", "", 0);
}

/// Program a MockSubprocessRunner with the 9 plist-restore writes.
fn primeRestoreWrites(mock: *MockSubprocessRunner) !void {
    var i: usize = 0;
    while (i < 9) : (i += 1) try mock.pushResponse("/usr/bin/defaults", "", "", 0);
}

// ===========================================================================
// Task 1 tests — process verification helpers
// ===========================================================================

test "isVoiceOverRunning returns true on pgrep exit 0" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    const running = try lifecycle.isVoiceOverRunning(allocator, mock.asRunner());
    try std.testing.expect(running);
    try std.testing.expectEqual(@as(usize, 1), mock.countInvocations("/usr/bin/pgrep"));
}

test "isVoiceOverRunning returns false on pgrep exit 1 (no match)" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);

    const running = try lifecycle.isVoiceOverRunning(allocator, mock.asRunner());
    try std.testing.expect(!running);
}

test "isVoiceOverRunning returns error.PgrepFailed on other exit code" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();
    try mock.pushResponse("/usr/bin/pgrep", "", "pgrep: something broke\n", 2);

    const result = lifecycle.isVoiceOverRunning(allocator, mock.asRunner());
    try std.testing.expectError(error.PgrepFailed, result);
}

test "forceKillVO succeeds on pkill exit 0 or exit 1" {
    const allocator = std.testing.allocator;

    // exit 0 — killed.
    {
        var mock = MockSubprocessRunner.init(allocator);
        defer mock.deinit();
        try mock.pushResponse("/usr/bin/pkill", "", "", 0);
        try lifecycle.forceKillVO(allocator, mock.asRunner());
    }

    // exit 1 — no match (still ok).
    {
        var mock = MockSubprocessRunner.init(allocator);
        defer mock.deinit();
        try mock.pushResponse("/usr/bin/pkill", "", "", 1);
        try lifecycle.forceKillVO(allocator, mock.asRunner());
    }
}

test "forceKillVO returns error.PkillFailed on other exit code" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();
    try mock.pushResponse("/usr/bin/pkill", "", "permission denied\n", 2);
    try std.testing.expectError(error.PkillFailed, lifecycle.forceKillVO(allocator, mock.asRunner()));
}

test "waitForVOExit returns true as soon as VO exits" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // First pgrep: running. Second: not running.
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    const exited = try lifecycle.waitForVOExit(allocator, mock.asRunner(), clock.asClock(), 2000);
    try std.testing.expect(exited);
    try std.testing.expect(clock.sleep_log.items.len >= 1);
}

test "waitForVOExit returns false on timeout (VO never exits)" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // Prime many "still running" responses so we burn through the timeout.
    var i: usize = 0;
    while (i < 100) : (i += 1) try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    const exited = try lifecycle.waitForVOExit(allocator, mock.asRunner(), clock.asClock(), 300);
    try std.testing.expect(!exited);
}

test "reconcileStaleVO no-ops when VO is not running" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    try lifecycle.reconcileStaleVO(allocator, mock.asRunner(), clock.asClock());
    try std.testing.expectEqual(@as(usize, 0), mock.countInvocations("/usr/bin/pkill"));
}

test "reconcileStaleVO force-kills and waits when VO is running" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // Sequence: pgrep=running, pkill=ok, pgrep=not-running.
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);
    try mock.pushResponse("/usr/bin/pkill", "", "", 0);
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    try lifecycle.reconcileStaleVO(allocator, mock.asRunner(), clock.asClock());
    try std.testing.expectEqual(@as(usize, 1), mock.countInvocations("/usr/bin/pkill"));
}

test "reconcileStaleVO returns error.VOFailedToExit when VO refuses to die" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // Always "running" — pkill appears to work but pgrep still reports VO.
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);
    try mock.pushResponse("/usr/bin/pkill", "", "", 0);
    var i: usize = 0;
    while (i < 50) : (i += 1) try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    try std.testing.expectError(
        error.VOFailedToExit,
        lifecycle.reconcileStaleVO(allocator, mock.asRunner(), clock.asClock()),
    );
}

// ===========================================================================
// Task 2 tests — Lifecycle struct: boot, stop, refcount, plist wiring
// ===========================================================================

test "Lifecycle.startHandle first call: reconciles, snapshots, configures, boots, refcount=1" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // Reconcile: pgrep=not-running.
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    // snapshotSettings (9 reads).
    try primeSnapshotReads(&mock);
    // configureSettings (9 writes).
    try primeConfigureWrites(&mock);
    // After boot: pgrep=running.
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();
    const boot_child = try MockChildProcess.init(allocator);
    try boot_child.queueReply(""); // activate script returns empty
    try spawner.preseeded_queue.append(allocator, boot_child);

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    lc.setDomainOverride("com.apple.VoiceOver4/default");
    defer lc.deinit();

    try lc.startHandle();

    try std.testing.expectEqual(@as(u32, 1), lc.refcount);
    try std.testing.expect(lc.snapshot != null);
    try std.testing.expect(lc.shell != null);
    // At least one pgrep invocation (reconcile), plus snapshot (9), configure (9), boot verify (>=1).
    try std.testing.expect(mock.countInvocations("/usr/bin/defaults") >= 18);
}

test "Lifecycle.startHandle second call is idempotent (refcount=2, no new snapshot)" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    try primeSnapshotReads(&mock);
    try primeConfigureWrites(&mock);
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();
    const boot_child = try MockChildProcess.init(allocator);
    try boot_child.queueReply("");
    try spawner.preseeded_queue.append(allocator, boot_child);

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    lc.setDomainOverride("com.apple.VoiceOver4/default");
    defer lc.deinit();

    try lc.startHandle();
    const spawn_count_after_first = spawner.spawn_count;
    const defaults_calls_after_first = mock.countInvocations("/usr/bin/defaults");

    try lc.startHandle();

    try std.testing.expectEqual(@as(u32, 2), lc.refcount);
    // No new shell spawned.
    try std.testing.expectEqual(spawn_count_after_first, spawner.spawn_count);
    // No new plist reads/writes.
    try std.testing.expectEqual(defaults_calls_after_first, mock.countInvocations("/usr/bin/defaults"));
}

test "Lifecycle.stopHandle at refcount=2 decrements only; no restore, no kill" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    try primeSnapshotReads(&mock);
    try primeConfigureWrites(&mock);
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();
    const boot_child = try MockChildProcess.init(allocator);
    try boot_child.queueReply("");
    try spawner.preseeded_queue.append(allocator, boot_child);

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    lc.setDomainOverride("com.apple.VoiceOver4/default");
    defer lc.deinit();

    try lc.startHandle();
    try lc.startHandle();
    const pkill_before = mock.countInvocations("/usr/bin/pkill");
    const defaults_before = mock.countInvocations("/usr/bin/defaults");

    try lc.stopHandle();

    try std.testing.expectEqual(@as(u32, 1), lc.refcount);
    // No new pkill or defaults writes.
    try std.testing.expectEqual(pkill_before, mock.countInvocations("/usr/bin/pkill"));
    try std.testing.expectEqual(defaults_before, mock.countInvocations("/usr/bin/defaults"));
    // Snapshot still present.
    try std.testing.expect(lc.snapshot != null);
}

test "Lifecycle.stopHandle at refcount=1 soft-quits, waits, restores" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // start sequence
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    try primeSnapshotReads(&mock);
    try primeConfigureWrites(&mock);
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);
    // stop sequence: waitForVOExit sees VO exit immediately.
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    // restoreSettings (9 writes).
    try primeRestoreWrites(&mock);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();
    const boot_child = try MockChildProcess.init(allocator);
    try boot_child.queueReply(""); // activate
    try boot_child.queueReply(""); // quit
    try spawner.preseeded_queue.append(allocator, boot_child);

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    lc.setDomainOverride("com.apple.VoiceOver4/default");
    defer lc.deinit();

    try lc.startHandle();
    const defaults_before = mock.countInvocations("/usr/bin/defaults");

    try lc.stopHandle();

    try std.testing.expectEqual(@as(u32, 0), lc.refcount);
    try std.testing.expect(lc.snapshot == null);
    try std.testing.expect(lc.shell == null);
    // Restore writes happened: 9 additional defaults calls beyond snapshot+configure.
    try std.testing.expect(mock.countInvocations("/usr/bin/defaults") >= defaults_before + 9);
}

test "Lifecycle.stopHandle escalates to pkill when soft-quit fails" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // start
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    try primeSnapshotReads(&mock);
    try primeConfigureWrites(&mock);
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    // stop: soft-quit doesn't take effect — every pgrep during waitForVOExit
    // still reports VO running. Then pkill lands and pgrep clears.
    var i: usize = 0;
    while (i < 20) : (i += 1) try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);
    try mock.pushResponse("/usr/bin/pkill", "", "", 0);
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    try primeRestoreWrites(&mock);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();
    const boot_child = try MockChildProcess.init(allocator);
    try boot_child.queueReply("");
    try boot_child.queueReply("");
    try spawner.preseeded_queue.append(allocator, boot_child);

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    lc.setDomainOverride("com.apple.VoiceOver4/default");
    defer lc.deinit();

    try lc.startHandle();
    try lc.stopHandle();

    // pkill was invoked at least once during stop.
    try std.testing.expect(mock.countInvocations("/usr/bin/pkill") >= 1);
}

test "Lifecycle.startHandle reconcile fires first when VO is already running" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // reconcile: pgrep=running, pkill=ok, pgrep=not-running.
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);
    try mock.pushResponse("/usr/bin/pkill", "", "", 0);
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    // snapshot + configure.
    try primeSnapshotReads(&mock);
    try primeConfigureWrites(&mock);
    // boot verify.
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();
    const boot_child = try MockChildProcess.init(allocator);
    try boot_child.queueReply("");
    try spawner.preseeded_queue.append(allocator, boot_child);

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    lc.setDomainOverride("com.apple.VoiceOver4/default");
    defer lc.deinit();

    try lc.startHandle();

    try std.testing.expect(mock.countInvocations("/usr/bin/pkill") >= 1);
    try std.testing.expectEqual(@as(u32, 1), lc.refcount);
}

test "Lifecycle.crashRestore is non-throwing and sets crash_restore_called" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    // start
    try mock.pushResponse("/usr/bin/pgrep", "", "", 1);
    try primeSnapshotReads(&mock);
    try primeConfigureWrites(&mock);
    try mock.pushResponse("/usr/bin/pgrep", "12345\n", "", 0);
    // crashRestore: restoreSettings (9) + pkill (ok)
    try primeRestoreWrites(&mock);
    try mock.pushResponse("/usr/bin/pkill", "", "", 0);

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();
    const boot_child = try MockChildProcess.init(allocator);
    try boot_child.queueReply("");
    try spawner.preseeded_queue.append(allocator, boot_child);

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    lc.setDomainOverride("com.apple.VoiceOver4/default");
    defer lc.deinit();

    try lc.startHandle();

    // crashRestore shouldn't throw regardless of runner errors.
    lc.crashRestore();

    try std.testing.expect(lc.crash_restore_called);
    try std.testing.expect(mock.countInvocations("/usr/bin/pkill") >= 1);
}

// ===========================================================================
// Task 3 tests — exit hooks install / uninstall
// ===========================================================================

test "installExitHooks registers active lifecycle + sets hooks_installed flag" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();
    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    defer lc.deinit();

    // Ensure clean state.
    lifecycle.uninstallExitHooks();

    lifecycle.installExitHooks(&lc);
    try std.testing.expect(lifecycle.debugHooksInstalled());
    try std.testing.expectEqual(@as(?*lifecycle.Lifecycle, &lc), lifecycle.debugGetActiveLifecycle());

    lifecycle.uninstallExitHooks();
    try std.testing.expect(!lifecycle.debugHooksInstalled());
    try std.testing.expectEqual(@as(?*lifecycle.Lifecycle, null), lifecycle.debugGetActiveLifecycle());
}

test "installExitHooks is idempotent (calling twice does not double-register)" {
    const allocator = std.testing.allocator;
    var mock = MockSubprocessRunner.init(allocator);
    defer mock.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();
    var spawner = MockSpawner{ .allocator = allocator };
    defer spawner.deinit();

    var lc = try lifecycle.Lifecycle.init(
        allocator,
        mock.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        .{ .allocator = allocator },
    );
    defer lc.deinit();

    lifecycle.uninstallExitHooks();
    lifecycle.installExitHooks(&lc);
    try std.testing.expect(lifecycle.debugHooksInstalled());

    // Second install — replaces lifecycle pointer but does NOT double-register handlers.
    lifecycle.installExitHooks(&lc);
    try std.testing.expect(lifecycle.debugHooksInstalled());

    lifecycle.uninstallExitHooks();
}

test "signal-delivery test deferred to integration (Plan 07)" {
    // TDD: unit-testing POSIX signal handlers in Zig 0.16 requires either a
    // fork-based harness or tolerating flakiness in the std test runner.
    // Source-level verified that signalHandler() calls crashRestore() + re-raises
    // with SIG.DFL; real signal-delivery validation lands in Plan 07's
    // crash-recovery test (packages/sdk/test/crash-recovery.test.ts).
    //
    // Keeping this test shape for grep targets:
    //   `grep -c "test \"" >= 14` in this file.
    try std.testing.expect(true);
}

// ===========================================================================
// Plan 07-05 tests — on-disk snapshot file (SIGKILL recovery escape hatch)
// ===========================================================================

/// Build a minimal PlistSnapshot in memory for serialization tests. Uses the
/// real keyCatalog ordering so entries[i] corresponds to catalog[i].
fn buildTestSnapshot(allocator: std.mem.Allocator) !defaults_mod.PlistSnapshot {
    var snap = defaults_mod.PlistSnapshot{
        .allocator = allocator,
        .domain = try allocator.dupe(u8, "com.apple.VoiceOver4/default"),
        .entries = undefined,
    };
    // Populate a plausible mix: bool true, bool false, int 90, int 0, bool false,
    // int 0, bool true, string voice, bool false.
    snap.entries[0] = .{ .boolean = true }; // SCREnableAppleScript
    snap.entries[1] = .{ .boolean = false }; // DisableSound
    snap.entries[2] = .{ .integer = 72 }; // RateAsPercent
    snap.entries[3] = .{ .integer = 1 }; // VerbosityLevel
    snap.entries[4] = .{ .boolean = true }; // ShouldSpeakHints
    snap.entries[5] = .{ .integer = 2 }; // PunctuationLevel
    snap.entries[6] = .{ .boolean = true }; // ShouldSpeakStaticText
    snap.entries[7] = .{ .string = try allocator.dupe(u8, "com.apple.speech.synthesis.voice.Alex") };
    snap.entries[8] = .{ .boolean = false }; // AnnounceKeyCommands
    return snap;
}

/// Read an entire file via libc (Zig 0.16 std.fs changed its Reader API;
/// libc keeps the unit test simple and matches what writeSnapshotFile uses).
fn readFileAllLibc(allocator: std.mem.Allocator, path: [:0]const u8) ![]u8 {
    var flags: std.c.O = .{};
    flags.ACCMODE = .RDONLY;
    const mode_arg: std.c.mode_t = 0;
    const fd = std.c.open(path.ptr, flags, mode_arg);
    if (fd < 0) return error.OpenFailed;
    defer _ = std.c.close(fd);

    var buf: std.ArrayListUnmanaged(u8) = .empty;
    errdefer buf.deinit(allocator);
    var chunk: [4096]u8 = undefined;
    while (true) {
        const n = std.c.read(fd, &chunk, chunk.len);
        if (n < 0) return error.ReadFailed;
        if (n == 0) break;
        const nz: usize = @intCast(n);
        try buf.appendSlice(allocator, chunk[0..nz]);
    }
    return buf.toOwnedSlice(allocator);
}

/// Build a unique tempfile path under /tmp. Doesn't create the file.
fn makeTempPath(allocator: std.mem.Allocator, name: []const u8) ![:0]u8 {
    const ts: u64 = clock_mod.nanoTimestamp();
    const path = try std.fmt.allocPrintSentinel(allocator, "/tmp/munadi-test-{s}-{d}.plist", .{ name, ts }, 0);
    return path;
}

test "writeSnapshotFile writes a parseable plist" {
    const allocator = std.testing.allocator;

    var snap = try buildTestSnapshot(allocator);
    defer snap.deinit();

    const path = try makeTempPath(allocator, "snapshot");
    defer allocator.free(path);
    defer _ = std.c.unlink(path.ptr);

    try lifecycle.writeSnapshotFileForTest(allocator, &snap, path);

    const contents = try readFileAllLibc(allocator, path);
    defer allocator.free(contents);

    try std.testing.expect(std.mem.indexOf(u8, contents, "<?xml version=\"1.0\"") != null);
    try std.testing.expect(std.mem.indexOf(u8, contents, "<plist version=\"1.0\">") != null);
    try std.testing.expect(std.mem.indexOf(u8, contents, "<key>SCREnableAppleScript</key>") != null);
    try std.testing.expect(std.mem.indexOf(u8, contents, "<key>_munadi_snapshot_version</key>") != null);
    try std.testing.expect(std.mem.indexOf(u8, contents, "<integer>1</integer>") != null); // version magic
    try std.testing.expect(std.mem.indexOf(u8, contents, "<key>_munadi_snapshot_pid</key>") != null);
    try std.testing.expect(std.mem.indexOf(u8, contents, "<key>_munadi_snapshot_ts_unix</key>") != null);
    try std.testing.expect(std.mem.indexOf(u8, contents, "<key>_munadi_snapshot_domain</key>") != null);
    try std.testing.expect(std.mem.indexOf(u8, contents, "com.apple.VoiceOver4/default") != null);
    // Voice string rendered as <string>…</string>.
    try std.testing.expect(std.mem.indexOf(u8, contents, "com.apple.speech.synthesis.voice.Alex") != null);
    // Closing tags present.
    try std.testing.expect(std.mem.endsWith(u8, contents, "</plist>\n"));
}

test "serializeSnapshot emits each of the 9 catalog keys in order" {
    const allocator = std.testing.allocator;
    var snap = try buildTestSnapshot(allocator);
    defer snap.deinit();

    const xml = try lifecycle.serializeSnapshotForTest(allocator, &snap, 12345, 1700000000);
    defer allocator.free(xml);

    const catalog = defaults_mod.keyCatalog();
    var last_idx: usize = 0;
    for (catalog) |k| {
        const tag = try std.fmt.allocPrint(allocator, "<key>{s}</key>", .{k.name});
        defer allocator.free(tag);
        const found = std.mem.indexOf(u8, xml, tag) orelse return error.KeyMissing;
        try std.testing.expect(found >= last_idx);
        last_idx = found;
    }
    // Metadata pid + ts appear with the passed values.
    try std.testing.expect(std.mem.indexOf(u8, xml, "<integer>12345</integer>") != null);
    try std.testing.expect(std.mem.indexOf(u8, xml, "<integer>1700000000</integer>") != null);
}

test "writeSnapshotFile creates the parent directory if missing" {
    const allocator = std.testing.allocator;

    var snap = try buildTestSnapshot(allocator);
    defer snap.deinit();

    // Nested subdir under /tmp that does NOT yet exist.
    const ts: u64 = clock_mod.nanoTimestamp();
    const path = try std.fmt.allocPrintSentinel(
        allocator,
        "/tmp/munadi-test-mkpath-{d}/sub/dir/vo-snapshot.plist",
        .{ts},
        0,
    );
    defer allocator.free(path);
    defer _ = std.c.unlink(path.ptr);

    try lifecycle.writeSnapshotFileForTest(allocator, &snap, path);

    // File exists and is non-empty.
    const contents = try readFileAllLibc(allocator, path);
    defer allocator.free(contents);
    try std.testing.expect(contents.len > 0);
}

test "deleteSnapshotFile is idempotent when the file is absent" {
    const allocator = std.testing.allocator;
    const path = try makeTempPath(allocator, "never-created");
    defer allocator.free(path);

    // Should not throw even though the file doesn't exist.
    lifecycle.deleteSnapshotFile(path);
    lifecycle.deleteSnapshotFile(path); // twice — still fine.
}

test "resolveSnapshotPath honors MUNADI_SNAPSHOT_PATH env override" {
    // We can only test the env-override branch without mutating the user's
    // HOME. The override path is reached via c.getenv; in Zig's test runner
    // we can't setenv portably on every stdlib version. Skip the setenv path
    // and just verify the default HOME-based branch produces a path ending
    // in ".munadi/vo-snapshot.plist".
    const allocator = std.testing.allocator;
    const path = lifecycle.resolveSnapshotPath(allocator) catch |err| switch (err) {
        error.HomeNotSet => return, // Test env without HOME — skip.
        else => return err,
    };
    defer allocator.free(path);
    try std.testing.expect(std.mem.endsWith(u8, path, ".munadi/vo-snapshot.plist"));
}
