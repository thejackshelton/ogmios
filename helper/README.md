# MunadiRunner.app

The signed TCC trust anchor for Munadi. See CONTEXT.md §Signed-Wrapper-App Architecture (D-06) for the "why" in detail.

## What this is

A minimal Swift app bundle that:
1. Runs as a background process spawned by the Zig `.node` addon.
2. Exposes an `NSXPCConnection` endpoint (`org.munadi.runner` mach service).
3. Is Developer ID-signed + notarized by the Munadi release pipeline.

Because this bundle's signature is stable across Munadi versions (we keep the same Developer ID cert), TCC grants survive upgrades of Node, Zig, and the `.node` addon itself (PITFALLS.md Pitfall 4).

## Phase 1 surface

- `ping() -> String` — returns `"munadi-runner-pong"`. Used by `binding.runnerPing()` (Phase 3 N-API export) to confirm XPC plumbing works end-to-end.

Phase 3 extends the protocol with VoiceOver lifecycle calls (`startVoiceOver`, `stopVoiceOver`, `getLastPhrase`, etc.) — those land in `Sources/MunadiRunnerProtocol/MunadiRunnerProtocol.swift` without changing the bundle identity.

## Build

    cd helper
    swift build -c release
    scripts/build-app-bundle.sh        # wraps the SPM executable into MunadiRunner.app

## Sign + notarize (CI only)

    scripts/sign-and-notarize.sh ./MunadiRunner.app

Requires env vars:
- `APPLE_DEVELOPER_ID_APP` — `"Developer ID Application: Your Name (TEAMID)"`
- `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD` — notarytool credentials

## Test

    swift test

Runs `XPCPingTests.swift` which exercises the NSXPCListener round-trip in-process.

## Bundle layout

    MunadiRunner.app/
      Contents/
        Info.plist
        MacOS/
          MunadiRunner
        _CodeSignature/
          CodeResources
        embedded.provisionprofile (optional)

Written into `packages/binding-darwin-<arch>/helper/MunadiRunner.app/` by the Plan 05 CI workflow.
