import Foundation

/// Dexcom G6/G7 adapter. Real implementation will use the Dexcom Mobile
/// SDK (BLE) once the partner agreement is in place. Until then this
/// returns an empty discovery list and rejects start with `notImplemented`.
///
/// Vendor-specific quirks tracked here, none anywhere else:
/// - Dexcom session windows (~10 days G6 / ~10 days G7).
/// - 5-minute sample cadence.
/// - Backfill on reconnect: emit those readings with `readingKind = .backfill`.
public final class DexcomAdapter: SensorAdapter {
    public let vendor: GlucoseEvent.Vendor = .dexcom
    public private(set) var deviceName: String?
    public private(set) var isReady: Bool = false

    public init(deviceName: String? = "Dexcom") {
        self.deviceName = deviceName
        // Real impl flips isReady when the SDK has initialized.
    }

    public func discover() async throws -> [DiscoveredSensor] {
        // TODO(dexcom): scan via DexcomShareClient / Dexcom Mobile SDK.
        return []
    }

    public func pair(_ sensor: DiscoveredSensor) async throws {
        throw SensorAdapterError.notImplemented
    }

    public func start(onEvent: @escaping (GlucoseEvent) -> Void) async throws {
        throw SensorAdapterError.notImplemented
    }

    public func stop() async {
        // No-op until real BLE session exists.
    }
}
