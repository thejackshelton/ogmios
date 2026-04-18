const std = @import("std");
const builtin = @import("builtin");
const lifecycle_mod = @import("../src/drivers/voiceover/lifecycle.zig");
const defaults_mod = @import("../src/drivers/voiceover/defaults.zig");

// Darwin-only smoke test: invoke the real SubprocessRunner against real
// pgrep. Doesn't require VoiceOver to be running — the point is to verify
// the real runner fork+exec path works end-to-end. On non-darwin we skip.
test "voiceover integration: real pgrep invocation via realSubprocessRunner" {
    if (builtin.target.os.tag != .macos) return error.SkipZigTest;

    // isVoiceOverRunning either returns true (user had VO on) or false (no VO)
    // — both are valid. The test asserts only that the call completes without
    // erroring through the realSubprocessRunner's fork+exec.
    const running = try lifecycle_mod.isVoiceOverRunning(
        std.testing.allocator,
        defaults_mod.realSubprocessRunner,
    );
    _ = running;
}

test "voiceover integration: detectMacOSVersion parses real sw_vers output" {
    if (builtin.target.os.tag != .macos) return error.SkipZigTest;

    const version = try defaults_mod.detectMacOSVersion(std.testing.allocator);
    // Any macOS release from Sonoma onward has major >= 14.
    try std.testing.expect(version.major >= 14);
}
