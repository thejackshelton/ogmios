#!/usr/bin/env bash
# Sign and notarize a .app bundle (OgmiosRunner.app OR OgmiosSetup.app).
#
# Usage: ./scripts/sign-and-notarize.sh <path-to-app> [--entitlements <path>]
#
# Plan 08-04 factored the script to accept any .app path (previously
# OgmiosRunner-only). CI loops over both bundles, calling this once per bundle.
# Entitlements default is inferred from the bundle basename:
#   - OgmiosRunner.app -> src/runner/OgmiosRunner.entitlements
#   - OgmiosSetup.app  -> src/setup/OgmiosSetup.entitlements
#   - anything else    -> src/runner/OgmiosRunner.entitlements (backward-compat
#                         default; callers can override via --entitlements).
#
# Required env vars:
#   APPLE_DEVELOPER_ID_APP       e.g. "Developer ID Application: Your Name (ABCDE12345)"
#   APPLE_ID                     Apple ID email used for notarytool
#   APPLE_TEAM_ID                10-char Apple team id
#   APPLE_APP_SPECIFIC_PASSWORD  app-specific password for APPLE_ID
#
# Runs two steps:
#   1. codesign with hardened runtime + entitlements
#   2. notarytool submit --wait + staple

set -euo pipefail

APP_PATH=""
ENT_PATH=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --entitlements)
            ENT_PATH="$2"
            shift 2
            ;;
        -h|--help)
            echo "usage: $0 <path-to-app> [--entitlements <path>]"
            exit 0
            ;;
        *)
            if [[ -z "$APP_PATH" ]]; then
                APP_PATH="$1"
                shift
            else
                echo "Unknown arg: $1" >&2
                exit 2
            fi
            ;;
    esac
done

if [[ -z "$APP_PATH" ]]; then
    echo "usage: $0 <path-to-app> [--entitlements <path>]" >&2
    exit 2
fi

if [[ ! -d "$APP_PATH" ]]; then
    echo "error: app bundle not found: $APP_PATH" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default entitlements path: infer from bundle basename. Plan 08-03 made both
# entitlements files identical, but keeping the path-per-bundle preserves
# semantic clarity + lets a future divergence flow through without a script
# change.
if [[ -z "$ENT_PATH" ]]; then
    base="$(basename "$APP_PATH" .app)"
    case "$base" in
        OgmiosRunner) ENT_PATH="$HELPER_DIR/src/runner/OgmiosRunner.entitlements" ;;
        OgmiosSetup)  ENT_PATH="$HELPER_DIR/src/setup/OgmiosSetup.entitlements" ;;
        *)            ENT_PATH="$HELPER_DIR/src/runner/OgmiosRunner.entitlements" ;;
    esac
fi

if [[ ! -f "$ENT_PATH" ]]; then
    echo "error: entitlements not found: $ENT_PATH" >&2
    exit 1
fi

: "${APPLE_DEVELOPER_ID_APP:?APPLE_DEVELOPER_ID_APP must be set}"
: "${APPLE_ID:?APPLE_ID must be set}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID must be set}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD must be set}"

APP_BASE="$(basename "$APP_PATH")"

echo "[sign] Codesigning $APP_PATH with $APPLE_DEVELOPER_ID_APP (entitlements=$ENT_PATH)"
codesign --force \
    --options runtime \
    --entitlements "$ENT_PATH" \
    --sign "$APPLE_DEVELOPER_ID_APP" \
    --timestamp \
    --deep \
    "$APP_PATH"

echo "[sign] Verifying signature"
codesign --verify --verbose=4 "$APP_PATH"
codesign -dvvv "$APP_PATH" 2>&1 | tee "$HELPER_DIR/.codesign.${APP_BASE}.out"

echo "[notarize] Zipping bundle for notarytool"
ZIP_PATH="$HELPER_DIR/${APP_BASE}.zip"
/usr/bin/ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "[notarize] Submitting to notarytool (wait mode)"
xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --wait \
    --output-format json \
    | tee "$HELPER_DIR/.notarize.${APP_BASE}.json"

STATUS=$(node -e "const d=require('$HELPER_DIR/.notarize.${APP_BASE}.json'); console.log(d.status || 'unknown')")
if [[ "$STATUS" != "Accepted" ]]; then
    echo "error: notarization failed with status $STATUS" >&2
    exit 1
fi

echo "[notarize] Stapling"
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

rm -f "$ZIP_PATH"
echo "[done] Signed + notarized + stapled: $APP_PATH"
