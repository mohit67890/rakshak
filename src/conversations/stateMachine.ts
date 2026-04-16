/**
 * Raksha — Conversation State Machine
 *
 * Manages conversation state in Cosmos DB.
 * Each user gets one active conversation at a time.
 * State transitions drive the complaint intake flow.
 */

import { v4 as uuid } from "uuid";
import { getRakshaContainers } from "../utils/cosmosClient";
import type {
  ConversationRecord,
  ConversationFlowState,
  ConversationMessage,
  ConversationMode,
  CollectedDataFlags,
  MessageDocument,
} from "../models/conversation";
import { EMPTY_COLLECTED_FLAGS } from "../models/conversation";
import type { Complaint } from "../models/complaint";

// ============================================================================
// Read / Create
// ============================================================================

/**
 * Load the active conversation for a visitor, or create a new one.
 * Partition key = visitorId. We query for the most recent non-submitted record.
 */
export async function getOrCreateConversation(
  visitorId: string,
  tenantId: string,
): Promise<ConversationRecord> {
  const { conversations } = await getRakshaContainers();

  // Look for an active conversation (not submitted or follow_up — those are closed)
  const active = await conversations.queryWithParams<ConversationRecord>(
    `SELECT TOP 1 * FROM c
     WHERE c.visitorId = @visitorId
       AND c.state NOT IN ('submitted', 'follow_up')
     ORDER BY c.updatedAt DESC`,
    [{ name: "@visitorId", value: visitorId }],
    { partitionKey: visitorId },
  );

  if (active.length > 0) {
    return active[0];
  }

  // Create a fresh conversation — starts in chat mode (not intake)
  const now = new Date().toISOString();
  const conversation: ConversationRecord = {
    id: uuid(),
    visitorId,
    tenantId,
    mode: "chat",
    complaintId: null,
    state: "welcome",
    collectedData: {},
    collectedFlags: { ...EMPTY_COLLECTED_FLAGS },
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  return conversations.create(conversation);
}

// ============================================================================
// State Transitions
// ============================================================================

/**
 * Transition a conversation to a new state.
 */
export async function transitionState(
  conversation: ConversationRecord,
  newState: ConversationFlowState,
): Promise<ConversationRecord> {
  const { conversations } = await getRakshaContainers();

  conversation.state = newState;
  conversation.updatedAt = new Date().toISOString();

  return conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );
}

/**
 * Switch the conversation mode (e.g., chat → intake when user wants to file).
 */
export async function switchMode(
  conversation: ConversationRecord,
  newMode: ConversationMode,
  newState?: ConversationFlowState,
): Promise<ConversationRecord> {
  const { conversations } = await getRakshaContainers();

  conversation.mode = newMode;
  if (newState) conversation.state = newState;
  conversation.updatedAt = new Date().toISOString();

  return conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );
}

/**
 * Store the OpenAI Responses API response ID on the conversation.
 * Used for `previous_response_id` on the next turn — avoids resending history.
 */
export async function updateLastResponseId(
  conversation: ConversationRecord,
  responseId: string | null,
): Promise<ConversationRecord> {
  const { conversations } = await getRakshaContainers();

  conversation.lastResponseId = responseId;
  conversation.updatedAt = new Date().toISOString();

  return conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );
}

// ============================================================================
// Message History (stored in the "messages" container)
// ============================================================================

/**
 * Build a MessageDocument from its parts.
 */
function buildMessageDoc(
  conversationId: string,
  visitorId: string,
  role: ConversationMessage["role"],
  content: string,
): MessageDocument {
  return {
    id: uuid(),
    conversationId,
    visitorId,
    role,
    content,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Append a single message to the messages container and bump the counter.
 */
export async function addMessage(
  conversation: ConversationRecord,
  role: ConversationMessage["role"],
  content: string,
): Promise<ConversationRecord> {
  const { conversations, messages } = await getRakshaContainers();

  await messages.create(
    buildMessageDoc(conversation.id, conversation.visitorId, role, content),
  );

  conversation.messageCount = (conversation.messageCount ?? 0) + 1;
  conversation.updatedAt = new Date().toISOString();

  return conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );
}

/**
 * Append multiple assistant messages in a single turn.
 * Each message becomes its own document in the messages container.
 */
export async function appendMessages(
  conversation: ConversationRecord,
  contents: string[],
): Promise<ConversationRecord> {
  if (contents.length === 0) return conversation;

  const { conversations, messages } = await getRakshaContainers();
  const now = new Date().toISOString();

  await Promise.all(
    contents.map((content) =>
      messages.create({
        id: uuid(),
        conversationId: conversation.id,
        visitorId: conversation.visitorId,
        role: "assistant" as const,
        content,
        timestamp: now,
      }),
    ),
  );

  conversation.messageCount = (conversation.messageCount ?? 0) + contents.length;
  conversation.updatedAt = now;

  return conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );
}

/**
 * Get all messages for a conversation, ordered by timestamp ascending.
 */
export async function getMessages(
  conversationId: string,
): Promise<MessageDocument[]> {
  const { messages } = await getRakshaContainers();

  return messages.queryWithParams<MessageDocument>(
    `SELECT * FROM c WHERE c.conversationId = @cid ORDER BY c.timestamp ASC`,
    [{ name: "@cid", value: conversationId }],
    { partitionKey: conversationId },
  );
}

/**
 * Get the last N messages for a conversation (most recent first, then reversed).
 * Used for LLM context (last 30) and resumption detection (last 3).
 */
export async function getRecentMessages(
  conversationId: string,
  limit: number,
): Promise<MessageDocument[]> {
  const { messages } = await getRakshaContainers();

  const results = await messages.queryWithParams<MessageDocument>(
    `SELECT TOP @limit * FROM c
     WHERE c.conversationId = @cid
     ORDER BY c.timestamp DESC`,
    [
      { name: "@cid", value: conversationId },
      { name: "@limit", value: limit },
    ],
    { partitionKey: conversationId },
  );

  // Reverse so oldest-first (natural conversation order)
  return results.reverse();
}

// ============================================================================
// Collected Data
// ============================================================================

/**
 * Merge partial complaint data and flags into the conversation.
 * The LLM calls this after extracting info from the user's messages.
 */
export async function updateCollectedData(
  conversation: ConversationRecord,
  data: Partial<Complaint>,
  flags?: Partial<CollectedDataFlags>,
): Promise<ConversationRecord> {
  const { conversations } = await getRakshaContainers();

  conversation.collectedData = { ...conversation.collectedData, ...data };
  if (flags) {
    conversation.collectedFlags = { ...conversation.collectedFlags, ...flags };
  }
  conversation.updatedAt = new Date().toISOString();

  return conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );
}

// ============================================================================
// Link Complaint
// ============================================================================

/**
 * Associate a complaint ID with this conversation.
 */
export async function linkComplaint(
  conversation: ConversationRecord,
  complaintId: string,
): Promise<ConversationRecord> {
  const { conversations } = await getRakshaContainers();

  conversation.complaintId = complaintId;
  conversation.updatedAt = new Date().toISOString();

  return conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );
}

// ============================================================================
// Close & Start Fresh
// ============================================================================

/**
 * Close the current conversation (mark it as submitted so it's excluded from
 * future getOrCreateConversation queries) and create a brand-new one for a
 * fresh complaint. Returns the new conversation.
 *
 * The old conversation's full message history is preserved in Cosmos for
 * audit/compliance — it's just no longer the "active" conversation.
 */
export async function closeAndCreateNew(
  conversation: ConversationRecord,
): Promise<ConversationRecord> {
  const { conversations } = await getRakshaContainers();

  // Close the old conversation
  conversation.state = "submitted";
  conversation.updatedAt = new Date().toISOString();
  await conversations.replace(
    conversation.id,
    conversation.visitorId,
    conversation,
  );

  // Create a fresh conversation
  const now = new Date().toISOString();
  const fresh: ConversationRecord = {
    id: uuid(),
    visitorId: conversation.visitorId,
    tenantId: conversation.tenantId,
    mode: "chat",
    complaintId: null,
    state: "welcome",
    collectedData: {},
    collectedFlags: { ...EMPTY_COLLECTED_FLAGS },
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  return conversations.create(fresh);
}
