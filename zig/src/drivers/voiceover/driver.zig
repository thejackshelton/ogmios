const std = @import("std");
const c = std.c;
const driver_mod = @import("../../core/driver.zig");
const opts_mod = @import("../../core/options.zig");
const rb_mod = @import("../../core/ring_buffer.zig");
const defaults_mod = @import("defaults.zig");
const applescript_mod = @import("applescript.zig");
const ax_mod = @import("ax_notifications.zig");
const lifecycle_mod = @import("lifecycle.zig");

/// VoiceOverDriver composes Plan 03's Lifecycle + Plan 02's PollLoop +
/// Plan 04's AxNotifications into a single driver implementing the frozen
/// OgmiosDriver vtable.
///
/// Ring buffer is owned here and shared between both capture paths — PollLoop
/// pushes entries tagged `source=.applescript`, AxNotifications tags `source=.ax`.
/// Plan 07's integration test verifies both sources appear in the drained log.
pub const VoiceOverDriver = struct {
    allocator: std.mem.Allocator,
    ring: rb_mod.RingBuffer,
    lifecycle: ?lifecycle_mod.Lifecycle = null,
    poll_loop: ?*applescript_mod.PollLoop = null,
    ax: ?*ax_mod.AxNotifications = null,
    init_opts: ?opts_mod.InitOptions = null,

    // Test seams — production uses real backends, tests inject mocks.
    runner: defaults_mod.SubprocessRunner,
    clock: lifecycle_mod.Clock,
    spawner: applescript_mod.ChildProcessSpawner,
    xpc_backend: ax_mod.XpcBackend,

    pub fn create(
        allocator: std.mem.Allocator,
        runner: defaults_mod.SubprocessRunner,
        clock: lifecycle_mod.Clock,
        spawner: applescript_mod.ChildProcessSpawner,
        xpc_backend: ax_mod.XpcBackend,
    ) !*VoiceOverDriver {
        const self = try allocator.create(VoiceOverDriver);
        // Start with a default-sized ring; resized in initImpl when we have the real opts.
        const ring = try rb_mod.RingBuffer.init(allocator, 10_000);
        self.* = .{
            .allocator = allocator,
            .ring = ring,
            .runner = runner,
            .clock = clock,
            .spawner = spawner,
            .xpc_backend = xpc_backend,
        };
        return self;
    }

    pub fn vtable() driver_mod.OgmiosDriver {
        return .{
            .init = initImpl,
            .start = startImpl,
            .stop = stopImpl,
            .drain = drainImpl,
            .reset = resetImpl,
            .deinit = deinitImpl,
            .name = "voiceover",
            .platform = .darwin,
        };
    }

    fn initImpl(ctx: *anyopaque, opts: opts_mod.InitOptions) anyerror!void {
        const self: *VoiceOverDriver = @ptrCast(@alignCast(ctx));
        self.init_opts = opts;

        // Resize the ring to the user-requested capacity.
        self.ring.deinit();
        self.ring = try rb_mod.RingBuffer.init(self.allocator, opts.log_buffer_size);

        // Initialize the Lifecycle but do NOT start it — start() boots VO.
        self.lifecycle = try lifecycle_mod.Lifecycle.init(
            self.allocator,
            self.runner,
            self.clock,
            self.spawner,
            opts,
        );
        lifecycle_mod.installExitHooks(&self.lifecycle.?);
    }

    fn startImpl(ctx: *anyopaque) anyerror!void {
        const self: *VoiceOverDriver = @ptrCast(@alignCast(ctx));
        if (self.lifecycle == null) return error.DriverNotInitialized;

        // 1. Boot VO via Lifecycle (handles reconcile, snapshot, configure,
        //    activate, verify). Errors propagate unchanged.
        try self.lifecycle.?.startHandle();
        errdefer self.lifecycle.?.stopHandle() catch |err| {
            std.log.warn("startImpl: stopHandle cleanup failed: {s}", .{@errorName(err)});
        };

        // 2. Start AppleScript poll loop using the shell the Lifecycle owns.
        const shell_ptr = self.lifecycle.?.getShell() orelse return error.VoiceOverShellMissing;
        const poll = try self.allocator.create(applescript_mod.PollLoop);
        errdefer self.allocator.destroy(poll);

        // PollLoop's Clock is applescript_mod.Clock; lifecycle_mod.Clock is
        // intentionally the same shape. Reinterpret via pointer cast so we
        // don't fabricate a second Clock instance. Plan 05 unifies these types.
        const poll_clock: applescript_mod.Clock = .{
            .ctx = self.clock.ctx,
            .now_nanos_fn = self.clock.now_nanos_fn,
            .sleep_ms_fn = self.clock.sleep_ms_fn,
        };
        poll.* = applescript_mod.PollLoop.init(
            self.allocator,
            shell_ptr,
            &self.ring,
            poll_clock,
            .{},
        );
        try poll.start();
        errdefer {
            poll.stop();
            poll.deinit();
        }
        self.poll_loop = poll;

        // 3. Resolve the target-app PID and start the AX observer.
        //
        // Phase 7 Plan 04 ("DOM vs Chrome URL bar"): the AX observer is now
        // scoped to a TARGET APP pid (see ax_notifications.zig's start()
        // doc-comment). Priority order:
        //   1. OGMIOS_AX_TARGET_PID env var — set by Vitest-browser test setup
        //      after resolving the Chromium renderer pid via pgrep.
        //   2. Back-compat fallback: the VoiceOver process pid, preserving the
        //      Phase 3 semantic for any caller that hasn't updated. Under this
        //      fallback the helper observes VO's own AXUIElement — which emits
        //      nothing useful on its own, so tests that care about correctness
        //      MUST set OGMIOS_AX_TARGET_PID.
        const target_pid = readTargetPidEnv() orelse
            (try resolveVoiceOverPid(self.allocator, self.runner));

        const ax = try self.allocator.create(ax_mod.AxNotifications);
        errdefer self.allocator.destroy(ax);
        ax.* = ax_mod.AxNotifications.init(self.allocator, &self.ring, self.xpc_backend);
        try ax.start(target_pid);
        self.ax = ax;
    }

    fn stopImpl(ctx: *anyopaque) anyerror!void {
        const self: *VoiceOverDriver = @ptrCast(@alignCast(ctx));
        // Reverse-order teardown: ax → poll → lifecycle.
        if (self.ax) |ax| {
            ax.stop();
            ax.deinit();
            self.allocator.destroy(ax);
            self.ax = null;
        }
        if (self.poll_loop) |p| {
            p.stop();
            p.deinit();
            self.allocator.destroy(p);
            self.poll_loop = null;
        }
        if (self.lifecycle) |_| {
            try self.lifecycle.?.stopHandle();
        }
    }

    fn drainImpl(ctx: *anyopaque, out: *rb_mod.RingBuffer) anyerror!usize {
        const self: *VoiceOverDriver = @ptrCast(@alignCast(ctx));
        // Transfer entries from our ring into the caller's output ring.
        // Phase 1's napi.zig then calls wire.encode on `out`. Wire version
        // remains 1; no format changes this plan (CAP-15).
        var drained: usize = 0;
        while (self.ring.len > 0) {
            var tmp: [1]opts_mod.Entry = undefined;
            const n = self.ring.drain(&tmp);
            if (n == 0) break;
            out.push(tmp[0]);
            drained += 1;
        }
        return drained;
    }

    fn resetImpl(ctx: *anyopaque) anyerror!void {
        const self: *VoiceOverDriver = @ptrCast(@alignCast(ctx));
        self.ring.clear();
        // Best-effort VO cursor reset — errors swallowed (reset is a convenience).
        if (self.lifecycle) |_| {
            if (self.lifecycle.?.getShell()) |shell| {
                const reply = shell.sendAndReceive(
                    "tell application \"VoiceOver\" to tell vo cursor to move to first item of window 1",
                    2000,
                ) catch null;
                if (reply) |r| self.allocator.free(r);
            }
        }
    }

    fn deinitImpl(ctx: *anyopaque) void {
        const self: *VoiceOverDriver = @ptrCast(@alignCast(ctx));
        lifecycle_mod.uninstallExitHooks();
        if (self.lifecycle) |_| {
            self.lifecycle.?.deinit();
            self.lifecycle = null;
        }
        self.ring.deinit();
        self.allocator.destroy(self);
    }
};

/// Resolve the VoiceOver process PID via pgrep. Used by startImpl to hand the
/// PID to AxNotifications (which subscribes to AX events from that process).
fn resolveVoiceOverPid(allocator: std.mem.Allocator, runner: defaults_mod.SubprocessRunner) !i32 {
    const argv = [_][]const u8{ "/usr/bin/pgrep", "-x", "VoiceOver" };
    var result = try runner.run(allocator, &argv);
    defer result.deinit(allocator);
    if (result.exit_code != 0) return error.VOPidNotFound;
    const trimmed = std.mem.trim(u8, result.stdout, " \t\r\n");
    if (trimmed.len == 0) return error.VOPidNotFound;
    // pgrep can return multiple PIDs on separate lines; take the first.
    var it = std.mem.splitScalar(u8, trimmed, '\n');
    const first = it.next() orelse return error.VOPidNotFound;
    return std.fmt.parseInt(i32, first, 10);
}

/// Read the `OGMIOS_AX_TARGET_PID` env var and parse it as an i32. Returns null
/// when the var is absent, empty, or fails to parse (fail-closed so a bogus
/// value falls through to the VO-pid default rather than crashing the driver).
///
/// Phase 7 Plan 04: the env-var overrides the AX observer target pid. Zero
/// wire-format impact (CAP-15) — we read it at driver start time inside the
/// driver process, not across the XPC/N-API boundary.
fn readTargetPidEnv() ?i32 {
    const ptr = c.getenv("OGMIOS_AX_TARGET_PID") orelse return null;
    const slice = std.mem.span(@as([*:0]const u8, ptr));
    const trimmed = std.mem.trim(u8, slice, " \t\r\n");
    if (trimmed.len == 0) return null;
    return std.fmt.parseInt(i32, trimmed, 10) catch null;
}

/// Resolve the youngest Chromium renderer-helper child PID via `pgrep -f`.
///
/// Phase 7 Plan 04 ("DOM vs Chrome URL bar"): under Vitest browser-mode,
/// Playwright launches Chromium which then forks renderer-helper children —
/// one per tab. The parent Chromium process owns the URL bar / tab title /
/// chrome; the renderer owns the DOM viewport the test exercises. To keep
/// captured announcements scoped to page content, we bind the AX observer to
/// the renderer's pid via `OGMIOS_AX_TARGET_PID`. Test harnesses can resolve
/// the pid themselves (the `ogmios/vitest` plugin runs `pgrep` directly from
/// Node) OR call this Zig helper from their setup code.
///
/// Returns the LAST-listed pid from pgrep (most recently spawned — typically
/// the Vitest-spawned test tab on a freshly-booted headless Chromium).
pub fn resolveChromeRendererPid(
    allocator: std.mem.Allocator,
    runner: defaults_mod.SubprocessRunner,
) !i32 {
    const argv = [_][]const u8{ "/usr/bin/pgrep", "-f", "Chromium Helper (Renderer)" };
    var result = try runner.run(allocator, &argv);
    defer result.deinit(allocator);
    if (result.exit_code != 0) return error.RendererNotFound;
    const trimmed = std.mem.trim(u8, result.stdout, " \t\r\n");
    if (trimmed.len == 0) return error.RendererNotFound;

    // Multiple renderer pids possible (one per tab). The youngest is almost
    // always the Vitest-spawned test tab when running a single-instance
    // browser-mode config. Threat register T-07-42: accepted risk.
    var it = std.mem.splitScalar(u8, trimmed, '\n');
    var last: []const u8 = "";
    while (it.next()) |line| {
        const line_trim = std.mem.trim(u8, line, " \t\r\n");
        if (line_trim.len > 0) last = line_trim;
    }
    if (last.len == 0) return error.RendererNotFound;
    return std.fmt.parseInt(i32, last, 10) catch error.RendererNotFound;
}
