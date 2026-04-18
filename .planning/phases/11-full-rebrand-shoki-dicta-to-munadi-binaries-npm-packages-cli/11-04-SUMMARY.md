---
phase: 11-full-rebrand-shoki-dicta-to-munadi-binaries-npm-packages-cli
plan: 04
subsystem: helper (Zig macOS helper — runner + setup + XPC client)
tags: [rebrand, helper, zig, xpc, info-plist, codesign, macos]

dependency_graph:
  requires: []
  provides:
    - "helper Zig package name .munadi_helper"
    - "MunadiRunner.app (bundle id org.munadi.runner, MachServices org.munadi.runner)"
    - "MunadiSetup.app (bundle id org.munadi.setup)"
    - "libMunadiXPCClient.dylib"
    - "munadi_xpc_* C-ABI symbol surface"
    - "munadi-darwin-<arch>.zip packaging scheme"
  affects:
    - "zig/build.zig (Plan 11-03 flips its helper-dylib link target to libMunadiXPCClient.dylib + munadi_xpc_* extern decls)"
    - "packages/sdk/src/cli/checks/*.ts (Plan 11-01 expects org.munadi.runner / org.munadi.setup)"
    - ".github/workflows/app-release.yml (Plan 11-06 flips artifact names to munadi-darwin-<arch>.zip)"

tech_stack:
  added: []
  patterns:
    - "Zig build package name change requires fingerprint regen (0x10005a4ffe7d374e -> 0xeb86f0434ee5bc68)"
    - "End-to-end rename covers: package name, exe names, .app bundle dirs, Info.plist CFBundle* strings, MachServices key, C-ABI symbol prefix, dylib name, build scripts, zip artifact names"

key_files:
  created: []
  modified:
    - "helper/build.zig (runner/setup exe names, dylib name, static lib name, bundle staging paths)"
    - "helper/build.zig.zon (package name + fingerprint)"
    - "helper/README.md (full rebrand of prose)"
    - "helper/src/setup/Info.plist (CFBundle* + NSAccessibilityUsageDescription + NSAppleEventsUsageDescription + copyright)"
    - "helper/src/runner/Info.plist (CFBundle* + MachServices + NS* + copyright)"
    - "helper/src/runner/xpc_bindings.zig (mach_service_name + block-shim extern decls)"
    - "helper/src/runner/xpc_block_shim.c (shoki_xpc_* -> munadi_xpc_* exports + comments)"
    - "helper/src/runner/xpc_service.zig (ping reply string + comment refs)"
    - "helper/src/runner/main.zig (version string + block-shim caller + runloop comment)"
    - "helper/src/runner/ax_bindings.zig (helper doc comment)"
    - "helper/src/runner/ax_observer.zig (Swift-source references in comments)"
    - "helper/src/client/xpc_client.zig (munadi_xpc_* export symbols + doc)"
    - "helper/src/setup/setup_main.zig (user-facing alert strings + file-level doc)"
    - "helper/src/setup/appkit_bindings.zig (file-level doc comment)"
    - "helper/test/xpc_block_shim_test.zig (symbol references updated)"
    - "helper/test/xpc_service_test.zig (assertions on munadi-runner-pong + org.munadi.runner)"
    - "helper/scripts/build-app-bundle.sh (RUNNER/SETUP/DYLIB paths + verify loop)"
    - "helper/scripts/package-app-zip.sh (zip artifact name + staging + extractor refs)"
    - "helper/scripts/sign-and-notarize.sh (entitlements path inference + header)"
    - "helper/.gitignore (ignore MunadiRunner.app/ + MunadiRunner.zip)"
    - "helper/.gitkeep (placeholder text)"

decisions:
  - "Kept existing helper naming pattern (PascalCase exe + .app directory names 'MunadiRunner'/'MunadiSetup'; CFBundleDisplayName with spaces 'Munadi Runner'/'Munadi Setup'). The two separate apps are preserved — no single Munadi.app, per the clarification in the plan's <interfaces> block."
  - "Normalized bundle identifiers on org.munadi.* (org.munadi.runner, org.munadi.setup) — matches the existing org.shoki.* pattern and what Plan 01's tcc-grants.ts check expects. CONTEXT.md's app.munadi.* / com.munadi.* prefixes are superseded."
  - "Preserved ad-hoc signing contract (APPLE_DEVELOPER_ID_APP env-var surface unchanged) and LSMinimumSystemVersion / LSUIElement / version strings unchanged — pure rename, no policy change."
  - "Regenerated Zig package fingerprint after package-name change (Zig 0.16 rejects the prior fingerprint and prints the new value; no ambiguity)."

metrics:
  duration: "~10 min"
  completed: 2026-04-18T15:22:00Z
---

# Phase 11 Plan 04: Helper subsystem Shoki -> Munadi rebrand Summary

Rebranded the entire `helper/` subsystem (Zig core macOS helper) from `Shoki*` to `Munadi*`: Zig package name, build product names, `.app` bundle names, Info.plist bundle IDs and display strings, MachServices key, XPC C-ABI symbol prefix (`shoki_xpc_*` -> `munadi_xpc_*`), dylib name (`libShokiXPCClient.dylib` -> `libMunadiXPCClient.dylib`), build scripts, and zip artifact names. Clean rebuild produced `MunadiRunner.app`, `MunadiSetup.app`, `libMunadiXPCClient.dylib`; `zig build test` exits 0; `package-app-zip.sh --arch arm64` produces `munadi-darwin-arm64.zip` with zero Shoki entries.

## Tasks Executed

### Task 1 — Rename helper Zig sources + Info.plists + XPC C-ABI symbols
Commit: `ce77b21`

Rewrote 16 helper files per the substitution table:

- `helper/build.zig.zon`: `.name = .shoki_helper` -> `.name = .munadi_helper`, fingerprint regenerated to `0xeb86f0434ee5bc68` (Zig 0.16 rejected the previous fingerprint with an explicit "if this is a new or forked package, use this value" hint).
- `helper/build.zig`: file-level doc comment + all inline comments + `addExecutable(.name = "MunadiRunner")`, `addExecutable(.name = "MunadiSetup")`, `addLibrary(.name = "MunadiXPCClient")`, `addLibrary(.name = "munadi_xpc_core")`, every `.build/ShokiRunner.app` / `.build/ShokiSetup.app` staging path, install filenames.
- `helper/src/setup/Info.plist`: CFBundleIdentifier `org.munadi.setup`, CFBundleName `MunadiSetup`, CFBundleDisplayName `Munadi Setup`, CFBundleExecutable `MunadiSetup`, NSAccessibilityUsageDescription + NSAppleEventsUsageDescription mention `Munadi Setup` + `munadi`, NSHumanReadableCopyright `Munadi contributors`, `<!-- MunadiSetup.app -->` comment.
- `helper/src/runner/Info.plist`: CFBundleIdentifier `org.munadi.runner`, CFBundleName `MunadiRunner`, CFBundleDisplayName `Munadi Runner`, CFBundleExecutable `MunadiRunner`, MachServices key `org.munadi.runner`, NS* usage strings mention `MunadiRunner`, NSHumanReadableCopyright `Munadi contributors`.
- `helper/src/runner/xpc_bindings.zig`: `mach_service_name = "org.munadi.runner"`, three block-shim extern decls `munadi_xpc_install_event_handler_block` / `munadi_xpc_install_peer_message_handler_block` / `munadi_xpc_self_test_invoke_handler_block`, helper doc comment.
- `helper/src/runner/xpc_block_shim.c`: three exported functions renamed `munadi_xpc_*`, file-level doc updated.
- `helper/src/runner/xpc_service.zig`: ping reply `"munadi-runner-pong"`, `MunadiRunnerService.swift` cross-references in ErrorCode comments.
- `helper/src/runner/main.zig`: version output `"MunadiRunner {s} (zig-compiled)\n"`, Swift-source comment references, runloop timeout comment, block-shim caller `xpc.munadi_xpc_install_peer_message_handler_block(...)`.
- `helper/src/runner/ax_bindings.zig` + `ax_observer.zig`: file-level comments reference `Munadi helper` / `MunadiRunnerService.swift`.
- `helper/src/client/xpc_client.zig`: full rewrite — five exported symbols renamed (`munadi_xpc_connect`, `munadi_xpc_set_event_callback`, `munadi_xpc_start_ax_observer`, `munadi_xpc_stop_ax_observer`, `munadi_xpc_disconnect`), doc comment references updated to `org.munadi.runner`.
- `helper/src/setup/setup_main.zig`: all user-facing alert strings updated (`Welcome to Munadi Setup`, `Munadi is ready`, etc.), `MunadiSetup` CLI prefix, file-level doc comment.
- `helper/src/setup/appkit_bindings.zig`: file-level doc comment.
- `helper/test/xpc_block_shim_test.zig`: three symbol references updated.
- `helper/test/xpc_service_test.zig`: assertions on `"munadi-runner-pong"` + `"org.munadi.runner"` + test case title updates.
- `helper/README.md`: full prose rebrand.

Verification: `zig build test` exits 0; `zig build` produces `helper/.build/MunadiRunner.app`, `helper/.build/MunadiSetup.app`, `helper/.build/libMunadiXPCClient.dylib`.

### Task 2 — Update build + package + sign scripts; build + verify bundle structure
Commit: `45f94d4`

- `helper/scripts/build-app-bundle.sh`: header comment + RUNNER/SETUP/DYLIB variables + verify loop paths -> `MunadiRunner.app` / `MunadiSetup.app` / `libMunadiXPCClient.dylib` / `MunadiRunner` / `MunadiSetup`.
- `helper/scripts/package-app-zip.sh`: output zip names `munadi-darwin-<arch>.zip`, staged-dir directory names `MunadiRunner.app` / `MunadiSetup.app`, all prose references, extractor-path note points at the renamed bundles.
- `helper/scripts/sign-and-notarize.sh`: entitlements-path inference updated (`MunadiRunner` / `MunadiSetup` bundle basenames route to `src/runner/MunadiRunner.entitlements` / `src/setup/MunadiSetup.entitlements`), header text references both bundles by new names. Signing-identity env-var contract preserved exactly (`APPLE_DEVELOPER_ID_APP`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`).
- `helper/.gitignore`: updates `ShokiRunner.app/` -> `MunadiRunner.app/` and `ShokiRunner.zip` -> `MunadiRunner.zip`.
- `helper/.gitkeep`: placeholder text updated.

Verification runs:

- Clean rebuild: `rm -rf helper/.build helper/zig-out && cd helper && zig build && bash scripts/build-app-bundle.sh` exits 0, prints three "Bundles ready" lines with Munadi names.
- Bundle executables:
  - `helper/.build/MunadiRunner.app/Contents/MacOS/MunadiRunner --version` -> `MunadiRunner 0.1.0 (zig-compiled)`
  - `helper/.build/MunadiSetup.app/Contents/MacOS/MunadiSetup --self-test` -> exit 0
- Bundle Info.plist values:
  - `plutil -extract CFBundleIdentifier raw helper/.build/MunadiRunner.app/Contents/Info.plist` -> `org.munadi.runner`
  - `plutil -extract CFBundleIdentifier raw helper/.build/MunadiSetup.app/Contents/Info.plist` -> `org.munadi.setup`
  - CFBundleExecutable fields: `MunadiRunner` and `MunadiSetup` respectively.
- Packager (arm64): `cd helper && bash scripts/package-app-zip.sh --arch arm64` produces `helper/.build/munadi-darwin-arm64.zip` + `.sha256`; `unzip -l` listing shows `MunadiRunner.app/` and `MunadiSetup.app/` at archive root; `grep -E "Shoki|shoki"` against listing returns zero matches.

## Key Decisions

1. **Preserved existing naming pattern (two apps, PascalCase exe names, spaced display names).** CONTEXT.md implied a single `Munadi.app`; the plan explicitly resolved that: two separate apps (`MunadiRunner.app` + `MunadiSetup.app`) with CFBundleDisplayName = `Munadi Runner` / `Munadi Setup`. CONTEXT.md's generic `Munadi.app` reference is treated as marketing copy only — filesystem names remain the PascalCase pair.
2. **Normalized on `org.munadi.*` bundle IDs.** CONTEXT.md suggested `app.munadi.*` / `com.munadi.*`; the plan called out that Plan 11-01's `packages/sdk/src/cli/checks/tcc-grants.ts` expects `org.munadi.runner` / `org.munadi.setup` (matching the existing `org.shoki.*` pattern). Chose `org.munadi.*` to keep plan-level alignment tight.
3. **Regenerated Zig package fingerprint.** Zig 0.16 validates the low bits of the fingerprint against the package name and rejected the prior value (`0x10005a4ffe7d374e`) after the rename, printing the correct replacement (`0xeb86f0434ee5bc68`). No ambiguity — used the value Zig itself suggested.
4. **Kept signing contract unchanged.** `APPLE_DEVELOPER_ID_APP` / `APPLE_ID` / `APPLE_TEAM_ID` / `APPLE_APP_SPECIFIC_PASSWORD` env-var surface preserved; codesign + notarytool invocations otherwise untouched. Ad-hoc signing continues through v0.1 per the STATE.md Phase 10 Plan 03 decision.

## Deviations from Plan

**None directly — one documented additive fix:**

1. **[Rule 3 — Blocking issue] Regenerated Zig package fingerprint.**
   - **Found during:** Task 1 verification (first `zig build test` after the package-name change).
   - **Issue:** Zig 0.16 rejected the prior fingerprint with `error: invalid fingerprint: 0x10005a4ffe7d374e; if this is a new or forked package, use this value: 0xeb86f0434ee5bc68`.
   - **Fix:** Updated `helper/build.zig.zon` to use the value Zig itself suggested.
   - **Files modified:** `helper/build.zig.zon` (one-line edit within the same Task 1 commit).
   - **Commit:** `ce77b21` (folded into Task 1).

2. **[Rule 2 — Critical completeness] Updated `helper/.gitignore` + `helper/.gitkeep`.**
   - **Found during:** Task 2 (post-script-rewrite sweep for lingering `Shoki` tokens).
   - **Issue:** `.gitignore` still ignored `ShokiRunner.app/` and `ShokiRunner.zip` — under the new naming these do nothing, and if anyone reverted a script locally we'd be one rename away from a tracked `.app` bundle leaking into the repo. `.gitkeep` still referenced `ShokiRunner.app`.
   - **Fix:** Flipped both to `MunadiRunner.*`.
   - **Files modified:** `helper/.gitignore`, `helper/.gitkeep` (folded into Task 2 commit).
   - **Commit:** `45f94d4`.

No architectural changes. No checkpoints hit. No auth gates.

## Downstream Coupling

Plans 11-03 (Zig core) and 11-04 (this plan) must land together because they share the C-ABI surface (`libMunadiXPCClient.dylib` + `munadi_xpc_*` extern decls + `org.munadi.runner` mach service). This plan supplies those definitions; Plan 11-03 flips zig-core's link target + extern decls. Neither plan builds cleanly against the pre-rename other side — that's the expected coupling.

Plan 11-01's `packages/sdk/src/cli/checks/tcc-grants.ts` expects `org.munadi.runner` / `org.munadi.setup` bundle IDs — satisfied by the Info.plist edits here.

Plan 11-06's workflow sweep will update `.github/workflows/app-release.yml` artifact names to `munadi-darwin-<arch>.zip` — the packager already produces those names.

## Self-Check: PASSED

**Commits:**
- `ce77b21` — Task 1 (helper Zig sources rename): FOUND in `git log`
- `45f94d4` — Task 2 (helper scripts rename): FOUND in `git log`

**Files:**
- `helper/build.zig` — FOUND
- `helper/build.zig.zon` — FOUND
- `helper/src/setup/Info.plist` — FOUND
- `helper/src/runner/Info.plist` — FOUND
- `helper/.build/MunadiRunner.app/Contents/MacOS/MunadiRunner` — FOUND (executable)
- `helper/.build/MunadiSetup.app/Contents/MacOS/MunadiSetup` — FOUND (executable)
- `helper/.build/libMunadiXPCClient.dylib` — FOUND
- `helper/.build/munadi-darwin-arm64.zip` — FOUND (produced by packager smoke test)
- `helper/.build/munadi-darwin-arm64.zip.sha256` — FOUND
