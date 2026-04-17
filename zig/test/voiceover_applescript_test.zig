const std = @import("std");
const applescript = @import("../src/drivers/voiceover/applescript.zig");
const rb_mod = @import("../src/core/ring_buffer.zig");
const opts_mod = @import("../src/core/options.zig");

// ---------------------------------------------------------------------------
// MockChildProcess — records writes, returns pre-programmed stdout lines
// (or stalls) so tests don't invoke real osascript.
// ---------------------------------------------------------------------------

const MockChildProcess = struct {
    allocator: std.mem.Allocator,
    /// Owned copies of every stdin write.
    writes: std.ArrayListUnmanaged([]u8) = .{},
    /// Programmed stdout lines, consumed FIFO by readStdoutLine.
    queued_lines: std.ArrayListUnmanaged([]u8) = .{},
    /// If > 0, the next readStdoutLine returns error.Timeout.
    stall_remaining: u32 = 0,
    killed: bool = false,
    waited: bool = false,
    child: applescript.ChildProcess = undefined,

    const vtable: applescript.ChildProcess.VTable = .{
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
    fn setStall(self: *MockChildProcess, n: u32) void {
        self.stall_remaining = n;
    }

    fn writeStdinImpl(ctx: *anyopaque, data: []const u8) anyerror!void {
        const self: *MockChildProcess = @ptrCast(@alignCast(ctx));
        const copy = try self.allocator.dupe(u8, data);
        try self.writes.append(self.allocator, copy);
    }
    fn readStdoutLineImpl(ctx: *anyopaque, allocator: std.mem.Allocator, timeout_ms: u32) anyerror![]u8 {
        _ = timeout_ms;
        const self: *MockChildProcess = @ptrCast(@alignCast(ctx));
        if (self.stall_remaining > 0) {
            self.stall_remaining -= 1;
            return error.Timeout;
        }
        if (self.queued_lines.items.len == 0) return error.EndOfStream;
        const line = self.queued_lines.orderedRemove(0);
        defer self.allocator.free(line);
        return allocator.dupe(u8, line);
    }
    fn killImpl(ctx: *anyopaque) void {
        const self: *MockChildProcess = @ptrCast(@alignCast(ctx));
        self.killed = true;
    }
    fn waitImpl(ctx: *anyopaque) void {
        const self: *MockChildProcess = @ptrCast(@alignCast(ctx));
        self.waited = true;
    }
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
    /// The mock returns a freshly-created MockChildProcess on each spawn call
    /// and appends a pointer to its own list so tests can inspect it.
    /// For tests that need to pre-seed lines, we pass in a prepared child via
    /// `preseeded` — if set, that child is returned on the NEXT spawn call and
    /// cleared.
    preseeded: ?*MockChildProcess = null,
    spawn_count: usize = 0,

    fn spawnImpl(ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!*applescript.ChildProcess {
        _ = argv;
        const self: *MockSpawner = @ptrCast(@alignCast(ctx));
        self.spawn_count += 1;
        if (self.preseeded) |child| {
            self.preseeded = null;
            return &child.child;
        }
        const fresh = try MockChildProcess.init(allocator);
        return &fresh.child;
    }

    fn asSpawner(self: *MockSpawner) applescript.ChildProcessSpawner {
        return .{ .ctx = @ptrCast(self), .spawnFn = spawnImpl };
    }
};

// ---------------------------------------------------------------------------
// MockClock — virtual time so tests don't really sleep.
// ---------------------------------------------------------------------------

const MockClock = struct {
    allocator: std.mem.Allocator,
    virtual_ns: u64 = 1_000_000,
    sleep_log: std.ArrayListUnmanaged(u32) = .{},

    fn nowNanosImpl(ctx: *anyopaque) u64 {
        const self: *MockClock = @ptrCast(@alignCast(ctx));
        self.virtual_ns += 1000; // advance by 1µs per reading for distinguishable ts
        return self.virtual_ns;
    }
    fn sleepMsImpl(ctx: *anyopaque, ms: u32) void {
        const self: *MockClock = @ptrCast(@alignCast(ctx));
        self.sleep_log.append(self.allocator, ms) catch {};
        self.virtual_ns += @as(u64, ms) * std.time.ns_per_ms;
    }

    fn asClock(self: *MockClock) applescript.Clock {
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
// Task 1 tests
// ---------------------------------------------------------------------------

test "wrapInTransaction produces a VoiceOver tell block with transaction + sentinel" {
    const allocator = std.testing.allocator;
    const wrapped = try applescript.wrapInTransaction(allocator, "return content of last phrase");
    defer allocator.free(wrapped);
    try std.testing.expect(std.mem.startsWith(u8, wrapped, "tell application \"VoiceOver\""));
    try std.testing.expect(std.mem.indexOf(u8, wrapped, "with transaction") != null);
    try std.testing.expect(std.mem.indexOf(u8, wrapped, "end transaction") != null);
    try std.testing.expect(std.mem.indexOf(u8, wrapped, "return content of last phrase") != null);
    try std.testing.expect(std.mem.indexOf(u8, wrapped, applescript.SENTINEL) != null);
}

test "OsascriptShell.init spawns via the injected spawner" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();
    try std.testing.expectEqual(@as(usize, 1), spawner.spawn_count);
}

test "OsascriptShell.sendAndReceive returns the phrase body, not the sentinel" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    try child.queueLine("hello world");
    try child.queueLine(applescript.SENTINEL);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    const reply = try shell.sendAndReceive("return content of last phrase", 500);
    defer allocator.free(reply);
    try std.testing.expectEqualStrings("hello world", reply);
    // And we wrote the wrapped script to stdin.
    try std.testing.expect(child.writes.items.len == 1);
    try std.testing.expect(std.mem.indexOf(u8, child.writes.items[0], "with transaction") != null);
}

test "OsascriptShell.sendAndReceive surfaces osascript error as error.OsascriptError" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    try child.queueLine("execution error: VoiceOver got an error: -600");
    try child.queueLine(applescript.SENTINEL);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    const result = shell.sendAndReceive("return content of last phrase", 500);
    try std.testing.expectError(error.OsascriptError, result);
}

test "OsascriptShell.sendAndReceive returns error.OsascriptStall on timeout" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    child.setStall(1);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    const result = shell.sendAndReceive("return content of last phrase", 500);
    try std.testing.expectError(error.OsascriptStall, result);
}

// ---------------------------------------------------------------------------
// Task 2 tests — PollLoop via tickOnce (no thread needed)
// ---------------------------------------------------------------------------

test "PollLoop.tickOnce pushes a new phrase with source=.applescript" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    try child.queueLine("button Save");
    try child.queueLine(applescript.SENTINEL);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var loop = applescript.PollLoop.init(allocator, &shell, &ring, clock.asClock(), .{});
    defer loop.deinit();

    try loop.tickOnce();

    try std.testing.expectEqual(@as(usize, 1), ring.len);
    var out: [1]opts_mod.Entry = undefined;
    _ = ring.drain(&out);
    defer allocator.free(out[0].phrase);
    try std.testing.expectEqualStrings("button Save", out[0].phrase);
    try std.testing.expectEqual(opts_mod.SourceTag.applescript, out[0].source);
    try std.testing.expectEqual(@as(u8, 0), out[0].flags);
    try std.testing.expect(out[0].ts_nanos > 0);
}

test "PollLoop dedups identical consecutive replies (one push only)" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    try child.queueLine("same phrase");
    try child.queueLine(applescript.SENTINEL);
    try child.queueLine("same phrase");
    try child.queueLine(applescript.SENTINEL);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var loop = applescript.PollLoop.init(allocator, &shell, &ring, clock.asClock(), .{});
    defer loop.deinit();

    try loop.tickOnce();
    try loop.tickOnce();

    try std.testing.expectEqual(@as(usize, 1), ring.len);

    var out: [1]opts_mod.Entry = undefined;
    _ = ring.drain(&out);
    defer allocator.free(out[0].phrase);
}

test "PollLoop changes push a new Entry (dedup does not block changed phrases)" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    try child.queueLine("alpha");
    try child.queueLine(applescript.SENTINEL);
    try child.queueLine("beta");
    try child.queueLine(applescript.SENTINEL);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var loop = applescript.PollLoop.init(allocator, &shell, &ring, clock.asClock(), .{});
    defer loop.deinit();

    try loop.tickOnce();
    try loop.tickOnce();

    try std.testing.expectEqual(@as(usize, 2), ring.len);

    var out: [2]opts_mod.Entry = undefined;
    _ = ring.drain(&out);
    defer allocator.free(out[0].phrase);
    defer allocator.free(out[1].phrase);
    try std.testing.expectEqualStrings("alpha", out[0].phrase);
    try std.testing.expectEqualStrings("beta", out[1].phrase);
}

test "PollLoop consecutive_stalls flips degraded_flag after max_consecutive_stalls" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    // Stall on every read for 3 attempts.
    child.setStall(9999);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var loop = applescript.PollLoop.init(allocator, &shell, &ring, clock.asClock(), .{
        .max_consecutive_stalls = 3,
    });
    defer loop.deinit();

    try loop.tickOnce();
    try std.testing.expect(!loop.isDegraded());
    try loop.tickOnce();
    try std.testing.expect(!loop.isDegraded());
    try loop.tickOnce();
    // 3 consecutive stalls at limit 3 — degraded.
    try std.testing.expect(loop.isDegraded());
}

test "PollLoop successful tick resets consecutive_stalls to 0" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    // Stall once, then succeed.
    child.setStall(1);
    try child.queueLine("hello");
    try child.queueLine(applescript.SENTINEL);
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var loop = applescript.PollLoop.init(allocator, &shell, &ring, clock.asClock(), .{});
    defer loop.deinit();

    try loop.tickOnce();
    try std.testing.expectEqual(@as(u32, 1), loop.consecutive_stalls);
    try loop.tickOnce();
    try std.testing.expectEqual(@as(u32, 0), loop.consecutive_stalls);

    // Drain the one pushed entry so we free its owned phrase.
    var out: [1]opts_mod.Entry = undefined;
    _ = ring.drain(&out);
    defer allocator.free(out[0].phrase);
}

test "PollLoop.stop signals the thread and join completes within an interval" {
    const allocator = std.testing.allocator;
    var spawner = MockSpawner{ .allocator = allocator };
    const child = try MockChildProcess.init(allocator);
    // Provide many dedup'd responses so the loop can tick without starving.
    var i: usize = 0;
    while (i < 200) : (i += 1) {
        try child.queueLine("stable");
        try child.queueLine(applescript.SENTINEL);
    }
    spawner.preseeded = child;

    var shell = try applescript.OsascriptShell.init(allocator, spawner.asSpawner());
    defer shell.deinit();

    var ring = try rb_mod.RingBuffer.init(allocator, 16);
    defer ring.deinit();

    var clock = MockClock{ .allocator = allocator };
    defer clock.deinit();

    var loop = applescript.PollLoop.init(allocator, &shell, &ring, clock.asClock(), .{
        .interval_ms = 1,
    });
    defer loop.deinit();

    try loop.start();
    // Let the thread run for a few scheduling slots, then stop.
    std.Thread.sleep(5 * std.time.ns_per_ms);
    loop.stop();
    // If join worked, stop returned without blocking forever. Verify thread handle cleared.
    try std.testing.expect(loop.thread == null);

    // Drain any entries the thread produced to avoid leaks.
    var entry_buf: [1]opts_mod.Entry = undefined;
    while (ring.drain(&entry_buf) > 0) {
        allocator.free(entry_buf[0].phrase);
    }
}
