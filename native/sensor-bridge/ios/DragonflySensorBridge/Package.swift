// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "DragonflySensorBridge",
    platforms: [
        .iOS(.v16),
    ],
    products: [
        .library(
            name: "DragonflySensorBridge",
            targets: ["DragonflySensorBridge"]
        ),
    ],
    dependencies: [],
    targets: [
        .target(
            name: "DragonflySensorBridge",
            dependencies: [],
            path: "Sources/DragonflySensorBridge"
        ),
        .testTarget(
            name: "DragonflySensorBridgeTests",
            dependencies: ["DragonflySensorBridge"],
            path: "Tests/DragonflySensorBridgeTests"
        ),
    ]
)
