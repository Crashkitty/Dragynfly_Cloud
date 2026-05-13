import type { Env } from "../env.js";
import { D1Repo } from "./d1Repo.js";
import { MemoryRepo } from "./memoryRepo.js";
import type { Repo } from "./types.js";

// Per-isolate repo. Returns the D1 adapter when DB is bound; otherwise the
// in-memory adapter (dev only). The chosen adapter is stable for the
// lifetime of the isolate.
let cached: Repo | null = null;

export async function getRepo(env: Env): Promise<Repo> {
  if (!cached) {
    if (env.DB) {
      const repo = new D1Repo(env.DB);
      // Seeds three demo participants on first hit if patients table is
      // empty. No-op once data exists.
      await repo.ensureSeeded();
      cached = repo;
    } else {
      cached = new MemoryRepo();
    }
  }
  return cached;
}

export type { Repo } from "./types.js";
