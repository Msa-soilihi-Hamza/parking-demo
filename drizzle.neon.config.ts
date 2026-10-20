import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Production migrations on Neon. Uses the DIRECT (unpooled) URL: schema changes
// must not go through PgBouncer. Credentials come from .env.neon (git-ignored).
config({ path: ".env.neon", quiet: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED! },
});
