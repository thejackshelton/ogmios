#!/usr/bin/env bash
# Build OgmiosRunner.app AND Ogmios.app (setup) from the Zig helper.
#
# Usage: ./scripts/build-app-bundle.sh [--configuration release|debug] [--target <zig-triple>]
#
# Runs from the helper/ directory. Produces:
#   - helper/.build/OgmiosRunner.app/
#   - helper/.build/Ogmios.app/          (setup bundle — was OgmiosSetup.app pre-0.1.6)
#   - helper/.build/libOgmiosXPCClient.dylib
#
# Phase 08 Plan 04 extended this script to verify BOTH bundles + the dylib
# in a single `zig build` invocation (helper/build.zig stages both .app
# contents via addInstallFileWithDir chains for each exe's Info.plist +
# Contents/MacOS/<exe>).
#
# Phase 10 Plan 03 added --target so app-release.yml can cross-compile the
# x86_64-macos bundles from the macos-14 (arm64) runner in the same script
# path as native arm64 builds. When omitted, zig picks the native target.
#
# On failure the script exits non-zero at the first missing artifact so CI's
# `set -euo pipefail` surfaces the precise cause.

set -euo pipefail

CONFIG="release"
TARGET=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --configuration) CONFIG="$2"; shift 2 ;;
        --target) TARGET="$2"; shift 2 ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$HELPER_DIR"

OPT_FLAG="-Doptimize=ReleaseFast"
if [[ "$CONFIG" == "debug" ]]; then
    OPT_FLAG="-Doptimize=Debug"
fi

ZIG_ARGS=("$OPT_FLAG")
# Only pass -Dtarget when it differs from native. Zig 0.16 + SDK 26.2 treats
# an explicit -target as a "bring-your-own-paths" signal and stops expanding
# the host SDK's framework/library search paths, which breaks linkFramework
# and linkSystemLibrary("objc"). For native arm64 builds the reliable path is
# to omit -target entirely and let Zig use its auto-detected host toolchain.
if [[ -n "$TARGET" ]]; then
    NATIVE_ARCH="$(uname -m)"
    NATIVE_TARGET=""
    case "$NATIVE_ARCH" in
        arm64) NATIVE_TARGET="aarch64-macos" ;;
        x86_64) NATIVE_TARGET="x86_64-macos" ;;
    esac
    if [[ "$TARGET" == "$NATIVE_TARGET" ]]; then
        echo "[build-app-bundle] TARGET=$TARGET matches native host; omitting -Dtarget to preserve SDK auto-detect"
    else
        ZIG_ARGS+=("-Dtarget=$TARGET")
    fi
fi

# SDK discovery. Zig 0.16 uses SDKROOT env + its own auto-detection to find
# frameworks and libobjc; on local dev hosts with modern Xcode (SDK 26.2+)
# passing `--sysroot` explicitly causes framework lookup to fail with
# "searched paths: none" because Zig does not expand the sysroot into framework
# search paths when the option is passed via `build-exe --sysroot`. The
# reliable pattern is:
#   - Export SDKROOT so Zig's auto-detection uses the right SDK.
#   - Only add `--sysroot` as a fallback if SDKROOT is empty (e.g. minimal
#     CI image where xcrun lives but SDKROOT isn't set at the job level).
if command -v xcrun >/dev/null 2>&1; then
    SDK_PATH="$(xcrun --sdk macosx --show-sdk-path 2>/dev/null || true)"
    if [[ -n "$SDK_PATH" ]]; then
        export SDKROOT="$SDK_PATH"
        echo "[build-app-bundle] SDKROOT=$SDK_PATH"
        # Only add --sysroot as a belt-and-suspenders fallback if the caller
        # explicitly asks for it via SHOKI_USE_SYSROOT=1. On Zig 0.16 + SDK
        # 26.2 it actively breaks framework resolution for native builds.
        if [[ "${SHOKI_USE_SYSROOT:-0}" == "1" ]]; then
            ZIG_ARGS+=("--sysroot" "$SDK_PATH")
            echo "[build-app-bundle] SHOKI_USE_SYSROOT=1 -> passing --sysroot $SDK_PATH"
        fi
    fi
fi

echo "[build-app-bundle] Building Zig helper (configuration=$CONFIG${TARGET:+, target=$TARGET})"
zig build "${ZIG_ARGS[@]}"

RUNNER="$HELPER_DIR/.build/OgmiosRunner.app"
SETUP="$HELPER_DIR/.build/Ogmios.app"
DYLIB="$HELPER_DIR/.build/libOgmiosXPCClient.dylib"

# Verify every artifact that downstream CI (sign + notarize + copy into
# binding package) depends on. A missing file here means `zig build` silently
# dropped a target — fail loud rather than ship a broken bundle.
for f in "$RUNNER/Contents/MacOS/OgmiosRunner" \
         "$RUNNER/Contents/Info.plist" \
         "$SETUP/Contents/MacOS/Ogmios" \
         "$SETUP/Contents/Info.plist" \
         "$DYLIB"; do
    if [[ ! -e "$f" ]]; then
        echo "error: missing artifact $f" >&2
        exit 1
    fi
done

# Ad-hoc re-sign with explicit reverse-DNS identifier.
# Zig's auto adhoc-sign uses the executable basename (e.g. "Ogmios") as the
# codesign identifier. That basename gets cached in macOS TCC based on prior
# build sessions, and if an older build had a different basename (e.g.
# "ShokiSetup" from before the 11-* rebrand or "OgmiosSetup" from 0.1.5 and
# earlier), TCC can display the stale name in permission prompts even after
# the binary is rebuilt. Re-signing with an explicit reverse-DNS identifier:
#   (a) forces a new cdhash, invalidating TCC cache for this binary
#   (b) sets a stable identifier that matches CFBundleIdentifier in Info.plist
#       (`org.ogmios.setup` — reverse-DNS id is stable across the bundle
#       rename from OgmiosSetup.app -> Ogmios.app in 0.1.6).
# Runs unconditionally — skip-if-Developer-ID-set isn't needed because explicit
# --identifier is valid for both adhoc and Developer-ID-signed bundles.
echo "[build-app-bundle] Re-signing with explicit reverse-DNS identifiers"
codesign --force --sign - --identifier org.ogmios.runner "$RUNNER"
codesign --force --sign - --identifier org.ogmios.setup "$SETUP"
codesign --force --sign - --identifier org.ogmios.xpc.client "$DYLIB"

# Verify the identifier actually stuck.
for pair in "$RUNNER:org.ogmios.runner" "$SETUP:org.ogmios.setup" "$DYLIB:org.ogmios.xpc.client"; do
    path="${pair%%:*}"
    expected="${pair##*:}"
    actual=$(codesign -dvv "$path" 2>&1 | awk -F= '/^Identifier=/{print $2}')
    if [[ "$actual" != "$expected" ]]; then
        echo "error: codesign identifier mismatch on $path — got '$actual' expected '$expected'" >&2
        exit 1
    fi
done

echo "[build-app-bundle] Bundles ready:"
echo "  - $RUNNER"
echo "  - $SETUP"
echo "  - $DYLIB"
