const std = @import("std");
const opts_mod = @import("../../core/options.zig");
const rb_mod = @import("../../core/ring_buffer.zig");
const sync_mod = @import("../../core/sync.zig");
const clock_mod = @import("../../core/clock.zig");
const subprocess = @import("../../core/subprocess.zig");

pub const Entry = opts_mod.Entry;
pub const SourceTag = opts_mod.SourceTag;
pub const RingBuffer = rb_mod.RingBuffer;

/// Sentinel emitted by osascript after each script so our reader knows a reply
/// is complete. The first stdout line matching SENTINEL terminates a reply.
pub const SENTINEL: []const u8 = "__SHOKI_SEP__";

// ---------------------------------------------------------------------------
// ChildProcess abstraction (vtable-style; mockable in tests)
// ---------------------------------------------------------------------------

pub const ChildProcess = struct {
    ctx: *anyopaque,
    vtable: *const VTable,

    pub const VTable = struct {
        write_stdin: *const fn (ctx: *anyopaque, data: []const u8) anyerror!void,
        /// Blocking read of a single line (up to `\n`), bounded by `timeout_ms`.
        /// Implementations return the owned line on success or error.Timeout on stall.
        read_stdout_line: *const fn (ctx: *anyopaque, allocator: std.mem.Allocator, timeout_ms: u32) anyerror![]u8,
        kill: *const fn (ctx: *anyopaque) void,
        wait: *const fn (ctx: *anyopaque) void,
        deinit_ctx: *const fn (ctx: *anyopaque) void,
    };

    pub fn writeStdin(self: *ChildProcess, data: []const u8) !void {
        return self.vtable.write_stdin(self.ctx, data);
    }
    pub fn readStdoutLine(self: *ChildProcess, allocator: std.mem.Allocator, timeout_ms: u32) ![]u8 {
        return self.vtable.read_stdout_line(self.ctx, allocator, timeout_ms);
    }
    pub fn kill(self: *ChildProcess) void {
        self.vtable.kill(self.ctx);
    }
    pub fn wait(self: *ChildProcess) void {
        self.vtable.wait(self.ctx);
    }
    pub fn deinitCtx(self: *ChildProcess) void {
        self.vtable.deinit_ctx(self.ctx);
    }
};

pub const ChildProcessSpawner = struct {
    ctx: *anyopaque,
    spawnFn: *const fn (ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!*ChildProcess,

    pub fn spawn(self: ChildProcessSpawner, allocator: std.mem.Allocator, argv: []const []const u8) !*ChildProcess {
        return self.spawnFn(self.ctx, allocator, argv);
    }
};

// ---------------------------------------------------------------------------
// wrapInTransaction — wraps an AppleScript body in the standard `tell VO`
// + transaction block + sentinel echo.
// ---------------------------------------------------------------------------

pub fn wrapInTransaction(allocator: std.mem.Allocator, body: []const u8) ![]u8 {
    return std.fmt.allocPrint(
        allocator,
        "tell application \"VoiceOver\"\n    with transaction\n        {s}\n    end transaction\nend tell\nlog \"{s}\"\n",
        .{ body, SENTINEL },
    );
}

// ---------------------------------------------------------------------------
// OsascriptShell — long-lived `osascript` child + send/receive protocol.
// ---------------------------------------------------------------------------

pub const OSASCRIPT_ARGV = [_][]const u8{
    "/usr/bin/osascript", "-s", "s", "-i", "-",
};

pub const OsascriptShell = struct {
    allocator: std.mem.Allocator,
    child: *ChildProcess,
    spawner: ChildProcessSpawner,

    pub fn init(allocator: std.mem.Allocator, spawner: ChildProcessSpawner) !OsascriptShell {
        const child = try spawner.spawn(allocator, &OSASCRIPT_ARGV);
        return .{ .allocator = allocator, .child = child, .spawner = spawner };
    }

    pub fn deinit(self: *OsascriptShell) void {
        self.child.kill();
        self.child.wait();
        self.child.deinitCtx();
    }

    /// Send `script` to osascript stdin and read the reply up to SENTINEL.
    /// Returns the owned phrase body (lines joined with \n, no sentinel).
    /// Errors: error.OsascriptStall (timeout), error.OsascriptError (stderr-ish).
    pub fn sendAndReceive(self: *OsascriptShell, script: []const u8, timeout_ms: u32) ![]u8 {
        const wrapped = try wrapInTransaction(self.allocator, script);
        defer self.allocator.free(wrapped);
        try self.child.writeStdin(wrapped);

        var body: std.ArrayListUnmanaged(u8) = .empty;
        defer body.deinit(self.allocator);

        while (true) {
            const line = self.child.readStdoutLine(self.allocator, timeout_ms) catch |err| switch (err) {
                error.Timeout => return error.OsascriptStall,
                else => return err,
            };
            defer self.allocator.free(line);

            // Sentinel terminates the reply.
            if (std.mem.indexOf(u8, line, SENTINEL) != null) break;

            // `osascript -s s` emits errors prefixed with "execution error" or
            // bare "osascript:" on stderr pipe; here we fold stderr into stdout
            // (see MockChildProcess), so detect by prefix.
            if (std.mem.startsWith(u8, line, "osascript error") or
                std.mem.startsWith(u8, line, "execution error"))
            {
                return error.OsascriptError;
            }

            if (body.items.len > 0) try body.append(self.allocator, '\n');
            try body.appendSlice(self.allocator, line);
        }

        return body.toOwnedSlice(self.allocator);
    }

    /// Kill + respawn the child process. Used by PollLoop on stall.
    pub fn respawn(self: *OsascriptShell) !void {
        self.child.kill();
        self.child.wait();
        self.child.deinitCtx();
        self.child = try self.spawner.spawn(self.allocator, &OSASCRIPT_ARGV);
    }
};

// ---------------------------------------------------------------------------
// Clock abstraction (tests inject virtual time to avoid real sleeps)
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

// A static dummy opaque for real implementations that don't need context.
var real_clock_ctx_sentinel: u8 = 0;
pub const realClock: Clock = .{
    .ctx = @ptrCast(&real_clock_ctx_sentinel),
    .now_nanos_fn = realNowNanos,
    .sleep_ms_fn = realSleepMs,
};

// ---------------------------------------------------------------------------
// PollLoop — native thread that polls the shell, dedups, tracks stalls.
// ---------------------------------------------------------------------------

pub const PollLoopOptions = struct {
    interval_ms: u32 = 50,
    stall_timeout_ms: u32 = 500,
    max_consecutive_stalls: u32 = 10,
};

pub const PollLoop = struct {
    allocator: std.mem.Allocator,
    shell: *OsascriptShell,
    ring: *RingBuffer,
    clock: Clock,
    options: PollLoopOptions,
    thread: ?std.Thread = null,
    stop_flag: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
    degraded_flag: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
    /// Last observed phrase; owned; freed on replacement or deinit.
    last_phrase: ?[]u8 = null,
    consecutive_stalls: u32 = 0,

    pub fn init(
        allocator: std.mem.Allocator,
        shell: *OsascriptShell,
        ring: *RingBuffer,
        clock: Clock,
        options: PollLoopOptions,
    ) PollLoop {
        return .{
            .allocator = allocator,
            .shell = shell,
            .ring = ring,
            .clock = clock,
            .options = options,
        };
    }

    pub fn deinit(self: *PollLoop) void {
        if (self.last_phrase) |p| {
            self.allocator.free(p);
            self.last_phrase = null;
        }
    }

    pub fn start(self: *PollLoop) !void {
        self.stop_flag.store(false, .release);
        self.thread = try std.Thread.spawn(.{}, runLoop, .{self});
    }

    pub fn stop(self: *PollLoop) void {
        self.stop_flag.store(true, .release);
        if (self.thread) |t| {
            t.join();
            self.thread = null;
        }
    }

    pub fn isDegraded(self: *const PollLoop) bool {
        return self.degraded_flag.load(.acquire);
    }

    fn runLoop(self: *PollLoop) void {
        while (!self.stop_flag.load(.acquire)) {
            self.tickOnce() catch {
                // tickOnce only surfaces unrecoverable errors. Exit.
                return;
            };
            if (self.stop_flag.load(.acquire)) break;
            self.clock.sleepMs(self.options.interval_ms);
        }
    }

    /// Single iteration of the poll loop — called by the thread and by tests.
    pub fn tickOnce(self: *PollLoop) !void {
        const phrase = self.shell.sendAndReceive(
            "return content of last phrase",
            self.options.stall_timeout_ms,
        ) catch |err| switch (err) {
            error.OsascriptStall => {
                self.consecutive_stalls += 1;
                // Respawn; swallow errors so the next tick re-detects.
                self.shell.respawn() catch {};
                if (self.consecutive_stalls >= self.options.max_consecutive_stalls) {
                    self.degraded_flag.store(true, .release);
                    self.stop_flag.store(true, .release);
                }
                return;
            },
            error.OsascriptError => {
                // Non-fatal; surface via stderr path later if we grow logging.
                std.log.warn("osascript error during poll; continuing", .{});
                return;
            },
            else => return err,
        };
        // phrase is owned by caller.
        defer self.allocator.free(phrase);

        // Skip empty replies at startup (not an announcement — avoid pushing noise).
        if (phrase.len == 0) {
            self.consecutive_stalls = 0;
            return;
        }

        // Dedup on identical stdout.
        if (self.last_phrase) |lp| {
            if (std.mem.eql(u8, lp, phrase)) {
                self.consecutive_stalls = 0;
                return;
            }
        }

        // New phrase: dupe into ring-owned slice and last_phrase cache.
        const ring_copy = self.allocator.dupe(u8, phrase) catch {
            self.consecutive_stalls = 0;
            return;
        };

        const entry = Entry{
            .ts_nanos = self.clock.nowNanos(),
            .source = SourceTag.applescript,
            .flags = 0,
            .phrase = ring_copy,
        };
        self.ring.push(entry);

        // Update last_phrase cache.
        if (self.last_phrase) |old| self.allocator.free(old);
        self.last_phrase = self.allocator.dupe(u8, phrase) catch null;

        self.consecutive_stalls = 0;
    }
};
