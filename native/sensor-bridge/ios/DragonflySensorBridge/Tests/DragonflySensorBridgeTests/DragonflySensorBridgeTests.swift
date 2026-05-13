import XCTest
@testable import DragonflySensorBridge

final class DragonflySensorBridgeTests: XCTestCase {
    func testMmolConversion() {
        XCTAssertEqual(mmolPerLToMgDl(7.0), 126)
        XCTAssertEqual(mmolPerLToMgDl(5.5), 99)
    }

    func testQueueEnqueueAndConfirm() {
        let q = SyncQueue(mode: .inMemory)
        let e = GlucoseEvent(
            valueMgDl: 142,
            timestamp: Date(timeIntervalSince1970: 1_700_000_000),
            context: .postLunch1To2h,
            rawDeviceId: "G7-9F12",
            ingestionPath: .nativeBle
        )
        q.enqueue(e)
        XCTAssertEqual(q.count, 1)
        q.confirmAccepted([e])
        XCTAssertEqual(q.count, 0)
    }

    func testEncryptedFilePersistenceRoundTrip() throws {
        let tmp = FileManager.default.temporaryDirectory
            .appendingPathComponent("dragonfly-test-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: tmp) }

        let writer = SyncQueue(mode: .encryptedFile(tmp))
        let e = GlucoseEvent(
            valueMgDl: 142,
            timestamp: Date(timeIntervalSince1970: 1_700_000_000),
            context: .postLunch1To2h,
            rawDeviceId: "G7-9F12",
            ingestionPath: .nativeBle
        )
        writer.enqueue(e)
        XCTAssertEqual(writer.count, 1)

        // A fresh queue pointed at the same path must rehydrate the buffer.
        let reader = SyncQueue(mode: .encryptedFile(tmp))
        XCTAssertEqual(reader.count, 1)
        XCTAssertEqual(reader.snapshot().first?.rawDeviceId, "G7-9F12")
    }

    func testAdaptersAreNotImplementedYet() async {
        let dex = DexcomAdapter()
        let lib = LibreAdapter()
        XCTAssertEqual(dex.vendor, .dexcom)
        XCTAssertEqual(lib.vendor, .libre)
        XCTAssertFalse(dex.isReady)
        XCTAssertFalse(lib.isReady)
    }
}
