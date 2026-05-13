package com.dragonfly.sensorbridge

import android.content.Context
import androidx.security.crypto.EncryptedFile
import androidx.security.crypto.MasterKey
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import java.io.File
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * Offline buffer for GlucoseEvents waiting to be uploaded.
 *
 * Two modes:
 *  - InMemory  — for tests and development.
 *  - Encrypted — backed by Jetpack Security's EncryptedFile (AES-256-GCM
 *                with a master key stored in the Android Keystore). The
 *                file lives in `context.filesDir/dragonfly-sensor-bridge/sync-queue.bin`.
 *
 * Privacy boundary: the queue is the only on-disk PHI on the bridge
 * side. No external storage is used; the file is private to the host
 * Android application's data directory and is encrypted at rest.
 */
class SyncQueue private constructor(
    private val storage: Storage,
) {
    private val lock = ReentrantLock()
    private val buffer: ArrayDeque<GlucoseEvent> = ArrayDeque()

    init {
        val initial = storage.load()
        for (e in initial) buffer.addLast(e)
    }

    fun enqueue(event: GlucoseEvent) = lock.withLock {
        buffer.addLast(event)
        storage.save(buffer.toList())
    }

    fun enqueue(events: Collection<GlucoseEvent>) = lock.withLock {
        for (e in events) buffer.addLast(e)
        storage.save(buffer.toList())
    }

    fun snapshot(maxCount: Int = 200): List<GlucoseEvent> = lock.withLock {
        buffer.take(maxCount)
    }

    fun confirmAccepted(events: List<GlucoseEvent>) = lock.withLock {
        val keys = events.map(::dedupKey).toSet()
        val keep = buffer.filterNot { dedupKey(it) in keys }
        buffer.clear()
        keep.forEach { buffer.addLast(it) }
        storage.save(buffer.toList())
    }

    val count: Int
        get() = lock.withLock { buffer.size }

    private fun dedupKey(e: GlucoseEvent): String =
        "${e.rawDeviceId.orEmpty()}|${e.timestamp}"

    private interface Storage {
        fun load(): List<GlucoseEvent>
        fun save(events: List<GlucoseEvent>)
    }

    companion object {
        private val json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
        }
        private val listSerializer = ListSerializer(GlucoseEvent.serializer())

        /** Volatile in-memory buffer. */
        @JvmStatic
        fun inMemory(): SyncQueue = SyncQueue(object : Storage {
            override fun load(): List<GlucoseEvent> = emptyList()
            override fun save(events: List<GlucoseEvent>) = Unit
        })

        /**
         * Encrypted on-disk queue at
         * `context.filesDir/dragonfly-sensor-bridge/sync-queue.bin`.
         * Master key is `MasterKey.DEFAULT_MASTER_KEY_ALIAS` in the
         * Android Keystore (AES-256-GCM scheme).
         */
        @JvmStatic
        fun encrypted(context: Context): SyncQueue {
            val dir = File(context.filesDir, "dragonfly-sensor-bridge").apply { mkdirs() }
            val file = File(dir, "sync-queue.bin")
            val masterKey = MasterKey.Builder(context.applicationContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            val storage = EncryptedFileStorage(context.applicationContext, file, masterKey)
            return SyncQueue(storage)
        }
    }

    private class EncryptedFileStorage(
        private val context: Context,
        private val file: File,
        private val masterKey: MasterKey,
    ) : Storage {
        private fun build(): EncryptedFile = EncryptedFile.Builder(
            context,
            file,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB,
        ).build()

        override fun load(): List<GlucoseEvent> {
            if (!file.exists()) return emptyList()
            return try {
                val ef = build()
                val bytes = ef.openFileInput().use { it.readBytes() }
                if (bytes.isEmpty()) emptyList()
                else json.decodeFromString(listSerializer, String(bytes, Charsets.UTF_8))
            } catch (_: Throwable) {
                emptyList()
            }
        }

        override fun save(events: List<GlucoseEvent>) {
            try {
                if (file.exists()) file.delete() // EncryptedFile won't overwrite
                val ef = build()
                val payload = json.encodeToString(listSerializer, events).toByteArray(Charsets.UTF_8)
                ef.openFileOutput().use { it.write(payload) }
            } catch (_: Throwable) {
                // Persisting failure must not crash the in-flight reading;
                // the in-memory buffer continues to be the truth path.
            }
        }
    }
}
