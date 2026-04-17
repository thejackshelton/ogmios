import Foundation
import ShokiRunnerProtocol

/// C-callable shim that Zig links against (`libShokiXPCClient.dylib`).
///
/// Flow:
///  1. Zig calls `shoki_xpc_connect` → returns an opaque handle (retained Swift object)
///  2. Zig calls `shoki_xpc_set_event_callback` → Swift stores the C fn + userdata
///  3. Zig calls `shoki_xpc_start_ax_observer(handle, pid)` → forwarded to helper
///  4. Helper receives AX events → calls `receiveAXEvent` on this Swift object
///  5. This object invokes the registered C callback with a null-terminated phrase
///  6. Zig cEventCallback dupes the phrase and pushes a ring Entry
///  7. On shutdown: `shoki_xpc_stop_ax_observer` then `shoki_xpc_disconnect`
///
/// NOTE: This is NOT loaded during Zig unit tests — they use a MockXpcBackend. It's
/// exercised by Plan 05's integration script and Plan 07's darwin tests.

/// Opaque handle (actually a retained Swift class). Holds the NSXPCConnection and
/// a C function pointer for forwarding received AX events up to Zig.
private final class XPCClientSession: NSObject, ShokiClientProtocol {
    var connection: NSXPCConnection?
    var callback: (@convention(c) (
        UnsafePointer<CChar>,
        UInt64,
        UnsafePointer<CChar>?,
        UnsafePointer<CChar>?,
        UnsafeMutableRawPointer?
    ) -> Void)? = nil
    var userdata: UnsafeMutableRawPointer? = nil

    func receiveAXEvent(phrase: String, tsNanos: UInt64, role: String?, name: String?) {
        guard let cb = callback else { return }
        // Hold onto owned C strings for the duration of the callback. When this
        // function returns, Swift's `withCString` buffers are invalid — Zig MUST
        // copy the phrase/role/name bytes before returning.
        phrase.withCString { phrasePtr in
            if let role = role {
                role.withCString { rolePtr in
                    if let name = name {
                        name.withCString { namePtr in
                            cb(phrasePtr, tsNanos, rolePtr, namePtr, userdata)
                        }
                    } else {
                        cb(phrasePtr, tsNanos, rolePtr, nil, userdata)
                    }
                }
            } else if let name = name {
                name.withCString { namePtr in
                    cb(phrasePtr, tsNanos, nil, namePtr, userdata)
                }
            } else {
                cb(phrasePtr, tsNanos, nil, nil, userdata)
            }
        }
    }
}

@_cdecl("shoki_xpc_connect")
public func shoki_xpc_connect() -> UnsafeMutableRawPointer? {
    let session = XPCClientSession()
    let conn = NSXPCConnection(machServiceName: ShokiRunnerMachServiceName, options: [])
    conn.remoteObjectInterface = NSXPCInterface(with: ShokiRunnerProtocol.self)
    conn.exportedInterface = NSXPCInterface(with: ShokiClientProtocol.self)
    conn.exportedObject = session
    conn.resume()
    session.connection = conn
    return Unmanaged.passRetained(session).toOpaque()
}

@_cdecl("shoki_xpc_set_event_callback")
public func shoki_xpc_set_event_callback(
    _ handle: UnsafeMutableRawPointer,
    _ cb: @escaping @convention(c) (
        UnsafePointer<CChar>,
        UInt64,
        UnsafePointer<CChar>?,
        UnsafePointer<CChar>?,
        UnsafeMutableRawPointer?
    ) -> Void,
    _ userdata: UnsafeMutableRawPointer?
) {
    let session = Unmanaged<XPCClientSession>.fromOpaque(handle).takeUnretainedValue()
    session.callback = cb
    session.userdata = userdata
}

@_cdecl("shoki_xpc_start_ax_observer")
public func shoki_xpc_start_ax_observer(_ handle: UnsafeMutableRawPointer, _ pid: Int32) -> Int32 {
    let session = Unmanaged<XPCClientSession>.fromOpaque(handle).takeUnretainedValue()
    guard let proxy = session.connection?.remoteObjectProxy as? ShokiRunnerProtocol else { return -1 }
    let sem = DispatchSemaphore(value: 0)
    var rc: Int32 = 0
    proxy.startAXObserver(voicePID: pid) { err in
        if err != nil { rc = -2 }
        sem.signal()
    }
    _ = sem.wait(timeout: .now() + 5)
    return rc
}

@_cdecl("shoki_xpc_stop_ax_observer")
public func shoki_xpc_stop_ax_observer(_ handle: UnsafeMutableRawPointer) -> Int32 {
    let session = Unmanaged<XPCClientSession>.fromOpaque(handle).takeUnretainedValue()
    guard let proxy = session.connection?.remoteObjectProxy as? ShokiRunnerProtocol else { return -1 }
    let sem = DispatchSemaphore(value: 0)
    proxy.stopAXObserver { _ in sem.signal() }
    _ = sem.wait(timeout: .now() + 2)
    return 0
}

@_cdecl("shoki_xpc_disconnect")
public func shoki_xpc_disconnect(_ handle: UnsafeMutableRawPointer) {
    let session = Unmanaged<XPCClientSession>.fromOpaque(handle).takeRetainedValue()
    session.connection?.invalidate()
    session.connection = nil
}
