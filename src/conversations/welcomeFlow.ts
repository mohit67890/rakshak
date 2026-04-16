/**
 * Raksha — Welcome Flow
 *
 * Handles the "welcome" conversation state.
 *
 * CONTEXT-AWARE: The welcome flow checks what state the user is in before
 * deciding what to show. A returning user with an active draft sees a
 * resumption prompt, not the first-time welcome card.
 *
 * On first message (truly new user):
 *   - Sends the welcome Adaptive Card with privacy assurance + action buttons.
 *
 * On returning user with draft complaint:
 *   - Shows resumption card (resume intake / start fresh).
 *
 * On returning user with chat history (no draft):
 *   - Switches to chat/listening so the LLM continues naturally.
 *
 * On card action response:
 *   - "report"  → switch to intake mode, transition to listening
 *   - "status"  → switch to status_check mode, transition to listening
 *   - "learn"   → switch to chat mode, transition to listening
 *
 * If the user types free text instead of clicking a button:
 *   - Move to chat/listening and let the LLM handle it naturally.
 */

import { registerFlow } from "./router";
import { switchMode, linkComplaint, closeAndCreateNew, addMessage } from "./stateMachine";
import { buildWelcomeCard, buildResumptionCard } from "../cards/welcomeCard";
import { createDraft, getDraft } from "../services/complaintService";
import type { ConversationRecord } from "../models/conversation";

registerFlow("welcome", async ({ text, conversation, send, sendCard, cardActionData }) => {
  // ── Card actions (buttons on welcome/resumption cards) ──
  if (cardActionData) {
    const action = cardActionData.action as string | undefined;

    // Push a human-readable message so the LLM sees what the user chose.
    // For actions that may call closeAndCreateNew(), push AFTER so the
    // message lands on the new conversation, not the one being closed.
    const actionMessages: Record<string, string> = {
      report: "I need to report something.",
      status: "I'd like to check my complaint status.",
      learn: "Help me understand my rights.",
      resume: "I'd like to continue where I left off.",
      restart: "I want to start fresh.",
    };
    const recordActionMessage = async () => {
      if (action && actionMessages[action]) {
        conversation = await addMessage(conversation, "user", actionMessages[action]);
      }
    };

    if (action === "report") {
      // May create a new conversation — push message AFTER
      if (conversation.complaintId) {
        const existing = await getDraft(conversation.complaintId, conversation.tenantId);
        if (!existing || existing.status !== "draft") {
          conversation = await closeAndCreateNew(conversation);
        }
      }
      if (!conversation.complaintId) {
        const draft = await createDraft(
          conversation.visitorId,
          conversation.tenantId,
          conversation.id,
        );
        conversation = await linkComplaint(conversation, draft.id);
      }
      conversation = await switchMode(conversation, "intake", "listening");
      await recordActionMessage();
      return conversation;
    }

    // Resume: switch to intake/listening → router re-dispatches to LLM
    if (action === "resume") {
      await recordActionMessage();
      conversation = await switchMode(conversation, "intake", "listening");
      return conversation;
    }

    // Restart: structural reset — closes old conversation, shows welcome card
    if (action === "restart") {
      // No need to push message — we're wiping the conversation
      conversation = await closeAndCreateNew(conversation);
      await sendCard(buildWelcomeCard());
      return conversation;
    }

    // Status/Learn: switch mode → router re-dispatches to LLM
    if (action === "status") {
      await recordActionMessage();
      conversation = await switchMode(conversation, "status_check", "listening");
      return conversation;
    }

    if (action === "learn") {
      await recordActionMessage();
      conversation = await switchMode(conversation, "chat", "listening");
      return conversation;
    }
  }

  // ── Context-aware greeting / entry ──
  const lower = text.toLowerCase().trim();
  const isGreeting = /^(hi|hello|hey|namaste|help|start|menu)\b/.test(lower);

  // Check if user has an active draft complaint
  if (conversation.complaintId) {
    const draft = await getDraft(conversation.complaintId, conversation.tenantId);
    if (draft && draft.status === "draft") {
      if (isGreeting || !text) {
        // Returning user with active draft — show resumption, not welcome
        const summary = buildDraftSummary(conversation);
        await sendCard(buildResumptionCard(conversation.updatedAt, summary));
        return conversation;
      }
      // Typed something specific with a draft in progress — resume intake and process it
      conversation = await switchMode(conversation, "intake", "listening");
      return conversation; // re-dispatch to listening handler (no output → router re-dispatches)
    }
  }

  // Check if user has meaningful history (not a fresh conversation)
  // messageCount is a lightweight proxy — avoids querying messages container
  if ((conversation.messageCount ?? 0) > 2) {
    // Returning user with chat history — switch to listening, let LLM handle it
    conversation = await switchMode(conversation, "chat", "listening");
    return conversation; // re-dispatch
  }

  // ── Truly fresh user ──
  if (isGreeting || !text) {
    await sendCard(buildWelcomeCard());
    return conversation;
  }

  // User typed something specific without clicking a button —
  // switch to chat/listening WITHOUT sending a message. The router
  // will detect the state change + zero sent messages and re-dispatch
  // to the listening handler, so the user's actual message gets
  // processed by the LLM on this same turn.
  conversation = await switchMode(conversation, "chat", "listening");
  return conversation;
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a human-readable summary of what's been collected in the draft.
 */
function buildDraftSummary(conversation: ConversationRecord): string {
  const flags = conversation.collectedFlags;
  const parts: string[] = [];
  if (flags.hasIncidentDescription) parts.push("what happened");
  if (flags.hasIncidentDate) parts.push("when it occurred");
  if (flags.hasIncidentLocation) parts.push("where it happened");
  if (flags.hasAccusedPerson) parts.push("who was involved");
  if (flags.hasWitnesses) parts.push("witnesses");
  if (flags.hasPriorReporting) parts.push("prior reporting");

  if (parts.length === 0) return "We had just started — you can pick up where you left off.";
  return `You've shared: ${parts.join(", ")}.`;
}
