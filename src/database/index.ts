/**
 * Raksha Database Layer — Public API
 */

export { CosmosDatabase, CosmosContainerHandle } from "./client";
export { resolveDatabaseProvider } from "./providers/index";
export { loadDatabaseConfig, type ResolvedDatabaseConfig } from "./config";

export type {
  DatabaseProvider,
  ContainerHandle,
  DatabaseConfig,
  ContainerOptions,
  QueryParameter,
  QueryOptions,
  BaseDocument,
  PatchOperation,
} from "./types";
