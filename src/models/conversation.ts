/**
 * Raksha — Conversation Record Model
 *
 * Cosmos DB container: "conversations"
 * Partition key: /visitorId
 *
 * Tracks the state and mode of a conversation with a user.
 *
 * Design philosophy:
 *   - The bot is CONVERSATIONAL, not a form wizard.
 *   - "mode" = what the user is trying to do (chat, file complaint, check status)
 *   - "state" = progress within that mode
 *   - In "intake" mode, the LLM drives one continuous conversation across
 *     triage → details → evidence. It asks what feels natural, not a
 *     fixed sequence. The state tracks *phase* (what info area we're in),
 *     NOT *the next question to ask*.
 *   - In "chat" mode, the LLM has a free-form supportive conversation
 *     about rights, concerns, or general POSH questions. If the user
 *     describes something that sounds like harassment, the bot gently
 *     offers to help them file a complaint.
 */

import type { BaseDocument } from "../database/types";
import type { Complaint } from "./complaint";

/**
 * What the user is trying to do in this conversation.
 *
 * - "chat"         — Free-form: POSH info, rights, support, general questions.
 *                     LLM-driven. Can transition to "intake" if user wants to file.
 * - "intake"       — Filing a complaint. LLM-guided conversational intake.
 * - "status_check" — Checking on an existing complaint.
 */
export type ConversationMode = "chat" | "intake" | "status_check";

/**
 * Progress phase within the conversation.
 *
 * Structured phases (card-driven):
 *   welcome   — First contact. Warm greeting with privacy assurance
 *               ("only the ICC sees your complaint, your manager cannot")
 *               and action options. NOT a consent gate — no button required.
 *   review    — Show complaint summary, confirm before filing
 *   submitted — Complaint filed, show confirmation + next steps
 *
 * Conversational phases (LLM-driven, NOT form steps):
 *   listening — LLM is actively listening and collecting info.
 *              In "intake" mode, the LLM uses collectedData to know what's
 *              been gathered (who, what, when, where, witnesses) and
 *              naturally asks about missing pieces. Replaces the old rigid
 *              triage/details/evidence split — the LLM handles all three
 *              in one flowing conversation.
 *              In "chat" mode, the LLM provides info and support.
 *
 * Follow-up:
 *   follow_up — Post-submission: status updates, additional info requests
 */
export type ConversationFlowState =
  | "welcome"
  | "listening"
  | "review"
  | "submitted"
  | "follow_up";

export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

/**
 * A single message stored in the "messages" container.
 * Partition key: /conversationId
 *
 * Separating messages from the conversation record means:
 *   - Each turn appends a small ~1KB doc instead of replacing the entire conversation
 *   - Conversation doc stays lightweight (~2KB) — just state, flags, metadata
 *   - No risk of hitting the 2MB Cosmos document limit on long conversations
 *   - Messages can be queried/paginated independently
 */
export interface MessageDocument extends BaseDocument {
  id: string;
  conversationId: string; // Partition key — links to ConversationRecord.id
  visitorId: string;      // For cross-conversation queries (e.g. "all messages from user X")
  role: ConversationMessage["role"];
  content: string;
  timestamp: string;
}

/**
 * Tracks what complaint information has been collected so far.
 * The LLM reads this to decide what to ask about next — conversationally,
 * not as a checklist shown to the user.
 */
export interface CollectedDataFlags {
  hasIncidentDescription: boolean;
  hasIncidentDate: boolean;
  hasIncidentLocation: boolean;
  hasAccusedPerson: boolean;
  hasWitnesses: boolean; // true even if "no witnesses"
  hasPriorReporting: boolean; // asked if they reported before
  hasEvidence: boolean; // true even if "no evidence"
  severityAssessed: boolean; // LLM has assessed severity
  criminalThresholdChecked: boolean; // LLM checked if BNS applies
}

export const EMPTY_COLLECTED_FLAGS: CollectedDataFlags = {
  hasIncidentDescription: false,
  hasIncidentDate: false,
  hasIncidentLocation: false,
  hasAccusedPerson: false,
  hasWitnesses: false,
  hasPriorReporting: false,
  hasEvidence: false,
  severityAssessed: false,
  criminalThresholdChecked: false,
};

export interface ConversationRecord extends BaseDocument {
  id: string;
  visitorId: string; // Entra object ID (partition key)
  tenantId: string;
  mode: ConversationMode;
  complaintId: string | null;
  state: ConversationFlowState;
  collectedData: Partial<Complaint>;
  collectedFlags: CollectedDataFlags;
  /** Lightweight counter — avoids querying messages just to check "has history" */
  messageCount: number;
  /** Teams conversation ID — stored on first message, used for proactive messaging via app.send() */
  teamsConversationId?: string;
  /** OpenAI Responses API response ID — used as previous_response_id for stateful conversations */
  lastResponseId?: string | null;
  createdAt: string;
  updatedAt: string;
}
