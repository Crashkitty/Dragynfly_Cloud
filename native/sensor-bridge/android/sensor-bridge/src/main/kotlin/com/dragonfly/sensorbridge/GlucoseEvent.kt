package com.dragonfly.sensorbridge

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Mirrors NewGlucoseReading in packages/shared/src/types.ts. */
@Serializable
data class GlucoseEvent(
    val valueMgDl: Double,
    val timestamp: String, // ISO-8601 UTC
    val context: Context,
    val ingestionPath: IngestionPath,
    val readingKind: ReadingKind = ReadingKind.SENSOR,
    val trend: Trend? = null,
    val rawDeviceId: String? = null,
    val vendor: Vendor? = null,
    val deviceName: String? = null,
    val notes: String? = null,
) {
    @Serializable
    enum class Vendor {
        @SerialName("dexcom") DEXCOM,
        @SerialName("libre") LIBRE,
        @SerialName("unknown") UNKNOWN,
    }

    @Serializable
    enum class Trend {
        @SerialName("rising_quickly") RISING_QUICKLY,
        @SerialName("rising") RISING,
        @SerialName("rising_slowly") RISING_SLOWLY,
        @SerialName("flat") FLAT,
        @SerialName("falling_slowly") FALLING_SLOWLY,
        @SerialName("falling") FALLING,
        @SerialName("falling_quickly") FALLING_QUICKLY,
        @SerialName("unknown") UNKNOWN,
    }

    @Serializable
    enum class ReadingKind {
        @SerialName("sensor") SENSOR,
        @SerialName("backfill") BACKFILL,
        @SerialName("manual") MANUAL,
    }

    @Serializable
    enum class IngestionPath {
        @SerialName("native-ble") NATIVE_BLE,
        @SerialName("native-nfc") NATIVE_NFC,
        @SerialName("healthkit") HEALTHKIT,
        @SerialName("health-connect") HEALTH_CONNECT,
        @SerialName("manual") MANUAL,
    }

    @Serializable
    enum class Context {
        @SerialName("pre_taiyi") PRE_TAIYI,
        @SerialName("post_taiyi") POST_TAIYI,
        @SerialName("before_lunch") BEFORE_LUNCH,
        @SerialName("post_lunch_1_to_2h") POST_LUNCH_1_TO_2H,
        @SerialName("post_lunch_3_to_4h") POST_LUNCH_3_TO_4H,
        @SerialName("end_of_day") END_OF_DAY,
    }
}

/** Convert mmol/L to mg/dL (rounded). */
fun mmolPerLToMgDl(mmol: Double): Double = kotlin.math.round(mmol * 18.0182)
