// OgmiosSetup.app — Zig-compiled GUI whose only job is to trigger the macOS
// TCC prompts for Accessibility + Automation-of-VoiceOver on first launch.
//
// Phase 07 QA-REPORT.md proved that CLI parent processes cannot trigger these
// prompts — macOS only prompts when a bundled `.app` tries to use a
// protected API. OgmiosSetup.app replaces "follow these 4 System Settings
// steps" with "double-click this once."
//
// ## Sequencing (why this file is opinionated)
//
// The original Plan 08-03 flow fired Accessibility + VoiceOver-launch +
// Automation back-to-back with fixed sleeps. On real hardware the result
// was cascading dialogs: the Accessibility prompt appeared at the same
// moment VoiceOver boot started announcing itself over the top of the
// prompt, and the Automation prompt landed ~3s later before the user
// had time to click Allow on the first one.
//
// This file implements the FIX: each stage blocks until macOS actually
// reports the prior grant, and each stage is fronted by an NSAlert so
// the user knows what's about to happen.
//
// Flow (interactive mode, no flags):
//
//   1. NSApplication.sharedApplication + setActivationPolicy(.regular) + activate
//   2. Welcome NSAlert — single Continue button.
//   3. Probe AXIsProcessTrusted(); skip step 4 if already granted.
//   4. AXIsProcessTrustedWithOptions({ kAXTrustedCheckOptionPrompt: YES })
//      -> macOS shows the Accessibility TCC dialog.
//   5. Poll AXIsProcessTrusted() every 500ms for up to 120s until granted.
//      Timeout -> "open System Settings" NSAlert + exit 4.
//   6. Mid-flow NSAlert: "Accessibility granted, now requesting Automation."
//   7. NSAppleScript `tell application "VoiceOver" to launch` -> VO boots.
//   8. 3-second settle.
//   9. NSAppleScript `tell application "VoiceOver" to get bounds of vo cursor`
//      in a retry loop — the first hit fires the Automation TCC prompt;
//      subsequent hits succeed once the user clicks Allow. Polls every
//      500ms for up to 60s.
//  10. Success NSAlert: "Ogmios is ready".
//  11. NSAppleScript `tell application "VoiceOver" to quit` (courtesy cleanup).
//  12. [NSApp terminate:nil].
//
// Flags:
//   --version               -> print "OgmiosSetup <ver> (zig-compiled)"; exit 0
//   --self-test             -> exercise linkage (objc_getClass for
//                              NSApplication + NSAppleScript); skip UI;
//                              exit 0 — for CI smoke tests
//   --self-test-sequencing  -> dry-run the sequenced flow WITHOUT triggering
//                              TCC prompts or launching VoiceOver. Exercises
//                              the probe + polling timing code so CI can
//                              catch regressions without a human at the
//                              keyboard. Exit 0 within ~5s.
//   (no flag)               -> interactive run described above

const std = @import("std");
const ak = @import("appkit_bindings.zig");

pub const version = "0.1.0";

/// Mode of the OgmiosSetup run, derived from argv.
pub const CmdMode = enum { interactive, version, self_test, self_test_sequencing };

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
    if (std.mem.eql(u8, arg, "--self-test-sequencing")) return .self_test_sequencing;
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

/// Sleep for `ms` milliseconds. Used by the polling loops in
/// runInteractive + self-test-sequencing. 500ms is the typical cadence;
/// 100ms is used by self-test-sequencing to stay fast.
fn sleepMilliseconds(ms: u32) void {
    _ = usleep(ms * 1_000);
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
            "OgmiosSetup: unknown flag '{s}'\n",
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
                "OgmiosSetup {s} (zig-compiled)\n",
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
                _ = write(2, "OgmiosSetup: libobjc missing\n", 29);
                exit(10);
            };
            _ = ak.objc_getClass("NSApplication") orelse {
                _ = write(2, "OgmiosSetup: AppKit missing\n", 28);
                exit(11);
            };
            _ = ak.objc_getClass("NSAppleScript") orelse {
                _ = write(2, "OgmiosSetup: Foundation missing\n", 32);
                exit(12);
            };
            _ = ak.objc_getClass("NSAlert") orelse {
                _ = write(2, "OgmiosSetup: NSAlert missing\n", 29);
                exit(13);
            };
            return;
        },
        .self_test_sequencing => {
            // Dry-run of the sequenced flow — no TCC prompts, no VO
            // launch. We exercise the pieces of the new logic that CAN
            // run without user interaction:
            //
            //   * AXIsProcessTrusted() — the no-prompt probe binding
            //     must resolve at link time and return a valid bool.
            //   * pollAccessibility() with a short timeout — verifies
            //     the polling loop terminates cleanly whether or not
            //     the calling user has granted Accessibility.
            //   * sleepMilliseconds() — verifies libc usleep shim.
            //
            // Designed to exit within ~5s on any hardware.
            const trusted_probe: bool = ak.AXIsProcessTrusted();
            if (trusted_probe) {
                _ = write(1, "self-test-sequencing: AXIsProcessTrusted=true\n", 46);
            } else {
                _ = write(1, "self-test-sequencing: AXIsProcessTrusted=false\n", 47);
            }

            // Verify the sleep shim works.
            sleepMilliseconds(100);
            _ = write(1, "self-test-sequencing: sleepMilliseconds(100) ok\n", 48);

            // Verify the polling loop terminates. Cap at 1 second (2
            // iterations at 500ms) so we exit quickly regardless of
            // current Accessibility state.
            const polled = pollAccessibility(1);
            if (polled) {
                _ = write(1, "self-test-sequencing: poll result=granted\n", 42);
            } else {
                _ = write(1, "self-test-sequencing: poll result=not-granted (expected on ungranted hosts)\n", 76);
            }

            _ = write(1, "self-test-sequencing: ok\n", 25);
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
    // 2. Welcome alert — user clicks Continue before anything else.
    //    This gives them a chance to read BEFORE the first TCC dialog.
    // -----------------------------------------------------------------
    activateApp();
    showAlert(
        "Welcome to Ogmios Setup",
        "Click Continue to grant the 2 permissions ogmios needs " ++
            "(Accessibility + Automation of VoiceOver).\n\n" ++
            "After you click Continue, macOS will show its own system " ++
            "dialog. Follow the on-screen instructions to grant " ++
            "Accessibility access.",
        "Continue",
    );

    // -----------------------------------------------------------------
    // 3. Probe Accessibility via the no-prompt variant first. If the
    //    user already granted it on a prior run we skip the prompt +
    //    polling entirely.
    // -----------------------------------------------------------------
    if (!ak.AXIsProcessTrusted()) {
        // Fire the Accessibility TCC dialog.
        const options = buildPromptOptions() orelse return error.CfDictionaryCreateFailed;
        defer ak.CFRelease(options);
        _ = ak.AXIsProcessTrustedWithOptions(options);

        // -----------------------------------------------------------------
        // 4. BLOCK on the user's grant. Poll every 500ms for up to 120s.
        //    Without this loop the old flow raced ahead and fired the
        //    Automation dialog over the top of the Accessibility dialog.
        // -----------------------------------------------------------------
        const granted = pollAccessibility(120);
        if (!granted) {
            activateApp();
            showAlert(
                "Accessibility access is required",
                "Ogmios could not detect an Accessibility grant within 120 " ++
                    "seconds.\n\nOpen System Settings \xe2\x86\x92 Privacy & Security " ++
                    "\xe2\x86\x92 Accessibility, enable OgmiosSetup, and re-run this " ++
                    "app.",
                "Close",
            );
            exit(4);
        }
    }

    // -----------------------------------------------------------------
    // 5. Mid-flow alert — tell the user Accessibility is done and
    //    what's about to happen next.
    //
    //    The Accessibility TCC dialog stole focus; re-activate so the
    //    next alert renders on top instead of behind our own window.
    // -----------------------------------------------------------------
    activateApp();
    showAlert(
        "Accessibility granted",
        "Next, Ogmios needs permission to control VoiceOver via " ++
            "AppleScript (Automation).\n\n" ++
            "When you click Continue, VoiceOver will briefly start, and " ++
            "macOS will show a second system dialog asking for Automation " ++
            "permission. Click OK on that dialog.",
        "Continue",
    );

    // -----------------------------------------------------------------
    // 6. Launch VoiceOver via NSAppleScript.
    // -----------------------------------------------------------------
    _ = runAppleScript("tell application \"VoiceOver\" to launch");

    // Give VO a moment to finish boot before we send it a real AppleEvent.
    sleepSeconds(3);

    // -----------------------------------------------------------------
    // 7. Send a real VO AppleEvent -> triggers Automation TCC prompt.
    //    Retry every 500ms for up to 60s: the first call fires the
    //    prompt and returns an error; subsequent calls succeed once the
    //    user clicks OK on the system dialog.
    //
    //    Unlike Accessibility there's no public `AXIsAutomationTrusted`
    //    probe, so we treat "AppleScript call succeeded" as the signal.
    //    That's pragmatic: if we can actually drive VO we're done.
    // -----------------------------------------------------------------
    const automation_granted = pollAutomation(60);

    // -----------------------------------------------------------------
    // 8. Show success or warning alert.
    //
    //    VoiceOver launch + the Automation TCC dialog both steal focus;
    //    re-activate before the final alert so it renders on top.
    // -----------------------------------------------------------------
    activateApp();
    if (automation_granted) {
        showAlert(
            "\xe2\x9c\x85 Ogmios is ready",
            "Both permissions have been granted. You can now close this " ++
                "window and run your ogmios tests.",
            "Close",
        );
    } else {
        showAlert(
            "\xe2\x9a\xa0 Automation not granted",
            "Ogmios could not detect Automation access within 60 seconds.\n\n" ++
                "Open System Settings \xe2\x86\x92 Privacy & Security \xe2\x86\x92 Automation, " ++
                "enable OgmiosSetup's control of VoiceOver, and re-run this app.",
            "Close",
        );
    }

    // -----------------------------------------------------------------
    // 9. Cleanup: tell VO to quit so we don't leave it running.
    // -----------------------------------------------------------------
    _ = runAppleScript("tell application \"VoiceOver\" to quit");

    // -----------------------------------------------------------------
    // 10. [NSApp terminate:nil]
    // -----------------------------------------------------------------
    const sel_terminate = ak.sel_registerName("terminate:") orelse return error.SelectorMissing;
    ak.objc_msgSend_void_id(ns_app, sel_terminate, null);
}

/// Poll `AXIsProcessTrusted()` every 500ms up to `timeout_seconds`.
/// Returns true as soon as macOS reports the grant, false on timeout.
///
/// The 500ms cadence matches Apple's own TCC daemon internal poll rate;
/// faster polling doesn't yield a quicker positive result.
fn pollAccessibility(timeout_seconds: u32) bool {
    const max_iterations: u32 = timeout_seconds * 2; // 500ms per iteration
    var i: u32 = 0;
    while (i < max_iterations) : (i += 1) {
        if (ak.AXIsProcessTrusted()) return true;
        sleepMilliseconds(500);
    }
    // One last probe after the final sleep.
    return ak.AXIsProcessTrusted();
}

/// Poll VoiceOver automation every 500ms up to `timeout_seconds`. We
/// detect "granted" by invoking a harmless VO AppleScript call; if it
/// returns a non-null result object, the Automation TCC grant is active.
///
/// The FIRST call will fire the system dialog (and typically return null
/// via the out-error path). Subsequent calls succeed once the user
/// clicks OK. Worst case at timeout we exit the loop with false.
fn pollAutomation(timeout_seconds: u32) bool {
    const max_iterations: u32 = timeout_seconds * 2; // 500ms per iteration
    var i: u32 = 0;
    while (i < max_iterations) : (i += 1) {
        if (runAppleScriptOk("tell application \"VoiceOver\" to get bounds of vo cursor")) {
            return true;
        }
        sleepMilliseconds(500);
    }
    return false;
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
    _ = runAppleScriptOk(source);
}

/// Run an AppleScript source and return true iff it succeeded (i.e.
/// returned a non-null result descriptor). Used by `pollAutomation` to
/// detect whether the Automation TCC grant is active yet — if the user
/// hasn't clicked OK on the system dialog, `executeAndReturnError:`
/// returns nil and we keep polling.
fn runAppleScriptOk(source: [*:0]const u8) bool {
    const ns_apple_script_cls = ak.objc_getClass("NSAppleScript") orelse return false;
    const sel_alloc = ak.sel_registerName("alloc") orelse return false;
    const sel_init_with_source = ak.sel_registerName("initWithSource:") orelse return false;
    const sel_execute = ak.sel_registerName("executeAndReturnError:") orelse return false;

    const allocated = ak.objc_msgSend_id(ns_apple_script_cls, sel_alloc) orelse return false;
    const src = nsString(source) orelse return false;
    const script = ak.objc_msgSend_id_id(allocated, sel_init_with_source, src) orelse return false;

    const result = ak.objc_msgSend_id_idp(script, sel_execute, null);
    return result != null;
}

/// Force the current process to the foreground via
/// `[NSApp activateIgnoringOtherApps:YES]`. Called before every `showAlert`
/// so that alerts remain visually on top even after a macOS permission
/// dialog (TCC) has stolen focus. Without this, the second and third
/// wizard alerts can end up hidden behind the app that regained focus
/// after the user clicked Allow/Don't-Allow on a system TCC dialog, which
/// the user perceives as "the Welcome modal never dismissed".
fn activateApp() void {
    const ns_app_cls = ak.objc_getClass("NSApplication") orelse return;
    const sel_shared = ak.sel_registerName("sharedApplication") orelse return;
    const sel_activate = ak.sel_registerName("activateIgnoringOtherApps:") orelse return;
    const app = ak.objc_msgSend_id(ns_app_cls, sel_shared) orelse return;
    _ = ak.objc_msgSend_bool_bool(app, sel_activate, true);
}

/// Show a modal NSAlert with one button. Blocks on the Obj-C runloop
/// until the user clicks, which is exactly the semantic we want at every
/// stage of the sequenced flow: we never advance past an alert until the
/// user has acknowledged it.
///
/// After `runModal` returns we explicitly `orderOut:` the alert's window
/// and `release` the alert object. Without this, the alert's NSWindow can
/// linger in the app's window list; if the next operation surfaces a
/// system dialog (e.g. the Accessibility TCC prompt) and the system
/// dialog's dismissal re-activates our app, the lingering alert window
/// can redraw on screen, which the user perceives as "the Welcome modal
/// never dismissed".
///
/// `title` is set via setMessageText:; `body` via setInformativeText:;
/// `button_label` is the single action button.
fn showAlert(title: [*:0]const u8, body: [*:0]const u8, button_label: [*:0]const u8) void {
    const ns_alert_cls = ak.objc_getClass("NSAlert") orelse return;
    const sel_alloc = ak.sel_registerName("alloc") orelse return;
    const sel_init = ak.sel_registerName("init") orelse return;
    const sel_set_message = ak.sel_registerName("setMessageText:") orelse return;
    const sel_set_informative = ak.sel_registerName("setInformativeText:") orelse return;
    const sel_add_button = ak.sel_registerName("addButtonWithTitle:") orelse return;
    const sel_run_modal = ak.sel_registerName("runModal") orelse return;

    const allocated = ak.objc_msgSend_id(ns_alert_cls, sel_alloc) orelse return;
    const alert = ak.objc_msgSend_id(allocated, sel_init) orelse return;

    const msg = nsString(title) orelse return;
    ak.objc_msgSend_void_id(alert, sel_set_message, msg);

    const info = nsString(body) orelse return;
    ak.objc_msgSend_void_id(alert, sel_set_informative, info);

    const button = nsString(button_label) orelse return;
    _ = ak.objc_msgSend_id_id(alert, sel_add_button, button);

    _ = ak.objc_msgSend_i64(alert, sel_run_modal);

    // Explicitly dismiss + release the alert so its window leaves the
    // app's window list. Recovering focus from the subsequent TCC dialog
    // would otherwise redraw the stale alert window.
    const sel_window = ak.sel_registerName("window") orelse return;
    const window = ak.objc_msgSend_id(alert, sel_window);
    if (window) |w| {
        const sel_order_out = ak.sel_registerName("orderOut:") orelse return;
        ak.objc_msgSend_void_id(w, sel_order_out, null);
    }
    const sel_release = ak.sel_registerName("release") orelse return;
    ak.objc_msgSend_void(alert, sel_release);
}
