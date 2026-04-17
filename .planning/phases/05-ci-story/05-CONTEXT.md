# Phase 5: CI Story - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the CI story: pre-baked tart macOS image (VO-ready, TCC grants pre-applied), `shoki/setup-action` GitHub Action that works across 4 topologies, reference workflows, and background-app kill hooks.

Out of scope: Phase 6 docs polish.

</domain>

<decisions>
## Implementation Decisions

### Tart Image — Packer + Ansible pipeline
- Live in `infra/tart/` in the monorepo
- Packer builder: `cirruslabs/packer-plugin-tart`, base image `ghcr.io/cirruslabs/macos-sonoma-xcode:latest` (and `macos-sequoia-xcode`, `macos-tahoe-xcode` when available)
- Ansible playbook configures:
  1. Enable VO AppleScript (`defaults write com.apple.VoiceOver4/default SCREnableAppleScript -bool YES`)
  2. Pre-grant Accessibility TCC to a placeholder ShokiRunner.app bundle ID (`org.shoki.runner`) — inserted via `tccutil` scripts inside the VM (SIP off in image-bake time only)
  3. Pre-grant Automation TCC for the same bundle ID to control VoiceOver
  4. Install Node 24 + pnpm 10
  5. Install Playwright browsers
  6. Disable Spotlight indexing, Time Machine, software updates (reduces flakes)
  7. Kill all announcement-emitting background apps (Slack/Discord/Teams/Mail/Calendar, notification center daemons)
- SIP toggled OFF inside the VM at image-bake time only. Users' host Macs never have SIP disabled. This is the whole point of the VM approach.
- Published to `ghcr.io/shoki/macos-vo-ready:sonoma`, `:sequoia`, `:tahoe` via the release pipeline

### Image Size Budget
- Target: <15 GB slim image (no Xcode layered in)
- `@full` tag: Xcode + iOS simulators (~50 GB) for users who need native iOS driver testing later
- Slim image is the default; `@full` is opt-in via a docs note

### `shoki/setup-action` GitHub Action
- Lives in `.github/actions/setup/action.yml` (composite action)
- Inputs: `topology` (one of `tart`, `cirrus`, `getmac`, `github-hosted`), `macos-version` (default `sonoma`), `helper-path` (default auto-detect)
- Detects the runner environment (env vars `CIRRUS_CI`, `GETMAC`, `GITHUB_ACTIONS`, `SHOKI_TART`) and picks the right setup path
- Per-topology steps:
  - `tart`: pulls the reference image (if not already present), `tart run` it, exposes SSH
  - `cirrus`: Cirrus Runners already use tart; this is the zero-config path — just run `shoki doctor` to verify
  - `getmac`: kills background apps, runs `shoki doctor`, no VM
  - `github-hosted`: same as getmac but also applies the TCC grant script (requires running inside `macos-latest` which has slightly different setup)
- Post-action: kills background apps again (defensive)

### Reference Workflows (CI-04)
- `.github/workflows/examples/` directory with 4 reference files:
  - `shoki-tart-selfhosted.yml` — self-hosted mac mini running tart; uses `shoki/setup-action` with `topology: tart`
  - `shoki-cirrus-runners.yml` — Cirrus Runners cloud; zero-config
  - `shoki-getmac.yml` — GetMac's managed service
  - `shoki-github-hosted.yml` — stock `macos-latest`; documents cost + perf caveats
- Each references the `examples/vitest-browser-react` as the thing being tested (via a git submodule OR a checkout step)
- README per file explains the tradeoffs

### Pre/Post-Job Kill Hooks (CI-05)
- Script `.github/actions/setup/kill-background-apps.sh`:
  ```bash
  APPS="Slack Discord Teams Microsoft\\ Teams Mail Calendar Reminders Notes Messages Spotify Music"
  for app in $APPS; do
    osascript -e "tell application \"$app\" to quit" 2>/dev/null || true
    pkill -f "$app" 2>/dev/null || true
  done
  # Disable Notification Center announcements
  launchctl unload -w /System/Library/LaunchAgents/com.apple.notificationcenterui.plist 2>/dev/null || true
  ```
- Run before AND after shoki tests; CI-05 requires both hooks

### Integration verification (CI-06)
- A workflow in `.github/workflows/` — `phase-5-parity.yml` — runs `examples/vitest-browser-react` on all 4 topologies as a matrix job
- All 4 must pass for the release pipeline to proceed
- This is the gate that closes Phase 5's SC-4 (parity across environments)

### Secrets for the image build pipeline
- `GHCR_TOKEN` — for publishing to `ghcr.io/shoki`
- `TART_REGISTRY_LOGIN` / `TART_REGISTRY_PASSWORD` — alt for raw tart OCI if used
- Apple Dev ID signing secrets (reuse Phase 1 Plan 05 secrets)

### Fall-back paths
- If a user can't use tart (enterprise policy forbids Fair Source), the `getmac` + `github-hosted` paths are fully supported. Document this.
- If `ghcr.io` is blocked, publish tart images as GitHub Release artifacts (signed, reproducible).

### Claude's Discretion
- Exact Ansible task shapes — follow cirruslabs/macos-image-templates structure
- Precise TCC insertion mechanism — use established `jacobsalmela/tccutil` patterns
- Image size optimization tactics — heuristic, not prescriptive

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `.github/actions/build-zig-binding/action.yml` + `.github/actions/build-helper-app/action.yml` (Phase 1) — patterns to follow
- `.github/workflows/ci.yml` + `.github/workflows/release.yml` (Phase 1) — extend these with `shoki/setup-action` usage
- `@shoki/doctor` (Phase 2) — `shoki doctor --json --quiet` used in every CI workflow as the health gate
- `examples/vitest-browser-react` (Phase 4) — the thing being proved correct on all topologies

### Integration Points
- Every CI workflow should: checkout → setup-action → pnpm install → build helper + zig binding → run tests → kill-background-apps post-job
- `shoki/setup-action` wraps the above, parameterized by topology

</code_context>

<specifics>
## Specific Ideas

- Document Cirrus Runners as the "recommended managed option" — they're tart-powered and the cheapest path
- GetMac positioning: "drop-in replacement for GH-hosted macOS with ~40% cost savings"
- Self-hosted tart: "best for heavy use; one Mac mini runs many parallel sessions"
- GH-hosted `macos-latest`: "works but expensive; use for occasional CI only"

</specifics>

<deferred>
## Deferred Ideas

- Multiple concurrent tart VMs per host (requires licensing work) — v2+
- Anka / UTM / QEMU as alternative VMs — tart covers 99% of needs
- Linux CI for shoki (needed for NVDA / Orca) — phase 6+ / v1.1+
- Windows CI — v2+ with NVDA driver

</deferred>
