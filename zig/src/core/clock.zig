// Thin wall-clock + monotonic-clock + sleep wrapper for Zig 0.16.
//
// Zig 0.16 removed `std.time.nanoTimestamp` and `std.Thread.sleep`; they were
// moved into the new Io abstraction. To avoid wiring an `Io` instance through
// every driver module, we call std.c directly here.
//
// Darwin / Linux only — Windows is out of scope for v1.

const std = @import("std");
const c = std.c;

/// Nanoseconds since the Unix epoch (CLOCK_REALTIME). Used for entry
/// timestamps — monotonicity is not required; callers preserve ordering via
/// ring-buffer push order, not ts comparison.
pub fn nanoTimestamp() u64 {
    var ts: c.timespec = undefined;
    _ = c.clock_gettime(c.clockid_t.REALTIME, &ts);
    const sec: u64 = @intCast(ts.sec);
    const nsec: u64 = @intCast(ts.nsec);
    return sec * std.time.ns_per_s + nsec;
}

/// Sleep for `ns` nanoseconds. Thin wrapper over nanosleep(2). Signal-interrupt
/// is ignored — we sleep at most once; callers in tight loops (PollLoop) tick
/// on their own cadence, so short-sleep drift is harmless.
pub fn sleepNs(ns: u64) void {
    const ns_per_s: u64 = std.time.ns_per_s;
    const sec: i64 = @intCast(ns / ns_per_s);
    const nsec: c_long = @intCast(ns % ns_per_s);
    const req: c.timespec = .{ .sec = sec, .nsec = nsec };
    _ = c.nanosleep(&req, null);
}

/// Sleep for `ms` milliseconds. Convenience wrapper.
pub fn sleepMs(ms: u64) void {
    sleepNs(ms * std.time.ns_per_ms);
}
