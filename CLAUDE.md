<!-- GSD:project-start source:PROJECT.md -->
## Project

**Shoki** _(npm package: `dicta`, CLI: `dicta`; helper app retains "Shoki" branding for v0.1)_

Shoki lets you run **real** screen readers — VoiceOver, NVDA, and more to come — inside any CI environment and any test framework. It's not a test runner and not a static checker: you start a screen reader from your existing tests, capture everything it would have announced, and assert on that. Think of it as a more ambitious Guidepup with first-class CI support and dramatically better DX.

**Core Value:** **A test author can start a real screen reader from their existing test framework, capture what it announces, and assert on it — locally and in CI — without becoming a sysadmin.**

If everything else fails, this must work: `voiceOver.listen()` in a Vitest browser-mode test produces a structured log of VO announcements that the test can assert against.

### Constraints

- **Tech stack**: Zig 0.16+ core, `napi-zig` (yuku-toolchain) for N-API bindings, TypeScript SDK as the primary surface — Chosen for OS-level access on Mac/Linux with a single language and clean TS interop.
- **Platform (v1)**: macOS + VoiceOver — Tackling the hardest permission/VM problem first unblocks the broader architecture.
- **API contract**: Observe-only (no app driving) — Keeps scope sharp and composes cleanly with existing frameworks.
- **CI portability**: Must run on self-hosted runners, GH Actions (Linux), and GetMac macOS in Actions — Adoption requires zero lock-in to GH-hosted macOS runners.
- **Screen reader fidelity**: We use real VO/NVDA, never a simulation — The whole premise collapses otherwise.
- **Ambition**: Serious OSS project — Months of work, quality-oriented, docs and adoption matter.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Executive Summary
## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Zig** | **0.16.0** (stable, 2026-04-13) | Core language — OS/FFI layer, AppleScript subprocess driver, future AX integrations | Only language that gives single-source cross-compilation to macOS (arm64+x86_64) and Linux without a C toolchain per host. napi-zig pins minimum 0.16.0-dev.2535, matching 0.16.0 stable. Zig's `build.zig` is also the fabric napi-zig plugs into. |
| **napi-zig** | **HEAD** (git, no semver releases yet; CLI `napi-zig` npm package is ^0.1.24 as of 2026-04) | N-API bindings for Zig + CLI that generates the npm package tree (optional-deps, platform binaries, TS `.d.ts`) | **This is what PROJECT.md actually wants.** Single decorator (`napi.module(@This())`) exports every `pub fn` as a JS function. Handles type conversion (numbers, strings, structs, enums, tuples, optional, union-via-`fromJs`/`toJs`), async, callbacks, buffers. Cross-compiles all platforms via `napi build --release`. Generates the OCI-style npm package with `optionalDependencies`. Ships with OIDC-based `napi npm-init` for tokenless trusted-publishing. **Young project (created 2026-04-05) — track HEAD, expect churn, contribute back.** |
| **TypeScript** | **6.0.x** (current; Yuku uses `typescript: ^6.0.2`) | Public SDK surface (`voiceOver.listen()`, etc.) | Canonical user-facing surface per PROJECT.md. No controversy. |
| **Node.js** | **≥ 24 LTS** (napi-zig README uses `node-version: 24`) | Host runtime for the TS SDK, consumed by Vitest | Matches napi-zig's documented target. N-API stability guarantees ABI across minor versions — no per-Node-version rebuilds. |
| **AppleScript via `osascript`** | macOS built-in (all supported versions) | Primary transport for VoiceOver → Shoki announcements in v1 | Documented, Apple-supported, SIP-compatible. Guidepup's actual mechanism; works today; no private frameworks needed. Fidelity is equal to Guidepup by construction (same API). Latency is the one weakness — see PITFALLS.md. |
| **macOS Accessibility API** (`AXUIElement`, future use) | macOS built-in | Element introspection if we extend beyond "what VO said last" | Public API, no entitlements needed beyond Accessibility permission. **Not on the v1 critical path.** Useful for "attach announcements to the element they came from" in v1.1+. |
| **tart** | **latest** (2.x; tracks Apple Virtualization.framework, requires macOS 13+ on Apple Silicon) | macOS VM runtime for CI and for local dev where the user doesn't want to touch their host's TCC | Apple-native, OCI-distributed, what Cirrus Runners is built on. We ship a pre-baked tart image on `ghcr.io/shoki/...` with VoiceOver-AppleScript-enabled, SIP-disabled, terminal granted Accessibility + Automation. fair.io / "fair-source" license — commercial use under Cirrus-friendly terms. |
### Supporting Libraries / Tooling
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Vitest** | **3.x** (whatever `latest` resolves to) | v1 canonical success target; integration tests in Shoki's own repo; example projects | Shoki's TypeScript SDK exposes a `startVoiceOver()` + listener API callable from any Vitest test (browser-mode or node). Use `globalSetup` if the user wants to start VO once per test run. |
| **Playwright** (as Vitest browser provider) | Vitest recommends Playwright over WebdriverIO for browser mode as of 2026. | Underlies Vitest browser mode | Shoki doesn't ship Playwright — we just document the minimum config and let the user's project have it. |
| **Packer + Ansible** | current | Build custom tart images (for the pre-authorized VoiceOver VM) | Cirruslabs' `macos-image-templates` uses Packer HCL + Ansible. Follow that pattern exactly for Shoki's reference image. |
| **mlugg/setup-zig** | `@v2` | GitHub Actions install Zig | Official-enough action. Signs and verifies tarballs via minisign, caches global Zig cache, supports `master` or pinned versions. This is the action napi-zig's README uses. |
| **@napi-zig** (CLI) | `^0.1.24` | Build + cross-compile + publish workflow (runs `napi build --release`, `napi bump`, `napi publish`) | Required for the distribution story. Installed as devDependency. |
| **zig fmt** + **prettier** + **biome** (for TS) | biome 2.x | Formatting + linting | Standard; no controversy. Biome over ESLint for TS side because biome itself ships the same optional-deps binary pattern and is the fastest option. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| **Zig build system** (`build.zig`, `build.zig.zon`) | Primary build system | napi-zig plugs in via `napi_zig.addLib(b, napi_dep, .{ ... })`. No separate Makefile, no CMake. |
| **shoki-doctor CLI** (to build) | Diagnose + auto-configure VoiceOver/Accessibility permissions on the user's Mac | Required for "setup that doesn't require a sysadmin" (PROJECT.md "Active" requirement). Mirrors what @guidepup/setup does. Ships as a subcommand of the shoki CLI. |
| **`tccutil` (third-party, DocSystem or jacobsalmela)** | TCC.db manipulation scripts for the reference tart image build | Only used during image bake, not at user runtime. Runtime users should use our `shoki-doctor` which avoids SIP-off modifications wherever possible. |
| **minisign** / Zig tarball signing | Verify Zig downloads in CI | mlugg/setup-zig handles this automatically. |
| **Codesign + notarytool** | macOS codesigning + notarization of the `.node` binary if we ship outside npm | See §Code signing. npm-only distribution **does not require notarization** (npm-installed binaries are trust-inherited from the user's shell/Node). If we later distribute a standalone CLI via Homebrew or a pkg, notarization becomes required. |
## Installation (Shoki dev setup, once this is a real repo)
# Prereqs on the dev Mac
# Inside the Shoki repo
# Build for current platform
# Cross-compile everything + generate npm tree
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **napi-zig** | **napi-rs (Rust + N-API)** | If we had to ship a Rust core. napi-rs is mature (v3 stable, used by swc, rolldown, cargo, @node-rs/*), has an enormous contributor base, better N-API coverage, better docs. **But** PROJECT.md explicitly chose Zig as the core language for macOS+Linux OS-integration reasons, so Rust isn't on the table. If the Zig core proves unworkable later, napi-rs is the fallback. The "napi-zig is faster than N-API + Rust" claim from PROJECT.md is **not substantiated by any benchmark I could locate**; Yuku's perf numbers are about its **parser**, not about N-API overhead. Treat the speed claim as unproven — the real reason to pick napi-zig is "we already chose Zig." |
| **napi-zig** | **neon (Rust)** | Never. Neon was migrated away from by swc precisely because of release/CI pain; napi-rs dominates. Not relevant to our Zig decision. |
| **napi-zig** | **node-addon-api (C++)** | If you hate yourself. No. |
| **napi-zig** | **Pure WASM (wasmtime / wasi-node)** | If we wanted zero native-binary distribution complexity. **Real tradeoff** for a pure-compute library. **Not applicable here** because Shoki must spawn subprocesses (`osascript`) and talk to platform APIs — WASM can't. |
| **AppleScript (osascript)** | **AXObserver + AXUIElementCopyAttributeValue (public AX API)** | Later, for "which element is being announced" enrichment. Public AX API can observe focus/value changes but **does not expose VoiceOver's spoken text**. VO's speech layer is private. So AX API complements but never replaces AppleScript for v1. |
| **AppleScript (osascript)** | **Private `AXSpeechSynthesizer` / VO internals** | Never for an OSS tool. Private frameworks break across macOS versions, violate Mac App Store rules, and are not notarization-safe. Would poison Shoki's reputation. |
| **AppleScript (osascript)** | **Audio capture + Whisper/Speech-to-text of VO output** | If (a) AppleScript path breaks in a future macOS, (b) user explicitly wants audio-layer fidelity. Expensive, probabilistic, adds a huge dep tree. Flag as a future experiment, not v1. |
| **tart** | **UTM / QEMU** | For Intel Mac hosts or Linux-only hosts that want to CI-test Shoki. UTM is fine for local dev on Intel; QEMU for Linux hosts running NVDA VMs in phase 2. Neither is competitive with tart on Apple Silicon. |
| **tart** | **Anka (Veertu)** | Enterprise teams with existing Anka infra. Closed-source, commercial. Tart is the OSS-friendly choice and is what modern CI services (Cirrus, GetMac-ish) use under the hood. |
| **tart** | **GitHub-hosted `macos-latest` with first-run `shoki-setup`** | When the user can't / won't self-host and doesn't want a third-party runner service. Slow (cold-boot config every run), expensive (GH-hosted macOS minutes are premium), and requires modifying TCC.db at runtime. Support it, but it's the slow path. |
| **Cirrus Runners** | **GetMac** | GetMac (https://getmac.io/github-runners) is a direct competitor — M4 Mac mini, drop-in GH Actions replacement, plan-based pricing. **Both are viable.** Cirrus is built on tart and is more CI-native. GetMac is cheaper per-minute at small plans. Shoki should document **both** and have CI examples for both. |
| **Vitest browser mode** | **Playwright Test directly** | When the user isn't doing component/unit tests and is doing pure E2E. Shoki's API is framework-agnostic — a Playwright Test can call `voiceOver.listen()` just as easily. v1 success target is Vitest because it's the broadest surface, but Playwright Test is a near-zero-effort second target. |
| **Vitest browser mode** | **Jest / XCUITest / any other runner** | Anywhere. Shoki's observe-only API composes with all of them. Jest works the same way Vitest does (globalSetup + test-file usage). XCUITest calls into the Node SDK via an IPC shim or by shelling to a helper CLI (`shoki listen`) and asserting on its JSON output — a secondary, post-v1 path. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **"Yuku" as the TS↔Zig binding layer** | Yuku is a JS/TS **parser**; it doesn't bind anything. Using the word "Yuku" as PROJECT.md does is a category error that will confuse contributors and reviewers. | **napi-zig**. Update PROJECT.md. |
| **Zig 0.13, 0.14, 0.15** | napi-zig's `build.zig.zon` requires `minimum_zig_version = "0.16.0-dev.2535+..."`. The `std.Build` API changed substantially between 0.13 and 0.16; napi-zig's `addLib` helper won't compile on older versions. | **Zig 0.16.0 stable**. Track Zig's release cadence and bump carefully when 0.17 lands. |
| **Zig master/tip for production** | Zig stdlib still churns; napi-zig is also young and pins to specific dev builds. Tip breaks regularly. | **0.16.0 stable** in CI; only track master in a separate experimental job. |
| **N-API via C + hand-rolled FFI from Zig** | We'd be reinventing the type-conversion/memory-model wheel that napi-zig already provides. The Zig ecosystem already has napi-zig and it's the answer the community has converged on. | napi-zig. |
| **Running VoiceOver in Docker / Linux** | Doesn't exist. VO is macOS-only. | Run VO on real macOS via tart VMs or on real macOS runners. |
| **Shipping a standalone notarized `.app` in v1** | Notarization is required for Gatekeeper-friendly standalone distribution, but we don't need standalone distribution — the `.node` binary ships inside an npm package and inherits trust from the user's Node install. Notarization is a whole separate Apple-developer-account workflow and is not on the v1 critical path. | Ship via npm `optionalDependencies`. Revisit notarization when/if we ship a Homebrew formula or a `.pkg`. |
| **Hand-rolled Node-API boilerplate in C** | Solved problem. | napi-zig. |
| **Browser-only testing harness (jsdom)** | VO doesn't run in jsdom. The whole point is real browser + real VO. | Vitest **browser mode** (with Playwright provider) + real VO via Shoki. |
| **Driving VoiceOver (rotor nav, speak-selection)** | Explicitly out of scope for v1. Guidepup does this and it's the #1 source of flake. Don't replicate. | Observe-only API. User's framework drives the app, VO reacts, Shoki captures. |
| **GitHub-hosted macOS runners as the primary CI story** | Slow, expensive, and every run starts from a clean VM with no Accessibility permissions → `shoki-setup` has to run each time. Works as a fallback but shouldn't be the default. | Document self-hosted tart as the primary CI pattern, with Cirrus/GetMac as managed alternatives, GH-hosted as "it works but slower." |
## Stack Patterns by Variant
### If the user is on Vitest browser mode (v1 canonical target):
- Use Shoki from a Vitest `globalSetup` file (start VO once, stop on teardown).
- In individual tests, `import { voiceOver } from "dicta"` and call `voiceOver.listen()`.
- Assertions against `voiceOver.phraseLog()` run on the Node side (the test file context, not the browser context).
- Because Shoki is observe-only, the user's Playwright provider drives the page and Shoki captures what VO says about it.
### If the user is on Playwright Test:
- Same API shape. `globalSetup` in Playwright config, or per-fixture setup.
- Shoki is orthogonal to Playwright's page control — Playwright clicks, VO announces, Shoki logs.
### If the user is on Jest:
- Identical pattern via `globalSetup` / `globalTeardown`.
### If the user is running locally on their own Mac:
- `npx dicta doctor` detects missing VO-AppleScript-enabled flag, missing Accessibility permissions for their terminal/IDE, etc.
- Where possible, `dicta doctor` fixes in-place without requiring SIP-off (e.g., opening the VoiceOver Utility pref pane programmatically). Where impossible, it clearly explains what SIP-off + TCC modification the user needs to perform manually — or it recommends the VM path.
### If the user is running in CI:
- **Preferred:** `docker://ghcr.io/shoki/macos-vo-vm:latest` (our pre-baked tart image, VO-enabled, SIP-off), orchestrated by a `shoki-action` GitHub Action wrapper around `cirruslabs/tart-action`.
- **Alternative A (Cirrus Runners):** single-line swap `runs-on: ghcr.io/cirruslabs/macos-sequoia-xcode:latest` (or our `shoki` variant), uses our image template.
- **Alternative B (GetMac):** `runs-on: [self-hosted, getmac]` + a `shoki-setup` step that applies VO-AppleScript-enabled + Accessibility grants at job start (slow-path — ~30s overhead).
- **Alternative C (GH-hosted `macos-latest`):** same as GetMac but with GH-hosted runners. Slowest + most expensive but zero third-party signup.
### If the user is on Apple Silicon vs Intel:
- All builds produce both `darwin-arm64` and `darwin-x64` `.node` binaries via napi-zig cross-compile.
- Runtime: Rosetta is not needed. Optional-deps npm resolution picks the right arch.
- tart VMs: Apple Silicon only. Intel Mac CI is out of scope for v1 (Intel Macs are EOL'd by Apple anyway).
## Code Signing / Notarization (v1 scope)
- The `.node` binary is loaded by Node.js at runtime via `dlopen`. Gatekeeper does not block it because Node itself is the entry point, and Node is already notarized.
- Users will still hit **Accessibility permission prompts** for their terminal or IDE — that's a user-facing TCC grant, not a developer-side code-signing requirement. Shoki's job is to detect missing grants, not to work around them.
- **If we later ship** a standalone CLI via Homebrew, a `.pkg` installer, or a native GUI `.app`, we need Developer ID codesigning + notarytool-based notarization. Budget ~1 day of Apple-developer-account setup + GitHub Actions secrets wiring when that time comes. Add this to phase 3+ pitfalls, not v1.
## Yuku / napi-zig Distribution Recipe (the bits that matter)
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Zig 0.16.0 | napi-zig HEAD (Apr 2026) | napi-zig's `build.zig.zon` says `minimum_zig_version = "0.16.0-dev.2535+b5bd49460"`. 0.16.0 stable (2026-04-13) satisfies this. |
| Zig 0.16.0 | Yuku (for reference only) | Yuku's `build.zig.zon` also pins 0.16.0-dev.2535. So napi-zig + Yuku move together. |
| Node 24 LTS | napi-zig latest | napi-zig README's publish.yml uses `node-version: 24`. N-API is ABI-stable, so 20/22 should also work, but test on 24 as baseline. |
| Vitest 3.x | Playwright provider, Node 24 | Recommended provider as of 2026. WebdriverIO works but is heavier setup. |
| tart 2.x | macOS 13+ host (Apple Silicon), guest macOS 13-15 (Sonoma, Sequoia, Tahoe all have public cirruslabs base images). | Guest must be ≥ macOS version where VoiceOver-AppleScript control works. macOS 14+ changed TCC prompt UX — handle both branches in `dicta doctor`. |
| macOS 14+ SIP | VO-AppleScript-enabled file modification | Requires SIP-off to write `.VoiceOverAppleScriptEnabled`. Bake in tart image; never ask users to disable SIP on their host. |
| npm package name | `dicta` + `@shoki/binding-*` | Unscoped, distinctive Latin name. Prior attempts (`shoki`, `@shoki/core`) were blocked by npm's anti-typosquatting policy vs. `shiki`. |
## Sources
- **napi-zig README** — https://raw.githubusercontent.com/yuku-toolchain/napi-zig/main/README.md (full API, CLI reference, type conversion tables) — **HIGH confidence**, direct from source
- **napi-zig build.zig.zon** — https://github.com/yuku-toolchain/napi-zig — Zig version minimum — **HIGH**
- **Yuku README** — https://raw.githubusercontent.com/yuku-toolchain/yuku/main/README.md — confirms Yuku is a parser, not a binding tool — **HIGH**
- **Yuku build.zig** — https://raw.githubusercontent.com/yuku-toolchain/yuku/main/build.zig — shows `addLib` invocation, `napi_zig` dep — **HIGH**
- **Zig downloads page** — https://ziglang.org/download/ — confirmed 0.16.0 stable released 2026-04-13 — **HIGH**
- **Guidepup VoiceOver source** — https://github.com/guidepup/guidepup/tree/main/src/macOS/VoiceOver — confirms AppleScript-over-osascript mechanism — **HIGH**
- **Guidepup manual setup docs** — https://www.guidepup.dev/docs/guides/manual-voiceover-setup — canonical list of VO-AppleScript-enabled flag + TCC.db modification steps — **HIGH**
- **tart quick start** — https://tart.run/quick-start/ — `tart clone`, `tart run`, OCI registry format — **HIGH**
- **cirruslabs/tart README** — https://github.com/cirruslabs/tart — Apple Virtualization.framework, Cirrus Runners integration, 25 GB image size, macOS 13+ required — **HIGH**
- **cirruslabs/macos-image-templates** — https://github.com/cirruslabs/macos-image-templates — Packer + Ansible pattern for custom images — **MEDIUM** (DEVELOPMENT.md is sparse; templates themselves are the docs)
- **Cirrus Runners** — https://cirrus-runners.app/ — M4 Pro, drop-in GH Actions macOS runners — **HIGH** (recent 2025-12 pricing post)
- **GetMac runners** — https://getmac.io/github-runners — M4 Mac mini, drop-in replacement — **MEDIUM** (marketing page is the source)
- **GitHub blog, macos-26 runners** — https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/ — confirms GH-hosted macOS runners track modern macOS — **HIGH**
- **mlugg/setup-zig** — https://github.com/mlugg/setup-zig — GH Action, minisign-verified, default action for Zig projects — **HIGH**
- **Vitest browser mode docs** — https://vitest.dev/guide/browser/ + https://vitest.dev/config/globalsetup — confirms `globalSetup` supports external processes, Playwright as recommended provider — **HIGH**
- **NAPI-RS v3 announce + Getting Started** — https://napi.rs/docs/introduction/getting-started + https://napi.rs/blog/announce-v3 — establishes the optional-dependencies-for-native-binaries pattern as industry-standard in 2026 — **HIGH**
- **esbuild platform-specific binaries (DeepWiki)** — https://deepwiki.com/evanw/esbuild/6.2-platform-specific-binaries — same pattern, reference case — **MEDIUM** (DeepWiki auto-generated)
- **AccessLint/screenreaders (voiceover.js)** — https://github.com/AccessLint/screenreaders — second-opinion reference that AppleScript is the community-standard VO transport — **MEDIUM**
- **Snowflake engineering blog on macOS CI with tart** — https://medium.com/snowflake/macos-ci-cd-with-tart-d3c0e511f3c9 — production case study — **MEDIUM**
- **Rainforest QA on TCC.db manipulation** — https://www.rainforestqa.com/blog/macos-tcc-db-deep-dive — the canonical write-up on pre-authorizing permissions in a VM — **MEDIUM**
### Confidence callouts
- **LOW** on the PROJECT.md claim "Yuku... reported to be substantially faster than N-API + Rust." I could not find a benchmark substantiating this. Yuku's published benchmarks are about its **parser** being faster than `swc`/`oxc` for its specific job. napi-zig's N-API overhead vs napi-rs N-API overhead is not benchmarked publicly. The practical overhead of a single N-API boundary crossing is similar between Rust and Zig; differences are dwarfed by the cost of `osascript` itself (tens of milliseconds per call). **Revise the PROJECT.md "faster than N-API + Rust" claim to "comparable to N-API + Rust, chosen for single-language OS-integration reasons" unless a concrete benchmark can be produced.**
- **MEDIUM** on "tart in GitHub Actions" because the exact YAML differs per provider (Cirrus vs GetMac vs self-hosted tart-action). Architecture is clear; YAML specifics are a phase-1 spike.
- **HIGH** on everything else.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
