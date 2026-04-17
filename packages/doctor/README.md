# @shoki/doctor

CLI that diagnoses (and where possible fixes) VoiceOver, TCC, and helper
state on macOS 14 (Sonoma), 15 (Sequoia), and 26 (Tahoe).

## Quick start

    npx shoki doctor          # diagnose, print report, exit with code
    npx shoki doctor --fix    # diagnose and attempt safe automated fixes
    npx shoki doctor --json   # machine-readable output for CI
    npx shoki info            # print diagnostic context (paste in bug reports)

## Exit codes

See `src/report-types.ts` — `ExitCode` enum is the source of truth.

| Code | Meaning |
|------|---------|
| 0 | OK — ready to run shoki |
| 1 | UNKNOWN_ERROR — catchall |
| 2 | OS_UNSUPPORTED — macOS < 14 or > 26 |
| 3 | VO_APPLESCRIPT_DISABLED — plist key not set |
| 4 | TCC_MISSING_ACCESSIBILITY — helper lacks Accessibility grant |
| 5 | TCC_MISSING_AUTOMATION — helper lacks Automation grant (for VoiceOver) |
| 6 | SIGNATURE_MISMATCH — TCC grant exists but for a stale signature |
| 7 | NEEDS_FULL_DISK_ACCESS — cannot read system TCC.db |
| 8 | HELPER_MISSING — ShokiRunner.app not found |
| 9 | HELPER_UNSIGNED — dev build, not a release binary |

Full CLI reference in the Phase 6 docs site.
