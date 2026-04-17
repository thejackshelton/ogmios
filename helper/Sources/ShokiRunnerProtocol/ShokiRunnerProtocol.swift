import Foundation

/// XPC protocol exposed by ShokiRunner.app. Loaded by both:
/// - the Swift-side service (`ShokiRunnerService`)
/// - any NSXPCConnection client (Phase 3: the Zig N-API addon calls this via a Swift bridge)
///
/// ## Stability contract (EXT-01-adjacent)
/// Phase 1 defines the minimal surface. Phase 3 ADDS methods; it does not modify or remove
/// existing ones. Breaking changes require a mach-service-name bump to avoid silent drift.
///
/// ## Security note (T-01-14)
/// Phase 1 only exposes `ping`, which returns a static string and is safe to expose to any
/// caller. Before Phase 3 adds state-changing methods (`startVoiceOver`, etc.), the listener
/// delegate MUST validate the incoming connection's `auditToken` against a pinned code-signing
/// requirement. See NSXPCConnection.setCodeSigningRequirement(_:) (macOS 13+).
@objc public protocol ShokiRunnerProtocol {
    /// Liveness check. Returns `"shoki-runner-pong"` when the service is reachable.
    func ping(reply: @escaping (String) -> Void)

    // Phase 3 additions (not implemented here):
    //   func startVoiceOver(options: [String: Any], reply: @escaping (Error?) -> Void)
    //   func stopVoiceOver(reply: @escaping (Error?) -> Void)
    //   func getLastPhrase(reply: @escaping (String?) -> Void)
}

/// Mach service name. Do not hardcode this string elsewhere — import it from this module.
public let ShokiRunnerMachServiceName = "org.shoki.runner"
