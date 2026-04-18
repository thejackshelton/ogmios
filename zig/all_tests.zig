// Aggregator test file for Zig 0.16's stricter module-path enforcement.
// Each individual test file imports `../src/...` which only works when the
// containing Module's root directory is `zig/`. Rather than wire each test
// file as its own Module (which would require one aggregator per file, since
// a Module cannot have multiple root source files), we aggregate by
// `comptime _ = @import(...)` so Zig's test runner picks up every test block
// via transitive comptime reference.

comptime {
    _ = @import("test/ring_buffer_test.zig");
    _ = @import("test/wire_test.zig");
    _ = @import("test/noop_driver_test.zig");
    _ = @import("test/voiceover_defaults_test.zig");
    _ = @import("test/voiceover_applescript_test.zig");
    _ = @import("test/voiceover_ax_notifications_test.zig");
    _ = @import("test/voiceover_lifecycle_test.zig");
    _ = @import("test/voiceover_driver_test.zig");
    _ = @import("test/wire_regression_test.zig");
    _ = @import("test/voiceover_integration_test.zig");
}

test {
    @import("std").testing.refAllDecls(@This());
}
