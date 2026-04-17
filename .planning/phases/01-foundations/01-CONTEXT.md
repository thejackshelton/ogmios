# Phase 1: Foundations - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning
**Mode:** Auto (user delegated via /loop — decisions made from research + PROJECT.md)

<domain>
## Phase Boundary

Build a signed, cross-compiled Zig native addon for macOS with:
- `@shoki/sdk` TypeScript package that loads a platform-specific `.node` binding via `optionalDependencies`
- `@shoki/binding-darwin-arm64` and `@shoki/binding-darwin-x64` platform packages built from Zig 0.16+ via napi-zig
- Developer ID signing on every release binary (no unsigned binary ever ships)
- CI release pipeline using OIDC trusted publishing (no `NPM_TOKEN` secret)
- Frozen `ShokiDriver` Zig vtable + `ScreenReaderHandle` TS interface so future screen readers slot in cleanly
- Signed-wrapper-app architecture decision documented

Out of this phase: VoiceOver capture, permission setup CLI, Vitest integration, CI image — those belong to Phases 2-5.

</domain>

<decisions>
## Implementation Decisions

### Repo Layout
- **Monorepo with pnpm workspaces** — `packages/sdk`, `packages/binding-darwin-arm64`, `packages/binding-darwin-x64`, `packages/matchers` (later phase), `packages/vitest` (later phase), `packages/doctor` (later phase). One repo, one release cadence, platform packages as first-class npm packages.
- **Zig source at repo root** in `zig/` with `build.zig`, `build.zig.zon`, `src/core/`, `src/drivers/voiceover/` (scaffolded empty in Phase 1), `src/drivers/README.md` documenting the vtable contract.
- **Rationale:** esbuild/swc/napi-rs all ship this shape; contributors know it; pnpm's strict workspace hoisting fits the native-addon resolution story.

### Toolchain Pins
- **Zig 0.16.0 stable** pinned in `build.zig.zon` `minimum_zig_version`. Upgrade spikes are tracked as explicit maintenance tasks; no tracking HEAD.
- **napi-zig HEAD** pinned by commit SHA in `build.zig.zon`. Accept the churn cost in exchange for the single-language-stack win.
- **Node 24 LTS, TypeScript 6.x, pnpm 10**. Biome for formatting/lint.
- **mlugg/setup-zig@v2** in every CI job with minisign verification.

### Signed-Wrapper-App Architecture (load-bearing decision)
- **Option chosen: grant TCC to a signed helper `shoki-runner.app` bundle, not to Node.**
- The `.node` addon inside `@shoki/binding-darwin-*` loads into Node for the hot path. But the TCC *trust anchor* is a tiny Swift/Obj-C helper app (`ShokiRunner.app`) that lives inside the binding package and is Developer ID-signed + notarized. When VoiceOver / Accessibility APIs require a TCC-trusted caller, the addon spawns the helper via XPC; TCC sees the stable signed bundle, not `node`.
- **Rationale:** Node binaries change hash every minor version and are unsigned on most machines — granting TCC to Node is a permission-flake factory (Pitfall #2 from PITFALLS.md). Granting TCC to the user's terminal is intrusive and doesn't help CI. A signed helper app is the only path that gives stable TCC identity across Node upgrades and dev rebuilds.
- **Phase 1 deliverable:** the helper app exists, is signed, is notarized, and contains a minimal XPC "ping" endpoint. Real VO calls route through it in Phase 3.
- **Phase 1 cost:** Swift/Obj-C wrapper (~200 LOC), entitlements plist, notarization in CI. Accepted.

### Distribution
- **`@shoki/sdk`** declares `@shoki/binding-darwin-arm64` and `@shoki/binding-darwin-x64` in `optionalDependencies`; runtime loader picks the right one via `process.platform` + `process.arch`.
- **No postinstall downloads.** Binaries live inside the platform packages (the esbuild/swc pattern).
- **OIDC trusted publishing** configured on npmjs.com for each package. Zero `NPM_TOKEN` secrets in CI.
- **Release gating:** tag push → GitHub Actions → cross-compile Zig for both triples → sign + notarize helper app → publish all 3 packages in one atomic `pnpm publish -r`.

### Driver Interface (EXT-01)
- **Zig `ShokiDriver` vtable** in `zig/src/core/driver.zig`:
  ```zig
  pub const ShokiDriver = struct {
      init: *const fn (ctx: *anyopaque, opts: InitOptions) anyerror!void,
      start: *const fn (ctx: *anyopaque) anyerror!void,
      stop: *const fn (ctx: *anyopaque) anyerror!void,
      drain: *const fn (ctx: *anyopaque, out: *RingBuffer) anyerror!usize,
      reset: *const fn (ctx: *anyopaque) anyerror!void,
      deinit: *const fn (ctx: *anyopaque) void,
      name: []const u8,
      platform: DriverPlatform,
  };
  ```
- **TS `ScreenReaderHandle`** mirrors the vtable: `start / stop / drain / reset / listen / phraseLog / lastPhrase / clear`. Concrete screen readers (`voiceOver`) are factory functions returning this interface.
- **Driver registry** in `zig/src/core/registry.zig` — one comptime array. Adding NVDA/Orca later = one new `src/drivers/<name>/driver.zig` + one registry entry + one new platform binding package. No changes to `core/`, `sdk/`, or wire format.
- **Phase 1 scaffolds but does not implement a real driver.** A `noop` driver exists for wire testing.

### Wire Format
- **Design in Phase 1, freeze at end of Phase 3** (when first real driver ships).
- Binary Buffer: `[u32 version][u32 count][entry]*` where entry = `[u64 ts_nanos][u8 source_tag][u8 flags][u16 phrase_len][phrase bytes][u16 role_len][role bytes?][u16 name_len][name bytes?]`.
- Version byte means future wire changes can coexist with older bindings.

### CI Release Pipeline
- `.github/workflows/release.yml` triggered on `v*` tags.
- Jobs: `build-darwin-arm64`, `build-darwin-x64`, `build-sdk`, `sign-helper`, `notarize-helper`, `publish`.
- Signing uses a secret-backed Developer ID cert imported into the keychain at job start (`apple-actions/import-codesign-certs` or equivalent).
- Notarization via `notarytool` + app-specific password or API key.
- Published artifacts include a GitHub Release with SBOM + SLSA provenance (stretch; if trivial include it; if not defer to Phase 6 polish).

### Testing in Phase 1
- `binding.ping()` round-trip test runs in Node via Vitest (not browser mode — that's Phase 4). Asserts the loaded `.node` matches the expected platform.
- Zig unit tests for the ring buffer and wire-format encoder/decoder.
- A smoke test that verifies the signed helper app's XPC ping round-trips.

### Claude's Discretion
- File naming within the repo (e.g., `zig/src/core/napi.zig` vs `zig/src/napi/bindings.zig`) — pick whatever reads cleanest to someone cloning the repo.
- Exact `build.zig` conventions (step graph, install artifacts layout) — follow napi-zig's README verbatim where it prescribes; elsewhere use idiomatic Zig 0.16 conventions.
- README / initial docs are at Claude's discretion; full docs site lives in Phase 6.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
None — greenfield project. All code is new in this phase.

### Established Patterns
Patterns to establish (not patterns to follow):
- **napi-zig's `napi.module(@This())` decorator pattern** — every Zig-side `pub fn` becomes a JS function
- **napi-rs v3-style `optionalDependencies`** distribution — binary per platform triple
- **Guidepup's plist snapshot/restore lifecycle** — copy verbatim in Phase 3 (scaffold hooks here)
- **esbuild/swc npm layout** — `@shoki/binding-<os>-<arch>` packages referenced from `@shoki/sdk`

### Integration Points
- `packages/sdk/src/index.ts` is the only public entry point users import
- `packages/sdk/src/binding-loader.ts` selects + `require()`s the right `.node`
- `zig/src/core/napi.zig` is the single N-API surface; all driver functions flow through it
- GitHub Actions `release.yml` workflow — the only place signing secrets are consumed

</code_context>

<specifics>
## Specific Ideas

- **Match napi-rs v3's package shape** closely so contributors with napi-rs experience feel at home (v3 was announced 2026, current spec).
- **Match Guidepup's API surface names** where the action is equivalent (`start`, `stop`, `lastSpokenPhrase` alias for `lastPhrase`) so migration-from-Guidepup is a find/replace exercise. DOCS-04 will spell this out.
- **ShokiRunner.app** should be a minimal Swift app with an `NSXPCConnection` endpoint. Avoid Obj-C unless Swift makes TCC negotiation awkward.
- Keep the Phase 1 feature surface tiny — `binding.ping()`, `binding.version()`, `binding.driver("noop").start()/stop()/drain()`. Everything real lands in Phases 2-3.

</specifics>

<deferred>
## Deferred Ideas

- SBOM / SLSA provenance in releases — defer to Phase 6 if not trivially added in Phase 1 CI
- Homebrew formula — defer to Phase 6 (v1 polish)
- Out-of-tree driver loading via `.node` plugin ABI — explicit post-v1, no concrete request yet
- Windows/Linux cross-compilation infrastructure — scaffolded only for v1; real drivers in v2+
- Per-minor-Node-version rebuilds — not needed thanks to N-API ABI stability

</deferred>
