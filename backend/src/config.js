import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, "../../.env") });
dotenv.config({ path: path.resolve(here, "../.env") });

const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
};

export const config = {
  port: Number(process.env.PORT || 10000),
  storeUrl: (process.env.STORE_URL || "https://demo.inelabteamdev.com").replace(/\/$/, ""),
  headless: process.env.HEADLESS !== "false",
  cronSecret: required("CRON_SECRET", process.env.NODE_ENV === "production" ? undefined : "dev-cron-secret"),
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",
  defaultIntervalMinutes: Number(process.env.DEFAULT_SCRAPE_INTERVAL_MINUTES || 120),
  catalogSyncMinutes: Number(process.env.CATALOG_SYNC_MINUTES || 360),
  scrapeTimeoutMs: Number(process.env.SCRAPE_TIMEOUT_MS || 90000),
};

export function assertDatabaseConfig() {
  if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
}
