# Shoki VO-ready tart images

Reference pre-baked macOS images for shoki CI. Published as:

- `ghcr.io/shoki/macos-vo-ready:sonoma` — macOS 14, slim (<15 GB)
- `ghcr.io/shoki/macos-vo-ready:sequoia` — macOS 15, slim
- `ghcr.io/shoki/macos-vo-ready:tahoe` — macOS 26, slim (when base image ships)
- `ghcr.io/shoki/macos-vo-ready:<ver>@full` — same + Xcode + iOS simulators (~50 GB); opt-in

Each image includes:

- VoiceOver AppleScript enabled (`SCREnableAppleScript=1`)
- Accessibility + Automation TCC grants pre-applied to `org.shoki.runner`
- Node 24 + pnpm 10 + Playwright browsers
- Spotlight / Time Machine / software updates disabled
- Background announcement emitters (Slack/Discord/Teams/Mail/Calendar/Notes/Messages/Music/Spotify) quit and removed from login items

This directory holds the Packer + Ansible pipeline that produces these images.
Covers REQUIREMENTS.md CI-01 and CI-02.

## Why this exists

Shoki tests need a macOS environment where VoiceOver can be driven from
AppleScript AND the process driving it (the shoki helper bundle) has the
right TCC grants AND no background apps are emitting announcements that
leak into captures.

On a fresh macOS CI runner none of these things are true. `shoki doctor`
will refuse to run. These pre-baked images make that whole bootstrapping
step a no-op: consumers pull the image, run their tests, done.

## Layout

```
infra/tart/
├── packer/
│   ├── sonoma.pkr.hcl         # macOS 14 template
│   ├── sequoia.pkr.hcl        # macOS 15 template
│   └── tahoe.pkr.hcl          # macOS 26 template
├── ansible/
│   ├── playbook.yml           # all provisioning steps
│   └── vars.yml               # bundle IDs, toolchain versions
├── scripts/
│   └── tcc-grant.sh           # tccutil-style TCC.db insertion
└── README.md                  # this file
```

The corresponding publish workflow lives at
[`../../.github/workflows/tart-publish.yml`](../../.github/workflows/tart-publish.yml).

## Building locally

You need:

- Apple Silicon Mac
- [tart](https://tart.run) 2.x: `brew install cirruslabs/cli/tart`
- [packer](https://developer.hashicorp.com/packer) 1.10+
- Ansible 2.15+: `brew install ansible`

First run only:

```bash
cd infra/tart
packer init packer/sonoma.pkr.hcl
```

Build the slim image:

```bash
packer build packer/sonoma.pkr.hcl
# ~45 min. Produces a local tart VM named `shoki-vo-ready-sonoma`.
```

Build the `@full` variant (Xcode + simulators preserved):

```bash
packer build -var 'full_image=true' -var 'output_name=shoki-vo-ready-sonoma-full' packer/sonoma.pkr.hcl
```

Test the image locally before publishing:

```bash
tart run shoki-vo-ready-sonoma --no-graphics
# In another terminal:
ssh admin@$(tart ip shoki-vo-ready-sonoma)
# Password: admin
# Run smoke test:
shoki doctor --json --quiet
```

## Publishing

Tag-driven from the `infra/tart/**` path:

```bash
git tag tart-v1.0.0
git push origin tart-v1.0.0
```

Triggers `.github/workflows/tart-publish.yml`. Each macOS version publishes
as a separate job in parallel. See that workflow for details and required
secrets (`GHCR_TOKEN` + signing secrets from Phase 1).

## Slim vs `@full`

**Slim (default):** target <15 GB. Strips Xcode, iOS simulators, most
developer caches. Boots fast, pulls fast. The right image for 99% of
shoki use cases — driving VoiceOver in a web app via Playwright +
Vitest.

**`@full`:** retains Xcode 16+, iOS simulators, additional dev tools.
~50 GB. For users who want shoki to eventually drive iOS VoiceOver via
XCUITest (deferred to v2+; see `REQUIREMENTS.md` SR2-01 / PLAT-03). The
image is published but not exercised by the shoki test matrix today.

Opt in via image tag: `ghcr.io/shoki/macos-vo-ready:sonoma@full`.

## Why Packer + Ansible (not a shell script)

- **Reproducibility:** idempotent Ansible tasks mean re-baking produces
  the same image, minus timestamp deltas. Shell scripts drift.
- **Debuggability:** `--extra-vars start_at_task=...` lets us re-run a
  single failing task without rebuilding from scratch.
- **Community patterns:** cirruslabs publishes their own base images with
  Packer + Ansible; we inherit conventions.

## Known sharp edges

1. **TCC schema drift.** The TCC.db schema has changed across macOS
   versions. `scripts/tcc-grant.sh` probes columns and builds a
   compatible INSERT, but new macOS majors may add columns that make
   the grant row non-functional. Symptom: `shoki doctor` reports
   "Accessibility denied" on a fresh-baked image. Fix: check
   `sqlite3 TCC.db "PRAGMA table_info(access)"` and extend the script.

2. **Base image lag.** `ghcr.io/cirruslabs/macos-tahoe-xcode:latest`
   may not exist until cirruslabs publishes it. Until then, drop
   tahoe from the publish matrix or use a staging tag.

3. **SIP off inside the VM.** The image-bake toggle does not propagate
   anywhere. Users' host Macs are untouched. This is the whole point —
   we get a TCC-friendly environment without asking users to disable
   SIP.

4. **Image size creep.** Each macOS point release grows the base image.
   If the slim target slips above 15 GB, audit what the base image
   added (typically new Xcode toolchains or frameworks) and prune in
   the post-Ansible shell provisioner.

## Testing a published image

```bash
tart pull ghcr.io/shoki/macos-vo-ready:sonoma
tart run shoki-vo-ready-sonoma --no-graphics &
IP=$(tart ip shoki-vo-ready-sonoma)
ssh -o StrictHostKeyChecking=no admin@$IP 'shoki doctor --json --quiet'
```

If that returns `exit 0`, the image is healthy.
