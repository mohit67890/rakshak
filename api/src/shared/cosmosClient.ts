/**
 * Raksha API — Cosmos DB Client
 *
 * Lightweight Cosmos client for activity functions.
 * Uses @azure/cosmos SDK directly (no ORM, per CLAUDE.md).
 */

import { CosmosClient, type Container, type Database } from "@azure/cosmos";
import config from "./config";

let _client: CosmosClient | null = null;
let _database: Database | null = null;

function getClient(): CosmosClient {
  if (_client) return _client;

  const { endpoint, key } = config.cosmos;
  if (!endpoint || !key) {
    throw new Error("[raksha-api] Cosmos DB not configured. Set COSMOS_ENDPOINT and COSMOS_KEY.");
  }

  _client = new CosmosClient({ endpoint, key });
  return _client;
}

function getDatabase(): Database {
  if (_database) return _database;
  _database = getClient().database(config.cosmos.database);
  return _database;
}

/** Get a container reference. Does NOT create — containers must already exist. */
export function getContainer(containerId: string): Container {
  return getDatabase().container(containerId);
}

// Convenience accessors
export const complaints = (): Container => getContainer("complaints");
export const auditLogs = (): Container => getContainer("auditLogs");
export const iccConfig = (): Container => getContainer("iccConfig");
export const conversations = (): Container => getContainer("conversations");
export const comments = (): Container => getContainer("comments");
