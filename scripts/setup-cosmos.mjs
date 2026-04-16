#!/usr/bin/env node

/**
 * Raksha — Cosmos DB Setup Script
 *
 * Creates the raksha-db database and all required containers with
 * correct partition keys. Safe to run multiple times (idempotent).
 *
 * Usage:
 *   node scripts/setup-cosmos.mjs
 *
 * Environment variables (reads from env/.env.dev by default):
 *   COSMOS_ENDPOINT  — Cosmos DB account endpoint
 *   COSMOS_KEY       — Cosmos DB account key
 *   COSMOS_DATABASE  — Database name (default: raksha-db)
 */

import { CosmosClient } from "@azure/cosmos";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ============================================================================
// Load env vars from env/.env.dev if not already set
// ============================================================================

function loadEnvFile() {
  const envPath = resolve(__dirname, "..", "env", ".env.dev");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // No .env.dev file — rely on env vars being set
  }
}

loadEnvFile();

// ============================================================================
// Configuration
// ============================================================================

const ENDPOINT = process.env.COSMOS_ENDPOINT;
const KEY = process.env.COSMOS_KEY;
const DATABASE_NAME = process.env.COSMOS_DATABASE || "raksha-db";

if (!ENDPOINT || !KEY) {
  console.error(
    "❌ Missing COSMOS_ENDPOINT or COSMOS_KEY.\n" +
    "   Set them in env/.env.dev or as environment variables."
  );
  process.exit(1);
}

// ============================================================================
// Container Definitions
// ============================================================================

const CONTAINERS = [
  {
    id: "complaints",
    partitionKey: "/tenantId",
    description: "Complaint records — partitioned by tenant for multi-tenant isolation",
  },
  {
    id: "conversations",
    partitionKey: "/visitorId",
    description: "Conversation state + flags — partitioned by user",
  },
  {
    id: "messages",
    partitionKey: "/conversationId",
    description: "Individual chat messages — partitioned by conversation for efficient history queries",
  },
  {
    id: "auditLogs",
    partitionKey: "/tenantId",
    description: "Immutable audit trail — partitioned by tenant, no TTL (never expires)",
  },
  {
    id: "iccConfig",
    partitionKey: "/tenantId",
    description: "ICC member config + escalation settings — one document per tenant",
  },
  {
    id: "comments",
    partitionKey: "/complaintId",
    description: "Comments on complaints — by employees and ICC members, partitioned by complaint",
  },
];

// ============================================================================
// Setup
// ============================================================================

async function setup() {
  console.log(`\n🛡️  Raksha — Cosmos DB Setup\n`);
  console.log(`   Endpoint: ${ENDPOINT}`);
  console.log(`   Database: ${DATABASE_NAME}\n`);

  const client = new CosmosClient({ endpoint: ENDPOINT, key: KEY });

  // Create database (idempotent)
  console.log(`📦 Creating database "${DATABASE_NAME}"...`);
  const { database } = await client.databases.createIfNotExists({
    id: DATABASE_NAME,
  });
  console.log(`   ✅ Database ready\n`);

  // Create containers
  for (const def of CONTAINERS) {
    console.log(`📋 Creating container "${def.id}" (partition key: ${def.partitionKey})`);
    console.log(`   ${def.description}`);

    await database.containers.createIfNotExists({
      id: def.id,
      partitionKey: {
        paths: [def.partitionKey],
        kind: "Hash",
        version: 2,
      },
    });

    console.log(`   ✅ Container ready\n`);
  }

  console.log(`🎉 All done! Database "${DATABASE_NAME}" is ready with ${CONTAINERS.length} containers.\n`);
}

setup().catch((err) => {
  console.error("❌ Setup failed:", err.message);
  process.exit(1);
});
