import Foundation

/// Offline buffer for `GlucoseEvent`s waiting to be uploaded.
///
/// Persisted to a JSON file in the app's caches directory with iOS file
/// protection set to `.completeFileProtection`, which encrypts the file
/// at rest using a key derived from the device passcode and discards the
/// key whenever the device is locked. The file is written atomically.
///
/// Privacy boundary: the queue is the only on-disk PHI on the bridge
/// side. It must not be backed up to iCloud (we set the
/// "do not back up" resource attribute) and must not be readable while
/// the device is locked.
public final class SyncQueue {
    public enum PersistenceMode {
        /// Volatile in-memory buffer. Useful for tests.
        case inMemory
        /// Persisted to a JSON file with `.completeFileProtection`.
        case encryptedFile(URL)
    }

    private var buffer: [GlucoseEvent] = []
    private let lock = NSLock()
    private let mode: PersistenceMode

    public init(mode: PersistenceMode = .inMemory) {
        self.mode = mode
        if case .encryptedFile(let url) = mode {
            self.buffer = SyncQueue.loadFromDisk(url) ?? []
        }
    }

    /// Convenience constructor that places the queue file inside the
    /// app's caches directory under the supplied subdirectory name.
    public static func encryptedAtCachesDirectory(subdir: String = "DragonflySensorBridge")
        throws -> SyncQueue
    {
        let fm = FileManager.default
        let caches = try fm.url(
            for: .cachesDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let dir = caches.appendingPathComponent(subdir, isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: [
                .protectionKey: FileProtectionType.complete,
            ])
        }
        let file = dir.appendingPathComponent("sync-queue.json")
        return SyncQueue(mode: .encryptedFile(file))
    }

    public func enqueue(_ event: GlucoseEvent) {
        lock.lock()
        defer { lock.unlock() }
        buffer.append(event)
        flushToDiskLocked()
    }

    public func enqueue(_ events: [GlucoseEvent]) {
        lock.lock()
        defer { lock.unlock() }
        buffer.append(contentsOf: events)
        flushToDiskLocked()
    }

    /// Snapshot the queue without removing anything. Use `confirmAccepted`
    /// after the API responds to clear successfully uploaded events.
    public func snapshot(maxCount: Int = 200) -> [GlucoseEvent] {
        lock.lock()
        defer { lock.unlock() }
        return Array(buffer.prefix(maxCount))
    }

    public func confirmAccepted(_ events: [GlucoseEvent]) {
        lock.lock()
        defer { lock.unlock() }
        let acceptedKeys = Set(events.map(SyncQueue.dedupKey))
        buffer.removeAll { acceptedKeys.contains(SyncQueue.dedupKey($0)) }
        flushToDiskLocked()
    }

    public var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return buffer.count
    }

    private static func dedupKey(_ e: GlucoseEvent) -> String {
        return "\(e.rawDeviceId ?? "")|\(e.timestamp.timeIntervalSince1970)"
    }

    private func flushToDiskLocked() {
        guard case .encryptedFile(let url) = mode else { return }
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(buffer)
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            // Belt and braces: explicitly mark the file as not eligible
            // for iCloud / iTunes backup.
            var resource = URLResourceValues()
            resource.isExcludedFromBackup = true
            var mutableUrl = url
            try? mutableUrl.setResourceValues(resource)
        } catch {
            // We do not throw — losing the latest persistence write
            // shouldn't crash an in-flight reading. The bridge logs
            // once and continues with the in-memory buffer.
            #if DEBUG
            print("DragonflySensorBridge: queue flush failed: \(error)")
            #endif
        }
    }

    private static func loadFromDisk(_ url: URL) -> [GlucoseEvent]? {
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode([GlucoseEvent].self, from: data)
        } catch {
            #if DEBUG
            print("DragonflySensorBridge: queue load failed: \(error)")
            #endif
            return nil
        }
    }
}
