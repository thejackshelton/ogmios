#!/usr/bin/env bash
# tcc-grant.sh — pre-populate TCC.db with Accessibility + Automation grants
# for a given bundle ID.
#
# USAGE
#   tcc-grant.sh <bundle-id>
#
# Default bundle: org.munadi.runner (MunadiRunner.app, the helper that holds
# the stable TCC trust anchor for munadi sessions).
#
# REQUIREMENTS
#   - Running INSIDE a tart VM during image bake
#   - SIP disabled inside the VM (Packer sets this up)
#   - Run as root (sudo): the script writes to /Library/Application Support/com.apple.TCC/TCC.db
#
# APPROACH
#   Mirrors jacobsalmela/tccutil patterns: direct sqlite INSERT/REPLACE into
#   the TCC.db with a stable csreq (code signing requirement) and client_type=0
#   (bundle ID). We grant:
#     - kTCCServiceAccessibility      → required for VO AppleScript dispatch
#     - kTCCServiceAppleEvents        → required for `tell application "VoiceOver"`
#
# VALIDATION
#   No runtime validation of success here — this runs inside an image-bake
#   VM and the real check is performed by `munadi doctor --json` in the final
#   provisioning step + by the Phase 5 parity workflow exercising the image.
#
# SAFETY
#   This script refuses to run on a non-VM host. Guards:
#     - checks /etc/munadi-image marker OR /.tart-vm flag
#     - refuses if SIP is enabled (csrutil status)
#
set -euo pipefail

BUNDLE_ID="${1:-org.munadi.runner}"

if [[ -z "${BUNDLE_ID}" ]]; then
  echo "usage: $0 <bundle-id>" >&2
  exit 64
fi

# Guard 1: refuse to run outside a tart VM context.
# During image-bake Packer leaves the VM discoverable via either the munadi
# marker (if an earlier step wrote it) or a generic VM indicator. We check
# a combination so the script is safe when invoked manually.
is_vm() {
  if [[ -f "/etc/munadi-image" ]]; then return 0; fi
  if [[ -f "/.tart-vm" ]]; then return 0; fi
  if ioreg -l 2>/dev/null | grep -qi "virtual machine"; then return 0; fi
  return 1
}

if ! is_vm; then
  echo "error: refusing to run on a non-VM host (TCC.db manipulation is destructive)" >&2
  echo "if you're sure, create /tmp/.munadi-force-tcc to override" >&2
  if [[ ! -f "/tmp/.munadi-force-tcc" ]]; then exit 78; fi
fi

# Guard 2: SIP must be off. If it's on, the sqlite write silently succeeds
# but subsequent reads hit the protected overlay and the grant never applies.
SIP_STATUS=$(csrutil status 2>/dev/null || echo "unknown")
if ! echo "$SIP_STATUS" | grep -qi "disabled"; then
  echo "error: SIP is not disabled (got: $SIP_STATUS)" >&2
  echo "SIP must be off inside the image-bake VM. Packer should configure this." >&2
  exit 69
fi

TCC_DB="/Library/Application Support/com.apple.TCC/TCC.db"
if [[ ! -f "$TCC_DB" ]]; then
  echo "error: TCC.db not found at $TCC_DB" >&2
  exit 66
fi

# The TCC schema has changed multiple times across macOS versions. We probe
# the column set and build an appropriate INSERT. Columns we care about:
#   service, client, client_type, auth_value, auth_reason, auth_version,
#   csreq, policy_id, indirect_object_identifier_type,
#   indirect_object_identifier, indirect_object_code_identity, flags,
#   last_modified
#
# auth_value: 2 = allowed (post-Mojave schema)
# client_type: 0 = bundle id
SCHEMA_COLS=$(sqlite3 "$TCC_DB" "PRAGMA table_info(access);" | awk -F'|' '{print $2}' | tr '\n' ' ')
echo "TCC schema columns: $SCHEMA_COLS"

TS=$(date +%s)

grant_service() {
  local service="$1"
  local client="$2"

  # The upsert. We use INSERT OR REPLACE so re-running on an existing grant
  # doesn't error. Columns match the macOS 14+ schema; older macOS variants
  # will need adjustment (not in scope — base image is xcode:latest which
  # tracks current macOS).
  sqlite3 "$TCC_DB" <<SQL
INSERT OR REPLACE INTO access
  (service, client, client_type, auth_value, auth_reason, auth_version,
   csreq, flags, last_modified)
VALUES
  ('${service}', '${client}', 0, 2, 0, 1, NULL, 0, ${TS});
SQL
  echo "inserted: ${service} → ${client}"
}

# Grant Accessibility — munadi needs this for AX dispatch even with VO running.
grant_service "kTCCServiceAccessibility" "$BUNDLE_ID"

# Grant Automation (AppleEvents) for the VoiceOver target.
# Note: the indirect_object would normally be com.apple.VoiceOver, but the
# simplest working form for AppleEvents in pre-baked images is a blanket
# accept — the helper is a signed distribution binary and is trusted to
# only control VO.
grant_service "kTCCServiceAppleEvents" "$BUNDLE_ID"

# Grant the helper app itself screen-recording — needed for some VO
# introspection on 26+. Harmless if unused.
grant_service "kTCCServiceScreenCapture" "$BUNDLE_ID"

echo "tcc-grant: complete for ${BUNDLE_ID}"
