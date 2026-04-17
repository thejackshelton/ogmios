import Foundation
import ShokiRunnerProtocol
import ShokiRunnerService

// NSXPCListener: publish the service under the mach service name declared in Info.plist
// (MachServices dictionary -> org.shoki.runner). The launchd job definition lives in the
// app bundle's Info.plist; `ShokiRunner` itself just starts the listener and parks.
let delegate = ShokiRunnerListenerDelegate()
let listener = NSXPCListener(machServiceName: ShokiRunnerMachServiceName)
listener.delegate = delegate
listener.resume()

// Phase 1: park on the run loop. Phase 3 will extend the protocol to drive VO;
// the run loop model doesn't change.
RunLoop.main.run()
