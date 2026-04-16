/**
 * Raksha Database Layer — Configuration
 *
 * Loads database config from environment variables.
 * Simplified from Chitti's config (no chitti.json file support).
 */

import type { DatabaseConfig } from "./types";

export type ResolvedDatabaseConfig = DatabaseConfig & {
  provider: string;
};

export function loadDatabaseConfig(): ResolvedDatabaseConfig {
  return {
    provider: process.env.DATABASE_PROVIDER ?? "cosmosdb",
    endpoint: process.env.COSMOS_ENDPOINT ?? "",
    key: process.env.COSMOS_KEY ?? "",
    databaseId: process.env.COSMOS_DATABASE ?? "raksha-db",
  };
}
