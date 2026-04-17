#!/usr/bin/env bash
# Build ShokiRunner.app from the SPM executable.
# Usage: ./scripts/build-app-bundle.sh [--configuration release|debug]
#
# Runs from the helper/ directory. Produces ./ShokiRunner.app.
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

echo "[build-app-bundle] Building Swift package (configuration=$CONFIG)"
swift build -c "$CONFIG"

BIN_PATH="$(swift build -c "$CONFIG" --show-bin-path)/ShokiRunner"
if [[ ! -x "$BIN_PATH" ]]; then
    echo "error: executable not found at $BIN_PATH" >&2
    exit 1
fi

APP_DIR="$HELPER_DIR/ShokiRunner.app"
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
cp "$BIN_PATH" "$APP_DIR/Contents/MacOS/ShokiRunner"
cp "$HELPER_DIR/Sources/ShokiRunner/Info.plist" "$APP_DIR/Contents/Info.plist"

echo "[build-app-bundle] Bundle ready at $APP_DIR"
