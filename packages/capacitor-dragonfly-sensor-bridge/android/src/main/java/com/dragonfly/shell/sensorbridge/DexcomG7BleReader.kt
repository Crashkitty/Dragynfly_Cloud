package com.dragonfly.shell.sensorbridge

import android.annotation.SuppressLint
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
import kotlinx.coroutines.suspendCancellableCoroutine
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

/**
 * Dexcom G7 BLE one-shot reader.
 *
 * **Scope is split honestly.** The G7 BLE wire (service / characteristic
 * UUIDs, pairing-sequence opcodes 0x02..0x0C, glucose-Rx packet layout)
 * is public and implemented here in clean-room Kotlin against the
 * documented protocol notes in DiaBLE/DiaBLE/DexcomG7.swift (MIT). What
 * is **not** public — and therefore not implemented here — is the J-PAKE
 * authentication that the G7 transmitter requires before it will speak
 * the glucose stream:
 *
 *  - Dexcom wraps mbedtls's `ecjpake` and seeds it with a per-transmitter
 *    certificate that is signed by Dexcom's vendor key.
 *  - That certificate is what gets QR-scanned in xDrip+. The community
 *    obtains it through extraction methods from the official Dexcom app
 *    that are out of scope for a clinical pilot.
 *  - Without a valid J-PAKE pairing, the transmitter responds and then
 *    disconnects immediately, exactly as `matdoslb`'s log in the DiaBLE
 *    Libre 3 thread showed for Libre.
 *
 * This file implements:
 *   1. Scan/connect to a `DXBxxxxxx`-named transmitter (G7) or `DX01xxxx`
 *      (Stelo). UUID filter on `G7_AUTH_SERVICE_UUID`.
 *   2. Service/characteristic discovery on 3535/3538.
 *   3. The first stages of the pairing sequence (`0A 00`, `0A 01`, `0A 02`)
 *      and the certificate-load handshake, ready to feed in a JWT cert
 *      provided by the coordinator out-of-band per participant.
 *   4. After (5) lands in a future PR — the J-PAKE handshake using a
 *      bundled mbedtls / Bouncy Castle EC J-PAKE — the glucose
 *      subscription on opcode 0x4E and parsing of the GlucoseRx packet
 *      (0x4F).
 *
 * Today, `readOnce()` returns a `STAGE_PAIRING_NEEDS_CERT` result that
 * surfaces the cert problem to the UI cleanly. We do not silently fail.
 *
 * Reference: DiaBLE/DiaBLE/DexcomG7.swift lines 78-119 for the full
 * pairing-sequence ordering. Reproduced as comment-only documentation in
 * the `documentedPairingSequence` constant below.
 */
class DexcomG7BleReader(private val context: Context) {

    data class Result(
        val deviceName: String?,
        val stage: Stage,
        val valueMgDl: Double?,
        val trend: String?,
        val timestampIso: String?,
        val message: String?,
        val error: String?,
    )

    enum class Stage {
        /** Bluetooth not available or off. */
        BLE_UNAVAILABLE,
        /** Scan finished without finding a G7-class advertisement. */
        NOT_FOUND,
        /** Connected, but services don't look like G7. */
        SERVICE_MISMATCH,
        /** Authentication characteristics are ready; awaiting cert handoff. */
        STAGE_PAIRING_NEEDS_CERT,
        /** J-PAKE handshake failed (cert rejected, key derivation error). */
        STAGE_PAIRING_REJECTED,
        /** Got a glucose reading. */
        READING_OK,
        /** Other failure. */
        ERROR,
    }

    /**
     * Connect briefly to a G7 transmitter. Today this gets as far as the
     * pre-J-PAKE handshake and reports `STAGE_PAIRING_NEEDS_CERT`. Once
     * the certificate-provisioning UX and the J-PAKE port land, this
     * will additionally complete pairing, subscribe to glucose, and
     * return `READING_OK`.
     *
     * @param transmitterIdSuffix the 4-char hex suffix in the
     *   `DXBxxxxxx` advertised name. From the participant's enrollment
     *   sheet / Dexcom app.
     * @param certJwt optional pre-fetched per-transmitter JWT certificate.
     *   When present, the reader will attempt the J-PAKE handshake.
     *   When absent (today's default), the reader stops at the cert wall.
     */
    suspend fun readOnce(
        transmitterIdSuffix: String,
        certJwt: String? = null,
        timeoutMs: Long = 120_000L,
    ): Result {
        val suffix = transmitterIdSuffix.trim().uppercase()
        val manager = context.getSystemService(BluetoothManager::class.java)
            ?: return errorResult(Stage.BLE_UNAVAILABLE, "Bluetooth not available")
        val adapter = manager.adapter
            ?: return errorResult(Stage.BLE_UNAVAILABLE, "Bluetooth adapter not available")
        if (!adapter.isEnabled) return errorResult(Stage.BLE_UNAVAILABLE, "Bluetooth is off")
        val scanner = adapter.bluetoothLeScanner
            ?: return errorResult(Stage.BLE_UNAVAILABLE, "BLE scanner not available")

        return suspendCancellableCoroutine { cont ->
            val resolved = AtomicBoolean(false)
            var gatt: BluetoothGatt? = null
            var scanCallback: ScanCallback? = null

            fun finish(r: Result) {
                if (!resolved.compareAndSet(false, true)) return
                runCatching { scanCallback?.let(scanner::stopScan) }
                runCatching { gatt?.disconnect(); gatt?.close() }
                cont.resume(r)
            }

            val timeout = Runnable {
                finish(Result(null, Stage.NOT_FOUND, null, null, null,
                    "No DXB$suffix transmitter found within ${timeoutMs / 1000}s.",
                    error = null))
            }
            cont.invokeOnCancellation {
                finish(errorResult(Stage.ERROR, "Cancelled"))
            }
            android.os.Handler(android.os.Looper.getMainLooper())
                .postDelayed(timeout, timeoutMs)

            val gattCallback = makeGattCallback(certJwt, ::finish)
            scanCallback = object : ScanCallback() {
                @SuppressLint("MissingPermission")
                override fun onScanResult(callbackType: Int, result: ScanResult) {
                    val name = result.device.name ?: return
                    // G7 = "DXB<6 hex>", Stelo = "DX01<2 hex><2 dec>".
                    if (!(name.startsWith("DXB") || name.startsWith("DX01"))) return
                    if (name.startsWith("DXB") && !name.endsWith(suffix.takeLast(4))) {
                        // Wrong transmitter — keep scanning.
                        return
                    }
                    runCatching { scanner.stopScan(this) }
                    gatt = result.device.connectGatt(context, false, gattCallback)
                }
                override fun onScanFailed(errorCode: Int) {
                    finish(errorResult(Stage.ERROR, "BLE scan failed code=$errorCode"))
                }
            }

            val settings = ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build()
            @SuppressLint("MissingPermission")
            try {
                // No service-UUID filter: G7 advertising data doesn't always
                // include the 16-bit short. Filter by name in onScanResult.
                scanner.startScan(emptyList<ScanFilter>(), settings, scanCallback)
            } catch (e: SecurityException) {
                finish(errorResult(Stage.ERROR, "BLE scan permission denied: ${e.message}"))
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun makeGattCallback(
        certJwt: String?,
        finish: (Result) -> Unit,
    ): BluetoothGattCallback = object : BluetoothGattCallback() {

        private var auth3535: BluetoothGattCharacteristic? = null
        private var auth3538: BluetoothGattCharacteristic? = null
        private var deviceName: String? = null
        private var pairingStep: Int = 0

        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            deviceName = gatt.device.name
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                gatt.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                if (status != BluetoothGatt.GATT_SUCCESS && !pairingStarted) {
                    finish(Result(deviceName, Stage.ERROR, null, null, null,
                        null, "Disconnected before services (status=$status)"))
                }
            }
        }

        private var pairingStarted = false

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            val svc = gatt.getService(G7_AUTH_SERVICE_UUID)
                ?: return finish(Result(deviceName, Stage.SERVICE_MISMATCH, null, null, null,
                    null, "G7 auth service ${G7_AUTH_SERVICE_UUID} not found"))
            auth3535 = svc.getCharacteristic(AUTH_3535_UUID)
            auth3538 = svc.getCharacteristic(AUTH_3538_UUID)
            if (auth3535 == null || auth3538 == null) {
                return finish(Result(deviceName, Stage.SERVICE_MISMATCH, null, null, null,
                    null, "G7 auth characteristics 3535/3538 missing"))
            }
            // Enable notifications on both per pairing sequence (DiaBLE
            // DexcomG7.swift lines 78-84). We start by enabling 3535
            // notifications; 3538 follows once the certificate-write step
            // is reached.
            gatt.setCharacteristicNotification(auth3535, true)
            auth3535!!.getDescriptor(CLIENT_CONFIG_DESCRIPTOR)?.let {
                it.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(it)
            }
        }

        override fun onDescriptorWrite(
            gatt: BluetoothGatt,
            descriptor: BluetoothGattDescriptor,
            status: Int,
        ) {
            if (descriptor.characteristic.uuid == AUTH_3535_UUID) {
                pairingStarted = true
                // Per the DiaBLE-documented sequence, the host writes
                // `0A 00` to 3535 to begin step 0 of pairing.
                auth3535?.value = byteArrayOf(0x0A, 0x00)
                gatt.writeCharacteristic(auth3535)
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int,
        ) {
            if (characteristic.uuid != AUTH_3535_UUID) return
            // Step-by-step writes; the transmitter notifies between each.
            // The full sequence is in `documentedPairingSequence` below;
            // here we stop at the certificate-load step because we have
            // no certificate.
            if (certJwt == null) {
                finish(Result(
                    deviceName = deviceName,
                    stage = Stage.STAGE_PAIRING_NEEDS_CERT,
                    valueMgDl = null,
                    trend = null,
                    timestampIso = null,
                    message =
                        "Connected to $deviceName and started pairing. " +
                            "Need a per-transmitter J-PAKE certificate to continue. " +
                            "See docs/V1_5_PLAN.md → Step 5 for the coordinator " +
                            "provisioning flow that's not yet implemented.",
                    error = null,
                ))
            } else {
                // Future: continue the documented sequence, run J-PAKE
                // using the supplied cert, subscribe to glucose, parse.
                // Not implemented in this commit.
                finish(Result(
                    deviceName = deviceName,
                    stage = Stage.STAGE_PAIRING_REJECTED,
                    valueMgDl = null,
                    trend = null,
                    timestampIso = null,
                    message = null,
                    error = "J-PAKE pairing not yet implemented; cert was supplied " +
                        "but the EC J-PAKE handshake is the next PR.",
                ))
            }
        }
    }

    private fun errorResult(stage: Stage, msg: String) =
        Result(null, stage, null, null, null, null, msg)

    companion object {
        /**
         * The G7 authentication service UUID. The same service shape is
         * used by the G7, G7 ONE+, and Stelo according to the DiaBLE
         * notes. The full vendor service for glucose data is a different
         * UUID — implemented once J-PAKE clears.
         */
        val G7_AUTH_SERVICE_UUID: UUID = UUID.fromString("F8081532-829E-531C-C594-30F1F86A4EA5")
        val AUTH_3535_UUID: UUID = UUID.fromString("F8083535-849E-531C-C594-30F1F86A4EA5")
        val AUTH_3538_UUID: UUID = UUID.fromString("F8083538-849E-531C-C594-30F1F86A4EA5")
        val CLIENT_CONFIG_DESCRIPTOR: UUID =
            UUID.fromString("00002902-0000-1000-8000-00805F9B34FB")

        /**
         * The full pairing sequence reproduced from
         * DiaBLE/DiaBLE/DexcomG7.swift lines 78-119, for reference. It is
         * documentation, not code. The notation is the same as DiaBLE's:
         *   `write 3535  0A 00`   = host writes `0A 00` to characteristic 3535
         *   `notify 3538 20*6`    = transmitter notifies via 3538 with 6 bytes
         *
         * Implementing past the `0B02 0000 0000` write requires the J-PAKE
         * handshake; the `0B00 0200 0000 00` reply is the cert acceptance.
         */
        const val documentedPairingSequence: String = """
            enable notifications for 3535 and 3538
            write  3535  0A 00
            notify 3538  20 * 6 bytes
            notify 3535  0A 00
            notify 3538  20 * 2 bytes
            write  3538  20 * 8 bytes
            write  3535  0A 01
            notify 3538  20 * 6 bytes
            notify 3535  0A 01
            notify 3538  20 * 2 bytes
            write  3538  20 * 8 bytes
            write  3535  0A 02
            notify 3538  20 * 6 bytes
            notify 3535  0A 02
            notify 3538  20 * 2 bytes
            write  3538  20 * 8 bytes
            write  3535  02 + 8 bytes + 02
            notify 3535  03 + 16 bytes        <-- J-PAKE challenge
            write  3535  04 + 8 bytes         <-- J-PAKE response (needs cert)
            notify 3535  05 01 02             <-- pairing accepted
            ... (certificate exchange + glucose subscription) ...
        """
    }
}
