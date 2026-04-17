---
phase: 01-foundations
plan: 04
subsystem: signed-wrapper-app
status: completed
tags: [swift, xpc, nsxpclistener, developer-id, notarization, tcc, app-bundle]
requirements_completed: [FOUND-03, FOUND-04]
dependencies:
  requires:
    - "helper/ placeholder directory from plan 01-01"
  provides:
    - "Swift package (helper/Package.swift) with 3 targets: ShokiRunnerProtocol, ShokiRunnerService, ShokiRunner"
    - "@objc XPC protocol exposing ping() at mach service org.shoki.runner"
    - "ShokiRunnerListenerDelegate reusable by external clients and in-process tests"
    - "build-app-bundle.sh to produce ShokiRunner.app/Contents/{Info.plist,MacOS/ShokiRunner}"
    - "sign-and-notarize.sh wrapping codesign --options runtime + notarytool submit --wait + stapler"
    - "hardened-runtime entitlements plist gated to only apple-events"
    - "Info.plist with CFBundleIdentifier=org.shoki.runner, LSUIElement=true, MachServices, NSAccessibility + NSAppleEvents usage strings"
  affects:
    - "plan 01-05 (signing workflow — consumes scripts/sign-and-notarize.sh and the entitlements file)"
    - "plan 01-06 (CI — runs swift test + scripts/build-app-bundle.sh in the release job)"
    - "phase 3 capture core — extends ShokiRunnerProtocol with startVoiceOver/stopVoiceOver/getLastPhrase"
tech-stack:
  added:
    - "Swift 5.9+ (built successfully on Swift 6.2 / macOS 26 dev host)"
    - "Swift Package Manager (release + debug builds)"
    - "XCTest (2 test cases, both green)"
    - "NSXPCListener / NSXPCConnection (Foundation)"
  patterns:
    - "Three-module split (Protocol / Service / Executable) so the protocol surface is importable by future N-API bridge without pulling in the executable"
    - "Frozen Phase 1 protocol surface (ping only); Phase 3 extends, never modifies (EXT-01-adjacent)"
    - "Mach service name exported as a public constant (ShokiRunnerMachServiceName) — never hardcoded at call sites"
    - "Scripts fail fast with set -euo pipefail + : \"${VAR:?msg}\" env-var checks so missing secrets surface immediately in CI logs"
key-files:
  created:
    - path: "helper/Package.swift"
      purpose: "SPM manifest declaring ShokiRunner executable + ShokiRunnerProtocol/Service libraries + ShokiRunnerTests test target"
    - path: "helper/.gitignore"
      purpose: "exclude .build/, built ShokiRunner.app/, notarize artifacts (.notarize-log.json, ShokiRunner.zip, .codesign.out)"
    - path: "helper/README.md"
      purpose: "build/test/sign/notarize instructions + bundle layout diagram"
    - path: "helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift"
      purpose: "@objc ShokiRunnerProtocol with ping() method + ShokiRunnerMachServiceName constant; frozen Phase 1 surface"
    - path: "helper/Sources/ShokiRunnerService/ShokiRunnerService.swift"
      purpose: "ShokiRunnerService.ping replies 'shoki-runner-pong'; ShokiRunnerListenerDelegate wires NSXPCConnection and is reusable in-process"
    - path: "helper/Sources/ShokiRunner/main.swift"
      purpose: "NSXPCListener(machServiceName: ShokiRunnerMachServiceName) + RunLoop.main.run() entry point"
    - path: "helper/Sources/ShokiRunner/Info.plist"
      purpose: "bundle metadata: CFBundleIdentifier=org.shoki.runner, LSUIElement=true, MachServices, NSAccessibility + NSAppleEvents usage strings"
    - path: "helper/Sources/ShokiRunner/ShokiRunner.entitlements"
      purpose: "hardened-runtime entitlements (no JIT, no unsigned memory, no library-validation bypass); only apple-events enabled"
    - path: "helper/Tests/ShokiRunnerTests/XPCPingTests.swift"
      purpose: "in-process XPC ping round-trip (anonymous listener) + direct service-call test"
    - path: "helper/scripts/build-app-bundle.sh"
      purpose: "copies SPM output into ShokiRunner.app/Contents/{Info.plist,MacOS/ShokiRunner}; --configuration release|debug"
    - path: "helper/scripts/sign-and-notarize.sh"
      purpose: "codesign --options runtime --entitlements --timestamp --deep, then xcrun notarytool submit --wait + stapler staple/validate"
  modified: []
decisions:
  - "Swift 5.9 floor in Package.swift even though local toolchain is 6.2 — keeps the package buildable on older macOS-13 hosts that ship the 5.9 toolchain by default (CI runners)."
  - "ShokiRunnerListenerDelegate lives in the Service module (not main.swift) so the test target can exercise the full delegate path via NSXPCListener.anonymous() without needing a signed bundle."
  - "Phase 1 protocol is intentionally minimal (ping only). Phase 3 additions are documented as comments in ShokiRunnerProtocol.swift so the evolution path is visible to future readers."
  - "Entitlements enable only com.apple.security.automation.apple-events; Accessibility is granted via TCC at runtime, not via entitlement (third-party certs can't request com.apple.private.accessibility.scrod — PITFALLS.md #11)."
  - "Developer ID cert flow: scripts assume secrets are injected as env vars (APPLE_DEVELOPER_ID_APP, APPLE_ID, APPLE_TEAM_ID, APPLE_APP_SPECIFIC_PASSWORD). Plan 05 decides whether to import via apple-actions/import-codesign-certs or an equivalent keychain-setup action."
metrics:
  duration: "~4 minutes"
  completed_date: "2026-04-17"
  tasks_completed: 2
  files_created: 11
  commits: 2
  tests_passing: 2
---

# Phase 01 Plan 04: ShokiRunner.app Swift Helper + XPC Scaffold Summary

## One-liner

Swift Package Manager bundle (`ShokiRunner.app`) with NSXPCListener on mach service `org.shoki.runner`, a frozen Phase-1 `ping()` protocol, hardened-runtime entitlements, and CI-ready codesign + notarytool scripts — the stable TCC trust anchor that survives Node/Zig upgrades (PITFALLS.md Pitfall 4 mitigation).

## What Shipped

### Swift package (3 targets + 1 test target)

- `ShokiRunnerProtocol` library — frozen `@objc public protocol ShokiRunnerProtocol` with one method (`ping(reply:)`) and one exported constant (`ShokiRunnerMachServiceName = "org.shoki.runner"`). Phase 3 additions documented inline.
- `ShokiRunnerService` library — `ShokiRunnerService.ping` replies `"shoki-runner-pong"`; `ShokiRunnerListenerDelegate` wires `NSXPCConnection` and is reused by both `main.swift` and the tests.
- `ShokiRunner` executable — boots `NSXPCListener(machServiceName:)` and parks on `RunLoop.main.run()`.
- `ShokiRunnerTests` — 2 XCTest cases, both green:
  - `testAnonymousListenerPing` (in-process NSXPCConnection round-trip)
  - `testServiceDirectCall` (direct ping invocation)

### App bundle metadata

- `Info.plist` — `CFBundleIdentifier=org.shoki.runner`, `LSUIElement=true` (background app, no dock icon), `MachServices.org.shoki.runner=true`, NSAccessibility + NSAppleEvents usage strings (required for Phase 3 TCC prompts), `LSMinimumSystemVersion=13.0`, placeholder version `0.0.0`+`1`.
- `ShokiRunner.entitlements` — hardened-runtime-friendly (`allow-jit=false`, `allow-unsigned-executable-memory=false`, `disable-library-validation=false`); enables `com.apple.security.automation.apple-events` only.

### Build / sign / notarize scripts

- `scripts/build-app-bundle.sh` — `swift build -c release|debug`, copy to `ShokiRunner.app/Contents/MacOS/ShokiRunner`, copy `Info.plist` to `Contents/Info.plist`. `set -euo pipefail`, passes `bash -n`, exits non-zero if the SPM binary isn't produced.
- `scripts/sign-and-notarize.sh` — `codesign --force --options runtime --entitlements ... --sign $APPLE_DEVELOPER_ID_APP --timestamp --deep`, `codesign --verify --verbose=4`, `codesign -dvvv` tee'd to `.codesign.out`, `ditto -c -k --keepParent` for zip, `xcrun notarytool submit --wait --output-format json`, JSON status check, `xcrun stapler staple`, `xcrun stapler validate`. Fails fast via `: "${VAR:?...}"` if any Apple secret env var is missing.

## Must-Haves Verification

| # | Truth | Verified how |
|---|-------|--------------|
| 1 | Package.swift defines a Swift package that produces a ShokiRunner executable | `swift build -c release` → `Linking ShokiRunner` → `Build complete! (1.85s)`; `.build/release/ShokiRunner` is a `Mach-O 64-bit executable arm64` (per `file`) |
| 2 | XPC protocol (ShokiRunnerProtocol) declares a ping() method | `grep -q "@objc public protocol ShokiRunnerProtocol"` + inspection shows `func ping(reply: @escaping (String) -> Void)` |
| 3 | ShokiRunnerService implements ping() returning 'shoki-runner-pong' | `grep -q "shoki-runner-pong"` in ShokiRunnerService.swift; test `testServiceDirectCall` asserts equality and passes |
| 4 | ShokiRunner main.swift boots an NSXPCListener with mach service name 'org.shoki.runner' | `grep -q "NSXPCListener"` in main.swift; `NSXPCListener(machServiceName: ShokiRunnerMachServiceName)` where the constant equals `"org.shoki.runner"` |
| 5 | build-app-bundle.sh produces a ShokiRunner.app bundle with Info.plist, entitlements, and the built executable | Ran the script; output: `Bundle ready at .../ShokiRunner.app`. Verified `Contents/Info.plist` + `Contents/MacOS/ShokiRunner` (Mach-O arm64, 61 KB). `plutil -p` confirms CFBundleIdentifier/LSUIElement/MachServices. Entitlements are applied *at sign time*, not embedded as a file — they live in the source tree and are read by `codesign --entitlements` (standard Apple flow). |
| 6 | sign-and-notarize.sh codesigns with APPLE_DEVELOPER_ID_APP env var, then notarizes with notarytool | `grep -q "codesign --force"`, `grep -q "options runtime"`, `grep -q "notarytool submit"`, `bash -n` passes. Running without env vars fails with clear `APPLE_DEVELOPER_ID_APP must be set` (exit 1). |
| 7 | codesign -dvvv on the produced bundle shows the Developer ID when run in CI with secrets provided | Cannot verify locally without a real Developer ID cert. Plan 05's CI workflow will exercise this. |
| 8 | A Swift test exercises the XPC ping round-trip in-process | `swift test` output: `Executed 2 tests, with 0 failures` — `testAnonymousListenerPing` passed (0.003s) + `testServiceDirectCall` passed (0.000s) |

## Artifacts Verification

| Artifact | Provides | Present? |
|----------|----------|----------|
| `helper/Package.swift` | Swift Package Manager manifest | yes — contains `name: "ShokiRunner"` and `.executable(name: "ShokiRunner", ...)` |
| `helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift` | NSXPCConnection protocol | yes — contains `@objc public protocol ShokiRunnerProtocol` |
| `helper/Sources/ShokiRunnerService/ShokiRunnerService.swift` | Protocol implementation | yes — contains `public final class ShokiRunnerService` |
| `helper/Sources/ShokiRunner/main.swift` | NSXPCListener entry point | yes — contains `NSXPCListener(machServiceName: ...)` |
| `helper/Sources/ShokiRunner/Info.plist` | App bundle metadata | yes — `CFBundleIdentifier=org.shoki.runner`, `plutil -lint` passes |
| `helper/Sources/ShokiRunner/ShokiRunner.entitlements` | Hardened-runtime entitlements | yes — `com.apple.security.automation.apple-events=true`, `plutil -lint` passes |
| `helper/scripts/build-app-bundle.sh` | Builds app bundle | yes — executable, `bash -n` passes, runs successfully |
| `helper/scripts/sign-and-notarize.sh` | codesign + notarytool wrapper | yes — contains `notarytool`, executable, `bash -n` passes, fails fast on missing env vars |

## Key Links (architecture wiring)

| From | To | Via | Verified |
|------|-----|-----|----------|
| `helper/Sources/ShokiRunner/main.swift` | `helper/Sources/ShokiRunnerService/ShokiRunnerService.swift` | `let delegate = ShokiRunnerListenerDelegate(); listener.delegate = delegate` | Build links both modules into the executable; no "undefined symbol" errors |
| `helper/Sources/ShokiRunnerService/ShokiRunnerService.swift` | `helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift` | `ShokiRunnerService: NSObject, ShokiRunnerProtocol` | Swift type checker enforces protocol conformance; build success confirms |
| `helper/scripts/sign-and-notarize.sh` | `helper/scripts/build-app-bundle.sh` | README documents running build-app-bundle.sh first, then sign-and-notarize.sh on the produced ShokiRunner.app | README: "Build" section followed by "Sign + notarize" section |

## Verification Block Results

**swift build (release):**
```
Building for production...
[5/7] Compiling ShokiRunnerProtocol ShokiRunnerProtocol.swift
[6/8] Compiling ShokiRunnerService ShokiRunnerService.swift
[7/9] Compiling ShokiRunner main.swift
[8/9] Linking ShokiRunner
Build complete! (1.85s)
```

**swift test:**
```
Test Case '-[ShokiRunnerTests.XPCPingTests testAnonymousListenerPing]' passed (0.003 seconds).
Test Case '-[ShokiRunnerTests.XPCPingTests testServiceDirectCall]' passed (0.000 seconds).
Executed 2 tests, with 0 failures (0 unexpected) in 0.003 (0.005) seconds
```

**build-app-bundle.sh:**
```
[build-app-bundle] Building Swift package (configuration=release)
Build complete! (0.10s)
[build-app-bundle] Bundle ready at /Users/jackshelton/dev/open-source/shoki/helper/ShokiRunner.app
```

**Bundle layout (post build-app-bundle.sh):**
```
ShokiRunner.app/
  Contents/
    Info.plist                 (1417 B, plutil -lint OK)
    MacOS/
      ShokiRunner              (61048 B, Mach-O arm64)
```

**plist keys in built bundle:**
```
CFBundleIdentifier => org.shoki.runner
LSUIElement => true
MachServices => { "org.shoki.runner" => true }
NSAccessibilityUsageDescription => "ShokiRunner uses Accessibility APIs ..."
NSAppleEventsUsageDescription => "ShokiRunner sends AppleScript commands ..."
```

**sign-and-notarize.sh error paths (env vars missing):**
```
./scripts/sign-and-notarize.sh: line 31: APPLE_DEVELOPER_ID_APP: APPLE_DEVELOPER_ID_APP must be set
exit=1

usage: ./scripts/sign-and-notarize.sh <path-to-ShokiRunner.app>
exit=2
```

## Deviations from Plan

### [Rule 3 — blocking issue, resolved] Cross-agent git interference during parallel Wave 2 execution

- **Found during:** `git commit` for Task 2.
- **Issue:** While this agent (Plan 01-04) had Task 2 files (Info.plist, entitlements, scripts) staged for commit, the parallel Wave 2 agent for Plan 01-02 ran a blanket-staging operation in its commit flow. My staged Task 2 files were swept into a Plan 02 commit (originally `40c4463`, titled `chore(01-02): remove zig/.gitkeep placeholder`).
- **Resolution:** Plan 02's agent self-corrected by rebasing to release my files. The corrected Plan 02 commit is `54d8d2c` (zig/.gitkeep only). My files were re-committed fresh under Plan 04's correct attribution as commit `e463a69` (`feat(01-04): add Info.plist, entitlements, build + sign/notarize scripts`).
- **Net outcome:** Attribution is now correct. All four files are in a Plan 04-labeled commit. Content is identical to what I originally wrote.
- **Files affected:** `helper/Sources/ShokiRunner/Info.plist`, `helper/Sources/ShokiRunner/ShokiRunner.entitlements`, `helper/scripts/build-app-bundle.sh`, `helper/scripts/sign-and-notarize.sh`.
- **Final commit holding these files:** `e463a69` (Plan 04).
- **Process suggestion for future parallel waves:** Executors should stage files individually by path (as this plan's commit protocol requires) rather than `git add -A` / `git add .`. Consider using git worktrees for parallel agents to isolate their indexes completely. Flagging for orchestrator attention.

### [Rule 3 — blocking issue, preempted] SPM exclude warning on first build

- **Found during:** First `swift build -c release` after Task 1.
- **Issue:** `Package.swift` excludes `Info.plist` and `ShokiRunner.entitlements` from the executable target's source list, but those files didn't exist yet (they land in Task 2). Swift emitted two "Invalid Exclude ... File not found" *warnings*. Build succeeded despite the warnings.
- **Fix:** No fix needed — the warnings were expected transient state between Task 1 and Task 2. Once Task 2 created the files, the warnings disappeared (confirmed via `swift build 2>&1 | grep -i warning` → empty). Documenting so a reviewer who runs the build between tasks understands the warning is not a bug.
- **Files affected:** none (behavioural note only).

## Threat Model Coverage

All six threats from the plan's STRIDE register are dispositioned as declared:

| Threat | Disposition | Evidence in repo |
|--------|-------------|------------------|
| T-01-14 Spoofing XPC clients | **Accept (Phase 1)** | ping is stateless and safe. Phase 3 hardening documented in ShokiRunnerProtocol.swift top comment ("Security note T-01-14"). |
| T-01-15 Tampering with ShokiRunner.app | **Mitigate** | `sign-and-notarize.sh` runs `codesign --force --options runtime --entitlements ... --timestamp --deep`, verifies with `codesign --verify --verbose=4`, and stapler-validates. Plan 05 CI runs this before publish. |
| T-01-16 Repudiation — notarization failure unnoticed | **Mitigate** | Script parses notarytool JSON output and exits non-zero if `status != Accepted`. CI job fails loudly. |
| T-01-17 Info disclosure — Apple credentials in logs | **Mitigate** | Secrets read from env vars, never echoed. `.notarize-log.json` is in `helper/.gitignore`. |
| T-01-18 DoS — NSXPCListener crash | **Accept** | Phase 3 adds a supervisor; Phase 1 scope ends at "starts + responds once." |
| T-01-19 Elevation — hardened-runtime bypass | **Mitigate** | Entitlements file explicitly sets `allow-jit=false`, `allow-unsigned-executable-memory=false`, `disable-library-validation=false`. Only `com.apple.security.automation.apple-events=true` is enabled (required for Phase 3 VO AppleScript). |

No new threat surface beyond what the plan anticipated.

## Threat Flags

None. The Phase 1 surface (ping only) is the minimum viable TCC trust anchor; no new network endpoints, auth paths, or schema changes at trust boundaries beyond what the plan specified.

## Known Stubs

None that block the plan's goal. Deferred-to-Phase-3 features are explicitly commented in `ShokiRunnerProtocol.swift`:

- `startVoiceOver`, `stopVoiceOver`, `getLastPhrase` are called out as Phase 3 additions in a protocol comment. They are intentional stubs per the plan — Phase 3 will add them without modifying Phase 1's `ping` surface.

The ShokiRunner.app bundle itself is complete and functional for Phase 1 (pinging works, hardened-runtime entitlements in place, signable + notarizable with real secrets). It is deliberately *not* signed during this plan because:
- No Developer ID cert is available in the dev environment.
- Plan 05 CI does the signing once real secrets (`APPLE_DEVELOPER_ID_APP`, etc.) are in scope.

## Authentication Gates

None reached. Swift tooling is available locally and no Apple ID / notarytool interaction was required to complete either task. Plan 05 is where the first real auth-dependent step (notarytool submit) will run, using the env-var contract this plan's scripts already enforce.

## Required Secrets for Plan 05 CI

The signing workflow Plan 05 will build needs these secret names configured in the GitHub Actions repo secrets panel (values never logged):

| Secret | Purpose |
|--------|---------|
| `APPLE_DEVELOPER_ID_APP` | String form of the Developer ID Application cert, e.g. `Developer ID Application: Your Name (ABCDE12345)`. Consumed by `codesign --sign`. |
| `APPLE_ID` | Apple ID email address used to authenticate to notarytool. |
| `APPLE_TEAM_ID` | 10-character Apple team ID (same as the `(TEAMID)` suffix in APPLE_DEVELOPER_ID_APP). |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password generated at appleid.apple.com → Sign-In and Security → App-Specific Passwords. |
| `APPLE_CERT_P12` (decided in Plan 05) | Base64-encoded `.p12` bundle of the Developer ID cert + private key, imported into a keychain at job start. |
| `APPLE_CERT_P12_PASSWORD` (decided in Plan 05) | Password for the `.p12`. |

Plan 05 will pick between `apple-actions/import-codesign-certs` and an equivalent keychain-setup action. The scripts in this plan are agnostic to which import method is used — they only require the cert to be present in the keychain under `APPLE_DEVELOPER_ID_APP`'s identity string.

## Blockers Hit

None. Swift 6.2 is installed on the dev host, SPM builds clean, tests pass, plists lint, bash scripts pass `bash -n`, and the `build-app-bundle.sh` script was end-to-end exercised.

## Gotchas Discovered

1. **`LSUIElement + MachServices` interaction on macOS 26:** No issues observed. The bundle builds and the Info.plist lints. Runtime behavior (launchd publishing under `org.shoki.runner` with a background-only app) will be validated in Phase 3 when the Zig addon actually connects.
2. **SPM exclude warnings:** `Package.swift` excludes `Info.plist` and `ShokiRunner.entitlements` from the executable target's source list. Between Task 1 and Task 2 the files don't exist and Swift emits two warnings; after Task 2 the warnings disappear. Harmless but worth noting for a reviewer who runs intermediate builds.
3. **Cross-agent git contamination in Wave 2 parallel execution:** See the first deviation above. Plan 02's agent swept my Task 2 files into its own commit. Net content is correct; attribution is wrong. Suggest that the orchestrator enforce the "no `git add -A` / `git add .`" rule in executor prompts for parallel waves, or hand each parallel agent a git worktree so their index is isolated.

## Commits

| # | Hash | Message | Attribution status |
|---|------|---------|--------------------|
| 1 | `ccf0add` | `feat(01-04): scaffold ShokiRunner Swift package with XPC ping` | Correct (Plan 04) |
| 2 | `e463a69` | `feat(01-04): add Info.plist, entitlements, build + sign/notarize scripts` | Correct (Plan 04). Original accidental Plan 02 commit `40c4463` was rebased away to `54d8d2c` (zig/.gitkeep only). See first deviation. |

## Self-Check: PASSED

Files verified present:
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/Package.swift`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/.gitignore`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/README.md`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/Sources/ShokiRunnerService/ShokiRunnerService.swift`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/Sources/ShokiRunner/main.swift`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/Sources/ShokiRunner/Info.plist`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/Sources/ShokiRunner/ShokiRunner.entitlements`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/Tests/ShokiRunnerTests/XPCPingTests.swift`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/scripts/build-app-bundle.sh`
- FOUND: `/Users/jackshelton/dev/open-source/shoki/helper/scripts/sign-and-notarize.sh`

Commits verified present:
- FOUND: `ccf0add` in `git log --oneline` (Task 1 — correctly attributed to Plan 04)
- FOUND: `e463a69` in `git log --oneline` (Task 2 — correctly attributed to Plan 04 after resolving cross-agent interference; see first deviation)
