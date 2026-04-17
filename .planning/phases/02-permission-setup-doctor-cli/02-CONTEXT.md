# Phase 2: Permission Setup & Doctor CLI - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Mode:** Auto (decisions made from research + PROJECT.md)

<domain>
## Phase Boundary

Build `shoki doctor`, the CLI a developer runs **before** their first shoki test. It diagnoses VoiceOver AppleScript enablement, TCC grants, signature stability, and OS version support. With `--fix`, it applies safe automated remediations; for anything requiring SIP-off or manual user action, it prints precise instructions with System Settings deep links.

Out of this phase: the actual VoiceOver driver (Phase 3), Vitest integration (Phase 4), tart/CI setup (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### CLI Package + Entry Points
- **New workspace package: `packages/doctor`** published as `@shoki/doctor` with a binary name `shoki` (via `"bin": { "shoki": "./dist/cli.js" }`). Invoked as `npx shoki doctor`.
- **Alternative rejected:** merging into `@shoki/sdk` — keeps the SDK install lean and lets CLI pull doctor-only deps.
- **Stretch:** `@shoki/doctor` also publishes a programmatic `runDoctor()` function returning a typed `DoctorReport` for users who want to integrate diagnostics into their own setup scripts.

### macOS Version Detection
- Read `sw_vers -productVersion` — output is `14.x.x`, `15.x.x`, or `26.x.x`.
- Major versions handled: **14 (Sonoma), 15 (Sequoia), 26 (Tahoe)**. Earlier versions → `OS_UNSUPPORTED` exit.
- Minor versions within a major don't branch behavior — we assume point releases don't move paths/permissions. Test matrix covers `.0` and current latest of each major.

### VoiceOver AppleScript Plist Paths (version-branched)
- **macOS 14 (Sonoma):** `~/Library/Preferences/com.apple.VoiceOver4/default/com.apple.VoiceOver4.plist` — key `SCREnableAppleScript` (boolean).
- **macOS 15 (Sequoia):** Apple moved this to a Group Container: `~/Library/Group Containers/group.com.apple.VoiceOver4/Library/Preferences/com.apple.VoiceOver4.plist`. Same key.
- **macOS 26 (Tahoe):** Same location as Sequoia, but (per CVE-2025-43530) access now additionally requires an Apple-internal entitlement. Shoki detects this case, warns the user that AppleScript path will be constrained, and indicates that the AX-notifications fallback (Phase 3) will carry the load.

### TCC Enumeration
- **Direct `TCC.db` reads:** Use `sqlite3` against `~/Library/Application Support/com.apple.TCC/TCC.db` for user scope and `/Library/Application Support/com.apple.TCC/TCC.db` for system scope. Read-only. No writes.
- **Query:** `SELECT client, service, auth_value, csreq FROM access;` filtered to services in `{kTCCServiceAccessibility, kTCCServiceAppleEvents}` and client matches for `ShokiRunner`, `node`, and the user's terminal bundles.
- **CSReq mismatch detection:** compare hash in `csreq` blob against the current signature of `ShokiRunner.app`. If they differ, flag as `SIGNATURE_MISMATCH` — the grant exists but for a stale signature; user must re-grant.
- **Fallback when SQLite read fails:** on macOS 14+ with SIP, reading `TCC.db` from user scope works without special permission; system TCC requires Full Disk Access. Detect this, surface `NEEDS_FULL_DISK_ACCESS` with System Settings deep link.

### `--fix` Behavior Matrix

| Check | `shoki doctor` (report) | `shoki doctor --fix` (act) |
|-------|-------------------------|----------------------------|
| OS version supported | Report major version, pass/fail | No-op; cannot fix |
| VO AppleScript plist enabled | Read key, report state | `defaults write` the plist key to YES (if user-scope) |
| Accessibility TCC grant for helper | Query TCC.db, report | Cannot write TCC; emit deep link + exact grant steps |
| Automation TCC grant for helper | Query TCC.db, report | Same as above |
| Signature freshness | Compare csreq to current sig | Print "rebuild + re-grant" steps |
| SIP status | `csrutil status` | Never touch SIP; emit manual instructions |

- **Strict rule:** `--fix` NEVER writes to `TCC.db`. It's a sealed database; even `tccutil` is unreliable. Shoki relies on the user to click through System Settings for grants, with perfectly-targeted deep links.
- **`--fix` without flag:** doctor reports and exits non-zero if anything is amiss. `--fix` attempts safe writes, then re-reports.

### System Settings Deep Links (macOS version-aware)
- Accessibility pane: `x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility`
- Automation pane: `x-apple.systempreferences:com.apple.preference.security?Privacy_Automation`
- Emit as `open "<url>"` command in the output plus a bare URL the user can copy.
- These URLs are stable across macOS 14-26.

### Exit Codes (documented in README + --help)
```
0   OK — ready to run shoki
1   UNKNOWN_ERROR — catchall
2   OS_UNSUPPORTED — macOS < 14 or > 26
3   VO_APPLESCRIPT_DISABLED — plist key not set
4   TCC_MISSING_ACCESSIBILITY — helper lacks Accessibility grant
5   TCC_MISSING_AUTOMATION — helper lacks Automation grant (specifically for VO)
6   SIGNATURE_MISMATCH — TCC grant exists but for a stale signature
7   NEEDS_FULL_DISK_ACCESS — cannot read system TCC.db
8   HELPER_MISSING — ShokiRunner.app not found in expected location
9   HELPER_UNSIGNED — ShokiRunner.app has no Developer ID sig (dev build)
```
- Each code gets a human-readable message, exact remediation steps, and in `--json` mode a structured object for CI scripts.

### Output Modes
- **Default:** colorized human output, checkboxes, emphasis on what to fix.
- **`--json`:** machine-readable for CI. Schema defined in `packages/doctor/src/report-types.ts` and exported.
- **`--quiet`:** only prints summary + exit code. Suitable for git pre-commit hooks.

### Signature Verification
- Use `codesign -dvvv <path>` + parse output.
- Extract "Authority=Developer ID Application: ..." line.
- On an unsigned helper (dev build), emit `HELPER_UNSIGNED` warning but don't block — local dev without signing is a valid state, it just means re-prompting.

### Helper Path Discovery
- Expected locations (in order):
  1. `node_modules/@shoki/binding-<platform>/helper/ShokiRunner.app` — the npm-installed path
  2. `helper/.build/ShokiRunner.app` — the dev build path (detected by presence of sibling `Package.swift`)
  3. User-provided `SHOKI_HELPER_PATH` env var — escape hatch for custom deployments
- If none found → `HELPER_MISSING` exit code 8.

### CLI Structure
- `commander`-based argument parsing (widely used, small footprint). Alt: `clipanion` is heavier, `yargs` is heavier still.
- Subcommands: `shoki doctor`, `shoki doctor --fix`, `shoki doctor --json`, `shoki --version`, `shoki --help`. Additional `shoki setup` is an alias for `doctor --fix` for discoverability.
- `shoki info` prints installed binding paths, macOS version, TCC.db status — diagnostic for bug reports.

### Testing Strategy
- **Unit tests (Vitest, Node):** each check function receives fixtures for `sw_vers` output, `codesign` output, SQLite row arrays, plist contents. No OS calls.
- **Integration tests (darwin-only):** run the real CLI on the CI macOS runner with a known-good helper installed, assert exit codes. Gated on `process.platform === 'darwin'`.
- **Golden-output snapshot tests:** human-mode output is stable. A changed golden means an intentional UX shift.

### Claude's Discretion
- Exact terminal output styling (colors, Unicode chars, padding) — pick something pleasant, stay under 80 cols when possible.
- `commander` vs `clipanion` (commander recommended but both are fine).
- Whether to cache TCC.db reads within a single invocation (yes — unnecessary SQLite round-trips waste 50-100ms each).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `@shoki/sdk`'s `binding-loader.ts` (Phase 1) — same platform+arch detection logic; factor shared helper into `@shoki/doctor` or share via SDK re-export.
- `ShokiRunner.app` (Phase 1) — the path doctor checks for signature.
- Existing pnpm workspace conventions from Phase 1 — new package follows same package.json shape.

### Established Patterns
- TS ES modules, `tsc` build, Vitest tests, Biome format — same across all packages.
- Typed errors in `errors.ts` — doctor should export its own `DoctorError` taxonomy but follow the same pattern.

### Integration Points
- `@shoki/doctor` depends on `@shoki/sdk` only to share platform-detection helpers. NO inverse dependency — sdk must not import from doctor.
- `shoki doctor` invoked by the user pre-first-test. Phase 4's Vitest plugin optionally calls `runDoctor()` at globalSetup time and errors out with a clear message if doctor fails.

</code_context>

<specifics>
## Specific Ideas

- Doctor's output should feel like `brew doctor` — same visual grammar, same "actionable over comprehensive" ethos.
- The error codes should be Google-able. Document them in `docs/troubleshooting.md` (Phase 6).
- `--json` output is first-class, not an afterthought. We expect CI scripts to use it.
- `shoki info` is the "please paste this when filing a bug" command.

</specifics>

<deferred>
## Deferred Ideas

- Interactive TUI wizard (`shoki setup --interactive`) — nice-to-have but CLI + clear errors are sufficient for v1.
- Self-update of the helper (`shoki doctor --update-helper`) — users reinstall via npm; no need to automate.
- Windows/Linux variants — macOS-only for v1; other platforms in v2+ with their own doctor logic.
- Sentry / error reporting integration — keep it zero-telemetry.

</deferred>
