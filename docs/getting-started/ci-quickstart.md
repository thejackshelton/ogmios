# CI quickstart

Ogmios runs on four CI topologies. Pick the one that fits your budget and constraints, copy the reference workflow, point it at your repo.

## Pick a topology

| Topology | Cost | Speed | When to use |
|----------|------|-------|-------------|
| [Self-hosted tart](/guides/ci/tart-selfhosted) | Amortized ~$0 after hardware | Fastest (pre-baked image) | You own a Mac mini / Studio and run CI continuously. |
| [Cirrus Runners](/guides/ci/cirrus-runners) | ~$40/month flat | Fast (M4 Pro, tart-backed) | Recommended managed option. Zero self-hosting overhead. |
| [GetMac](/guides/ci/getmac) | Variable (plan-based, ~40% cheaper than GH-hosted) | Fast (M4 Mac minis) | You want a drop-in `runs-on` replacement without setup. |
| [GitHub-hosted `macos-latest`](/guides/ci/gh-hosted) | 10× Linux minute multiplier | Slow (cold boot each run) | Occasional CI. Don't use for heavy matrices. |

All four share a single reusable action — [`ogmios/setup-action`](https://github.com/thejackshelton/ogmios/tree/main/.github/actions/setup) — that auto-detects the topology and applies the right setup.

## Minimum viable workflow

Drop this into `.github/workflows/test-macos.yml`:

```yaml
name: Test on macOS

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    # Pick your topology:
    #   - self-hosted tart: [self-hosted, macOS, arm64, tart]
    #   - Cirrus Runners:   ghcr.io/cirruslabs/macos-sequoia-xcode:latest
    #   - GetMac:           [self-hosted, getmac]
    #   - GH-hosted:        macos-latest
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - uses: thejackshelton/ogmios-setup-action@v1

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install chromium

      - name: Run ogmios tests
        run: OGMIOS_INTEGRATION=1 pnpm test
```

## What `ogmios/setup-action` does

The composite action auto-detects your runner and applies the right setup:

- **Self-hosted tart** — no-op; the image is already baked with VO-AppleScript-enabled + TCC grants.
- **Cirrus Runners** — no-op; same tart image under the hood.
- **GetMac / GH-hosted** — runs `ogmios doctor --fix` to enable VO AppleScript, kills background announcement-emitting apps (Slack, Discord, Mail, Calendar), and verifies Accessibility grants.

See [CI-03 / CI-05 in the roadmap](https://github.com/thejackshelton/ogmios/blob/main/.planning/ROADMAP.md) for the full matrix of what gets set up where.

## Per-topology details

Each topology has its own page with:

- Exact `runs-on` value
- Cost profile and trade-offs
- Complete reference workflow (copy-paste ready)
- Known issues and workarounds

Pick one:

- [Self-hosted tart](/guides/ci/tart-selfhosted) — you own the hardware
- [Cirrus Runners](/guides/ci/cirrus-runners) — best managed option
- [GetMac](/guides/ci/getmac) — cheap, drop-in
- [GH-hosted macos-latest](/guides/ci/gh-hosted) — no third-party signup

## Troubleshooting CI

- **Tests pass locally, fail in CI** — almost always a missing TCC grant. Use the pre-baked tart image or make sure `ogmios/setup-action` ran.
- **Background apps announcing over the test** — ensure `kill-background-apps.sh` is in your workflow (it's bundled with `ogmios/setup-action`).
- **macOS 26 specifics** — CVE-2025-43530 tightened VO AppleScript. Your tart image needs to be at least `macos-vo-ready:tahoe-<2026-03>` for the entitlement to land.

For CI-specific pitfalls see [Troubleshooting](/guides/troubleshooting#ci-specific).
