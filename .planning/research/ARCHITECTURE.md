# Architecture Research

**Domain:** Screen-reader automation library (Zig core + TS SDK, macOS/VoiceOver first, Vitest browser mode as canonical target)
**Researched:** 2026-04-17
**Confidence:** HIGH for process model, VO capture pipeline, and Vitest integration (direct source-code evidence from Guidepup and Yuku). MEDIUM for VM/tart parity (Apple-Silicon-only, community reports) and extensibility (inferred from Guidepup's `ScreenReader` interface).

---

## System Overview

Shoki is a **three-layer, single-process, per-worker** system. The TypeScript SDK lives in the user's test process (e.g. the Vitest Node-side worker). A Zig-compiled N-API addon is loaded **in-process** into that same worker. The Zig addon spawns short-lived `osascript` subprocesses to talk to a separately-running VoiceOver.app. A Vitest-browser-mode test running in a real browser reaches back to the Node worker via Vitest's built-in **custom commands RPC** (WebSocket).

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        USER MACHINE / CI RUNNER (macOS)                   │
│                                                                           │
│  ┌──────────────────────┐          ┌─────────────────────────────────┐    │
│  │   Browser (Chromium) │          │        Node / Bun  (Vitest)     │    │
│  │   iframe per test    │  WSS     │                                 │    │
│  │                      │ ◄──────► │  ┌───────────────────────────┐  │    │
│  │ test.ts              │  tinyRPC │  │  @shoki/sdk  (TypeScript) │  │    │
│  │  await commands      │          │  │   voiceOver.listen()      │  │    │
│  │    .shokiListen()    │          │  │   voiceOver.stop()        │  │    │
│  └──────────────────────┘          │  └────────────┬──────────────┘  │    │
│           ▲                        │               │ N-API call      │    │
│           │ Playwright/CDP         │               ▼                 │    │
│           │ (userEvent,            │  ┌───────────────────────────┐  │    │
│           │  typing, clicks)       │  │  shoki-core.node  (Zig)   │  │    │
│           │                        │  │   - SR driver registry    │  │    │
│           └────────────────────────┤  │   - LogStore (ring buf)   │  │    │
│                                    │  │   - Poll scheduler        │  │    │
│                                    │  └─────────┬──────────┬──────┘  │    │
│                                    │            │          │         │    │
│                                    │     spawn  │    spawn │ `defaults│   │
│                                    │    osascript    write`           │    │
│                                    │            ▼          ▼         │    │
│                                    │  ┌──────────────┐ ┌───────────┐ │    │
│                                    │  │ osascript CLI│ │ defaults  │ │    │
│                                    │  │  stdin:script│ │  CLI      │ │    │
│                                    │  │  stdout:reply│ │           │ │    │
│                                    │  └──────┬───────┘ └─────┬─────┘ │    │
│                                    └─────────┼───────────────┼───────┘    │
│                                              │ Apple Events  │            │
│                                              ▼               │            │
│  ┌──────────────────────────────────────────────────────┐    │            │
│  │             VoiceOver.app  (out-of-process)          │    │            │
│  │  - /System/Library/CoreServices/VoiceOver.app        │◄───┘            │
│  │  - plist: com.apple.VoiceOver4/default               │                 │
│  │  - AppleScript dictionary: `content of last phrase`  │                 │
│  └──────────────────────────────────────────────────────┘                 │
└───────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|---|---|---|
| **`@shoki/sdk` (TS)** | Public API surface (`voiceOver.listen()`, etc.), test-framework adapters, type definitions, Vitest command wiring. No OS calls. | TypeScript, ships ESM + CJS, zero runtime deps beyond the native binding |
| **`shoki-core` (Zig → .node)** | Lifecycle (start/stop/detect VO), capture loop, log store, plist read/write, AppleScript invocation, driver registry. The only component that knows about VO specifics. | Zig compiled to `.node` via `napi-zig` — N-API native addon, loaded with `require('@shoki/binding-darwin-arm64/shoki.node')` (same pattern Yuku uses) |
| **`@shoki/binding-<triple>`** | Prebuilt platform binary, one per target triple. Installed via npm `optionalDependencies`. | Published as sibling packages; user installs only their platform's bits |
| **`@shoki/vitest`** | Vitest plugin that registers a `BrowserCommand` per public API method, letting browser-side tests call into the Node-side SDK. | Vite/Vitest plugin; just a thin shim |
| **`@shoki/setup`** | One-shot CLI (`npx shoki-setup`) that configures `.VoiceOverAppleScriptEnabled`, TCC entries, plist defaults. Separate from runtime. | Node CLI; not loaded at test time |
| **`VoiceOver.app`** | The actual screen reader — a completely separate OS process. Shoki never embeds it. | System binary at `/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter` |
| **`osascript` subprocess** | Ephemeral per-query child (~5–20 ms spawn cost). Only exists long enough to send one AppleScript statement and receive reply. | Zig spawns with `std.ChildProcess`, feeds script via stdin, reads stdout |

---

## Process Model (Decision: in-process N-API addon)

### The decision

**Zig compiles to an N-API native addon loaded in the Node/Bun process — not a spawned daemon, not a CLI subprocess per call.**

### Evidence

Yuku (the mandated toolchain) ships exactly this shape (verified in `/tmp/shoki-research/yuku/npm/yuku-parser/`):
- `package.json` lists 11 `optionalDependencies` like `@yuku-parser/binding-darwin-arm64`, one per platform triple
- `binding.js` does `require(join(__dirname, '@yuku-parser', 'binding-' + suffix, 'yuku-parser.node'))` — a real, dlopen-loaded `.node` file
- `build.zig` imports `napi_zig` and builds a shared library using `addLib(b, napi_dep, ...)` against `src/parser/ffi/napi.zig` which declares `pub fn parse(env: napi.Env, ...) !napi.Val` and `napi.module(@This())` to register exports

Yuku is a published, working example of the Zig→N-API pattern Shoki should mirror. No subprocess, no IPC, no WASM.

### Why in-process beats the alternatives

| Model | Startup cost | Data transfer | Lifecycle complexity | Verdict |
|---|---|---|---|---|
| **In-process N-API (recommended)** | ~0 (one-time addon load) | Zero-copy where possible; Buffers for bulk | Shares Node event loop | ✅ |
| Long-lived daemon (Unix socket / gRPC) | ~50–200ms fork + handshake | Serialize every call | Crash supervision, stale socket files, port allocation | ❌ over-engineered |
| Spawned CLI per call | ~30–80ms per invocation × N calls | Full serialize roundtrip | None, but slow | ❌ per-poll cost kills the 50ms capture loop |
| WASM in-browser | ~5ms | JSON-compatible | Can't call osascript (sandbox) | ❌ WASM cannot execute AppleScript |

The observe-only capture loop polls at **50 ms intervals** (see Pitfalls — Guidepup's `SPOKEN_PHRASES_POLL_INTERVAL = 50`). A CLI-per-call model would burn the entire poll budget on process startup. The daemon model adds complexity with no benefit because the Zig code is already in the same trust boundary as the test runner — there's no isolation win.

### Implication: the Zig binary itself spawns `osascript`, not the SDK

Guidepup's TS does `execFile('/usr/bin/osascript', [], ...)` per-query (verified in `runAppleScript.ts`). Shoki moves that loop *into* the Zig addon. Node just calls `binding.captureTick()` and gets back an already-cleaned phrase — or a batched buffer of phrases since last call. This is where the reported "faster than N-API+Rust" Yuku claim pays off: the hot loop never leaves native code.

### Vitest browser-mode nuance: which "process" owns the binding?

Vitest browser mode treats the test suite as a mini-app compiled by Vite and served to a real browser (via Playwright CDP or WebDriverIO). **The test file runs in the browser, but the Vitest orchestrator — where plugins, config hooks, and server-side `BrowserCommand` handlers execute — runs in Node.**

→ **Shoki's N-API addon loads in the Node-side Vitest orchestrator, not in the browser.** The browser can't load `.node` files anyway. The browser-side test code reaches back via Vitest's custom-commands RPC (covered below).

---

## VoiceOver Lifecycle

### Start, capture, stop sequence (verified against Guidepup source)

```
1. Shoki: detect()
   ├── isMacOS()  → check platform
   └── supportsAppleScriptControl()
          → check file /private/var/db/Accessibility/.VoiceOverAppleScriptEnabled == "a"

2. Shoki: storeOriginalSettings()
   ├── read user's current plist values (9 keys across com.apple.VoiceOver4/default
   │   and com.apple.VoiceOverTraining)
   └── register process.on('exit', ...) to restore them

3. Shoki: configureSettings(SHOKI_DEFAULTS)
   ├── `defaults write com.apple.VoiceOver4/default SCRCategories...SCRDisableSound -bool true`   (mute)
   ├── `defaults write com.apple.VoiceOver4/default SCRCategories...SCRRateAsPercent -int 90`    (max-ish rate)
   ├── `defaults write com.apple.VoiceOver4/default SCRDisplayTextEnabled -bool true`            (captions on)
   ├── `defaults write com.apple.VoiceOver4/default loginGreeting -string ""`                    (no greeting)
   └── ... (doNotShowSplashScreen, hintDelay, automaticallySpeakWebPage, etc.)

4. Shoki: start()
   └── exec('/System/Library/CoreServices/VoiceOver.app/Contents/MacOS/VoiceOverStarter')

5. Shoki: waitForRunning()
   └── poll `pgrep VoiceOver` until alive

6. --- TEST RUNS ---
   Capture loop (per user action): pollForSpokenPhrases()
     ├── osascript: tell "VoiceOver" → "content of last phrase"
     ├── clean phrase (strip punctuation / quotes)
     ├── compare with previous; if stable across 25 polls × 50ms → done
     └── push to LogStore

7. Shoki: stop()
   ├── terminateVoiceOverProcess()  (SIGTERM via `killall VoiceOver`)
   ├── waitForNotRunning()
   └── resetSettings()  (restore all 9 plist values)
```

### Can VO start fresh per test? Should it?

**Fresh per `describe()` / test file: YES. Fresh per `it()`: NO.**

VoiceOver takes ~1–3 seconds to start (splash, startup greeting suppression, AppleScript-ready state). Per-test startup would blow out test timeouts. Per-file is the Guidepup convention and it's right.

Shoki should expose:
- `voiceOver.start()` / `voiceOver.stop()` — manual, user's `beforeAll`/`afterAll`
- `voiceOver.reset()` — keep VO running but clear `LogStore` and return cursor to a known position. Per-test.

### User's own VO state

The user might have VO enabled right now (especially blind developers — Shoki's own users may include them). Defensive behavior:
1. **Snapshot everything** at `start()` (`storeOriginalSettings`).
2. **Refuse to run** if VO is already running and `{ takeOverExisting: false }` (default).
3. **Offer `takeOverExisting: true`** that does a graceful stop+reconfig+start.
4. **Always restore** via `process.on('exit' | 'uncaughtException' | 'unhandledRejection')` hooks.

This is all already in Guidepup; Shoki should copy the discipline verbatim.

### Muting / max rate: plist is enough, no runtime commands

Verified from `configureSettings.ts`: muting is achieved entirely through **`defaults write`** on two keys before `VoiceOverStarter` runs:
- `SCRCategories_SCRCategorySystemWide_SCRSoundComponentSettings_SCRDisableSound` (mute sound effects)
- Rate via `SCRCategories_...SCRSpeechLanguages_default_..._SCRRateAsPercent`

There's no AppleScript verb to live-adjust these post-start; they're read at VO boot. So: **set before start, tear down after stop.** Shoki shouldn't expose runtime mute commands because they wouldn't work anyway.

---

## Capture Pipeline

### The data path

```
VoiceOver speaks a phrase
      │
      ▼
VO updates its internal "last phrase" buffer
      │
      ▼ (Zig polls every 50 ms via osascript)
osascript: `tell app "VoiceOver"` + `with transaction` + `return content of last phrase`
      │
      ▼ (stdout of osascript subprocess)
Raw phrase string, UTF-8
      │
      ▼ (cleanSpokenPhrase: strip "[", trim whitespace, collapse)
Cleaned phrase string
      │
      ▼ (stability check: same value across 25 polls = confident it's final)
LogStore.push({ timestamp, rawPhrase, cleanedPhrase, source: "lastPhrase" })
      │                      ▲
      │                      │ (Zig owns this ring buffer,
      │                      │  not the TS side)
      │
      ▼ (N-API call from TS: binding.drainLog() → Buffer)
Decoded on TS side into ShokiAnnouncement[]
      │
      ▼
voiceOver.spokenPhraseLog() returns Promise<ShokiAnnouncement[]>
      │
      ▼
Test asserts: expect(log).toContain("Submit button")
```

### Polling, not event streams — and why

**No public event stream exists for VoiceOver.** Apple doesn't emit `NSAccessibilityAnnouncementChangedNotification` for VO's own speech synthesis; you must poll. Every VO automation library (Guidepup, AccessLint's screenreaders, the older VoiceOver.js) polls `content of last phrase` via AppleScript. This is a fundamental constraint; architecture must accept it.

**Implication:** Shoki's "event stream" appearance is a poll-to-stream adapter. The Zig layer runs the 50 ms loop, debounces via stability detection, and pushes into a bounded ring buffer. The TS layer reads in chunks.

### Where is buffering?

**In the Zig addon, not the TS SDK.** Three reasons:

1. **Poll loop lives in Zig** so the data is already in-native. Copying to JS every 50 ms is waste.
2. **Bounded memory** — a ring buffer capped at e.g. 10,000 entries means a runaway test can't OOM the worker.
3. **Timestamp precision** — Zig captures `std.time.milliTimestamp()` at poll time; crossing into JS loses precision to microtask scheduling.

The TS `LogStore` wrapper just calls `binding.drain()` on every public `spokenPhraseLog()` call and merges into a JS-side mirror (for `clearSpokenPhraseLog` semantics, which Guidepup handles with a `#clearedLastSpokenPhrase` pointer — verified in `LogStore.ts:98`).

### Backpressure

The test is typically the **slow** side, not the source. VoiceOver emits at human-speech rate (~2–5 phrases/sec). Capture at 50ms polls = 20 Hz > emission rate, so no backpressure on capture. If the test doesn't call `spokenPhraseLog()` for a long time:
- Ring buffer fills (bound: 10k entries ≈ ~500 seconds of dense speech)
- Oldest entries drop (with a `droppedCount` counter exposed to TS for visibility)
- Test that later asserts on those entries sees a clear "log overflowed" error, not silent data loss

This is much cleaner than Guidepup's current model (unbounded array growth).

### Wire format: Zig→JS

Follow Yuku's pattern: **a tagged byte buffer**, decoded in JS. Structure:

```
[u32 count] [entry]*
entry = [u64 ts_ms] [u8 source_tag] [u32 str_len] [utf8 bytes]
```

`source_tag`: 0 = lastPhrase, 1 = itemText, 2 = caption, 3 = commander-announcement. Future-compatible because `u8` gives 256 sources.

This avoids per-call JSON overhead and keeps the hot path zero-allocation on the JS side.

---

## Platform Abstraction

### The `Driver` interface (one screen reader = one driver)

Modeled on Guidepup's `ScreenReader` interface (verified in `src/ScreenReader.ts`) but narrowed to **observe-only** v1:

```typescript
interface ShokiDriver {
  readonly name: string;              // "voiceover" | "nvda" | "orca"
  readonly platform: "darwin" | "win32" | "linux";

  detect(): Promise<boolean>;          // can we run here?
  start(opts: StartOptions): Promise<void>;
  stop(): Promise<void>;

  // Capture surface (the v1 must-haves)
  lastPhrase(): Promise<string>;
  phraseLog(): Promise<ShokiAnnouncement[]>;
  clearPhraseLog(): Promise<void>;

  // Metadata the driver MAY expose (optional; feature-detected)
  cursorLocation?(): Promise<CursorInfo>;
  focusedRole?(): Promise<string>;
}
```

**Observe-only means no `next()`, `press()`, `click()`, etc.** The user's test framework (Vitest + Playwright, XCUITest, etc.) drives the app. Dropping the driving verbs halves the interface surface compared to Guidepup and is the right call for v1 per PROJECT.md.

### Where does platform-specific code live?

**One Zig module per driver, registered at addon load time.** File layout:

```
src/
├── core/
│   ├── registry.zig        # driver registration
│   ├── log_store.zig       # ring buffer (shared across drivers)
│   └── napi.zig            # N-API exports (the one FFI boundary)
├── drivers/
│   ├── voiceover/          # macOS only — compiled when target == macos
│   │   ├── driver.zig      # implements the Driver vtable
│   │   ├── applescript.zig # osascript spawn + transaction helpers
│   │   ├── defaults.zig    # plist read/write
│   │   └── starter.zig     # VoiceOverStarter exec
│   ├── nvda/               # Windows only — compiled when target == windows
│   │   └── driver.zig
│   └── orca/               # Linux only — compiled when target == linux
│       └── driver.zig
└── build.zig               # cross-compile via `zig build -Dtarget=...`
```

**Conditional compilation via Zig's comptime**, not feature flags at runtime:

```zig
const driver = switch (@import("builtin").target.os.tag) {
    .macos => @import("drivers/voiceover/driver.zig"),
    .windows => @import("drivers/nvda/driver.zig"),
    .linux => @import("drivers/orca/driver.zig"),
    else => @compileError("unsupported target"),
};
```

→ **One `shoki-core.node` per platform triple**, each compiled with only its own driver. The `@shoki/binding-darwin-arm64` package contains only the VO driver. This keeps binary size small and prevents Windows users from carrying VoiceOver AppleScript strings they can't use.

### What data crosses the driver boundary?

v1 scope: **speech events only.** Everything else is a bonus.

| Data kind | v1 | Rationale |
|---|---|---|
| `lastPhrase: string` | ✅ | The whole point |
| `itemText: string` | ✅ | VO distinguishes; NVDA doesn't. Drivers that lack it return `""` |
| Timestamp | ✅ | Needed for assertion ordering |
| `source` tag | ✅ | Lets future features distinguish caption vs commander |
| Cursor location (x, y, rect) | ⛔ v1 | Different across SRs; punt |
| Focused element role | ⛔ v1 | VO gives role via `itemText` prefix; NVDA gives via UI Automation; unify later |
| Screenshot | ⛔ v1 | User's framework can do this |

### Driver discovery & loading

**Zero plugin system for v1.** The one platform-matching driver is compiled in. When `@shoki/sdk` calls `createVoiceOver()`, it calls `binding.driverByName("voiceover")` which returns a handle if the current platform's binary has it, else throws.

Post-v1 (for user-supplied drivers): expose `registerDriver(mod: { path: string })` that `dlopen`s a sibling `.node` file and calls its registration function. Not needed for v1 and adds surface area; defer.

---

## Local vs CI Parity

### The decision: **same `.node` binary on both; VM is opt-in and separate**

**Runtime-wise, local dev and CI run the exact same `@shoki/binding-darwin-arm64` addon against the exact same VoiceOver.app.** There is no "local mode" and "CI mode" at the SDK level — the SDK is identical. What differs is the *environment setup*, and Shoki ships that as a separate CLI.

### Setup surfaces

| Environment | Setup path | Who runs it | What it does |
|---|---|---|---|
| **Local Mac, interactive** | `npx shoki doctor` | Developer | Checks `.VoiceOverAppleScriptEnabled`, TCC grants for the terminal/IDE, prints manual steps it can't automate (SIP-protected TCC writes) |
| **Local Mac, one-shot** | `npx shoki setup --unsafe` | Developer with SIP off | Writes `.VoiceOverAppleScriptEnabled`, tccutil-style TCC grants |
| **Self-hosted CI runner** | Pre-baked VM image | Ops once | VM image has SIP off, TCC pre-populated, VoiceOver AppleScript enabled. Tart pulls it. |
| **GetMac / Cirrus / generic GH Actions mac** | GH Action `shoki/setup-action` | CI YAML | Same as `shoki setup` but with CI-specific defaults and `ignoreTccDb: true` fallback (following Guidepup's precedent) |

### Tart as the "hermetic local = CI" option

Tart runs macOS VMs on Apple Silicon via Apple's Virtualization.Framework at near-native perf. Workflow:
1. Shoki publishes a reference Tart image: `ghcr.io/shoki/macos-vo-ready:15.x`
2. Locally: `tart clone ghcr.io/shoki/macos-vo-ready:15 shoki-ci && tart run shoki-ci`; user SSH's in, runs `npm test`.
3. In CI: same image via Tart runner (Cirrus or self-hosted).

**Known constraint (MEDIUM confidence):** VoiceOver inside a macOS guest on Virtualization.Framework works (community reports confirm), but only one VoiceOver instance can exist on a given physical machine at a time. A developer with VO on the host running a Tart VM with VO in the guest will collide. Documentation should call this out; Shoki shouldn't try to solve it.

**The SDK does not "decide" VM vs native.** The SDK is platform-aware, not topology-aware. Whether the macOS it's running on happens to be a VM guest is invisible to the binding — it just sees macOS. This is the right abstraction: fewer moving parts, one code path.

### Config surface

Exposed to users via `voiceOver.start({...})`:
```ts
{
  speechRate?: number;          // default 90 (max intelligible)
  mute?: boolean;               // default true
  takeOverExisting?: boolean;   // default false — refuses if VO already running
  timeout?: number;             // AppleScript timeout, ms
  logBufferSize?: number;       // ring buffer entries, default 10000
  onDropped?: (n: number) => void;  // overflow callback
}
```

No `mode: "vm" | "native"` knob. If a user wants VM, they run Tart; Shoki doesn't know or care.

---

## Test-Framework Integration: Vitest Browser Mode

### The topology (this is the single most important integration point for v1)

Vitest browser mode architecture (verified from Vitest docs + source):
- **Vite server + Vitest orchestrator**: runs in **Node**
- **Test file**: compiled by Vite, served to a **real browser** (Chromium via Playwright, etc.)
- **Test executes in the browser** — `document`, real DOM, real events
- **`@vitest/browser-playwright` provider**: bridges Vitest↔Playwright via CDP
- **Browser↔Node communication**: Vitest's built-in **Commands API** over **tinyRPC via WebSocket**

Key property: custom `BrowserCommand` functions are **defined in Node**, **callable from the browser** via `import { commands } from '@vitest/browser/context'`. Return values are JSON-serialized back to the browser.

### Where does VoiceOver boot?

**In the Node-side Vitest worker.** The browser can't and mustn't. Two reasons:
1. The N-API addon is a `.node` file — not loadable in a browser.
2. VoiceOver is a macOS process; it cares about the host OS, not the rendered page. The "test process" from VO's perspective is whichever process calls AppleScript — which is the Node worker.

### `@shoki/vitest` plugin: the bridge

```typescript
// @shoki/vitest
import type { Plugin } from 'vitest/config';
import type { BrowserCommand } from 'vitest/node';
import { voiceOver } from '@shoki/sdk';

const shokiListen: BrowserCommand<[]> = async () => {
  await voiceOver.start();             // boots VO on the host
  return { started: true };
};

const shokiDrain: BrowserCommand<[]> = async () => {
  return voiceOver.spokenPhraseLog(); // serialized back to browser
};

const shokiStop: BrowserCommand<[]> = async () => {
  await voiceOver.stop();
};

export default function shokiVitest(): Plugin {
  return {
    name: 'shoki:vitest',
    config: () => ({
      test: { browser: { commands: { shokiListen, shokiDrain, shokiStop } } }
    })
  };
}
```

Browser-side usage:
```typescript
// user's test.ts (runs in Chromium)
import { commands } from '@vitest/browser/context';
import { page, userEvent } from '@vitest/browser/context';

test('submit button announces correctly', async () => {
  await commands.shokiListen();             // Node boots VO
  try {
    await userEvent.click(page.getByRole('button', { name: 'Submit' }));
    // give VO time to speak
    await new Promise(r => setTimeout(r, 500));
    const log = await commands.shokiDrain(); // pull phrases across the wire
    expect(log.map(e => e.phrase)).toContain('Submit, button');
  } finally {
    await commands.shokiStop();
  }
});
```

### Concrete sequence diagram

```
Developer                   Vitest Node            @shoki/sdk            shoki-core.node        osascript            VoiceOver.app       Browser (test)
    │                            │                      │                      │                     │                   │                     │
    │ vitest run                 │                      │                      │                     │                   │                     │
    ├──────────────────────────►│                      │                      │                     │                   │                     │
    │                            │ load shoki plugin    │                      │                     │                   │                     │
    │                            │◄────────────────────►│                      │                     │                   │                     │
    │                            │ register commands    │                      │                     │                   │                     │
    │                            │                      │                      │                     │                   │                     │
    │                            │ launch Playwright + open iframe             │                     │                   │                     │
    │                            ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────►│
    │                            │                      │                      │                     │                   │  test.ts runs       │
    │                            │    WSS open          │                      │                     │                   │◄────────────────────│
    │                            │◄─────────────────────────────────────────────────────────────────────────────────────────────────────────────│
    │                            │                      │                      │                     │                   │ commands.shokiListen()
    │                            │◄─────────────────────────────────────────────────────────────────────────────────────────────────────────────│
    │                            │ invoke BrowserCommand│                      │                     │                   │                     │
    │                            ├─────────────────────►│ voiceOver.start()    │                     │                   │                     │
    │                            │                      ├─────────────────────►│ binding.start()     │                   │                     │
    │                            │                      │                      │ defaults write ×9   │                   │                     │
    │                            │                      │                      │ VoiceOverStarter    │                   │                     │
    │                            │                      │                      ├───────────────────────────────────────►│ VO launches         │
    │                            │                      │                      │ start poll loop     │                   │                     │
    │                            │                      │                      │ (every 50 ms)       │                   │                     │
    │                            │                      │                      ├─────────────────────►│                   │                     │
    │                            │                      │                      │                     │ osascript "last phrase" │             │
    │                            │                      │                      │                     ├──────────────────►│                     │
    │                            │                      │                      │                     │◄──────────────────│ reply "Welcome..."  │
    │                            │                      │                      │◄─────────────────────│                   │                     │
    │                            │                      │                      │ push to ring buffer │                   │                     │
    │                            │                      │◄─────────────────────│                     │                   │                     │
    │                            │◄─────────────────────│                      │                     │                   │                     │
    │                            ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────►│
    │                            │                      │                      │                     │                   │ userEvent.click(btn) (via CDP)
    │                            │                      │                      │                     │                   │ → browser dispatches click          
    │                            │                      │                      │                     │                   │ → VO announces                 
    │                            │                      │                      │                     │ poll hit: "Submit, button"              │
    │                            │                      │                      │                     ├──────────────────►│                     │
    │                            │                      │                      │◄─────────────────────│                   │                     │
    │                            │                      │                      │ push to ring buffer │                   │                     │
    │                            │                      │                      │                     │                   │                     │
    │                            │                      │                      │                     │                   │ commands.shokiDrain()
    │                            │◄─────────────────────────────────────────────────────────────────────────────────────────────────────────────│
    │                            ├─────────────────────►│ voiceOver.phraseLog()│                     │                   │                     │
    │                            │                      ├─────────────────────►│ binding.drain() → Buffer                │                     │
    │                            │                      │                      ├─────────────────────►│ copy from ring   │                     │
    │                            │                      │◄─────────────────────│ decode Buffer→ShokiAnnouncement[]       │                     │
    │                            │◄─────────────────────│                      │                     │                   │                     │
    │                            ├─────────────────────────────────────────────────────────────────────────────────────────────────────────────►│
    │                            │                      │                      │                     │                   │ expect(log)...      │
    │                            │                      │                      │                     │                   │ commands.shokiStop()│
    │                            │◄─────────────────────────────────────────────────────────────────────────────────────────────────────────────│
    │                            ├─────────────────────►│ voiceOver.stop()     │                     │                   │                     │
    │                            │                      ├─────────────────────►│ killall VoiceOver   │                   │                     │
    │                            │                      │                      │ reset plist         │                   │                     │
    │                            │                      │                      │ stop poll loop      │                   │                     │
```

### Critical non-obvious points

1. **The browser does not wait on VO directly.** Every interaction with VO goes through the WebSocket→Node→N-API→osascript chain. A 500ms sleep after `userEvent.click()` is currently needed because: (click)→(browser dispatches)→(VO sees AX event)→(VO queues speech)→(poll loop picks it up). Shoki should provide a helper that waits until the log is stable rather than a blind sleep.

2. **Serialization across tinyRPC**: whatever Shoki returns from `shokiDrain` must be structured-clone-safe. Buffers work; Date objects work; Functions don't. Design `ShokiAnnouncement` as plain `{ timestamp: number; phrase: string; source: string }`.

3. **One VO, many iframes**: Vitest runs each test file in its own iframe, but Node-side state (including the live VO connection) is shared across the orchestrator. Shoki must handle concurrent `shokiListen()` calls from multiple test files as a refcounted start/stop. Simplest: first `start()` boots, last `stop()` kills; in between, `reset()` between tests clears the log but keeps VO alive.

4. **Alternative for Playwright users without Vitest**: `@shoki/playwright` fixture. Same pattern — runs in the Playwright test process, which is itself Node, so no RPC needed at all. Vitest-browser's RPC hop is the only unusual case.

---

## Extensibility: Adding a New Screen Reader (Orca, NVDA)

### Minimum driver contract (the interface above, restated)

```zig
// src/core/driver.zig
pub const Driver = struct {
    name: []const u8,
    platform: Platform,

    detect_fn: *const fn () bool,
    start_fn: *const fn (opts: StartOptions) DriverError!void,
    stop_fn: *const fn () DriverError!void,
    last_phrase_fn: *const fn (buf: []u8) DriverError!usize,
    // Optional — feature-detected at the TS boundary
    cursor_location_fn: ?*const fn () DriverError!CursorInfo = null,
};
```

A new screen reader implements this struct, puts the file at `src/drivers/<name>/driver.zig`, and adds one line to `src/core/registry.zig` under the right `switch` arm. That's the entire contract.

### Discovery mechanism

v1: compile-time. Adding NVDA means:
1. `src/drivers/nvda/driver.zig` implements the struct using Windows UI Automation or the NVDA controller client.
2. `src/core/registry.zig` gains a `.windows => @import("drivers/nvda/driver.zig")` arm.
3. Build targets `x86_64-windows-msvc` and `aarch64-windows-msvc` → publishes `@shoki/binding-win32-x64` and `@shoki/binding-win32-arm64`.
4. The SDK's `voiceOver` factory becomes `screenReader({ name: 'nvda' })` or a named export `nvda`.

**No ABI changes required.** The N-API surface exposes `driverByName`, `start`, `drain`, `stop` — driver-agnostic. Adding screen readers is additive at the Zig layer and invisible at the JS ABI.

### Out-of-tree drivers (post-v1)

If someone wants to ship their own driver (say, JAWS), they'd want to publish their own `.node` binary and have Shoki load it. The extension point:
- Add `shoki.registerDriver(binding)` that calls `dlopen` on a user-provided `.node` file
- The user's `.node` file registers itself via a known symbol (`shoki_register_driver`)
- Same model Neovim uses for its extensions

Not needed for v1 and adds versioning pain. **Defer until concrete user ask.**

---

## Recommended Project Structure

```
shoki/
├── crates/                         # (using "crates" for mental parallel with Rust workspaces; rename freely)
│   ├── shoki-core/                 # Zig workspace
│   │   ├── build.zig
│   │   ├── build.zig.zon           # depends on yuku or direct napi-zig
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── driver.zig      # Driver vtable definition
│   │   │   │   ├── registry.zig    # comptime switch over target OS
│   │   │   │   ├── log_store.zig   # ring buffer, thread-safe
│   │   │   │   ├── napi.zig        # N-API exports: start, stop, drain, etc.
│   │   │   │   └── wire.zig        # Buffer encoding for JS handoff
│   │   │   └── drivers/
│   │   │       └── voiceover/
│   │   │           ├── driver.zig
│   │   │           ├── applescript.zig
│   │   │           ├── defaults.zig
│   │   │           └── starter.zig
│   │   └── test/
│   └── sdk/                        # @shoki/sdk — published to npm
│       ├── package.json            # optionalDependencies: @shoki/binding-*
│       ├── src/
│       │   ├── binding.ts          # dynamic require of the correct .node
│       │   ├── decode.ts           # Buffer → ShokiAnnouncement[]
│       │   ├── voiceover.ts        # public API
│       │   ├── types.ts
│       │   └── index.ts
│       └── tsconfig.json
│
├── adapters/                       # test-framework shims
│   ├── vitest/                     # @shoki/vitest — Plugin + BrowserCommands
│   │   └── src/index.ts
│   └── playwright/                 # @shoki/playwright — Fixture
│       └── src/index.ts
│
├── setup/                          # @shoki/setup — the CLI
│   ├── src/
│   │   ├── doctor.ts               # diagnose, don't modify
│   │   ├── setup.ts                # write files (SIP-aware)
│   │   ├── action.ts               # GitHub Action entry
│   │   └── tart.ts                 # pull/launch helpers (optional)
│   └── bin/shoki.js
│
├── bindings/                       # per-platform npm packages (generated)
│   ├── darwin-arm64/package.json
│   ├── darwin-x64/package.json
│   └── (future) win32-x64, linux-x64, ...
│
├── examples/
│   ├── vitest-browser-react/
│   ├── vitest-browser-vue/
│   └── playwright/
│
├── .github/
│   └── workflows/
│       ├── release.yml             # cross-compile Zig → publish all bindings
│       └── test.yml                # run examples on self-hosted + Cirrus
│
├── .planning/
└── README.md
```

### Structure rationale

- **`crates/shoki-core/`**: one Zig workspace, not per-driver. Drivers are submodules because they share the `core/` infrastructure (log store, N-API glue).
- **`crates/sdk/`**: public TS is thin. It's a facade over the binding; most logic lives in Zig. Keeping it a separate package forces the discipline that Zig owns the hot path.
- **`adapters/`**: test-framework integration is clearly extension code. Each adapter is its own npm package so users don't install Vitest stuff when they use Playwright.
- **`setup/`**: explicitly separate from runtime. Setup runs once with broad filesystem access; runtime runs inside tests with minimal permissions.
- **`bindings/`**: generated by CI at release time. Developers don't edit these.

---

## Data Flow Summary

### Request flow (test assert → raw phrase)

```
[browser: expect(log)...]
  ← decoded on JS side
  ← ShokiAnnouncement[]
  ← TS SDK decode from Buffer
  ← WSS tinyRPC response (JSON-serialized array)
  ← Node BrowserCommand handler
  ← binding.drain(): returns Buffer from Zig ring buffer
  ← Zig ring buffer (has been filling since voiceOver.start())
  ← Zig poll goroutine-equivalent running every 50 ms:
      ← osascript child, one per poll
      ← AppleScript: "content of last phrase"
      ← VoiceOver.app Apple Event handler
```

### Lifecycle flow (start → stop)

```
voiceOver.start()
  ├─ binding.loadDriver("voiceover")      # compile-time in v1
  ├─ driver.detect()                      # checks platform + .VoiceOverAppleScriptEnabled
  ├─ driver.storeOriginalSettings()       # snapshot 9 plist keys
  ├─ driver.configureSettings(defaults)   # mute + rate + greeting
  ├─ driver.startProcess()                # exec VoiceOverStarter
  ├─ driver.waitForRunning()              # poll pgrep
  ├─ driver.startCaptureLoop()            # spawn native thread
  └─ return

(test runs)

voiceOver.stop()
  ├─ driver.stopCaptureLoop()             # join native thread
  ├─ driver.terminateProcess()            # killall VoiceOver
  ├─ driver.waitForNotRunning()
  ├─ driver.resetSettings()               # restore the 9 keys
  └─ return
```

---

## Architectural Patterns

### Pattern 1: Native-addon with hot path in native code
**What:** N-API shared library loaded into Node, with all performance-sensitive loops implemented in Zig and a thin JS facade.
**When to use:** When the JS side's job is orchestration and the native side's job is high-frequency polling / I/O with strict timing.
**Trade-offs:**
- ✅ Zero per-call spawn cost
- ✅ Shares process lifecycle with the test runner — no orphaned processes
- ✅ Can allocate large buffers once and reuse
- ❌ Must cross-compile per platform triple
- ❌ Crashes in native code take down the Node worker (mitigation: panic handlers that return N-API errors)

### Pattern 2: Short-lived subprocess per OS call
**What:** Zig layer spawns `osascript` per poll, reads stdout, lets the subprocess die.
**When to use:** When there's no stable in-process API (AppleScript only has a CLI / Apple Event; no stable C API for VO) and the external tool is fast.
**Trade-offs:**
- ✅ Guidepup pattern; proven to work
- ✅ No persistent handle to manage
- ❌ ~5-20ms per spawn — 50ms poll interval accommodates this
- ❌ VO's `with transaction` block is required or queries can race; every script must be wrapped

### Pattern 3: Ring buffer in native code, drained from JS
**What:** The poll loop writes to a bounded ring buffer in Zig. JS calls `drain()` to copy entries since the last drain into a Node `Buffer`, then decodes.
**When to use:** When emission rate >> consumption rate and memory safety matters.
**Trade-offs:**
- ✅ Bounded memory
- ✅ One crossing per drain instead of per phrase
- ✅ Overflow is observable (dropped count), not silent
- ❌ Two copies of state (Zig + JS mirror for `clear` semantics)

### Pattern 4: Test-framework adapters, not built-in bindings
**What:** Core SDK has zero Vitest/Playwright knowledge. Adapter packages wire the SDK into each framework.
**When to use:** When the library must work across frameworks that disagree on configuration model.
**Trade-offs:**
- ✅ Guidepup nailed this; Shoki should follow
- ✅ Users install only the adapter they need
- ❌ Three packages to maintain instead of one
- ❌ Version skew risk — pin adapter peerDependencies tightly

---

## Anti-Patterns

### Anti-Pattern 1: Booting VoiceOver from the browser-side test code
**What people do:** Try to call shoki APIs directly inside the browser-side test file without going through Vitest commands.
**Why it's wrong:** The browser is a sandbox. It can't `require('.node')`, can't `exec('osascript')`, can't read plist files. Attempts to abstract this away (e.g. "shoki works the same in browser and Node") produce broken magic and mystery errors.
**Do this instead:** Always cross the Node-browser boundary explicitly via `BrowserCommand`s. The SDK should make it obvious which API runs where (e.g. `@shoki/sdk` = Node-only, `@shoki/vitest/browser` = browser-side facade that only forwards to commands).

### Anti-Pattern 2: Polling from TypeScript instead of Zig
**What people do:** Expose `binding.lastPhrase()` as a synchronous call and build the poll loop in JS.
**Why it's wrong:** Every poll crosses N-API, hits the Node event loop, and competes with test code. 50 ms × a long test = thousands of FFI crossings. Yuku's claimed speed win doesn't apply if you're fighting the event loop.
**Do this instead:** Zig owns the loop and the timer. JS just calls `drain()` when it wants to see what's accumulated.

### Anti-Pattern 3: Leaving VO settings mutated on crash
**What people do:** Restore plist settings only in the happy-path `stop()`.
**Why it's wrong:** A test suite crash leaves the user's VO muted, at 90% rate, with no greeting. Blind developers running Shoki will have their system broken.
**Do this instead:** Hook `process.on('exit' | 'uncaughtException' | 'unhandledRejection' | 'SIGINT' | 'SIGTERM')` to restore. Guidepup does this (verified in `configureSettings.ts:135`); Shoki must.

### Anti-Pattern 4: Assuming VoiceOver is deterministic
**What people do:** Write tests that assert on exact phrase order immediately after an interaction.
**Why it's wrong:** VO reorders, debounces, and drops speech under its own rules. There are real timing races between AX event emission and speech buffer update.
**Do this instead:** The SDK should provide `awaitStableLog()` / `waitFor(predicate)` helpers. Users should assert on *content presence*, not exact sequence, unless they've already stabilized.

### Anti-Pattern 5: One giant "shoki" npm package
**What people do:** Ship SDK, all adapters, setup CLI, and all platform bindings as one package.
**Why it's wrong:** A Playwright-only user installs 50MB of Vitest dependencies. A Linux dev can't `npm install` without a darwin binary warning storm.
**Do this instead:** `@shoki/sdk` is the core; adapters are separate; platform bindings are `optionalDependencies` (Yuku pattern, verified).

---

## Integration Points

### External "services" (OS primitives)

| Thing | Integration pattern | Notes |
|---|---|---|
| `osascript` CLI | Subprocess per AppleScript invocation, stdin=script, stdout=reply | Wrap every script in `with timeout of N seconds` and `with transaction`; retry on Apple Event timeout |
| `defaults` CLI | Subprocess per key | 9 calls on start, 9 on stop; parallelizable via `Promise.all`/`std.Thread.Pool` |
| `VoiceOverStarter` binary | One-shot exec | Returns immediately; must then poll `pgrep VoiceOver` to confirm |
| `.VoiceOverAppleScriptEnabled` file | Filesystem read | Checks feasibility at `detect()`; write is SIP-guarded so setup CLI handles it |
| TCC.db | Filesystem write (setup CLI only) | SIP must be off; fall back to manual instructions |
| Playwright CDP / WebDriverIO | Via `@vitest/browser-playwright` provider | Shoki doesn't touch this directly; Vitest owns browser automation |

### Internal boundaries

| Boundary | Communication | Notes |
|---|---|---|
| Browser test ↔ Node orchestrator | Vitest custom commands over WSS (tinyRPC); JSON-serializable payloads only | No Dates in returns — use `number` ms timestamps |
| TS SDK ↔ Zig addon | N-API calls; bulk data as Node `Buffer` | Strings UTF-8; structured data as length-prefixed binary per wire.zig |
| Zig core ↔ Zig driver | Vtable (function pointers on a struct) | Compile-time dispatched via comptime switch; no runtime dispatch cost |
| Zig driver ↔ OS | Subprocess spawn + stdio | Retry wrapper, transaction wrapper |

---

## Build Order Implications for Roadmap

The architecture dictates a strict build order because later components depend on earlier ones' ABIs.

### Phase 1 — Zig core skeleton (no drivers)
- `build.zig` with napi-zig dependency
- `src/core/napi.zig` exports trivial `ping()` callable from TS
- `src/core/log_store.zig` — ring buffer, tested
- `src/core/wire.zig` — Buffer encoding
- One `@shoki/binding-darwin-arm64` package builds and publishes via CI
- TS SDK can `require()` the addon and call `ping()`

**Exit criteria:** `console.log(await binding.ping())` prints `"pong"` on macOS Apple Silicon.

### Phase 2 — VoiceOver driver (observe-only)
- `src/drivers/voiceover/applescript.zig` — spawn osascript, transaction wrapper
- `src/drivers/voiceover/defaults.zig` — read/write the 9 keys
- `src/drivers/voiceover/starter.zig` — exec VoiceOverStarter, pgrep loop
- `src/drivers/voiceover/driver.zig` — implements Driver vtable; runs the 50 ms poll loop in a native thread; writes to log_store
- TS facade: `voiceOver.start()`, `voiceOver.stop()`, `voiceOver.spokenPhraseLog()`, `voiceOver.clearSpokenPhraseLog()`

**Exit criteria:** A standalone Node script (no Vitest) can start VO, cause a phrase (e.g. by invoking `say` or by AppleScript), capture it, assert, and stop cleanly without mutated plist.

### Phase 3 — Setup CLI
- `@shoki/setup` with `doctor` (diagnose-only) and `setup` (requires SIP off, warns loudly)
- Writes `.VoiceOverAppleScriptEnabled`, tccutil entries
- Documents manual steps for SIP-protected bits

**Exit criteria:** `npx shoki doctor` on a fresh Mac identifies all missing permissions; `npx shoki setup --unsafe` with SIP off makes them pass.

### Phase 4 — Vitest browser-mode integration (the v1 target)
- `@shoki/vitest` plugin with `BrowserCommand` wiring for listen/drain/stop/clear/reset
- Helpers for the browser side: `awaitStableLog()`, typed wrappers around `commands.*`
- Example repos for react/vue component libraries

**Exit criteria:** The `voiceOver.listen()` in a Vitest browser mode test — PROJECT.md's "if everything else fails, this must work" — produces a structured log the test can assert on, locally.

### Phase 5 — CI story
- `@shoki/action` GitHub Action
- Tart image + reference workflow (self-hosted or Cirrus runner)
- Same example repos run green in GH Actions on GetMac

**Exit criteria:** The Phase 4 example runs identically on a developer Mac and on a GH Actions macOS runner.

### Phase 6+ — NVDA, Orca
- Only attempted after VO is rock solid
- Each adds one `src/drivers/<sr>/` directory, one registry arm, two more platform bindings
- API surface unchanged; users just pick the driver

### Build-order invariants worth stating plainly

1. **N-API shape freezes before drivers.** If `drain()`'s Buffer format changes after you've shipped a driver, every driver must be updated. Spend effort on `wire.zig` up front.
2. **Setup CLI comes before Vitest adapter.** Without setup, the adapter can't even run locally. Don't optimize for a user who has VO automation already configured — they don't exist.
3. **Tart comes after local works.** A VM recipe that can't be validated against a working local is a recipe that isn't known to work. Local Mac parity first, Tart as reproduction second.
4. **Extensibility is paper until it's proven.** Treat the `Driver` interface as preliminary until NVDA lands. Adding the second driver always exposes design assumptions the first driver baked in. Don't let "future extensibility" be an excuse for over-design in v1.

---

## Scaling Considerations

This isn't a web service, but there are analogous scaling dimensions:

| Dimension | Small (1 test) | Medium (100 tests in a suite) | Large (CI matrix, 10 shards × 100 tests) |
|---|---|---|---|
| VO start cost | 1× | 1× per worker (amortized across tests) | 1× per runner; Tart image cold-start ~30s |
| Poll overhead | 20 QPS osascript | 20 QPS osascript (poll rate is fixed) | 20 QPS × N workers (only matters if co-located) |
| Log buffer | <1 KB | <1 MB | <1 MB per worker |
| Setup state pollution | Reset on exit handles it | Per-worker resets | Tart snapshot: just discard the VM |

**Primary bottleneck:** VO itself. VoiceOver serializes speech — two rapid-fire interactions will produce interleaved or dropped phrases regardless of how fast Shoki polls. Parallelism across tests on the same machine is fundamentally limited to one-VO-per-machine. Shoki should document this, not try to engineer around it.

**Secondary bottleneck:** macOS runner availability. Per PROJECT.md, GetMac and self-hosted runners are the target. Shoki doesn't have to solve runner cost, just work well on them.

---

## Confidence Notes

- **HIGH** on process model (N-API in-process) — directly verified against Yuku source; this is not inference.
- **HIGH** on VO capture pipeline — Guidepup source is open and the implementation pattern is well-understood (`LogStore.ts`, `lastSpokenPhrase.ts`, `configureSettings.ts` all read directly).
- **HIGH** on Vitest browser mode integration — Vitest docs confirm `BrowserCommand`, `@vitest/browser/context`, Playwright provider. Sequence diagram is consistent with documented architecture.
- **MEDIUM** on Tart-with-VoiceOver — community evidence confirms VO works in Apple Silicon VMs but no authoritative Apple docs; single-VO-per-machine constraint noted.
- **MEDIUM** on comptime-dispatched driver registry — sound Zig idiom; no prior-art exemplar in screen-reader space.
- **LOW** on exact setup-CLI command set for GetMac — behavior depends on GetMac's image, which evolves. The pattern (follow Guidepup's `@guidepup/setup`) is right; exact commands will shake out during implementation.

---

## Sources

- Guidepup source (cloned `guidepup/guidepup@main`): `src/ScreenReader.ts`, `src/macOS/VoiceOver/LogStore.ts`, `src/macOS/VoiceOver/lastSpokenPhrase.ts`, `src/macOS/VoiceOver/configureSettings.ts`, `src/macOS/VoiceOver/constants.ts`, `src/macOS/VoiceOver/VoiceOver.ts`, `src/macOS/runAppleScript.ts`, `src/macOS/withTransaction.ts`, `src/macOS/VoiceOver/start.ts`
- Yuku source (cloned `yuku-toolchain/yuku@main`): `npm/yuku-parser/package.json`, `npm/yuku-parser/binding.js`, `npm/yuku-parser/index.js`, `build.zig`, `src/parser/ffi/napi.zig`
- [Vitest Browser Mode docs](https://vitest.dev/guide/browser/)
- [Vitest Browser Commands API](https://vitest.dev/api/browser/commands)
- [Vitest browser.commands config](https://vitest.dev/config/browser/commands)
- [Vitest Context API](https://vitest.dev/api/browser/context)
- [Guidepup Manual Setup](https://www.guidepup.dev/docs/guides/manual-voiceover-setup)
- [@guidepup/setup GitHub Action](https://github.com/marketplace/actions/guidepup-setup)
- [cirruslabs/tart](https://github.com/cirruslabs/tart) — macOS VMs on Apple Silicon
- [Apple Virtualization Framework](https://developer.apple.com/documentation/virtualization)
- [VoiceOver and VMs — Eclectic Light](https://eclecticlight.co/2023/09/03/last-week-on-my-mac-voiceover-and-vms/)
- [napi-zig package](https://zigistry.dev/packages/github/chearon/node-api-zig)
- [macOS TCC deep dive — Rainforest QA](https://www.rainforestqa.com/blog/macos-tcc-db-deep-dive)
- [jacobsalmela/tccutil](https://github.com/jacobsalmela/tccutil)

---
*Architecture research for: Shoki — screen-reader test automation (Zig core + TS SDK, macOS/VoiceOver v1)*
*Researched: 2026-04-17*
