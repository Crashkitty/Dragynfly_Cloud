// V1 feature flags. The CGM bridge token provisioning panel is hidden
// in V1 because V1 does not ship CGM ingestion — see `docs/MVP_SCOPE.md`.
// The Worker endpoints (`/api/provisioning/bridge-tokens`,
// `/api/auth/bridge-token`) remain mounted; only the UI surface is
// hidden. V1.5 / preview environments set `VITE_FEATURE_BRIDGE=true`.
export const bridgeEnabled =
  (import.meta.env.VITE_FEATURE_BRIDGE as string | undefined) === "true";
