---
status: fixing
trigger: "Round 2 — Two bugs still present in app-v0.1.5: (A) Welcome NSAlert window still lingers after Continue; (B) AXIsProcessTrusted polling never sees the grant user toggled in System Settings on macOS 26 Tahoe"
created: 2026-04-18T22:15:00Z
updated: 2026-04-18T23:30:00Z
---

## Current Focus

reasoning_checkpoint:
  hypothesis: |
    Bug A: `[window orderOut:nil]` on an NSAlert window is insufficient on macOS 26 Tahoe — orderOut only demotes the window's level, it does not close or detach it. The NSAlert's window is still retained by AppKit's window list and can redraw when focus returns (e.g., after the TCC prompt dismisses). `[window close]` properly removes the window and decrements its retain count.

    Bug B: On macOS 26 Tahoe + ad-hoc signed apps, `AXIsProcessTrusted()` caches its answer on first call (or at process start) and does not re-check TCC.db when the user toggles the grant mid-process. Documented macOS behavior — a long-running 120s poll loop sees "not trusted" forever, until the process is killed and relaunched. The fix is not to poll longer but to exit and require a relaunch.
  confirming_evidence:
    - "User screenshot shows Welcome modal still visible after Continue click; code DID proceed (AX polling started) so runModal returned — `orderOut:` is the only thing between runModal return and the next flow step."
    - "User toggled OgmiosSetup ON in Accessibility pane; screenshot confirms the toggle is on and the bundle icon is correct; 120s polling loop timed out and fired the 'Accessibility access is required' close-alert."
    - "Process bundle is correctly registered with TCC (screenshot shows it listed with icon) — the grant IS being stored under the correct cdhash/identifier; the running process just cannot observe it."
  falsification_test: |
    Bug A: If after applying `[window close]` + runloop drain the Welcome alert still lingers after Continue on the user's next test, the hypothesis is wrong and we would need to investigate [alert dismissModal:] / manually dispatching an NSEvent.
    Bug B: If on next test the single-check-and-relaunch alert fires even when the user has ALREADY toggled the grant before this launch (clean process start), the hypothesis about TCC caching-at-start is partially wrong — the grant store itself is not seeing it for this cdhash.
  fix_rationale: |
    Bug A: Replace `orderOut:` with `close` (plus drain the runloop for one spin) so the window actually leaves the screen before the next showAlert / AX flow runs.
    Bug B: Replace the 120s poll loop with a single check at wizard start. If not trusted, show an alert explaining grant + relaunch, open System Settings for the user, and exit(0). This addresses the root cause (cached trust state) rather than the symptom (timeout).
  blind_spots: |
    - We are inferring the `orderOut vs close` behavior on macOS 26 Tahoe from documented AppKit semantics; have not directly observed which one AppKit picks. The fix tries close (stronger primitive). If close also fails we have a deeper issue (alert runloop pump).
    - The "TCC state cached at process start" claim is common lore; we don't have a Radar to cite. Worst case the single-check still fails after relaunch — which would tell us the grant store itself has not received the flip yet, and is a different bug.
    - We are NOT adding a retry "Check Again" button per the plan's preference for the simpler relaunch-required pattern.

hypothesis_bug_a: "orderOut: does not actually remove NSAlert window on macOS 26. Use [window close] + runloop drain."
hypothesis_bug_b: "AXIsProcessTrusted caches at process start. Replace 120s poll with single-check + exit-and-relaunch UX."

next_action: "Apply fixes to setup_main.zig: (1) Add sel_close binding + replace orderOut with close in showAlert; add runloop drain helper. (2) Replace pollAccessibility call with single-check + relaunch alert + exit(0). Same pattern for Automation. Add stderr logging at each step."

## Symptoms

expected:
  - bug_a: Welcome modal closes fully after Continue click
  - bug_b: AXIsProcessTrusted returns true once user toggles the grant in System Settings

actual:
  - bug_a: Welcome modal still visible after Continue click; code proceeded past runModal so dismissal signal fired but window stayed
  - bug_b: 120s poll loop always returns false even when grant is toggled on

errors: (no stack trace — visual/UI + TCC lookup behavior)

reproduction:
  - bug_a: Launch app-v0.1.5 OgmiosSetup.app from downloaded zip -> welcome modal appears -> click Continue -> modal stays visible
  - bug_b: Launch app-v0.1.5 -> get through welcome -> Accessibility TCC dialog shows -> toggle OgmiosSetup on in System Settings -> polling never detects grant -> 120s timeout fires close alert

started: app-v0.1.5 test on 2026-04-18 (after prior orderOut: + activateApp fix was applied)

## Evidence

(carried over from round 1)

- timestamp: 2026-04-18T23:25:00Z
  checked: User screenshots of app-v0.1.5 interactive run
  found: Welcome alert visible simultaneously with Accessibility TCC prompt (bug A). Second screenshot: OgmiosSetup toggled ON in System Settings with correct icon, but app's 120s poll loop timed out and fired close alert (bug B).
  implication: Prior fix (orderOut + activateApp + release) resolved visual cleanup on some paths but not on Welcome -> TCC-prompt transition. AX trust store has the grant but the running process can't see it.

## Eliminated

(round 1 eliminations remain valid; all codesign/bundle registration checks passed)

## Resolution

root_cause:
  bug_a: "orderOut: is insufficient to remove an NSAlert's window on macOS 26. close is the correct primitive; pair with a brief runloop drain so AppKit can process the window removal before the next modal appears."
  bug_b: "AXIsProcessTrusted's result is cached at or near process start on macOS 26 Tahoe (plus ad-hoc signing). The 120s poll never sees the flip. Fix is to single-check + require relaunch, not to poll harder."

fix: (to be applied this pass)

verification: (pending rebuild + user retest)

files_changed:
  - helper/src/setup/setup_main.zig
  - helper/src/setup/appkit_bindings.zig
