---
phase: 12-final-rebrand-to-ogmios-replace-every-shoki-dicta-and-munadi
plan: 03
subsystem: helper (Zig macOS helper — runner + setup + XPC client)
tags: [rebrand, helper, zig, xpc, info-plist, codesign, macos]

dependency_graph:
  requires: []
  provides:
    - "helper Zig package name .ogmios_helper"
    - "OgmiosRunner.app (bundle id org.ogmios.runner, MachServices org.ogmios.runner)"
    - "OgmiosSetup.app (bundle id org.ogmios.setup)"
    - "libOgmiosXPCClient.dylib"
    - "ogmios_xpc_* C-ABI symbol surface"
    - "ogmios-darwin-<arch>.zip packaging scheme"
  affects:
    - "zig/build.zig (Plan 12-04 flips its helper-dylib link target to libOgmiosXPCClient.dylib + ogmios_xpc_* extern decls)"
    - "packages/sdk/src/cli/checks/*.ts (expect org.ogmios.runner / org.ogmios.setup — updated in downstream plans)"
    - ".github/workflows/app-release.yml (artifact names flip to ogmios-darwin-<arch>.zip)"

tech_stack:
  added: []
  patterns:
    - "Zig 0.16 fingerprint regeneration on package-name change (0xeb86f0434ee5bc68 -> 0x8ee2a3a0ffb04d0d)"
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
    - "helper/src/runner/xpc_block_shim.c (munadi_xpc_* -> ogmios_xpc_* exports + comments)"
    - "helper/src/runner/xpc_service.zig (ping reply string + comment refs)"
    - "helper/src/runner/main.zig (version string + block-shim caller + runloop comment)"
    - "helper/src/runner/ax_bindings.zig (helper doc comment)"
    - "helper/src/runner/ax_observer.zig (Swift-source references in comments)"
    - "helper/src/client/xpc_client.zig (ogmios_xpc_* export symbols + doc)"
    - "helper/src/setup/setup_main.zig (user-facing alert strings + file-level doc)"
    - "helper/src/setup/appkit_bindings.zig (file-level doc comment)"
    - "helper/test/xpc_block_shim_test.zig (symbol references updated)"
    - "helper/test/xpc_service_test.zig (assertions on ogmios-runner-pong + org.ogmios.runner)"
    - "helper/scripts/build-app-bundle.sh (RUNNER/SETUP/DYLIB paths + verify loop)"
    - "helper/scripts/package-app-zip.sh (zip artifact name + staging + extractor refs)"
    - "helper/scripts/sign-and-notarize.sh (entitlements path inference + header)"
    - "helper/.gitignore (ignore OgmiosRunner.app/ + OgmiosRunner.zip)"
    - "helper/.gitkeep (placeholder text)"

decisions:
  - "Entitlements files were already at OgmiosXXX.entitlements in HEAD (renamed in Plan 12-02). The plan's `git mv MunadiXXX -> OgmiosXXX` step was a no-op; captured as Rule 3 deviation below."
  - "Regenerated Zig package fingerprint after package-name change (Zig 0.16 rejected the prior fingerprint 0xeb86f0434ee5bc68 and printed the correct replacement 0x8ee2a3a0ffb04d0d — no ambiguity, used the value Zig itself suggested)."
  - "Preserved ad-hoc signing contract (APPLE_DEVELOPER_ID_APP / APPLE_ID / APPLE_TEAM_ID / APPLE_APP_SPECIFIC_PASSWORD env-var surface unchanged) and LSMinimumSystemVersion / LSUIElement / version strings unchanged — pure rename, no policy change."
  - "Kept two-app layout (OgmiosRunner.app + OgmiosSetup.app); CFBundleDisplayName uses spaced 'Ogmios Runner' / 'Ogmios Setup'. Bundle IDs normalized on org.ogmios.* (matches Phase 11's org.munadi.* pattern)."

metrics:
  duration: "~12 min"
  completed: 2026-04-18T17:10:00Z
---

# Phase 12 Plan 03: Helper subsystem Munadi -> Ogmios rebrand Summary

Rebranded the entire `helper/` subsystem (Zig core macOS helper) from `Munadi*` to `Ogmios*`: Zig package name, build product names, `.app` bundle names, Info.plist bundle IDs and display strings, MachServices key, XPC C-ABI symbol prefix (`munadi_xpc_*` -> `ogmios_xpc_*`), dylib name (`libMunadiXPCClient.dylib` -> `libOgmiosXPCClient.dylib`), build scripts, and zip artifact names. Clean rebuild produced `OgmiosRunner.app`, `OgmiosSetup.app`, `libOgmiosXPCClient.dylib`; `zig build test` exits 0; `package-app-zip.sh --arch arm64` produces `ogmios-darwin-arm64.zip` with zero Munadi entries.

## Tasks Executed

### Task 1 — Rename helper Zig sources + Info.plists + XPC C-ABI symbols
Commit: `8b13111`

Rewrote 18 helper files per the substitution table (Munadi -> Ogmios):

- `helper/build.zig.zon`: `.name = .munadi_helper` -> `.name = .ogmios_helper`, fingerprint regenerated to `0x8ee2a3a0ffb04d0d` (Zig 0.16 rejected the previous fingerprint with an explicit "if this is a new or forked package, use this value" hint).
- `helper/build.zig`: file-level doc comment + all inline comments + `addExecutable(.name = "OgmiosRunner")`, `addExecutable(.name = "OgmiosSetup")`, `addLibrary(.name = "OgmiosXPCClient")`, `addLibrary(.name = "ogmios_xpc_core")`, every `.build/MunadiRunner.app` / `.build/MunadiSetup.app` staging path, install filenames.
- `helper/src/setup/Info.plist`: CFBundleIdentifier `org.ogmios.setup`, CFBundleName `OgmiosSetup`, CFBundleDisplayName `Ogmios Setup`, CFBundleExecutable `OgmiosSetup`, NSAccessibilityUsageDescription + NSAppleEventsUsageDescription mention `Ogmios Setup` + `ogmios`, NSHumanReadableCopyright `Ogmios contributors`, `<!-- OgmiosSetup.app -->` comment.
- `helper/src/runner/Info.plist`: CFBundleIdentifier `org.ogmios.runner`, CFBundleName `OgmiosRunner`, CFBundleDisplayName `Ogmios Runner`, CFBundleExecutable `OgmiosRunner`, MachServices key `org.ogmios.runner`, NS* usage strings mention `OgmiosRunner`, NSHumanReadableCopyright `Ogmios contributors`.
- `helper/src/runner/xpc_bindings.zig`: `mach_service_name = "org.ogmios.runner"`, three block-shim extern decls `ogmios_xpc_install_event_handler_block` / `ogmios_xpc_install_peer_message_handler_block` / `ogmios_xpc_self_test_invoke_handler_block`, helper doc comment.
- `helper/src/runner/xpc_block_shim.c`: three exported functions renamed `ogmios_xpc_*`, file-level doc updated.
- `helper/src/runner/xpc_service.zig`: ping reply `"ogmios-runner-pong"`, `OgmiosRunnerService.swift` cross-references in ErrorCode comments.
- `helper/src/runner/main.zig`: version output `"OgmiosRunner {s} (zig-compiled)\n"`, Swift-source comment references, runloop timeout comment, block-shim caller `xpc.ogmios_xpc_install_peer_message_handler_block(...)`.
- `helper/src/runner/ax_bindings.zig` + `ax_observer.zig`: file-level comments reference `Ogmios helper` / `OgmiosRunnerService.swift`.
- `helper/src/client/xpc_client.zig`: full rewrite — five exported symbols renamed (`ogmios_xpc_connect`, `ogmios_xpc_set_event_callback`, `ogmios_xpc_start_ax_observer`, `ogmios_xpc_stop_ax_observer`, `ogmios_xpc_disconnect`), doc comment references updated to `org.ogmios.runner`.
- `helper/src/setup/setup_main.zig`: all user-facing alert strings updated (`Welcome to Ogmios Setup`, `Ogmios is ready`, etc.), `OgmiosSetup` CLI prefix, file-level doc comment. Byte-count literals in `_ = write(2, "OgmiosSetup: ...", N)` calls recomputed (+1 char per label vs Munadi).
- `helper/src/setup/appkit_bindings.zig`: file-level doc comment.
- `helper/test/xpc_block_shim_test.zig`: three symbol references updated.
- `helper/test/xpc_service_test.zig`: assertions on `"ogmios-runner-pong"` + `"org.ogmios.runner"` + test case title updates.
- `helper/README.md`: full prose rebrand.
- `helper/.gitignore` + `helper/.gitkeep`: ignore/placeholder text flipped to Ogmios.

Verification: `zig build test` exits 0; `zig build` produces `helper/.build/OgmiosRunner.app`, `helper/.build/OgmiosSetup.app`, `helper/.build/libOgmiosXPCClient.dylib`.

### Task 2 — Update build + package + sign scripts; clean rebuild + verify bundle structure
Commit: `24da0a2`

- `helper/scripts/build-app-bundle.sh`: header comment + RUNNER/SETUP/DYLIB variables + verify loop paths -> `OgmiosRunner.app` / `OgmiosSetup.app` / `libOgmiosXPCClient.dylib` / `OgmiosRunner` / `OgmiosSetup`.
- `helper/scripts/package-app-zip.sh`: output zip names `ogmios-darwin-<arch>.zip`, staged-dir directory names `OgmiosRunner.app` / `OgmiosSetup.app`, all prose references, extractor-path note points at the renamed bundles.
- `helper/scripts/sign-and-notarize.sh`: entitlements-path inference updated (`OgmiosRunner` / `OgmiosSetup` bundle basenames route to `src/runner/OgmiosRunner.entitlements` / `src/setup/OgmiosSetup.entitlements`), header text references both bundles by new names. Signing-identity env-var contract preserved exactly (`APPLE_DEVELOPER_ID_APP`, `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD`).

Verification runs:

- Clean rebuild: `rm -rf helper/.build helper/zig-out && cd helper && zig build && bash scripts/build-app-bundle.sh` exits 0, prints three "Bundles ready" lines with Ogmios names.
- Bundle executables:
  - `helper/.build/OgmiosRunner.app/Contents/MacOS/OgmiosRunner --version` -> `OgmiosRunner 0.1.0 (zig-compiled)`
  - `helper/.build/OgmiosSetup.app/Contents/MacOS/OgmiosSetup --self-test` -> exit 0
- Bundle Info.plist values:
  - `plutil -extract CFBundleIdentifier raw helper/.build/OgmiosRunner.app/Contents/Info.plist` -> `org.ogmios.runner`
  - `plutil -extract CFBundleIdentifier raw helper/.build/OgmiosSetup.app/Contents/Info.plist` -> `org.ogmios.setup`
- Dylib symbols: `nm .build/libOgmiosXPCClient.dylib | grep -c "_ogmios_xpc_"` -> 5 (matches the five exported C-ABI symbols).
- Packager (arm64): `bash scripts/package-app-zip.sh --arch arm64` produces `helper/.build/ogmios-darwin-arm64.zip` + `.sha256`; `unzip -l` listing shows zero Munadi / Shoki entries.
- Grep sweep: `rg -n "(munadi|Munadi|MUNADI_|libMunadiXPCClient|org\.munadi\.)" helper/ --glob '!.build/**' --glob '!zig-out/**'` -> zero matches.

## Key Decisions

1. **Regenerated Zig package fingerprint.** Zig 0.16 validates the low bits of the fingerprint against the package name and rejected the prior value (`0xeb86f0434ee5bc68`) after the rename, printing the correct replacement (`0x8ee2a3a0ffb04d0d`). No ambiguity — used the value Zig itself suggested.
2. **Preserved two-app layout + PascalCase exe names + spaced display names.** `OgmiosRunner.app` + `OgmiosSetup.app` preserved; CFBundleDisplayName = `Ogmios Runner` / `Ogmios Setup`. Bundle IDs = `org.ogmios.runner` / `org.ogmios.setup` (normalized on org.ogmios.* matching Phase 11's org.munadi.* pattern).
3. **Kept signing contract unchanged.** `APPLE_DEVELOPER_ID_APP` / `APPLE_ID` / `APPLE_TEAM_ID` / `APPLE_APP_SPECIFIC_PASSWORD` env-var surface preserved; codesign + notarytool invocations otherwise untouched.
4. **Byte-count literals recomputed + fixed latent off-by-one.** `setup_main.zig` uses `write(2, literal, N)` with explicit byte counts. "Ogmios" and "Munadi" are both 6 chars, so no shift is required. However, while re-validating the four `"OgmiosSetup: …"` write calls, I noticed the original Munadi values were all off-by-one — the `\n` trailing byte was never counted (`"MunadiSetup: libobjc missing\n"` was declared with N=28, actual length 29). This meant each error branch was writing 28/27/31/28 bytes when it should have written 29/28/32/29; the trailing newline was silently dropped on stderr. Corrected to actual byte counts in the Ogmios rewrite (tracked as Rule 1 below).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Regenerated Zig package fingerprint.**
- **Found during:** Task 1 verification (first `zig build test` after the package-name change).
- **Issue:** Zig 0.16 rejected the prior fingerprint with `error: invalid fingerprint: 0xeb86f0434ee5bc68; if this is a new or forked package, use this value: 0x8ee2a3a0ffb04d0d`.
- **Fix:** Updated `helper/build.zig.zon` to use the value Zig itself suggested.
- **Files modified:** `helper/build.zig.zon` (one-line edit within the Task 1 commit).
- **Commit:** `8b13111` (folded into Task 1).

**2. [Rule 3 — Blocking issue] Plan's entitlements `git mv` step was a no-op.**
- **Found during:** Task 1 start.
- **Issue:** Plan specified `git mv helper/src/setup/MunadiSetup.entitlements -> OgmiosSetup.entitlements` (and the runner analogue). On inspection, both files were already at their Ogmios names in HEAD — Plan 12-02 had already renamed them when it did the `@munadi/* -> @ogmios/*` binding package sweep. The `git mv` attempts errored (`fatal: bad source`).
- **Fix:** Treated the renames as already-applied. Entitlements files are present at the expected Ogmios paths; `sign-and-notarize.sh` Task 2 edits route to them correctly.
- **Files modified:** None (state already correct).
- **Commit:** N/A.

**3. [Rule 1 — Bug] Off-by-one byte counts in `setup_main.zig` stderr writes.**
- **Found during:** Task 1 / post-edit audit of the `write(2, literal, N)` sites.
- **Issue:** Four stderr error branches in `runInteractive`'s `self_test` mode — `libobjc missing`, `AppKit missing`, `Foundation missing`, `NSAlert missing` — had explicit byte counts that were one less than the literal's actual length (28/27/31/28 for strings that are 29/28/32/29 bytes including the trailing `\n`). Result: the trailing newline was silently dropped on every error branch, leaving stderr unterminated before the `exit(N)` call. Pre-existing bug from Phase 11 Plan 04.
- **Fix:** Recomputed and replaced with correct byte counts (29/28/32/29). The literal text also changed from `MunadiSetup: …` to `OgmiosSetup: …`; lengths happen to match across the rename (both brand names are 6 chars), so the correction is a pure off-by-one fix.
- **Files modified:** `helper/src/setup/setup_main.zig`.
- **Commit:** `8b13111` (folded into Task 1).

No architectural changes. No checkpoints hit. No auth gates.

## Downstream Coupling

Plans 12-03 (this plan) and 12-04 (Zig core) must land together because they share the C-ABI surface (`libOgmiosXPCClient.dylib` + `ogmios_xpc_*` extern decls + `org.ogmios.runner` mach service). This plan supplies those definitions; Plan 12-04 flips zig-core's link target + extern decls. Neither plan builds cleanly against the pre-rename other side — that's the expected coupling, matching Phase 11's 11-03/11-04 coupling model.

Plans that inspect / rely on bundle IDs (`packages/sdk/src/cli/checks/tcc-grants.ts`) expect `org.ogmios.runner` / `org.ogmios.setup` — satisfied by the Info.plist edits here.

The `.github/workflows/app-release.yml` workflow will pick up `ogmios-darwin-<arch>.zip` artifacts — the packager already produces those names.

## Self-Check: PASSED

**Commits:**
- `8b13111` — Task 1 (helper Zig sources + Info.plists + XPC C-ABI symbols rename): FOUND in `git log`
- `24da0a2` — Task 2 (helper build/package/sign scripts rename): FOUND in `git log`

**Files:**
- `helper/build.zig` — FOUND
- `helper/build.zig.zon` — FOUND (`.name = .ogmios_helper`)
- `helper/src/setup/Info.plist` — FOUND (`org.ogmios.setup`)
- `helper/src/runner/Info.plist` — FOUND (`org.ogmios.runner`)
- `helper/src/setup/OgmiosSetup.entitlements` — FOUND
- `helper/src/runner/OgmiosRunner.entitlements` — FOUND
- `helper/.build/OgmiosRunner.app/Contents/MacOS/OgmiosRunner` — FOUND (executable)
- `helper/.build/OgmiosSetup.app/Contents/MacOS/OgmiosSetup` — FOUND (executable)
- `helper/.build/libOgmiosXPCClient.dylib` — FOUND (5 `_ogmios_xpc_*` symbols)
- `helper/.build/ogmios-darwin-arm64.zip` — FOUND (produced by packager smoke test, zero Munadi entries)
- `helper/.build/ogmios-darwin-arm64.zip.sha256` — FOUND
