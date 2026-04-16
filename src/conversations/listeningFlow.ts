/**
 * Raksha — Listening Flow
 *
 * The core conversational handler. Registered for the "listening" state.
 *
 * This is where the LLM drives the conversation. Behavior depends on mode:
 *
 *   chat         — Free-form Q&A about rights, POSH, support
 *   intake       — Guided complaint intake. LLM extracts structured data
 *                   from natural conversation and updates collectedFlags.
 *                   When enough info is collected, offers to prepare a summary.
 *   status_check — Complaint status lookup (stub for now)
 *
 * The user can say "menu" at any time to go back to the welcome card.
 */

import { registerFlow } from "./router";
import { transitionState, switchMode, updateCollectedData, linkComplaint, closeAndCreateNew, addMessage, getRecentMessages, updateLastResponseId } from "./stateMachine";
import { chatStream } from "../services/llm/index";
import type { ToolExecutor } from "../services/llm/index";
import { buildWelcomeCard, buildReadinessCard, buildIntakeSuggestionCard } from "../cards/welcomeCard";
import { buildReviewSummaryCard, buildSubmissionConfirmationCard } from "../cards/reviewCard";
import { uploadEvidence, ensureContainerExists } from "../services/blobService";
import { buildEvidenceSavedCard } from "../cards/evidenceCard";
import { createDraft, getDraft, updateDraft, submitDraft, SubmissionValidationError } from "../services/complaintService";
import { startComplaintLifecycle } from "../services/orchestrationService";
import { EMPTY_COLLECTED_FLAGS } from "../models/conversation";
import type { ConversationRecord, CollectedDataFlags } from "../models/conversation";
import type { Complaint } from "../models/complaint";

registerFlow("listening", async ({ text, conversation, send, sendCard, sendTyping, streamEmit, streamUpdate, streamClose, cardActionData }) => {
  // ── Card actions (buttons on Adaptive Cards) ──
  // These are separate from typed text. Handle them first and either
  // return immediately or set a flag to fall through to the LLM.
  let skipTextChecks = false;

  if (cardActionData) {
    const action = cardActionData.action as string | undefined;

    // Human-readable messages for each action. Written to messages container so
    // the LLM sees what the user chose. For actions that may call closeAndCreateNew(),
    // the write happens AFTER the new conversation is created.
    const actionMessages: Record<string, string> = {
      resume: "I'd like to continue where I left off.",
      restart: "I want to start over.",
      ready_review: "I'm ready to review. Please prepare a summary of my complaint.",
      continue_intake: "I have more to share.",
      start_intake: "Yes, let's document this.",
      stay_chat: "Not right now — I just want to talk.",
    };

    // Helper to record the synthetic message for the current conversation
    const recordActionMessage = async () => {
      if (action && actionMessages[action]) {
        conversation = await addMessage(conversation, "user", actionMessages[action]);
      }
    };

    if (action === "resume") {
      await recordActionMessage();
      skipTextChecks = true;
    }

    if (action === "restart") {
      // No need to push message — we're wiping the conversation
      conversation.collectedData = {};
      conversation.collectedFlags = { ...EMPTY_COLLECTED_FLAGS };
      conversation = await switchMode(conversation, "chat", "welcome");
      await sendCard(buildWelcomeCard());
      return conversation;
    }

    if (action === "ready_review") {
      // User clicked "Prepare my complaint summary" on the readiness card.
      // Load the draft and show the review summary directly.
      if (conversation.complaintId) {
        const latestDraft = await getDraft(conversation.complaintId, conversation.tenantId);
        if (latestDraft && latestDraft.status === "draft") {
          await recordActionMessage();
          await sendCard(buildReviewSummaryCard(latestDraft));
          return conversation;
        }
      }
      // Fallback: no draft found — tell user and fall through to LLM
      await recordActionMessage();
      skipTextChecks = true;
    }

    if (action === "continue_intake") {
      await recordActionMessage();
      skipTextChecks = true;
    }

    if (action === "start_intake") {
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
      skipTextChecks = true;
    }

    if (action === "stay_chat") {
      await recordActionMessage();
      skipTextChecks = true;
    }

    if (action === "submit_complaint") {
      // User clicked "Submit Complaint" on the review card
      const complaintId = cardActionData.complaintId as string | undefined;
      if (!complaintId || !conversation.complaintId) {
        await send("Something went wrong — I couldn't find your complaint. Please try again.");
        return conversation;
      }

      try {
        const submitted = await submitDraft(complaintId, conversation.tenantId);
        conversation = await closeAndCreateNew(conversation);
        await sendCard(buildSubmissionConfirmationCard(submitted));

        // Fire-and-forget: start the complaint lifecycle orchestration.
        // Non-blocking — the complaint is already saved. If the API is down,
        // the orchestration can be started later.
        startComplaintLifecycle(submitted.id, submitted.tenantId).catch(() => {
          // Already logged inside the function
        });

        return conversation;
      } catch (err) {
        if (err instanceof SubmissionValidationError) {
          await send(
            `I can't submit just yet — we're missing: **${err.missingFields.join(", ")}**. ` +
            `Let's fill in those details first.`,
          );
          return conversation;
        }
        console.error("[raksha] Submit failed:", err);
        await send(
          "Something went wrong while submitting. Your complaint is saved — " +
          "please try again in a moment.",
        );
        return conversation;
      }
    }

    if (action === "save_evidence") {
      // User confirmed they want to save the file as evidence
      const { downloadUrl, fileName, contentType } = cardActionData as {
        downloadUrl?: string;
        fileName?: string;
        contentType?: string;
      };

      if (!downloadUrl || !fileName || !contentType) {
        await send("Something went wrong — I couldn't find the file details. Please try sending it again.");
        return conversation;
      }

      if (!conversation.complaintId) {
        await send("You don't have an active complaint to attach evidence to. Let's start documenting first.");
        return conversation;
      }

      try {
        await ensureContainerExists();
        const result = await uploadEvidence(
          conversation.complaintId,
          conversation.tenantId,
          fileName,
          contentType,
          downloadUrl,
        );

        // Link the blob URL to the complaint
        const draft = await getDraft(conversation.complaintId, conversation.tenantId);
        if (draft && draft.status === "draft") {
          const updatedUrls = [...draft.evidenceUrls, result.blobUrl];
          await updateDraft(conversation.complaintId, conversation.tenantId, {
            evidenceUrls: updatedUrls,
          });
          conversation = await updateCollectedData(conversation, { hasEvidence: true });
          await sendCard(buildEvidenceSavedCard(fileName, updatedUrls.length));
        } else {
          await send("Saved the file, but couldn't link it to your complaint. It will be available for review.");
        }
      } catch (err) {
        console.error("[raksha] Evidence upload failed:", err);
        await send(
          "I wasn't able to save that file. This can happen if the file link has expired — " +
          "please try sending it again.",
        );
      }
      return conversation;
    }

    if (action === "skip_evidence") {
      const skippedFile = cardActionData.fileName as string || "the file";
      await send(`No problem — ${skippedFile} won't be saved. You can always send files later if you change your mind.`);
      return conversation;
    }

    // Unknown card action — skip text checks, just go to LLM
    skipTextChecks = true;
  }

  // ── Text-based shortcuts (only for actual typed messages, not card actions) ──
  if (!skipTextChecks) {
    // Global escape: "menu" goes back to welcome
    if (/^(menu|start over|restart|back)$/i.test(text.trim())) {
      conversation = await transitionState(conversation, "welcome");
      await sendCard(buildWelcomeCard());
      return conversation;
    }
  }

  // ── LLM conversation (streamed) ──
  let streamedMessage = "";
  try {
    streamUpdate("Thinking...");

    // Load the last user message for LLM input — buildInput only sends
    // the latest message. Full history is available to the LLM via the
    // fetch_conversation_history tool if it needs past context.
    const recentMessages = await getRecentMessages(conversation.id, 1);

    // In intake mode, load the draft complaint for LLM context
    let draft: Complaint | null = null;
    if (conversation.mode === "intake" && conversation.complaintId) {
      draft = await getDraft(conversation.complaintId, conversation.tenantId);
    }

    // Define the tool executor — called by the LLM service when the model
    // invokes a tool. Results (success/error) are sent back to the LLM so
    // it can self-correct if something goes wrong.
    const executeTool: ToolExecutor = async (name, args) => {
      if (name === "update_complaint") {
        if (!conversation.complaintId) {
          return { success: false, error: "No active complaint draft. Please start a formal report first." };
        }
        try {
          await updateDraft(conversation.complaintId, conversation.tenantId, args as Partial<Complaint>);
          return { success: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to save complaint data";
          console.error("[raksha] update_complaint tool error:", err);
          return { success: false, error: msg };
        }
      }
      if (name === "suggest_filing") {
        return { success: true };
      }
      if (name === "show_review_summary") {
        return { success: true };
      }
      if (name === "fetch_conversation_history") {
        try {
          const count = Math.min(Math.max(Number(args.count) || 20, 5), 30);
          const history = await getRecentMessages(conversation.id, count);
          const formatted = history
            .filter(m => !m.content.startsWith("[Card Action]") && m.content !== "[Adaptive Card]")
            .map(m => `[${m.role}]: ${m.content}`)
            .join("\n");
          return { success: true, data: formatted };
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to fetch history";
          return { success: false, error: msg };
        }
      }
      return { success: false, error: `Unknown tool: ${name}` };
    };

    // Track what we've already emitted — the SDK's HttpStream accumulates
    // internally (this.text += chunk), so we must send deltas, not the full
    // accumulated text that chatStream provides.
    //
    // Also buffer the first few chars before emitting — this lets us detect
    // content-filter refusals ("I'm sorry, but I cannot assist") before they
    // reach the user. We check on every chunk: if it's clearly NOT a refusal
    // prefix, flush immediately. If it IS a refusal, suppress it entirely.
    let lastEmittedLength = 0;
    let buffering = true;
    let refusalDetected = false;
    let streamClosedEarly = false;

    // Refusal text always starts with one of these prefixes
    const REFUSAL_PREFIXES = [
      "i'm sorry",
      "i apologize",
      "sorry, i can",
      "sorry, but i",
      "i cannot assist",
      "i can't assist",
    ];

    const response = await chatStream(conversation, recentMessages, (accumulatedText) => {
      // While buffering, check if the accumulated text looks like a refusal
      if (buffering) {
        const lower = accumulatedText.trim().toLowerCase();

        // Check if accumulated text IS a known refusal
        if (isRefusalText(accumulatedText)) {
          refusalDetected = true;
          buffering = false;
          return; // Don't emit refusal text
        }

        // Check if it COULD STILL become a refusal (is a prefix of one)
        const couldBeRefusal = REFUSAL_PREFIXES.some(
          (prefix) => prefix.startsWith(lower) || lower.startsWith(prefix),
        );

        if (!couldBeRefusal) {
          // Definitely not a refusal — flush everything and stream normally
          buffering = false;
          streamEmit(accumulatedText);
          lastEmittedLength = accumulatedText.length;
        }
        // Otherwise keep buffering — we need more chars to decide
        return;
      }

      if (refusalDetected) return; // Suppress all further chunks

      const delta = accumulatedText.slice(lastEmittedLength);
      if (delta) {
        streamEmit(delta);
        lastEmittedLength = accumulatedText.length;
      }
    }, draft, executeTool, (doneText) => {
      // Called when text streaming ends, BEFORE tool execution starts.
      // Close the stream now so Teams renders the message immediately
      // instead of showing typing dots during Cosmos writes.
      if (doneText && !refusalDetected) {
        // Flush any remaining buffered text first
        if (buffering && !refusalDetected) {
          buffering = false;
          streamEmit(doneText);
          lastEmittedLength = doneText.length;
        }
        streamClose().catch(() => { /* best-effort */ });
        streamClosedEarly = true;
      }
    }, conversation.lastResponseId);

    streamedMessage = response.message;

    // Save the response ID for next turn's previous_response_id
    if (response.responseId) {
      conversation = await updateLastResponseId(conversation, response.responseId);
    }

    // If the LLM produced a content-filter refusal, replace it with a helpful message
    if (refusalDetected || isRefusalText(streamedMessage)) {
      console.warn(
        "[raksha] Refusal detected — refusalDetected:", refusalDetected,
        "| isRefusalText:", isRefusalText(streamedMessage),
        "| text:", JSON.stringify(streamedMessage.slice(0, 200)),
      );
      const fallback =
        "I wasn't able to process that due to a safety filter — " +
        "this sometimes happens with sensitive topics. Could you try rephrasing? " +
        "Your conversation is saved.";
      // Emit the fallback text into the stream, then close it properly.
      // Using send() after streamUpdate("Thinking...") leaves the stream dangling.
      streamEmit(fallback);
      try { await streamClose(); } catch { /* best-effort */ }
      return conversation;
    }

    // Close the stream — finalizes the streamed text as a proper message in Teams.
    // Skip if already closed early via onTextDone callback.
    if (streamedMessage && !streamClosedEarly) {
      await streamClose();
    }

    // In chat mode, check if LLM suggests transitioning to intake
    if (conversation.mode === "chat" && response.suggestIntake) {
      await sendCard(buildIntakeSuggestionCard());
    }

    // In intake mode, check if LLM wants to show the review summary
    if (conversation.mode === "intake" && response.showReviewSummary) {
      if (conversation.complaintId) {
        const latestDraft = await getDraft(conversation.complaintId, conversation.tenantId);
        if (latestDraft && latestDraft.status === "draft") {
          await sendCard(buildReviewSummaryCard(latestDraft));
        }
      }
    }

    // In intake mode, update conversation flags from extracted data.
    // The actual draft save already happened in the tool executor above —
    // this only updates the lightweight flags on the conversation record.
    if (conversation.mode === "intake" && response.extractedData) {
      const hadMinimumBefore = hasMinimumForComplaint(conversation.collectedFlags);

      conversation = await updateCollectedData(
        conversation,
        response.extractedData,
        response.extractedFlags,
      );

      const hasMinimumNow = hasMinimumForComplaint(conversation.collectedFlags);

      // Show readiness card exactly once — on the turn that crosses the threshold
      if (!hadMinimumBefore && hasMinimumNow) {
        await sendCard(buildReadinessCard());
      }
    }

    // Record the streamed message in the messages container (without re-sending
    // — streaming already delivered it).
    if (streamedMessage) {
      conversation = await addMessage(conversation, "assistant", streamedMessage);
    }
  } catch (error) {
    console.error("[raksha] LLM error:", error);

    // If the error was caused by a stale previous_response_id, clear it
    // so the next turn starts fresh with full history.
    if (conversation.lastResponseId) {
      conversation = await updateLastResponseId(conversation, null);
    }

    // Emit the error message into the stream and close it.
    // Using send() after streamUpdate("Thinking...") leaves the stream dangling
    // because Teams shows the stream indicator and a separate message won't clear it.
    let errorMsg: string;
    if (isConfigError(error)) {
      errorMsg =
        "I'm having trouble connecting to my language service. " +
        "Please try again in a moment, or contact your administrator.";
    } else if (isContentFilterError(error)) {
      errorMsg =
        "I wasn't able to process that message due to a safety filter on my end — " +
        "this sometimes happens with sensitive topics. Could you try rephrasing? " +
        "Your conversation is saved.";
    } else {
      errorMsg =
        "I'm sorry, something went wrong on my end. " +
        "Your conversation is saved — could you try sending that again?";
    }

    streamEmit(errorMsg);
    try { await streamClose(); } catch { /* best-effort */ }
  }

  return conversation;
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Check if we have the minimum information needed for a meaningful complaint.
 * At minimum: what happened + who + when.
 */
function hasMinimumForComplaint(flags: CollectedDataFlags): boolean {
  return (
    flags.hasIncidentDescription &&
    flags.hasAccusedPerson &&
    flags.hasIncidentDate
  );
}

function isConfigError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("not configured") || msg.includes("401") || msg.includes("403");
}

function isContentFilterError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  // Azure OpenAI returns 400 with "content_filter" when the safety system
  // blocks a request. The OpenAI SDK wraps this as a BadRequestError.
  return (
    msg.includes("content_filter") ||
    msg.includes("content management policy") ||
    msg.includes("ContentFilter") ||
    (msg.includes("400") && msg.includes("filter"))
  );
}

/**
 * Detect LLM refusal text produced by the Azure OpenAI content safety system.
 * When the filter doesn't block the request outright, it sometimes makes the
 * model respond with a canned refusal. We intercept this to show a better message.
 */
function isRefusalText(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    t.startsWith("i'm sorry, but i cannot assist") ||
    t.startsWith("i'm sorry, but i can't assist") ||
    t.startsWith("i cannot assist with that") ||
    t.startsWith("i can't assist with that") ||
    t.startsWith("sorry, i can't help with") ||
    t.startsWith("sorry, but i cannot") ||
    t.startsWith("i apologize, but i'm unable") ||
    t === "i'm sorry, but i cannot assist with that request."
  );
}
