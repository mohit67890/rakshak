/**
 * Raksha — Conversation Router
 *
 * Routes incoming messages and card actions to the appropriate
 * conversation flow handler based on the current conversation state.
 *
 * The router accepts plain extracted data — not raw SDK context types.
 * This keeps it testable and decoupled from the Teams SDK.
 *
 * IMPORTANT — conversation lifecycle:
 *   The flow handler is the authority on conversation state. The `send`
 *   and `sendCard` closures only transmit messages; they do NOT write to
 *   Cosmos. After the handler returns its (possibly updated) conversation,
 *   the router appends all assistant messages in a single Cosmos write.
 *   This prevents stale-object overwrites when a handler transitions state
 *   and then sends a message.
 */

import type { ConversationRecord, ConversationFlowState } from "../models/conversation";
import { getOrCreateConversation, addMessage, appendMessages, getRecentMessages, transitionState } from "./stateMachine";
import { buildResumptionCard, buildWelcomeCard } from "../cards/welcomeCard";
import { buildEvidenceConfirmCard, buildNoComplaintEvidenceCard } from "../cards/evidenceCard";
import { validateFile } from "../services/blobService";
import { getDraft } from "../services/complaintService";

// ============================================================================
// Flow Handler Type
// ============================================================================

/**
 * A flow handler processes a single turn for a specific conversation state.
 * It receives the user's text (or card action data), the conversation record,
 * and send functions to reply.
 *
 * Returns the (possibly updated) conversation record. The returned record
 * is treated as authoritative — the router uses it for the final message
 * history write.
 */
export type FlowHandler = (params: {
  text: string;
  conversation: ConversationRecord;
  send: (message: string) => Promise<void>;
  sendCard: (card: unknown) => Promise<void>;
  sendTyping: () => Promise<void>;
  /** Emit a streaming text chunk (accumulated, not delta) */
  streamEmit: (text: string) => void;
  /** Send an informative status update (e.g. "Thinking...") */
  streamUpdate: (text: string) => void;
  /** Close the stream — finalizes the streamed message */
  streamClose: () => Promise<void>;
  cardActionData?: Record<string, unknown>;
}) => Promise<ConversationRecord>;

// ============================================================================
// Flow Registry
// ============================================================================

const flowHandlers = new Map<ConversationFlowState, FlowHandler>();

/**
 * Register a flow handler for a conversation state.
 * Called by each flow module at import time.
 */
export function registerFlow(
  state: ConversationFlowState,
  handler: FlowHandler,
): void {
  flowHandlers.set(state, handler);
}

// ============================================================================
// Attachment Type (decoupled from SDK)
// ============================================================================

/** A file attachment sent by the user in a Teams message. */
export interface TeamsAttachment {
  /** Original filename (e.g. "screenshot.png") */
  name: string;
  /** MIME type (e.g. "image/png") */
  contentType: string;
  /** Pre-authenticated download URL (short-lived, ~1 hour) */
  downloadUrl: string;
  /** File size in bytes, if available from Teams */
  sizeBytes?: number;
}

// ============================================================================
// Router Input Types (decoupled from SDK)
// ============================================================================

export interface MessageInput {
  visitorId: string;
  tenantId: string;
  text: string;
  /** Teams conversation ID — stored for proactive messaging */
  teamsConversationId?: string;
  /** File attachments from the Teams message */
  attachments?: TeamsAttachment[];
  /** Send a text message, Adaptive Card, or activity-like object */
  send: (message: unknown) => Promise<void>;
  /** Send a typing indicator (shows "..." in the chat) */
  sendTyping?: () => Promise<void>;
  /** Emit a streaming text chunk (accumulated text, not delta) */
  streamEmit?: (text: string) => void;
  /** Send an informative status update during streaming */
  streamUpdate?: (text: string) => void;
  /** Close the stream — finalizes the streamed message */
  streamClose?: () => Promise<void>;
}

export interface CardActionInput extends MessageInput {
  actionData: Record<string, unknown>;
  verb: string;
}

// ============================================================================
// Message Router
// ============================================================================

/**
 * Handle an incoming text message.
 * Loads (or creates) the conversation, dispatches to the right flow handler,
 * and records messages in the history.
 */
export async function handleMessage(input: MessageInput): Promise<void> {
  const { visitorId, tenantId, text, teamsConversationId, attachments, send: rawSend, sendTyping: rawSendTyping, streamEmit: rawStreamEmit, streamUpdate: rawStreamUpdate, streamClose: rawStreamClose } = input;

  let conversation: ConversationRecord;

  try {
    conversation = await getOrCreateConversation(visitorId, tenantId);
    // Store Teams conversation ID for proactive messaging (update if not set or changed)
    if (teamsConversationId && conversation.teamsConversationId !== teamsConversationId) {
      conversation.teamsConversationId = teamsConversationId;
    }
  } catch (error) {
    console.error("[raksha] Database error loading conversation:", error);
    await rawSend(
      "I'm having trouble connecting right now. Please try again in a moment.",
    );
    return;
  }

  // Record the user's message
  conversation = await addMessage(conversation, "user", text || (attachments?.length ? "[File attachment]" : ""));
  const originalState = conversation.state;

  // ── Attachment handling ──
  // When the user sends files, intercept before the normal flow.
  // Show an evidence confirmation card for each valid file.
  if (attachments && attachments.length > 0) {
    let handledAttachments = false;

    for (const attachment of attachments) {
      const validation = validateFile(
        attachment.contentType,
        attachment.sizeBytes,
        attachment.name,
      );

      if (!validation.valid) {
        // Invalid file — tell the user why
        await rawSend(validation.error!);
        handledAttachments = true;
        continue;
      }

      // Check if there's an active draft complaint to attach to
      const draft = conversation.complaintId
        ? await getDraft(conversation.complaintId, tenantId)
        : null;

      if (!draft || draft.status !== "draft") {
        // No active draft — offer to start one
        await rawSend(buildNoComplaintEvidenceCard(attachment.name));
        await appendMessages(conversation, ["[Adaptive Card]"]);
        return; // Don't process further attachments or text
      }

      // Valid file + active draft → show confirmation card
      await rawSend(
        buildEvidenceConfirmCard({
          fileName: attachment.name,
          typeLabel: validation.typeLabel!,
          sizeLabel: validation.sizeLabel!,
          downloadUrl: attachment.downloadUrl,
          contentType: attachment.contentType,
          complaintNumber: draft.complaintNumber,
        }),
      );
      handledAttachments = true;
    }

    if (handledAttachments) {
      await appendMessages(conversation, ["[Adaptive Card]"]);
      // If the message also had text, process it through the normal flow
      // If it was just a file with no text, we're done
      if (!text || text.trim() === "") return;
    }
  }

  // Resumption check: if user is returning to an in-progress intake after
  // a gap (>5 minutes since the prior message before this one), show a
  // welcome-back card instead of going straight to the handler.
  if (await shouldShowResumption(conversation)) {
    const summary = buildResumptionSummary(conversation);
    await rawSend(buildResumptionCard(conversation.updatedAt, summary));
    await appendMessages(conversation, ["[Adaptive Card]"]);
    return;
  }

  // Find the handler for the current state
  let handler = flowHandlers.get(conversation.state);
  if (!handler) {
    // Unknown or stale state — reset to welcome so the user isn't stuck
    console.warn(`[raksha] No handler for state "${conversation.state}", resetting to welcome`);
    conversation = await transitionState(conversation, "welcome");
    handler = flowHandlers.get("welcome");
    if (!handler) {
      await rawSend("Something went wrong. Please try again.");
      return;
    }
  }

  // Accumulate sent messages — written to Cosmos AFTER the handler returns
  const sentMessages: string[] = [];
  let didStream = false;

  const send = async (message: string): Promise<void> => {
    await rawSend(message);
    sentMessages.push(message);
  };

  const sendCard = async (card: unknown): Promise<void> => {
    await rawSend(card);
    sentMessages.push("[Adaptive Card]");
  };

  const sendTyping = async (): Promise<void> => {
    if (rawSendTyping) await rawSendTyping();
  };

  const streamEmit = (text: string): void => {
    if (rawStreamEmit) rawStreamEmit(text);
    didStream = true;
  };

  const streamUpdate = (text: string): void => {
    if (rawStreamUpdate) rawStreamUpdate(text);
  };

  const streamClose = async (): Promise<void> => {
    if (rawStreamClose) await rawStreamClose();
  };

  try {
    // Dispatch to the flow handler — its return is authoritative
    let result = await handler({ text, conversation, send, sendCard, sendTyping, streamEmit, streamUpdate, streamClose });

    // Re-dispatch: if the handler changed state without producing any output
    // (no sent messages and no streaming), forward to the new state's handler
    // so the user's text isn't lost.
    if (result.state !== originalState && sentMessages.length === 0 && !didStream) {
      const nextHandler = flowHandlers.get(result.state);
      if (nextHandler) {
        result = await nextHandler({ text, conversation: result, send, sendCard, sendTyping, streamEmit, streamUpdate, streamClose });
      }
    }

    // Persist: append any send()-tracked messages to the messages container.
    // Streamed messages are saved directly by the handler via addMessage().
    await appendMessages(result, sentMessages);
  } catch (error) {
    console.error("[raksha] Error in flow handler:", error);
    // Close any pending stream so Teams doesn't show a stuck "Thinking..."
    try { if (rawStreamClose) await rawStreamClose(); } catch { /* best-effort */ }
    await rawSend(
      "I'm sorry, something went wrong. Your conversation is saved — please try again.",
    );
  }
}

// ============================================================================
// Card Action Router
// ============================================================================

/**
 * Handle an Adaptive Card action (Action.Execute).
 * Extracts the action data and dispatches to the current flow handler.
 */
export async function handleCardAction(input: CardActionInput): Promise<void> {
  const { visitorId, tenantId, verb, actionData, teamsConversationId, send: rawSend, sendTyping: rawSendTyping, streamEmit: rawStreamEmit, streamUpdate: rawStreamUpdate, streamClose: rawStreamClose } = input;

  let conversation: ConversationRecord;

  try {
    conversation = await getOrCreateConversation(visitorId, tenantId);
    if (teamsConversationId && conversation.teamsConversationId !== teamsConversationId) {
      conversation.teamsConversationId = teamsConversationId;
    }
  } catch (error) {
    console.error("[raksha] Database error loading conversation:", error);
    await rawSend(
      "I'm having trouble connecting right now. Please try again in a moment.",
    );
    return;
  }

  // Record the card action as a user message
  conversation = await addMessage(
    conversation,
    "user",
    `[Card Action] verb=${verb} data=${JSON.stringify(actionData)}`,
  );

  let handler = flowHandlers.get(conversation.state);
  if (!handler) {
    console.warn(`[raksha] No handler for card action in state "${conversation.state}", resetting to welcome`);
    conversation = await transitionState(conversation, "welcome");
    handler = flowHandlers.get("welcome");
    if (!handler) {
      await rawSend("Something went wrong. Please try again.");
      return;
    }
  }

  const sentMessages: string[] = [];
  let didStream = false;

  const send = async (message: string): Promise<void> => {
    await rawSend(message);
    sentMessages.push(message);
  };

  const sendCard = async (card: unknown): Promise<void> => {
    await rawSend(card);
    sentMessages.push("[Adaptive Card]");
  };

  const sendTyping = async (): Promise<void> => {
    if (rawSendTyping) await rawSendTyping();
  };

  const streamEmit = (text: string): void => {
    if (rawStreamEmit) rawStreamEmit(text);
    didStream = true;
  };

  const streamUpdate = (text: string): void => {
    if (rawStreamUpdate) rawStreamUpdate(text);
  };

  const streamClose = async (): Promise<void> => {
    if (rawStreamClose) await rawStreamClose();
  };

  const originalState = conversation.state;

  try {
    let result = await handler({
      text: verb,
      conversation,
      send,
      sendCard,
      sendTyping,
      streamEmit,
      streamUpdate,
      streamClose,
      cardActionData: actionData,
    });

    // Re-dispatch: if the handler changed state without producing output,
    // forward to the new handler so the action gets processed (e.g. welcome
    // switches to listening → listeningFlow runs the LLM).
    if (result.state !== originalState && sentMessages.length === 0 && !didStream) {
      const nextHandler = flowHandlers.get(result.state);
      if (nextHandler) {
        result = await nextHandler({
          text: verb,
          conversation: result,
          send,
          sendCard,
          sendTyping,
          streamEmit,
          streamUpdate,
          streamClose,
          cardActionData: actionData,
        });
      }
    }

    await appendMessages(result, sentMessages);
  } catch (error) {
    console.error("[raksha] Error in card action handler:", error);
    // Close any pending stream so Teams doesn't show a stuck "Thinking..."
    try { if (rawStreamClose) await rawStreamClose(); } catch { /* best-effort */ }
    await rawSend(
      "I'm sorry, something went wrong. Please try again.",
    );
  }
}

// ============================================================================
// Resumption Helpers
// ============================================================================

const RESUMPTION_GAP_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Should we show a "welcome back" card instead of processing the message?
 * Conditions: in-progress intake conversation, with existing history, and
 * the previous message was sent more than 5 minutes ago.
 *
 * IMPORTANT: If the user typed something substantive (>20 chars, not a
 * greeting), skip the card and process their message normally — otherwise
 * we eat their input and force them to re-type it.
 */
async function shouldShowResumption(conversation: ConversationRecord): Promise<boolean> {
  if (conversation.mode !== "intake" || conversation.state !== "listening") return false;

  // Need at least 3 messages: some prior history + the user message we just added
  if ((conversation.messageCount ?? 0) < 3) return false;

  // Fetch last 3 messages from the messages container
  const recent = await getRecentMessages(conversation.id, 3);
  if (recent.length < 2) return false;

  // The last message is the one we just recorded; check if it's substantive
  const lastMsg = recent[recent.length - 1];
  if (lastMsg && lastMsg.role === "user") {
    const text = lastMsg.content.trim();
    const isGreeting = /^(hi|hello|hey|namaste|help|start|menu|back)$/i.test(text);
    if (!isGreeting && text.length > 20) return false; // Process substantive messages directly
  }

  // Look at the message before the one we just recorded
  const previousMsg = recent[recent.length - 2];
  if (!previousMsg) return false;

  const gap = Date.now() - new Date(previousMsg.timestamp).getTime();
  return gap > RESUMPTION_GAP_MS;
}

/**
 * Build a human-readable summary of what's been collected so far.
 */
function buildResumptionSummary(conversation: ConversationRecord): string {
  const flags = conversation.collectedFlags;
  const parts: string[] = [];
  if (flags.hasIncidentDescription) parts.push("what happened");
  if (flags.hasIncidentDate) parts.push("when it occurred");
  if (flags.hasIncidentLocation) parts.push("where it happened");
  if (flags.hasAccusedPerson) parts.push("who was involved");
  if (flags.hasWitnesses) parts.push("witnesses");
  if (flags.hasPriorReporting) parts.push("prior reporting");

  if (parts.length === 0) return "We had just started talking.";
  return `You've shared: ${parts.join(", ")}.`;
}
