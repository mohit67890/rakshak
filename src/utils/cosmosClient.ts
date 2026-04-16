/**
 * Raksha — Cosmos DB Singleton
 *
 * Initializes the database provider and provides typed container accessors
 * for all Raksha containers:
 *   - complaints    (partition key: /tenantId)
 *   - conversations (partition key: /visitorId)
 *   - auditLogs    (partition key: /tenantId)
 *   - iccConfig    (partition key: /tenantId)
 *
 * Usage:
 *   const { complaints, conversations } = await getRakshaContainers();
 *   await complaints.create(complaintDoc);
 */

import { PartitionKeyKind } from "@azure/cosmos";
import {
  loadDatabaseConfig,
  resolveDatabaseProvider,
  type DatabaseProvider,
  type ContainerHandle,
} from "../database/index";
import type { Complaint } from "../models/complaint";
import type { ConversationRecord, MessageDocument } from "../models/conversation";
import type { AuditLog } from "../models/auditLog";
import type { IccConfiguration } from "../models/iccConfig";

// ============================================================================
// Container Definitions
// ============================================================================

const CONTAINER_DEFS = {
  complaints: {
    id: "complaints",
    partitionKey: {
      paths: ["/tenantId"],
      kind: PartitionKeyKind.Hash,
      version: 2,
    },
  },
  conversations: {
    id: "conversations",
    partitionKey: {
      paths: ["/visitorId"],
      kind: PartitionKeyKind.Hash,
      version: 2,
    },
  },
  auditLogs: {
    id: "auditLogs",
    partitionKey: {
      paths: ["/tenantId"],
      kind: PartitionKeyKind.Hash,
      version: 2,
    },
  },
  iccConfig: {
    id: "iccConfig",
    partitionKey: {
      paths: ["/tenantId"],
      kind: PartitionKeyKind.Hash,
      version: 2,
    },
  },
  messages: {
    id: "messages",
    partitionKey: {
      paths: ["/conversationId"],
      kind: PartitionKeyKind.Hash,
      version: 2,
    },
  },
};

// ============================================================================
// Typed Container Handles
// ============================================================================

export interface RakshaContainers {
  complaints: ContainerHandle<Complaint>;
  conversations: ContainerHandle<ConversationRecord>;
  messages: ContainerHandle<MessageDocument>;
  auditLogs: ContainerHandle<AuditLog>;
  iccConfig: ContainerHandle<IccConfiguration>;
}

// ============================================================================
// Singleton
// ============================================================================

let _db: DatabaseProvider | null = null;
let _containers: RakshaContainers | null = null;

/**
 * Get the database provider singleton.
 * Initializes on first call.
 */
export async function getDatabase(): Promise<DatabaseProvider> {
  if (_db) return _db;

  const config = loadDatabaseConfig();
  _db = resolveDatabaseProvider(config);
  await _db.initialize();

  console.log(
    `[raksha] Database initialized: provider=${_db.name}, db=${_db.getDatabaseId()}`,
  );

  return _db;
}

/**
 * Get all Raksha container handles.
 * Creates containers on first call (idempotent).
 */
export async function getRakshaContainers(): Promise<RakshaContainers> {
  if (_containers) return _containers;

  const db = await getDatabase();

  const [complaints, conversations, messages, auditLogs, iccConfig] = await Promise.all([
    db.getOrCreateContainer<Complaint>(CONTAINER_DEFS.complaints),
    db.getOrCreateContainer<ConversationRecord>(CONTAINER_DEFS.conversations),
    db.getOrCreateContainer<MessageDocument>(CONTAINER_DEFS.messages),
    db.getOrCreateContainer<AuditLog>(CONTAINER_DEFS.auditLogs),
    db.getOrCreateContainer<IccConfiguration>(CONTAINER_DEFS.iccConfig),
  ]);

  _containers = { complaints, conversations, messages, auditLogs, iccConfig };

  console.log(
    `[raksha] Containers ready: ${Object.keys(CONTAINER_DEFS).join(", ")}`,
  );

  return _containers;
}

/**
 * Reset the singleton (for testing).
 */
export function resetDatabase(): void {
  _db = null;
  _containers = null;
}
