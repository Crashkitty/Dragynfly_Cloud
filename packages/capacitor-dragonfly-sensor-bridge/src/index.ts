import { registerPlugin } from "@capacitor/core";

import type { DragonflySensorBridgePlugin } from "./definitions.js";

const DragonflySensorBridge = registerPlugin<DragonflySensorBridgePlugin>(
  "DragonflySensorBridge",
  {
    web: () => import("./web.js").then((m) => new m.DragonflySensorBridgeWeb()),
  },
);

export * from "./definitions.js";
export { DragonflySensorBridge };
