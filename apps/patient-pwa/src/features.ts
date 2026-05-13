// V1 feature flags. The CGM bridge surfaces (sensor-bridge screen,
// token install, native shell affordances) live behind a flag because
// V1 ships without CGM ingestion — see `docs/MVP_SCOPE.md`. The code
// is preserved so V1.5 can re-enable the surface with one env var,
// not a code revert.
//
// Default: false. Production V1 builds do not set this. V1.5 / preview
// environments set `VITE_FEATURE_BRIDGE=true` in `.env.local`.
export const bridgeEnabled =
  (import.meta.env.VITE_FEATURE_BRIDGE as string | undefined) === "true";
