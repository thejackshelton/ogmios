# GitHub-hosted macos-latest

The stock GH-hosted `macos-latest` runners. Supported as a "it works with zero third-party signup" fallback. Slow and expensive, but zero setup overhead.

## When to pick this

- Your CI is low-frequency (a handful of runs per week).
- You can't use third-party runner services.
- You want the absolute minimum configuration footprint.

Don't pick this if you run macOS CI continuously — the cost will dominate.

## Cost profile

- GH-hosted macOS runners bill at **10× the Linux multiplier** on GitHub Actions.
- Free for public repos within the monthly quota, paid per-minute beyond.
- For private repos: meaningfully more expensive than any managed alternative.

See [GitHub Actions pricing](https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions) for current rates.

## Reference workflow

```yaml
name: Test on macOS (GH-hosted)

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
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

      - uses: shoki/setup-action@v1
        # On stock macos-latest the action does the full setup each run:
        # - sudo writes VO AppleScript plist
        # - kills background apps
        # - runs dicta doctor --fix
        # Expect ~30-60s of overhead per job.

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install chromium
      - run: SHOKI_INTEGRATION=1 pnpm test
```

See the full reference at [`.github/workflows/examples/shoki-github-hosted.yml`](https://github.com/shoki/shoki/blob/main/.github/workflows/examples/shoki-github-hosted.yml).

## What `shoki/setup-action` does on GH-hosted

- Detects the runner type (sees GH-provided env vars).
- Writes VO AppleScript plist (cold VM; always needed).
- Grants Accessibility + Automation TCC to the helper (via `tccutil` + SIP-off workarounds; see notes).
- Kills background announcement daemons.
- Runs `dicta doctor` and fails fast if anything didn't stick.

## Known issues

- **Cold VM every run** — there is no state between runs. Every setup step re-executes.
- **TCC grants via unsigned `tccutil` calls** — on GH-hosted runners, the TCC database can be written because SIP is off on the runner image. This is a GH Actions quirk; if GitHub ever tightens this, the GH-hosted path will require a pre-baked image (which GH doesn't support for third-party tools).
- **Runner image version drift** — GitHub changes the default `macos-latest` version (14 → 15 → 26) on its own schedule. Test against `macos-14`, `macos-15`, `macos-26` explicitly if you want stable behavior.
- **Background app flake** — the GH `macos-latest` image has a lot of preinstalled apps that auto-launch and announce. Our `kill-background-apps.sh` covers the known list but expect the occasional new offender.
- **macOS 26 + CVE-2025-43530** — on GH-hosted `macos-26`, VO-AppleScript requires an entitlement shoki cannot request from outside Apple's program. Shoki falls back to the AX-notifications capture path; captures continue to work but with reduced event fidelity. See [Platform risk](/background/platform-risk).

## When to pick a different topology

- **Any real volume** → [Cirrus Runners](./cirrus-runners) or [Self-hosted tart](./tart-selfhosted).
- **Cost matters** → [GetMac](./getmac) for ~40% savings.
- **Flake matters** → persistent topologies have dramatically less variance.

## The honest pitch

GH-hosted is the "works with zero thinking" fallback. Start here if you're evaluating Shoki. Migrate to a managed or self-hosted topology before you ship.
