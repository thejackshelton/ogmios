import Foundation

/// XPC protocol exposed by ShokiRunner.app. Loaded by both:
/// - the Swift-side service (`ShokiRunnerService`)
/// - any NSXPCConnection client (Phase 3: the Zig N-API addon calls this via a Swift bridge)
///
/// ## Stability contract (EXT-01-adjacent)
/// Phase 1 defines the minimal surface. Phase 3 ADDS methods; it does not modify or remove
/// existing ones. Breaking changes require a mach-service-name bump to avoid silent drift.
///
/// ## Security note (T-01-14, T-03-30)
/// Phase 1 only exposes `ping`, which returns a static string and is safe to expose to any
/// caller. Phase 3 adds state-changing methods (`startAXObserver`); the listener delegate
/// validates the incoming connection's `auditToken` against a pinned code-signing requirement
/// (`NSXPCConnection.setCodeSigningRequirement(_:)` on macOS 13+). Full enforcement lives in
/// Plan 05 when signing identities are finalized.
@objc public protocol ShokiRunnerProtocol {
    /// Liveness check. Returns `"shoki-runner-pong"` when the service is reachable.
    func ping(reply: @escaping (String) -> Void)

    // Phase 3 additions (CAP-05). AX observer on the system-wide element targeting
    // the VoiceOver PID; events are delivered via the sibling ShokiClientProtocol's
    // receiveAXEvent on the same NSXPCConnection.
    func startAXObserver(voicePID: Int32, reply: @escaping (Error?) -> Void)
    func stopAXObserver(reply: @escaping (Error?) -> Void)
}

/// Sibling protocol: the Zig side (via its Swift shim) conforms to this and receives
/// AX events pushed from the helper. Declared here so both sides share the type.
///
/// `tsNanos` is nanoseconds since the Unix epoch. `role` and `name` may be nil when the
/// source AX element didn't populate them.
@objc public protocol ShokiClientProtocol {
    func receiveAXEvent(phrase: String, tsNanos: UInt64, role: String?, name: String?)
}

/// Mach service name. Do not hardcode this string elsewhere — import it from this module.
public let ShokiRunnerMachServiceName = "org.shoki.runner"
