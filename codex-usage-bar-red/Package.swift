// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "CodexUsageBar",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "CodexUsageBar", targets: ["CodexUsageBar"])
    ],
    targets: [
        .executableTarget(name: "CodexUsageBar")
    ]
)
