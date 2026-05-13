package com.dragonfly.shell.sensorbridge

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Capacitor plugin satisfying the four-method BridgeAdapter contract
 * from `apps/patient-pwa/src/bridge/types.ts`.
 *
 * Storage: bearer token + bound patient id live in
 * EncryptedSharedPreferences (AES-256-GCM with HKDF-4KB streaming, master
 * key in the Android Keystore). The WebView never sees the raw token
 * after install — `getStatus()` only reports `tokenInstalled: true/false`.
 *
 * Network: this plugin owns the `POST /api/glucose/sync` request and
 * attaches the bearer itself. The reading is tagged honestly
 * (`vendor: "unknown"`, `deviceName: "Dragonfly Demo Bridge"`,
 * `source: "manual"`).
 *
 * API base URL comes from the plugin config in `capacitor.config.ts`:
 *   plugins: { DragonflySensorBridge: { apiBase: "https://..." } }
 */
@CapacitorPlugin(name = "DragonflySensorBridge")
class DragonflySensorBridgePlugin : Plugin() {

    private val prefsName = "dragonfly_sensor_bridge"
    private val keyToken = "bridgeToken"
    private val keyPatient = "bridgePatientId"
    private val keyLastSync = "lastSyncedAt"
    private val scope = CoroutineScope(Dispatchers.IO)

    private fun prefs(): SharedPreferences {
        val ctx: Context = context.applicationContext
        val masterKey = MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            ctx,
            prefsName,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    @PluginMethod
    fun installToken(call: PluginCall) {
        val token = call.getString("token")?.takeIf { it.isNotBlank() }
            ?: return call.reject("token must be a non-empty string")
        prefs().edit().putString(keyToken, token).apply()
        call.resolve()
    }

    @PluginMethod
    fun clearToken(call: PluginCall) {
        prefs().edit().remove(keyToken).remove(keyPatient).remove(keyLastSync).apply()
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val p = prefs()
        val res = JSObject()
        res.put("tokenInstalled", p.contains(keyToken))
        res.put("adapterLabel", "Android native bridge (Capacitor)")
        res.put("lastSyncedAt", p.getString(keyLastSync, null))
        res.put("pendingCount", 0)
        call.resolve(res)
    }

    @PluginMethod
    fun emitDemoReading(call: PluginCall) {
        val patientId = call.getString("patientId")
            ?: return call.reject("patientId required")
        val valueMgDl = call.getDouble("valueMgDl")
            ?: return call.reject("valueMgDl required")

        val p = prefs()
        val token = p.getString(keyToken, null)
            ?: return call.reject("no bridge token installed")
        if (!checkPatientBinding(p, patientId)) {
            return call.reject("token bound to a different patientId")
        }
        val apiBase = config.getString("apiBase")
            ?: return call.reject("apiBase missing in capacitor.config.ts plugins.DragonflySensorBridge")

        scope.launch {
            try {
                val (result, ts) = postSync(
                    apiBase = apiBase,
                    token = token,
                    patientId = patientId,
                    valueMgDl = valueMgDl,
                    source = "manual",
                    vendor = "unknown",
                    deviceName = "Dragonfly Demo Bridge",
                    readingKind = "manual",
                    ingestionPath = "manual",
                    rawDeviceId = "android-shell-${isoNow()}",
                    notes = "Synthetic demo reading from the Android Capacitor shell.",
                    bridgeVersion = "android-shell-0.1.0",
                )
                p.edit().putString(keyLastSync, ts).apply()
                call.resolve(result)
            } catch (e: Throwable) {
                call.reject("sync failed: ${e.message}")
            }
        }
    }

    /**
     * Dexcom G6 brief BLE read. User opens the bridge screen, taps
     * "Read Dexcom G6", we connect to the transmitter named after their
     * transmitterId, authenticate, wait for the next 5-minute glucose
     * broadcast, POST it, disconnect. See DexcomG6BleReader.kt for the
     * protocol-level honesty notes.
     */
    @PluginMethod
    fun readDexcomG6Once(call: PluginCall) {
        val patientId = call.getString("patientId")
            ?: return call.reject("patientId required")
        val transmitterId = call.getString("transmitterId")
            ?: return call.reject("transmitterId required (6-char G6 transmitter ID)")
        val timeoutMs = call.getLong("timeoutMs") ?: 360_000L

        val p = prefs()
        val token = p.getString(keyToken, null)
            ?: return call.reject("no bridge token installed")
        if (!checkPatientBinding(p, patientId)) {
            return call.reject("token bound to a different patientId")
        }
        val apiBase = config.getString("apiBase")
            ?: return call.reject("apiBase missing in capacitor.config.ts plugins.DragonflySensorBridge")

        scope.launch {
            val read = runCatching {
                DexcomG6BleReader(context).readOnce(transmitterId, timeoutMs)
            }.getOrElse { return@launch call.reject("Dexcom G6 read failed: ${it.message}") }

            val out = JSObject()
                .put("vendor", "dexcom-g6")
                .put("transmitterIdLast2", read.transmitterIdLast2)
                .put("deviceName", read.deviceName)
                .put("valueMgDl", read.valueMgDl ?: JSONObject.NULL)
                .put("trend", read.trend)
                .put("timestampIso", read.timestampIso)
                .put("error", read.error)

            if (read.valueMgDl != null && read.timestampIso != null) {
                val (syncResult, ts) = runCatching {
                    postSync(
                        apiBase = apiBase,
                        token = token,
                        patientId = patientId,
                        valueMgDl = read.valueMgDl,
                        source = "cgm",
                        vendor = "dexcom",
                        deviceName = read.deviceName ?: "Dexcom G6",
                        readingKind = "sensor",
                        ingestionPath = "native-ble",
                        rawDeviceId = "g6-${read.transmitterIdLast2 ?: "unknown"}-${read.timestampIso}",
                        notes = null,
                        bridgeVersion = "android-ble-0.1.0",
                    )
                }.getOrElse {
                    out.put("syncError", it.message); call.resolve(out); return@launch
                }
                p.edit().putString(keyLastSync, ts).apply()
                out.put("sync", syncResult)
            }
            call.resolve(out)
        }
    }

    /**
     * Dexcom G7 brief BLE read. **Today this only gets as far as the
     * pre-J-PAKE handshake.** See DexcomG7BleReader.kt for the cert
     * problem and what shipping the full path needs.
     */
    @PluginMethod
    fun readDexcomG7Once(call: PluginCall) {
        val patientId = call.getString("patientId")
            ?: return call.reject("patientId required")
        val transmitterIdSuffix = call.getString("transmitterIdSuffix")
            ?: return call.reject("transmitterIdSuffix required (last 4 hex chars of G7 advert name)")
        val certJwt = call.getString("certJwt")
        val timeoutMs = call.getLong("timeoutMs") ?: 120_000L

        val p = prefs()
        val token = p.getString(keyToken, null)
            ?: return call.reject("no bridge token installed")
        if (!checkPatientBinding(p, patientId)) {
            return call.reject("token bound to a different patientId")
        }
        val apiBase = config.getString("apiBase")
            ?: return call.reject("apiBase missing in capacitor.config.ts plugins.DragonflySensorBridge")

        scope.launch {
            val read = runCatching {
                DexcomG7BleReader(context).readOnce(transmitterIdSuffix, certJwt, timeoutMs)
            }.getOrElse { return@launch call.reject("Dexcom G7 read failed: ${it.message}") }

            val out = JSObject()
                .put("vendor", "dexcom-g7")
                .put("deviceName", read.deviceName)
                .put("stage", read.stage.name)
                .put("valueMgDl", read.valueMgDl ?: JSONObject.NULL)
                .put("trend", read.trend)
                .put("timestampIso", read.timestampIso)
                .put("message", read.message)
                .put("error", read.error)

            if (read.valueMgDl != null && read.timestampIso != null) {
                val (syncResult, ts) = runCatching {
                    postSync(
                        apiBase = apiBase,
                        token = token,
                        patientId = patientId,
                        valueMgDl = read.valueMgDl,
                        source = "cgm",
                        vendor = "dexcom",
                        deviceName = read.deviceName ?: "Dexcom G7",
                        readingKind = "sensor",
                        ingestionPath = "native-ble",
                        rawDeviceId = "g7-${transmitterIdSuffix}-${read.timestampIso}",
                        notes = null,
                        bridgeVersion = "android-ble-0.1.0",
                    )
                }.getOrElse {
                    out.put("syncError", it.message); call.resolve(out); return@launch
                }
                p.edit().putString(keyLastSync, ts).apply()
                out.put("sync", syncResult)
            }
            call.resolve(out)
        }
    }

    /**
     * Libre NFC tap-read. Scope per docs/V1_5_PLAN.md: user-initiated,
     * one reading per tap. Libre 1 implemented; Libre 2 Gen1 detected and
     * FRAM captured but decryption unverified; Libre 2 Gen2 / Libre 3 /
     * Libre 3 Plus detected and reported unsupported.
     *
     * UNTESTED on real hardware in this commit — see the file-level
     * comment in LibreNfcReader.kt.
     */
    @PluginMethod
    fun readLibreOnce(call: PluginCall) {
        val patientId = call.getString("patientId")
            ?: return call.reject("patientId required")
        val timeoutMs = call.getLong("timeoutMs") ?: 30_000L

        val activity = activity
            ?: return call.reject("no host activity (plugin not attached)")
        val p = prefs()
        val token = p.getString(keyToken, null)
            ?: return call.reject("no bridge token installed")
        if (!checkPatientBinding(p, patientId)) {
            return call.reject("token bound to a different patientId")
        }
        val apiBase = config.getString("apiBase")
            ?: return call.reject("apiBase missing in capacitor.config.ts plugins.DragonflySensorBridge")

        scope.launch {
            val read = runCatching { LibreNfcReader.readOnce(activity, timeoutMs) }
                .getOrElse {
                    return@launch call.reject("NFC read failed: ${it.message}")
                }
            val out = JSObject()
                .put("sensorType", read.sensorType?.name)
                .put("sensorUid", read.sensorUid)
                .put("valueMgDl", read.valueMgDl ?: JSONObject.NULL)
                .put("timestampIso", read.timestampIso)
                .put("unsupportedReason", read.unsupportedReason)
                .put("error", read.error)

            // POST only when we actually extracted a usable reading.
            if (read.valueMgDl != null && read.timestampIso != null) {
                val (syncResult, ts) = runCatching {
                    postSync(
                        apiBase = apiBase,
                        token = token,
                        patientId = patientId,
                        valueMgDl = read.valueMgDl,
                        source = "cgm",
                        vendor = "libre",
                        deviceName = read.sensorType?.name?.lowercase()?.replace('_', ' ')
                            ?: "Libre",
                        readingKind = "sensor",
                        ingestionPath = "native-nfc",
                        rawDeviceId = "libre-${read.sensorUid ?: "unknown"}-${read.timestampIso}",
                        notes = null,
                        bridgeVersion = "android-nfc-0.1.0",
                    )
                }.getOrElse {
                    out.put("syncError", it.message)
                    call.resolve(out)
                    return@launch
                }
                p.edit().putString(keyLastSync, ts).apply()
                out.put("sync", syncResult)
            }
            call.resolve(out)
        }
    }

    private fun checkPatientBinding(p: SharedPreferences, patientId: String): Boolean {
        val bound = p.getString(keyPatient, null)
        if (bound != null && bound != patientId) return false
        if (bound == null) p.edit().putString(keyPatient, patientId).apply()
        return true
    }

    private fun postSync(
        apiBase: String,
        token: String,
        patientId: String,
        valueMgDl: Double,
        source: String,
        vendor: String,
        deviceName: String,
        readingKind: String,
        ingestionPath: String,
        rawDeviceId: String,
        notes: String?,
        bridgeVersion: String,
    ): Pair<JSObject, String> {
        val url = URL("${apiBase.trimEnd('/')}/api/glucose/sync")
        val nowIso = isoNow()

        val reading = JSONObject()
            .put("patientId", patientId)
            .put("valueMgDl", valueMgDl)
            .put("source", source)
            .put("vendor", vendor)
            .put("deviceName", deviceName)
            .put("context", chooseContext())
            .put("timestamp", nowIso)
            .put("readingKind", readingKind)
            .put("ingestionPath", ingestionPath)
            .put("rawDeviceId", rawDeviceId)
        if (notes != null) reading.put("notes", notes)

        val batch = JSONObject()
            .put("patientId", patientId)
            .put("vendor", vendor)
            .put("deviceName", deviceName)
            .put("bridgeVersion", bridgeVersion)
            .put("readings", JSONArray().put(reading))

        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $token")
            conn.outputStream.use { it.write(batch.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                .bufferedReader().use { it.readText() }
            if (code !in 200..299) error("HTTP $code: $body")
            val json = JSONObject(body)
            val out = JSObject()
                .put("accepted", json.optInt("accepted"))
                .put("duplicates", json.optInt("duplicates"))
                .put("rejected", json.optJSONArray("rejected") ?: JSONArray())
            return out to nowIso
        } finally {
            conn.disconnect()
        }
    }

    private fun isoNow(): String {
        val fmt = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        return fmt.format(Date())
    }

    private fun chooseContext(): String {
        val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        return when {
            hour < 9 -> "pre_taiyi"
            hour < 11 -> "post_taiyi"
            hour < 13 -> "before_lunch"
            hour < 16 -> "post_lunch_1_to_2h"
            hour < 19 -> "post_lunch_3_to_4h"
            else -> "end_of_day"
        }
    }
}
