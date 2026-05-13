package com.dragonfly.sensorbridge

import org.junit.Assert.assertEquals
import org.junit.Test

class SyncQueueTest {
    @Test
    fun enqueueAndConfirmRemovesByDedupKey() {
        val q = SyncQueue.inMemory()
        val e = GlucoseEvent(
            valueMgDl = 142.0,
            timestamp = "2026-05-08T14:32:00Z",
            context = GlucoseEvent.Context.POST_LUNCH_1_TO_2H,
            ingestionPath = GlucoseEvent.IngestionPath.NATIVE_BLE,
            rawDeviceId = "G7-9F12",
        )
        q.enqueue(e)
        assertEquals(1, q.count)
        q.confirmAccepted(listOf(e))
        assertEquals(0, q.count)
    }

    @Test
    fun mmolConversionRounds() {
        assertEquals(126.0, mmolPerLToMgDl(7.0), 0.0)
        assertEquals(99.0, mmolPerLToMgDl(5.5), 0.0)
    }
}
