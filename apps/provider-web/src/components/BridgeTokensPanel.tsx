import { useEffect, useState } from "react";
import { api } from "../api.js";
import type { BridgeTokenSummary, MintedBridgeToken } from "../types.js";

// Staff-only token provisioning surface. Lives inside the patient detail
// page so the staff member is always working in the context of one
// patient — the "wrong patient" failure mode is hard to hit.
//
// Mint, list, and revoke all go through `/api/provisioning/bridge-tokens`,
// which is gated by the same staff trust path as the rest of the
// dashboard (Cloudflare Access in production, STAFF_LOCAL_SECRET in dev).
//
// The raw bearer is returned to the browser exactly once on a successful
// mint and held only in component state. It is never written to
// localStorage or persisted in any way; closing or refreshing the panel
// drops it. Hand it to the patient out-of-band (paper, QR, encrypted
// email) and clear the card.

function fmt(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
}

export function BridgeTokensPanel({
  patientId,
  patientLabel,
}: {
  patientId: string;
  patientLabel: string;
}) {
  const [tokens, setTokens] = useState<BridgeTokenSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"idle" | "minting" | "loading" | "revoking">("idle");
  const [label, setLabel] = useState("");
  const [minted, setMinted] = useState<MintedBridgeToken | null>(null);
  const [copied, setCopied] = useState(false);

  async function load(): Promise<void> {
    setBusy("loading");
    try {
      setTokens(await api.listBridgeTokens(patientId));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("idle");
    }
  }

  useEffect(() => {
    void load();
    setMinted(null);
    setCopied(false);
  }, [patientId]);

  async function mint(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy("minting");
    setMinted(null);
    setCopied(false);
    try {
      const m = await api.mintBridgeToken(patientId, label.trim() || undefined);
      setMinted(m);
      setLabel("");
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("idle");
    }
  }

  async function revoke(prefix: string): Promise<void> {
    if (!confirm(`Revoke token ${prefix}? Devices using it will stop syncing immediately.`)) {
      return;
    }
    setError(null);
    setBusy("revoking");
    try {
      await api.revokeBridgeToken(prefix);
      // If the revoked token matches the one we just minted, drop it from view.
      if (minted && minted.hashPrefix === prefix) {
        setMinted(null);
        setCopied(false);
      }
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy("idle");
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setError(`Copy failed: ${e}`);
    }
  }

  return (
    <div className="panel">
      <h2>Bridge tokens</h2>
      <p style={{ color: "var(--color-secondary)", marginTop: 4 }}>
        Mint a bearer token for {patientLabel}'s sensor bridge. The token
        is shown <strong>once</strong>; hand it to the patient out-of-band
        and have them paste it into their app's <em>Sensor bridge</em>{" "}
        screen. Only its SHA-256 hash is stored on the server.
      </p>

      <form onSubmit={mint} style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "flex-end" }}>
        <div className="field" style={{ marginBottom: 0, flex: 1 }}>
          <label htmlFor="bt-label">Label (optional)</label>
          <input
            id="bt-label"
            className="input"
            placeholder="e.g. Mei iPhone, study iPad #2"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy === "minting"}>
          {busy === "minting" ? "Minting…" : "Mint new token"}
        </button>
      </form>

      {minted && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 8,
            background: "var(--color-primary-container)",
            color: "var(--color-on-primary-container)",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            New token — shown once
          </div>
          <div style={{ fontSize: 13, marginBottom: 10 }}>
            Prefix <code>{minted.hashPrefix}</code>
            {minted.label ? ` · label: ${minted.label}` : ""}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              className="input"
              readOnly
              value={minted.token}
              onFocus={(e) => e.currentTarget.select()}
              style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => copy(minted.token)}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setMinted(null);
                setCopied(false);
              }}
            >
              Hide
            </button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>
            Patient install path: have them open the app's{" "}
            <em>Sensor bridge</em> screen → <em>Install bridge token</em> →
            paste the value above. The PWA stores it in the device
            (localStorage in the browser demo; Keychain /
            EncryptedSharedPreferences in the Capacitor shell). It is
            pinned to this patient on the server; cross-patient writes are
            refused.
          </div>
        </div>
      )}

      {error && (
        <div className="banner" style={{ background: "#fde2dd", color: "#7a1d10", marginTop: 12 }}>
          {error}
        </div>
      )}

      <h3 style={{ marginTop: 20 }}>Issued tokens</h3>
      <ul className="list-clean">
        {tokens?.map((t) => (
          <li key={t.hashPrefix}>
            <span>
              <code>{t.hashPrefix}</code>
              {t.label && (
                <span style={{ marginLeft: 8, color: "var(--color-secondary)" }}>
                  {t.label}
                </span>
              )}
            </span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: "var(--color-secondary)", fontSize: 12 }}>
                {fmt(t.createdAt)}
              </span>
              <button
                className="btn btn-secondary"
                style={{ padding: "4px 10px", fontSize: 12 }}
                onClick={() => revoke(t.hashPrefix)}
                disabled={busy === "revoking"}
              >
                Revoke
              </button>
            </span>
          </li>
        ))}
        {tokens && tokens.length === 0 && (
          <li>No tokens issued for this patient yet.</li>
        )}
        {tokens === null && !error && <li>Loading…</li>}
      </ul>

      <div style={{ marginTop: 12, fontSize: 12, color: "var(--color-secondary)" }}>
        Rotation: mint a new token, hand it to the patient, then revoke
        the old one. Revoke is immediate on the server — the next sync
        request from the old token returns 401. The patient's device
        keeps a stale "installed" state until the next sync attempt;
        ask them to "Forget token" and paste the new one. The audit log
        records mint and revoke separately.
      </div>
    </div>
  );
}
