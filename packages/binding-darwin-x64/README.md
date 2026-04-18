# @munadi/binding-darwin-x64

Native addon for Munadi on macOS Intel.

This package is installed automatically by `munadi` on matching platforms. You should not depend on it directly.

**Contents:** `shoki.node` (N-API addon compiled from Zig 0.16.0 via napi-zig) and a signed `MunadiRunner.app` helper bundle under `helper/` (used as the TCC trust anchor — see PROJECT.md Key Decisions).
