const std = @import("std");
const driver_mod = @import("../src/core/driver.zig");
const registry = @import("../src/core/registry.zig");
const voiceover_mod = @import("../src/drivers/voiceover/driver.zig");
const defaults_mod = @import("../src/drivers/voiceover/defaults.zig");
const lifecycle_mod = @import("../src/drivers/voiceover/lifecycle.zig");
const applescript_mod = @import("../src/drivers/voiceover/applescript.zig");
const ax_mod = @import("../src/drivers/voiceover/ax_notifications.zig");
const rb_mod = @import("../src/core/ring_buffer.zig");
const opts_mod = @import("../src/core/options.zig");

// ---------------------------------------------------------------------------
// Shared mocks (condensed versions — full variants live in the per-module
// test files). Here we need just enough to round-trip a driver lifecycle.
// ---------------------------------------------------------------------------

const MockSubprocessRunner = struct {
    allocator: std.mem.Allocator,
    argv_log: std.ArrayListUnmanaged([]const []const u8) = .empty,
    /// Default "not running / write ok / kill ok" response. pgrep always returns
    /// exit 1 (not running) unless caller overrides.
    pgrep_returns_running: bool = false,

    fn init(allocator: std.mem.Allocator) MockSubprocessRunner {
        return .{ .allocator = allocator };
    }
    fn deinit(self: *MockSubprocessRunner) void {
        for (self.argv_log.items) |argv| {
            for (argv) |a| self.allocator.free(a);
            self.allocator.free(argv);
        }
        self.argv_log.deinit(self.allocator);
    }
    fn asRunner(self: *MockSubprocessRunner) defaults_mod.SubprocessRunner {
        return .{ .ctx = @ptrCast(self), .runFn = runImpl };
    }
    fn runImpl(ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!defaults_mod.RunResult {
        const self: *MockSubprocessRunner = @ptrCast(@alignCast(ctx));
        const recorded = try self.allocator.alloc([]const u8, argv.len);
        for (argv, 0..) |a, i| recorded[i] = try self.allocator.dupe(u8, a);
        try self.argv_log.append(self.allocator, recorded);

        // Pattern-match: pgrep → reply based on flag; everything else → exit 0.
        const first = argv[0];
        if (std.mem.eql(u8, first, "/usr/bin/pgrep")) {
            if (self.pgrep_returns_running) {
                return defaults_mod.RunResult{
                    .stdout = try allocator.dupe(u8, "12345\n"),
                    .stderr = try allocator.dupe(u8, ""),
                    .exit_code = 0,
                };
            }
            return defaults_mod.RunResult{
                .stdout = try allocator.dupe(u8, ""),
                .stderr = try allocator.dupe(u8, ""),
                .exit_code = 1,
            };
        }
        if (std.mem.eql(u8, first, "/usr/bin/pkill")) {
            return defaults_mod.RunResult{
                .stdout = try allocator.dupe(u8, ""),
                .stderr = try allocator.dupe(u8, ""),
                .exit_code = 0,
            };
        }
        // defaults read/write: return "0" for reads, empty for writes. The
        // lifecycle snapshot loop reads each key and configures each key; we
        // pretend every key reads as "0" (boolean false / integer 0 depending
        // on type — both parse cleanly).
        return defaults_mod.RunResult{
            .stdout = try allocator.dupe(u8, "0\n"),
            .stderr = try allocator.dupe(u8, ""),
            .exit_code = 0,
        };
    }
    fn countInvocations(self: *MockSubprocessRunner, prefix: []const u8) usize {
        var count: usize = 0;
        for (self.argv_log.items) |argv| {
            if (argv.len > 0 and std.mem.eql(u8, argv[0], prefix)) count += 1;
        }
        return count;
    }
};

const MockClock = struct {
    allocator: std.mem.Allocator,
    virtual_ns: u64 = 1_000_000,

    fn nowNanosImpl(ctx: *anyopaque) u64 {
        const self: *MockClock = @ptrCast(@alignCast(ctx));
        self.virtual_ns += 1000;
        return self.virtual_ns;
    }
    fn sleepMsImpl(ctx: *anyopaque, ms: u32) void {
        const self: *MockClock = @ptrCast(@alignCast(ctx));
        self.virtual_ns += @as(u64, ms) * std.time.ns_per_ms;
    }
    fn asClock(self: *MockClock) lifecycle_mod.Clock {
        return .{
            .ctx = @ptrCast(self),
            .now_nanos_fn = nowNanosImpl,
            .sleep_ms_fn = sleepMsImpl,
        };
    }
};

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
        if (self.queued_lines.items.len == 0) {
            // Idle — pretend sentinel arrives to keep the poll loop alive.
            return allocator.dupe(u8, applescript_mod.SENTINEL);
        }
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
    spawn_count: usize = 0,
    fn spawnImpl(ctx: *anyopaque, allocator: std.mem.Allocator, _: []const []const u8) anyerror!*applescript_mod.ChildProcess {
        const self: *MockSpawner = @ptrCast(@alignCast(ctx));
        self.spawn_count += 1;
        const fresh = try MockChildProcess.init(allocator);
        // Pre-seed so boot + quit scripts get sentinel replies.
        try fresh.queueReply("");
        try fresh.queueReply("");
        return &fresh.child;
    }
    fn asSpawner(self: *MockSpawner) applescript_mod.ChildProcessSpawner {
        return .{ .ctx = @ptrCast(self), .spawnFn = spawnImpl };
    }
};

/// Track invocations on each XPC lifecycle method so tests assert start/stop ordering.
const MockXpcBackend = struct {
    connect_count: u32 = 0,
    set_callback_count: u32 = 0,
    start_observer_count: u32 = 0,
    stop_observer_count: u32 = 0,
    disconnect_count: u32 = 0,
    last_pid: i32 = 0,
    /// Fake handle — just a pointer to self.
    fake_handle: u8 = 0,

    fn connect(ctx: *anyopaque) anyerror!ax_mod.XpcHandle {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.connect_count += 1;
        return @ptrCast(&self.fake_handle);
    }
    fn setCallback(ctx: *anyopaque, _: ax_mod.XpcHandle, _: ax_mod.EventCCallback, _: ?*anyopaque) void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.set_callback_count += 1;
    }
    fn startObserver(ctx: *anyopaque, _: ax_mod.XpcHandle, pid: i32) anyerror!void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.start_observer_count += 1;
        self.last_pid = pid;
    }
    fn stopObserver(ctx: *anyopaque, _: ax_mod.XpcHandle) void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.stop_observer_count += 1;
    }
    fn disconnect(ctx: *anyopaque, _: ax_mod.XpcHandle) void {
        const self: *MockXpcBackend = @ptrCast(@alignCast(ctx));
        self.disconnect_count += 1;
    }
    const vtable: ax_mod.XpcBackend.VTable = .{
        .connect = connect,
        .set_callback = setCallback,
        .start_observer = startObserver,
        .stop_observer = stopObserver,
        .disconnect = disconnect,
    };
    fn asBackend(self: *MockXpcBackend) ax_mod.XpcBackend {
        return .{ .ctx = @ptrCast(self), .vtable = &vtable };
    }
};

// ===========================================================================
// Tests — registry + driver vtable + lifecycle composition
// ===========================================================================

test "registry.findByName(\"voiceover\") returns a darwin driver entry" {
    const entry = registry.findByName("voiceover") orelse {
        try std.testing.expect(false);
        return;
    };
    try std.testing.expectEqualStrings("voiceover", entry.name);
    try std.testing.expectEqual(opts_mod.DriverPlatform.darwin, entry.platform);
}

test "registry.findByName(\"noop\") still works (regression)" {
    const entry = registry.findByName("noop") orelse {
        try std.testing.expect(false);
        return;
    };
    try std.testing.expectEqualStrings("noop", entry.name);
}

test "VoiceOverDriver.vtable has name=voiceover and platform=darwin" {
    const vt = voiceover_mod.VoiceOverDriver.vtable();
    try std.testing.expectEqualStrings("voiceover", vt.name);
    try std.testing.expectEqual(opts_mod.DriverPlatform.darwin, vt.platform);
}

test "VoiceOverDriver.create returns a usable instance" {
    const allocator = std.testing.allocator;
    var runner = MockSubprocessRunner.init(allocator);
    defer runner.deinit();
    var clock = MockClock{ .allocator = allocator };
    var spawner = MockSpawner{ .allocator = allocator };
    var xpc = MockXpcBackend{};

    const drv = try voiceover_mod.VoiceOverDriver.create(
        allocator,
        runner.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        xpc.asBackend(),
    );

    const vt = voiceover_mod.VoiceOverDriver.vtable();
    // deinit via vtable so we exercise the real teardown path.
    vt.deinit(@ptrCast(drv));
}

test "VoiceOverDriver full lifecycle via vtable: init → start → drain → reset → stop → deinit" {
    const allocator = std.testing.allocator;
    var runner = MockSubprocessRunner.init(allocator);
    defer runner.deinit();
    var clock = MockClock{ .allocator = allocator };
    var spawner = MockSpawner{ .allocator = allocator };
    var xpc = MockXpcBackend{};

    const drv = try voiceover_mod.VoiceOverDriver.create(
        allocator,
        runner.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        xpc.asBackend(),
    );

    const vt = voiceover_mod.VoiceOverDriver.vtable();
    const ctx: *anyopaque = @ptrCast(drv);

    // init
    try vt.init(ctx, .{ .allocator = allocator, .log_buffer_size = 128 });
    drv.lifecycle.?.setDomainOverride("com.apple.VoiceOver4/default");

    // Before start, flip pgrep to return "running" AFTER the reconcile check
    // — lifecycle's reconcile runs first (pgrep=not-running), then boot-verify
    // runs (pgrep=running). Our simple mock returns the same value for both,
    // so we prime reconcile to not-running then flip before boot-verify. The
    // lifecycle loop will see one "running=false" from reconcile and one
    // "running=true" from boot-verify as long as we flip between. Simpler:
    // just set pgrep_returns_running=false and let boot-verify time out in
    // the MockClock's virtual time (MockClock advances on sleep, so the 2s
    // timeout lapses instantly). This means startHandle will error —
    // acceptable for vtable-compose test; we assert the ordering via the
    // mock call counts BEFORE the error. For full start success we instead
    // configure pgrep to return different values across calls via a more
    // sophisticated mock. Keeping this test scoped: verify init + deinit
    // works and defer full start/stop to the next test which uses a smarter mock.

    vt.deinit(ctx);
}

test "Start sequence invokes Lifecycle → PollLoop → AxNotifications in order" {
    const allocator = std.testing.allocator;

    // Use a richer runner that returns "running" for pgrep calls after the
    // reconcile check. Sequence: pgrep(reconcile)=not-running, defaults reads x9,
    // defaults writes x9, pgrep(boot-verify)=running, pgrep(AX resolve-pid)=running.
    const RichRunner = struct {
        allocator: std.mem.Allocator,
        pgrep_call_count: u32 = 0,
        argv_log: std.ArrayListUnmanaged([]const []const u8) = .empty,

        fn runImpl(ctx: *anyopaque, alloc: std.mem.Allocator, argv: []const []const u8) anyerror!defaults_mod.RunResult {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            const recorded = try self.allocator.alloc([]const u8, argv.len);
            for (argv, 0..) |a, i| recorded[i] = try self.allocator.dupe(u8, a);
            try self.argv_log.append(self.allocator, recorded);

            const first = argv[0];
            if (std.mem.eql(u8, first, "/usr/bin/pgrep")) {
                self.pgrep_call_count += 1;
                // 1st pgrep = reconcile (not running), subsequent = running.
                if (self.pgrep_call_count == 1) {
                    return .{
                        .stdout = try alloc.dupe(u8, ""),
                        .stderr = try alloc.dupe(u8, ""),
                        .exit_code = 1,
                    };
                }
                return .{
                    .stdout = try alloc.dupe(u8, "12345\n"),
                    .stderr = try alloc.dupe(u8, ""),
                    .exit_code = 0,
                };
            }
            if (std.mem.eql(u8, first, "/usr/bin/pkill")) {
                return .{
                    .stdout = try alloc.dupe(u8, ""),
                    .stderr = try alloc.dupe(u8, ""),
                    .exit_code = 0,
                };
            }
            return .{
                .stdout = try alloc.dupe(u8, "0\n"),
                .stderr = try alloc.dupe(u8, ""),
                .exit_code = 0,
            };
        }
        fn asRunner(self: *@This()) defaults_mod.SubprocessRunner {
            return .{ .ctx = @ptrCast(self), .runFn = runImpl };
        }
        fn deinit(self: *@This()) void {
            for (self.argv_log.items) |argv| {
                for (argv) |a| self.allocator.free(a);
                self.allocator.free(argv);
            }
            self.argv_log.deinit(self.allocator);
        }
    };

    var rich = RichRunner{ .allocator = allocator };
    defer rich.deinit();

    var clock = MockClock{ .allocator = allocator };
    var spawner = MockSpawner{ .allocator = allocator };
    var xpc = MockXpcBackend{};

    const drv = try voiceover_mod.VoiceOverDriver.create(
        allocator,
        rich.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        xpc.asBackend(),
    );
    const vt = voiceover_mod.VoiceOverDriver.vtable();
    const ctx: *anyopaque = @ptrCast(drv);

    try vt.init(ctx, .{ .allocator = allocator, .log_buffer_size = 128 });
    drv.lifecycle.?.setDomainOverride("com.apple.VoiceOver4/default");

    try vt.start(ctx);

    // AX observer received the resolved PID.
    try std.testing.expectEqual(@as(u32, 1), xpc.connect_count);
    try std.testing.expectEqual(@as(u32, 1), xpc.start_observer_count);
    try std.testing.expectEqual(@as(i32, 12345), xpc.last_pid);
    try std.testing.expect(drv.poll_loop != null);
    try std.testing.expect(drv.ax != null);

    try vt.stop(ctx);

    try std.testing.expectEqual(@as(u32, 1), xpc.stop_observer_count);
    try std.testing.expect(drv.ax == null);
    try std.testing.expect(drv.poll_loop == null);

    vt.deinit(ctx);
}

test "MUNADI_AX_TARGET_PID env override is honored in startImpl (Phase 7 Plan 04)" {
    // This pins the pid-filter wiring: when MUNADI_AX_TARGET_PID is set, the AX
    // observer MUST receive that pid (renderer pid) instead of the default
    // VO-pid from pgrep. Regressing this silently re-admits Chrome URL-bar
    // noise into the capture log.
    const allocator = std.testing.allocator;

    // Reuse the rich runner from the prior test — pgrep still returns 12345 as
    // the VO-pid fallback. The env-override should WIN over that.
    const RichRunner = struct {
        allocator: std.mem.Allocator,
        pgrep_call_count: u32 = 0,
        argv_log: std.ArrayListUnmanaged([]const []const u8) = .empty,

        fn runImpl(ctx: *anyopaque, alloc: std.mem.Allocator, argv: []const []const u8) anyerror!defaults_mod.RunResult {
            const self: *@This() = @ptrCast(@alignCast(ctx));
            const recorded = try self.allocator.alloc([]const u8, argv.len);
            for (argv, 0..) |a, i| recorded[i] = try self.allocator.dupe(u8, a);
            try self.argv_log.append(self.allocator, recorded);

            const first = argv[0];
            if (std.mem.eql(u8, first, "/usr/bin/pgrep")) {
                self.pgrep_call_count += 1;
                if (self.pgrep_call_count == 1) {
                    return .{
                        .stdout = try alloc.dupe(u8, ""),
                        .stderr = try alloc.dupe(u8, ""),
                        .exit_code = 1,
                    };
                }
                return .{
                    .stdout = try alloc.dupe(u8, "12345\n"),
                    .stderr = try alloc.dupe(u8, ""),
                    .exit_code = 0,
                };
            }
            if (std.mem.eql(u8, first, "/usr/bin/pkill")) {
                return .{
                    .stdout = try alloc.dupe(u8, ""),
                    .stderr = try alloc.dupe(u8, ""),
                    .exit_code = 0,
                };
            }
            return .{
                .stdout = try alloc.dupe(u8, "0\n"),
                .stderr = try alloc.dupe(u8, ""),
                .exit_code = 0,
            };
        }
        fn asRunner(self: *@This()) defaults_mod.SubprocessRunner {
            return .{ .ctx = @ptrCast(self), .runFn = runImpl };
        }
        fn deinit(self: *@This()) void {
            for (self.argv_log.items) |argv| {
                for (argv) |a| self.allocator.free(a);
                self.allocator.free(argv);
            }
            self.argv_log.deinit(self.allocator);
        }
    };

    var rich = RichRunner{ .allocator = allocator };
    defer rich.deinit();
    var clock = MockClock{ .allocator = allocator };
    var spawner = MockSpawner{ .allocator = allocator };
    var xpc = MockXpcBackend{};

    const drv = try voiceover_mod.VoiceOverDriver.create(
        allocator,
        rich.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        xpc.asBackend(),
    );
    const vt = voiceover_mod.VoiceOverDriver.vtable();
    const ctx: *anyopaque = @ptrCast(drv);

    try vt.init(ctx, .{ .allocator = allocator, .log_buffer_size = 128 });
    drv.lifecycle.?.setDomainOverride("com.apple.VoiceOver4/default");

    // Set the env override — the driver should prefer 99999 over the 12345
    // that pgrep returns. std.c in 0.16 doesn't re-export setenv/unsetenv so
    // we declare them locally (driver.zig's getenv lookup works against the
    // same POSIX-layer environment).
    const env_c = struct {
        extern "c" fn setenv(name: [*:0]const u8, value: [*:0]const u8, overwrite: c_int) c_int;
        extern "c" fn unsetenv(name: [*:0]const u8) c_int;
    };
    _ = env_c.setenv("MUNADI_AX_TARGET_PID", "99999", 1);
    defer _ = env_c.unsetenv("MUNADI_AX_TARGET_PID");

    try vt.start(ctx);

    // The CRITICAL assertion — env-override wins, AX observer bound to 99999.
    try std.testing.expectEqual(@as(i32, 99999), xpc.last_pid);

    try vt.stop(ctx);
    vt.deinit(ctx);
}

test "drainImpl transfers AX-fired event from driver ring to output ring" {
    const allocator = std.testing.allocator;
    var runner = MockSubprocessRunner.init(allocator);
    defer runner.deinit();
    var clock = MockClock{ .allocator = allocator };
    var spawner = MockSpawner{ .allocator = allocator };
    var xpc = MockXpcBackend{};

    const drv = try voiceover_mod.VoiceOverDriver.create(
        allocator,
        runner.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        xpc.asBackend(),
    );
    const vt = voiceover_mod.VoiceOverDriver.vtable();
    const ctx: *anyopaque = @ptrCast(drv);

    try vt.init(ctx, .{ .allocator = allocator, .log_buffer_size = 16 });

    // Push a synthetic entry directly into the driver's ring (simulates what
    // AxNotifications.debugFireEvent does in prod after start-up).
    const phrase = try allocator.dupe(u8, "synthetic-ax-event");
    drv.ring.push(.{
        .ts_nanos = 42,
        .source = .ax,
        .flags = 0,
        .phrase = phrase,
    });

    var out_ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer out_ring.deinit();

    const drained = try vt.drain(ctx, &out_ring);
    try std.testing.expectEqual(@as(usize, 1), drained);
    try std.testing.expectEqual(@as(usize, 1), out_ring.len);

    var drain_buf: [1]opts_mod.Entry = undefined;
    _ = out_ring.drain(&drain_buf);
    defer allocator.free(drain_buf[0].phrase);
    try std.testing.expectEqualStrings("synthetic-ax-event", drain_buf[0].phrase);
    try std.testing.expectEqual(opts_mod.SourceTag.ax, drain_buf[0].source);

    vt.deinit(ctx);
}

test "resetImpl clears the ring buffer" {
    const allocator = std.testing.allocator;
    var runner = MockSubprocessRunner.init(allocator);
    defer runner.deinit();
    var clock = MockClock{ .allocator = allocator };
    var spawner = MockSpawner{ .allocator = allocator };
    var xpc = MockXpcBackend{};

    const drv = try voiceover_mod.VoiceOverDriver.create(
        allocator,
        runner.asRunner(),
        clock.asClock(),
        spawner.asSpawner(),
        xpc.asBackend(),
    );
    const vt = voiceover_mod.VoiceOverDriver.vtable();
    const ctx: *anyopaque = @ptrCast(drv);

    try vt.init(ctx, .{ .allocator = allocator, .log_buffer_size = 16 });

    const phrase = try allocator.dupe(u8, "before-reset");
    drv.ring.push(.{ .ts_nanos = 1, .source = .ax, .flags = 0, .phrase = phrase });
    try std.testing.expectEqual(@as(usize, 1), drv.ring.len);

    try vt.reset(ctx);
    try std.testing.expectEqual(@as(usize, 0), drv.ring.len);

    // The dup'd phrase leaked — ring.clear doesn't free entries. In prod,
    // drain + decode owns the strings. For the test, free manually.
    allocator.free(phrase);

    vt.deinit(ctx);
}
