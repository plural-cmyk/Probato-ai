// Neon Secondary Database Client
// Used for dual-write during the Neon → Supabase migration period.
// Once migration is complete, this file can be removed and all calls
// routed through the primary db.ts (Supabase).

import { PrismaClient } from "@prisma/client";

const globalForNeon = globalThis as unknown as {
  neonPrisma: PrismaClient | undefined;
};

const neonUrl = process.env.NEON_DATABASE_URL;

// Only create the Neon client if a connection string is provided
// If no NEON_DATABASE_URL is set, this safely returns null and all
// writes go only to the primary (Supabase) database.
export const neonDb = neonUrl
  ? (globalForNeon.neonPrisma ??
    new PrismaClient({
      datasources: {
        db: {
          url: neonUrl,
        },
      },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    }))
  : null;

if (process.env.NODE_ENV !== "production" && neonDb) {
  globalForNeon.neonPrisma = neonDb;
}
