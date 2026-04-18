// Thin pthread-based Mutex + Condition wrapper.
//
// Zig 0.16 removed `std.Thread.Mutex` / `std.Thread.Condition` in favor of the
// new `std.Io.Mutex` / `std.Io.Condition` API that requires an `Io` instance
// to be threaded through every call. Rather than propagate that API surface
// through munadi's driver code, we wrap pthreads directly here. The surface
// intentionally mirrors the old std.Thread.Mutex API shape so call sites
// remain one-liners.
//
// Darwin / Linux only — Windows is out of scope for v1.

const std = @import("std");
const c = std.c;

pub const Mutex = struct {
    inner: c.pthread_mutex_t = c.PTHREAD_MUTEX_INITIALIZER,

    pub const init: Mutex = .{};

    pub fn lock(self: *Mutex) void {
        _ = c.pthread_mutex_lock(&self.inner);
    }

    pub fn unlock(self: *Mutex) void {
        _ = c.pthread_mutex_unlock(&self.inner);
    }

    pub fn deinit(self: *Mutex) void {
        _ = c.pthread_mutex_destroy(&self.inner);
    }
};

pub const Condition = struct {
    inner: c.pthread_cond_t = c.PTHREAD_COND_INITIALIZER,

    pub const init: Condition = .{};

    pub fn wait(self: *Condition, mutex: *Mutex) void {
        _ = c.pthread_cond_wait(&self.inner, &mutex.inner);
    }

    /// Wait up to `timeout_ns` nanoseconds for a signal. Returns `error.Timeout`
    /// if the wait expired with no signal, otherwise returns normally.
    pub fn timedWait(self: *Condition, mutex: *Mutex, timeout_ns: u64) error{Timeout}!void {
        var ts: c.timespec = undefined;
        // pthread_cond_timedwait takes an ABSOLUTE timespec — not a delta.
        // Use CLOCK_REALTIME to match the default condition clock attribute.
        _ = c.clock_gettime(c.clockid_t.REALTIME, &ts);

        const ns_per_s: u64 = std.time.ns_per_s;
        const add_sec: i64 = @intCast(timeout_ns / ns_per_s);
        const add_nsec: i64 = @intCast(timeout_ns % ns_per_s);

        ts.sec = @intCast(@as(i128, ts.sec) + add_sec);
        const new_nsec: i64 = @as(i64, @intCast(ts.nsec)) + add_nsec;
        if (new_nsec >= @as(i64, @intCast(ns_per_s))) {
            ts.sec += 1;
            ts.nsec = @intCast(new_nsec - @as(i64, @intCast(ns_per_s)));
        } else {
            ts.nsec = @intCast(new_nsec);
        }

        const e = c.pthread_cond_timedwait(&self.inner, &mutex.inner, &ts);
        if (e == .TIMEDOUT) return error.Timeout;
    }

    pub fn signal(self: *Condition) void {
        _ = c.pthread_cond_signal(&self.inner);
    }

    pub fn broadcast(self: *Condition) void {
        _ = c.pthread_cond_broadcast(&self.inner);
    }

    pub fn deinit(self: *Condition) void {
        _ = c.pthread_cond_destroy(&self.inner);
    }
};
