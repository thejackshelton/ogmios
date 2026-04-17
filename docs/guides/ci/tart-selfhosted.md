# Self-hosted tart

The fastest and cheapest topology if you already own a Mac mini or Mac Studio. You run a [tart](https://tart.run/) VM on your hardware that boots from a pre-baked Shoki image with VoiceOver-AppleScript-enabled and TCC grants already applied.

## When to pick this

- You run CI continuously (merges and PRs all day).
- You own Apple Silicon hardware (Mac mini M2+ / Studio).
- You're willing to maintain a self-hosted GitHub Actions runner.

## Cost profile

- Hardware: one-time ~$600-2,000 (Mac mini M2 Pro up to Studio M2 Max).
- Electricity: ~$2-5/month for a dedicated always-on Mac mini.
- GitHub minutes: free (self-hosted runners don't consume GH minutes).

Amortized over a year, this is dramatically cheaper than any managed option if your volume is > ~10 PR runs / day.

## The pre-baked image

Shoki publishes a ready-to-use tart image at `ghcr.io/shoki/macos-vo-ready:<macos>`:

```bash
tart pull ghcr.io/shoki/macos-vo-ready:sonoma   # macOS 14
tart pull ghcr.io/shoki/macos-vo-ready:sequoia  # macOS 15
tart pull ghcr.io/shoki/macos-vo-ready:tahoe    # macOS 26 (includes post-CVE entitlements)
```

The image has:

- VoiceOver AppleScript control enabled (`SCREnableAppleScriptEnabled = true`).
- Accessibility + Automation TCC grants pre-applied for the default helper bundle.
- SIP disabled (required to pre-seed TCC.db).
- Background notification apps pre-killed on boot (Slack, Discord, Mail, etc.).
- `pnpm` and `playwright`'s Chromium pre-installed.

The full build pipeline lives in [`infra/tart/`](https://github.com/shoki/shoki/tree/main/infra/tart) — Packer + Ansible, reproducible.

## Reference workflow

Drop into `.github/workflows/test-macos.yml`:

```yaml
name: Test on macOS (self-hosted tart)

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: [self-hosted, macOS, arm64, tart]

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
        # On a tart runner this is a no-op (image is pre-baked),
        # but keeping it in the workflow makes the same file
        # portable to other topologies.

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install chromium
      - run: SHOKI_INTEGRATION=1 pnpm test
```

See the full reference at [`.github/workflows/examples/shoki-tart-selfhosted.yml`](https://github.com/shoki/shoki/blob/main/.github/workflows/examples/shoki-tart-selfhosted.yml).

## Runner setup (one time)

1. Install [tart](https://tart.run/quick-start/): `brew install cirruslabs/cli/tart`.
2. Install the GitHub Actions self-hosted runner on your Mac mini following GitHub's docs.
3. Label it with `self-hosted,macOS,arm64,tart`.
4. Pull the Shoki image: `tart pull ghcr.io/shoki/macos-vo-ready:sonoma`.
5. Configure your runner to clone the VM per-job (search the tart docs for "ephemeral runners").

One Mac mini can host multiple sequential jobs; tart's exclusive VM lock serializes them naturally.

## Known issues

- **Image too big for Time Machine backups** — the `@full` variant is 30-50 GB. Exclude `~/.tart/` from Time Machine.
- **Tart VM's network stops working after macOS host sleep** — disable sleep on the runner host (`sudo pmset -a sleep 0 disksleep 0`).
- **GHCR pull rate-limited on first fetch** — authenticate before the first job: `echo "$GHCR_TOKEN" | tart login ghcr.io -u <user> --password-stdin`.

## When NOT to pick this

- You don't own Mac hardware → [Cirrus Runners](./cirrus-runners) or [GetMac](./getmac).
- You can't maintain self-hosted infrastructure → any managed option.
- Your workload is episodic (a few PRs / week) → [GH-hosted](./gh-hosted) will be cheaper than hardware amortization.
