# Security Policy

## Supported Versions

Shoki is pre-alpha. Only the latest `main` branch is currently supported. Once v1 ships, the latest minor will receive security patches.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

Report via one of:

- **GitHub Security Advisories** — https://github.com/shoki/shoki/security/advisories/new (preferred)
- **Email** — [maintainer contact TBD]

Please include:

1. A description of the vulnerability
2. Steps to reproduce
3. The affected versions / commits
4. Potential impact (e.g., arbitrary code execution, data disclosure)

We will acknowledge receipt within 72 hours and aim to ship a fix within 30 days for high-severity issues.

## Scope

In scope:

- `@shoki/sdk`, `@shoki/doctor`, `@shoki/vitest`, `@shoki/matchers` npm packages
- `ShokiRunner.app` helper and its XPC surface
- Zig native addon and its N-API boundary
- CI release pipeline (`.github/workflows/release.yml`, trusted publishing)
- Tart image pipeline (`infra/tart/`)

Out of scope:

- Vulnerabilities in VoiceOver itself — report those to Apple
- Vulnerabilities in npm, GitHub Actions, tart, or other upstream dependencies — report to their maintainers
- Bugs or stability issues with no security implication — open a regular issue

## Platform-level risk

Shoki depends on VoiceOver's AppleScript surface and AX notifications. Apple occasionally tightens these (e.g., CVE-2025-43530 on macOS 26.2). We track this in [`docs/background/platform-risk.md`](../docs/background/platform-risk.md) and ship workarounds when Apple changes the surface.
