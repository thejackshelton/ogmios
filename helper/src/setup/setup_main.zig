// ShokiSetup.app — Zig-compiled GUI whose only job is to trigger the macOS
// TCC prompts for Accessibility + Automation-of-VoiceOver on first launch.
//
// Phase 07 QA-REPORT.md proved that CLI parent processes cannot trigger these
// prompts — macOS only prompts when a bundled `.app` tries to use a
// protected API. ShokiSetup.app replaces "follow these 4 System Settings
// steps" with "double-click this once."
//
// Flow (interactive mode, no flags):
//
//   1. NSApplication.sharedApplication + setActivationPolicy(.regular) + activate
//   2. AXIsProcessTrustedWithOptions({ kAXTrustedCheckOptionPrompt: YES })
//      -> macOS shows the Accessibility TCC dialog if not yet granted
//   3. NSAppleScript `tell application "VoiceOver" to launch` -> VO boots
//   4. NSAppleScript `tell application "VoiceOver" to get bounds of vo cursor`
//      -> triggers the Automation-of-VoiceOver TCC dialog (QA-REPORT.md
//      Unblockers Step 1 Option A)
//   5. NSAlert "Shoki is ready" modal
//   6. NSAppleScript `tell application "VoiceOver" to quit` (courtesy cleanup)
//   7. [NSApp terminate:nil]
//
// Flags:
//   --version   -> print "ShokiSetup <ver> (zig-compiled)"; exit 0
//   --self-test -> exercise linkage (objc_getClass for NSApplication +
//                  NSAppleScript); skip UI; exit 0 — for CI smoke tests
//   (no flag)   -> interactive run described above

const std = @import("std");
const ak = @import("appkit_bindings.zig");

pub const version = "0.1.0";

/// Mode of the ShokiSetup run, derived from argv.
pub const CmdMode = enum { interactive, version, self_test };

/// Parse errors — only one shape: unknown flag -> hard fail w/ exit 2.
pub const ParseError = error{UnknownFlag};

/// Parse a single argv slot into a `CmdMode`. Empty string means "no flag"
/// (interactive). We only accept one recognized flag per invocation —
/// unrecognized flags become `error.UnknownFlag` which main() translates to
/// exit code 2 (the convention for "bad CLI usage" established by Plan 02
/// and mirrored across the helper).
pub fn parseArgs(arg: []const u8) ParseError!CmdMode {
    if (arg.len == 0) return .interactive;
    if (std.mem.eql(u8, arg, "--version")) return .version;
    if (std.mem.eql(u8, arg, "--self-test")) return .self_test;
    return ParseError.UnknownFlag;
}

// ---------------------------------------------------------------------------
// libc shims — keep the CLI surface tiny; avoid std.Io dependency
// ---------------------------------------------------------------------------
//
// Zig 0.16 removed `std.io.getStdOut`/`std.posix.write` in favor of the Io
// abstraction. Plan 02's `src/runner/main.zig` already went with direct libc
// externs for its `--version` line; we mirror that here for consistency.

extern "c" fn write(fd: c_int, buf: [*]const u8, n: usize) isize;
extern "c" fn exit(status: c_int) noreturn;

// `usleep(usec)` — simple portable sleep in microseconds. Zig 0.16 removed
// `std.Thread.sleep`; calling libc directly keeps the surface tiny and
// matches the pattern established in src/runner/main.zig for write/exit.
extern "c" fn usleep(usec: u32) c_int;

/// Sleep for `seconds` whole seconds. Uses libc `usleep` under the hood.
fn sleepSeconds(seconds: u32) void {
    _ = usleep(seconds * 1_000_000);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

pub fn main(init: std.process.Init.Minimal) !void {
    // Iterate argv for the first non-exe arg. Zig 0.16 `Init.Minimal.args`
    // is the post-refactor shape (same as `src/runner/main.zig`).
    var it = init.args.iterate();
    _ = it.next(); // argv[0]
    const first: []const u8 = it.next() orelse "";

    const mode = parseArgs(first) catch {
        var buf: [128]u8 = undefined;
        const line = try std.fmt.bufPrint(
            &buf,
            "ShokiSetup: unknown flag '{s}'\n",
            .{first},
        );
        _ = write(2, line.ptr, line.len);
        exit(2);
    };

    switch (mode) {
        .version => {
            var buf: [64]u8 = undefined;
            const line = try std.fmt.bufPrint(
                &buf,
                "ShokiSetup {s} (zig-compiled)\n",
                .{version},
            );
            _ = write(1, line.ptr, line.len);
            return;
        },
        .self_test => {
            // Prove the linker resolved libobjc + AppKit + Foundation
            // without showing any UI. Each class lookup that fails gets
            // its own non-zero exit code so CI diagnostics tell us
            // exactly what broke.
            _ = ak.objc_getClass("NSObject") orelse {
                _ = write(2, "ShokiSetup: libobjc missing\n", 28);
                exit(10);
            };
            _ = ak.objc_getClass("NSApplication") orelse {
                _ = write(2, "ShokiSetup: AppKit missing\n", 27);
                exit(11);
            };
            _ = ak.objc_getClass("NSAppleScript") orelse {
                _ = write(2, "ShokiSetup: Foundation missing\n", 31);
                exit(12);
            };
            _ = ak.objc_getClass("NSAlert") orelse {
                _ = write(2, "ShokiSetup: NSAlert missing\n", 28);
                exit(13);
            };
            return;
        },
        .interactive => try runInteractive(),
    }
}

// ---------------------------------------------------------------------------
// Interactive path — triggers TCC prompts + shows the success modal.
// ---------------------------------------------------------------------------
//
// See the Obj-C-via-objc_msgSend flow in the plan's <flow_contract>. Every
// call goes through the typed `objc_msgSend_*` variants in
// appkit_bindings.zig — we never reach the variadic symbol directly.
//
// Implementation lives here (Task 1 scaffold; Task 2 fills the rest).

fn runInteractive() !void {
    // -----------------------------------------------------------------
    // 1. NSApplication.sharedApplication — start AppKit main thread.
    // -----------------------------------------------------------------
    const ns_application_cls = ak.objc_getClass("NSApplication") orelse return error.AppKitMissing;
    const sel_shared_app = ak.sel_registerName("sharedApplication") orelse return error.SelectorMissing;
    const ns_app = ak.objc_msgSend_id(ns_application_cls, sel_shared_app) orelse return error.NsAppMissing;

    // `setActivationPolicy:` — make the app show in the dock with a menubar.
    // NSApplicationActivationPolicyRegular = 0.
    const sel_set_activation_policy = ak.sel_registerName("setActivationPolicy:") orelse return error.SelectorMissing;
    ak.objc_msgSend_void_i64(ns_app, sel_set_activation_policy, 0);

    // `activateIgnoringOtherApps:` — bring the modal to the foreground.
    const sel_activate = ak.sel_registerName("activateIgnoringOtherApps:") orelse return error.SelectorMissing;
    _ = ak.objc_msgSend_bool_bool(ns_app, sel_activate, true);

    // -----------------------------------------------------------------
    // 2. Probe Accessibility via AXIsProcessTrustedWithOptions(prompt=YES)
    //    -> fires the macOS Accessibility TCC dialog if not already granted.
    // -----------------------------------------------------------------
    const options = buildPromptOptions() orelse return error.CfDictionaryCreateFailed;
    defer ak.CFRelease(options);
    _ = ak.AXIsProcessTrustedWithOptions(options);

    // -----------------------------------------------------------------
    // 3. Launch VoiceOver via NSAppleScript.
    // -----------------------------------------------------------------
    _ = runAppleScript("tell application \"VoiceOver\" to launch");

    // Give VO a moment to finish boot before we send it a real AppleEvent.
    sleepSeconds(3);

    // -----------------------------------------------------------------
    // 4. Send a real VO AppleEvent -> triggers Automation TCC prompt.
    //    Per QA-REPORT.md Unblockers Step 1 Option A.
    // -----------------------------------------------------------------
    _ = runAppleScript("tell application \"VoiceOver\" to get bounds of vo cursor");

    // Give the system a moment to present the Automation prompt.
    sleepSeconds(2);

    // -----------------------------------------------------------------
    // 5. Success modal: NSAlert.
    // -----------------------------------------------------------------
    showSuccessAlert();

    // -----------------------------------------------------------------
    // 6. Cleanup: tell VO to quit so we don't leave it running.
    // -----------------------------------------------------------------
    _ = runAppleScript("tell application \"VoiceOver\" to quit");

    // -----------------------------------------------------------------
    // 7. [NSApp terminate:nil]
    // -----------------------------------------------------------------
    const sel_terminate = ak.sel_registerName("terminate:") orelse return error.SelectorMissing;
    ak.objc_msgSend_void_id(ns_app, sel_terminate, null);
}

// ---------------------------------------------------------------------------
// Helpers for the interactive path
// ---------------------------------------------------------------------------

/// Build a CFDictionary { kAXTrustedCheckOptionPrompt: kCFBooleanTrue } that
/// `AXIsProcessTrustedWithOptions` reads to decide whether to show the
/// accessibility TCC prompt. Returns null on failure.
///
/// The key string is constructed from a UTF-8 literal because the canonical
/// `kAXTrustedCheckOptionPrompt` symbol isn't reliably re-exported in a way
/// Zig can resolve without @cImport. Apple documents the string form
/// ("AXTrustedCheckOptionPrompt") explicitly for this exact workaround.
fn buildPromptOptions() ?*anyopaque {
    const key = ak.CFStringCreateWithCString(
        null,
        "AXTrustedCheckOptionPrompt",
        ak.kCFStringEncodingUTF8,
    ) orelse return null;
    // CFDictionaryCreate retains keys/values; release our local reference
    // after dict creation.
    defer ak.CFRelease(key);

    var keys = [_]?*anyopaque{key};
    var values = [_]?*anyopaque{ak.kCFBooleanTrue};

    return ak.CFDictionaryCreate(
        null,
        &keys,
        &values,
        1,
        &ak.kCFTypeDictionaryKeyCallBacks,
        &ak.kCFTypeDictionaryValueCallBacks,
    );
}

/// Build an NSString from a UTF-8 literal.
fn nsString(cstr: [*:0]const u8) ?*anyopaque {
    const ns_string_cls = ak.objc_getClass("NSString") orelse return null;
    const sel_with_utf8 = ak.sel_registerName("stringWithUTF8String:") orelse return null;
    return ak.objc_msgSend_id_cstr(ns_string_cls, sel_with_utf8, cstr);
}

/// Run an AppleScript source. Ignores errors — the point of the call is
/// the side effect (triggering TCC prompts / launching VO). We pass null
/// for the out-error dict to keep the surface minimal.
fn runAppleScript(source: [*:0]const u8) void {
    const ns_apple_script_cls = ak.objc_getClass("NSAppleScript") orelse return;
    const sel_alloc = ak.sel_registerName("alloc") orelse return;
    const sel_init_with_source = ak.sel_registerName("initWithSource:") orelse return;
    const sel_execute = ak.sel_registerName("executeAndReturnError:") orelse return;

    const allocated = ak.objc_msgSend_id(ns_apple_script_cls, sel_alloc) orelse return;
    const src = nsString(source) orelse return;
    const script = ak.objc_msgSend_id_id(allocated, sel_init_with_source, src) orelse return;

    _ = ak.objc_msgSend_id_idp(script, sel_execute, null);
}

/// Show the "Shoki is ready" NSAlert. Blocks until user clicks Close.
fn showSuccessAlert() void {
    const ns_alert_cls = ak.objc_getClass("NSAlert") orelse return;
    const sel_alloc = ak.sel_registerName("alloc") orelse return;
    const sel_init = ak.sel_registerName("init") orelse return;
    const sel_set_message = ak.sel_registerName("setMessageText:") orelse return;
    const sel_set_informative = ak.sel_registerName("setInformativeText:") orelse return;
    const sel_add_button = ak.sel_registerName("addButtonWithTitle:") orelse return;
    const sel_run_modal = ak.sel_registerName("runModal") orelse return;

    const allocated = ak.objc_msgSend_id(ns_alert_cls, sel_alloc) orelse return;
    const alert = ak.objc_msgSend_id(allocated, sel_init) orelse return;

    const msg = nsString("Shoki is ready") orelse return;
    ak.objc_msgSend_void_id(alert, sel_set_message, msg);

    const info = nsString(
        "VoiceOver permissions have been requested. You can now close this window and run your shoki tests.",
    ) orelse return;
    ak.objc_msgSend_void_id(alert, sel_set_informative, info);

    const button = nsString("Close") orelse return;
    _ = ak.objc_msgSend_id_id(alert, sel_add_button, button);

    _ = ak.objc_msgSend_i64(alert, sel_run_modal);
}
