package com.dragonfly.sensorbridge

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

/**
 * Talks to POST {apiBase}/api/glucose/sync. Wire shape lives in
 * native/sensor-bridge/shared/PROTOCOL.md.
 */
class SyncClient(
    private val apiBase: String,
    private val bridgeVersion: String = "android-0.1.0",
    private val bearerTokenProvider: () -> String? = { null },
) {

    private val json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    suspend fun uploadBatch(
        patientId: String,
        vendor: GlucoseEvent.Vendor,
        deviceName: String?,
        events: List<GlucoseEvent>,
    ): Result {
        val url = URL("${apiBase.trimEnd('/')}/api/glucose/sync")
        val payload = SyncBatch(
            patientId = patientId,
            vendor = vendor,
            deviceName = deviceName,
            bridgeVersion = bridgeVersion,
            readings = events.map { e ->
                SyncReading(
                    patientId = patientId,
                    valueMgDl = e.valueMgDl,
                    source = "cgm",
                    vendor = e.vendor ?: vendor,
                    deviceName = e.deviceName ?: deviceName,
                    context = e.context,
                    timestamp = e.timestamp,
                    trend = e.trend,
                    rawDeviceId = e.rawDeviceId,
                    readingKind = e.readingKind,
                    ingestionPath = e.ingestionPath,
                    notes = e.notes,
                )
            },
        )
        val body = json.encodeToString(payload)

        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            bearerTokenProvider()?.let {
                conn.setRequestProperty("Authorization", "Bearer $it")
            }
            OutputStreamWriter(conn.outputStream).use { it.write(body) }
            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                .bufferedReader().use { it.readText() }
            if (code !in 200..299) error("sync failed ($code): $text")
            return json.decodeFromString(Result.serializer(), text)
        } finally {
            conn.disconnect()
        }
    }

    @Serializable
    data class Result(
        val accepted: Int,
        val duplicates: Int,
        val rejected: List<Rejection>,
    ) {
        @Serializable
        data class Rejection(val index: Int, val reason: String)
    }

    @Serializable
    private data class SyncBatch(
        val patientId: String,
        val vendor: GlucoseEvent.Vendor,
        val deviceName: String?,
        val bridgeVersion: String,
        val readings: List<SyncReading>,
    )

    @Serializable
    private data class SyncReading(
        val patientId: String,
        val valueMgDl: Double,
        val source: String,
        val vendor: GlucoseEvent.Vendor,
        val deviceName: String?,
        val context: GlucoseEvent.Context,
        val timestamp: String,
        val trend: GlucoseEvent.Trend? = null,
        val rawDeviceId: String? = null,
        val readingKind: GlucoseEvent.ReadingKind,
        val ingestionPath: GlucoseEvent.IngestionPath,
        val notes: String? = null,
    )
}
