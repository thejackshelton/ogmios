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
