# Dragonfly Sensor Bridge — iOS

Swift Package implementing the iOS half of the Dragonfly CGM bridge.
Targets iOS 16+. Uses `CoreBluetooth` for BLE, `CoreNFC` for Libre 1/2
NFC tags.

## Build

```bash
cd native/sensor-bridge/ios/DragonflySensorBridge
swift build              # SPM build
swift test               # placeholder tests
```

To use from the Dragonfly iOS host app (Capacitor / SwiftUI / WKWebView
embed), add this folder as a local package dependency:

```swift
.package(name: "DragonflySensorBridge", path: "../../native/sensor-bridge/ios/DragonflySensorBridge")
```

## Status

Adapter scaffolding only. `DexcomAdapter` and `LibreAdapter` compile and
conform to `SensorAdapter`, but neither performs real device IO yet.
See `Sources/DragonflySensorBridge/Adapters/` for stubs and
`shared/ADAPTERS.md` at the bridge root for the contract.

## Required entitlements (when implementing real IO)

Add to the host app, not the package:

- `NSBluetoothAlwaysUsageDescription`
- `NSBluetoothPeripheralUsageDescription`
- `NFCReaderUsageDescription`
- Background modes: `bluetooth-central` (for Dexcom streaming)
- Add the Libre NFC tag identifiers to `com.apple.developer.nfc.readersession.iso7816.select-identifiers`
