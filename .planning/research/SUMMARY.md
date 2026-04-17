# Project Research Summary

**Project:** Shoki
**Domain:** Screen-reader automation library for CI and test frameworks (macOS/VoiceOver v1; Zig native core with TypeScript SDK)
**Researched:** 2026-04-17
**Confidence:** HIGH on process model, capture mechanism, VoiceOver lifecycle, and distribution pattern. MEDIUM on CI/VM specifics and macOS 26+ API tightening. LOW on the unverified "faster than N-API + Rust" performance claim in the original charter.

## Executive Summary

Shoki is a native-code-backed TypeScript library that lets any test framework (Vitest browser mode as the v1 canonical target, Playwright and XCUITest later) start a real VoiceOver instance, capture every announcement VO emits, and assert against a structured event log — locally and in CI, without the tester becoming a macOS sysadmin. The pattern is well-understood: Guidepup has validated the demand and the AppleScript-over-`osascript` capture mechanism, but its DX (brittle `start()`, TCC setup by hand, `string[]` output) and CI story (`--ignoreTccDb` escape hatches) leave the entire differentiation surface open. Shoki's bet is a Zig core (compiled to an in-process N-API addon via `napi-zig`) that owns the 50ms poll loop, emits timestamped structured events, and ships with a `shoki doctor` CLI plus a pre-baked tart VM image for zero-config CI.

The recommended build order is permissions-and-signing first, VO driver second, Vitest integration third, CI story fourth — because every later phase depends on a stable signed binary and a deterministic VO config. The single highest-leverage architectural decision is **structured event stream in Zig, drained in bulk from TS**, because it simultaneously unlocks `listen()` generators, semantic matchers, WebVTT replay, and interrupt detection — Guidepup can't retrofit any of these on its `string[]` output. The single highest-leverage DX decision is an idempotent, process-crash-safe VO lifecycle with deterministic plist config, because every other UX win is worthless if a crashed test suite leaves the developer's Mac muted and unresponsive.

The risks cluster on two axes. Platform risk: Apple has been tightening the VoiceOver AppleScript surface (CVE-2025-43530 in macOS 26.2 requires a private entitlement third parties cannot obtain); Shoki must design a parallel AX-notification capture path as a hedge, not a retrofit. Ecosystem risk: Zig is pre-1.0 and napi-zig is a new project (created 2026-04-05, tracked as HEAD). Shoki must pin Zig 0.16.0 stable, plan for quarterly upgrade spikes, and keep a mental "fall back to napi-rs + Rust shim" option should either churn destabilize the project. Everything else (TCC stickiness, VO singleton conflicts with Vitest parallelism, Tart image bloat, VM-EULA caps) is known, survivable, and has documented mitigation patterns.

## Key Findings

### Recommended Stack

See `.planning/research/STACK.md`.

**Terminology correction — load-bearing:** Yuku is a **JavaScript/TypeScript parser written in Zig**, not a TS↔Zig binding tool. The actual binding layer is **`napi-zig`** (github.com/yuku-toolchain/napi-zig). PROJECT.md corrected.

**Core technologies:**
- **Zig 0.16.0 stable** (released 2026-04-13) — native core.
- **napi-zig (HEAD)** — N-API bindings for Zig, `napi build --release` cross-compiles all platforms, emits npm package tree with `optionalDependencies` per platform.
- **TypeScript 6.x + Node 24 LTS** — public SDK surface.
- **AppleScript over `osascript`** — primary VO capture transport; same as Guidepup.
- **tart** — reference CI VM and hermetic-local option; pre-baked image with VO-AppleScript-enabled, Accessibility+Automation granted, SIP-off.
- **Vitest 3.x with Playwright browser provider** — v1 canonical success target; integration via `BrowserCommand`s over tinyRPC WebSocket.
- **Biome** + **mlugg/setup-zig@v2** + **Packer/Ansible** — standard tooling.

**Distribution:** `optionalDependencies` platform packages pattern (esbuild/swc/rolldown/napi-rs v3). No postinstall downloads. OIDC trusted publishing.

**Not v1 critical path:** notarization, private frameworks, audio-STT capture.

### Expected Features

See `.planning/research/FEATURES.md`. Shoki's position: between static AX-tree checkers (axe-core, Playwright aria-snapshots) and Guidepup's observe+drive library. Observe-only by design.

**Must have (table stakes):**
- Idempotent lifecycle (`start`/`stop`/`detect`), structured capture (`listen`, `phraseLog`, `lastPhrase`, `clear`), Vitest browser-mode end-to-end, no sysadmin required locally, keyboard command catalog as constants, muted + max-rate defaults, typed JSON output.

**Should have (differentiators vs Guidepup):**
- **Structured event stream** (`{ phrase, ts, source, interrupt?, role?, name? }`) — unlocks matchers, WebVTT, interrupt detection in one move.
- **Zero-config CI** via pre-baked tart image + GitHub Action.
- **`shoki doctor`** CLI for local permission setup.
- **Vitest browser mode** as first-class target (Guidepup only ships Playwright).
- **Semantic matchers** package (`@shoki/matchers`).
- **Debug bundle** on failure (`events.json` + WebVTT + screenshot).

**Defer (v2+):** driving VO, NVDA, Orca, iOS VO, scoring/dashboards, codegen UIs, SaaS.

**Anti-features:** test framework, SR simulation, static a11y scanning, scoring.

### Architecture Approach

See `.planning/research/ARCHITECTURE.md`. **Three-layer, in-process N-API native addon.**

1. **`@shoki/sdk`** (TS) — public API, facade over binding.
2. **`shoki-core`** (Zig → `.node`) — lifecycle, osascript spawn, plist read-write, 50ms poll in a native thread, ring buffer (default 10k, `droppedCount` exposed), wire-format encoder.
3. **`@shoki/binding-<triple>`** — platform binaries via `optionalDependencies`.
4. **`@shoki/vitest`** — `BrowserCommand` plugin bridging browser tests to Node-side SDK.
5. **`@shoki/setup` / `shoki` CLI** — doctor + setup tool.
6. **Reference tart image** — `ghcr.io/shoki/macos-vo-ready:<macos>`, opt-in.

**Vitest browser-mode critical detail:** test runs in the browser, but addon + VO live in Node-side Vitest orchestrator. Bridge via Vitest `BrowserCommand` + `@vitest/browser/context` `commands`. Return payloads must be structured-clone-safe.

**Capture lifecycle discipline (copy Guidepup):** snapshot 9 VO plist keys at start; write mute/max-rate/no-greeting; restore on all exit signals. VO start per-file, `reset()` per-test. Refcounted start/stop.

**Extensibility:** comptime-switch Zig driver per platform triple. Adding NVDA/Orca = one new `src/drivers/<name>/driver.zig` + one registry line + new platform binding package. N-API ABI stays constant.

### Critical Pitfalls

See `.planning/research/PITFALLS.md`. Top 5:

1. **CVE-2025-43530 (macOS 26.2) — Apple tightened VO AppleScript access.** Private entitlement third parties can't obtain. **Mitigation:** AX-notification capture path as parallel, not retrofit.
2. **TCC is signature-based.** Unsigned rebuilds re-prompt; orphan entries accumulate. **Mitigation:** Developer ID signing day one; signed wrapper app holding the trust anchor.
3. **VoiceOver is a singleton; Vitest parallelizes.** **Mitigation:** plugin forces `singleThread: true`; error on `test.concurrent`; refcount start/stop.
4. **`osascript`-per-call polling drops rapid announcements** (Guidepup issue #87, 5-6s gaps on Sonoma). **Mitigation:** poll loop in Zig, not JS; overflow observable; AX fallback.
5. **VO won't fully quit; ghost announces in other apps** (Guidepup issue #101). **Mitigation:** force-kill by default; `pgrep` verify on stop; reconcile-and-restart on start.

Plus: Sequoia VO plist moved path; Zig 0.16 `@cImport` regressions (pin toolchain, hand-write `extern`); tart 2-VM EULA cap, 25-54 GB images, Fair Source license; background apps leak announcements into capture.

## Implications for Roadmap

**Six phases.** Order forced by dependencies: signed binary before capture work, capture core before test integration, local working before CI packaging.

### Phase 1: Foundations — signed Zig skeleton, permission model, `shoki doctor`
Signed binary, napi-zig `ping()` round-trip, `shoki doctor` CLI across macOS 14/15/26, Dev ID signing in CI pipeline, signed-wrapper-app decision documented.

### Phase 2: VoiceOver capture core — Zig driver with dual capture path
`osascript` + `with transaction`, plist snapshot/restore, force-kill lifecycle, **AX-notification parallel capture path**, ring buffer with overflow observability, wire-format freeze. Exit criteria: standalone Node script starts VO, captures a phrase via both paths, stops cleanly.

### Phase 3: Vitest browser-mode integration — v1 canonical success target
`@shoki/vitest` plugin, `BrowserCommand` bridge, `singleThread` enforcement, per-test `reset()`, semantic matchers (`@shoki/matchers`). Exit criteria: example repo runs VO + Vitest browser test end-to-end on a fresh Mac.

### Phase 4: CI story — tart image, GitHub Action, self-hosted parity
Reference image on GHCR, `shoki/setup-action`, example workflows for self-hosted tart / Cirrus Runners / GetMac / GH-hosted `macos-latest`. Per-job background-app kill hooks.

### Phase 5: Hardening — debug bundles, Playwright adapter, WebVTT, flake taxonomy
`@shoki/playwright` fixture, `.shoki/<test>/events.json` + WebVTT + screenshot, flake classification tags, health-check-before-test, platform-risk page.

### Phase 6: Extensibility validation — second screen reader (NVDA or iOS VO)
Implement second driver to validate `ShokiDriver` abstraction. Choice deferred until Phase 5 ships and user pull is visible.

### Phase Ordering Rationale

Signing → driver → test integration → CI → hardening → extensibility. Every prior phase is a hard prerequisite.

### Research Flags

Needs research during planning:
- **Phase 1** — Signed-wrapper-app design spike (TCC trust anchor: Node vs `shoki-runner.app` vs terminal).
- **Phase 2** — AX-notification event coverage on macOS 14/15/26; wire-format freeze.
- **Phase 4** — Tart slim-image target; per-provider CI YAML.

Standard patterns (skip research):
- **Phase 3** — Vitest `BrowserCommand` (fully documented).
- **Phase 5** — Playwright fixture (Guidepup blueprint).
- **npm distribution** — napi-zig out-of-box flow.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | napi-zig README + build.zig.zon verified; Zig 0.16.0 confirmed. MEDIUM on per-provider tart YAML. LOW on perf claim (rephrased). |
| Features | HIGH | Guidepup API surface extracted from source. MEDIUM on differentiator weighting. |
| Architecture | HIGH | Yuku source + Vitest docs confirm topology. MEDIUM on tart+VO parity and driver registry (no SR precedent). |
| Pitfalls | HIGH | Apple docs + Guidepup issues + CVE-2025-43530 verified. MEDIUM on Vitest parallelism degradation (issue-tracker, not docs). |

**Overall: HIGH.** Shoki's work is integration + DX polish + structural improvements over Guidepup/Yuku prior art, not new primitives.

### Gaps to Address

- Signed-wrapper-app architecture (Phase 1 spike).
- AX-notification fallback coverage (Phase 2 spike).
- Performance claim phrasing maintained until benchmarked.
- Second-driver choice (NVDA vs iOS VO) deferred to Phase 6.
- Out-of-tree driver plugin ABI (post-v1 only if requested).
- Enterprise Tart license acceptance (kept native path alive as alternative).

## Sources

Primary (HIGH):
- napi-zig README + build.zig.zon — https://github.com/yuku-toolchain/napi-zig
- Yuku repo — https://github.com/yuku-toolchain/yuku
- Zig downloads — https://ziglang.org/download/ (0.16.0 stable 2026-04-13)
- Guidepup source — https://github.com/guidepup/guidepup
- Guidepup API docs — https://www.guidepup.dev/docs/
- Guidepup issues #87 (osascript perf), #101 (VO won't quit), #82 (hints suppression)
- Vitest browser mode — https://vitest.dev/guide/browser/
- CVE-2025-43530 — https://jhftss.github.io/CVE-2025-43530/
- tart — https://tart.run/ + https://github.com/cirruslabs/tart
- napi-rs v3 announce — https://napi.rs/blog/announce-v3
- mlugg/setup-zig — https://github.com/mlugg/setup-zig

Secondary (MEDIUM):
- cirruslabs/macos-image-templates
- Cirrus Runners + GetMac product pages
- Rainforest QA: macOS TCC deep dive
- AccessLint voiceover.js (second AppleScript reference)
- Vitest issues #7616, #6834
- nelipuu/zbind, mmycin/zigport (rejected alternatives)
- actions/runner-images issues #9529, #11257
- jacobsalmela/tccutil
- Sentry Engineering: npm binary distribution

---
*Research completed: 2026-04-17*
*Ready for roadmap: yes*
