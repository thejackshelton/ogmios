# Phase 6: Docs & v1 Release Polish - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Public documentation site (takes a new user from `npm install` to a passing CI test), platform-risk disclosure page, matchers usage guide, Guidepup migration guide, and v1 release polish.

Out of scope: any code changes beyond trivial doc-linked fixes, post-v1 HARD-* / SR2-* requirements.

</domain>

<decisions>
## Implementation Decisions

### Docs site stack
- **VitePress** — lightweight, Markdown-first, ships a clean default theme, trivial to deploy. Alternatives (Docusaurus, Nextra, Astro Starlight) are all viable; VitePress wins on footprint + configuration simplicity.
- Docs live in `docs/` at the monorepo root (`docs/.vitepress/config.ts`, `docs/index.md`, etc.). Reuse the existing `docs/architecture.md`, `docs/adding-a-driver.md`, `docs/release-setup.md` — move them into VitePress structure without rewriting content.
- Deploy to GitHub Pages via a workflow at `.github/workflows/docs.yml` on push to `main` that touches `docs/**`.

### Site structure (nav)
```
Getting Started
├── Install
├── Permission setup (shoki doctor)
├── Vitest quickstart
└── CI quickstart

Guides
├── Matchers — semantic assertions
├── Migration from Guidepup
├── Running in CI (per-provider pages)
│   ├── Self-hosted tart
│   ├── Cirrus Runners
│   ├── GetMac
│   └── GH-hosted macos-latest
└── Troubleshooting

API
├── @shoki/sdk — voiceOver(), ScreenReaderHandle
├── @shoki/matchers — 4 matchers
├── @shoki/vitest — plugin + browser API
└── shoki (CLI) — doctor, info, exit codes

Background
├── Architecture
├── Platform risk (CVE-2025-43530)
├── Adding a screen reader driver
└── Release setup (maintainer)
```

### Platform Risk Page (DOCS-02)
- Lives at `docs/platform-risk.md`
- Sections:
  1. What shoki depends on (VoiceOver AppleScript + AX notifications)
  2. CVE-2025-43530 — Apple tightened VO AppleScript access on macOS 26.2
  3. Our hedge: AX-notifications parallel capture path (Phase 3)
  4. Long-term trajectory: Apple's direction of travel; what happens if AppleScript surface closes entirely
  5. Our commitment to users: we will always disclose platform-level limits and publish workarounds first
- Linked from README and from the getting-started install page

### Matchers Usage Page (DOCS-03)
- At least three runnable examples:
  1. Button click → `toHaveAnnounced({ role: 'button', name: 'Submit' })`
  2. Form error announcement → `toHaveAnnouncedText(/email is required/i)`
  3. Silent state → `toHaveNoAnnouncement()` after a decorative animation
  4. (bonus) Waiting for announcement stability → `await expect(log).toHaveStableLog({ quietMs: 500 })`
- Each example is a complete Vitest file that runs against `examples/vitest-browser-react`

### Migration from Guidepup (DOCS-04)
- Two-column side-by-side code example (Guidepup → shoki) for:
  - Boot VO
  - Capture phrases
  - Navigation (shoki is observe-only; point this out; direct users to drive via their framework)
  - Assertion (Guidepup's `string[]` vs shoki's structured events)
- API-map table: for each common Guidepup call, shoki's equivalent (or "out of scope — drive via your framework")
- Explicit positioning: "shoki is observe-only by design; use Guidepup if you need to drive VO navigation"

### Troubleshooting Page
- Format: error symptom → likely cause → fix
- Entries:
  - `AXError -25204` ("cannot observe announcements") → Accessibility TCC grant missing for helper; run `shoki doctor`
  - Ghost VO process still announcing after test suite → hit the emergency `pkill -9 VoiceOver` one-liner
  - "Announcements drop during rapid UI updates" → increase `logBufferSize` in `voiceOver.start()`
  - `shoki doctor` exit codes 0-9 documented with common remediations
  - "Tests pass locally but fail in CI" → background-app interference; verify `shoki/setup-action` ran

### CI Per-Provider Pages
- Each of the 4 CI topologies (tart, Cirrus, GetMac, GH-hosted) gets its own page
- Content: when to pick, cost profile, config snippet (copied from `.github/workflows/examples/`), known issues
- Cross-linked from the Vitest quickstart and from the release-setup guide

### v1 Release Polish
- **Shields.io badges in README**: CI status, npm version, license, platform
- **CHANGELOG.md** — Keep-a-Changelog format, start with v0.1 entries per phase
- **Issue templates**: `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml`, `permission-issue.yml`
- **PR template**: `.github/PULL_REQUEST_TEMPLATE.md`
- **Code of Conduct**: `.github/CODE_OF_CONDUCT.md` — Contributor Covenant 2.1
- **Security policy**: `.github/SECURITY.md` — where to report vulns

### Deployment
- Docs auto-build on push to main (`.github/workflows/docs.yml`)
- Deploy to `gh-pages` branch OR `shoki.dev` domain if configured
- Preview deploys for PRs (optional — use Netlify or Cloudflare Pages if simpler than GH Pages preview)

### Claude's Discretion
- VitePress theme customization (logo, colors) — pick tasteful defaults
- Example Vitest snippets — real code, runnable against the Phase 4 example repo
- Whether to generate API docs from TS sources (TypeDoc) or write by hand — hand-written is fine for v1, TypeDoc can come later

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docs/architecture.md` (Phase 1) — move to VitePress structure
- `docs/adding-a-driver.md` (Phase 1) — move to VitePress
- `docs/release-setup.md` (Phase 1+5) — move to VitePress
- `README.md` — extract overview into `docs/index.md`
- `CONTRIBUTING.md` — link from the site
- `examples/vitest-browser-react` (Phase 4) — the thing every quickstart points at

### Established Patterns
- Monorepo with pnpm workspaces
- All packages have their own READMEs at `packages/<name>/README.md` — these get linked from docs

### Integration Points
- Docs build is a separate workspace step; doesn't affect npm publish
- `@shoki/doctor` exit codes (Phase 2) — the docs troubleshooting page references these
- Platform-risk page is the single source of truth linked from install + CI docs

</code_context>

<specifics>
## Specific Ideas

- Keep every "getting started" guide executable in under 5 minutes — install → doctor → run one test
- Migration guide from Guidepup should convince, not defend — lead with what's better, acknowledge what's intentionally different
- Platform risk page should feel like a trust-building artifact — honesty about limits builds credibility

</specifics>

<deferred>
## Deferred Ideas

- Full API docs via TypeDoc — v1.1
- Interactive playground (WebContainers/StackBlitz embed) — v1.1
- Video walkthroughs — v1.1
- i18n — v2+
- Blog / changelog with detailed posts — v1.1

</deferred>
