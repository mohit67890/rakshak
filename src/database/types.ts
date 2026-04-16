/**
 * Raksha Database Layer — Types
 *
 * Provider-agnostic types for the database layer.
 * Adapted from Chitti's database abstraction.
 */

import type {
  ContainerDefinition,
  SqlQuerySpec,
  JSONValue,
  IndexingPolicy,
  VectorEmbeddingPolicy,
  PatchOperation,
} from "@azure/cosmos";

// ============================================================================
// Database Configuration
// ============================================================================

export type DatabaseConfig = {
  /** Database endpoint URL. */
  endpoint: string;
  /** Database primary key or resource token. */
  key: string;
  /** Database name. Default: "raksha-db". */
  databaseId?: string;
};

// ============================================================================
// Container Definition Helpers
// ============================================================================

export type ContainerOptions = ContainerDefinition & {
  vectorEmbeddingPolicy?: VectorEmbeddingPolicy;
  fullTextPolicy?: {
    defaultLanguage: string;
    fullTextPaths: Array<{ path: string; language: string }>;
  };
};

// ============================================================================
// Query Helpers
// ============================================================================

export type QueryParameter = {
  name: string;
  value: JSONValue;
};

export type QueryOptions = {
  /** Maximum number of results. */
  maxResults?: number;
  /** Partition key value for scoped queries. */
  partitionKey?: string;
};

// ============================================================================
// Generic Document
// ============================================================================

export type BaseDocument = {
  id: string;
  [key: string]: unknown;
};

// ============================================================================
// Container Handle — provider-agnostic CRUD + query interface
// ============================================================================

export interface ContainerHandle<T extends BaseDocument = BaseDocument> {
  create(document: T): Promise<T>;
  upsert(document: T): Promise<T>;
  read(id: string, partitionKey: string): Promise<T | null>;
  replace(id: string, partitionKey: string, document: T): Promise<T>;
  patch(id: string, partitionKey: string, operations: PatchOperation[]): Promise<T>;
  delete(id: string, partitionKey: string): Promise<boolean>;
  query<R = T>(querySpec: SqlQuerySpec, options?: QueryOptions): Promise<R[]>;
  queryWithParams<R = T>(
    sql: string,
    parameters?: QueryParameter[],
    options?: QueryOptions,
  ): Promise<R[]>;
  count(
    whereClause?: string,
    parameters?: QueryParameter[],
    options?: QueryOptions,
  ): Promise<number>;
  getRawContainer(): unknown;
}

// ============================================================================
// Database Provider — provider-agnostic database interface
// ============================================================================

export interface DatabaseProvider {
  readonly name: string;
  initialize(): Promise<void>;
  getOrCreateContainer<T extends BaseDocument = BaseDocument>(
    options: ContainerOptions,
  ): Promise<ContainerHandle<T>>;
  getDatabaseId(): string;
}

// ============================================================================
// Re-exports for consumer convenience
// ============================================================================

export type {
  SqlQuerySpec,
  JSONValue,
  IndexingPolicy,
  VectorEmbeddingPolicy,
  PatchOperation,
};
