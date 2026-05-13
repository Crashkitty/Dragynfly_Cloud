# Dragonfly Sensor Bridge — Android

Gradle module implementing the Android half of the Dragonfly CGM bridge.
Targets Android 10 (API 29) and up. Uses `android.bluetooth.le` for BLE
and `android.nfc` for Libre tags.

## Build

```bash
cd native/sensor-bridge/android
./gradlew :sensor-bridge:assembleDebug
./gradlew :sensor-bridge:test
```

Embed it from the host Android app (Capacitor plugin / native shell) by
adding the module:

```kotlin
// settings.gradle.kts (host app)
includeBuild("../../native/sensor-bridge/android") {
    dependencySubstitution {
        substitute(module("com.dragonfly:sensor-bridge"))
            .using(project(":sensor-bridge"))
    }
}
```

## Status

Adapter scaffolding only. `DexcomAdapter` and `LibreAdapter` compile and
conform to `SensorAdapter`, but neither performs real device IO yet.

## Required permissions (when implementing real IO)

In the host app's `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
```

Foreground service for streaming Dexcom is the right choice — the bridge
exposes a service interface (`SensorBridgeService`) that the host app
should bind from a foreground service.
