import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../session.js";
import { bridgeBackend, getBridge } from "../bridge/index.js";
import type { BridgeStatus } from "../bridge/types.js";
import {
  NativeBridgeAdapter,
  type DexcomG7ReadResult,
  type DexcomReadResult,
  type LibreReadResult,
} from "../bridge/nativeBridge.js";

function fmtTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export function Bridge() {
  const { patient } = useSession();
  const nav = useNavigate();
  // Runtime-dispatched: NativeBridgeAdapter when window.DragonflyBridge is
  // injected by an iOS/Android shell, WebBridgeAdapter otherwise. Resolved
  // once per render so a shell that initialises late still wins on reload.
  const bridge = useMemo(() => getBridge(), []);
  const backend = useMemo(() => bridgeBackend(), []);
  const isNative = bridge instanceof NativeBridgeAdapter;
  const supportsNfc = isNative && (bridge as NativeBridgeAdapter).supportsLibreNfc();
  const supportsG6 = isNative && (bridge as NativeBridgeAdapter).supportsDexcomG6();
  const supportsG7 = isNative && (bridge as NativeBridgeAdapter).supportsDexcomG7();
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [token, setToken] = useState("");
  const [value, setValue] = useState("120");
  const [g6TxId, setG6TxId] = useState("");
  const [g7Suffix, setG7Suffix] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastNfcResult, setLastNfcResult] = useState<LibreReadResult | null>(null);
  const [lastG6Result, setLastG6Result] = useState<DexcomReadResult | null>(null);
  const [lastG7Result, setLastG7Result] = useState<DexcomG7ReadResult | null>(null);

  async function refresh(): Promise<void> {
    setStatus(await bridge.getStatus());
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function install(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null); setSuccess(null);
    setBusy("install");
    try {
      await bridge.installToken(token);
      setToken("");
      setSuccess(
        backend === "native"
          ? "Token installed in the device secure store."
          : "Token installed on this device.",
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function clear(): Promise<void> {
    setError(null); setSuccess(null);
    setBusy("clear");
    try {
      await bridge.clearToken();
      setSuccess("Token removed.");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function readSensor(): Promise<void> {
    if (!patient) return;
    if (!(bridge instanceof NativeBridgeAdapter) || !bridge.supportsLibreNfc()) return;
    setError(null); setSuccess(null); setLastNfcResult(null);
    setBusy("nfc");
    try {
      const res = await bridge.readLibreOnce({ patientId: patient.id });
      setLastNfcResult(res);
      if (res.error) {
        setError(res.error);
      } else if (res.unsupportedReason) {
        setError(res.unsupportedReason);
      } else if (res.valueMgDl != null && res.sync) {
        setSuccess(
          `Read ${res.valueMgDl} mg/dL from ${res.sensorType ?? "sensor"}. ` +
            `Sync accepted=${res.sync.accepted} duplicates=${res.sync.duplicates}.`,
        );
      } else if (res.valueMgDl != null && res.syncError) {
        setError(`Read ${res.valueMgDl} mg/dL but sync failed: ${res.syncError}`);
      } else {
        setError("No reading extracted.");
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function readG6(): Promise<void> {
    if (!patient) return;
    if (!(bridge instanceof NativeBridgeAdapter) || !bridge.supportsDexcomG6()) return;
    if (!/^[A-Z0-9]{6}$/i.test(g6TxId.trim())) {
      setError("Enter the 6-character G6 transmitter ID (on the applicator).");
      return;
    }
    setError(null); setSuccess(null); setLastG6Result(null);
    setBusy("g6");
    try {
      const res = await bridge.readDexcomG6Once({
        patientId: patient.id,
        transmitterId: g6TxId.trim().toUpperCase(),
      });
      setLastG6Result(res);
      if (res.error) {
        setError(res.error);
      } else if (res.valueMgDl != null && res.sync) {
        setSuccess(
          `Read ${res.valueMgDl} mg/dL from G6${res.transmitterIdLast2 ?? ""}. ` +
            `Sync accepted=${res.sync.accepted} duplicates=${res.sync.duplicates}.`,
        );
      } else if (res.valueMgDl != null && res.syncError) {
        setError(`Read ${res.valueMgDl} mg/dL but sync failed: ${res.syncError}`);
      } else {
        setError("Connected but no reading received within the timeout.");
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function readG7(): Promise<void> {
    if (!patient) return;
    if (!(bridge instanceof NativeBridgeAdapter) || !bridge.supportsDexcomG7()) return;
    if (!/^[A-F0-9]{4,6}$/i.test(g7Suffix.trim())) {
      setError("Enter the 4-6 hex suffix from the G7 advertised name (e.g. DXB9F12 → 9F12).");
      return;
    }
    setError(null); setSuccess(null); setLastG7Result(null);
    setBusy("g7");
    try {
      const res = await bridge.readDexcomG7Once({
        patientId: patient.id,
        transmitterIdSuffix: g7Suffix.trim().toUpperCase(),
      });
      setLastG7Result(res);
      if (res.error) {
        setError(res.error);
      } else if (res.stage === "READING_OK" && res.valueMgDl != null) {
        setSuccess(`Read ${res.valueMgDl} mg/dL from G7.`);
      } else if (res.stage === "STAGE_PAIRING_NEEDS_CERT") {
        setError(
          res.message ??
            "G7 pairing reached the J-PAKE cert wall. Ask your coordinator for the per-transmitter certificate.",
        );
      } else if (res.message) {
        setError(res.message);
      } else {
        setError(`G7 read stopped at stage ${res.stage}.`);
      }
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function emit(): Promise<void> {
    if (!patient) return;
    const v = Number(value);
    if (!Number.isFinite(v) || v < 10 || v > 1000) {
      setError("Enter a number between 10 and 1000.");
      return;
    }
    setError(null); setSuccess(null);
    setBusy("emit");
    try {
      const res = await bridge.emitDemoReading({
        patientId: patient.id,
        valueMgDl: v,
      });
      setSuccess(
        `Synced. accepted=${res.accepted} duplicates=${res.duplicates} rejected=${res.rejected.length}`,
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="app-bar">
        <h1>Sensor bridge</h1>
        <button className="pill pill-muted" onClick={() => nav(-1)} type="button">
          Back
        </button>
      </header>

      <main className="screen">
        <p className="mvp-banner">
          {backend === "native" ? (
            <>
              Native shell detected — token will be stored by the host in
              the platform secure store. Vendor sensor capture is still
              stubbed; this screen only exercises the demo path.
            </>
          ) : (
            <>
              Web demo simulator — emits synthetic readings tagged{" "}
              <strong>Dragonfly Demo Bridge</strong>. No real Dexcom / Libre
              capture is implemented.
            </>
          )}
        </p>

        <section className="card">
          <h2>Status</h2>
          <ul className="list-clean" style={{ marginTop: 8, listStyle: "none", padding: 0 }}>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ color: "var(--color-secondary)" }}>Adapter</span>
              <span>{status?.adapterLabel ?? "—"}</span>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ color: "var(--color-secondary)" }}>Backend</span>
              <span>
                <span className={backend === "native" ? "pill pill-success" : "pill pill-muted"}>
                  {backend === "native" ? "Native shell" : "Web demo"}
                </span>
              </span>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ color: "var(--color-secondary)" }}>Token installed</span>
              <span>
                {status?.tokenInstalled ? (
                  <span className="pill pill-success">Installed</span>
                ) : (
                  <span className="pill pill-warning">Missing</span>
                )}
              </span>
            </li>
            <li style={{ display: "flex", justifyContent: "space-between", padding: "6px 0" }}>
              <span style={{ color: "var(--color-secondary)" }}>Last sync</span>
              <span>{fmtTime(status?.lastSyncedAt ?? null)}</span>
            </li>
          </ul>
        </section>

        <form className="card" onSubmit={install}>
          <h2>Install bridge token</h2>
          <p style={{ color: "var(--color-secondary)", marginTop: 4 }}>
            Paste the token your study coordinator generated for you. The
            token is stored only on this device and used to authenticate
            sensor uploads tied to your participant record.
          </p>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="token">Bridge token</label>
            <input
              id="token"
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy === "install"}
            style={{ marginTop: 16 }}>
            {busy === "install" ? "Installing…" : "Install on this device"}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy === "clear"}
            style={{ marginTop: 8 }} onClick={clear}>
            {busy === "clear" ? "Clearing…" : "Forget token"}
          </button>
        </form>

        {supportsNfc && (
          <section className="card">
            <h2>Read Libre sensor (NFC tap)</h2>
            <p style={{ color: "var(--color-secondary)", marginTop: 4 }}>
              Tap your phone to your Libre sensor. We'll read the latest
              value and sync it. One reading per tap — no continuous
              monitoring.
            </p>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!status?.tokenInstalled || busy === "nfc"}
              onClick={readSensor}
              style={{ marginTop: 16 }}
            >
              {busy === "nfc" ? "Hold phone to sensor…" : "Read Libre sensor"}
            </button>
            {!status?.tokenInstalled && (
              <p style={{ color: "var(--color-secondary)", marginTop: 12 }}>
                Install a token first.
              </p>
            )}
            {lastNfcResult?.sensorType && (
              <p style={{ color: "var(--color-secondary)", marginTop: 12, fontSize: 13 }}>
                Detected: <code>{lastNfcResult.sensorType}</code>
                {lastNfcResult.sensorUid && (
                  <>
                    {" · UID "}<code style={{ wordBreak: "break-all" }}>{lastNfcResult.sensorUid}</code>
                  </>
                )}
              </p>
            )}
          </section>
        )}

        {supportsG6 && (
          <section className="card">
            <h2>Read Dexcom G6 (BLE)</h2>
            <p style={{ color: "var(--color-secondary)", marginTop: 4 }}>
              Briefly connects to your G6 transmitter and waits for the
              next 5-minute reading. Up to ~6 minutes; keep your phone
              near the transmitter.
            </p>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="g6tx">G6 transmitter ID (6 chars)</label>
              <input
                id="g6tx"
                className="input"
                value={g6TxId}
                onChange={(e) => setG6TxId(e.target.value)}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
              />
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!status?.tokenInstalled || busy === "g6"}
              onClick={readG6}
              style={{ marginTop: 12 }}
            >
              {busy === "g6" ? "Connecting to G6…" : "Read Dexcom G6"}
            </button>
            {lastG6Result?.deviceName && (
              <p style={{ color: "var(--color-secondary)", marginTop: 12, fontSize: 13 }}>
                Device: <code>{lastG6Result.deviceName}</code>
                {lastG6Result.trend && (
                  <> · trend <code>{lastG6Result.trend}</code></>
                )}
              </p>
            )}
          </section>
        )}

        {supportsG7 && (
          <section className="card">
            <h2>Read Dexcom G7 (BLE)</h2>
            <p style={{ color: "var(--color-secondary)", marginTop: 4 }}>
              <strong>Partial.</strong> Connects and starts pairing,
              but the J-PAKE certificate your coordinator needs to
              provision is not yet integrated. You can run this to
              verify the BLE wire is reachable; an actual reading needs
              the certificate path that lands in a later update.
            </p>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor="g7suf">G7 advertised-name suffix (e.g. 9F12)</label>
              <input
                id="g7suf"
                className="input"
                value={g7Suffix}
                onChange={(e) => setG7Suffix(e.target.value)}
                placeholder="9F12"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
              />
            </div>
            <button
              className="btn btn-primary"
              type="button"
              disabled={!status?.tokenInstalled || busy === "g7"}
              onClick={readG7}
              style={{ marginTop: 12 }}
            >
              {busy === "g7" ? "Connecting to G7…" : "Test G7 pairing"}
            </button>
            {lastG7Result && (
              <p style={{ color: "var(--color-secondary)", marginTop: 12, fontSize: 13 }}>
                Stage: <code>{lastG7Result.stage}</code>
                {lastG7Result.deviceName && (
                  <> · device <code>{lastG7Result.deviceName}</code></>
                )}
              </p>
            )}
          </section>
        )}

        <section className="card">
          <h2>Send a demo reading</h2>
          <p style={{ color: "var(--color-secondary)", marginTop: 4 }}>
            Submits one synthetic reading through the same authenticated
            sync path a real bridge uses. Useful for end-to-end testing
            without a sensor.
          </p>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="value">Value (mg/dL)</label>
            <input
              id="value"
              className="input"
              type="number"
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              min={10}
              max={1000}
            />
          </div>
          <button
            className="btn btn-primary"
            type="button"
            disabled={!status?.tokenInstalled || busy === "emit"}
            onClick={emit}
            style={{ marginTop: 16 }}
          >
            {busy === "emit" ? "Sending…" : "Send demo reading"}
          </button>
          {!status?.tokenInstalled && (
            <p style={{ color: "var(--color-secondary)", marginTop: 12 }}>
              Install a token first.
            </p>
          )}
        </section>

        {error && (
          <p className="status-critical" role="alert">{error}</p>
        )}
        {success && (
          <p className="status-ok" role="status">{success}</p>
        )}
      </main>
    </>
  );
}
