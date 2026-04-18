#!/usr/bin/env bash
# Build ShokiRunner.app AND ShokiSetup.app from the Zig helper.
#
# Usage: ./scripts/build-app-bundle.sh [--configuration release|debug]
#
# Runs from the helper/ directory. Produces:
#   - helper/.build/ShokiRunner.app/
#   - helper/.build/ShokiSetup.app/
#   - helper/.build/libShokiXPCClient.dylib
#
# Phase 08 Plan 04 extended this script to verify BOTH bundles + the dylib
# in a single `zig build` invocation (helper/build.zig stages both .app
# contents via addInstallFileWithDir chains for each exe's Info.plist +
# Contents/MacOS/<exe>).
#
# On failure the script exits non-zero at the first missing artifact so CI's
# `set -euo pipefail` surfaces the precise cause.

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

RUNNER="$HELPER_DIR/.build/ShokiRunner.app"
SETUP="$HELPER_DIR/.build/ShokiSetup.app"
DYLIB="$HELPER_DIR/.build/libShokiXPCClient.dylib"

# Verify every artifact that downstream CI (sign + notarize + copy into
# binding package) depends on. A missing file here means `zig build` silently
# dropped a target — fail loud rather than ship a broken bundle.
for f in "$RUNNER/Contents/MacOS/ShokiRunner" \
         "$RUNNER/Contents/Info.plist" \
         "$SETUP/Contents/MacOS/ShokiSetup" \
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
