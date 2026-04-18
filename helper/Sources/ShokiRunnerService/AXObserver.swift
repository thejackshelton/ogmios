import Foundation
import ApplicationServices
import CoreFoundation

/// Wraps an `AXObserver` subscribed to `kAXAnnouncementRequestedNotification` on a
/// specific target application's `AXUIElement` (Phase 7 Plan 04). The observer runs on
/// its own dedicated thread with a private CFRunLoop; `stop()` removes the source and
/// tears the thread's runloop down.
///
/// Callers pass an `EventCallback` at construction; the callback fires on the observer
/// thread each time the target app requests an announcement.
///
/// ## Phase 7 Plan 04 semantic change — "DOM vs Chrome URL bar"
///
/// Previously this module observed `AXUIElementCreateSystemWide()` — i.e. EVERY
/// announcement from EVERY app on the machine, including the Chromium parent
/// process's URL bar / tab title / address-bar autofill. Under Vitest browser-mode
/// that meant tests that asserted "announcement contains 'foo'" could get a false
/// positive from VO reading the URL bar.
///
/// The observer is now bound to a specific application pid (typically the
/// Chromium RENDERER child process that owns the test viewport). Only AX events
/// dispatched from that process reach the callback. Callers resolve the renderer
/// pid via `pgrep -f "Chromium Helper (Renderer)"` (see the Zig
/// `resolveChromeRendererPid` helper) and pass it through as `targetAppPID`.
///
/// AX API notes:
/// - `AXObserverCreateWithInfoCallback` (macOS 10.11+) gives the userInfo dict; prefer it
///   over the plain `AXObserverCreate` variant.
/// - The observer must be attached to a thread with a running CFRunLoop; we spin one up.
/// - Accessibility (AX) observation requires TCC grant. ShokiRunner.app holds it (Phase 1).
public final class AXObserverSession {
    public typealias EventCallback = (_ phrase: String, _ tsNanos: UInt64, _ role: String?, _ name: String?) -> Void

    private var observer: AXObserver?
    private var targetElement: AXUIElement?
    private var runLoopSource: CFRunLoopSource?
    private var runLoop: CFRunLoop?
    private var observerThread: Thread?
    private let callback: EventCallback
    private var started = false
    private let lock = NSLock()

    public init(callback: @escaping EventCallback) {
        self.callback = callback
    }

    /// Subscribe to announcement notifications from the given target application PID.
    /// Idempotent: calling start twice is a no-op after the first success.
    ///
    /// `targetAppPID` names the APP BEING OBSERVED (e.g. the Chromium renderer
    /// child process under Vitest browser-mode), NOT the VoiceOver process PID.
    /// AXObserverCreateWithInfoCallback is bound to this pid and
    /// AXUIElementCreateApplication(pid) scopes the subscription so ONLY events
    /// originating inside that app reach the callback.
    public func start(targetAppPID: pid_t) throws {
        lock.lock(); defer { lock.unlock() }
        if started { return }

        var obs: AXObserver?
        let selfPtr = Unmanaged.passUnretained(self).toOpaque()
        let err = AXObserverCreateWithInfoCallback(targetAppPID, AXObserverSession.axCCallback, &obs)
        guard err == .success, let observer = obs else {
            throw NSError(
                domain: "org.shoki.runner",
                code: Int(err.rawValue),
                userInfo: [NSLocalizedDescriptionKey: "AXObserverCreateWithInfoCallback failed with \(err.rawValue)"]
            )
        }
        self.observer = observer

        // Phase 7 Plan 04: scope to the target app's AXUIElement instead of the
        // system-wide element. This is the "DOM vs Chrome URL bar" filter — it
        // keeps the Chromium parent-process chrome (URL bar, tab title) from
        // leaking into the capture log.
        let appElement = AXUIElementCreateApplication(targetAppPID)
        self.targetElement = appElement
        let addErr = AXObserverAddNotification(
            observer,
            appElement,
            kAXAnnouncementRequestedNotification as CFString,
            selfPtr
        )
        guard addErr == .success else {
            self.observer = nil
            self.targetElement = nil
            throw NSError(
                domain: "org.shoki.runner",
                code: Int(addErr.rawValue),
                userInfo: [NSLocalizedDescriptionKey: "AXObserverAddNotification failed with \(addErr.rawValue)"]
            )
        }

        // Run the observer on a dedicated thread with its own runloop.
        let thread = Thread { [weak self] in
            guard let self = self, let obs = self.observer else { return }
            let rl = CFRunLoopGetCurrent()
            self.runLoop = rl
            let src = AXObserverGetRunLoopSource(obs)
            self.runLoopSource = src
            CFRunLoopAddSource(rl, src, .defaultMode)
            CFRunLoopRun()
        }
        thread.name = "shoki-ax-observer"
        thread.start()
        self.observerThread = thread
        started = true
    }

    public func stop() {
        lock.lock(); defer { lock.unlock() }
        if !started { return }
        if let rl = runLoop, let src = runLoopSource {
            CFRunLoopRemoveSource(rl, src, .defaultMode)
            CFRunLoopStop(rl)
        }
        runLoopSource = nil
        runLoop = nil
        observer = nil
        targetElement = nil
        observerThread = nil
        started = false
    }

    /// Test-only: invoke the callback manually as if an AX notification had fired.
    /// The real callback path goes through `axCCallback` from the AX runloop; this
    /// helper lets tests exercise downstream behavior without AX TCC or a real VO.
    public func debugEmit(phrase: String, tsNanos: UInt64, role: String?, name: String?) {
        callback(phrase, tsNanos, role, name)
    }

    public var isStarted: Bool {
        lock.lock(); defer { lock.unlock() }
        return started
    }

    private static let axCCallback: AXObserverCallbackWithInfo = { _, _, _, userInfo, refcon in
        guard let refcon = refcon else { return }
        let session = Unmanaged<AXObserverSession>.fromOpaque(refcon).takeUnretainedValue()

        let dict = (userInfo as NSDictionary?) as? [String: Any] ?? [:]
        let phrase = (dict["AXAnnouncement"] as? String) ?? ""
        let name = dict["AXUIElementTitle"] as? String
        let role: String? = nil // VO announcements rarely carry AXRole; callers enrich if needed.
        let ts = UInt64(Date().timeIntervalSince1970 * 1_000_000_000)
        session.callback(phrase, ts, role, name)
    }
}
