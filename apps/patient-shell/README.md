# Patient shell (Capacitor)

iOS / Android Capacitor wrapper around `apps/patient-pwa`. The shell
exists to prove one thing: the runtime BridgeAdapter dispatch in the
patient PWA can reach a real native plugin
(`@dragonfly/capacitor-sensor-bridge`) that stores the bridge token in
the platform secure store and authenticates `POST /api/glucose/sync`
itself.

It is **not** a vendor sensor capture app. Real Dexcom / Libre BLE/NFC
adapters are not implemented yet; current bridge support remains
limited to the simulated and native-shell-ready demo paths. No direct
device capture is claimed in this MVP.

## Layout

```text
apps/patient-shell/
  package.json            ← Capacitor app metadata
  capacitor.config.ts     ← appId, webDir → ../patient-pwa/dist, plugin config
  .gitignore              ← ios/, android/ are generated locally
  README.md               ← this file
```

The iOS Xcode project and Android Gradle project are **generated locally**
by `npx cap add ios` / `npx cap add android` and are intentionally not
committed (regenerable boilerplate; large; touches signing). The plugin
itself is in `packages/capacitor-dragonfly-sensor-bridge` and is the
source of truth for the native-side wiring.

## First-time setup

```bash
# from repo root
npm install                                   # workspaces install
npm run build:web --workspace=@dragonfly/patient-shell

cd apps/patient-shell
npx cap add ios          # macOS + Xcode
npx cap add android      # Android Studio + JDK 17
npx cap sync             # copies the PWA dist + plugin sources
```

After `cap sync` you'll see the plugin show up in
`ios/App/Pods/` and `android/capacitor-cordova-android-plugins/` —
this is what wires `window.Capacitor.Plugins.DragonflySensorBridge`
on device. The runtime shim at
`apps/patient-pwa/public/dragonfly-shell-shim.js` then translates that
into `window.DragonflyBridge` for the PWA's runtime dispatcher.

## Running on device

```bash
# Open the platform IDE; build & run from there.
npx cap open ios
npx cap open android
```

Before running, set `apiBase` in `capacitor.config.ts` to a URL the
device can actually reach:

| Target | Recommended `apiBase` |
|---|---|
| iOS Simulator | `http://localhost:8787` |
| Android Emulator | `http://10.0.2.2:8787` (the emulator's host loopback) |
| Real device on LAN | `http://<dev-machine-LAN-IP>:8787` |
| Real device, public | a `cloudflared` tunnel — see `docs/CLOUDFLARED.md` |

The patient PWA's `/bridge` screen will show **Backend: Native shell**
once the page loads inside the Capacitor WebView.

## Token install on device

Out-of-band hand-off only. The coordinator mints a token in
`provider-web` (under the patient detail's "Bridge tokens" panel),
shares it with the patient through whatever channel the study allows
(paper, QR, encrypted email), and the patient pastes it into the
`/bridge` screen on their device. The plugin writes it to the iOS
Keychain / Android Keystore-backed `EncryptedSharedPreferences`. The
WebView never sees the raw token again.

## Privacy posture

| Property | How it's preserved |
|---|---|
| No vendor cloud in the primary path | The plugin only ever calls `POST /api/glucose/sync` on the Dragonfly Worker. |
| Token never re-enters the WebView | `installToken` writes to native secure storage; `getStatus` only returns `tokenInstalled: true/false`. |
| Strict patient binding | The plugin pins the `patientId` the token was first associated with and refuses cross-patient writes locally. The Worker enforces the same rule server-side. |
| Honest reading tagging | `emitDemoReading` always sends `vendor: "unknown"`, `deviceName: "Dragonfly Demo Bridge"`, `source: "manual"`. |
| Web demo path intact | When the PWA is loaded in a normal browser, `window.Capacitor` is undefined, the shim no-ops, and `WebBridgeAdapter` handles the page. |

## Updating

After you change either the patient PWA or the plugin sources:

```bash
cd apps/patient-shell
npm run sync   # = build the PWA, then `cap sync`
```

The native projects pick up changes the next time you build in
Xcode / Android Studio.
