# ShokiRunner.app

The signed TCC trust anchor for Shoki. See CONTEXT.md §Signed-Wrapper-App Architecture (D-06) for the "why" in detail.

## What this is

A minimal Swift app bundle that:
1. Runs as a background process spawned by the Zig `.node` addon.
2. Exposes an `NSXPCConnection` endpoint (`org.shoki.runner` mach service).
3. Is Developer ID-signed + notarized by the Shoki release pipeline.

Because this bundle's signature is stable across Shoki versions (we keep the same Developer ID cert), TCC grants survive upgrades of Node, Zig, and the `.node` addon itself (PITFALLS.md Pitfall 4).

## Phase 1 surface

- `ping() -> String` — returns `"shoki-runner-pong"`. Used by `binding.runnerPing()` (Phase 3 N-API export) to confirm XPC plumbing works end-to-end.

Phase 3 extends the protocol with VoiceOver lifecycle calls (`startVoiceOver`, `stopVoiceOver`, `getLastPhrase`, etc.) — those land in `Sources/ShokiRunnerProtocol/ShokiRunnerProtocol.swift` without changing the bundle identity.

## Build

    cd helper
    swift build -c release
    scripts/build-app-bundle.sh        # wraps the SPM executable into ShokiRunner.app

## Sign + notarize (CI only)

    scripts/sign-and-notarize.sh ./ShokiRunner.app

Requires env vars:
- `APPLE_DEVELOPER_ID_APP` — `"Developer ID Application: Your Name (TEAMID)"`
- `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_APP_SPECIFIC_PASSWORD` — notarytool credentials

## Test

    swift test

Runs `XPCPingTests.swift` which exercises the NSXPCListener round-trip in-process.

## Bundle layout

    ShokiRunner.app/
      Contents/
        Info.plist
        MacOS/
          ShokiRunner
        _CodeSignature/
          CodeResources
        embedded.provisionprofile (optional)

Written into `packages/binding-darwin-<arch>/helper/ShokiRunner.app/` by the Plan 05 CI workflow.
