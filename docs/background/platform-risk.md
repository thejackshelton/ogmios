# Platform risk

Shoki's v1 depends on macOS APIs that Apple controls and periodically restricts. This page is an open, honest discussion of those risks — what we depend on, where Apple has tightened access, how we hedge, and what we commit to.

## What shoki depends on

Two APIs carry the vast majority of shoki's functionality:

### 1. VoiceOver AppleScript surface

```applescript
tell application "VoiceOver" to get content of last phrase
```

This is how Shoki retrieves what VoiceOver just spoke. Called every 50ms from the Zig core over a long-lived `osascript` shell.

**Dependencies:**

- VoiceOver must be running (shoki boots it).
- The `SCREnableAppleScriptEnabled` key in `com.apple.VoiceOver4.local.plist` must be `true`. This is **off by default** since macOS 26.
- On macOS 26+ a new entitlement is required to access VO AppleScript (see below).
- The process running `osascript` needs Automation TCC grant for VoiceOver.

### 2. Accessibility notifications

```objc
AXObserverAddNotification(observer, element, kAXAnnouncementRequestedNotification, ...)
```

This is the parallel capture path added in Phase 3 as a macOS-26 hedge. The signed ShokiRunner helper subscribes to `AXAnnouncementRequested` and forwards events back to the Zig core over XPC.

**Dependencies:**

- The helper process needs Accessibility TCC grant.
- `AXAnnouncementRequested` must be emitted by the app under test — it's the standard mechanism for `aria-live` and `NSAccessibilityAnnouncement` announcements, so web content and well-behaved native apps work.
- Does **not** depend on VoiceOver running (huge win — captures announcements even when VO is off).

## CVE-2025-43530 — Apple tightens VO AppleScript access

On **macOS 26.2** Apple fixed [CVE-2025-43530](https://support.apple.com/en-us/HT214195) by adding an entitlement requirement to VoiceOver AppleScript access. The attack scenario: a malicious app could script VoiceOver to exfiltrate UI content bypassing TCC.

**What changed:**

- VoiceOver AppleScript access now requires an Apple-granted entitlement on macOS 26.2+.
- Third parties (like Shoki) **cannot request** this entitlement through the standard Developer ID program.
- Without the entitlement, `osascript` calls against VoiceOver return an error.

**Who is affected:**

- All third-party tooling that relies on VoiceOver AppleScript: Guidepup, Shoki, Voiceover.js, any hand-rolled automation.
- Apple's own tooling (VO itself, Accessibility Inspector) continues to work — they ship with the entitlement.

**Our current position on 26.2+:**

- Pre-baked tart images (`ghcr.io/shoki/macos-vo-ready:tahoe`) ship with SIP off and with the entitlement granted via image bake. This is the reliable path for CI.
- Local dev on unmodified macOS 26.2 cannot use the AppleScript path — the AX-notifications fallback is the only option.
- GH-hosted `macos-26` runners have SIP off and the entitlement workaround lands per-runner.

## Our hedge: AX-notifications parallel capture path

Before macOS 26 shipped we already knew the AppleScript surface was fragile (older pitfalls: polling latency, lifecycle coupling to VoiceOver itself, the `SCREnableAppleScriptEnabled` dance). Phase 3 of Shoki implements a **parallel** capture path using AX notifications — we run both paths simultaneously and merge their results into a single event stream tagged with `source: "applescript" | "ax"`.

Properties of the AX-notifications path:

- Does not require VoiceOver to be running.
- Does not require any AppleScript entitlement.
- Requires only a standard Accessibility TCC grant — the same one any assistive tech needs.
- Event fidelity: captures announcements requested via `aria-live`, `NSAccessibilityAnnouncement`, and `AXAnnouncementRequested` notifications. Misses VO-synthesized output that doesn't originate from an announcement request (e.g. VO spontaneously describing focus changes with its own phrasing).

When both paths are running, the structured event stream merges them; consumers can filter on `source` if they care.

**Consequence:** even if Apple closes the AppleScript path entirely in a future macOS, Shoki keeps working via AX notifications, with a documented fidelity trade-off.

## Apple's trajectory

Historically, Apple has **steadily tightened** third-party access to accessibility APIs while reserving the full surface for their own apps:

| Year | Change |
|------|--------|
| 2013 | TCC introduced. Accessibility requires user consent per-app. |
| 2017 | Automation becomes its own TCC bucket (pre-Mojave everything was "Accessibility"). |
| 2020 | Notarization required for direct-distributed apps. |
| 2022-23 | TCC database can no longer be written without SIP off (on modern hardware). |
| 2025 | CVE-2025-43530 — VO AppleScript requires Apple-granted entitlement on 26.2+. |

This is the **direction of travel**. We should not expect the AppleScript path to get wider over time.

## What happens if AppleScript closes entirely

Scenario: a future macOS refuses to run `osascript` against VoiceOver for any third-party process, regardless of entitlement or TCC grants.

**Shoki's fallback:**

- AX-notifications path continues working — Apple has been clear that AX notifications are the supported public API for assistive technologies.
- The wire format is source-tagged, so consumers don't need to change.
- Some event fidelity is lost (spontaneous VO utterances not attached to `AXAnnouncementRequested`) but the core use case — _"did my component announce the right thing when the user triggered X?"_ — still works.

If **AX notifications also close**, we're in a different world. The contingency:

1. Disclose immediately on this page.
2. Investigate private-but-stable paths (e.g. the `NSSpeechSynthesizer` observation surface).
3. Consider audio-capture + speech-to-text as a last-resort.
4. Potentially deprecate the macOS surface and pivot to NVDA on Windows as the canonical target.

We commit to **not** shipping workarounds built on genuinely private frameworks (`AXSpeechSynthesizer`, undocumented TCC-bypass paths, etc.). Those would poison shoki's reputation with the very users we're serving.

## Our commitment to users

- We will **always** disclose platform-level limits on this page before they affect a release.
- We will **always** publish workarounds (image bake steps, entitlement flows, fallback paths) before or alongside platform changes that affect shoki.
- We will **not** ship private-framework surfaces that could break Mac App Store policy or Gatekeeper expectations.
- When Apple's direction of travel forces a breaking change to the public API of shoki, we will version bump and document the migration, not silently ship behavior drift.

## Related reading

- [Architecture → Platform risk](/background/architecture#platform-risk) — short version, architectural context.
- [Troubleshooting → macOS 26 fails differently](/guides/troubleshooting#macos-26-tahoe-tests-fail-with-a-different-error-than-on-1415) — what the AppleScript-denied failure looks like in practice.
- Apple's security advisory: [HT214195](https://support.apple.com/en-us/HT214195).

## Status

- macOS 14 (Sonoma): AppleScript path fully operational.
- macOS 15 (Sequoia): AppleScript path fully operational. Plist path moved to `Group Containers`; shoki handles both.
- macOS 26 (Tahoe): AppleScript path requires entitlement from tart image bake; AX-notifications path always available as fallback.

We update this section per macOS release.
