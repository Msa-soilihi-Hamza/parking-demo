import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Locally: PostgreSQL in Docker. In production: Neon's pooled URL (the "-pooler" host).
// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

// On Vercel (Fluid compute), closes idle connections before the function is suspended.
// Does nothing elsewhere.
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { schema };
