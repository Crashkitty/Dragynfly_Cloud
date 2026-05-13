// Runtime bridge dispatch.
//
// The patient PWA codes against the `BridgeAdapter` contract, never against
// a specific implementation. At runtime we pick:
//
//   1. NativeBridgeAdapter — when an iOS/Android shell has injected
//      `window.DragonflyBridge` and it satisfies the `NativeBridgeHost`
//      surface. The token lives in the platform secure store and never
//      re-enters the WebView.
//
//   2. WebBridgeAdapter — the web demo simulator. Stores a token in
//      localStorage, emits honestly-tagged synthetic readings through the
//      authenticated `/api/glucose/sync` path. This is what
//      `docs/DEMO.md` exercises.
//
// Selection is sticky for the session — once `getBridge()` resolves an
// adapter we cache it, so `Bridge.tsx` doesn't flip mid-flow if a shell
// injects the host slightly late. A native host that arrives after the
// first call still wins on the next page load.
//
// `bridgeBackend()` exposes the choice to the UI for the status banner;
// it deliberately returns the adapter label, not the raw `window` object.

import type { BridgeAdapter } from "./types.js";
import { WebBridgeAdapter } from "./webBridge.js";
import { NativeBridgeAdapter, isNativeBridgePresent } from "./nativeBridge.js";

let cached: BridgeAdapter | null = null;

export function getBridge(): BridgeAdapter {
  if (cached) return cached;
  if (typeof window !== "undefined" && isNativeBridgePresent(window)) {
    cached = new NativeBridgeAdapter(window.DragonflyBridge!);
  } else {
    cached = new WebBridgeAdapter();
  }
  return cached;
}

export function bridgeBackend(): "native" | "web-demo" {
  return getBridge() instanceof NativeBridgeAdapter ? "native" : "web-demo";
}

// Test seam — lets unit tests reset the cached adapter between cases.
export function __resetBridgeForTests(): void {
  cached = null;
}

export type { BridgeAdapter, BridgeStatus } from "./types.js";
export { NativeBridgeAdapter, isNativeBridgePresent } from "./nativeBridge.js";
export type { NativeBridgeHost } from "./nativeBridge.js";
export { WebBridgeAdapter } from "./webBridge.js";
