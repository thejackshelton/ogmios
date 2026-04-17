// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ShokiRunner",
    platforms: [
        .macOS(.v13),
    ],
    products: [
        .executable(name: "ShokiRunner", targets: ["ShokiRunner"]),
        .library(name: "ShokiRunnerProtocol", targets: ["ShokiRunnerProtocol"]),
        .library(name: "ShokiRunnerService", targets: ["ShokiRunnerService"]),
        // Phase 3 Plan 04: dynamic library exposing C symbols that the Zig shared
        // library links against to funnel AX events from the helper into Zig.
        .library(name: "ShokiXPCClient", type: .dynamic, targets: ["ShokiXPCClient"]),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "ShokiRunnerProtocol",
            path: "Sources/ShokiRunnerProtocol"
        ),
        .target(
            name: "ShokiRunnerService",
            dependencies: ["ShokiRunnerProtocol"],
            path: "Sources/ShokiRunnerService"
        ),
        .target(
            name: "ShokiXPCClient",
            dependencies: ["ShokiRunnerProtocol"],
            path: "Sources/ShokiXPCClient"
        ),
        .executableTarget(
            name: "ShokiRunner",
            dependencies: ["ShokiRunnerProtocol", "ShokiRunnerService"],
            path: "Sources/ShokiRunner",
            exclude: ["Info.plist", "ShokiRunner.entitlements"]
        ),
        .testTarget(
            name: "ShokiRunnerTests",
            dependencies: ["ShokiRunnerProtocol", "ShokiRunnerService"],
            path: "Tests/ShokiRunnerTests"
        ),
    ]
)
