package com.dragonfly.shell.sensorbridge

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import kotlinx.coroutines.suspendCancellableCoroutine
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec
import kotlin.coroutines.resume

/**
 * Dexcom G6 BLE one-shot reader. Scope per docs/V1_5_PLAN.md: user opens
 * the bridge screen, the app briefly connects to the named G6 transmitter,
 * authenticates with the published challenge/response (HMAC-style auth
 * keyed off the transmitter ID), subscribes to the control characteristic,
 * waits for the next glucose-value notification (up to ~5 min — the G6
 * broadcasts every 5 minutes), parses it, disconnects.
 *
 * Protocol references (all public, clean-room):
 *  - xDrip+ (`G5CollectionService` / Ob1G5StateMachine) — GPLv3, reference only
 *  - LoopKit / G7SensorKit — MIT (older G6 era)
 *  - Many published Nightscout / openaps protocol writeups
 *
 * Service / characteristic UUIDs and opcodes below are field-standard and
 * not derived from the GPL sources. The authentication ciphers are
 * documented across multiple posts.
 *
 * **UNTESTED on real hardware.** First-run verification:
 *  1. Confirm scan finds a `Dexcom<TX_ID_LAST2>` advertising on
 *     `CGM_SERVICE_UUID`. Some G6 firmwares only advertise the suffix.
 *  2. Confirm the auth challenge response is accepted — wrong key derivation
 *     manifests as immediate disconnect after the auth-challenge write.
 *  3. Confirm the glucose value parse offset against a finger-stick paired
 *     reading.
 */
class DexcomG6BleReader(private val context: Context) {

    data class Result(
        val transmitterIdLast2: String?,
        val deviceName: String?,
        val valueMgDl: Double?,
        val trend: String?,
        val timestampIso: String?,
        val error: String?,
    )

    /**
     * @param transmitterId 6-char Dexcom transmitter ID printed on the G6
     *   applicator and inside the app. Required because the auth key is
     *   derived from it.
     * @param timeoutMs total budget for scan + connect + auth + first
     *   glucose notification. G6 broadcasts every 5 minutes, so honest
     *   defaults are 5-6 minutes.
     */
    suspend fun readOnce(transmitterId: String, timeoutMs: Long = 360_000L): Result {
        val txId = transmitterId.trim().uppercase()
        if (txId.length != 6) {
            return Result(null, null, null, null, null,
                "Dexcom transmitter ID must be 6 chars (printed on applicator).")
        }
        val manager = context.getSystemService(BluetoothManager::class.java)
            ?: return errorResult("Bluetooth not available")
        val adapter = manager.adapter
            ?: return errorResult("Bluetooth adapter not available")
        if (!adapter.isEnabled) return errorResult("Bluetooth is off")

        val scanner = adapter.bluetoothLeScanner
            ?: return errorResult("BLE scanner not available")

        return suspendCancellableCoroutine { cont ->
            val resolved = AtomicBoolean(false)
            var gatt: BluetoothGatt? = null
            var scanCallback: ScanCallback? = null

            fun finish(result: Result) {
                if (!resolved.compareAndSet(false, true)) return
                runCatching { scanCallback?.let(scanner::stopScan) }
                runCatching { gatt?.disconnect(); gatt?.close() }
                cont.resume(result)
            }

            val timeoutRunnable = Runnable {
                finish(errorResult("Timed out after ${timeoutMs / 1000}s. " +
                    "G6 broadcasts every 5 min — try again, or confirm transmitter ID."))
            }
            cont.invokeOnCancellation {
                finish(errorResult("Cancelled"))
            }
            android.os.Handler(android.os.Looper.getMainLooper())
                .postDelayed(timeoutRunnable, timeoutMs)

            val gattCallback = makeGattCallback(txId, ::finish)
            scanCallback = object : ScanCallback() {
                @SuppressLint("MissingPermission")
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    val name = result.device.name ?: return
                    // G6 advertises as "Dexcom<last-2-chars-of-TX-ID>" or sometimes
                    // the bare last-2-char suffix. Match either.
                    val last2 = txId.takeLast(2)
                    if (!(name == "Dexcom$last2" || name == last2)) return
                    runCatching { scanner.stopScan(this) }
                    gatt = result.device.connectGatt(context, false, gattCallback)
                }
                override fun onScanFailed(errorCode: Int) {
                    finish(errorResult("BLE scan failed code=$errorCode"))
                }
            }

            val filters = listOf(
                ScanFilter.Builder()
                    .setServiceUuid(ParcelUuid(CGM_SERVICE_UUID))
                    .build(),
            )
            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()
            @SuppressLint("MissingPermission")
            try {
                scanner.startScan(filters, settings, scanCallback)
            } catch (e: SecurityException) {
                finish(errorResult("BLE scan permission denied: ${e.message}"))
            }
        }
    }

    private fun errorResult(msg: String) =
        Result(null, null, null, null, null, msg)

    @SuppressLint("MissingPermission")
    private fun makeGattCallback(
        txId: String,
        finish: (Result) -> Unit,
    ): BluetoothGattCallback = object : BluetoothGattCallback() {

        private var authChar: BluetoothGattCharacteristic? = null
        private var controlChar: BluetoothGattCharacteristic? = null
        private var deviceName: String? = null

        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            deviceName = gatt.device.name
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    val ok = gatt.discoverServices()
                    if (!ok) finish(Result(txId.takeLast(2), deviceName, null, null, null,
                        "discoverServices() returned false"))
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    if (status != BluetoothGatt.GATT_SUCCESS) {
                        finish(Result(txId.takeLast(2), deviceName, null, null, null,
                            "Disconnected (status=$status) — auth probably rejected. " +
                                "Verify transmitter ID."))
                    }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val svc = gatt.getService(CGM_SERVICE_UUID)
                ?: return finish(Result(txId.takeLast(2), deviceName, null, null, null,
                    "CGM service not found on $deviceName"))
            authChar = svc.getCharacteristic(AUTH_CHAR_UUID)
            controlChar = svc.getCharacteristic(CONTROL_CHAR_UUID)
            if (authChar == null || controlChar == null) {
                return finish(Result(txId.takeLast(2), deviceName, null, null, null,
                    "Auth/control characteristics missing"))
            }
            // Step 1: enable indicate on auth char and write AuthRequest.
            gatt.setCharacteristicNotification(authChar, true)
            authChar!!.getDescriptor(CLIENT_CONFIG_DESCRIPTOR)?.let {
                it.value = BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                gatt.writeDescriptor(it)
            }
        }

        @Suppress("DEPRECATION")
        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            // After notifications are enabled on authChar, kick off auth.
            if (descriptor.characteristic.uuid == AUTH_CHAR_UUID) {
                val singleUseToken = ByteArray(8).also { java.security.SecureRandom().nextBytes(it) }
                val request = byteArrayOf(0x01.toByte()) + singleUseToken + byteArrayOf(0x02.toByte())
                authChar?.value = request
                authChar?.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                gatt.writeCharacteristic(authChar)
                // Stash the token for the challenge response phase.
                pendingToken = singleUseToken
            } else if (descriptor.characteristic.uuid == CONTROL_CHAR_UUID) {
                // Control notifications now active — request latest glucose.
                val glucoseRequest = byteArrayOf(0x4E.toByte()) // GlucoseTxMessage opcode for G6
                controlChar?.value = glucoseRequest
                controlChar?.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
                gatt.writeCharacteristic(controlChar)
            }
        }

        private var pendingToken: ByteArray = ByteArray(0)

        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
        ) {
            val value = characteristic.value ?: return
            when (characteristic.uuid) {
                AUTH_CHAR_UUID -> {
                    // Expect AuthChallenge (opcode 0x03 + challenge + tokenHash).
                    if (value.isEmpty() || value[0] != 0x03.toByte() || value.size < 17) return
                    val challenge = value.copyOfRange(9, 17)
                    val response = encryptAesEcb(challenge, deriveAuthKey(txId))
                        ?: return finish(Result(txId.takeLast(2), deviceName, null, null, null,
                            "AES challenge response failed"))
                    val msg = byteArrayOf(0x04.toByte()) + response
                    characteristic.value = msg
                    gatt.writeCharacteristic(characteristic)
                }
                CONTROL_CHAR_UUID -> {
                    val parsed = parseGlucoseTx(value)
                        ?: return finish(Result(txId.takeLast(2), deviceName, null, null, null,
                            "Glucose packet parse failed (len=${value.size})"))
                    finish(Result(
                        transmitterIdLast2 = txId.takeLast(2),
                        deviceName = deviceName,
                        valueMgDl = parsed.first,
                        trend = parsed.second,
                        timestampIso = nowIso(),
                        error = null,
                    ))
                }
            }
        }

        @Suppress("DEPRECATION")
        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            // After the AuthChallenge response is accepted, swap to the
            // control characteristic and enable notifications.
            if (characteristic.uuid == AUTH_CHAR_UUID && status == BluetoothGatt.GATT_SUCCESS &&
                characteristic.value?.firstOrNull() == 0x04.toByte()
            ) {
                gatt.setCharacteristicNotification(controlChar, true)
                controlChar?.getDescriptor(CLIENT_CONFIG_DESCRIPTOR)?.let {
                    it.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                    gatt.writeDescriptor(it)
                }
            }
        }
    }

    /**
     * Dexcom G6 auth key derivation: zero-padded 8-byte key built from
     * "00" + transmitterId + "00" (each char ASCII). Documented across
     * the openaps / xDrip+ communities.
     */
    private fun deriveAuthKey(txId: String): ByteArray {
        val s = "00$txId" + "00"
        return s.substring(0, 8).toByteArray(Charsets.US_ASCII)
    }

    private fun encryptAesEcb(input: ByteArray, key: ByteArray): ByteArray? = runCatching {
        // G6 expects the 8-byte challenge expanded to a 16-byte AES block.
        val block = ByteArray(16)
        System.arraycopy(input, 0, block, 0, 8)
        System.arraycopy(input, 0, block, 8, 8)
        val cipher = Cipher.getInstance("AES/ECB/NoPadding")
        // Key is the 8-byte ASCII string padded to 16 by mirroring.
        val expandedKey = ByteArray(16)
        System.arraycopy(key, 0, expandedKey, 0, 8)
        System.arraycopy(key, 0, expandedKey, 8, 8)
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(expandedKey, "AES"))
        // Return the first 8 bytes of the AES output (G6 truncates).
        cipher.doFinal(block).copyOf(8)
    }.getOrNull()

    /**
     * Parse a G6 GlucoseRxMessage. Layout (well-documented):
     *   [0]    opcode 0x4F (GlucoseRx) or 0x31 (Glucose backfill)
     *   [1]    status
     *   [2..5] sequence (uint32 LE)
     *   [6..9] timestamp (uint32 LE, seconds since session start)
     *   [10..11] glucose value (uint16 LE) — low 12 bits are mg/dL; bit 15 = display flag
     *   [12]   state
     *   [13]   trend (signed)
     *   ...
     */
    private fun parseGlucoseTx(value: ByteArray): Pair<Double, String?>? {
        if (value.size < 14) return null
        val op = value[0].toInt() and 0xFF
        if (op != 0x4F && op != 0x31) return null
        val bb = ByteBuffer.wrap(value).order(ByteOrder.LITTLE_ENDIAN)
        val raw = bb.getShort(10).toInt() and 0x0FFF
        if (raw == 0 || raw > 400) return null
        val trendByte = value[13].toInt().toByte().toInt() // sign-extend
        val trend = trendToString(trendByte)
        return raw.toDouble() to trend
    }

    private fun trendToString(rate: Int): String? = when {
        rate < -30 -> "falling_quickly"
        rate < -15 -> "falling"
        rate < -5 -> "falling_slowly"
        rate <= 5 -> "flat"
        rate <= 15 -> "rising_slowly"
        rate <= 30 -> "rising"
        else -> "rising_quickly"
    }

    private fun nowIso(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date())
    }

    companion object {
        // Dexcom CGM Service ("the obscure UUID Dexcom uses for the data
        // channel"). Same across G4/G5/G6.
        val CGM_SERVICE_UUID: UUID = UUID.fromString("F8083532-849E-531C-C594-30F1F86A4EA5")
        val AUTH_CHAR_UUID: UUID = UUID.fromString("F8083535-849E-531C-C594-30F1F86A4EA5")
        val CONTROL_CHAR_UUID: UUID = UUID.fromString("F8083533-849E-531C-C594-30F1F86A4EA5")
        val CLIENT_CONFIG_DESCRIPTOR: UUID =
            UUID.fromString("00002902-0000-1000-8000-00805F9B34FB")
    }
}
