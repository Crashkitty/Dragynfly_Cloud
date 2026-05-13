import Foundation

/// Every CGM vendor adapter conforms to this. The `Bridge` only ever talks
/// to adapters through this protocol so vendor SDK types stay isolated.
public protocol SensorAdapter: AnyObject {
    var vendor: GlucoseEvent.Vendor { get }
    var deviceName: String? { get }

    /// Becomes ready when the underlying SDK is initialized. The bridge
    /// will not start the adapter until ready emits `true`.
    var isReady: Bool { get }

    /// List sensors that the user could pair with. BLE scans for Dexcom;
    /// NFC tag prompt for Libre 1; the previously-paired Libre 2 device
    /// for live streaming. Implementations may return an empty list while
    /// scanning is pending.
    func discover() async throws -> [DiscoveredSensor]

    /// Bind to a specific sensor, requesting whatever auth/activation the
    /// vendor demands.
    func pair(_ sensor: DiscoveredSensor) async throws

    /// Begin emitting `GlucoseEvent`s through the supplied sink.
    func start(onEvent: @escaping (GlucoseEvent) -> Void) async throws

    /// Release the sensor and end the session.
    func stop() async
}

public struct DiscoveredSensor: Equatable, Hashable {
    public let id: String
    public let displayName: String
    public init(id: String, displayName: String) {
        self.id = id
        self.displayName = displayName
    }
}

public enum SensorAdapterError: Error {
    case notImplemented
    case notPaired
    case authorizationDenied
    case sdkUnavailable(String)
    case underlying(Error)
}
