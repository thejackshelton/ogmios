import Foundation
import ShokiRunnerProtocol

/// Concrete implementation of ShokiRunnerProtocol. Exported over NSXPCConnection by
/// ShokiRunner's NSXPCListener delegate.
public final class ShokiRunnerService: NSObject, ShokiRunnerProtocol {
    public override init() {
        super.init()
    }

    public func ping(reply: @escaping (String) -> Void) {
        reply("shoki-runner-pong")
    }
}

/// NSXPCListenerDelegate that wires ShokiRunnerService as the exported interface
/// for every incoming connection. Kept here (not in main.swift) so the test target
/// can reuse it in-process.
public final class ShokiRunnerListenerDelegate: NSObject, NSXPCListenerDelegate {
    public override init() {
        super.init()
    }

    public func listener(
        _ listener: NSXPCListener,
        shouldAcceptNewConnection newConnection: NSXPCConnection
    ) -> Bool {
        newConnection.exportedInterface = NSXPCInterface(with: ShokiRunnerProtocol.self)
        newConnection.exportedObject = ShokiRunnerService()
        newConnection.resume()
        return true
    }
}
