#!/usr/bin/env node
// Dragonfly Cloud — one-time dev bootstrap.
//
// What this does:
//   1. Reports node + npm versions, fails fast on too-old node.
//   2. Runs `npm install` if node_modules is missing.
//   3. Creates workers/api/.dev.vars from .dev.vars.example if absent.
//   4. Runs the local D1 migrations via wrangler.
//   5. Prints the seeded study IDs and the URLs each `npm run dev:*`
//      command will serve from.
//
// What this does NOT do:
//   - Mint a bridge token. That now lives in provider-web's patient-detail
//     "Bridge tokens" panel; doing it here would require knowing a patient
//     id before the API has been started.
//   - Touch any production secret or remote D1 database.
//   - Run anything destructive. The script is safe to re-run.
//
// Usage:
//   npm run bootstrap

import { execSync, spawnSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const log = (msg) => console.log(`[36m[bootstrap][0m ${msg}`);
const warn = (msg) => console.log(`[33m[bootstrap][0m ${msg}`);
const ok = (msg) => console.log(`[32m[bootstrap][0m ${msg}`);

function run(cmd, opts = {}) {
  log(`$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: opts.cwd ?? ROOT, env: process.env });
}

function tryRun(cmd, opts = {}) {
  log(`$ ${cmd}`);
  const r = spawnSync(cmd, { stdio: "inherit", cwd: opts.cwd ?? ROOT, shell: true });
  return r.status === 0;
}

// 1. Node version sanity check.
const major = Number(process.versions.node.split(".")[0]);
if (major < 18) {
  console.error(`Node ${process.versions.node} is too old; need >= 18.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// 2. npm install if needed.
if (!existsSync(resolve(ROOT, "node_modules"))) {
  run("npm install --no-audit --no-fund");
} else {
  log("node_modules present — skipping npm install");
}

// 3. .dev.vars from example.
const devVars = resolve(ROOT, "workers/api/.dev.vars");
const example = resolve(ROOT, "workers/api/.dev.vars.example");
if (!existsSync(devVars)) {
  copyFileSync(example, devVars);
  ok("Created workers/api/.dev.vars from .dev.vars.example");
  warn("→ Rotate the placeholder secrets before exposing this Worker to anything but localhost.");
} else {
  log("workers/api/.dev.vars already exists — leaving alone");
}

// 4. D1 migrations (local only).
const migrations = ["0001_init.sql", "0002_audit.sql"];
for (const m of migrations) {
  const okMigration = tryRun(
    `npx --yes wrangler d1 execute dragonfly --local --file=migrations/${m}`,
    { cwd: resolve(ROOT, "workers/api") },
  );
  if (!okMigration) {
    warn(`Migration ${m} failed. Re-run manually if needed:`);
    warn(`  cd workers/api && npx wrangler d1 execute dragonfly --local --file=migrations/${m}`);
  }
}

// 5. Surface seeded study IDs and URLs.
let staffSecret = "(read from workers/api/.dev.vars)";
try {
  const txt = readFileSync(devVars, "utf8");
  const m = txt.match(/STAFF_LOCAL_SECRET\s*=\s*"?([^"\n]+)"?/);
  if (m) staffSecret = m[1];
} catch {}

console.log(`
[32m[bootstrap][0m  Ready. Run [1mnpm run dev[0m to start everything in one terminal:

    api      http://localhost:8787
    patient  http://localhost:5173        (study IDs: TY-0001, TY-0002, TY-0003)
    provider http://localhost:5174        (staff sign-in: ${staffSecret})
    telemed  http://localhost:8788

Token provisioning is now the staff dashboard's job — open
[1mhttp://localhost:5174 → patient → "Bridge tokens" → Mint new token[0m
to issue one and copy it into the patient PWA's [1m/bridge[0m screen.

End-to-end demo walkthrough: [1mdocs/DEMO.md[0m.
`);
