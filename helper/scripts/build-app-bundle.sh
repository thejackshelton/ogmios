#!/usr/bin/env bash
# Build OgmiosRunner.app AND OgmiosSetup.app from the Zig helper.
#
# Usage: ./scripts/build-app-bundle.sh [--configuration release|debug] [--target <zig-triple>]
#
# Runs from the helper/ directory. Produces:
#   - helper/.build/OgmiosRunner.app/
#   - helper/.build/OgmiosSetup.app/
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
if [[ -n "$TARGET" ]]; then
    ZIG_ARGS+=("-Dtarget=$TARGET")
fi

# Zig 0.16 on GH macos runners doesn't always auto-discover the macOS SDK
# (SDKROOT env var isn't consistently honored for -framework lookups). Pass
# --sysroot explicitly so linkFramework("Foundation", ...) can find the
# system frameworks. Only on macOS where xcrun is available.
if command -v xcrun >/dev/null 2>&1; then
    SDK_PATH="$(xcrun --sdk macosx --show-sdk-path 2>/dev/null || true)"
    if [[ -n "$SDK_PATH" ]]; then
        ZIG_ARGS+=("--sysroot" "$SDK_PATH")
        echo "[build-app-bundle] Using macOS SDK: $SDK_PATH"
    fi
fi

echo "[build-app-bundle] Building Zig helper (configuration=$CONFIG${TARGET:+, target=$TARGET})"
zig build "${ZIG_ARGS[@]}"

RUNNER="$HELPER_DIR/.build/OgmiosRunner.app"
SETUP="$HELPER_DIR/.build/OgmiosSetup.app"
DYLIB="$HELPER_DIR/.build/libOgmiosXPCClient.dylib"

# Verify every artifact that downstream CI (sign + notarize + copy into
# binding package) depends on. A missing file here means `zig build` silently
# dropped a target — fail loud rather than ship a broken bundle.
for f in "$RUNNER/Contents/MacOS/OgmiosRunner" \
         "$RUNNER/Contents/Info.plist" \
         "$SETUP/Contents/MacOS/OgmiosSetup" \
         "$SETUP/Contents/Info.plist" \
         "$DYLIB"; do
    if [[ ! -e "$f" ]]; then
        echo "error: missing artifact $f" >&2
        exit 1
    fi
done

echo "[build-app-bundle] Bundles ready:"
echo "  - $RUNNER"
echo "  - $SETUP"
echo "  - $DYLIB"
