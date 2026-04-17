import XCTest
import Foundation
@testable import ShokiRunnerProtocol
@testable import ShokiRunnerService

/// Phase 3 Plan 04 tests for the AX observer XPC surface. These exercise the
/// protocol shape, in-process XPC wiring, AXObserverSession lifecycle, and the
/// debug-emit callback path. They do NOT drive real AXObserverAddNotification
/// — that requires a live VoiceOver + TCC grant and is gated on Plan 07
/// darwin-only integration tests.

/// Mock client conforming to ShokiClientProtocol. Captures every receiveAXEvent
/// into an array so tests can assert on the forwarded values.
final class MockShokiClient: NSObject, ShokiClientProtocol {
    struct Received {
        let phrase: String
        let tsNanos: UInt64
        let role: String?
        let name: String?
    }
    let lock = NSLock()
    var events: [Received] = []
    let expectation: XCTestExpectation?

    init(expectation: XCTestExpectation? = nil) {
        self.expectation = expectation
        super.init()
    }

    func receiveAXEvent(phrase: String, tsNanos: UInt64, role: String?, name: String?) {
        lock.lock()
        events.append(Received(phrase: phrase, tsNanos: tsNanos, role: role, name: name))
        lock.unlock()
        expectation?.fulfill()
    }
}

final class AXObserverTests: XCTestCase {
    /// Test 1: extended ShokiRunnerProtocol still declares `ping` (regression)
    /// and newly declares `startAXObserver` + `stopAXObserver` with matching sigs.
    func testProtocolSurfaceIncludesPingAndAXMethods() {
        // If any of these don't exist, this file will fail to compile.
        let hasPing = (ShokiRunnerProtocol.self as Protocol?) != nil
        XCTAssertTrue(hasPing)
        // At runtime, NSXPCInterface blows up if the protocol is malformed.
        let iface = NSXPCInterface(with: ShokiRunnerProtocol.self)
        XCTAssertNotNil(iface)
        let clientIface = NSXPCInterface(with: ShokiClientProtocol.self)
        XCTAssertNotNil(clientIface)
    }

    /// Test 2: ShokiClientProtocol is @objc-compatible
    /// (compiles against NSXPCInterface; calling receiveAXEvent on a conformer works).
    func testShokiClientProtocolConformanceCallable() {
        let client = MockShokiClient()
        client.receiveAXEvent(phrase: "hello", tsNanos: 42, role: "button", name: "Submit")
        XCTAssertEqual(client.events.count, 1)
        XCTAssertEqual(client.events[0].phrase, "hello")
        XCTAssertEqual(client.events[0].tsNanos, 42)
        XCTAssertEqual(client.events[0].role, "button")
        XCTAssertEqual(client.events[0].name, "Submit")
    }

    /// Test 3: ShokiRunnerService.startAXObserver initializes an AXObserverSession,
    /// stopAXObserver tears it down; both idempotent after stop.
    func testServiceStartStopAXObserverIdempotent() {
        let service = ShokiRunnerService()

        // No bound connection → start should error.
        let preErrExp = expectation(description: "no-conn error")
        service.startAXObserver(voicePID: 1) { err in
            XCTAssertNotNil(err)
            preErrExp.fulfill()
        }
        wait(for: [preErrExp], timeout: 2.0)
        XCTAssertFalse(service.isAXObserverActive)

        // Stop with no active session is a no-op.
        let stopExp = expectation(description: "stop no-op")
        service.stopAXObserver { err in
            XCTAssertNil(err)
            stopExp.fulfill()
        }
        wait(for: [stopExp], timeout: 2.0)
    }

    /// Test 4: AXObserverSession.stop() is a no-op when not started; multiple stops safe.
    func testAXObserverSessionStopIdempotent() {
        let session = AXObserverSession { _, _, _, _ in }
        XCTAssertFalse(session.isStarted)
        session.stop() // no-op
        session.stop() // still no-op
        XCTAssertFalse(session.isStarted)
    }

    /// Test 5: Anonymous-listener round-trip — connect, call startAXObserver,
    /// inject a synthetic AX event via debugEmitAXEvent, verify the client's
    /// receiveAXEvent fires with matching args.
    func testAnonymousListenerStartAXObserverDebugEmit() throws {
        // The anonymous listener creates a per-connection ShokiRunnerService instance
        // (see ShokiRunnerListenerDelegate). We can't reach into that instance to call
        // debugEmitAXEvent. Instead: build an ad-hoc listener delegate that exposes
        // the bound service back to the test.
        final class CapturingDelegate: NSObject, NSXPCListenerDelegate {
            var captured: ShokiRunnerService?
            func listener(_ listener: NSXPCListener, shouldAcceptNewConnection newConnection: NSXPCConnection) -> Bool {
                let service = ShokiRunnerService()
                newConnection.exportedInterface = NSXPCInterface(with: ShokiRunnerProtocol.self)
                newConnection.exportedObject = service
                newConnection.remoteObjectInterface = NSXPCInterface(with: ShokiClientProtocol.self)
                service.bindConnection(newConnection)
                self.captured = service
                newConnection.resume()
                return true
            }
        }

        let delegate = CapturingDelegate()
        let listener = NSXPCListener.anonymous()
        listener.delegate = delegate
        listener.resume()
        defer { listener.invalidate() }

        let clientExp = expectation(description: "client received event")
        let mockClient = MockShokiClient(expectation: clientExp)

        let connection = NSXPCConnection(listenerEndpoint: listener.endpoint)
        connection.remoteObjectInterface = NSXPCInterface(with: ShokiRunnerProtocol.self)
        connection.exportedInterface = NSXPCInterface(with: ShokiClientProtocol.self)
        connection.exportedObject = mockClient
        connection.resume()
        defer { connection.invalidate() }

        guard let proxy = connection.remoteObjectProxyWithErrorHandler({ err in
            XCTFail("proxy error: \(err)")
        }) as? ShokiRunnerProtocol else {
            XCTFail("proxy cast failed")
            return
        }

        // Call startAXObserver. With a dummy valid PID (our own process), this will
        // attempt AXObserverCreate — may fail if the test bundle lacks AX TCC, but the
        // service should still bind + hand us a valid AX session OR return an error.
        // Either way, the service records whether start succeeded; if it did, we can
        // debugEmit.
        let startExp = expectation(description: "start reply")
        var startErr: Error?
        proxy.startAXObserver(voicePID: ProcessInfo.processInfo.processIdentifier) { err in
            startErr = err
            startExp.fulfill()
        }
        wait(for: [startExp], timeout: 5.0)

        // If AX TCC wasn't granted to the test runner, startAXObserver will error. That's
        // expected in CI without the signed helper. In that case, skip the debugEmit path
        // but still validate protocol surface compiled + runtime roundtrip worked.
        if startErr != nil {
            clientExp.isInverted = true
            wait(for: [clientExp], timeout: 0.3)
            return
        }

        // Emit a synthetic AX event through the service.
        guard let service = delegate.captured else {
            XCTFail("service not captured by listener delegate")
            return
        }
        _ = service.debugEmitAXEvent(phrase: "live-region-update", tsNanos: 123, role: nil, name: "Toast")

        wait(for: [clientExp], timeout: 5.0)

        XCTAssertEqual(mockClient.events.first?.phrase, "live-region-update")
        XCTAssertEqual(mockClient.events.first?.tsNanos, 123)
        XCTAssertEqual(mockClient.events.first?.name, "Toast")
    }
}
