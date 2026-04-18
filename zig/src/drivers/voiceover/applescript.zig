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
pub const SENTINEL: []const u8 = "__OGMIOS_SEP__";

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

// ---------------------------------------------------------------------------
// RealChildProcess + RealSpawner (production path)
//
// Wraps subprocess.PipedChild with a reader thread that buffers full stdout
// lines onto a mutex-guarded queue. readStdoutLine() pops from the queue
// with a timed wait; on Timeout it returns `error.Timeout` which PollLoop
// maps to `error.OsascriptStall`.
// ---------------------------------------------------------------------------

pub const RealChildProcess = struct {
    allocator: std.mem.Allocator,
    child: subprocess.PipedChild,
    reader_thread: ?std.Thread = null,
    line_queue: std.ArrayListUnmanaged([]u8) = .empty,
    queue_mu: sync_mod.Mutex = .init,
    queue_cv: sync_mod.Condition = .init,
    shutdown: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),
    waited: bool = false,

    /// Public wrapper exposing the ChildProcess vtable to PollLoop.
    child_handle: ChildProcess = undefined,

    pub const vtable: ChildProcess.VTable = .{
        .write_stdin = writeStdinImpl,
        .read_stdout_line = readStdoutLineImpl,
        .kill = killImpl,
        .wait = waitImpl,
        .deinit_ctx = deinitImpl,
    };

    /// Entry point for the reader thread: read stdout byte-by-byte, split on
    /// '\n', push each complete line (without trailing newline) onto the
    /// mutex-guarded queue. Exits on read EOF / read error / shutdown flag.
    fn readerThreadMain(self: *RealChildProcess) void {
        const c = std.c;
        var line_buf: std.ArrayListUnmanaged(u8) = .empty;
        defer line_buf.deinit(self.allocator);

        while (!self.shutdown.load(.acquire)) {
            var byte: [1]u8 = undefined;
            const n = c.read(self.child.stdout_fd, &byte, 1);
            if (n <= 0) break; // EOF or error
            const b = byte[0];
            if (b == '\n') {
                const slice = self.allocator.dupe(u8, line_buf.items) catch {
                    line_buf.clearRetainingCapacity();
                    continue;
                };
                line_buf.clearRetainingCapacity();
                self.queue_mu.lock();
                self.line_queue.append(self.allocator, slice) catch {
                    self.allocator.free(slice);
                    self.queue_mu.unlock();
                    continue;
                };
                self.queue_cv.signal();
                self.queue_mu.unlock();
            } else {
                line_buf.append(self.allocator, b) catch {
                    line_buf.clearRetainingCapacity();
                };
            }
        }
        self.shutdown.store(true, .release);
        // Wake any pending readStdoutLine waiter so it can observe EOF.
        self.queue_mu.lock();
        self.queue_cv.broadcast();
        self.queue_mu.unlock();
    }

    fn writeStdinImpl(ctx: *anyopaque, data: []const u8) anyerror!void {
        const self: *RealChildProcess = @ptrCast(@alignCast(ctx));
        try self.child.writeStdin(data);
    }

    fn readStdoutLineImpl(ctx: *anyopaque, allocator: std.mem.Allocator, timeout_ms: u32) anyerror![]u8 {
        const self: *RealChildProcess = @ptrCast(@alignCast(ctx));
        self.queue_mu.lock();
        defer self.queue_mu.unlock();

        if (self.line_queue.items.len == 0) {
            if (self.shutdown.load(.acquire)) return error.EndOfStream;
            const timeout_ns: u64 = @as(u64, timeout_ms) * std.time.ns_per_ms;
            self.queue_cv.timedWait(&self.queue_mu, timeout_ns) catch |err| switch (err) {
                error.Timeout => return error.Timeout,
            };
            if (self.line_queue.items.len == 0) {
                if (self.shutdown.load(.acquire)) return error.EndOfStream;
                // Spurious wake — caller retries; preserve Timeout semantics.
                return error.Timeout;
            }
        }

        // Pop front — ownership transfers to caller (matching the MockChild
        // contract). We re-dupe into the caller's allocator so queue-internal
        // bookkeeping stays on our allocator.
        const line = self.line_queue.orderedRemove(0);
        defer self.allocator.free(line);
        return allocator.dupe(u8, line);
    }

    fn killImpl(ctx: *anyopaque) void {
        const self: *RealChildProcess = @ptrCast(@alignCast(ctx));
        self.shutdown.store(true, .release);
        self.child.kill();
        // Wake the reader thread if it's wedged on a read — closing stdin
        // signals EOF on some platforms; kill() sends SIGTERM which also
        // causes the read to return.
        self.queue_mu.lock();
        self.queue_cv.broadcast();
        self.queue_mu.unlock();
        if (self.reader_thread) |t| {
            t.join();
            self.reader_thread = null;
        }
    }

    fn waitImpl(ctx: *anyopaque) void {
        const self: *RealChildProcess = @ptrCast(@alignCast(ctx));
        if (self.waited) return;
        _ = self.child.wait();
        self.waited = true;
    }

    fn deinitImpl(ctx: *anyopaque) void {
        const self: *RealChildProcess = @ptrCast(@alignCast(ctx));
        // If kill() wasn't called first, stop the reader thread now.
        self.shutdown.store(true, .release);
        self.child.close();
        self.queue_mu.lock();
        self.queue_cv.broadcast();
        self.queue_mu.unlock();
        if (self.reader_thread) |t| {
            t.join();
            self.reader_thread = null;
        }
        for (self.line_queue.items) |l| self.allocator.free(l);
        self.line_queue.deinit(self.allocator);
        self.queue_mu.deinit();
        self.queue_cv.deinit();
        self.allocator.destroy(self);
    }
};

fn realSpawnImpl(ctx: *anyopaque, allocator: std.mem.Allocator, argv: []const []const u8) anyerror!*ChildProcess {
    _ = ctx;
    const self = try allocator.create(RealChildProcess);
    errdefer allocator.destroy(self);
    self.* = .{
        .allocator = allocator,
        .child = undefined,
    };

    self.child = subprocess.PipedChild.spawn(allocator, argv, false) catch |err| switch (err) {
        error.FileNotFound => return error.FileNotFound,
        error.ForkFailed => return error.ForkFailed,
        error.PipeFailed => return error.PipeFailed,
        error.OutOfMemory => return error.OutOfMemory,
        error.Unexpected => return error.Unexpected,
    };

    self.child_handle = .{ .ctx = @ptrCast(self), .vtable = &RealChildProcess.vtable };

    self.reader_thread = try std.Thread.spawn(
        .{},
        RealChildProcess.readerThreadMain,
        .{self},
    );

    return &self.child_handle;
}

var real_spawner_ctx_sentinel: u8 = 0;

/// Factory: returns a ChildProcessSpawner backed by RealChildProcess.
/// registry.zig's `makeVoiceOver` calls this to wire the production path.
pub fn realSpawner() ChildProcessSpawner {
    return .{
        .ctx = @ptrCast(&real_spawner_ctx_sentinel),
        .spawnFn = realSpawnImpl,
    };
}
