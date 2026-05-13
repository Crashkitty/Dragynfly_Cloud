import Foundation

/// Talks to `POST {apiBase}/api/glucose/sync`. The wire shape lives in
/// `native/sensor-bridge/shared/PROTOCOL.md`.
public final class SyncClient {
    public struct Result: Decodable {
        public let accepted: Int
        public let duplicates: Int
        public let rejected: [Rejection]

        public struct Rejection: Decodable {
            public let index: Int
            public let reason: String
        }
    }

    public let apiBase: URL
    public let bridgeVersion: String
    private let session: URLSession
    private let bearerTokenProvider: () -> String?

    public init(
        apiBase: URL,
        bridgeVersion: String = "ios-0.1.0",
        bearerTokenProvider: @escaping () -> String? = { nil },
        session: URLSession = .shared
    ) {
        self.apiBase = apiBase
        self.bridgeVersion = bridgeVersion
        self.bearerTokenProvider = bearerTokenProvider
        self.session = session
    }

    public func uploadBatch(
        patientId: String,
        vendor: GlucoseEvent.Vendor,
        deviceName: String?,
        events: [GlucoseEvent]
    ) async throws -> Result {
        var url = apiBase
        url.appendPathComponent("api")
        url.appendPathComponent("glucose")
        url.appendPathComponent("sync")

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token = bearerTokenProvider() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let payload = SyncBatch(
            patientId: patientId,
            vendor: vendor,
            deviceName: deviceName,
            bridgeVersion: bridgeVersion,
            readings: events.map { event in
                SyncReading(
                    patientId: patientId,
                    valueMgDl: event.valueMgDl,
                    source: "cgm",
                    vendor: event.vendor ?? vendor,
                    deviceName: event.deviceName ?? deviceName,
                    context: event.context,
                    timestamp: ISO8601DateFormatter().string(from: event.timestamp),
                    trend: event.trend,
                    rawDeviceId: event.rawDeviceId,
                    readingKind: event.readingKind,
                    ingestionPath: event.ingestionPath,
                    notes: event.notes
                )
            }
        )

        // Wire keys are camelCase to match packages/shared/src/types.ts
        // and the Hono validator. Do not convert to snake_case.
        request.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw NSError(domain: "DragonflySensorBridge.SyncClient", code: http.statusCode, userInfo: [
                NSLocalizedDescriptionKey: String(data: data, encoding: .utf8) ?? "sync failed"
            ])
        }
        return try JSONDecoder().decode(Result.self, from: data)
    }

    private struct SyncBatch: Encodable {
        let patientId: String
        let vendor: GlucoseEvent.Vendor
        let deviceName: String?
        let bridgeVersion: String
        let readings: [SyncReading]
    }

    private struct SyncReading: Encodable {
        let patientId: String
        let valueMgDl: Double
        let source: String
        let vendor: GlucoseEvent.Vendor
        let deviceName: String?
        let context: GlucoseEvent.Context
        let timestamp: String
        let trend: GlucoseEvent.Trend?
        let rawDeviceId: String?
        let readingKind: GlucoseEvent.ReadingKind
        let ingestionPath: GlucoseEvent.IngestionPath
        let notes: String?
    }
}
