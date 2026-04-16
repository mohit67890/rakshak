/**
 * Raksha Database Layer — Cosmos DB Client
 *
 * Concrete Cosmos DB implementation of DatabaseProvider and ContainerHandle.
 * Adapted from Chitti's database client.
 */

import {
  CosmosClient,
  Database,
  Container,
  type SqlQuerySpec,
  type PatchOperation,
} from "@azure/cosmos";
import type {
  DatabaseConfig,
  DatabaseProvider,
  ContainerHandle,
  ContainerOptions,
  QueryParameter,
  QueryOptions,
  BaseDocument,
} from "./types";

// ============================================================================
// Database Client
// ============================================================================

export class CosmosDatabase implements DatabaseProvider {
  readonly name = "cosmosdb";

  private client: CosmosClient;
  private databaseId: string;
  private database!: Database;
  private containers = new Map<string, CosmosContainerHandle>();
  private initialized = false;

  constructor(config: DatabaseConfig) {
    if (!config.endpoint) throw new Error("database: endpoint is required");
    if (!config.key) throw new Error("database: key is required");

    this.client = new CosmosClient({
      endpoint: config.endpoint,
      key: config.key,
    });
    this.databaseId = config.databaseId ?? "raksha-db";
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const { database } = await this.client.databases.createIfNotExists({
      id: this.databaseId,
    });
    this.database = database;
    this.initialized = true;
  }

  async getOrCreateContainer<T extends BaseDocument = BaseDocument>(
    options: ContainerOptions,
  ): Promise<CosmosContainerHandle<T>> {
    await this.ensureInitialized();

    const containerId = options.id!;
    const cached = this.containers.get(containerId);
    if (cached) return cached as CosmosContainerHandle<T>;

    const { container } =
      await this.database.containers.createIfNotExists(options);
    const handle = new CosmosContainerHandle<T>(container);
    this.containers.set(containerId, handle as CosmosContainerHandle);
    return handle;
  }

  getDatabase(): Database {
    if (!this.initialized) {
      throw new Error("database: not initialized. Call initialize() first.");
    }
    return this.database;
  }

  getDatabaseId(): string {
    return this.databaseId;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }
}

// ============================================================================
// Container Handle — Cosmos DB implementation
// ============================================================================

export class CosmosContainerHandle<
  T extends BaseDocument = BaseDocument,
> implements ContainerHandle<T> {
  private container: Container;

  constructor(container: Container) {
    this.container = container;
  }

  async create(document: T): Promise<T> {
    const { resource } = await this.container.items.create<T>(document);
    return resource as T;
  }

  async upsert(document: T): Promise<T> {
    const { resource } = await this.container.items.upsert<T>(document);
    return resource as T;
  }

  async read(id: string, partitionKey: string): Promise<T | null> {
    try {
      const { resource } = await this.container
        .item(id, partitionKey)
        .read<T>();
      return resource ?? null;
    } catch (err: unknown) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }

  async replace(id: string, partitionKey: string, document: T): Promise<T> {
    const { resource } = await this.container
      .item(id, partitionKey)
      .replace<T>(document);
    return resource as T;
  }

  async patch(
    id: string,
    partitionKey: string,
    operations: PatchOperation[],
  ): Promise<T> {
    const { resource } = await this.container
      .item(id, partitionKey)
      .patch<T>(operations);
    return resource as T;
  }

  async delete(id: string, partitionKey: string): Promise<boolean> {
    try {
      await this.container.item(id, partitionKey).delete();
      return true;
    } catch (err: unknown) {
      if (isNotFoundError(err)) return false;
      throw err;
    }
  }

  async query<R = T>(
    querySpec: SqlQuerySpec,
    options: QueryOptions = {},
  ): Promise<R[]> {
    const iterator =
      options.partitionKey !== undefined
        ? this.container.items.query<R>(querySpec, {
            partitionKey: options.partitionKey,
          })
        : this.container.items.query<R>(querySpec);
    const { resources } = await iterator.fetchAll();
    return resources;
  }

  async queryWithParams<R = T>(
    sql: string,
    parameters: QueryParameter[] = [],
    options: QueryOptions = {},
  ): Promise<R[]> {
    return this.query<R>({ query: sql, parameters }, options);
  }

  async count(
    whereClause?: string,
    parameters?: QueryParameter[],
    options: QueryOptions = {},
  ): Promise<number> {
    const sql = whereClause
      ? `SELECT VALUE COUNT(1) FROM c WHERE ${whereClause}`
      : "SELECT VALUE COUNT(1) FROM c";
    const results = await this.queryWithParams<number>(
      sql,
      parameters,
      options,
    );
    return results[0] ?? 0;
  }

  getRawContainer(): Container {
    return this.container;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function isNotFoundError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as Record<string, unknown>;
  return e.code === 404 || e.code === "NotFound" || e.statusCode === 404;
}
