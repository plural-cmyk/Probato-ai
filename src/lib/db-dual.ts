// Dual-Write Database Utility
// During the Neon → Supabase migration period, we write to both databases.
// Primary: Supabase (DATABASE_URL via db.ts)
// Secondary: Neon (NEON_DATABASE_URL via db-neon.ts)
//
// Usage:
//   import { dualWrite } from "@/lib/db-dual";
//   dualWrite(async (dbs) => {
//     await dbs.primary.project.create({ data: {...} });
//     await dbs.secondary?.project.create({ data: {...} }); // null if no Neon
//   });
//
// Once migration is complete, remove dualWrite calls and use only `db` from db.ts.

import { db } from "./db";
import { neonDb } from "./db-neon";

interface DualClients {
  primary: typeof db;
  secondary: typeof db | null;
}

/**
 * Execute a function with access to both primary (Supabase) and secondary (Neon) databases.
 * The secondary may be null if NEON_DATABASE_URL is not configured.
 */
export async function dualWrite<T>(fn: (dbs: DualClients) => Promise<T>): Promise<T> {
  const dbs: DualClients = {
    primary: db,
    secondary: neonDb,
  };
  return fn(dbs);
}

/**
 * Write to both databases in parallel. Best for fire-and-forget writes
 * where you don't need the Neon result for the response.
 * Errors in the secondary write are logged but don't fail the primary operation.
 */
export async function dualWriteAsync<T>(
  primaryOp: () => Promise<T>,
  secondaryOp: (primaryResult: T) => Promise<void>
): Promise<T> {
  const result = await primaryOp();

  // Fire-and-forget write to Neon
  if (neonDb) {
    secondaryOp(result).catch((err) => {
      console.error("[DualWrite] Neon secondary write failed:", err);
    });
  }

  return result;
}

/**
 * Sync a model from primary (Supabase) to secondary (Neon).
 * Used for initial data migration or periodic sync.
 */
export async function syncToNeon(
  modelName: string,
  data: Record<string, unknown>
): Promise<void> {
  if (!neonDb) return;

  try {
    // @ts-expect-error — dynamic model access for sync
    await neonDb[modelName].upsert({
      where: { id: data.id as string },
      update: data,
      create: data,
    });
  } catch (err) {
    console.error(`[DualWrite] Sync to Neon failed for ${modelName}:`, err);
  }
}
