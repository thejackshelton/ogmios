// In-process unit tests for the Plan 08-03 Task 1 setup app scaffold.
//
// These tests exercise three things that are safe to run without any UI
// or TCC grants:
//
//   1. libobjc is actually linked — `objc_getClass("NSObject")` returns non-null
//   2. libobjc selector registration works — `sel_registerName("init")` non-null
//   3. Argv parsing logic in setup_main.zig — every branch of `parseArgs`
//
// The interactive flow (AXIsProcessTrustedWithOptions + NSAppleScript) cannot
// be unit-tested because the success criterion is a human-observable TCC
// dialog. That path is verified by the human-verify checkpoint in Task 3 and
// by the `--self-test` exit code in CI.
//
// Plan mapping (08-03-PLAN.md Task 1 § <behavior>):
//   Test 1: objc_getClass("NSObject") returns non-null (libobjc linked)
//   Test 2: sel_registerName("init") returns non-null (selector table works)
//   Test 3: parseArgs("--version") -> CmdMode.version
//   Test 4: parseArgs("--self-test") -> CmdMode.self_test
//   Test 5: parseArgs("") -> CmdMode.interactive
//   Test 6: parseArgs("--bogus") -> error.UnknownFlag

const std = @import("std");
const testing = std.testing;
const ak = @import("../src/setup/appkit_bindings.zig");
const setup = @import("../src/setup/setup_main.zig");

test "objc_getClass(NSObject) returns non-null (libobjc linked)" {
    // The Objective-C runtime must be available for the setup app to do
    // anything — NSObject is the root class; its absence means libobjc
    // wasn't linked.
    const cls = ak.objc_getClass("NSObject");
    try testing.expect(cls != null);
}

test "sel_registerName(init) returns non-null (selector table live)" {
    // `init` is one of the most-used selectors; its registration MUST
    // succeed or nothing below will send messages correctly.
    const sel = ak.sel_registerName("init");
    // sel_registerName returns a SEL (non-optional in C), but we've typed
    // it as ?*anyopaque to be defensive. A null here means libobjc is
    // mis-linked.
    try testing.expect(@intFromPtr(sel) != 0);
}

test "parseArgs(--version) -> CmdMode.version" {
    const mode = try setup.parseArgs("--version");
    try testing.expectEqual(setup.CmdMode.version, mode);
}

test "parseArgs(--self-test) -> CmdMode.self_test" {
    const mode = try setup.parseArgs("--self-test");
    try testing.expectEqual(setup.CmdMode.self_test, mode);
}

test "parseArgs(empty) -> CmdMode.interactive" {
    const mode = try setup.parseArgs("");
    try testing.expectEqual(setup.CmdMode.interactive, mode);
}

test "parseArgs(--bogus) -> error.UnknownFlag" {
    const result = setup.parseArgs("--bogus");
    try testing.expectError(setup.ParseError.UnknownFlag, result);
}

test "AXIsProcessTrusted() returns a valid bool (no crash)" {
    // Bindings regression guard: matches the shape of the crash fixed in
    // Plan 08-03 where `kCFTypeDictionaryKeyCallBacks` was mis-typed as
    // `*anyopaque` instead of `opaque {}`. `AXIsProcessTrusted()` is the
    // no-prompt probe variant — it must return `true` or `false` without
    // surfacing a dialog or faulting. We don't care which value it returns
    // here (that depends on whether the CI/dev machine granted Accessibility
    // to the test harness); we only care that the call signature is sound.
    const trusted: bool = ak.AXIsProcessTrusted();
    // Both booleans are valid; the assertion is just "we got back a bool
    // without crashing."
    try testing.expect(trusted == true or trusted == false);
}
