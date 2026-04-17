---
phase: 02-permission-setup-doctor-cli
plans: [01, 02, 03, 04]
subsystem: doctor
tags: [cli, permissions, tcc, voiceover, macos]
tech_added:
  - commander@^12 (CLI argument parsing)
  - better-sqlite3@^11 (read-only TCC.db access)
  - execa@^9 (subprocess invocations: sw_vers, defaults, codesign, csrutil)
  - picocolors@^1 (terminal colors)
  - @types/better-sqlite3@^7.6 (type defs)
key_files_created:
  - packages/doctor/package.json
  - packages/doctor/tsconfig.json
  - packages/doctor/vitest.config.ts
  - packages/doctor/README.md
  - packages/doctor/src/report-types.ts (FROZEN contract)
  - packages/doctor/src/errors.ts
  - packages/doctor/src/run-doctor.ts (orchestrator for 8 checks)
  - packages/doctor/src/fix-executor.ts
  - packages/doctor/src/cli.ts (commander entry, bin "shoki")
  - packages/doctor/src/index.ts (programmatic surface)
  - packages/doctor/src/checks/macos-version.ts
  - packages/doctor/src/checks/vo-plist.ts
  - packages/doctor/src/checks/helper-discovery.ts
  - packages/doctor/src/checks/helper-signature.ts
  - packages/doctor/src/checks/sip-status.ts
  - packages/doctor/src/checks/tcc-db-paths.ts
  - packages/doctor/src/checks/csreq-compare.ts
  - packages/doctor/src/checks/tcc-grants.ts
  - packages/doctor/src/checks/index.ts (barrel)
  - packages/doctor/src/checks/index-tcc.ts (separate TCC barrel)
  - packages/doctor/src/reporters/human.ts
  - packages/doctor/src/reporters/json.ts
  - packages/doctor/src/reporters/quiet.ts
  - packages/doctor/test/ (13 test files, 90 tests passing)
key_files_modified:
  - package.json (root) — added pnpm.onlyBuiltDependencies for better-sqlite3
requirements_closed:
  - PERM-01 (VO AppleScript state on 14/15/26)
  - PERM-02 (Accessibility + Automation TCC grants)
  - PERM-03 (stale TCC entries)
  - PERM-04 (--fix with safe defaults-write; no TCC.db writes)
  - PERM-05 (System Settings deep links)
  - PERM-06 (classified exit codes per CONTEXT.md D-06)
---

# Phase 2: Permission Setup & Doctor CLI — Summary

One-liner: `shoki doctor` CLI implemented — 8 checks covering OS version, VoiceOver AppleScript plist, helper discovery + signature, SIP status, TCC Accessibility/Automation grants, and stale-entry detection; `--fix` writes the VO plist only and surfaces deep links for TCC.

## Plan Status

| Plan | Status    | Commit  | Notes                                                                |
| ---- | --------- | ------- | -------------------------------------------------------------------- |
| 02-01 | complete | a7d4aa0 | Package scaffold, frozen DoctorReport / ExitCode contract, CLI stub  |
| 02-02 | complete | b4f2e95 | 5 OS/plist/helper/SIP checks (PERM-01)                               |
| 02-03 | complete | 8919c8f | TCC enumeration + csreq compare + stale-entry checks (PERM-02, -03)  |
| 02-04 | complete | 08c0e25 | runDoctor orchestrator, fix-executor, 3 reporters, finalized CLI (PERM-04/05/06) |

## Commits (oldest first)

- `a7d4aa0` feat(02-01): scaffold @shoki/doctor package with frozen type contract
- `b4f2e95` feat(02-02): implement macOS/plist/helper/SIP checks for PERM-01
- `8919c8f` feat(02-03): TCC.db enumeration + csreq compare + stale-entry detection
- `08c0e25` feat(02-04): wire runDoctor orchestrator + fix-executor + reporters + CLI

## Must-haves verified

- [x] `@shoki/doctor` installable via pnpm workspace, `bin.shoki -> dist/cli.js`
- [x] `pnpm --filter @shoki/doctor typecheck` exits 0
- [x] `pnpm --filter @shoki/doctor build` produces `dist/cli.js` with shebang on line 1
- [x] `pnpm --filter @shoki/doctor test` exits 0 — 90 tests pass (1 skipped for non-darwin)
- [x] All 10 ExitCode values 0-9 are asserted in report-types.test.ts
- [x] macOS 14 (Sonoma) plist path uses `~/Library/Preferences/com.apple.VoiceOver4/default/com.apple.VoiceOver4.plist`
- [x] macOS 15 (Sequoia) + 26 (Tahoe) use Group Container path `~/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist`
- [x] Tahoe warn case references CVE-2025-43530 entitlement gate (PITFALLS.md #11)
- [x] Helper discovery order: override -> npm (`node_modules/@shoki/binding-<platform>-<arch>/helper/ShokiRunner.app`) -> dev (`helper/.build/ShokiRunner.app` with `Package.swift` sibling guard)
- [x] `checkHelperSignature` classifies Developer ID (pass) / ad-hoc (warn) / unsigned (fail HELPER_UNSIGNED)
- [x] `openTCCDatabase` uses `{ readonly: true, fileMustExist: true }` — no INSERT/UPDATE/DELETE anywhere in src/checks/
- [x] `checkTCCAccessibility` distinguishes matching / stale (SIGNATURE_MISMATCH) / absent (TCC_MISSING_ACCESSIBILITY) / inaccessible (NEEDS_FULL_DISK_ACCESS)
- [x] `checkTCCAutomation` requires both `kTCCServiceAppleEvents` AND `indirect_object_identifier = 'com.apple.VoiceOver'`
- [x] `checkTCCStaleEntries` returns `warn` (not `fail`) with row details — correct severity
- [x] `applyFixActions` executes ONLY `defaults-write`; `open-system-settings` and `manual` captured in `skippedActions` (CONTEXT.md D-04 strict rule)
- [x] CLI exits with `report.exitCode` — never hardcoded
- [x] Running `node packages/doctor/dist/cli.js doctor --quiet` on this dev machine emits `shoki-doctor fail(8) fails=3 warns=1 exit=8` — HELPER_MISSING because ShokiRunner.app not yet built (expected state until Phase 3)
- [x] `info` subcommand prints shoki/node/platform/helper/TCC.db status
- [x] Integration test spawns real `dist/cli.js` and asserts exit codes in `{0, 2..9}` for --version, --help, doctor --json, doctor --quiet, info — all passing on darwin-arm64

## Exit code distribution observed on dev machine (darwin-arm64)

Run without helper installed:
- `os-version`: pass (macOS 15.x) — `--version` check passes
- `helper-present`: **fail HELPER_MISSING** (no ShokiRunner.app yet)
- `helper-signature`: skip (no helper)
- `sip-status`: pass (enabled)
- `vo-plist`: depends on user config (likely fail VO_APPLESCRIPT_DISABLED)
- `tcc-accessibility`: likely fail (no grant yet)
- `tcc-automation`: likely fail
- `tcc-stale-entries`: pass or warn

Final exit code: **8 (HELPER_MISSING)** because it has priority 90 (highest among failing checks here). This is exactly the expected pre-Phase-3 state.

## Test summary

Breakdown of 90 tests:
- `report-types.test.ts` — 5 (ExitCode values, resolveExitCode priority)
- `macos-version.test.ts` — 14 (parseMajorVersion + checkMacOSVersion)
- `vo-plist.test.ts` — 9 (resolvePlistPath + checkVOPlist all branches)
- `helper-discovery.test.ts` — 6 (override / npm / dev / Package.swift guard / HELPER_MISSING)
- `helper-signature.test.ts` — 7 (parse + check for signed/adhoc/unsigned)
- `sip-status.test.ts` — 8 (parseCsrutilOutput + checkSIPStatus)
- `csreq-compare.test.ts` — 9 (parseCSReqBlob + compareCSReq match/mismatch/cannot-parse)
- `tcc-grants.test.ts` — 15 (enumerate + 3 check functions, all branches)
- `fix-executor.test.ts` — 5 (defaults-write applies, open-system-settings skips, errors non-fatal)
- `run-doctor.test.ts` — 3 (shape invariants + mode)
- `reporters/human.test.ts` — 3 (snapshots + line length)
- `reporters/json.test.ts` — 2 (round-trip + snapshot)
- `integration/cli-smoke.test.ts` — 5 (real built binary on darwin)

Snapshot files committed:
- `test/reporters/__snapshots__/human.test.ts.snap`
- `test/reporters/__snapshots__/json.test.ts.snap`

## Deviations from Plan

### [Rule 1 - Test bug] parseCSReqBlob test expectation

- **Found during:** Plan 02-03 initial test run
- **Issue:** The test asserted `parseCSReqBlob(CSREQ_DEVELOPER_ID_JACK)` returns the full string `"Developer ID Application: Jack Shelton (TEAMIDXYZ)"`, but the regex `/Developer ID Application: ([^"\u0000]+)/` captures only the identity portion (group 1), returning `"Jack Shelton (TEAMIDXYZ)"`.
- **Fix:** Updated the test expectation to match actual behavior. `compareCSReq` normalizes both sides (strips the "Developer ID Application: " prefix) so match/mismatch semantics are unchanged.
- **Files modified:** `packages/doctor/test/csreq-compare.test.ts`
- **Commit:** 8919c8f (included in Plan 03 commit)

### [Rule 3 - Blocker] pnpm onlyBuiltDependencies for better-sqlite3

- **Found during:** Plan 02-01 install step
- **Issue:** pnpm 10 ignores build scripts by default; better-sqlite3 requires `node-gyp` native build to produce the sqlite binding. Without it, `new Database(...)` throws at runtime.
- **Fix:** Added `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3"] }` to repo-root `package.json`, then `pnpm rebuild better-sqlite3`. The prebuilt binary resolved for darwin-arm64 on this machine (no source compile triggered).
- **Files modified:** `package.json` (root)
- **Commit:** a7d4aa0 (rolled into Plan 01)

### [Rule 1 - Type error] Extracted interface from inline conditional type

- **Found during:** Plan 02-03 typecheck
- **Issue:** `EnumerateTCCGrantsOptions.rowSource` type used an inline `TCCOpenResult extends { ok: false; reason: infer R } ? R : never` conditional, which tsc flagged.
- **Fix:** Extracted `InjectedScopeError` and `InjectedScope` types at module scope for clarity.
- **Files modified:** `packages/doctor/src/checks/tcc-grants.ts`
- **Commit:** 8919c8f (Plan 03)

### [Rule 1 - Type error] Human reporter unused type reference

- **Found during:** Plan 02-04 typecheck
- **Issue:** A leftover `void null as DoctorCheckResult | null` placeholder caused a `TS2352` cast error.
- **Fix:** Removed the placeholder and the unused `DoctorCheckResult` import.
- **Files modified:** `packages/doctor/src/reporters/human.ts`
- **Commit:** 08c0e25 (Plan 04)

## Gaps / Pointers for downstream phases

### Phase 3 (VoiceOver driver)
- The driver should depend on all doctor checks passing before it boots. Pattern: call `runDoctor({ requireDarwin: true })` at driver startup, abort with the returned DoctorReport's error message if `exitCode !== 0`.
- `helperSignature` field in `DoctorReport` is the Authority string (e.g. `"Developer ID Application: Jack Shelton (TEAMIDXYZ)"`) that Plan 03's `enumerateTCCGrants` uses for csreq comparison. Phase 3's AX-notifications fallback capture path should also pick up this signature for its own TCC pre-flight.

### Phase 4 (Vitest plugin)
- Call `runDoctor({ requireDarwin: true })` at `globalSetup` time, `process.exit(report.exitCode)` on non-zero to abort the whole test run with an actionable message.
- Use `printHumanReport(report)` for the error output (it already includes fix-action one-liners).

### Phase 5 (CI / tart)
- Bake `ShokiRunner.app` into the tart image at `/opt/shoki/helper/ShokiRunner.app`, set `SHOKI_HELPER_PATH=/opt/shoki/helper/ShokiRunner.app` in the runner environment.
- Pre-seed TCC grants using the documented techniques; `shoki doctor` in the image should exit 0 as the health check.

### Phase 6 (docs)
- Document exit codes 0-9 in the user-facing troubleshooting guide — they're Google-able as specified in CONTEXT.md "specifics".
- Publish a platform-risk page referencing CVE-2025-43530 and the Tahoe warn branch in `checkVOPlist`.

## Known Stubs

None. Every check function in `src/checks/` has a real implementation backed by fixture-driven tests. The only placeholder behavior is:
- `runDoctor({ requireDarwin: false })` on non-darwin hosts produces a minimal report with a single skipped/failed check — this is intentional per the plan and is the correct behavior for unit-testable environments.

## Threat Flags

None. The plan's threat model (T-02-01 through T-02-35) was respected. No new security-relevant surface introduced beyond what the plans explicitly covered (CLI argv, SHOKI_HELPER_PATH env var, read-only TCC.db opens, execa argv-array invocations, never auto-opening deep links).

## Self-Check: PASSED

Verification steps run:
- `test -f packages/doctor/src/run-doctor.ts` → FOUND
- `test -f packages/doctor/src/fix-executor.ts` → FOUND
- `test -f packages/doctor/src/checks/tcc-grants.ts` → FOUND
- `test -f packages/doctor/dist/cli.js` → FOUND (with `#!/usr/bin/env node` on line 1)
- `git log --oneline | grep a7d4aa0` → FOUND
- `git log --oneline | grep b4f2e95` → FOUND
- `git log --oneline | grep 8919c8f` → FOUND
- `git log --oneline | grep 08c0e25` → FOUND
- `pnpm --filter @shoki/doctor typecheck` → EXIT 0
- `pnpm --filter @shoki/doctor build` → EXIT 0
- `pnpm --filter @shoki/doctor test` → EXIT 0, 90 passed (1 skipped)
- `node packages/doctor/dist/cli.js --version` → prints `0.0.0`, exit 0
- `node packages/doctor/dist/cli.js doctor --quiet` → `shoki-doctor fail(8) ... exit=8`, exit 8 (HELPER_MISSING — expected on pre-Phase-3 machine)
