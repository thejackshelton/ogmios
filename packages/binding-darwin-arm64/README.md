# @shoki/binding-darwin-arm64

Native addon for Shoki on macOS Apple Silicon.

This package is installed automatically by `dicta` on matching platforms. You should not depend on it directly.

**Contents:** `shoki.node` (N-API addon compiled from Zig 0.16.0 via napi-zig) and a signed `ShokiRunner.app` helper bundle under `helper/` (used as the TCC trust anchor — see PROJECT.md Key Decisions).
