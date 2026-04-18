// Aggregator that roots the test module at `helper/` so individual test
// files in `test/` can `@import` sources from `src/`. Zig 0.16 requires
// every `@import` path to stay within the module root's subtree; rooting
// at `helper/` is the minimal change that lets `test/xpc_service_test.zig`
// reach `src/runner/xpc_service.zig`.
//
// Mirror pattern: `zig/all_tests.zig` plays the same role for the core.

comptime {
    _ = @import("test/xpc_service_test.zig");
}
