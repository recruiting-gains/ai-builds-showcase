// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AirframeMac",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "AirframeMac", targets: ["AirframeMac"]),
        .executable(name: "AirframeChecks", targets: ["AirframeChecks"]),
    ],
    targets: [
        .target(name: "AirframeCore"),
        .executableTarget(name: "AirframeMac", dependencies: ["AirframeCore"]),
        .executableTarget(name: "AirframeChecks", dependencies: ["AirframeCore"]),
        .testTarget(name: "AirframeCoreTests", dependencies: ["AirframeCore"]),
    ]
)
