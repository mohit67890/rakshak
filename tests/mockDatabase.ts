/**
 * Raksha — In-Memory Database Mock
 *
 * Implements ContainerHandle with a simple Map for testing.
 * Also provides a mock getRakshaContainers that returns in-memory containers.
 */

import type { PatchOperation, SqlQuerySpec } from "@azure/cosmos";
import type {
  ContainerHandle,
  BaseDocument,
  QueryParameter,
  QueryOptions,
} from "../src/database/types";
import type { Complaint } from "../src/models/complaint";
import type { ConversationRecord, MessageDocument } from "../src/models/conversation";
import type { AuditLog } from "../src/models/auditLog";
import type { IccConfiguration } from "../src/models/iccConfig";
import type { RakshaContainers } from "../src/utils/cosmosClient";

/**
 * In-memory ContainerHandle for testing.
 * Stores documents in a Map keyed by `id`.
 */
export class InMemoryContainer<T extends BaseDocument> implements ContainerHandle<T> {
  private store = new Map<string, T>();

  async create(document: T): Promise<T> {
    this.store.set(document.id, structuredClone(document));
    return structuredClone(document);
  }

  async upsert(document: T): Promise<T> {
    this.store.set(document.id, structuredClone(document));
    return structuredClone(document);
  }

  async read(id: string, _partitionKey: string): Promise<T | null> {
    const doc = this.store.get(id);
    return doc ? structuredClone(doc) : null;
  }

  async replace(id: string, _partitionKey: string, document: T): Promise<T> {
    this.store.set(id, structuredClone(document));
    return structuredClone(document);
  }

  async patch(_id: string, _partitionKey: string, _operations: PatchOperation[]): Promise<T> {
    throw new Error("patch not implemented in mock");
  }

  async delete(id: string, _partitionKey: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async query<R = T>(_querySpec: SqlQuerySpec, _options?: QueryOptions): Promise<R[]> {
    return Array.from(this.store.values()) as unknown as R[];
  }

  async queryWithParams<R = T>(
    sql: string,
    parameters?: QueryParameter[],
    _options?: QueryOptions,
  ): Promise<R[]> {
    const docs = Array.from(this.store.values());

    // Simple filtering for common patterns used in the codebase
    if (sql.includes("c.visitorId = @visitorId") && sql.includes("NOT IN ('submitted', 'follow_up')")) {
      const visitorId = parameters?.find(p => p.name === "@visitorId")?.value;
      return docs.filter((d: unknown) => {
        const conv = d as ConversationRecord;
        return conv.visitorId === visitorId &&
          conv.state !== "submitted" &&
          conv.state !== "follow_up";
      }).sort((a: unknown, b: unknown) =>
        (b as ConversationRecord).updatedAt.localeCompare((a as ConversationRecord).updatedAt),
      ).slice(0, 1) as unknown as R[];
    }

    if (sql.includes("c.complainantId = @complainantId")) {
      const complainantId = parameters?.find(p => p.name === "@complainantId")?.value;
      return docs.filter((d: unknown) => {
        const comp = d as Complaint;
        return comp.complainantId === complainantId;
      }) as unknown as R[];
    }

    // Messages container: filter by conversationId, order by timestamp
    if (sql.includes("c.conversationId = @cid")) {
      const cid = parameters?.find(p => p.name === "@cid")?.value;
      let filtered = docs.filter((d: unknown) => {
        const msg = d as MessageDocument;
        return msg.conversationId === cid;
      });

      // Sort by timestamp
      const isDesc = sql.includes("ORDER BY c.timestamp DESC");
      filtered.sort((a: unknown, b: unknown) => {
        const aTs = (a as MessageDocument).timestamp;
        const bTs = (b as MessageDocument).timestamp;
        return isDesc ? bTs.localeCompare(aTs) : aTs.localeCompare(bTs);
      });

      // Handle TOP @limit
      const limitParam = parameters?.find(p => p.name === "@limit")?.value;
      if (limitParam && typeof limitParam === "number") {
        filtered = filtered.slice(0, limitParam);
      }

      return filtered as unknown as R[];
    }

    return docs as unknown as R[];
  }

  async count(): Promise<number> {
    return this.store.size;
  }

  getRawContainer(): unknown {
    return this.store;
  }

  // Test helpers
  getAll(): T[] {
    return Array.from(this.store.values()).map(d => structuredClone(d));
  }

  getById(id: string): T | undefined {
    const doc = this.store.get(id);
    return doc ? structuredClone(doc) : undefined;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Create a fresh set of in-memory containers for testing.
 */
export function createMockContainers(): {
  containers: RakshaContainers;
  complaints: InMemoryContainer<Complaint>;
  conversations: InMemoryContainer<ConversationRecord>;
  messages: InMemoryContainer<MessageDocument>;
  auditLogs: InMemoryContainer<AuditLog>;
  iccConfig: InMemoryContainer<IccConfiguration>;
} {
  const complaintsContainer = new InMemoryContainer<Complaint>();
  const conversationsContainer = new InMemoryContainer<ConversationRecord>();
  const messagesContainer = new InMemoryContainer<MessageDocument>();
  const auditLogsContainer = new InMemoryContainer<AuditLog>();
  const iccConfigContainer = new InMemoryContainer<IccConfiguration>();

  const containers: RakshaContainers = {
    complaints: complaintsContainer,
    conversations: conversationsContainer,
    messages: messagesContainer,
    auditLogs: auditLogsContainer,
    iccConfig: iccConfigContainer,
  };

  return {
    containers,
    complaints: complaintsContainer,
    conversations: conversationsContainer,
    messages: messagesContainer,
    auditLogs: auditLogsContainer,
    iccConfig: iccConfigContainer,
  };
}
