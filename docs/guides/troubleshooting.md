# Troubleshooting

Known failure modes and their fixes. If you hit something not listed here, [open an issue](https://github.com/shoki/shoki/issues) — adding it to this page is part of the triage workflow.

## Quick diagnosis

Always run `shoki doctor` first. 90% of the issues on this page are diagnosed by it in one shot.

```bash
npx shoki doctor
```

Exit codes 0-9 are documented in the [CLI reference](/api/cli#exit-codes).

## Error → cause → fix

### `AXError -25204` / "cannot observe announcements"

- **Cause:** The ShokiRunner helper lacks the Accessibility TCC grant (or the grant is stale after a binding upgrade).
- **Fix:** Run `shoki doctor`. If it reports missing Accessibility, follow the deep link to System Settings → Privacy & Security → Accessibility and toggle ShokiRunner.app on. If the grant is present but mismatched, run `tccutil reset Accessibility com.shoki.ShokiRunner` and re-grant.

### Ghost VoiceOver process after tests

**Symptom:** `pgrep -x VoiceOver` returns a PID after your test suite exits; VO keeps speaking until you log out.

- **Cause:** Process exit hook didn't fire (e.g. `kill -9` to the test runner, kernel panic).
- **Emergency fix:**
  ```bash
  sudo pkill -9 VoiceOver
  ```
- **Prevention:** Make sure your test runner lets Shoki's exit handlers finish. Don't use `kill -9` on `vitest`. `ctrl+C` is fine (SIGINT is handled).

### Announcements drop during rapid UI updates

- **Cause:** Ring buffer overflow. Default `logBufferSize` is 10,000 entries. `session.drain()` returns a `droppedCount` field — if it's non-zero, the buffer lost events.
- **Fix:** Increase `logBufferSize`:
  ```ts
  await voiceOver.start({ mute: true, logBufferSize: 50_000 });
  ```
  Or drain more frequently:
  ```ts
  const events = await session.drain();
  // process + assert
  await session.clear();
  ```

### Tests pass locally, fail in CI

- **Cause:** The CI runner lacks TCC grants or VO-AppleScript-enabled.
- **Fix:** Use the [pre-baked tart image](/guides/ci/tart-selfhosted) (`ghcr.io/shoki/macos-vo-ready:<macos>`) or make sure your workflow includes `uses: shoki/setup-action@v1` before the test step. See [CI quickstart](/getting-started/ci-quickstart).

### `ShokiConcurrentTestError` from the Vitest plugin

- **Cause:** You used `test.concurrent(...)` inside a file that imports `@shoki/vitest/browser`. VO is a system singleton; concurrent tests would pollute each other's capture logs.
- **Fix:** Remove the `.concurrent`. Vitest will run the tests serially in a single thread. Shoki refcount semantics handle cross-file VO sharing.

### `ShokiPlatformUnsupportedError`

- **Cause:** You tried to boot VoiceOver on non-darwin (Linux, Windows).
- **Fix:** Drop `SHOKI_INTEGRATION=1` on these hosts; the render-only test path works cross-platform.

### `ShokiBindingNotAvailableError`

- **Cause:** The platform-specific native binding didn't resolve at install time.
- **Fix:**
  1. `pnpm install --force`
  2. Check `node_modules/@shoki/` for a `binding-darwin-arm64` or `binding-darwin-x64` subdirectory.
  3. If it's missing, your registry might be blocking optional deps — set `optional=true` in `.npmrc` or pin the platform binding manually.

### `shoki doctor` says "Full Disk Access needed"

- **Cause:** `shoki doctor` reads the system TCC.db, which is SIP-protected on macOS 14+.
- **Fix:** Grant FDA to your terminal in System Settings → Privacy & Security → Full Disk Access, OR run with `--skip-system-tcc` (user-scope check only).

### Empty log + `toHaveAnnounced` fails

- **Cause:** Almost always a missing Automation grant specifically (Accessibility alone is not sufficient). VoiceOver has to show up as a child entry of ShokiRunner.app under Automation.
- **Fix:** Run `shoki doctor` — it diagnoses Automation specifically. Re-grant if needed, re-run.

### `awaitStable` times out

- **Cause:** VO is still emitting events after the `quietMs` window, OR never emitted any (empty log + no activity = timeout).
- **Fix:**
  - If you expect announcements — raise `quietMs` (try 1000ms) and `timeoutMs` (try 10s). Slow machines need more slack.
  - If you expect silence — use `toHaveNoAnnouncement()` with a plain `await new Promise(r => setTimeout(r, 500))` instead of `awaitStable`.

### VO starts but never announces anything

- **Cause 1:** VO is running but muted at the system level in a way Shoki doesn't override (`shoki.start({ mute: true })` uses our own plist key, not the system mute).
- **Fix 1:** Don't worry about system mute; Shoki controls capture independently of speaker output. If `phraseLog()` still returns `[]` something deeper is broken.
- **Cause 2:** Your app isn't actually announcing (bad `aria-live`, role mismatch, etc.).
- **Fix 2:** Test against [`examples/vitest-browser-qwik`](https://github.com/shoki/shoki/tree/main/examples/vitest-browser-qwik) first — if the canonical example works, the problem is in your app's semantics.

### `shoki doctor` exits 9 (HELPER_UNSIGNED)

- **Cause:** You're running against a dev build of the helper, not a signed release.
- **Fix:**
  - For local dev, this is fine — just expect to re-grant permissions every time the helper changes.
  - For CI or production, install a signed release from npm: `pnpm add -D @shoki/sdk@latest`.

## CI-specific

### Background apps leak announcements into captures

- **Cause:** Slack, Discord, Teams, Mail, Calendar, system notifications, etc. announce over the foreground app.
- **Fix:** `shoki/setup-action` runs `kill-background-apps.sh` as a pre-job step. If you're not using the action, copy the script from [`.github/actions/setup/`](https://github.com/shoki/shoki/tree/main/.github/actions/setup) and run it yourself.

### GH-hosted `macos-latest` is erratic

- **Cause:** Cold VM boot; TCC grants have to be applied at run start; background apps vary per runner.
- **Fix:** Switch to a persistent topology (self-hosted tart or Cirrus Runners) if flake is unacceptable. GH-hosted should be reserved for low-frequency runs.

### macOS 26 (Tahoe) tests fail with a different error than on 14/15

- **Cause:** CVE-2025-43530 tightened VO AppleScript access — an entitlement is now required.
- **Fix:** Update to a tart image with the post-CVE entitlement baked in (`ghcr.io/shoki/macos-vo-ready:tahoe` at or after 2026-03). If your tooling can't provide the entitlement, Shoki falls back to the AX-notifications capture path — see [Platform risk](/background/platform-risk).

## Still stuck?

1. Run `shoki info` — it prints a diagnostic blob suitable for pasting into a bug report.
2. Open an issue on [the repo](https://github.com/shoki/shoki/issues) with: macOS version, Node version, pnpm version, the output of `shoki doctor`, and the output of `shoki info`.
