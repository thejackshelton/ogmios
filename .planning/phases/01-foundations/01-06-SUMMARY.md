---
phase: 01-foundations
plan: 06
status: completed
date: 2026-04-17
---

# Plan 01-06 Summary: Docs & PROJECT.md Decision Record

**Status:** completed
**Requirements satisfied:** FOUND-04 (signed-wrapper-app decision documented)

## What Shipped

- `README.md` — project vision, status, architecture diagram, phase roadmap, MIT license reference
- `CONTRIBUTING.md` — dev setup (Node 24, pnpm 10, Zig 0.16, Xcode CLT), repo layout, workflow, driver-adding pointer, code of conduct
- `LICENSE` — MIT
- `docs/architecture.md` — full load-bearing decision record: three-layer process model, why Zig not Rust, the signed-wrapper-app decision with rationale + rejected alternatives, wire format spec, driver extensibility, platform risk (CVE-2025-43530)
- `docs/adding-a-driver.md` — step-by-step walkthrough for adding a new screen reader (Zig vtable impl, registry entry, binding package, TS factory, tests, docs, checklist)
- `.planning/PROJECT.md` — added Key Decision entry for the signed-wrapper-app architecture, marked ✓ Good (implemented in Phase 1)

## Must-Haves Verification

1. **Signed-wrapper-app decision is documented in PROJECT.md** — Key Decisions table now includes the signed `ShokiRunner.app` entry with rationale.
2. **Architecture doc covers the three-layer model** — `docs/architecture.md` has a component diagram and a full decision-record section.
3. **Driver extensibility is documented** — `docs/adding-a-driver.md` walks through the exact files that need editing (spoiler: the list is tiny — that's the EXT-01 value).
4. **Platform risk disclosed** — CVE-2025-43530 and the AX-notifications fallback plan are in `docs/architecture.md` under Platform risk.
5. **License + contribution guide exist** — MIT, pnpm setup, test commands all in place.

## Deviations

1. **Plan 06 written directly by orchestrator** — Plan 05 executor had timed out; to avoid another timeout I wrote the Plan 06 docs inline. Content honors every acceptance criterion in the plan file.
2. **`docs/drivers/` subdirectory not pre-created** — `adding-a-driver.md` references `docs/drivers/<name>.md` as the destination for per-driver pages. We'll create the directory when the first real driver (VoiceOver in Phase 3) ships its doc.

## Commits

- (Combined with CI commit — see `cc45f88` for Plan 05 + combined commit for Plan 06)

## Notes for Downstream

- **README "status" badge** — currently text. When we ship v1 we should replace with shields.io badges for CI/npm-version/license.
- **PROJECT.md Evolution section** — should get updated post-Phase 1 to mark FOUND-01..05 + EXT-01 as validated. Defer to the phase transition step.
- **`docs/drivers/voiceover.md`** — to be written in Phase 3 when the real driver lands.
