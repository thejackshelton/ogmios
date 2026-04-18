#!/usr/bin/env bash
# Package OgmiosRunner.app + OgmiosSetup.app into a single release zip + SHA256.
#
# Usage: ./scripts/package-app-zip.sh --arch <arm64|x64> [--out-dir <path>]
#
# Reads (must already exist):
#   helper/.build/OgmiosRunner.app
#   helper/.build/OgmiosSetup.app
#
# Writes (under --out-dir, default helper/.build/):
#   ogmios-darwin-<arch>.zip          (contains OgmiosRunner.app/ + OgmiosSetup.app/ at root)
#   ogmios-darwin-<arch>.zip.sha256   (format: "<64-hex>  ogmios-darwin-<arch>.zip\n")
#
# Phase 10 Plan 03: this is the producer side of the `ogmios setup` download flow
# (Plan 10-02 parses the SHA256 file with that exact "<64-hex>  <basename>\n"
# format). The bundles match the user-visible names from 11-CONTEXT.md — two
# separate apps (OgmiosRunner.app + OgmiosSetup.app). Bundle identifiers
# (org.ogmios.runner / org.ogmios.setup) follow the same scheme so TCC
# grants are fresh under the new Ogmios trust anchor.
#
# Uses `ditto -c -k` on a staging dir — macOS-native zip that preserves bundle
# metadata (resource forks, xattrs), so the extracted .apps launch cleanly
# without Gatekeeper complaining about a broken bundle structure. See the
# note near the ditto invocation below for why the staging-dir shape is used
# instead of a multi-source `--keepParent` invocation.

set -euo pipefail

ARCH=""
OUT_DIR=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --arch)
            ARCH="$2"
            shift 2
            ;;
        --out-dir)
            OUT_DIR="$2"
            shift 2
            ;;
        -h|--help)
            echo "usage: $0 --arch <arm64|x64> [--out-dir <path>]"
            exit 0
            ;;
        *)
            echo "Unknown arg: $1" >&2
            exit 2
            ;;
    esac
done

case "$ARCH" in
    arm64|x64) ;;
    "")
        echo "error: --arch <arm64|x64> is required" >&2
        exit 2
        ;;
    *)
        echo "error: --arch must be arm64 or x64 (got: $ARCH)" >&2
        exit 2
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ -z "$OUT_DIR" ]]; then
    OUT_DIR="$HELPER_DIR/.build"
fi
mkdir -p "$OUT_DIR"

RUNNER_SRC="$HELPER_DIR/.build/OgmiosRunner.app"
SETUP_SRC="$HELPER_DIR/.build/OgmiosSetup.app"

for d in "$RUNNER_SRC" "$SETUP_SRC"; do
    if [[ ! -d "$d" ]]; then
        echo "error: required bundle missing: $d" >&2
        echo "       Run ./scripts/build-app-bundle.sh first." >&2
        exit 1
    fi
done

ZIP_NAME="ogmios-darwin-${ARCH}.zip"
SHA_NAME="${ZIP_NAME}.sha256"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"
SHA_PATH="$OUT_DIR/$SHA_NAME"

# Stage bundles in a temp dir; never mutate the build outputs so a
# subsequent `package-app-zip.sh --arch <other>` run (or a re-run of the same
# arch) sees the canonical OgmiosRunner.app / OgmiosSetup.app names.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "[package-app-zip] Staging bundles in $STAGE"
ditto "$RUNNER_SRC" "$STAGE/OgmiosRunner.app"
ditto "$SETUP_SRC"  "$STAGE/OgmiosSetup.app"

echo "[package-app-zip] Creating $ZIP_NAME"
# ditto -c -k accepts exactly one source. Archiving the STAGE dir (without
# --keepParent) places its immediate children — OgmiosRunner.app/ and
# OgmiosSetup.app/ — at the zip root, which is what Plan 10-02's extractor
# relies on (see packages/sdk/src/cli/setup-install.ts: it looks for
# <installDir>/OgmiosRunner.app and <installDir>/OgmiosSetup.app after extraction).
#
# Note: the original plan text suggested `ditto -c -k --keepParent A.app B.app <zip>`,
# but ditto's -c form rejects multiple sources ("Can't archive multiple
# sources"). Staging into one dir + archiving that dir is the supported
# shape; it also preserves resource forks, xattrs, and quarantine handling
# via ditto's native extensions — the reason we use ditto instead of zip(1).
rm -f "$ZIP_PATH"
(cd "$STAGE" && ditto -c -k . "$ZIP_PATH")

echo "[package-app-zip] Computing SHA256"
# Format: "<64-hex>  <basename>\n" — the two-space separator is what
# Plan 10-02's setup-download parser expects (packages/sdk/src/cli/setup-download.ts).
SHA_HEX="$(shasum -a 256 "$ZIP_PATH" | awk '{print $1}')"
printf '%s  %s\n' "$SHA_HEX" "$ZIP_NAME" > "$SHA_PATH"

echo "[package-app-zip] Done:"
echo "  zip:    $ZIP_PATH"
echo "  sha256: $SHA_PATH ($SHA_HEX)"
ls -la "$ZIP_PATH" "$SHA_PATH"
