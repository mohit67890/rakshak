/**
 * Raksha — LLM Service
 *
 * Uses the OpenAI Responses API with tool calling for structured data
 * extraction. Instead of asking the LLM to embed JSON in its text response,
 * we define tools that map to the complaint schema. The LLM generates
 * conversational text AND calls tools to save structured data — cleanly
 * separated, no parsing needed.
 *
 * Tools:
 *   - `update_complaint` (intake mode) — extracts complaint fields from the
 *     user's message. The tool parameters ARE the complaint schema.
 *   - `suggest_filing` (chat mode) — signals the UI that the user described
 *     something that looks like harassment and may want to file.
 *
 * Streaming:
 *   - Text deltas stream to the user in real-time
 *   - Tool call arguments accumulate silently in the background
 *   - After the stream completes, tool calls are processed into structured data
 *
 * Uses the `openai` SDK v4 with a baseURL pointing to the Azure-hosted
 * OpenAI-compatible endpoint.
 */

import OpenAI from "openai";
import config from "../../config";
import type {
  ConversationRecord,
  CollectedDataFlags,
} from "../../models/conversation";
import type { Complaint } from "../../models/complaint";
import { buildSystemPrompt, buildIntakeContext } from "./prompts";
import { complaintToContext } from "../complaintService";

// ============================================================================
// Client Singleton
// ============================================================================

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (_client) return _client;

  const { baseURL, apiKey } = config.azureOpenAI;

  if (!baseURL || !apiKey) {
    throw new Error(
      "[raksha] Azure OpenAI not configured. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY.",
    );
  }

  _client = new OpenAI({
    baseURL: baseURL.replace(/\/+$/, ""), // Strip trailing slashes — SDK appends /chat/completions
    apiKey,
    timeout: 25_000, // 25s — prevent indefinite hangs
    maxRetries: 1,   // One retry — more just adds latency on content filter blocks
  });

  return _client;
}

// ============================================================================
// Types
// ============================================================================

export interface LlmResponse {
  /** The conversational reply to show the user */
  message: string;
  /** Extracted complaint data (intake mode — from update_complaint tool call) */
  extractedData?: Partial<Complaint>;
  /** Derived collection flags (intake mode — inferred from extractedData) */
  extractedFlags?: Partial<CollectedDataFlags>;
  /** LLM suggests transitioning to intake (chat mode — from suggest_filing tool call) */
  suggestIntake?: boolean;
  /** LLM wants to show the review summary card (intake mode — from show_review_summary tool call) */
  showReviewSummary?: boolean;
  /** OpenAI Responses API response ID — store on conversation for next turn's previous_response_id */
  responseId?: string;
}

/**
 * Callback for executing tool calls. Provided by the caller (e.g., listeningFlow)
 * so that tool execution happens with the right context (complaint ID, tenant).
 *
 * Returns a ToolResult that is serialized and sent back to the LLM so it
 * knows whether the operation succeeded or failed, and can correct itself.
 */
export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>;

export interface ToolResult {
  success: boolean;
  error?: string;
  /** Arbitrary data to include in the tool output sent back to the LLM */
  data?: string;
}

/** Internal: a collected tool call from a streaming response, including IDs needed for result submission. */
interface ToolCallInfo {
  callId: string;   // Links the call to its function_call_output
  itemId?: string;  // The output item's own ID (optional per API)
  name: string;
  arguments: string;
}

/** Internal: a function_call_output item to send back to the LLM. */
interface ToolOutput {
  type: "function_call_output";
  call_id: string;
  output: string;
}

// ============================================================================
// Tool Definitions
// ============================================================================

/**
 * Intake mode tool — the LLM calls this to save extracted complaint data.
 * The parameters ARE the complaint schema, so the LLM knows exactly what
 * fields to extract and their types. No prompt instructions needed.
 */
const UPDATE_COMPLAINT_TOOL: OpenAI.Responses.FunctionTool = {
  type: "function",
  name: "update_complaint",
  description:
    "Save newly extracted complaint details from the user's current message. " +
    "Only include fields with NEW information — do not repeat previously extracted data. " +
    "Call this whenever the user shares factual details about the incident.",
  parameters: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "What happened — narrative fragment from this message",
      },
      incidentDate: {
        type: "string",
        description: "When it happened (ISO date or descriptive like 'last Tuesday')",
      },
      incidentLocation: {
        type: "string",
        description: "Where it happened (office, meeting room, offsite, online, etc.)",
      },
      accusedPersons: {
        type: "array",
        description: "Person(s) accused — only new names not previously mentioned",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            designation: { type: "string", description: "Job title or role" },
            department: { type: "string" },
            relationship: {
              type: "string",
              enum: ["team_lead", "manager", "peer", "subordinate", "external", "other"],
            },
          },
          required: ["name"],
        },
      },
      witnesses: {
        type: "array",
        description: "People who were present or witnessed the incident",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            designation: { type: "string" },
          },
          required: ["name"],
        },
      },
      category: {
        type: "string",
        enum: [
          "sexual_harassment", "verbal_abuse", "physical_contact",
          "quid_pro_quo", "hostile_environment", "religious_harassment", "other",
        ],
        description: "Classification of the incident",
      },
      severity: {
        type: "string",
        enum: ["low", "medium", "high", "criminal"],
      },
      isCriminalThreshold: {
        type: "boolean",
        description: "True if the conduct crosses into criminal territory under BNS Sections 74-79",
      },
      poshSections: {
        type: "array",
        items: { type: "string" },
        description: "Applicable POSH Act sections (e.g. 'Section 2(n)', 'Section 3(2)')",
      },
      bnsSections: {
        type: "array",
        items: { type: "string" },
        description: "Applicable BNS sections if criminal threshold is met",
      },
    },
  },
  strict: false,
};

/**
 * Chat mode tool — the LLM calls this to signal the UI should offer
 * the option to file a formal complaint.
 */
const SUGGEST_FILING_TOOL: OpenAI.Responses.FunctionTool = {
  type: "function",
  name: "suggest_filing",
  description:
    "Signal that the user has described a concrete workplace harassment incident " +
    "and may benefit from formally documenting it. Only call when they've shared " +
    "something specific — not for general questions. Do NOT call if they've " +
    "already declined to file.",
  parameters: {
    type: "object",
    properties: {},
  },
  strict: false,
};

/**
 * Intake mode tool — the LLM calls this when the user has reviewed or
 * expressed readiness to see a summary of their complaint. Triggers the
 * UI to display a structured review card with all collected information
 * and a Submit button.
 *
 * Call this when:
 *   - User says "review", "submit", "I'm done", "show me the summary", etc.
 *   - You believe enough information has been collected and the user is ready
 *
 * Do NOT call this:
 *   - While still collecting initial details (what/who/when)
 *   - If the user is mid-sentence sharing details
 */
const SHOW_REVIEW_SUMMARY_TOOL: OpenAI.Responses.FunctionTool = {
  type: "function",
  name: "show_review_summary",
  description:
    "Display a structured review summary card of the complaint to the user. " +
    "Call when the user wants to review, submit, or see what's been captured. " +
    "The card will show all collected details and offer Submit / Continue Editing options. " +
    "Your text response should briefly encourage them to review the details.",
  parameters: {
    type: "object",
    properties: {},
  },
  strict: false,
};

/**
 * Conversation history tool — the LLM calls this when it needs context from
 * earlier in the conversation (e.g., after a previous_response_id expired
 * and was retried without it, or when the conversation spans many turns).
 */
const FETCH_CONVERSATION_HISTORY_TOOL: OpenAI.Responses.FunctionTool = {
  type: "function",
  name: "fetch_conversation_history",
  description:
    "Retrieve past messages from this conversation. Use when you need context " +
    "about what the user said earlier but don't have it in the current conversation " +
    "window. Returns the most recent N messages.",
  parameters: {
    type: "object",
    properties: {
      count: {
        type: "number",
        description: "Number of recent messages to fetch (5-30). Default 20.",
      },
    },
  },
  strict: false,
};

/** Get the tools for a given conversation mode. */
function getToolsForMode(mode: string): OpenAI.Responses.Tool[] {
  const historyTool = FETCH_CONVERSATION_HISTORY_TOOL;
  if (mode === "intake") return [UPDATE_COMPLAINT_TOOL, SHOW_REVIEW_SUMMARY_TOOL, historyTool];
  if (mode === "chat") return [SUGGEST_FILING_TOOL, historyTool];
  return [historyTool];
}

// ============================================================================
// Main Chat Function (non-streaming)
// ============================================================================

/**
 * Send a message to the LLM, execute any tool calls, send results back,
 * and return the final response. Uses the Responses API.
 *
 * When `previousResponseId` is provided, Azure OpenAI uses stored context.
 * If it's expired/invalid (30-day TTL), retries without it — the LLM can
 * use the fetch_conversation_history tool to recover context.
 */
export async function chat(
  conversation: ConversationRecord,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  draft?: Complaint | null,
  executeTool?: ToolExecutor,
  previousResponseId?: string | null,
): Promise<LlmResponse> {
  const client = getClient();
  const { mode } = conversation;
  const { instructions, input } = buildInput(conversation, messages, draft);
  const model = config.azureOpenAI.deploymentName;
  const isGpt5 = model.startsWith("gpt-5");
  const tools = getToolsForMode(mode);

  const baseParams = {
    model,
    instructions,
    input,
    store: true as const,
    ...(tools.length > 0 && { tools }),
    ...(!isGpt5 && {
      temperature: mode === "intake" ? 0.3 : 0.7,
      max_output_tokens: 1024,
    }),
  };

  let response: OpenAI.Responses.Response;

  try {
    response = await client.responses.create({
      ...baseParams,
      ...(previousResponseId && { previous_response_id: previousResponseId }),
    });
  } catch (err) {
    if (previousResponseId && isPreviousResponseIdError(err)) {
      console.warn("[raksha] previous_response_id invalid, retrying without it");
      response = await client.responses.create(baseParams);
    } else {
      throw err;
    }
  }

  // Extract text and tool calls from the response
  let message = "";
  const toolCalls: ToolCallInfo[] = [];

  for (const item of response.output) {
    if (item.type === "message") {
      for (const content of item.content) {
        if (content.type === "output_text") {
          message += content.text;
        }
      }
    }
    if (item.type === "function_call") {
      toolCalls.push({
        callId: item.call_id,
        itemId: item.id,
        name: item.name,
        arguments: item.arguments,
      });
    }
  }

  const result: LlmResponse = { message: message.trim(), responseId: response.id };

  if (toolCalls.length > 0) {
    const toolOutputs = await executeAndApplyToolCalls(toolCalls, result, executeTool);

    // Send tool results back so the LLM can see success/failure.
    // Use previous_response_id so the API already has the full context
    // (including reasoning items) — we only need to send tool outputs.
    try {
      const continuation = await client.responses.create({
        model,
        instructions,
        input: toolOutputs as unknown as OpenAI.Responses.ResponseInput,
        previous_response_id: response.id,
        store: true,
      });

      // Update responseId to the latest in the chain
      result.responseId = continuation.id;

      // Append any continuation text (e.g., error correction or acknowledgement)
      let continuationText = "";
      for (const item of continuation.output) {
        if (item.type === "message") {
          for (const content of item.content) {
            if (content.type === "output_text") {
              continuationText += content.text;
            }
          }
        }
      }
      if (continuationText.trim()) {
        message = message.trim() + "\n\n" + continuationText.trim();
      }
      result.message = message.trim();
    } catch (err) {
      console.warn("[raksha] Failed to send tool results to LLM:", err);
    }
  }

  return result;
}

// ============================================================================
// Streaming Chat Function
// ============================================================================

/**
 * Stream a chat response from the LLM using the Responses API.
 * Calls `onChunk` with the accumulated text as each token arrives.
 * Calls `onTextDone` when text streaming ends (before tool execution),
 * so the caller can finalize the stream immediately without waiting for
 * tool processing (which involves Cosmos DB writes and may add 1-2s delay).
 *
 * When `previousResponseId` is provided, Azure OpenAI uses stored context.
 * If it's expired/invalid (30-day TTL), retries without it — the LLM can
 * use the fetch_conversation_history tool to recover context.
 *
 * After the initial stream completes:
 *   1. `onTextDone` is called — caller should close the stream here
 *   2. Any tool calls are executed via the `executeTool` callback
 *   3. Tool results (success/error) are sent back to the LLM if needed
 *
 * Returns the final LlmResponse with all accumulated text, extraction data,
 * and the responseId (to store for the next turn's previous_response_id).
 */
export async function chatStream(
  conversation: ConversationRecord,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  onChunk: (accumulatedText: string) => void,
  draft?: Complaint | null,
  executeTool?: ToolExecutor,
  onTextDone?: (text: string) => void,
  previousResponseId?: string | null,
): Promise<LlmResponse> {
  const client = getClient();
  const { mode } = conversation;
  const model = config.azureOpenAI.deploymentName;
  const isGpt5 = model.startsWith("gpt-5");
  const tools = getToolsForMode(mode);

  const { instructions, input } = buildInput(conversation, messages, draft);

  const baseParams = {
    model,
    instructions,
    input,
    store: true as const,
    ...(tools.length > 0 && { tools }),
    ...(!isGpt5 && {
      temperature: mode === "intake" ? 0.3 : 0.7,
      max_output_tokens: 1024,
    }),
  };

  let accumulated = "";
  const pendingToolCalls: ToolCallInfo[] = [];
  let responseId: string | undefined;

  /**
   * Consume a stream, collecting text and tool calls.
   * Extracted so we can call it once normally and once on fallback.
   */
  const consumeStream = async (s: ReturnType<typeof client.responses.stream>) => {
    for await (const event of s) {
      if (event.type === "response.completed" && "response" in event) {
        responseId = (event.response as { id?: string }).id;
      }
      if (event.type === "response.output_text.delta") {
        accumulated += event.delta;
        onChunk(accumulated.trim());
      }
      if (
        event.type === "response.output_item.done" &&
        "item" in event &&
        event.item.type === "function_call"
      ) {
        const item = event.item as { call_id: string; id: string; name: string; arguments: string };
        pendingToolCalls.push({
          callId: item.call_id,
          itemId: item.id,
          name: item.name,
          arguments: item.arguments,
        });
      }
    }
  };

  try {
    console.log("[raksha] chatStream: calling LLM", {
      previousResponseId: previousResponseId ? previousResponseId.slice(0, 20) + "..." : null,
      inputLength: input.length,
      inputPreview: input[0]?.content?.slice(0, 50),
    });
    await consumeStream(
      client.responses.stream({
        ...baseParams,
        ...(previousResponseId && { previous_response_id: previousResponseId }),
      }),
    );
    console.log("[raksha] chatStream: stream completed", {
      textLength: accumulated.length,
      textPreview: accumulated.trim().slice(0, 100),
      toolCalls: pendingToolCalls.length,
      responseId: responseId?.slice(0, 20),
    });
  } catch (err) {
    if (previousResponseId && isPreviousResponseIdError(err)) {
      console.warn("[raksha] previous_response_id invalid, retrying without it. Error:", (err as Error).message?.slice(0, 200));
      accumulated = "";
      pendingToolCalls.length = 0;
      responseId = undefined;
      await consumeStream(client.responses.stream(baseParams));
      console.log("[raksha] chatStream: fallback stream completed", {
        textLength: accumulated.length,
        textPreview: accumulated.trim().slice(0, 100),
      });
    } else {
      throw err;
    }
  }

  const result: LlmResponse = { message: accumulated.trim(), responseId };

  // Signal that text streaming is done — the caller can close the stream
  // now, before we spend time on tool execution and Cosmos writes.
  // For tool-only responses (no text yet), DON'T signal — the continuation
  // will produce the actual text that needs streaming.
  if (accumulated.trim() && pendingToolCalls.length > 0) {
    onTextDone?.(accumulated.trim());
  }

  // Execute tool calls and send results back to the LLM.
  // We MUST always submit tool outputs — if we don't, the stored response
  // has unresolved function calls and the next turn's previous_response_id
  // will be rejected with "No tool output found for function call".
  if (pendingToolCalls.length > 0 && responseId) {
    const toolOutputs = await executeAndApplyToolCalls(pendingToolCalls, result, executeTool);

    const allToolsSucceeded = toolOutputs.every(
      (o) => JSON.parse(o.output).success === true,
    );
    // Stream the continuation when we need the LLM to produce text:
    //   - No text in first pass (tool-only response), OR
    //   - A tool failed and the LLM needs to self-correct
    const needsStreamedContinuation = !accumulated.trim() || !allToolsSucceeded;

    try {
      if (needsStreamedContinuation) {
        // Stream continuation — we need the LLM's text response
        const continuation = client.responses.stream({
          model,
          instructions,
          input: toolOutputs as unknown as OpenAI.Responses.ResponseInput,
          previous_response_id: responseId,
          store: true,
        });

        for await (const event of continuation) {
          if (event.type === "response.completed" && "response" in event) {
            responseId = (event.response as { id?: string }).id;
          }
          if (event.type === "response.output_text.delta") {
            accumulated += event.delta;
            onChunk(accumulated.trim());
          }
        }

        result.message = accumulated.trim();
        result.responseId = responseId;
      } else {
        // All tools succeeded and we already have text — submit tool outputs
        // non-streaming just to resolve the function calls in the stored response.
        const resolved = await client.responses.create({
          model,
          instructions,
          input: toolOutputs as unknown as OpenAI.Responses.ResponseInput,
          previous_response_id: responseId,
          store: true,
        });
        result.responseId = resolved.id;
      }
    } catch (err) {
      console.warn("[raksha] Failed to send tool results to LLM:", err);
      // Non-fatal: we already have text from the first response (if any).
      // But clear responseId — the stored response has unresolved tool calls,
      // so next turn must fall back to full history.
      result.responseId = undefined;
    }
  }

  return result;
}

// ============================================================================
// Input Building (Responses API)
// ============================================================================

/**
 * Build the `instructions` and `input` for the Responses API.
 *
 * Always sends only the latest user message as input. Context comes from:
 *   - `previous_response_id` — Azure OpenAI has the full conversation stored
 *   - `instructions` — system prompt includes intake state (collected data + flags)
 *   - `fetch_conversation_history` tool — LLM can request past messages on demand
 *
 * This keeps every request lightweight (~1 message) regardless of conversation
 * length, whether using previous_response_id or falling back without it.
 */
function buildInput(
  conversation: ConversationRecord,
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  draft?: Complaint | null,
): {
  instructions: string;
  input: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const { mode, collectedData, collectedFlags } = conversation;

  // System prompt as instructions
  let instructions = buildSystemPrompt(mode);
  if (mode === "intake") {
    // Prefer the draft complaint for context if available
    const contextData = draft ? complaintToContext(draft) : collectedData;
    instructions += "\n\n" + buildIntakeContext(contextData, collectedFlags);
  }

  // When we have a previous_response_id, only send the latest user message.
  // Azure OpenAI has the full conversation context stored server-side.
  // Also use this lightweight mode on fallback (previousResponseId === undefined
  // but messages exist) — the LLM has the fetch_conversation_history tool
  // to retrieve past context if needed, and the system prompt already
  // includes intake state (collected data + flags).
  if (messages.length > 0) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
    if (lastUserMsg) {
      return {
        instructions,
        input: [{ role: "user", content: lastUserMsg.content }],
      };
    }
  }

  // Edge case: no messages at all (shouldn't happen in practice)
  return { instructions, input: [] };
}

// ============================================================================
// Tool Execution & Result Submission
// ============================================================================

/**
 * Execute tool calls via the callback, map results to LlmResponse fields,
 * and build ToolOutput items to send back to the LLM.
 *
 * For each tool call:
 *   1. Parse the arguments
 *   2. Map to LlmResponse fields (extractedData, suggestIntake) — always, regardless of execution
 *   3. Execute via callback (save to Cosmos, etc.) — may succeed or fail
 *   4. Build a ToolOutput with success/error for LLM feedback
 */
async function executeAndApplyToolCalls(
  toolCalls: ToolCallInfo[],
  result: LlmResponse,
  executeTool?: ToolExecutor,
): Promise<ToolOutput[]> {
  const outputs: ToolOutput[] = [];

  for (const call of toolCalls) {
    let toolResult: ToolResult;

    try {
      const args = JSON.parse(call.arguments) as Record<string, unknown>;

      // Map tool call data to LlmResponse fields (always — even if execution fails,
      // we know what the LLM extracted from the conversation)
      if (call.name === "update_complaint") {
        result.extractedData = args as Partial<Complaint>;
        result.extractedFlags = deriveFlags(args as Partial<Complaint>);
      }
      if (call.name === "suggest_filing") {
        result.suggestIntake = true;
      }
      if (call.name === "show_review_summary") {
        result.showReviewSummary = true;
      }

      // Execute the side effect via callback
      if (executeTool) {
        toolResult = await executeTool(call.name, args);
      } else {
        toolResult = { success: true };
      }
    } catch (err) {
      console.warn(`[raksha] Tool "${call.name}" failed:`, err);
      toolResult = {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }

    outputs.push({
      type: "function_call_output",
      call_id: call.callId,
      output: JSON.stringify(toolResult),
    });
  }

  return outputs;
}

/**
 * Detect if an error is caused by an invalid/expired/stale previous_response_id.
 * Cases:
 *   - 404: stored response not found (expired after 30-day TTL or deleted)
 *   - 400 "previous_response_id": explicit invalid reference
 *   - 400 "No tool output found": the stored response has unresolved function
 *     calls from a prior turn where tool output submission failed
 */
function isPreviousResponseIdError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError) {
    const msg = (err.message || "").toLowerCase();
    if (err.status === 404) return true;
    if (err.status === 400) {
      return (
        msg.includes("previous_response_id") ||
        msg.includes("no tool output found")
      );
    }
  }
  return false;
}

/**
 * Derive collection flags from extracted complaint data.
 * Instead of asking the LLM to set flags separately, we infer them
 * from which fields are present in the extracted data.
 */
export function deriveFlags(data: Partial<Complaint>): Partial<CollectedDataFlags> {
  const flags: Partial<CollectedDataFlags> = {};
  if (data.description) flags.hasIncidentDescription = true;
  if (data.incidentDate) flags.hasIncidentDate = true;
  if (data.incidentLocation) flags.hasIncidentLocation = true;
  if (data.accusedPersons?.length) flags.hasAccusedPerson = true;
  if (data.witnesses !== undefined) flags.hasWitnesses = true;
  if (data.severity) flags.severityAssessed = true;
  if (data.isCriminalThreshold !== undefined) flags.criminalThresholdChecked = true;
  return flags;
}

// ============================================================================
// Reset (for testing)
// ============================================================================

export function resetLlmClient(): void {
  _client = null;
}
