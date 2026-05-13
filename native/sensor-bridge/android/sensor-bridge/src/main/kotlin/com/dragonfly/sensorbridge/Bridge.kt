package com.dragonfly.sensorbridge

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Orchestrates one or more SensorAdapters, queues events while offline,
 * and uploads them through SyncClient. The host Android app should bind
 * a foreground service that owns this object — never call adapter methods
 * directly from UI code.
 */
class Bridge(
    val patientId: String,
    val sync: SyncClient,
    val queue: SyncQueue = SyncQueue.inMemory(),
    private val uploadIntervalMs: Long = 60_000L,
) {
    private val adapters: MutableList<SensorAdapter> = mutableListOf()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var uploadJob: Job? = null

    fun register(adapter: SensorAdapter) {
        adapters += adapter
    }

    suspend fun start() {
        for (adapter in adapters) {
            if (!adapter.isReady) continue
            adapter.start { event -> queue.enqueue(event) }
        }
        startUploadLoop()
    }

    suspend fun stop() {
        uploadJob?.cancel()
        uploadJob = null
        for (adapter in adapters) adapter.stop()
        scope.cancel()
    }

    suspend fun flush() {
        uploadOnce()
    }

    private fun startUploadLoop() {
        uploadJob?.cancel()
        uploadJob = scope.launch {
            while (isActive) {
                runCatching { uploadOnce() }
                delay(uploadIntervalMs)
            }
        }
    }

    private suspend fun uploadOnce() {
        val batch = queue.snapshot(maxCount = 200)
        if (batch.isEmpty()) return
        val byVendor = batch.groupBy { it.vendor ?: GlucoseEvent.Vendor.UNKNOWN }
        for ((vendor, events) in byVendor) {
            try {
                sync.uploadBatch(
                    patientId = patientId,
                    vendor = vendor,
                    deviceName = events.firstOrNull()?.deviceName,
                    events = events,
                )
                queue.confirmAccepted(events)
            } catch (_: Throwable) {
                // Leave events in the queue for the next tick.
                return
            }
        }
    }
}
