#!/usr/bin/env bash
# Sign and notarize ShokiRunner.app.
# Usage: ./scripts/sign-and-notarize.sh <path-to-ShokiRunner.app>
#
# Required env vars:
#   APPLE_DEVELOPER_ID_APP     e.g. "Developer ID Application: Your Name (ABCDE12345)"
#   APPLE_ID                   Apple ID email used for notarytool
#   APPLE_TEAM_ID              10-char Apple team id
#   APPLE_APP_SPECIFIC_PASSWORD  app-specific password for APPLE_ID
#
# Runs two steps:
#   1. codesign with hardened runtime + entitlements
#   2. notarytool submit --wait + staple
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "usage: $0 <path-to-ShokiRunner.app>" >&2
    exit 2
fi

APP_PATH="$1"
if [[ ! -d "$APP_PATH" ]]; then
    echo "error: app bundle not found: $APP_PATH" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENTITLEMENTS="$HELPER_DIR/Sources/ShokiRunner/ShokiRunner.entitlements"

: "${APPLE_DEVELOPER_ID_APP:?APPLE_DEVELOPER_ID_APP must be set}"
: "${APPLE_ID:?APPLE_ID must be set}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID must be set}"
: "${APPLE_APP_SPECIFIC_PASSWORD:?APPLE_APP_SPECIFIC_PASSWORD must be set}"

echo "[sign] Codesigning $APP_PATH with $APPLE_DEVELOPER_ID_APP"
codesign --force \
    --options runtime \
    --entitlements "$ENTITLEMENTS" \
    --sign "$APPLE_DEVELOPER_ID_APP" \
    --timestamp \
    --deep \
    "$APP_PATH"

echo "[sign] Verifying signature"
codesign --verify --verbose=4 "$APP_PATH"
codesign -dvvv "$APP_PATH" 2>&1 | tee "$HELPER_DIR/.codesign.out"

echo "[notarize] Zipping bundle for notarytool"
ZIP_PATH="$HELPER_DIR/ShokiRunner.zip"
/usr/bin/ditto -c -k --keepParent "$APP_PATH" "$ZIP_PATH"

echo "[notarize] Submitting to notarytool (wait mode)"
xcrun notarytool submit "$ZIP_PATH" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" \
    --wait \
    --output-format json \
    | tee "$HELPER_DIR/.notarize-log.json"

STATUS=$(node -e "const d=require('$HELPER_DIR/.notarize-log.json'); console.log(d.status || 'unknown')")
if [[ "$STATUS" != "Accepted" ]]; then
    echo "error: notarization failed with status $STATUS" >&2
    exit 1
fi

echo "[notarize] Stapling"
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"

rm -f "$ZIP_PATH"
echo "[done] ShokiRunner.app signed + notarized + stapled at $APP_PATH"
