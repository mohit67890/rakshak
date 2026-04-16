/**
 * Raksha Database Layer — Provider Registry
 *
 * Resolves the active database provider.
 * Built-in: "cosmosdb" (default), "noop" (for tests).
 */

import type { DatabaseProvider } from "../types";
import type { ResolvedDatabaseConfig } from "../config";
import { CosmosDatabase } from "../client";
import { NoopDatabase } from "./noop";

export type DatabaseProviderFactory = (
  config: ResolvedDatabaseConfig,
) => DatabaseProvider;

const _registry = new Map<string, DatabaseProviderFactory>();

_registry.set("cosmosdb", (config) => {
  if (!config.endpoint) {
    throw new Error(
      'database: "cosmosdb" provider requires an endpoint. Set COSMOS_ENDPOINT env var.',
    );
  }
  if (!config.key) {
    throw new Error(
      'database: "cosmosdb" provider requires a key. Set COSMOS_KEY env var.',
    );
  }
  return new CosmosDatabase({
    endpoint: config.endpoint,
    key: config.key,
    databaseId: config.databaseId,
  });
});

_registry.set("noop", () => new NoopDatabase());

export function resolveDatabaseProvider(
  config: ResolvedDatabaseConfig,
): DatabaseProvider {
  const name = config.provider;
  const factory = _registry.get(name);
  if (!factory) {
    const known = [..._registry.keys()].join(", ");
    throw new Error(
      `database: unknown provider "${name}". Available: ${known}`,
    );
  }
  return factory(config);
}
