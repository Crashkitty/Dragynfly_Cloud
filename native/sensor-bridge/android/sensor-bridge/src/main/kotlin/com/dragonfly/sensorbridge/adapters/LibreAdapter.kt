package com.dragonfly.sensorbridge.adapters

import com.dragonfly.sensorbridge.DiscoveredSensor
import com.dragonfly.sensorbridge.GlucoseEvent
import com.dragonfly.sensorbridge.SensorAdapter
import com.dragonfly.sensorbridge.SensorAdapterError

/**
 * Abbott FreeStyle Libre adapter. Libre 1 is NFC-only (tap to scan);
 * Libre 2 supports BLE streaming after NFC activation. Real
 * implementation requires the LibreLink / Abbott partner agreement.
 *
 * Vendor quirks:
 *  - Activation countdown (~60 minute warmup)
 *  - mmol/L vs mg/dL: convert with mmolPerLToMgDl(...) before emitting
 *  - NFC tap returns up to ~8h history → emit with readingKind = BACKFILL,
 *    ingestionPath = NATIVE_NFC
 */
class LibreAdapter(
    override val deviceName: String? = "Abbott Libre",
    val mode: Mode = Mode.NFC_ONLY,
) : SensorAdapter {
    enum class Mode { NFC_ONLY, BLE_STREAM }

    override val vendor: GlucoseEvent.Vendor = GlucoseEvent.Vendor.LIBRE
    override val isReady: Boolean = false

    override suspend fun discover(): List<DiscoveredSensor> = emptyList()

    override suspend fun pair(sensor: DiscoveredSensor) {
        throw SensorAdapterError.NotImplemented
    }

    override suspend fun start(onEvent: (GlucoseEvent) -> Unit) {
        throw SensorAdapterError.NotImplemented
    }

    override suspend fun stop() {
        // No-op until real session exists.
    }
}
