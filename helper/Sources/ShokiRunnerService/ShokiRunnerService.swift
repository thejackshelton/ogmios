import Foundation
import ShokiRunnerProtocol

/// Concrete implementation of ShokiRunnerProtocol. Exported over NSXPCConnection by
/// ShokiRunner's NSXPCListener delegate.
public final class ShokiRunnerService: NSObject, ShokiRunnerProtocol {
    private var axSession: AXObserverSession?
    private weak var activeConnection: NSXPCConnection?
    private let lock = NSLock()

    public override init() {
        super.init()
    }

    public func ping(reply: @escaping (String) -> Void) {
        reply("shoki-runner-pong")
    }

    /// Bind the NSXPCConnection the service last accepted. The listener delegate calls
    /// this so the service can resolve the client's `ShokiClientProtocol` proxy when
    /// forwarding AX events.
    public func bindConnection(_ conn: NSXPCConnection) {
        lock.lock(); defer { lock.unlock() }
        self.activeConnection = conn
    }

    public func startAXObserver(voicePID: Int32, reply: @escaping (Error?) -> Void) {
        lock.lock()
        let existing = axSession
        let conn = activeConnection
        lock.unlock()

        // T-03-33: reject a second start before stop.
        if existing != nil {
            reply(NSError(
                domain: "org.shoki.runner",
                code: -10,
                userInfo: [NSLocalizedDescriptionKey: "AX observer already started; call stopAXObserver first"]
            ))
            return
        }
        guard let connection = conn else {
            reply(NSError(
                domain: "org.shoki.runner",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "no active connection — cannot send AX callbacks"]
            ))
            return
        }

        // T-03-31: validate the PID loosely — must be > 0. Deep-identity check
        // (process name == "VoiceOver") is deferred to Plan 05 where we have a
        // helper for PID inspection.
        if voicePID <= 0 {
            reply(NSError(
                domain: "org.shoki.runner",
                code: -11,
                userInfo: [NSLocalizedDescriptionKey: "invalid voicePID \(voicePID)"]
            ))
            return
        }

        let proxy = connection.remoteObjectProxyWithErrorHandler { _ in
            // Proxy errors are non-fatal — AX events will silently drop. Plan 05 adds
            // connection-invalidation handlers that fully tear down on error.
        } as? ShokiClientProtocol

        let session = AXObserverSession { phrase, ts, role, name in
            proxy?.receiveAXEvent(phrase: phrase, tsNanos: ts, role: role, name: name)
        }
        do {
            try session.start(voicePID: voicePID)
            lock.lock()
            self.axSession = session
            lock.unlock()
            reply(nil)
        } catch {
            reply(error)
        }
    }

    public func stopAXObserver(reply: @escaping (Error?) -> Void) {
        lock.lock()
        let session = axSession
        axSession = nil
        lock.unlock()
        session?.stop()
        reply(nil)
    }

    /// Test-only accessor: returns true when an AX session is live.
    public var isAXObserverActive: Bool {
        lock.lock(); defer { lock.unlock() }
        return axSession != nil
    }

    /// Test-only: synchronously emit a synthetic AX event through the registered session.
    /// Returns true iff there is an active session to emit through.
    @discardableResult
    public func debugEmitAXEvent(phrase: String, tsNanos: UInt64, role: String?, name: String?) -> Bool {
        lock.lock()
        let session = axSession
        lock.unlock()
        guard let s = session else { return false }
        s.debugEmit(phrase: phrase, tsNanos: tsNanos, role: role, name: name)
        return true
    }
}

/// NSXPCListenerDelegate that wires ShokiRunnerService as the exported interface
/// for every incoming connection. Kept here (not in main.swift) so the test target
/// can reuse it in-process.
///
/// Phase 3 additions:
/// - `remoteObjectInterface` is set to `ShokiClientProtocol` so the service can
///   invoke `receiveAXEvent` back on the calling process.
/// - The service is notified of the accepted connection via `bindConnection`, used
///   later to resolve the sibling proxy.
public final class ShokiRunnerListenerDelegate: NSObject, NSXPCListenerDelegate {
    public override init() {
        super.init()
    }

    public func listener(
        _ listener: NSXPCListener,
        shouldAcceptNewConnection newConnection: NSXPCConnection
    ) -> Bool {
        let service = ShokiRunnerService()
        newConnection.exportedInterface = NSXPCInterface(with: ShokiRunnerProtocol.self)
        newConnection.exportedObject = service
        newConnection.remoteObjectInterface = NSXPCInterface(with: ShokiClientProtocol.self)
        service.bindConnection(newConnection)
        newConnection.resume()
        return true
    }
}
