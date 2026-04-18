#!/usr/bin/env bash
# Rebuilds the Plan 10-02 setup fixtures in-place.
#
# Produces:
#   - munadi-darwin-arm64.zip         (two tiny .app bundles, Info.plist CFBundleShortVersionString=0.1.0)
#   - munadi-darwin-arm64.zip.sha256  (`<hex>  munadi-darwin-arm64.zip` format)
#   - munadi-darwin-arm64.tampered.zip (same name, different contents → sha mismatch)
#   - Info.plist                     (standalone fixture for readInstalledAppVersion)
#
# Safe to re-run — it deletes the existing outputs first.
#
# ditto is macOS-native; on Linux the zip will still work but xattr preservation is skipped.
# The tests only care about zip-layout + sha256 + plist-XML regex, so Linux re-gen is OK too.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$HERE"

rm -rf _staging
rm -f munadi-darwin-arm64.zip munadi-darwin-arm64.zip.sha256 munadi-darwin-arm64.tampered.zip Info.plist

mkdir -p _staging/Munadi.app/Contents/MacOS
mkdir -p "_staging/Munadi Setup.app/Contents/MacOS"

# Tiny placeholder executables (empty files — enough for the tests).
: > _staging/Munadi.app/Contents/MacOS/Munadi
: > "_staging/Munadi Setup.app/Contents/MacOS/Munadi Setup"

INFO_PLIST_XML='<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>org.munadi.fixture</string>
  <key>CFBundleName</key>
  <string>Munadi Fixture</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>0.1.0</string>
</dict>
</plist>
'

printf "%s" "$INFO_PLIST_XML" > _staging/Munadi.app/Contents/Info.plist
printf "%s" "$INFO_PLIST_XML" > "_staging/Munadi Setup.app/Contents/Info.plist"
printf "%s" "$INFO_PLIST_XML" > Info.plist

# Zip both bundles at the top level of the archive.
# ditto with --keepParent accepts only one source, so we ditto the staging dir
# itself then `zip` from its extraction to get a multi-bundle archive. Easier:
# prefer `zip` universally — test code parses structure from the zip, not
# bundle-metadata details, so quarantine xattrs inside the fixture don't matter.
if command -v zip >/dev/null 2>&1; then
  (cd _staging && zip -q -r ../munadi-darwin-arm64.zip Munadi.app "Munadi Setup.app")
elif command -v ditto >/dev/null 2>&1; then
  # Fallback: archive the parent staging dir, which nests bundles one level deep.
  (cd _staging && ditto -c -k --sequesterRsrc . ../munadi-darwin-arm64.zip)
else
  echo "Need either zip or ditto to build fixtures." >&2
  exit 1
fi

# Tampered zip: repack the same bundles with an extra marker file so sha256 differs.
mkdir -p _staging/tampered
cp -R _staging/Munadi.app _staging/tampered/
cp -R "_staging/Munadi Setup.app" _staging/tampered/
echo "tampered" > _staging/tampered/MARKER.txt
if command -v zip >/dev/null 2>&1; then
  (cd _staging/tampered && zip -q -r ../../munadi-darwin-arm64.tampered.zip Munadi.app "Munadi Setup.app" MARKER.txt)
elif command -v ditto >/dev/null 2>&1; then
  (cd _staging/tampered && ditto -c -k --sequesterRsrc . ../../munadi-darwin-arm64.tampered.zip)
fi

# SHA256 sidecar: `<hex>  <basename>` + newline (shasum -a 256 format).
HEX=$(shasum -a 256 munadi-darwin-arm64.zip | awk '{print $1}')
printf "%s  munadi-darwin-arm64.zip\n" "$HEX" > munadi-darwin-arm64.zip.sha256

rm -rf _staging

echo "Fixtures built:"
ls -la munadi-darwin-arm64.zip munadi-darwin-arm64.zip.sha256 munadi-darwin-arm64.tampered.zip Info.plist
