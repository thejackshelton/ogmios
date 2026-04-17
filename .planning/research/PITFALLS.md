# Pitfalls Research

**Domain:** Screen-reader automation in CI (macOS/VoiceOver, Zig core, TS SDK, Vitest browser mode)
**Researched:** 2026-04-17
**Confidence:** HIGH on macOS/VoiceOver/TCC pitfalls (official docs + Guidepup issue tracker + CVEs); MEDIUM on Tart (docs verified); HIGH on Yuku misidentification (verified against github.com/yuku-toolchain/yuku README and yuku.fyi); MEDIUM on Vitest browser mode parallelism (verified against Vitest issues/docs).

## Executive Note — Correct a Project-Level Misconception Before Anything Else

The `.planning/PROJECT.md` asserts "Yuku toolchain (https://github.com/yuku-toolchain/yuku) for TS↔Zig bindings" as a prior decision with conviction. **This is factually wrong.** Yuku is a JavaScript/TypeScript *parser and compiler* written in Zig (241 stars, v0.4.0 as of 2026-04-07). It is analogous to SWC or esbuild — it parses JS/TS source code. It does not expose Zig functions to TypeScript in either direction; the only npm artifact is `yuku-parser`, a JS parser module. The actual projects in the "call Zig from TS" space are `nelipuu/zbind` (143 stars, supports Zig 0.11–0.14-dev) and `mmycin/zigport` (Bun-focused FFI generator). This misidentification must be resolved in Phase 0/1 before any architecture work commits to "yuku as the binding layer," because that path does not exist. The downstream implication is that every pitfall flagged under "Yuku" below is really a pitfall about *picking a TS↔Zig bridge from immature options*.

## Critical Pitfalls

### Pitfall 1: Yuku cannot do what the project charter says it does

**What goes wrong:**
Team adopts "Yuku for TS↔Zig bindings" per the PROJECT.md decision, writes a VoiceOver capture core in Zig, then discovers no binding layer exists — because Yuku is a JS/TS parser, not an FFI bridge. Either (a) weeks are wasted hand-rolling N-API in Zig, (b) the team falls back to `napi-rs` + Rust and the "Zig-only core" decision collapses, or (c) the team adopts an unmaintained third-party bridge and ships a project with a bus factor of 1.

**Why it happens:**
The Yuku README (`"High-performance JavaScript/TypeScript compiler and toolchain in pure Zig"`) is easy to misread as "JS/TS toolchain for Zig" when skimming. The project name also sits in an ambiguous category that sounds like it could be a bindings toolkit.

**How to avoid:**
In Phase 0 (pre-architecture), spend one day building a hello-world that calls a Zig function from Vitest. Pick the bridge explicitly from the real options:

| Option | Maturity | Signals | Risk |
|---|---|---|---|
| `nelipuu/zbind` | 143 stars, 41 commits, supports 0.11–0.14-dev | active but small | Bus factor 1; Zig version tracking may lag 0.15+ |
| `mmycin/zigport` | Bun-focused, postinstall FFI generator | newer, niche | Bun coupling may not fit Vitest-node use case |
| Hand-rolled N-API in Zig | Most control | Several prior-art repos (e.g., `staltz/zig-nodejs-example`) | Every N-API version bump is our problem |
| `napi-rs` + tiny Rust shim calling Zig static lib | Most mature | Rust ecosystem; widely used in Turbopack, swc | Reintroduces Rust; contradicts "Zig-only" premise |

Re-litigate the Zig decision in PROJECT.md's Key Decisions table once the bridge is chosen. "Zig + Rust shim" is still a defensible answer.

**Warning signs:**
- Reading Yuku docs and finding only a parser API (`import { parse } from 'yuku-parser'`) — no `yuku.bind`, no `zig-export`, nothing about FFI.
- Issue tracker and yuku.fyi roadmap talk about "traverser, transpiler, `.d.ts` generation, minifier" — classic JS toolchain features, not FFI features.

**Phase to address:**
Phase 0 / Pre-arch. Must be resolved before any Zig core work begins — otherwise every phase carries a hidden dependency on a nonexistent layer.

---

### Pitfall 2: `getLastPhrase`-style polling drops announcements under rapid updates

**What goes wrong:**
Guidepup's capture model is "poll VoiceOver's last-spoken-phrase slot via AppleScript over the VO cursor." When VoiceOver speaks faster than the poller runs, intermediate phrases are overwritten before they're read. A fast focus traversal (tab-tab-tab through a menu) emits 6 announcements; the test captures 2. Tests appear to pass because the *final* phrase is captured, but the user-perceived experience — the full audio trail — is missing.

**Why it happens:**
`osascript` spawn cost is measured in hundreds of ms on Sonoma/Sequoia (Guidepup issue #87 reports 5–6 second gaps between commands). VoiceOver's "last spoken phrase" is a single-slot overwrite, not a queue. There is no public API to subscribe to a stream of announcements — the only supported AppleScript surface is "what did VO say most recently?"

**How to avoid:**
- Don't rely exclusively on `getLastPhrase`. Investigate lower-level paths:
  - **NSSpeechSynthesizer / AVSpeechSynthesizer hook** — VO ultimately routes speech through the speech synth stack; a DYLD_INSERT or private-API hook can observe every utterance. Risk: private API, signing complexity, may break per major macOS release.
  - **Accessibility notification subscription** (`AXObserverCreate` + `kAXAnnouncementRequestedNotification`) — captures `UIAccessibilityAnnouncementNotification` equivalents, but only live-region-style explicit announcements, not cursor-driven reads.
  - **Audio capture** of the VO output device with offline ASR — last-resort, highest-fidelity, but introduces an ML dependency.
- Accept that v1 may be "focus-event-synchronous capture" (capture after each deterministic user action, not free-running) and document the limitation. This is the Guidepup equivalent and is what real users expect.
- Ship **dropped-phrase detection**: if a phrase changes between two polls without your code firing an action, flag a warning in the event log.

**Warning signs:**
- Test writes "assert 4 announcements, got 2" but you know VO said 4 things.
- Tests pass locally with slow hardware, fail on faster M-series CI (faster VO = more drops).
- Users on issue tracker file "VO announced X but shoki missed it" with focus-navigation examples.

**Phase to address:**
Phase 2 (capture core). Lock the capture strategy *before* building the TS API, because the API surface depends on whether capture is synchronous (poll-around-action) or streaming (subscribe-and-receive).

---

### Pitfall 3: macOS Sequoia moved the VO AppleScript-enable plist and broke every existing automation

**What goes wrong:**
Shoki works on macOS 14 (Sonoma), ships, users on 15 (Sequoia) report "VoiceOver won't start / AppleScript commands silently no-op." Because the enable mechanism changed between major OS versions, there is no single setup step that works across supported macOS versions — and this will happen again with macOS 27, 28, etc.

**Why it happens:**
In Sequoia, the VoiceOver config plist moved from `~/Library/Preferences/com.apple.VoiceOver4/default.plist` to `~/Library/Group Containers/group.com.apple.VoiceOver/Library/Preferences/com.apple.VoiceOver4/default.plist`. The `SCREnableAppleScript` key lives in the new location, which is in a sandboxed Group Container. Additionally, `/private/var/db/Accessibility/.VoiceOverAppleScriptEnabled` must contain the character `a` — this is SIP-protected and can't be set without elevated privileges or full-disk-access.

**How to avoid:**
- Abstract the "enable VO AppleScript" step into a version-detecting setup module. Detect Darwin major version, pick the correct path.
- Ship this as a CLI setup command (`shoki doctor --fix`) rather than a library call — users need to know *why* they're granting sudo.
- Track the Apple Security Releases and macOS release notes as a gate before publishing compatibility claims. Don't claim "macOS N+1 supported" until the setup path has been verified on the new OS.
- Consider Tart VM path specifically because the enable-plist and SIP files can be pre-baked into the VM image — no per-host remediation required.

**Warning signs:**
- User files an issue: "fresh install, `voiceOver.start()` hangs forever." Check their macOS version first.
- Your setup script succeeds (`plutil -replace SCREnableAppleScript ...` returns 0) but `voiceOver.start()` still fails — the plist wrote to the wrong path.

**Phase to address:**
Phase 1 (permissions + setup). This is the single biggest support burden Guidepup has taken on; shoki needs a tested answer before shipping.

---

### Pitfall 4: TCC permissions are sticky to code signature, not to app name — every binary change re-prompts

**What goes wrong:**
User grants Accessibility + Automation permissions to `node` (or to the shoki binary) on Monday. On Tuesday, Vitest updates Node's version, or shoki publishes a new Zig binary, and every test fails with a TCC permission denial. User has to re-grant, and the *old* entry stays orphaned in TCC.db because `tccutil reset` can't clean entries for bundles that still exist but now have a different signature.

**Why it happens:**
TCC identifies processes by **code signature** (and bundle ID + path as secondary keys). Any change to the binary — recompile, Node version bump, Zig version bump, rebuild without the same developer certificate — changes the signature and the TCC entry is considered a different app. `tccutil reset Accessibility com.example.app` only works if the bundle still exists at the expected path; orphaned entries (from renamed/moved apps) cannot be removed without editing TCC.db directly (SIP-protected on system DB, user DB is at `~/Library/Application Support/com.apple.TCC/TCC.db`).

**How to avoid:**
- **Sign every Zig binary with the same Developer ID certificate** from day one. Unsigned or ad-hoc-signed binaries trigger TCC re-prompts on every change because there's no stable identity.
- **Grant permission to a stable host process** (the user's terminal, their IDE, or a dedicated `shoki-runner.app` bundle) rather than to `node` or to the shoki Zig binary directly. Architecture implication: the Zig core shouldn't be the TCC-trusted process — a stable wrapper app should be.
- **Ship `shoki doctor`** to detect permission state: check TCC.db (read-only is fine without SIP bypass for user DB), enumerate stale entries, guide user through re-grant when signatures change.
- Document the "every Node upgrade may require a re-grant" footgun prominently.

**Warning signs:**
- Users report "worked yesterday, broken today" after `nvm use` or a Vitest update.
- System Settings → Privacy & Security → Accessibility shows multiple entries for "node" or "shoki" — that's stale entries from prior signatures.
- Error is `AXError -25204` (not authorized) rather than "not running" — TCC is the cause.

**Phase to address:**
Phase 1 (permissions/setup). The code-signing strategy must be decided before Phase 3 (CI), because CI binaries also need stable signatures or they cache-miss TCC on every runner.

---

### Pitfall 5: Tart VMs don't escape TCC — they just move where the problem lives

**What goes wrong:**
Team adopts Tart-based macOS VMs to "solve the permissions problem" by baking granted permissions into a golden image. First build of the golden image works. Then the binary inside the VM changes (shoki version bump, Node bump) and every VM-started test hits TCC denials again. Team has to rebuild the golden image on every release of shoki or Node.

**Why it happens:**
TCC is per-OS, not per-environment. Running VoiceOver inside a Tart VM is still "running VoiceOver on macOS" and TCC still enforces signature-based identity checks. The VM approach is a *great* answer for "reset to a clean state each CI run" and for "the host machine doesn't need to be touched" — but it does not make TCC go away.

Additionally:
- **Image sizes are enormous.** Tahoe base is 25 GB; Xcode-included Sonoma images are 54 GB compressed. A CI job that pulls this image every run has a cold-start measured in minutes, not seconds. First-run download over public bandwidth can timeout.
- **Apple's EULA limits you to 2 VMs per host Mac.** This caps per-host parallelism regardless of available CPU/RAM.
- **Networking in/out of the VM defaults to NAT with no isolation.** If two VMs run on the same host, they can see each other unless Softnet is enabled (`--with-softnet`). Cross-test pollution (announcements from one VM leaking into another's capture window) is possible if the audio routing isn't also isolated.
- **Tart licensing:** Fair Source License. Free tier caps at 100 CPU cores and 4 Orchard workers per org. Large shops need a paid license — which may block enterprise adoption of shoki if we hard-require Tart.

**How to avoid:**
- Design around TCC stability inside the VM: bake a stable signed binary and document "VM rebuild required if you upgrade shoki's Zig core."
- Publish **VM image size budget**: ship a minimal image without Xcode (base macOS + VoiceOver prerequisites + Node) targeting <15 GB. Users who need Xcode can layer it themselves.
- For GitHub Actions: use Tart as *one* supported CI mode, not the only mode. Always keep a path that works on stock `macos-14`/`macos-26` hosted runners so users aren't forced into the Tart licensing conversation.
- Enable Softnet (`--with-softnet`) in docs/examples when parallel VMs are used.
- Document Apple's 2-VMs-per-host EULA limit prominently in the self-hosted runner guide.

**Warning signs:**
- CI bills spiking because every job pulls a 30 GB image.
- Tests intermittently capture phrases from a sibling test — audio leaking across VMs on the same host.
- Enterprise user opens an issue: "Our legal team won't sign Tart's Fair Source agreement, is there another option?"

**Phase to address:**
Phase 3 (CI) for the VM image strategy; Phase 1 must *not* hard-require Tart (keep a native-with-CLI-setup path alive).

---

### Pitfall 6: VoiceOver won't fully quit, and its ghost contaminates the next test run

**What goes wrong:**
Test suite finishes. The next day, the developer opens Zoom — and VoiceOver announces the Zoom notifications. They didn't restart VO. It was left running in the background by shoki's incomplete shutdown. On CI, this manifests as tests polluting each other: test B captures residual announcements from test A's teardown because VO never stopped speaking.

**Why it happens:**
This is Guidepup issue #101, open as of 2026. `voiceOver.stop()` in Guidepup doesn't reliably terminate the VoiceOver agent process. The symptom is OS-version-dependent (reported on Sequoia and Tahoe). Root cause appears to be Guidepup sending a soft-quit signal that VoiceOver acknowledges but doesn't actually act on. Manually opening and cleanly closing VO fixes the state — suggesting Guidepup's quit path leaves internal VO state in an inconsistent condition.

**How to avoid:**
- **Forceful shutdown by default.** After sending the soft-quit AppleScript, verify VO's `VoiceOver` and `VoiceOverCache` processes are actually dead. If not, `kill -9`. Use `pgrep -x VoiceOver` as a verification step.
- **Startup reconciliation.** On `voiceOver.start()`, first check if VO is already running. If yes, force-kill and restart rather than attaching — this avoids picking up a corrupted prior session.
- **CI-specific:** always run in a fresh VM or on a runner that's force-recycled between jobs. Never share a VoiceOver process across jobs.
- **Self-hosted runner danger:** if Accessibility permissions persist across jobs (which they will, because TCC is per-OS-install), a malicious or buggy test in job N can leave VO running and poisoning job N+1. Mitigation: kill all VoiceOver processes in the job's `pre`/`post` hooks.

**Warning signs:**
- Zoom/Slack/etc. suddenly start being announced after you run a shoki test.
- Flaky tests that only fail when run in a specific order.
- `ps aux | grep VoiceOver` shows multiple VoiceOver processes or an orphaned one after tests complete.

**Phase to address:**
Phase 2 (capture core / lifecycle) for the force-kill logic; Phase 3 (CI) for per-job isolation.

---

### Pitfall 7: VoiceOver silences itself in predictable (and surprising) situations

**What goes wrong:**
Test asserts "VoiceOver announced 'Submit button'" — announcement never comes, test fails. Not a bug in shoki; VoiceOver decided not to speak because:

- **Inactive window.** VO tracks keyboard focus, not mouse focus. If the window under test isn't frontmost/keyboard-active, VO may suppress announcements for elements in it.
- **Text input in progress.** When a text cursor is blinking in an input field, VO suppresses most announcements — this is user-facing behavior to prevent chatter during typing.
- **Hints disabled / verbosity low.** "Speak instructions" (hints) is a separate verbosity setting from announcements. If the user's VO Utility has hints off, hint text that would normally be read is not read. Guidepup issue #82 is exactly this.
- **Punctuation level.** "Some", "All", "None" punctuation settings change what gets read. Tests written against "All" break against the default "Some".
- **Speech rate "max" isn't actually max.** VO's slider maxes at ~60 characters/sec; a concatenated 500-word announcement can take 10+ seconds at maximum rate. Tests that assume "max rate = instant capture" will race.

**Why it happens:**
VoiceOver's speech engine is a user-centric assistive tech, not a deterministic test harness. It optimizes for "don't overwhelm the user," not for "emit every token." Its configuration space (verbosity × hints × punctuation × rate × voice × screen curtain × language × ~20 more toggles) is enormous and partly user-profile-scoped.

**How to avoid:**
- **Force a known VO config at test start.** Shoki should write a deterministic VO profile (hints on, verbosity high, punctuation "all", known voice, max rate) before each test session, and restore the user's profile on exit. Do not trust user config.
- **Test Setup docs must call out these knobs explicitly.** Tell users their local VO settings will be overridden during tests.
- **Foreground the window under test.** Before any assertion window, activate the target app and verify it's frontmost.
- **Document the "max rate is not instant" reality.** Capture windows must wait for speech to complete, detected via the `speaking` AppleScript property polling, not via a fixed timeout.

**Warning signs:**
- Tests pass on dev's machine but fail in CI — dev has nonstandard VO settings.
- Tests pass for button-click actions but fail for text-input actions (the blinking cursor silenced VO).
- Long announcements intermittently get truncated — you're capturing before VO finishes speaking.

**Phase to address:**
Phase 2 (capture core, VO config baseline) and Phase 4 (docs — "what VO knobs we set and why").

---

### Pitfall 8: Background apps' announcements leak into the capture

**What goes wrong:**
Test captures VoiceOver saying "Submit button, 3 unread messages in Slack, Submit button." The "3 unread messages" is a live-region announcement from Slack triggered by an incoming DM at the wrong moment. In a shared dev environment or on a self-hosted runner that also runs other apps, this cross-contamination corrupts capture and produces flaky tests.

**Why it happens:**
VoiceOver is a global screen reader. It announces anything with `NSAccessibilityAnnouncementRequested` notifications system-wide — Slack toasts, calendar alerts, iMessage previews, Time Machine status. There is no "scope VO to app X" switch. The `getLastPhrase` slot is overwritten by *any* app, not just the one under test.

**How to avoid:**
- **Isolate the test session from all other apps.** Tart VM is the right answer here — no Slack in a fresh VM. On native hosts, document "quit other apps and enable Do Not Disturb."
- **Filter captured events by source.** If we can identify the source app of an announcement via the Accessibility API, filter to just the target. This may require AX-observer-based capture rather than `getLastPhrase`.
- **On self-hosted runners:** pre-job hook that kills Slack, Discord, Teams, Calendar agents, Mail, and system notification daemons that emit announcements.

**Warning signs:**
- Flaky tests where the noise is *real words* ("3 new messages", "calendar event starting") rather than empty strings.
- Flaky tests that correlate with time-of-day (notifications fire on schedule).

**Phase to address:**
Phase 3 (CI hygiene hooks); also Phase 1 if shipping a local-dev guide.

---

### Pitfall 9: Vitest browser mode's process boundary triples with VO's singleton constraint

**What goes wrong:**
Developer enables `test.concurrent` or relies on Vitest's default file-level parallelism. Two test files both `voiceOver.listen()` at the same time. Chaos: VO is a system singleton, so test B captures announcements from test A's page. Race logs, false failures, corrupted assertions.

**Why it happens:**
Three separate process/singleton boundaries are being crossed simultaneously:
1. **Vitest browser mode** runs tests in browser iframes, orchestrated by a Node parent. The Node parent can spawn parallel browser workers; Vitest's own issue #7616 documents that parallelism degrades over a run in browser mode.
2. **Shoki's Zig core** lives in the Node parent (or a child process), not in the browser — it can't reach the browser DOM, only the OS-level VO output.
3. **VoiceOver** is one per macOS user session. It cannot be sharded per-test.

So "Node → browser → OS → VO → capture → back to Node → into test assertion" crosses four process/runtime boundaries, and VO is the serialization point.

**How to avoid:**
- **Mandate serial execution when `voiceOver.listen()` is active.** Ship a Vitest helper/plugin that forces `poolOptions.threads.singleThread = true` or uses a file-level mutex for any file containing `voiceOver.*`.
- **Document `test.concurrent` as incompatible.** Include a lint rule or runtime warning.
- **Per-test VO state reset.** Even serial, tests need a clean VO state between them: flush last-phrase buffer, reset cursor position, stop any in-progress speech.
- **Use browser mode's `maxWorkers: 1`** for shoki-enabled suites. Treat this as a feature of shoki's config, not a regression.

**Warning signs:**
- Test logs show "phrase captured: [something from a different test file]."
- CI and local results disagree because local parallelism differs.
- Tests pass alone, fail in the suite.

**Phase to address:**
Phase 2 (API design must acknowledge singleton) and Phase 3 (Vitest integration must enforce serialization).

---

### Pitfall 10: Zig's pre-1.0 version churn breaks the entire toolchain on every release

**What goes wrong:**
Shoki is built on Zig 0.15. Zig 0.16 releases (happening now — noted in release notes we pulled). Breaking changes hit the build system, `@cImport` semantics, or framework-linking path resolution. Shoki fails to build from source for anyone not pinned to the exact old toolchain. Every Zig release cycle is a ~2-day maintenance burden minimum.

**Why it happens:**
Zig is explicitly pre-1.0 and ships breaking changes every minor release. Concretely recent examples:
- 0.16 broke `@cImport` framework resolution for macOS (`'vImage/vImage.h' not found` after upgrading).
- 0.15 changed packed-struct alignment rules and u8/i8 ABI determination.
- Cross-compilation to macOS has long-standing SDK-path issues: `-isysroot` isn't auto-injected; SDKROOT env var is required; `zbind` (the TS-Zig binding candidate) only claims support up to 0.14.
- macOS framework linking has regressed in specific minor releases (issue ziglang/zig#6996).

**How to avoid:**
- **Pin the Zig toolchain version** in `build.zig.zon` and in `.tool-versions` / Nix flake / devcontainer. Do not track `master` or `latest`.
- **Treat Zig upgrades as a scheduled quarter-project**, not routine maintenance. Budget a full cycle to upgrade, fix the build, verify the macOS framework path still works.
- **Avoid `@cImport` for Apple frameworks where practical** — hand-write the minimal `extern` declarations for the AX/NSSpeech APIs you use. This insulates you from Zig's translate-c regressions.
- **CI must build shoki against the pinned Zig on every commit.** A silent toolchain drift will destroy reproducibility.
- **Design the binding layer so a Rust shim is swappable.** If Zig 1.0 timing becomes a release blocker, `napi-rs` + Rust is the fallback and should not require rewriting the capture core.

**Warning signs:**
- Build fails on a contributor's machine because they have the current Zig and you have the pinned one.
- `zig build` emits deprecation warnings — means the next minor will break.
- Zig release notes have a "Breaking Changes" section longer than a page.

**Phase to address:**
Phase 0 (pin toolchain); Phase 1 (build-system decisions about `@cImport` vs hand-rolled externs); ongoing maintenance.

---

### Pitfall 11: CVE-2025-43530 and the VoiceOver AppleScript security posture

**What goes wrong:**
Shoki ships, a security researcher points out that shoki's very design — giving a Node.js process AppleScript control of VoiceOver — is exactly the attack surface Apple just closed in macOS 26.2 (CVE-2025-43530). The vulnerability allowed arbitrary AppleScript via VO to bypass TCC. Apple's fix requires the `com.apple.private.accessibility.scrod` entitlement, which is **not available to third-party developers**. If Apple closes the public AppleScript surface for VO, shoki (and Guidepup) lose the core mechanism.

**Why it happens:**
The VO AppleScript surface was historically "enable via a checkbox, then drive as you please." Apple's post-CVE tightening moved the trust check from a file-based flag to an entitlement-based one (audited at the client's audit token level). Third-party signing certs can't request the new entitlement.

**How to avoid:**
- **Do not architect the capture pipeline entirely around AppleScript-to-VO.** Maintain a parallel plan B: accessibility-notification-based capture (`AXObserverAddNotification`) which is a more stable public API. This is more limited (doesn't get free-running cursor reads) but can't be yanked.
- **Track macOS beta builds.** When 27.x betas drop, immediately test `voiceOver.start()` and `getLastPhrase`. If Apple further restricts the surface, we want weeks of warning, not days.
- **Advocate for Apple to provide a supported testing API.** This is a community move Guidepup should also back.
- **Have a public-facing "platform risk" page.** Users deserve to know shoki depends on an API surface Apple has been tightening.

**Warning signs:**
- macOS beta release notes mention "VoiceOver scripting" changes.
- `voiceOver.start()` begins prompting for an entitlement or certificate we can't satisfy.
- CVEs published against VO's AppleScript surface indicate Apple will close it.

**Phase to address:**
Phase 2 (capture core): budget for a second capture path as a risk hedge. Phase 4 (docs): publish a platform-risk page.

---

### Pitfall 12: npm binary distribution runs into enterprise/corporate install walls

**What goes wrong:**
Shoki ships as an npm package with a postinstall that downloads platform-specific Zig binaries from GitHub Releases. Works on every dev's MacBook. Then an enterprise user installs in a CI where `npm install --ignore-scripts` is the default (common corporate security posture). Binary never downloads; shoki fails at runtime with a cryptic "dylib not found." Or: the corporate firewall blocks GitHub Releases. Or: `npm install` happens, postinstall runs, but a proxy man-in-the-middles the download and installs a binary with a broken signature that triggers TCC re-prompts.

**Why it happens:**
npm postinstall scripts are increasingly treated as malware vectors. `--ignore-scripts=true` is becoming default in Yarn Berry, pnpm with strict security, and every enterprise CI. GitHub Releases is an external download target that many corporate proxies block or MITM. Prebuilt binaries shipped inside the npm package solve the postinstall problem but multiply the package size per supported platform.

**How to avoid:**
- **Use npm's `optionalDependencies` platform-matrix trick** (as esbuild, swc, and Rollup do): publish `@shoki/darwin-arm64`, `@shoki/darwin-x64`, `@shoki/linux-x64` as separate packages, have the main package depend on all of them as `optionalDependencies` with `os`/`cpu` filters. npm skips the non-matching ones without any postinstall.
- **Ship binaries inside the platform packages, not as runtime downloads.** No network call at install time. Total install size is larger per platform but single-platform installs are fine.
- **Sign every binary with the same Developer ID** (already required for the TCC stability pitfall) — this also helps with corporate allowlisting.
- **Publish to GitHub Releases and npm simultaneously**, with the same signed binaries, so users who can't npm-install can curl-install.
- **Provide a Homebrew formula for the CLI portion** (`shoki doctor`, `shoki run`) that doesn't go through npm at all.

**Warning signs:**
- Enterprise user opens "install fails in our CI" issues.
- Binary size complaints from npm consumers (solved by optionalDependencies pattern).
- SHA mismatch reports — indicates MITM or cached bad download.

**Phase to address:**
Phase 4 (distribution). Get the platform-matrix publishing set up before first stable release.

---

### Pitfall 13: Flaky tests that are VoiceOver's fault, not shoki's

**What goes wrong:**
Tests flake 2% of the time on CI. Users blame shoki. Triage finds the flake is: VoiceOver's speech synthesizer "hiccuped" — a known AppleVis complaint where VO's speech inexplicably dies for a few seconds and then recovers. Or: VoiceOver crashed and auto-restarted mid-test (Apple docs confirm iOS VO "sometimes crashes and restarts"). Or: speech rate flipped between fast and slow mid-session (AppleVis reports this on Sonoma+). Shoki didn't do anything wrong; VO is genuinely flaky.

**Why it happens:**
VoiceOver is assistive technology optimized for a human user who can tolerate and adapt to a 1-second glitch. Tests can't. The speech engine has known bugs, and Apple's prioritization (understandably) is the daily-VO-user experience, not the automated-testing experience.

**How to avoid:**
- **Classify flakes in the capture event log.** If a capture session saw a VoiceOver process restart, a speech-rate change event, or a >N-second silence gap while announcements were expected, tag the test run as "suspected VO instability" rather than "test failure."
- **Retry policy for VO-instability tags.** Flaky-retry is usually an anti-pattern, but for runs tagged with a known VO instability indicator, one retry with fresh VO startup is defensible.
- **Health-check VO before each test.** Emit a known announcement, verify capture, abort with a clear error if VO is dead before the test even starts.
- **Document which flake patterns are VO's fault** so users can distinguish "my UI regressed" from "VO hiccupped."

**Warning signs:**
- Flake rate correlates with macOS minor versions (bad release of VO → flake goes up everywhere).
- Flakes cluster in time (a single bad VO session produces 10 failures in a row).
- Retry-and-pass rate is >50% — VO is restarting itself.

**Phase to address:**
Phase 3 (CI reliability features); Phase 4 (docs on flake classification).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `getLastPhrase` polling only (Guidepup's approach) | Fastest path to v0 working demo | Drops phrases under rapid updates (Pitfall 2); locks us into Guidepup's ceiling | v0 proof-of-concept only. Phase 2 must plan a second capture path. |
| Unsigned Zig binaries in dev | No Developer ID cert needed yet | TCC re-prompts every rebuild (Pitfall 4); can't ship | Pre-alpha only. Sign before any external user sees a binary. |
| Postinstall-download of binaries | Single npm package, simple publish | Breaks in enterprise/CI (Pitfall 12) | Never for v1+. Use optionalDependencies from the first public release. |
| Tart as the only CI story | Bakes all permission state into golden image | Locks out Tart-license-averse users; EULA-caps parallelism (Pitfall 5) | As *one* option. Always keep a non-Tart path. |
| Yuku listed as the TS-Zig bridge | Satisfies the PROJECT.md charter | Feature doesn't exist — full rework later (Pitfall 1) | Never. Fix the charter in Phase 0. |
| No force-kill on `voiceOver.stop()` | Clean AppleScript-only teardown | VO ghost in next session (Pitfall 6) | Never for CI. Acceptable in local dev during early prototyping. |
| Relying on user's VO Utility config | "Works on my machine" | Flakes on any machine with different settings (Pitfall 7) | Never. Always force a known profile at session start. |
| Tracking Zig `master` | Latest features | Build breaks on every minor release (Pitfall 10) | Never past Phase 1. Pin from Phase 2 onward. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| VoiceOver AppleScript | Treat `getLastPhrase` as a stream — poll at 100ms and concatenate | Capture around known action points; detect overwrites; plan a parallel AX-notification path |
| macOS TCC | Grant permission to `node` | Grant to a stable signed wrapper app; never to a version-churning runtime |
| Tart VMs | Pull latest-tag images at job start | Pin image digests; pre-pull on runner provisioning, not per-job |
| `osascript` | Assume sub-100ms execution | Budget 500ms–5s per call (Guidepup issue #87); batch scripts when possible |
| Zig `@cImport` on frameworks | Rely on it resolving Apple framework headers | Hand-write `extern` declarations for the small AX/NSSpeech surface we actually use |
| Vitest browser mode | Let default parallelism run | Force singleThread when `voiceOver.*` is in scope |
| npm binary distribution | Postinstall downloads from GitHub Releases | optionalDependencies + platform packages, binaries in-tree |
| Self-hosted runner | Reuse runner state across jobs | Force-kill VoiceOver in pre/post hooks; reset `~/Library/Application Support/com.apple.TCC` if signatures changed |
| macOS Sequoia/Tahoe upgrades | Assume prior VO enable path still works | Version-detect; branch on Darwin major version; test in the beta SDK |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| `osascript` per-call overhead | 5–6 second pauses between VO commands on Sonoma | Batch commands into one AppleScript payload; explore OSAKit/objc direct bindings (per Guidepup issue #87) | Every run on Sonoma+; worsens with verbose test suites |
| Polling `getLastPhrase` at high frequency | CPU spike, dropped phrases anyway | Event-driven capture around action points | Tests with >10 announcements/sec |
| Tart image pulls on every CI job | CI minutes dominated by network | Pre-pull on runner provisioning; use image digests; host internal mirror | First-run of any new image; every run on ephemeral runners |
| macOS speech rate at "max" | Long announcements still take seconds | Wait for `is speaking` to be false before asserting | Any announcement >20 characters |
| Parallel Vitest browser workers + VO | Cross-test announcement pollution | Force single-threaded when VO in scope | Any concurrent `test.concurrent` usage |
| GitHub-hosted macOS runner pricing | $0.062–0.16/min adds up fast for a test suite | Prefer self-hosted + Tart; keep GH-hosted as smoke only | OSS projects with >1000 PRs/month |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Running shoki's Zig core with Accessibility perms granted broadly | Any code in the Node process can read all app state (Pitfall 4, CVE-2025-43530 adjacent) | Sandbox the TCC-trusted surface to a small signed helper; don't grant perms to `node` itself |
| Shipping unsigned binaries | Users grant TCC to an unknown binary; trust breach; also doesn't work stably (Pitfall 4) | Developer ID sign + notarize every release binary |
| Self-hosted runner with persistent accessibility grants | Compromised test gains full keyboard/AX access across the runner's life | Reset TCC grants between jobs; use ephemeral VMs; require `shoki doctor` to verify expected grants |
| postinstall binary download over HTTP | MITM attack replaces binary with backdoored one | Pin binary checksum; use HTTPS-only download; prefer in-package binaries over downloads |
| Distributing an AppleScript-control tool without platform-risk disclosure | Users build workflows on an API surface Apple is tightening (CVE-2025-43530) | Public platform-risk page; track Apple security releases; maintain parallel capture strategy |
| Tart VM images with baked credentials | Anyone who pulls the image has the creds | Bake only empty/test accounts; never ship customer secrets in images |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Requiring manual VO Utility toggles to install | User bounces during setup (Guidepup's current experience) | `shoki doctor --fix` does everything possible automatically; clearly explains anything that still requires the user |
| Obscure errors when TCC denies | "AXError -25204" with no guidance | Wrap AX errors; translate to "macOS did not grant Accessibility permission — run `shoki doctor` to fix" |
| Silent failure when VO is actually dead | Test hangs, eventual timeout, no signal | Health-check VO at session start; fail fast with an actionable message |
| Verbose announcements spam captured log | User can't find the assertion-relevant announcement | Structured events with source metadata; filters in the assertion API |
| First-run download of Tart image blocks everything for minutes | User thinks shoki is broken | Progress indicator with size/ETA; opt-in for the VM path (not default) |
| Breaking changes between shoki minors | User upgrades, test suite breaks | Strict semver; deprecation warnings at least one minor before removal; publish migration guides |

## "Looks Done But Isn't" Checklist

- [ ] **`voiceOver.start()`:** Often missing health-check that VO is actually speaking before returning — verify with a known throwaway announcement.
- [ ] **`voiceOver.stop()`:** Often missing force-kill fallback — verify `pgrep -x VoiceOver` returns empty.
- [ ] **Capture:** Often missing drop detection — verify the event log includes "overwrite detected" warnings when `lastPhrase` changes faster than polled.
- [ ] **Setup script:** Often missing macOS-version branching — verify it works on both 14 (old path) and 15+ (new Group Container path).
- [ ] **Binary distribution:** Often missing signature — verify `codesign -dvvv` shows Developer ID.
- [ ] **TCC permissions:** Often missing recovery path — verify `shoki doctor` detects stale entries from prior signatures.
- [ ] **CI example:** Often missing the actual `VoiceOverAppleScriptEnabled` SIP file touch — verify on a clean macOS image, not a dev box with it already set.
- [ ] **Vitest config:** Often missing single-threaded enforcement — verify `test.concurrent` refuses to run with a clear error.
- [ ] **Tart example:** Often missing network isolation flag — verify `--with-softnet` in docs and examples.
- [ ] **Platform risk disclosure:** Often missing — verify the README has a "macOS API risk" section citing CVE-2025-43530 and Apple's tightening trajectory.
- [ ] **Yuku decision:** Often *documented* but not *verified* — confirm the charter's "TS↔Zig bindings via Yuku" claim is actually supported by Yuku before starting any Zig work.
- [ ] **Self-hosted runner docs:** Often missing pre/post hooks to kill VO and other announcement-emitting apps — verify a two-job sequential run doesn't cross-contaminate.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Yuku mis-bet (Pitfall 1) | MEDIUM if caught in Phase 0; HIGH if caught in Phase 2+ | Stop. Pick real bridge (`zbind`, hand-rolled N-API, or Rust shim). Update PROJECT.md Key Decisions. |
| `getLastPhrase` dropping (Pitfall 2) | HIGH if shipped | Add overwrite-detection warnings; implement AX-notification supplementary capture; document as known-limitation if already shipped |
| Sequoia plist path change (Pitfall 3) | LOW if version-detection already exists; HIGH if not | Point-release with `--darwin-major`-branched setup script; emergency doctor-tool update |
| TCC churn from unstable binaries (Pitfall 4) | MEDIUM | Sign all future binaries; publish `shoki reset-perms` to cleanup; tell users to re-grant once |
| Tart image bloat (Pitfall 5) | LOW | Publish a slim base image; update examples; keep old image as `@full` tag for users who need Xcode |
| VO ghost process (Pitfall 6) | LOW | Ship force-kill fix in a patch release; document manual `killall VoiceOver` as workaround |
| VO silence during typing (Pitfall 7) | LOW | Document; add to setup wizard; force VO config at session start |
| Background app contamination (Pitfall 8) | MEDIUM | Ship pre/post hooks; document DND and "quit Slack" as prerequisites |
| Vitest concurrency breakage (Pitfall 9) | LOW | Runtime check that refuses to run concurrent; auto-configure singleThread via plugin |
| Zig minor-version break (Pitfall 10) | MEDIUM–HIGH | Pin toolchain; budget a quarter-project per Zig major minor upgrade |
| Apple API closure / CVE-adjacent (Pitfall 11) | HIGH | Activate plan-B AX-notification capture path; engage Apple developer relations; may require limiting macOS version support |
| Enterprise install failures (Pitfall 12) | MEDIUM | Move to optionalDependencies platform packages; kill postinstall-downloads |
| VO-caused flakes (Pitfall 13) | LOW | Add VO-instability tagging and conditional retry; document flake taxonomy |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Yuku misidentification (1) | Phase 0 (pre-arch research) | A working hello-world that calls Zig from a Vitest browser-mode test via the *chosen* bridge |
| `getLastPhrase` drops (2) | Phase 2 (capture core) | Test suite with >10 rapid-fire announcements captures all of them; drop detector active |
| Sequoia plist path (3) | Phase 1 (setup/permissions) | Automated setup verified on macOS 14, 15, and 26 in CI |
| TCC signature sticky (4) | Phase 1 (signing + permissions) | `codesign -dvvv` shows Developer ID on every binary; `shoki doctor` detects stale grants |
| Tart doesn't escape TCC (5) | Phase 3 (CI) | CI guide shows both Tart and native paths; image size budget met (<15 GB slim) |
| VO ghost on shutdown (6) | Phase 2 (lifecycle) | `pgrep -x VoiceOver` returns empty after `voiceOver.stop()`; integration test with Zoom open |
| VO silence conditions (7) | Phase 2 (VO config baseline) | Deterministic profile written and restored; tests with text-input scenarios pass |
| Background app leak (8) | Phase 3 (CI hygiene) | Running with Slack open does not corrupt capture |
| Vitest singleton conflict (9) | Phase 2 (API) + Phase 3 (Vitest integration) | `test.concurrent` with `voiceOver.*` fails fast with clear error |
| Zig version churn (10) | Phase 0 (toolchain pin) + ongoing | `zig version` reported in CI matches `build.zig.zon`; upgrade playbook exists |
| Apple API tightening / CVE (11) | Phase 2 (dual capture paths) + Phase 4 (docs) | AX-notification capture path exists and is tested; platform-risk page published |
| npm enterprise install (12) | Phase 4 (distribution) | Install with `--ignore-scripts` succeeds; install behind corporate proxy succeeds |
| VO-caused flakes (13) | Phase 3 (CI reliability) + Phase 4 (docs) | Flake taxonomy doc; retry policy tagged to VO-instability indicators |

## Sources

### Primary (HIGH confidence)
- [GitHub: yuku-toolchain/yuku README](https://github.com/yuku-toolchain/yuku) — confirms Yuku is a JS/TS parser/compiler, not a TS-Zig binding tool
- [yuku.fyi](https://www.yuku.fyi/) — confirms parser/AST/traverser focus; TypeScript parsing "actively in development"
- [Guidepup issue #101 — "VoiceOver does not seem to fully quit"](https://github.com/guidepup/guidepup/issues/101)
- [Guidepup issue #87 — "Poor osascript performance on Sonoma"](https://github.com/guidepup/guidepup/issues/87)
- [Guidepup issue #82 — "Verbosity → Hints → Speak instructions enabled by default"](https://github.com/guidepup/guidepup/issues/82)
- [actions/runner-images #11257 — macOS Sequoia VoiceOver AppleScript plist path change](https://github.com/actions/runner-images/issues/11257)
- [actions/virtual-environments #4770 — VoiceOver AppleScript enable mechanism](https://github.com/actions/virtual-environments/issues/4770)
- [CVE-2025-43530: Exploiting a private API for VoiceOver](https://jhftss.github.io/CVE-2025-43530/)
- [Apple macOS Sequoia SLA — two-VM and no-service-bureau clauses](https://www.apple.com/legal/sla/docs/macOSSequoia.pdf)
- [Tart FAQ — networking, NAT, softnet isolation](https://tart.run/faq/)
- [Tart Licensing — Fair Source, 100-core free tier cap](https://tart.run/licensing/)
- [Zig 0.16 release notes](https://ziglang.org/download/0.16.0/release-notes.html)
- [Zig 0.15.1 release notes — packed-struct alignment and u8/i8 ABI breaking changes](https://ziglang.org/download/0.15.1/release-notes.html)
- [Ziggit: Zig 0.16 macOS translate-c issue — `vImage/vImage.h` not found](https://ziggit.dev/t/zig-0-16-macos-translate-c-issue/14945)
- [GitHub Actions runner pricing — M1/M2 Pro per-minute rates](https://docs.github.com/en/billing/reference/actions-runner-pricing)
- [Vitest issue #7616 — Browser tests parallelism degrades over time](https://github.com/vitest-dev/vitest/issues/7616)
- [Vitest issue #6834 — Browser tests don't run in parallel with browser.enabled=true](https://github.com/vitest-dev/vitest/issues/6834)
- [Vitest Parallelism guide](https://vitest.dev/guide/parallelism)

### Secondary (MEDIUM confidence — verified by at least two sources)
- [jacobsalmela/tccutil — tccutil reset behavior and limitations](https://github.com/jacobsalmela/tccutil)
- [HackTricks: macOS TCC — SIP sealing, signature-based identity](https://book.hacktricks.wiki/en/macos-hardening/macos-security-and-privilege-escalation/macos-security-protections/macos-tcc/index.html)
- [jano.dev: Accessibility Permission in macOS (2025)](https://jano.dev/apple/macos/swift/2025/01/08/Accessibility-Permission.html)
- [GitHub: nelipuu/zbind — TS-Zig binding generator (real alternative to hypothetical Yuku binding)](https://github.com/nelipuu/zbind)
- [GitHub: mmycin/zigport — Bun-focused Zig FFI generator](https://github.com/mmycin/zigport)
- [Sentry Engineering: How to publish binaries on npm](https://sentry.engineering/blog/publishing-binaries-on-npm)
- [dev.to: Rust Binary Distribution via npm — enterprise install failures](https://dev.to/pavkode/rust-binary-distribution-via-npm-addressing-security-risks-and-installation-failures-with-native-4809)
- [AppleVis: VoiceOver speech alternating between fast and slow on Sonoma](https://www.applevis.com/forum/macos-mac-apps/voiceover-alternating-between-very-fast-slow-speech-macos-sonoma)
- [AppleVis: VoiceOver speech inexplicably dying](https://applevis.com/forum/macos-mac-apps/voiceover-speech-mac-keeps-inexplicably-dying-any-suggestions)

### Tertiary (LOW confidence — included for completeness, flagged for validation)
- [Apple Developer Forums: TCC permissions persist / bundle ID changes](https://developer.apple.com/forums/thread/703188)
- [threedots.ovh: macOS EULA licensing restrictions affecting virtualization](https://threedots.ovh/blog/2020/12/macos-eula-licensing-restrictions-affecting-virtualisation/)

---
*Pitfalls research for: Screen-reader automation in CI (Shoki — macOS/VoiceOver v1)*
*Researched: 2026-04-17*
