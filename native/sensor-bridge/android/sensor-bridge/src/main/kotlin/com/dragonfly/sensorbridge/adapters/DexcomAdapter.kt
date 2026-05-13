package com.dragonfly.sensorbridge.adapters

import com.dragonfly.sensorbridge.DiscoveredSensor
import com.dragonfly.sensorbridge.GlucoseEvent
import com.dragonfly.sensorbridge.SensorAdapter
import com.dragonfly.sensorbridge.SensorAdapterError

/**
 * Dexcom G6/G7 adapter. Real implementation will use the Dexcom Mobile
 * SDK (BLE) once the partner agreement is in place.
 *
 * Vendor quirks live here, none anywhere else:
 *  - 5-minute sample cadence
 *  - 10-day session windows; warmup before readings are valid
 *  - Backfill on reconnect → emit with readingKind = BACKFILL
 */
class DexcomAdapter(
    override val deviceName: String? = "Dexcom",
) : SensorAdapter {
    override val vendor: GlucoseEvent.Vendor = GlucoseEvent.Vendor.DEXCOM
    override val isReady: Boolean = false

    override suspend fun discover(): List<DiscoveredSensor> = emptyList()

    override suspend fun pair(sensor: DiscoveredSensor) {
        throw SensorAdapterError.NotImplemented
    }

    override suspend fun start(onEvent: (GlucoseEvent) -> Unit) {
        throw SensorAdapterError.NotImplemented
    }

    override suspend fun stop() {
        // No-op until real BLE session exists.
    }
}
