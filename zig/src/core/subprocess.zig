// Thin subprocess wrapper for Zig 0.16.
//
// Zig 0.16 redesigned `std.process.Child` to route every operation through
// an `Io` instance (`process.spawn(io, options)`, `child.kill(io)`, etc.).
// That abstraction is overkill for our 2 use-cases:
//   1) defaults.realRun — run `defaults`/`pgrep`/`pkill` and collect stdout.
//   2) applescript.RealSpawner — spawn `osascript` with pipes on stdin/stdout.
//
// We implement both via POSIX fork+execvp+pipe directly, which is:
//   * stable across future Zig stdlib churn,
//   * small (~150 LoC),
//   * signal-safe enough for crashRestore (fork is async-signal-safe on
//     POSIX; execvp is signal-safe by POSIX spec).
//
// Darwin / Linux only.

const std = @import("std");
const c = std.c;
const posix = std.posix;

// std.c exposes `execve` but not `execvp` on Zig 0.16; declare it here since
// our callers want PATH-searching behavior for /usr/bin-relative invocations.
extern "c" fn execvp(file: [*:0]const u8, argv: [*:null]const ?[*:0]const u8) c_int;

pub const SpawnError = error{
    FileNotFound,
    ForkFailed,
    PipeFailed,
    OutOfMemory,
    Unexpected,
};

pub const RunError = error{
    FileNotFound,
    ForkFailed,
    PipeFailed,
    OutOfMemory,
    ReadFailed,
    Unexpected,
};

pub const Term = union(enum) {
    exited: u8,
    signal: c_int,
    unknown: c_int,
};

pub const PipedChild = struct {
    pid: c.pid_t,
    stdin_fd: posix.fd_t,
    stdout_fd: posix.fd_t,
    /// -1 if stderr was sent to /dev/null.
    stderr_fd: posix.fd_t,

    /// Spawn a child with stdin + stdout + (optional) stderr piped.
    /// `argv[0]` must be a valid path (absolute or on PATH).
    pub fn spawn(allocator: std.mem.Allocator, argv: []const []const u8, capture_stderr: bool) SpawnError!PipedChild {
        _ = allocator;

        var stdin_pipe: [2]posix.fd_t = undefined;
        var stdout_pipe: [2]posix.fd_t = undefined;
        var stderr_pipe: [2]posix.fd_t = undefined;

        if (c.pipe(&stdin_pipe) != 0) return error.PipeFailed;
        errdefer {
            _ = c.close(stdin_pipe[0]);
            _ = c.close(stdin_pipe[1]);
        }
        if (c.pipe(&stdout_pipe) != 0) return error.PipeFailed;
        errdefer {
            _ = c.close(stdout_pipe[0]);
            _ = c.close(stdout_pipe[1]);
        }
        if (capture_stderr) {
            if (c.pipe(&stderr_pipe) != 0) return error.PipeFailed;
        } else {
            stderr_pipe = .{ -1, -1 };
        }
        errdefer if (capture_stderr) {
            _ = c.close(stderr_pipe[0]);
            _ = c.close(stderr_pipe[1]);
        };

        // Pre-validate argv[0] exists and is executable — otherwise fork+exec
        // would only surface the failure via waitpid exit_code=127.
        if (argv.len == 0) return error.FileNotFound;
        if (!argvZeroLooksExecutable(argv[0])) {
            // Clean up pipes before returning.
            _ = c.close(stdin_pipe[0]);
            _ = c.close(stdin_pipe[1]);
            _ = c.close(stdout_pipe[0]);
            _ = c.close(stdout_pipe[1]);
            if (capture_stderr) {
                _ = c.close(stderr_pipe[0]);
                _ = c.close(stderr_pipe[1]);
            }
            return error.FileNotFound;
        }

        // Build null-terminated argv for execvp.
        const max_argv = 64;
        if (argv.len + 1 > max_argv) return error.Unexpected;
        var argv_z: [max_argv][*:0]u8 = undefined;
        var nt_bufs: [max_argv][512]u8 = undefined;
        for (argv, 0..) |a, i| {
            if (a.len >= 512) return error.Unexpected;
            @memcpy(nt_bufs[i][0..a.len], a);
            nt_bufs[i][a.len] = 0;
            argv_z[i] = @ptrCast(&nt_bufs[i]);
        }
        // execvp needs a null-terminated array; we over-allocate by one to
        // hold the terminator. Use a ?-pointer array so writing null is valid.
        var argv_ptr: [max_argv + 1]?[*:0]u8 = undefined;
        for (argv, 0..) |_, i| argv_ptr[i] = argv_z[i];
        argv_ptr[argv.len] = null;

        const pid = c.fork();
        if (pid < 0) {
            _ = c.close(stdin_pipe[0]);
            _ = c.close(stdin_pipe[1]);
            _ = c.close(stdout_pipe[0]);
            _ = c.close(stdout_pipe[1]);
            if (capture_stderr) {
                _ = c.close(stderr_pipe[0]);
                _ = c.close(stderr_pipe[1]);
            }
            return error.ForkFailed;
        }

        if (pid == 0) {
            // --- Child ---
            // Replace stdin/stdout/stderr with the pipe ends.
            _ = c.dup2(stdin_pipe[0], 0);
            _ = c.dup2(stdout_pipe[1], 1);
            if (capture_stderr) {
                _ = c.dup2(stderr_pipe[1], 2);
            } else {
                // Redirect stderr to /dev/null to match prior behavior.
                const devnull = c.open("/dev/null", .{ .ACCMODE = .WRONLY }, @as(c.mode_t, 0));
                if (devnull >= 0) {
                    _ = c.dup2(devnull, 2);
                    _ = c.close(devnull);
                }
            }
            // Close pipe fds in child (we've already dup'd them).
            _ = c.close(stdin_pipe[0]);
            _ = c.close(stdin_pipe[1]);
            _ = c.close(stdout_pipe[0]);
            _ = c.close(stdout_pipe[1]);
            if (capture_stderr) {
                _ = c.close(stderr_pipe[0]);
                _ = c.close(stderr_pipe[1]);
            }

            _ = execvp(argv_z[0], @ptrCast(&argv_ptr));
            // If execvp returns, the exec failed. Use exit code 127 to mirror shells.
            c._exit(127);
        }

        // --- Parent ---
        _ = c.close(stdin_pipe[0]);
        _ = c.close(stdout_pipe[1]);
        if (capture_stderr) _ = c.close(stderr_pipe[1]);

        return .{
            .pid = pid,
            .stdin_fd = stdin_pipe[1],
            .stdout_fd = stdout_pipe[0],
            .stderr_fd = if (capture_stderr) stderr_pipe[0] else -1,
        };
    }

    pub fn writeStdin(self: *PipedChild, data: []const u8) !void {
        var remaining = data;
        while (remaining.len > 0) {
            const n = c.write(self.stdin_fd, remaining.ptr, remaining.len);
            if (n < 0) return error.WriteFailed;
            if (n == 0) return error.WriteFailed;
            remaining = remaining[@intCast(n)..];
        }
    }

    pub fn closeStdin(self: *PipedChild) void {
        if (self.stdin_fd >= 0) {
            _ = c.close(self.stdin_fd);
            self.stdin_fd = -1;
        }
    }

    pub fn kill(self: *PipedChild) void {
        if (self.pid > 0) {
            _ = c.kill(self.pid, .TERM);
        }
    }

    pub fn wait(self: *PipedChild) Term {
        if (self.pid <= 0) return .{ .unknown = 0 };
        var status: c_int = 0;
        while (true) {
            const r = c.waitpid(self.pid, &status, 0);
            if (r == self.pid) break;
            if (r < 0) {
                // Errno EINTR → retry; anything else → give up.
                if (std.posix.errno(r) == .INTR) continue;
                return .{ .unknown = status };
            }
        }
        self.pid = -1;

        if (WIFEXITED(status)) return .{ .exited = @intCast(WEXITSTATUS(status)) };
        if (WIFSIGNALED(status)) return .{ .signal = WTERMSIG(status) };
        return .{ .unknown = status };
    }

    pub fn close(self: *PipedChild) void {
        if (self.stdin_fd >= 0) {
            _ = c.close(self.stdin_fd);
            self.stdin_fd = -1;
        }
        if (self.stdout_fd >= 0) {
            _ = c.close(self.stdout_fd);
            self.stdout_fd = -1;
        }
        if (self.stderr_fd >= 0) {
            _ = c.close(self.stderr_fd);
            self.stderr_fd = -1;
        }
    }
};

// POSIX waitpid macros (reimplemented because std.posix doesn't re-export them under 0.16).
fn WIFEXITED(status: c_int) bool {
    return (status & 0x7f) == 0;
}
fn WEXITSTATUS(status: c_int) c_int {
    return (status >> 8) & 0xff;
}
fn WIFSIGNALED(status: c_int) bool {
    const sig = status & 0x7f;
    return sig != 0 and sig != 0x7f;
}
fn WTERMSIG(status: c_int) c_int {
    return status & 0x7f;
}

fn argvZeroLooksExecutable(path: []const u8) bool {
    // Absolute path → stat + check executable bit.
    if (std.mem.startsWith(u8, path, "/")) {
        var buf: [512]u8 = undefined;
        if (path.len >= buf.len) return false;
        @memcpy(buf[0..path.len], path);
        buf[path.len] = 0;
        return c.access(@ptrCast(&buf), c.X_OK) == 0;
    }
    // Relative name → let execvp search PATH. We can't easily pre-validate
    // without re-implementing PATH lookup; accept optimistically. execvp will
    // fail and the child exits 127 on miss.
    return true;
}

/// One-shot run: spawn, collect stdout+stderr to EOF, wait. Equivalent of
/// `RunResult` semantics in defaults.zig.
pub const RunResult = struct {
    stdout: []u8,
    stderr: []u8,
    exit_code: u8,

    pub fn deinit(self: *RunResult, allocator: std.mem.Allocator) void {
        allocator.free(self.stdout);
        allocator.free(self.stderr);
    }
};

pub fn runCollect(allocator: std.mem.Allocator, argv: []const []const u8) RunError!RunResult {
    var child = PipedChild.spawn(allocator, argv, true) catch |err| switch (err) {
        error.FileNotFound => return error.FileNotFound,
        error.ForkFailed => return error.ForkFailed,
        error.PipeFailed => return error.PipeFailed,
        error.OutOfMemory => return error.OutOfMemory,
        error.Unexpected => return error.Unexpected,
    };
    // Don't write to stdin; close it so the child doesn't block on read.
    child.closeStdin();

    var stdout_list: std.ArrayListUnmanaged(u8) = .empty;
    defer stdout_list.deinit(allocator);
    var stderr_list: std.ArrayListUnmanaged(u8) = .empty;
    defer stderr_list.deinit(allocator);

    var buf: [4096]u8 = undefined;
    // Read stdout to EOF.
    while (true) {
        const n = c.read(child.stdout_fd, &buf, buf.len);
        if (n <= 0) break;
        try stdout_list.appendSlice(allocator, buf[0..@intCast(n)]);
    }
    // Read stderr to EOF.
    while (true) {
        const n = c.read(child.stderr_fd, &buf, buf.len);
        if (n <= 0) break;
        try stderr_list.appendSlice(allocator, buf[0..@intCast(n)]);
    }

    const term = child.wait();
    child.close();

    const exit_code: u8 = switch (term) {
        .exited => |code| code,
        else => 255,
    };

    return .{
        .stdout = try stdout_list.toOwnedSlice(allocator),
        .stderr = try stderr_list.toOwnedSlice(allocator),
        .exit_code = exit_code,
    };
}
