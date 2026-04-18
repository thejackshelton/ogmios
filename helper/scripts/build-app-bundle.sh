#!/usr/bin/env bash
# Build ShokiRunner.app from the Zig helper.
#
# Usage: ./scripts/build-app-bundle.sh [--configuration release|debug]
#
# Runs from the helper/ directory. Produces ./.build/ShokiRunner.app/.
# Phase 08 Plan 02 replaced `swift build` with `zig build` — the bundle
# staging lives inside helper/build.zig (addInstallFileWithDir chain for
# Contents/Info.plist + Contents/MacOS/ShokiRunner), so this script is a
# thin driver: invoke zig build, verify the bundle landed, exit.

set -euo pipefail

CONFIG="release"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --configuration) CONFIG="$2"; shift 2 ;;
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

echo "[build-app-bundle] Building Zig helper (configuration=$CONFIG)"
zig build "$OPT_FLAG"

BUNDLE="$HELPER_DIR/.build/ShokiRunner.app"
if [[ ! -x "$BUNDLE/Contents/MacOS/ShokiRunner" ]]; then
    echo "error: bundle exe missing at $BUNDLE/Contents/MacOS/ShokiRunner" >&2
    exit 1
fi
if [[ ! -f "$BUNDLE/Contents/Info.plist" ]]; then
    echo "error: Info.plist missing at $BUNDLE/Contents/Info.plist" >&2
    exit 1
fi
if [[ ! -f "$HELPER_DIR/.build/libShokiXPCClient.dylib" ]]; then
    echo "error: libShokiXPCClient.dylib missing at $HELPER_DIR/.build/" >&2
    exit 1
fi

echo "[build-app-bundle] Bundle ready at $BUNDLE"
