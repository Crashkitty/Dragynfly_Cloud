import Foundation

/// Mirrors `NewGlucoseReading` in `packages/shared/src/types.ts`.
/// Adapter implementations must produce values that can be JSON-encoded
/// directly into the sync batch sent to `POST /api/glucose/sync`.
public struct GlucoseEvent: Codable, Equatable {
    public enum Vendor: String, Codable, Equatable, CaseIterable {
        case dexcom, libre, unknown
    }
    public enum Trend: String, Codable, Equatable, CaseIterable {
        case risingQuickly = "rising_quickly"
        case rising
        case risingSlowly = "rising_slowly"
        case flat
        case fallingSlowly = "falling_slowly"
        case falling
        case fallingQuickly = "falling_quickly"
        case unknown
    }
    public enum ReadingKind: String, Codable, Equatable, CaseIterable {
        case sensor, backfill, manual
    }
    public enum IngestionPath: String, Codable, Equatable, CaseIterable {
        case nativeBle = "native-ble"
        case nativeNfc = "native-nfc"
        case healthKit = "healthkit"
        case healthConnect = "health-connect"
        case manual
    }
    public enum Context: String, Codable, Equatable, CaseIterable {
        case preTaiyi = "pre_taiyi"
        case postTaiyi = "post_taiyi"
        case beforeLunch = "before_lunch"
        case postLunch1To2h = "post_lunch_1_to_2h"
        case postLunch3To4h = "post_lunch_3_to_4h"
        case endOfDay = "end_of_day"
    }

    public var valueMgDl: Double
    public var timestamp: Date
    public var context: Context
    public var trend: Trend?
    public var rawDeviceId: String?
    public var readingKind: ReadingKind
    public var ingestionPath: IngestionPath
    public var vendor: Vendor?
    public var deviceName: String?
    public var notes: String?

    public init(
        valueMgDl: Double,
        timestamp: Date,
        context: Context,
        trend: Trend? = nil,
        rawDeviceId: String? = nil,
        readingKind: ReadingKind = .sensor,
        ingestionPath: IngestionPath,
        vendor: Vendor? = nil,
        deviceName: String? = nil,
        notes: String? = nil
    ) {
        self.valueMgDl = valueMgDl
        self.timestamp = timestamp
        self.context = context
        self.trend = trend
        self.rawDeviceId = rawDeviceId
        self.readingKind = readingKind
        self.ingestionPath = ingestionPath
        self.vendor = vendor
        self.deviceName = deviceName
        self.notes = notes
    }
}

/// Convert mmol/L to mg/dL. Many EU Libre devices report mmol/L.
public func mmolPerLToMgDl(_ mmol: Double) -> Double {
    return (mmol * 18.0182).rounded()
}
