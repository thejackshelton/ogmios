# GetMac

[GetMac](https://getmac.io/github-runners) is a drop-in managed macOS CI option — M4 Mac minis, plan-based pricing, roughly 40% cheaper per-minute than GitHub-hosted `macos-latest`.

Unlike [Cirrus Runners](./cirrus-runners), GetMac isn't tart-backed, so `ogmios/setup-action` does more work at job start (applies VO-AppleScript-enabled, kills background apps, etc.) rather than inheriting it from a pre-baked image.

## When to pick this

- You want managed macOS CI, and you want a cheaper per-minute rate than GH-hosted.
- You don't need tart specifically.
- You're comfortable with ~30 seconds of `ogmios/setup-action` overhead at job start.

## Cost profile

- Plan-based; see [getmac.io/github-runners](https://getmac.io/github-runners) for current tiers.
- Typically ~40% cheaper than GH-hosted macOS per minute of runtime.
- No self-hosting overhead.

## Reference workflow

```yaml
name: Test on macOS (GetMac)

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: [self-hosted, getmac]

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
        # GetMac is NOT pre-baked — setup-action does real work here:
        # enables VO AppleScript, kills background apps, runs ogmios setup.

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install chromium
      - run: OGMIOS_INTEGRATION=1 pnpm test
```

See the full reference at [`.github/workflows/examples/ogmios-getmac.yml`](https://github.com/thejackshelton/ogmios/blob/main/.github/workflows/examples/ogmios-getmac.yml).

## Setup (one time)

1. Sign up at [getmac.io](https://getmac.io/github-runners).
2. Install the GetMac GitHub App on your org/repo.
3. Register your GetMac-provided runners with the `self-hosted,getmac` label.
4. No tart or image pulls needed.

## What `ogmios/setup-action` does on GetMac

- Writes `SCREnableAppleScriptEnabled=true` to the VO plist.
- Kills background apps that announce (Slack, Discord, Mail, Calendar, system notifications).
- Runs `ogmios setup --json` and fails the job if the environment isn't ready.
- Installs pnpm + Node if not already present (rare; most GetMac images ship both).

The whole setup step is typically 20-40s. Compare to [self-hosted tart](./tart-selfhosted) where it's effectively zero.

## Known issues

- **TCC grants don't persist across runner resets** — GetMac may reset the runner filesystem between jobs. `ogmios/setup-action` re-applies grants each run, but this means you can't pre-warm them.
- **macOS 26 + CVE-2025-43530** — without a tart image's entitlement baking, macOS 26 on GetMac falls back to the AX-notifications capture path. Slower and less exhaustive than AppleScript but functional. See [Platform risk](/background/platform-risk).
- **Background apps come back after kill** — if a user account on the GetMac image auto-launches a background daemon, `kill-background-apps.sh` needs to run after every boot. `ogmios/setup-action` does this.

## When to pick a different topology

- **You want the absolute fastest** → [Cirrus Runners](./cirrus-runners) (tart-backed, pre-baked).
- **You own Mac hardware** → [Self-hosted tart](./tart-selfhosted).
- **You need fine-grained SIP control or custom image content** → [Self-hosted tart](./tart-selfhosted).
