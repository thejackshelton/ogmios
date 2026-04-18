# Contributing to Ogmios

Thanks for your interest! Ogmios is an early-stage project — the best way to contribute right now is to file detailed issues, discuss architecture, or pick up one of the listed v1 phase tasks.

## Dev setup

### Prerequisites

- macOS 14+ (VoiceOver development only works on macOS)
- [Node.js 24 LTS](https://nodejs.org/)
- [pnpm 10](https://pnpm.io/installation)
- [Zig 0.16.0](https://ziglang.org/download/) — pin this exact version. Earlier versions will not build the core.
- Xcode Command Line Tools (`xcode-select --install`)

### Clone and install

```bash
git clone https://github.com/thejackshelton/ogmios.git
cd ogmios
pnpm install
```

### Run tests

Three layers of tests:

```bash
# TypeScript — always passes, no native build required
pnpm -r test

# Zig core
cd zig && zig build test

# Zig helper (XPC + AX observer + setup GUI — all Zig since Phase 8)
cd helper && zig build test
```

End-to-end tests (`noop-roundtrip.test.ts`, `ping.test.ts` in `ogmios`) require the native binding to be built and `OGMIOS_NATIVE_BUILT=1` in the env. CI does this automatically; locally:

```bash
cd zig && zig build
cp zig-out/lib/libogmios.dylib ../packages/binding-darwin-arm64/ogmios.node
OGMIOS_NATIVE_BUILT=1 pnpm --filter ogmios test
```

### Format + lint

```bash
pnpm lint        # Biome check
pnpm format      # Biome format (auto-fix)
```

## Repo layout

```
ogmios/
├── packages/
│   ├── sdk/                        ogmios — public TS API
│   ├── binding-darwin-arm64/       @ogmios/binding-darwin-arm64 — platform binary
│   └── binding-darwin-x64/         @ogmios/binding-darwin-x64 — platform binary
├── zig/                            Zig core source
│   ├── build.zig, build.zig.zon
│   ├── src/core/                   driver vtable, ring buffer, wire format, N-API surface
│   └── src/drivers/noop/           placeholder driver (Phase 3 adds voiceover)
├── helper/                         Zig helper: OgmiosRunner.app + OgmiosSetup.app (TCC trust anchor + GUI onboarding, all Zig since Phase 8)
├── .github/                        CI + release workflows
├── docs/                           user-facing docs
├── .planning/                      GSD planning artifacts (phase plans, roadmap, research)
└── package.json                    pnpm workspace root
```

## Workflow

1. Pick an open issue or phase task from `.planning/ROADMAP.md`.
2. Branch from `main`: `git checkout -b feat/<short-name>`.
3. Make changes; keep commits small and descriptive.
4. Run tests: `pnpm -r test` + `cd zig && zig build test` + `cd helper && zig build test`.
5. Open a PR. CI will run the full matrix.

## Adding a screen reader driver

See [`docs/adding-a-driver.md`](docs/adding-a-driver.md). The short version: one new `zig/src/drivers/<name>/driver.zig`, one registry entry, one new platform binding package. No changes to core/SDK/wire format.

## Design decisions

Load-bearing decisions live in `.planning/PROJECT.md` under "Key Decisions" and in `docs/architecture.md`. Before changing anything called out there, open an issue to discuss.

## Code of conduct

Be kind, be patient, assume good faith. Accessibility work matters. Do not ship anything that hurts the people who depend on screen readers.

## License

By contributing, you agree your contribution is licensed under the [MIT License](LICENSE).
