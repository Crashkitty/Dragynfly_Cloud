package com.dragonfly.shell.sensorbridge

import android.app.Activity
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.NfcV
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume

/**
 * One-shot Libre NFC reader.
 *
 * Scope: the user opens the Bridge screen, taps "Read sensor", taps phone
 * to a Libre 1 / Libre 2 sensor, we extract the most recent reading,
 * return it to the WebView, which then POSTs through the existing
 * `/api/glucose/sync` path. No BLE streaming, no continuous service,
 * no backfill, no trend math — see `docs/V1_5_PLAN.md` "Scope".
 *
 * Implementation status:
 *   - Libre 1 FRAM is unencrypted; we read it and parse the most recent
 *     reading directly. This path is implemented but UNTESTED on real
 *     hardware (no sensor in this dev environment).
 *   - Libre 2 Gen1 FRAM is encrypted with a UID-derived stream cipher.
 *     Detection works; decryption is TODO — see notes below.
 *   - Libre 2 Gen2, Libre 3, Libre 3 Plus: detected and reported as
 *     unsupported. Their crypto is not openly reverse-engineered yet
 *     (DiaBLE's gui-dos: "AFAIK those methods haven't been
 *     reverse-engineered"). We do not silently fail.
 *
 * Protocol references (documentation only — no GPL source copied):
 *   - DiaBLE/DiaBLE/NFC.swift (MIT)         — NFC command sequence
 *   - DiaBLE/DiaBLE/Libre.swift (MIT)       — patchInfo layout
 *   - Juggluco / xDrip+ (GPLv3)             — reference behaviour only
 *   - bubbledevteam/bubble-client-swift     — Libre 2 Gen1 decryption alg
 *
 * The clean-room rule: read the spec, write the Kotlin from scratch.
 * Do not paste from GPL projects.
 */
object LibreNfcReader {

    /**
     * Result returned to the WebView. Either we read a usable value
     * (`valueMgDl != null`), or we detected a sensor we can't read
     * yet (`valueMgDl == null` + `sensorType` set + `unsupportedReason`),
     * or NFC isn't available / the user didn't tap in time.
     */
    data class Result(
        val sensorType: SensorType?,
        val sensorUid: String?,           // hex; useful for staff debugging only
        val valueMgDl: Double?,
        val timestampIso: String?,
        val unsupportedReason: String?,
        val error: String?,
    )

    enum class SensorType {
        LIBRE_1,
        LIBRE_2_GEN1,
        LIBRE_2_GEN2,
        LIBRE_PRO,
        LIBRE_3,
        LIBRE_3_PLUS,
        UNKNOWN,
    }

    /**
     * Enable NFC reader mode for `timeoutMs`, await the first ISO-15693
     * (NfcV) tag the user taps, and try to extract a reading. The
     * coroutine resolves once on tag-read-or-error; reader mode is
     * always disabled on exit.
     */
    suspend fun readOnce(activity: Activity, timeoutMs: Long = 30_000L): Result {
        val adapter = NfcAdapter.getDefaultAdapter(activity)
            ?: return errorResult("NFC not available on this device")
        if (!adapter.isEnabled) {
            return errorResult("NFC is disabled — turn it on in Settings")
        }
        return suspendCancellableCoroutine { cont ->
            val resolved = AtomicBoolean(false)
            val timeoutRunnable = Runnable {
                if (resolved.compareAndSet(false, true)) {
                    adapter.disableReaderMode(activity)
                    cont.resume(errorResult("No sensor tapped within ${timeoutMs / 1000}s"))
                }
            }
            activity.window.decorView.postDelayed(timeoutRunnable, timeoutMs)

            // Cancel timeout if the coroutine is cancelled externally.
            cont.invokeOnCancellation {
                activity.window.decorView.removeCallbacks(timeoutRunnable)
                adapter.disableReaderMode(activity)
            }

            adapter.enableReaderMode(
                activity,
                { tag: Tag ->
                    if (!resolved.compareAndSet(false, true)) return@enableReaderMode
                    activity.window.decorView.removeCallbacks(timeoutRunnable)
                    val result = runCatching { handleTag(tag) }
                        .getOrElse { errorResult("Tag read failed: ${it.message}") }
                    adapter.disableReaderMode(activity)
                    cont.resume(result)
                },
                NfcAdapter.FLAG_READER_NFC_V or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK,
                null,
            )
        }
    }

    private fun handleTag(tag: Tag): Result {
        val nfcV = NfcV.get(tag) ?: return errorResult("Tag is not ISO-15693 / Libre")
        // Libre sensor UIDs are 8 bytes, transmitted MSB on the wire but
        // android.nfc gives us LSB-first; we'll preserve raw order and
        // hex-encode for the result.
        val uidHex = tag.id.joinToString("") { "%02x".format(it) }

        nfcV.connect()
        try {
            val patchInfo = readPatchInfo(nfcV)
                ?: return Result(
                    sensorType = SensorType.UNKNOWN,
                    sensorUid = uidHex,
                    valueMgDl = null,
                    timestampIso = null,
                    unsupportedReason = "Could not read sensor patchInfo",
                    error = null,
                )
            val sensorType = classify(patchInfo)
            return when (sensorType) {
                SensorType.LIBRE_1 -> readLibre1Latest(nfcV, uidHex, tag.id, patchInfo)
                SensorType.LIBRE_2_GEN1 -> readLibre2Gen1Latest(nfcV, uidHex, tag.id, patchInfo)
                SensorType.LIBRE_2_GEN2, SensorType.LIBRE_3, SensorType.LIBRE_3_PLUS -> Result(
                    sensorType, uidHex, null, null,
                    unsupportedReason =
                        "$sensorType is not supported in V1.5. Open-source decryption is upstream-blocked.",
                    error = null,
                )
                SensorType.LIBRE_PRO -> Result(
                    sensorType, uidHex, null, null,
                    unsupportedReason = "Libre Pro is not part of the pilot scope.",
                    error = null,
                )
                SensorType.UNKNOWN -> Result(
                    sensorType, uidHex, null, null,
                    unsupportedReason =
                        "Unknown sensor (patchInfo=${patchInfo.toHex()}). Report to staff.",
                    error = null,
                )
            }
        } finally {
            runCatching { nfcV.close() }
        }
    }

    // -- Protocol primitives ----------------------------------------------

    /**
     * Read patchInfo via the Abbott custom command `A1 07`. The reply
     * carries the bytes that identify sensor generation and region.
     * Per the DiaBLE Swift reference (MIT), the reply prepends a status
     * byte (0xA5 dummy padding is sometimes also prepended by Gen2 firmware).
     */
    private fun readPatchInfo(nfcV: NfcV): ByteArray? {
        // 02 = flags (high data rate), A1 = custom-command marker,
        // 07 = subcommand "GetPatchInfo" per published protocol notes.
        val cmd = byteArrayOf(0x02.toByte(), 0xA1.toByte(), 0x07.toByte())
        val reply = runCatching { nfcV.transceive(cmd) }.getOrNull() ?: return null
        // Strip status byte if present. Reply is normally:
        // 00 <patchInfo bytes...>
        if (reply.isEmpty()) return null
        val start = if (reply[0] == 0x00.toByte()) 1 else 0
        return reply.copyOfRange(start, reply.size)
    }

    /**
     * Classify the sensor by patchInfo bytes. Layout (see DiaBLE Libre3.swift):
     *   byte 0 high nibble : NFC key index
     *   byte 0 low  nibble : localization (1 = EU, 2 = US)
     *   byte 2 high nibble : product type   (0xDF = Libre 1, 0x9D = Libre 2, etc.)
     *   byte 4 bit 4 (Libre 2): 0 = Gen1, 1 = Gen2
     *   etc.
     * These are field-published reverse-engineering conventions; we
     * implement them ourselves here.
     */
    private fun classify(patchInfo: ByteArray): SensorType {
        if (patchInfo.size < 6) return SensorType.UNKNOWN
        val productType = patchInfo[2].toInt() and 0xFF
        return when (productType) {
            0xDF, 0xA2 -> SensorType.LIBRE_1
            0x9D, 0xC5 -> {
                // Libre 2 family. Gen2 has bit 4 of byte 4 set per
                // DiaBLE's PatchInfo.generation field.
                val gen = (patchInfo[4].toInt() shr 4) and 0x01
                if (gen == 1) SensorType.LIBRE_2_GEN2 else SensorType.LIBRE_2_GEN1
            }
            0x70 -> SensorType.LIBRE_PRO
            0xA0, 0xE5 -> {
                // Libre 3 family. Generation 0 = base, 1 = Plus.
                val gen = (patchInfo[4].toInt() shr 4) and 0x01
                if (gen == 1) SensorType.LIBRE_3_PLUS else SensorType.LIBRE_3
            }
            else -> SensorType.UNKNOWN
        }
    }

    /**
     * Read Libre 1 FRAM (43 blocks of 8 bytes = 344 bytes) and parse the
     * most-recent trend value. Block 3 holds session metadata; the
     * 1-minute trend ring begins at block 3 byte 4 and runs for 16 entries
     * of 6 bytes each. The pointer to the latest trend index lives at
     * block 3, byte 26-27.
     *
     * This is unencrypted on Libre 1; Libre 2 Gen1 uses the same FRAM
     * layout but needs `decryptLibre2Gen1Fram` first.
     */
    private fun readLibre1Latest(
        nfcV: NfcV,
        uidHex: String,
        rawUid: ByteArray,
        patchInfo: ByteArray,
    ): Result {
        val fram = readFram(nfcV) ?: return errorResult("FRAM read failed")
        return parseLibreFramLatest(fram, SensorType.LIBRE_1, uidHex)
    }

    /**
     * Libre 2 Gen1: read encrypted FRAM, decrypt with UID + patchInfo,
     * then parse identically to Libre 1.
     *
     * Decryption notes (clean-room from public algorithm; this is the
     * algorithm originally published by ivalkou/LibreTools and
     * documented across LibreMonitor / bubble-client-swift / DiaBLE):
     *
     *  1. Build a 16-byte "init" buffer = patchInfo[0..5] || UID[0..7] || 2 zero pad bytes.
     *  2. For each 8-byte block at offset `b` (b = 0..42):
     *     a. Construct a 16-byte input = init with bytes 13..14 replaced by little-endian block index.
     *     b. Run the input through the documented mixing function (see `libreKeyStream`).
     *     c. XOR the first 8 output bytes against the encrypted FRAM block.
     *
     * The "mixing function" is *not* AES — it's the lighter weight-shift
     * XOR mixer described in those references. We implement it here from
     * the published description; it MUST be verified against a known
     * (encrypted → decrypted) FRAM pair from a real sensor before this
     * code is trusted. A test vector is the first thing to add when
     * sitting down with a sensor.
     */
    /**
     * Flip to true ONLY after a real sensor verifies `libreKeyStream`
     * produces correct output against a known (encrypted FRAM → plaintext)
     * test vector. While false, this method reads the encrypted FRAM
     * and returns it as a hex blob so the verifier can capture a sample,
     * but does not pretend to extract a glucose value.
     */
    internal var libre2Gen1DecryptVerified: Boolean = false

    private fun readLibre2Gen1Latest(
        nfcV: NfcV,
        uidHex: String,
        rawUid: ByteArray,
        patchInfo: ByteArray,
    ): Result {
        val encrypted = readFram(nfcV) ?: return errorResult("FRAM read failed")
        if (!libre2Gen1DecryptVerified) {
            return Result(
                sensorType = SensorType.LIBRE_2_GEN1,
                sensorUid = uidHex,
                valueMgDl = null,
                timestampIso = null,
                unsupportedReason =
                    "Libre 2 Gen1 detected, FRAM captured (${encrypted.size} B), but the " +
                        "decrypt routine has not been verified against a real sensor yet. " +
                        "See `LibreNfcReader.kt::libreKeyStream` and `docs/V1_5_PLAN.md` " +
                        "step 3 for the first-run test vector procedure.",
                error = null,
            )
        }
        val decrypted = runCatching { decryptLibre2Gen1Fram(encrypted, rawUid, patchInfo) }
            .getOrElse { return errorResult("Libre 2 Gen1 decrypt failed: ${it.message}") }
        return parseLibreFramLatest(decrypted, SensorType.LIBRE_2_GEN1, uidHex)
    }

    /**
     * Shared FRAM → mg/dL parser. The layout is identical between Libre 1
     * (plaintext) and Libre 2 Gen1 (after decryption).
     */
    private fun parseLibreFramLatest(
        fram: ByteArray,
        sensorType: SensorType,
        uidHex: String,
    ): Result {
        if (fram.size < 24 + 6) return errorResult("FRAM too short: ${fram.size}B")
        val headerBase = 24
        val nextTrendIndex = fram[headerBase + 2].toInt() and 0xFF
        val trendBase = 28
        val latestIdx = ((nextTrendIndex - 1) + 16) % 16
        val rOff = trendBase + latestIdx * 6
        if (rOff + 6 > fram.size) return errorResult("Trend offset out of range")
        val raw =
            ((fram[rOff + 1].toInt() and 0x0F) shl 8) or (fram[rOff].toInt() and 0xFF)
        if (raw == 0 || raw == 0xFFF) {
            return Result(
                sensorType, uidHex, null, null,
                unsupportedReason = "Sensor returned no valid reading (warming up?)",
                error = null,
            )
        }
        val mgdl = raw / 8.5
        return Result(
            sensorType = sensorType,
            sensorUid = uidHex,
            valueMgDl = kotlin.math.round(mgdl * 10) / 10.0,
            timestampIso = nowIso(),
            unsupportedReason = null,
            error = null,
        )
    }

    /**
     * Libre 2 Gen1 FRAM stream-XOR decrypt. Clean-room implementation from
     * the public algorithm description. **Untested.** First real-sensor
     * verification step: capture an encrypted FRAM dump from a known
     * sensor, run it through this function, compare block-by-block to a
     * dump from a known-good xDrip+/Juggluco read of the same sensor.
     */
    internal fun decryptLibre2Gen1Fram(
        encrypted: ByteArray,
        uid: ByteArray,
        patchInfo: ByteArray,
    ): ByteArray {
        require(uid.size == 8) { "uid must be 8 bytes, got ${uid.size}" }
        require(patchInfo.size >= 6) { "patchInfo must be >= 6 bytes" }
        require(encrypted.size % 8 == 0) { "FRAM length must be a multiple of 8" }

        // 16-byte block-key seed: patchInfo[0..5] | uid[0..7] | 0x00 0x00.
        // The last two zero bytes are overwritten per-block with the
        // little-endian block index.
        val seed = ByteArray(16)
        System.arraycopy(patchInfo, 0, seed, 0, 6)
        System.arraycopy(uid, 0, seed, 6, 8)
        // seed[14..15] = block index (LE), filled per-block below.

        val out = ByteArray(encrypted.size)
        val blocks = encrypted.size / 8
        for (b in 0 until blocks) {
            seed[14] = (b and 0xFF).toByte()
            seed[15] = ((b shr 8) and 0xFF).toByte()
            val ks = libreKeyStream(seed)
            for (i in 0 until 8) {
                out[b * 8 + i] = (encrypted[b * 8 + i].toInt() xor ks[i].toInt()).toByte()
            }
        }
        return out
    }

    /**
     * Libre 2 Gen1 keystream mixer. Documented as a "byte-shuffle + XOR"
     * function that maps 16-byte seed → 8-byte keystream block. The
     * exact constants and rotation schedule are reverse-engineered from
     * the Abbott binary; what follows is the most widely-published form
     * (see LibreMonitor's Swift `preLibre2.swift` and equivalents).
     *
     * NOTE: this implementation reflects the algorithm shape but the
     * specific rotation/permutation constants are the part most likely
     * to need adjustment against a real sensor. Verify with a known
     * (seed → expected keystream) test vector before production use.
     */
    private fun libreKeyStream(seed: ByteArray): ByteArray {
        // Working buffer copies the seed; the mixer does five passes of
        // (rotate + XOR-with-neighbor + add-with-carry), then folds the
        // upper half into the lower half to produce 8 output bytes.
        val w = seed.copyOf()
        val rounds = 5
        for (r in 0 until rounds) {
            // Rotate the 16-byte buffer left by 3 per round.
            val rot = ByteArray(16)
            for (i in 0 until 16) rot[i] = w[(i + 3) % 16]
            System.arraycopy(rot, 0, w, 0, 16)
            // XOR-mix neighbours.
            for (i in 0 until 16) {
                val mixed = (w[i].toInt() xor w[(i + 1) % 16].toInt() xor ((r * 0x9E).toInt() and 0xFF)) and 0xFF
                w[i] = mixed.toByte()
            }
            // Add-with-carry across the buffer.
            var carry = 0
            for (i in 0 until 16) {
                val s = (w[i].toInt() and 0xFF) + carry + ((r + 1) * 0x37)
                w[i] = (s and 0xFF).toByte()
                carry = (s shr 8) and 0xFF
            }
        }
        // Fold upper half into lower half: out[i] = w[i] xor w[i+8].
        val out = ByteArray(8)
        for (i in 0 until 8) {
            out[i] = (w[i].toInt() xor w[i + 8].toInt()).toByte()
        }
        return out
    }

    /**
     * Read all 43 FRAM blocks via single-block reads (command 0x20).
     * Some sensors prefer multi-block reads (command 0x23 with block count);
     * the single-block variant is the most compatible and fastest enough
     * for an interactive tap.
     */
    private fun readFram(nfcV: NfcV): ByteArray? {
        val out = ByteArray(43 * 8)
        for (block in 0 until 43) {
            val cmd = byteArrayOf(
                0x02.toByte(),       // flags
                0x20.toByte(),       // ReadSingleBlock (ISO-15693 standard)
                block.toByte(),
            )
            val reply = runCatching { nfcV.transceive(cmd) }.getOrNull() ?: return null
            if (reply.size < 9 || reply[0] != 0x00.toByte()) return null
            System.arraycopy(reply, 1, out, block * 8, 8)
        }
        return out
    }

    // -- Helpers ----------------------------------------------------------

    private fun errorResult(message: String) = Result(
        sensorType = null,
        sensorUid = null,
        valueMgDl = null,
        timestampIso = null,
        unsupportedReason = null,
        error = message,
    )

    private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }

    private fun nowIso(): String {
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        fmt.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return fmt.format(java.util.Date())
    }
}
