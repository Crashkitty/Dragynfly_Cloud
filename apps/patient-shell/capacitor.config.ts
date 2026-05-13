import type { CapacitorConfig } from "@capacitor/cli";

// The web assets the shell hosts come straight from the patient PWA's
// production build. `npm run sync` builds the PWA first, then runs
// `cap sync` to copy the dist into ios/ and android/.
const config: CapacitorConfig = {
  appId: "com.dragonfly.patient",
  appName: "Dragonfly Patient",
  webDir: "../patient-pwa/dist",
  server: {
    // Development: point at the Worker API the device can actually reach.
    // localhost is the device's own loopback — set this to your LAN IP
    // (or a tunnel) before running on a real phone.
    androidScheme: "https",
  },
  plugins: {
    DragonflySensorBridge: {
      // Dev default. Override per-environment in
      // apps/patient-shell/capacitor.config.<env>.ts before `npx cap sync`.
      apiBase: "http://10.0.2.2:8787",
    },
  },
};

export default config;
