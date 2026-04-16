/**
 * Raksha — End-to-End Conversation Tests
 *
 * Tests the full bot lifecycle through the router layer:
 *   1. Fresh user → welcome card
 *   2. Click "Report" → intake mode → LLM conversation
 *   3. LLM extracts data via update_complaint tool
 *   4. User says "review" → LLM calls show_review_summary → review card
 *   5. Click "Submit" → submitDraft → orchestration started → confirmation card
 *   6. New conversation: returning user with draft → resumption card
 *   7. Multiple complaints: submit → new draft
 *
 * Mocks: Cosmos DB (in-memory), LLM (deterministic responses), orchestration (stub)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createMockContainers } from "./mockDatabase";
import type { RakshaContainers } from "../src/utils/cosmosClient";
import type { Complaint } from "../src/models/complaint";
import type { ConversationRecord, CollectedDataFlags } from "../src/models/conversation";

// ============================================================================
// Mock Setup — vi.mock is hoisted before imports
// ============================================================================

let mockContainerData: ReturnType<typeof createMockContainers>;

// Mock cosmosClient — ALL modules that call getRakshaContainers() will use this
vi.mock("../src/utils/cosmosClient", () => ({
  getRakshaContainers: async (): Promise<RakshaContainers> => mockContainerData.containers,
  getDatabase: async () => ({ name: "mock", getDatabaseId: () => "test" }),
  resetDatabase: () => {},
}));

// Mock LLM — we control what the LLM "says" and which tools it "calls"
let mockLlmResponse: {
  message: string;
  extractedData?: Partial<Complaint>;
  extractedFlags?: Partial<CollectedDataFlags>;
  suggestIntake?: boolean;
  showReviewSummary?: boolean;
  responseId?: string;
};

vi.mock("../src/services/llm/index", () => ({
  chatStream: async (
    _conversation: ConversationRecord,
    _messages: Array<{ role: string; content: string }>,
    onChunk: (text: string) => void,
    _draft?: Complaint | null,
    executeTool?: (name: string, args: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>,
    onTextDone?: (text: string) => void,
    _previousResponseId?: string | null,
  ) => {
    // Simulate streaming — call onChunk with accumulated text
    if (mockLlmResponse.message) {
      onChunk(mockLlmResponse.message);
    }

    // Simulate onTextDone callback (fires before tool execution in real code)
    if (mockLlmResponse.message && onTextDone) {
      onTextDone(mockLlmResponse.message);
    }

    // Execute tools via the REAL callback from listeningFlow
    // This exercises the real updateDraft/complaintService code path
    if (mockLlmResponse.extractedData && executeTool) {
      await executeTool("update_complaint", mockLlmResponse.extractedData as Record<string, unknown>);
    }
    if (mockLlmResponse.suggestIntake && executeTool) {
      await executeTool("suggest_filing", {});
    }
    if (mockLlmResponse.showReviewSummary && executeTool) {
      await executeTool("show_review_summary", {});
    }

    // Return LlmResponse matching the real chatStream signature
    return {
      message: mockLlmResponse.message,
      responseId: mockLlmResponse.responseId ?? "mock-response-id",
      ...(mockLlmResponse.extractedData && {
        extractedData: mockLlmResponse.extractedData,
        extractedFlags: mockLlmResponse.extractedFlags ?? deriveTestFlags(mockLlmResponse.extractedData),
      }),
      ...(mockLlmResponse.suggestIntake && { suggestIntake: true }),
      ...(mockLlmResponse.showReviewSummary && { showReviewSummary: true }),
    };
  },
  chat: async () => mockLlmResponse,
}));

/** Derive collection flags from extracted data (matches real deriveFlags logic) */
function deriveTestFlags(data: Partial<Complaint>): Partial<CollectedDataFlags> {
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

// Mock orchestration service — track calls
let orchestrationCalls: Array<{ complaintId: string; tenantId: string }> = [];

vi.mock("../src/services/orchestrationService", () => ({
  startComplaintLifecycle: async (complaintId: string, tenantId: string) => {
    orchestrationCalls.push({ complaintId, tenantId });
    return true;
  },
}));

// Now import the modules under test (after mocks are set up)
import { handleMessage, handleCardAction, type MessageInput, type CardActionInput } from "../src/conversations/router";

// Side-effect imports to register flow handlers
import "../src/conversations/welcomeFlow";
import "../src/conversations/listeningFlow";

// ============================================================================
// Test Helpers
// ============================================================================

const VISITOR_ID = "test-user-001";
const TENANT_ID = "test-tenant-001";

interface TestOutput {
  sentMessages: unknown[];
  streamedChunks: string[];
  streamClosed: boolean;
}

function createTestOutput(): TestOutput {
  return { sentMessages: [], streamedChunks: [], streamClosed: false };
}

function buildMessageInput(text: string, output: TestOutput): MessageInput {
  return {
    visitorId: VISITOR_ID,
    tenantId: TENANT_ID,
    text,
    send: async (msg: unknown) => { output.sentMessages.push(msg); },
    sendTyping: async () => {},
    streamEmit: (chunk: string) => { output.streamedChunks.push(chunk); },
    streamUpdate: (_status: string) => {},
    streamClose: async () => { output.streamClosed = true; },
  };
}

function buildCardActionInput(
  verb: string,
  actionData: Record<string, unknown>,
  output: TestOutput,
): CardActionInput {
  return {
    visitorId: VISITOR_ID,
    tenantId: TENANT_ID,
    text: verb,
    verb,
    actionData,
    send: async (msg: unknown) => { output.sentMessages.push(msg); },
    sendTyping: async () => {},
    streamEmit: (chunk: string) => { output.streamedChunks.push(chunk); },
    streamUpdate: (_status: string) => {},
    streamClose: async () => { output.streamClosed = true; },
  };
}

/**
 * Check if a sent message is an Adaptive Card (object, not string).
 * AdaptiveCard instances from @microsoft/teams.cards are class objects.
 */
function isCard(msg: unknown): boolean {
  return typeof msg === "object" && msg !== null;
}

/**
 * Serialize a message to string for text searching.
 * Works for both plain strings and Adaptive Card class instances.
 */
function messageText(msg: unknown): string {
  if (typeof msg === "string") return msg;
  try {
    return JSON.stringify(msg);
  } catch {
    return String(msg);
  }
}

/** Check if any sent message contains a substring (case-insensitive) */
function sentContains(output: TestOutput, text: string): boolean {
  const lower = text.toLowerCase();
  return output.sentMessages.some(m => messageText(m).toLowerCase().includes(lower));
}

// ============================================================================
// Tests
// ============================================================================

describe("Raksha E2E: Complete Conversation Lifecycle", () => {
  beforeEach(() => {
    mockContainerData = createMockContainers();
    orchestrationCalls = [];
    mockLlmResponse = { message: "I'm here to help." };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. Welcome Flow
  // ──────────────────────────────────────────────────────────────────────────

  describe("1. Welcome Flow", () => {
    it("shows welcome card to a fresh user saying 'hi'", async () => {
      const out = createTestOutput();
      await handleMessage(buildMessageInput("hi", out));

      expect(out.sentMessages.length).toBe(1);
      expect(isCard(out.sentMessages[0])).toBe(true);
      expect(sentContains(out, "Rakshak")).toBe(true);
    });

    it("shows welcome card on empty message", async () => {
      const out = createTestOutput();
      await handleMessage(buildMessageInput("", out));

      expect(out.sentMessages.length).toBe(1);
      expect(isCard(out.sentMessages[0])).toBe(true);
    });

    it("routes free text from fresh user to LLM via chat mode", async () => {
      mockLlmResponse = { message: "That sounds difficult. Tell me more." };

      const out = createTestOutput();
      await handleMessage(buildMessageInput("my manager has been harassing me", out));

      // welcome → chat/listening → re-dispatch → LLM streams response
      expect(out.streamedChunks.length).toBeGreaterThan(0);
      expect(out.streamedChunks.join("")).toContain("sounds difficult");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Intake Flow (Report → Collect Details)
  // ──────────────────────────────────────────────────────────────────────────

  describe("2. Intake Flow", () => {
    it("clicking 'Report' creates a draft and starts intake", async () => {
      // Step 1: fresh user → welcome card
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));

      // Step 2: click "Report" → welcome handler creates draft, switches to intake/listening
      // → re-dispatch to listeningFlow → LLM streams response
      mockLlmResponse = { message: "I'm listening. Tell me what happened." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      // Should have streamed LLM response
      expect(out2.streamedChunks.length).toBeGreaterThan(0);
      expect(out2.streamedChunks.join("")).toContain("listening");

      // Complaint draft should exist in Cosmos
      const allComplaints = mockContainerData.complaints.getAll();
      expect(allComplaints.length).toBe(1);
      expect(allComplaints[0].status).toBe("draft");

      // Conversation should be in intake mode, linked to draft
      const convs = mockContainerData.conversations.getAll();
      const activeConv = convs.find(c => c.state !== "submitted");
      expect(activeConv).toBeDefined();
      expect(activeConv!.mode).toBe("intake");
      expect(activeConv!.complaintId).toBe(allComplaints[0].id);
    });

    it("LLM extracts complaint data via update_complaint tool → real updateDraft", async () => {
      // Setup: welcome → report → intake mode
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "I'm listening." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      // User shares details → mock LLM extracts via tool → listeningFlow's
      // executeTool calls real updateDraft → in-memory Cosmos saves the data
      mockLlmResponse = {
        message: "That's really serious. When did this happen?",
        extractedData: {
          description: "Manager made inappropriate physical advances",
          accusedPersons: [{ name: "Rajesh Kumar", designation: "Team Lead", department: "Engineering", relationship: "team_lead" }],
          category: "physical_contact",
          severity: "high",
        },
      };

      const out3 = createTestOutput();
      await handleMessage(buildMessageInput(
        "My manager Rajesh Kumar from Engineering made inappropriate physical advances towards me",
        out3,
      ));

      expect(out3.streamedChunks.length).toBeGreaterThan(0);

      // Verify the draft was actually updated in Cosmos (real updateDraft ran)
      const allComplaints = mockContainerData.complaints.getAll();
      expect(allComplaints.length).toBe(1);
      expect(allComplaints[0].description).toContain("inappropriate physical advances");
      expect(allComplaints[0].accusedPersons.length).toBe(1);
      expect(allComplaints[0].accusedPersons[0].name).toBe("Rajesh Kumar");
    });

    it("shows readiness card when minimum fields are collected", async () => {
      // Setup: welcome → report → intake
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      // Send details that cross the minimum threshold (description + accused + date)
      mockLlmResponse = {
        message: "Thank you for sharing.",
        extractedData: {
          description: "Verbal abuse in a meeting",
          incidentDate: "2026-04-10",
          accusedPersons: [{ name: "Person X", designation: "Manager", department: "Eng", relationship: "manager" }],
        },
        extractedFlags: {
          hasIncidentDescription: true,
          hasIncidentDate: true,
          hasAccusedPerson: true,
        },
      };
      const out3 = createTestOutput();
      await handleMessage(buildMessageInput("Person X my manager verbally abused me on April 10", out3));

      // Should have sent: streamed text + readiness card
      expect(out3.streamedChunks.length).toBeGreaterThan(0);
      // Readiness card contains "strong foundation" or "Prepare my complaint summary"
      expect(sentContains(out3, "Prepare my complaint summary") || sentContains(out3, "strong foundation")).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. Review Summary Flow
  // ──────────────────────────────────────────────────────────────────────────

  describe("3. Review Summary", () => {
    /** Helper: get to intake mode with enough data for review */
    async function setupIntakeWithData(): Promise<{ complaintId: string }> {
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      mockLlmResponse = {
        message: "Got it. Anything else?",
        extractedData: {
          description: "Verbal abuse during team meeting",
          incidentDate: "2026-04-10",
          incidentLocation: "Conference Room B",
          accusedPersons: [{ name: "Amit Shah", designation: "Manager", department: "Sales", relationship: "manager" }],
          category: "verbal_abuse",
          severity: "medium",
        },
        extractedFlags: {
          hasIncidentDescription: true,
          hasIncidentDate: true,
          hasIncidentLocation: true,
          hasAccusedPerson: true,
        },
      };
      const out3 = createTestOutput();
      await handleMessage(buildMessageInput("Amit Shah verbally abused me in Conference Room B on April 10", out3));

      return { complaintId: mockContainerData.complaints.getAll()[0].id };
    }

    it("LLM calling show_review_summary tool shows review card", async () => {
      await setupIntakeWithData();

      mockLlmResponse = {
        message: "Here's what we have so far.",
        showReviewSummary: true,
      };
      const out = createTestOutput();
      await handleMessage(buildMessageInput("I'd like to review", out));

      // Streamed LLM text + review summary card
      expect(out.streamedChunks.length).toBeGreaterThan(0);
      expect(sentContains(out, "Complaint Summary")).toBe(true);
    });

    it("clicking 'Prepare my complaint summary' shows review card directly", async () => {
      await setupIntakeWithData();

      const out = createTestOutput();
      await handleCardAction(buildCardActionInput("review", { action: "ready_review" }, out));

      // Should send the review card (no LLM needed)
      expect(out.sentMessages.length).toBeGreaterThanOrEqual(1);
      expect(sentContains(out, "Complaint Summary")).toBe(true);
      // No streaming needed for direct card action
      expect(out.streamedChunks.length).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Submit Flow
  // ──────────────────────────────────────────────────────────────────────────

  describe("4. Submit Complaint", () => {
    /** Helper: create a draft with minimum required fields */
    async function setupReadyComplaint(): Promise<{ complaintId: string }> {
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      mockLlmResponse = {
        message: "Thank you for sharing.",
        extractedData: {
          description: "Repeated unwanted comments",
          incidentDate: "2026-04-01",
          incidentLocation: "Office pantry",
          accusedPersons: [{ name: "Suresh Patel", designation: "VP", department: "HR", relationship: "manager" }],
          category: "sexual_harassment",
          severity: "high",
        },
      };
      const out3 = createTestOutput();
      await handleMessage(buildMessageInput("Suresh Patel from HR makes repeated sexual comments in the pantry since April 1", out3));

      return { complaintId: mockContainerData.complaints.getAll()[0].id };
    }

    it("submitting transitions complaint to 'submitted' and shows confirmation", async () => {
      const { complaintId } = await setupReadyComplaint();

      const out = createTestOutput();
      await handleCardAction(buildCardActionInput(
        "submit_complaint",
        { action: "submit_complaint", complaintId },
        out,
      ));

      // Confirmation card with "Complaint Submitted"
      expect(sentContains(out, "Complaint Submitted")).toBe(true);

      // Verify complaint in Cosmos
      const complaint = mockContainerData.complaints.getById(complaintId);
      expect(complaint).toBeDefined();
      expect(complaint!.status).toBe("submitted");
      expect(complaint!.submittedAt).toBeTruthy();
      expect(complaint!.acknowledgeDeadline).toBeTruthy();
    });

    it("triggers orchestration after submission", async () => {
      const { complaintId } = await setupReadyComplaint();

      const out = createTestOutput();
      await handleCardAction(buildCardActionInput(
        "submit_complaint",
        { action: "submit_complaint", complaintId },
        out,
      ));

      // Fire-and-forget — wait a tick
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(orchestrationCalls.length).toBe(1);
      expect(orchestrationCalls[0].complaintId).toBe(complaintId);
      expect(orchestrationCalls[0].tenantId).toBe(TENANT_ID);
    });

    it("creates a new conversation after submission (closeAndCreateNew)", async () => {
      const { complaintId } = await setupReadyComplaint();

      const out = createTestOutput();
      await handleCardAction(buildCardActionInput(
        "submit_complaint",
        { action: "submit_complaint", complaintId },
        out,
      ));

      const convsAfter = mockContainerData.conversations.getAll();
      const submittedConvs = convsAfter.filter(c => c.state === "submitted");
      const activeConvs = convsAfter.filter(c => c.state !== "submitted");

      // Old conversation closed, new one created
      expect(submittedConvs.length).toBe(1);
      expect(activeConvs.length).toBe(1);
      expect(activeConvs[0].complaintId).toBeNull();
      expect(activeConvs[0].state).toBe("welcome");
    });

    it("rejects submission with missing required fields", async () => {
      // Create a draft with NO data
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      const complaintId = mockContainerData.complaints.getAll()[0].id;

      // Attempt to submit empty draft
      const out3 = createTestOutput();
      await handleCardAction(buildCardActionInput(
        "submit_complaint",
        { action: "submit_complaint", complaintId },
        out3,
      ));

      // Should get a text error mentioning missing fields
      const textMsgs = out3.sentMessages.filter(m => typeof m === "string");
      expect(textMsgs.length).toBe(1);
      expect((textMsgs[0] as string).toLowerCase()).toContain("missing");

      // Complaint remains a draft
      const complaint = mockContainerData.complaints.getById(complaintId);
      expect(complaint!.status).toBe("draft");
    });

    it("handles submit with invalid complaint ID gracefully", async () => {
      // Get to intake
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      // Submit with wrong ID
      const out3 = createTestOutput();
      await handleCardAction(buildCardActionInput(
        "submit_complaint",
        { action: "submit_complaint", complaintId: "nonexistent-id" },
        out3,
      ));

      const textMsgs = out3.sentMessages.filter(m => typeof m === "string");
      expect(textMsgs.length).toBe(1);
      expect((textMsgs[0] as string).toLowerCase()).toMatch(/wrong|error|fail/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Multi-Complaint Support
  // ──────────────────────────────────────────────────────────────────────────

  describe("5. Multiple Complaints", () => {
    it("user can file a second complaint after first is submitted", async () => {
      // === File and submit first complaint ===
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      mockLlmResponse = {
        message: "Noted.",
        extractedData: {
          description: "First incident",
          incidentDate: "2026-03-15",
          accusedPersons: [{ name: "Person A", designation: "", department: "", relationship: "peer" }],
        },
      };
      const out3 = createTestOutput();
      await handleMessage(buildMessageInput("Person A did something on March 15", out3));

      const firstComplaintId = mockContainerData.complaints.getAll()[0].id;
      const out4 = createTestOutput();
      await handleCardAction(buildCardActionInput(
        "submit_complaint",
        { action: "submit_complaint", complaintId: firstComplaintId },
        out4,
      ));

      // === New conversation: second complaint ===
      const out5 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out5));
      // New conversation should show welcome card
      expect(out5.sentMessages.length).toBe(1);
      expect(isCard(out5.sentMessages[0])).toBe(true);

      mockLlmResponse = { message: "I'm ready to listen." };
      const out6 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out6));

      // Two complaints total: first submitted, second draft
      const allComplaints = mockContainerData.complaints.getAll();
      expect(allComplaints.length).toBe(2);

      const submitted = allComplaints.filter(c => c.status === "submitted");
      const drafts = allComplaints.filter(c => c.status === "draft");
      expect(submitted.length).toBe(1);
      expect(drafts.length).toBe(1);
      expect(submitted[0].id).toBe(firstComplaintId);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Returning User with Draft
  // ──────────────────────────────────────────────────────────────────────────

  describe("6. Returning User with Draft", () => {
    it("shows resumption card when returning after >5 min gap", async () => {
      // Setup: welcome → report → intake → share some data
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      mockLlmResponse = {
        message: "Got it.",
        extractedData: { description: "Something happened" },
        extractedFlags: { hasIncidentDescription: true },
      };
      const out3 = createTestOutput();
      await handleMessage(buildMessageInput("something happened to me", out3));

      // Simulate 10-minute gap by backdating messages in the messages container
      const convs = mockContainerData.conversations.getAll();
      const activeConv = convs.find(c => c.state === "listening" && c.mode === "intake");
      expect(activeConv).toBeDefined();

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      // Backdate ALL messages in the messages container for this conversation
      const allMessages = mockContainerData.messages.getAll();
      for (const msg of allMessages) {
        if (msg.conversationId === activeConv!.id) {
          msg.timestamp = tenMinAgo;
          await mockContainerData.messages.replace(msg.id, msg.conversationId, msg);
        }
      }

      // User returns saying "hi" — should trigger resumption
      const out4 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out4));

      // Should see a resumption card (not a welcome card)
      expect(out4.sentMessages.length).toBeGreaterThanOrEqual(1);
      expect(sentContains(out4, "Welcome back") || sentContains(out4, "welcome back")).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Navigation and Escape Hatches
  // ──────────────────────────────────────────────────────────────────────────

  describe("7. Navigation", () => {
    it("typing 'menu' during intake returns to welcome", async () => {
      // Setup: welcome → report → intake
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      // Type "menu" — global escape
      const out3 = createTestOutput();
      await handleMessage(buildMessageInput("menu", out3));

      expect(sentContains(out3, "Rakshak")).toBe(true);
    });

    it("clicking 'restart' on listening card resets to welcome", async () => {
      // Get to listening state
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      // Click restart
      const out3 = createTestOutput();
      await handleCardAction(buildCardActionInput("restart", { action: "restart" }, out3));

      expect(sentContains(out3, "Rakshak")).toBe(true);

      // Conversation should be fresh (old one closed)
      const convs = mockContainerData.conversations.getAll();
      const activeConv = convs.find(c => c.state !== "submitted");
      expect(activeConv!.state).toBe("welcome");
      expect(activeConv!.mode).toBe("chat");
    });

    it("clicking 'continue_intake' falls through to LLM", async () => {
      // Setup: intake mode
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      mockLlmResponse = { message: "Go ahead." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));

      // Click "continue_intake"
      mockLlmResponse = { message: "Sure, what would you like to change?" };
      const out3 = createTestOutput();
      await handleCardAction(buildCardActionInput("continue_editing", { action: "continue_intake" }, out3));

      expect(out3.streamedChunks.length).toBeGreaterThan(0);
      expect(out3.streamedChunks.join("")).toContain("what would you like");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Chat Mode → Intake Suggestion
  // ──────────────────────────────────────────────────────────────────────────

  describe("8. Chat Mode → Intake Suggestion", () => {
    it("shows intake suggestion card when LLM calls suggest_filing", async () => {
      mockLlmResponse = {
        message: "That sounds really difficult.",
        suggestIntake: true,
      };

      const out = createTestOutput();
      await handleMessage(buildMessageInput("my colleague keeps making sexual remarks", out));

      // Streamed text + IntakeSuggestionCard
      expect(out.streamedChunks.length).toBeGreaterThan(0);
      expect(sentContains(out, "document")).toBe(true);
    });

    it("clicking 'start_intake' creates draft and switches to intake", async () => {
      // Get to chat/listening first
      mockLlmResponse = { message: "That sounds difficult.", suggestIntake: true };
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("my colleague harasses me", out1));

      // Click "start_intake"
      mockLlmResponse = { message: "I'm here to help you document this." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("start_intake", { action: "start_intake" }, out2));

      // LLM should have been called (streamed response)
      expect(out2.streamedChunks.length).toBeGreaterThan(0);

      // A draft complaint should now exist
      const allComplaints = mockContainerData.complaints.getAll();
      expect(allComplaints.length).toBe(1);
      expect(allComplaints[0].status).toBe("draft");

      // Conversation should be in intake mode
      const conv = mockContainerData.conversations.getAll().find(c => c.state !== "submitted");
      expect(conv!.mode).toBe("intake");
      expect(conv!.complaintId).toBe(allComplaints[0].id);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Welcome Card Actions (status, learn)
  // ──────────────────────────────────────────────────────────────────────────

  describe("9. Welcome Card Actions", () => {
    it("clicking 'Check status' enters status_check mode", async () => {
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));

      mockLlmResponse = { message: "I can help you check status. What's your complaint number?" };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("status", { action: "status" }, out2));

      // Re-dispatched to listeningFlow in status_check mode → LLM called
      expect(out2.streamedChunks.length).toBeGreaterThan(0);
      expect(out2.streamedChunks.join("")).toContain("status");

      const conv = mockContainerData.conversations.getAll().find(c => c.state !== "submitted");
      expect(conv!.mode).toBe("status_check");
    });

    it("clicking 'Learn rights' enters chat mode", async () => {
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));

      mockLlmResponse = { message: "Your rights under the POSH Act include protection against retaliation." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("learn", { action: "learn" }, out2));

      expect(out2.streamedChunks.length).toBeGreaterThan(0);
      expect(out2.streamedChunks.join("")).toContain("rights");

      const conv = mockContainerData.conversations.getAll().find(c => c.state !== "submitted");
      expect(conv!.mode).toBe("chat");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Full Happy Path (end-to-end)
  // ──────────────────────────────────────────────────────────────────────────

  describe("10. Full Happy Path", () => {
    it("fresh user → report → share details → review → submit → confirmation", async () => {
      // 1. Fresh user: welcome card
      const out1 = createTestOutput();
      await handleMessage(buildMessageInput("hi", out1));
      expect(out1.sentMessages.length).toBe(1);
      expect(sentContains(out1, "Rakshak")).toBe(true);

      // 2. Click Report: creates draft, enters intake, LLM responds
      mockLlmResponse = { message: "I'm listening. Tell me what happened." };
      const out2 = createTestOutput();
      await handleCardAction(buildCardActionInput("report", { action: "report" }, out2));
      expect(out2.streamedChunks.length).toBeGreaterThan(0);

      // 3. Share incident details
      mockLlmResponse = {
        message: "That's very serious. Where did this happen?",
        extractedData: {
          description: "Manager groped me during a team dinner",
          incidentDate: "2026-04-05",
          accusedPersons: [{ name: "Vikram Singh", designation: "VP Engineering", department: "Engineering", relationship: "manager" }],
          category: "physical_contact",
          severity: "high",
          isCriminalThreshold: true,
          poshSections: ["Section 2(n)", "Section 3(2)"],
          bnsSections: ["Section 74"],
        },
      };
      const out3 = createTestOutput();
      await handleMessage(buildMessageInput(
        "Vikram Singh, my VP, groped me at the team dinner on April 5th",
        out3,
      ));
      expect(out3.streamedChunks.length).toBeGreaterThan(0);

      // Verify draft was updated
      let complaint = mockContainerData.complaints.getAll()[0];
      expect(complaint.description).toContain("groped");
      expect(complaint.accusedPersons[0].name).toBe("Vikram Singh");

      // 4. Share location → readiness card appears
      mockLlmResponse = {
        message: "Thank you. I have enough to prepare a summary.",
        extractedData: {
          incidentLocation: "Marriott Hotel, Pune",
        },
        extractedFlags: {
          hasIncidentDescription: true,
          hasIncidentDate: true,
          hasIncidentLocation: true,
          hasAccusedPerson: true,
        },
      };
      const out4 = createTestOutput();
      await handleMessage(buildMessageInput("It was at the Marriott Hotel in Pune", out4));

      // 5. Click "Prepare my complaint summary" → review card
      const out5 = createTestOutput();
      await handleCardAction(buildCardActionInput("review", { action: "ready_review" }, out5));
      expect(sentContains(out5, "Complaint Summary")).toBe(true);
      expect(sentContains(out5, "Vikram Singh")).toBe(true);

      // 6. Click "Submit Complaint"
      const complaintId = mockContainerData.complaints.getAll()[0].id;
      const out6 = createTestOutput();
      await handleCardAction(buildCardActionInput(
        "submit_complaint",
        { action: "submit_complaint", complaintId },
        out6,
      ));

      // Confirmation card
      expect(sentContains(out6, "Complaint Submitted")).toBe(true);

      // Complaint status in Cosmos
      complaint = mockContainerData.complaints.getById(complaintId)!;
      expect(complaint.status).toBe("submitted");
      expect(complaint.submittedAt).toBeTruthy();

      // Orchestration triggered
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(orchestrationCalls.length).toBe(1);
      expect(orchestrationCalls[0].complaintId).toBe(complaintId);

      // New conversation created for future use
      const convs = mockContainerData.conversations.getAll();
      expect(convs.filter(c => c.state === "submitted").length).toBe(1);
      expect(convs.filter(c => c.state !== "submitted").length).toBe(1);
    });
  });
});
