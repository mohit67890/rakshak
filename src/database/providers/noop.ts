/**
 * Raksha Database Layer — No-op Provider
 *
 * Silent fallback for tests or when no database is configured.
 * Reads return empty; writes throw.
 */

import type {
  DatabaseProvider,
  ContainerHandle,
  ContainerOptions,
  BaseDocument,
  QueryParameter,
  QueryOptions,
  SqlQuerySpec,
  PatchOperation,
} from "../types";

class NoopContainerHandle<
  T extends BaseDocument = BaseDocument,
> implements ContainerHandle<T> {
  async create(_document: T): Promise<T> {
    throw new Error("database: create() called on noop provider");
  }
  async upsert(_document: T): Promise<T> {
    throw new Error("database: upsert() called on noop provider");
  }
  async read(_id: string, _partitionKey: string): Promise<T | null> {
    return null;
  }
  async replace(_id: string, _partitionKey: string, _document: T): Promise<T> {
    throw new Error("database: replace() called on noop provider");
  }
  async patch(_id: string, _partitionKey: string, _operations: PatchOperation[]): Promise<T> {
    throw new Error("database: patch() called on noop provider");
  }
  async delete(_id: string, _partitionKey: string): Promise<boolean> {
    return false;
  }
  async query<R = T>(_querySpec: SqlQuerySpec, _options?: QueryOptions): Promise<R[]> {
    return [];
  }
  async queryWithParams<R = T>(_sql: string, _parameters?: QueryParameter[], _options?: QueryOptions): Promise<R[]> {
    return [];
  }
  async count(_whereClause?: string, _parameters?: QueryParameter[], _options?: QueryOptions): Promise<number> {
    return 0;
  }
  getRawContainer(): unknown {
    return null;
  }
}

export class NoopDatabase implements DatabaseProvider {
  readonly name = "noop";

  async initialize(): Promise<void> {
    /* nothing to set up */
  }

  async getOrCreateContainer<T extends BaseDocument = BaseDocument>(
    _options: ContainerOptions,
  ): Promise<ContainerHandle<T>> {
    return new NoopContainerHandle<T>();
  }

  getDatabaseId(): string {
    return "noop";
  }
}
