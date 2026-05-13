package com.dragonfly.sensorbridge

/**
 * Boundary every CGM vendor adapter must implement. The Bridge only ever
 * talks to adapters through this interface so vendor SDK types stay
 * isolated.
 */
interface SensorAdapter {
    val vendor: GlucoseEvent.Vendor
    val deviceName: String?
    val isReady: Boolean

    /** List sensors the user could pair with. */
    suspend fun discover(): List<DiscoveredSensor>

    /** Bind to a specific sensor. */
    suspend fun pair(sensor: DiscoveredSensor)

    /** Begin emitting GlucoseEvents through the supplied sink. */
    suspend fun start(onEvent: (GlucoseEvent) -> Unit)

    /** Release the sensor and end the session. */
    suspend fun stop()
}

data class DiscoveredSensor(val id: String, val displayName: String)

sealed class SensorAdapterError(message: String) : RuntimeException(message) {
    object NotImplemented : SensorAdapterError("not implemented yet")
    object NotPaired : SensorAdapterError("adapter is not paired")
    object AuthorizationDenied : SensorAdapterError("authorization denied")
    class SdkUnavailable(reason: String) : SensorAdapterError(reason)
    class Underlying(cause: Throwable) : SensorAdapterError(cause.message ?: "underlying error")
}
