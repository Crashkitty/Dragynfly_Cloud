import Foundation

/// Orchestrates one or more `SensorAdapter`s, queues events while offline,
/// and uploads them through `SyncClient`. The patient PWA host (Capacitor
/// plugin / WKWebView bridge) talks to this object — never to adapters
/// directly.
public final class Bridge {
    public let patientId: String
    public let queue: SyncQueue
    public let sync: SyncClient

    private var adapters: [SensorAdapter] = []
    private var uploadTask: Task<Void, Never>?
    private let uploadIntervalSeconds: UInt64

    public init(
        patientId: String,
        sync: SyncClient,
        queue: SyncQueue = SyncQueue(),
        uploadIntervalSeconds: UInt64 = 60
    ) {
        self.patientId = patientId
        self.sync = sync
        self.queue = queue
        self.uploadIntervalSeconds = uploadIntervalSeconds
    }

    public func register(_ adapter: SensorAdapter) {
        adapters.append(adapter)
    }

    public func start() async throws {
        for adapter in adapters where adapter.isReady {
            try await adapter.start { [weak self] event in
                self?.queue.enqueue(event)
            }
        }
        startUploadLoop()
    }

    public func stop() async {
        uploadTask?.cancel()
        uploadTask = nil
        for adapter in adapters {
            await adapter.stop()
        }
    }

    /// Force-flushes any queued events.
    public func flush() async throws {
        try await uploadOnce()
    }

    private func startUploadLoop() {
        uploadTask?.cancel()
        uploadTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                try? await self.uploadOnce()
                try? await Task.sleep(nanoseconds: self.uploadIntervalSeconds * 1_000_000_000)
            }
        }
    }

    private func uploadOnce() async throws {
        let batch = queue.snapshot(maxCount: 200)
        guard !batch.isEmpty else { return }
        // Group by vendor so the API receives consistent batches even when
        // multiple adapters are streaming simultaneously.
        let byVendor = Dictionary(grouping: batch, by: { $0.vendor ?? .unknown })
        for (vendor, events) in byVendor {
            do {
                _ = try await sync.uploadBatch(
                    patientId: patientId,
                    vendor: vendor,
                    deviceName: events.first?.deviceName,
                    events: events
                )
                queue.confirmAccepted(events)
            } catch {
                // Leave events in the queue for the next tick.
                return
            }
        }
    }
}
