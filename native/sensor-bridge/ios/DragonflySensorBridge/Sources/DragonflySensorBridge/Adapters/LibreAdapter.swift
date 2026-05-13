import Foundation

/// Abbott FreeStyle Libre adapter. Libre 1 is NFC-only (tap to scan);
/// Libre 2 supports BLE streaming after NFC activation. Real
/// implementation requires the LibreLink / Abbott partner agreement.
///
/// Vendor-specific quirks:
/// - Sensor activation countdown after first tap; readings invalid until
///   warm-up completes (~60 minutes).
/// - mmol/L vs mg/dL: EU sensors typically report mmol/L; convert with
///   `mmolPerLToMgDl(_:)` before emitting.
/// - NFC reads return up to ~8h of history per tap; emit them with
///   `readingKind = .backfill` and `ingestionPath = .nativeNfc`.
public final class LibreAdapter: SensorAdapter {
    public let vendor: GlucoseEvent.Vendor = .libre
    public private(set) var deviceName: String?
    public private(set) var isReady: Bool = false

    public enum Mode { case nfcOnly, bleStream }
    public let mode: Mode

    public init(deviceName: String? = "Abbott Libre", mode: Mode = .nfcOnly) {
        self.deviceName = deviceName
        self.mode = mode
        // Real impl flips isReady when NFC capability and/or the BLE
        // streaming SDK is initialized and entitlements are present.
    }

    public func discover() async throws -> [DiscoveredSensor] {
        // TODO(libre): trigger NFCNDEFReaderSession to find a tag, or
        // surface the previously-paired sensor for Libre 2 BLE.
        return []
    }

    public func pair(_ sensor: DiscoveredSensor) async throws {
        throw SensorAdapterError.notImplemented
    }

    public func start(onEvent: @escaping (GlucoseEvent) -> Void) async throws {
        throw SensorAdapterError.notImplemented
    }

    public func stop() async {
        // No-op until real session exists.
    }
}
