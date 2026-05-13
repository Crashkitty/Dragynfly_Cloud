import Capacitor
import Foundation
import Security

/// Capacitor plugin that satisfies the four-method BridgeAdapter
/// contract from `apps/patient-pwa/src/bridge/types.ts`.
///
/// Storage: the bearer token lives in the iOS Keychain
/// (`kSecClassGenericPassword`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`).
/// The WebView never sees the raw token after install — `getStatus()`
/// only reports `tokenInstalled: true/false`. The patient binding
/// (`patientId` the token was issued for) is stored alongside so
/// `emitDemoReading` can refuse cross-patient writes locally as well.
///
/// Network: the plugin owns the `POST /api/glucose/sync` request and
/// attaches the bearer itself. Reading is tagged honestly
/// (`vendor: "unknown"`, `deviceName: "Dragonfly Demo Bridge"`,
/// `source: "manual"`) — emitting synthetic data as if it were real
/// Dexcom or Libre output is a contract violation.
///
/// API base URL comes from the plugin config in `capacitor.config.ts`:
///   plugins: { DragonflySensorBridge: { apiBase: "https://..." } }
@objc(DragonflySensorBridgePlugin)
public class DragonflySensorBridgePlugin: CAPPlugin {

    private let service = "com.dragonfly.sensorbridge"
    private let tokenAccount = "bridgeToken"
    private let patientAccount = "bridgePatientId"
    private let lastSyncDefaultsKey = "DragonflySensorBridge.lastSyncedAt"

    @objc func installToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("token must be a non-empty string")
            return
        }
        do {
            try keychainSet(account: tokenAccount, value: token)
            call.resolve()
        } catch {
            call.reject("keychain write failed: \(error)")
        }
    }

    @objc func clearToken(_ call: CAPPluginCall) {
        keychainDelete(account: tokenAccount)
        keychainDelete(account: patientAccount)
        UserDefaults.standard.removeObject(forKey: lastSyncDefaultsKey)
        call.resolve()
    }

    @objc func getStatus(_ call: CAPPluginCall) {
        let installed = (try? keychainGet(account: tokenAccount)) != nil
        call.resolve([
            "tokenInstalled": installed,
            "adapterLabel": "iOS native bridge (Capacitor)",
            "lastSyncedAt": UserDefaults.standard.string(forKey: lastSyncDefaultsKey) as Any,
            "pendingCount": 0,
        ])
    }

    /// Libre NFC tap-reading is Android-only in V1.5. iOS implementation
    /// needs the `com.apple.developer.nfc.readersession.formats` entitlement
    /// and a different NFC API (Core NFC `NFCTagReaderSession`); deferred
    /// to V2+.
    @objc func readLibreOnce(_ call: CAPPluginCall) {
        call.unimplemented("readLibreOnce is Android-only in V1.5. iOS NFC support is V2+.")
    }

    /// Dexcom G6 / G7 brief BLE reads are Android-only in V1.5. iOS needs
    /// the `com.apple.developer.bluetooth-central-background` private
    /// entitlement to sustain BLE long enough to catch the next
    /// 5-minute G6 broadcast; deferred to V2+.
    @objc func readDexcomG6Once(_ call: CAPPluginCall) {
        call.unimplemented("readDexcomG6Once is Android-only in V1.5.")
    }

    @objc func readDexcomG7Once(_ call: CAPPluginCall) {
        call.unimplemented("readDexcomG7Once is Android-only in V1.5.")
    }

    @objc func emitDemoReading(_ call: CAPPluginCall) {
        guard let patientId = call.getString("patientId") else {
            call.reject("patientId required")
            return
        }
        guard let valueMgDl = call.getDouble("valueMgDl") else {
            call.reject("valueMgDl required")
            return
        }
        let token: String
        do {
            guard let stored = try keychainGet(account: tokenAccount) else {
                call.reject("no bridge token installed")
                return
            }
            token = stored
        } catch {
            call.reject("keychain read failed: \(error)")
            return
        }

        // Patient binding: if a patientId was previously associated with
        // this token, refuse cross-patient writes locally. The Worker
        // enforces this server-side too; this is the cheap first line.
        if let bound = try? keychainGet(account: patientAccount), bound != patientId {
            call.reject("token bound to a different patientId")
            return
        }
        if (try? keychainGet(account: patientAccount)) == nil {
            try? keychainSet(account: patientAccount, value: patientId)
        }

        guard let apiBase = (getConfig().getString("apiBase"))
            .flatMap({ URL(string: $0) }) else {
            call.reject("apiBase missing in capacitor.config.ts plugins.DragonflySensorBridge")
            return
        }

        Task {
            do {
                let result = try await postSync(
                    apiBase: apiBase,
                    token: token,
                    patientId: patientId,
                    valueMgDl: valueMgDl
                )
                UserDefaults.standard.set(result.timestamp, forKey: lastSyncDefaultsKey)
                call.resolve([
                    "accepted": result.accepted,
                    "duplicates": result.duplicates,
                    "rejected": result.rejected.map {
                        ["index": $0.index, "reason": $0.reason]
                    },
                ])
            } catch {
                call.reject("sync failed: \(error)")
            }
        }
    }

    // MARK: - Network

    private struct SyncReply {
        let accepted: Int
        let duplicates: Int
        let rejected: [Rejection]
        let timestamp: String
        struct Rejection { let index: Int; let reason: String }
    }

    private func postSync(
        apiBase: URL,
        token: String,
        patientId: String,
        valueMgDl: Double
    ) async throws -> SyncReply {
        var url = apiBase
        url.appendPathComponent("api")
        url.appendPathComponent("glucose")
        url.appendPathComponent("sync")

        let nowIso = ISO8601DateFormatter().string(from: Date())
        let body: [String: Any] = [
            "patientId": patientId,
            "vendor": "unknown",
            "deviceName": "Dragonfly Demo Bridge",
            "bridgeVersion": "ios-shell-0.1.0",
            "readings": [[
                "patientId": patientId,
                "valueMgDl": valueMgDl,
                "source": "manual",
                "vendor": "unknown",
                "deviceName": "Dragonfly Demo Bridge",
                "context": chooseContext(),
                "timestamp": nowIso,
                "readingKind": "manual",
                "ingestionPath": "manual",
                "rawDeviceId": "ios-shell-\(nowIso)",
                "notes": "Synthetic demo reading from the iOS Capacitor shell.",
            ]],
        ]

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw NSError(domain: "DragonflySensorBridge", code: -1)
        }
        guard (200..<300).contains(http.statusCode) else {
            let txt = String(data: data, encoding: .utf8) ?? ""
            throw NSError(
                domain: "DragonflySensorBridge",
                code: http.statusCode,
                userInfo: [NSLocalizedDescriptionKey: txt]
            )
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw NSError(domain: "DragonflySensorBridge", code: -2)
        }
        let rejected = (json["rejected"] as? [[String: Any]])?.compactMap { r -> SyncReply.Rejection? in
            guard let i = r["index"] as? Int, let reason = r["reason"] as? String else { return nil }
            return SyncReply.Rejection(index: i, reason: reason)
        } ?? []
        return SyncReply(
            accepted: json["accepted"] as? Int ?? 0,
            duplicates: json["duplicates"] as? Int ?? 0,
            rejected: rejected,
            timestamp: nowIso
        )
    }

    private func chooseContext() -> String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case ..<9:  return "pre_taiyi"
        case ..<11: return "post_taiyi"
        case ..<13: return "before_lunch"
        case ..<16: return "post_lunch_1_to_2h"
        case ..<19: return "post_lunch_3_to_4h"
        default:    return "end_of_day"
        }
    }

    // MARK: - Keychain

    private func keychainSet(account: String, value: String) throws {
        let data = value.data(using: .utf8) ?? Data()
        let baseQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(baseQuery as CFDictionary)
        var add = baseQuery
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: "Keychain", code: Int(status))
        }
    }

    private func keychainGet(account: String) throws -> String? {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = item as? Data else {
            throw NSError(domain: "Keychain", code: Int(status))
        }
        return String(data: data, encoding: .utf8)
    }

    private func keychainDelete(account: String) {
        let q: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(q as CFDictionary)
    }
}
