import XCTest
import Foundation
@testable import ShokiRunnerProtocol
@testable import ShokiRunnerService

final class XPCPingTests: XCTestCase {
    /// In-process NSXPCConnection ping — bypasses launchd. Verifies the protocol +
    /// service wiring without needing the full signed bundle.
    func testAnonymousListenerPing() throws {
        let delegate = ShokiRunnerListenerDelegate()
        let listener = NSXPCListener.anonymous()
        listener.delegate = delegate
        listener.resume()
        defer { listener.invalidate() }

        let connection = NSXPCConnection(listenerEndpoint: listener.endpoint)
        connection.remoteObjectInterface = NSXPCInterface(with: ShokiRunnerProtocol.self)
        connection.resume()
        defer { connection.invalidate() }

        let proxy = connection.remoteObjectProxyWithErrorHandler { error in
            XCTFail("XPC proxy error: \(error)")
        } as? ShokiRunnerProtocol

        XCTAssertNotNil(proxy)

        let expectation = self.expectation(description: "ping reply")
        proxy?.ping { reply in
            XCTAssertEqual(reply, "shoki-runner-pong")
            expectation.fulfill()
        }

        wait(for: [expectation], timeout: 5.0)
    }

    func testServiceDirectCall() {
        let service = ShokiRunnerService()
        let expectation = self.expectation(description: "direct reply")
        service.ping { reply in
            XCTAssertEqual(reply, "shoki-runner-pong")
            expectation.fulfill()
        }
        wait(for: [expectation], timeout: 1.0)
    }
}
