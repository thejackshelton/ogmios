# Cirrus Runners

[Cirrus Runners](https://cirrus-runners.app/) is the recommended managed macOS CI option. It's built by the same team as [tart](https://tart.run/) and uses tart under the hood, so it reuses the exact same pre-baked Shoki image as the self-hosted path — zero per-provider drift.

## When to pick this

- You want managed macOS CI with zero self-hosting.
- Your monthly volume fits within a flat-rate plan (~$40/month for unlimited minutes at the time of writing).
- You want the same tart-backed performance you'd get self-hosted without the hardware.

## Cost profile

- Flat monthly plans; no per-minute billing (as of 2026-Q2).
- Check [cirrus-runners.app](https://cirrus-runners.app/) for current pricing.
- Typically ~3-10× cheaper than GH-hosted `macos-latest` at meaningful volume.

## Reference workflow

```yaml
name: Test on macOS (Cirrus Runners)

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    # Cirrus Runners advertises tart-backed macOS images.
    # Replace with the label/image string your plan provides.
    runs-on: ghcr.io/cirruslabs/macos-sequoia-xcode:latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm

      - uses: shoki/setup-action@v1

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install chromium
      - run: SHOKI_INTEGRATION=1 pnpm test
```

See the full reference at [`.github/workflows/examples/shoki-cirrus-runners.yml`](https://github.com/shoki/shoki/blob/main/.github/workflows/examples/shoki-cirrus-runners.yml).

## Setup (one time)

1. Sign up at [cirrus-runners.app](https://cirrus-runners.app/).
2. Install the Cirrus Runners GitHub App on your org/repo.
3. In your `runs-on:`, use the Cirrus-provided image identifier (they document the exact string).
4. No secrets required; billing happens in Cirrus, not via GH.

## Why Cirrus for Shoki

- **Same tart image lineage** — Cirrus builds the base macOS images Shoki's pre-baked image extends. There's no version skew risk.
- **M4 Pro hardware** — faster than any GH-hosted option.
- **No warm-start cost** — tart clones are fast; cold-boot to `npm install` is usually < 60s.
- **Serializes VO cleanly** — exclusive VM per job matches VoiceOver's singleton lifecycle.

## Known issues

- **Image availability lag** — a newly-released macOS version (e.g. Tahoe on day 1) may not be available on Cirrus until cirruslabs publishes the base image. Workaround: pin to the previous version for a few weeks.
- **Post-CVE entitlement** — for macOS 26 you need a Shoki image with the post-CVE-2025-43530 entitlement. The Cirrus flow layers this on top of the cirruslabs base; make sure you're pointing at a recent Shoki tag.

## When to pick a different topology

- **You already own hardware** → [Self-hosted tart](./tart-selfhosted) saves money.
- **You're price-sensitive at moderate volume** → compare with [GetMac](./getmac).
- **You run macOS CI once a week** → [GH-hosted](./gh-hosted) is fine and has no monthly minimum.
