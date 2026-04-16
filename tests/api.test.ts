/**
 * Raksha — API Layer Tests
 *
 * Tests HTTP triggers, activity functions, and the complaintLifecycle orchestrator.
 * All external dependencies (Azure Functions runtime, Durable Functions, Cosmos DB) are mocked.
 *
 * Coverage:
 *   - HTTP Triggers: healthCheck, submitComplaint, updateComplaintStatus
 *   - Activities: updateStatus, logAudit
 *   - Orchestrator: complaintLifecycle (generator-based step-through)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mock Setup — vi.hoisted ensures state is available before vi.mock factories
// ============================================================================

const state = vi.hoisted(() => ({
  // Captured handler registrations from side-effect imports
  httpHandlers: new Map<string, { handler: Function; [k: string]: any }>(),
  activityHandlers: new Map<string, { handler: Function }>(),
  orchestrationHandlers: new Map<string, Function>(),
  // Cosmos data stores (reset per test in beforeEach)
  complaintsStore: new Map<string, any>(),
  auditLogsStore: new Map<string, any>(),
  // Flag to simulate Cosmos connection failure (for healthCheck error path)
  cosmosQueryShouldFail: false,
  // Mutable mock durable client — set per test in beforeEach
  mockDurableClient: {} as Record<string, any>,
}));

// ── Mock: @azure/functions ──
vi.mock("@azure/functions", () => ({
  app: {
    http: (name: string, options: any) => {
      state.httpHandlers.set(name, options);
    },
  },
}));

// ── Mock: durable-functions ──
vi.mock("durable-functions", () => ({
  app: {
    activity: (name: string, options: any) => {
      state.activityHandlers.set(name, options);
    },
    orchestration: (name: string, fn: any) => {
      state.orchestrationHandlers.set(name, fn);
    },
  },
  input: {
    durableClient: () => ({ name: "__durableClientInput" }),
  },
  getClient: () => state.mockDurableClient,
  OrchestrationRuntimeStatus: {
    Running: "Running",
    Completed: "Completed",
    Failed: "Failed",
    Pending: "Pending",
  },
}));

// ── Mock: Cosmos DB client for API layer ──
vi.mock("../api/src/shared/cosmosClient", () => {
  function createContainerFactory(getStore: () => Map<string, any>) {
    return () => ({
      item: (id: string, _pk?: string) => ({
        read: async <T = any>(): Promise<{ resource: T | undefined }> => ({
          resource: getStore().get(id) as T | undefined,
        }),
        replace: async (doc: any) => {
          getStore().set(doc.id ?? id, doc);
          return { resource: doc };
        },
      }),
      items: {
        create: async (doc: any) => {
          getStore().set(doc.id, doc);
          return { resource: doc };
        },
        query: (_sql: string) => ({
          fetchAll: async () => {
            if (state.cosmosQueryShouldFail) throw new Error("Connection refused");
            return { resources: [1] };
          },
        }),
      },
    });
  }

  return {
    complaints: createContainerFactory(() => state.complaintsStore),
    auditLogs: createContainerFactory(() => state.auditLogsStore),
    iccConfig: createContainerFactory(() => new Map()),
    conversations: createContainerFactory(() => new Map()),
    getContainer: () => ({}),
  };
});

// ── Import API modules to trigger handler registration ──
import "../api/src/functions/httpTriggers/healthCheck";
import "../api/src/functions/httpTriggers/submitComplaint";
import "../api/src/functions/httpTriggers/updateComplaintStatus";
import "../api/src/functions/activities/updateStatus";
import "../api/src/functions/activities/logAudit";
import "../api/src/functions/activities/checkComplaintStatus";
import "../api/src/functions/activities/fetchComplaint";
import "../api/src/functions/orchestrators/complaintLifecycle";
import "../api/src/functions/orchestrators/escalationChain";
import "../api/src/functions/orchestrators/inquiryDeadline";

// ============================================================================
// Helpers
// ============================================================================

function createMockRequest(options: {
  params?: Record<string, string>;
  body?: unknown;
  throwOnJson?: boolean;
}): any {
  return {
    params: options.params ?? {},
    json: async () => {
      if (options.throwOnJson) throw new SyntaxError("Unexpected token");
      if (options.body === undefined) throw new SyntaxError("No body");
      return options.body;
    },
  };
}

function createMockContext(): any {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

/** Parse JSON body from a Response-like return value */
async function parseResponse(res: any): Promise<{ status: number; body: any }> {
  const response = res as Response;
  const body = await response.json();
  return { status: response.status, body };
}

/** Create a sample complaint document for seeding the mock store */
function createSampleComplaint(id = "c-001", tenantId = "t-001"): any {
  return {
    id,
    tenantId,
    complainantId: "user-001",
    complainantName: "Test User",
    complaintNumber: "RKS-20260415-0001",
    status: "submitted",
    severity: "high",
    category: "sexual_harassment",
    incidentDate: "2026-04-05",
    incidentLocation: "Office Building A",
    description: "Test complaint description",
    accusedPersons: [
      { name: "Person X", designation: "Manager", department: "Eng", relationship: "manager" },
    ],
    witnesses: [],
    evidenceUrls: [],
    poshSections: ["Section 2(n)"],
    bnsSections: [],
    isCriminalThreshold: false,
    assignedIccId: null,
    escalationLevel: 0,
    submittedAt: "2026-04-15T10:00:00.000Z",
    acknowledgedAt: null,
    acknowledgeDeadline: "2026-04-22T10:00:00.000Z",
    inquiryStartedAt: null,
    inquiryDeadline: "",
    resolvedAt: null,
    resolution: null,
    conversationId: "conv-001",
    complaintPdfUrl: null,
    createdAt: "2026-04-15T10:00:00.000Z",
    updatedAt: "2026-04-15T10:00:00.000Z",
    version: 1,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Raksha API Layer", () => {
  beforeEach(() => {
    state.complaintsStore = new Map();
    state.auditLogsStore = new Map();
    state.cosmosQueryShouldFail = false;
    state.mockDurableClient = {
      getStatus: vi.fn(),
      startNew: vi.fn(),
      createCheckStatusResponse: vi.fn(),
      raiseEvent: vi.fn(),
    };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // HTTP Triggers
  // ──────────────────────────────────────────────────────────────────────────

  describe("HTTP Triggers", () => {
    // ── GET /api/health ──
    describe("GET /api/health", () => {
      it("returns 200 with cosmos connected", async () => {
        const handler = state.httpHandlers.get("healthCheck")!.handler;
        const res = await handler(createMockRequest({}), createMockContext());
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.status).toBe("ok");
        expect(body.service).toBe("raksha-api");
        expect(body.cosmos).toBe("connected");
        expect(body.timestamp).toBeTruthy();
      });

      it("returns 200 with cosmos disconnected when DB unreachable", async () => {
        state.cosmosQueryShouldFail = true;

        const handler = state.httpHandlers.get("healthCheck")!.handler;
        const res = await handler(createMockRequest({}), createMockContext());
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.status).toBe("ok");
        expect(body.cosmos).toBe("disconnected");
        expect(body.cosmosError).toContain("Connection refused");
      });
    });

    // ── POST /api/complaints/:complaintId/submit ──
    describe("POST /api/complaints/:complaintId/submit", () => {
      it("returns 400 when complaintId is missing", async () => {
        const handler = state.httpHandlers.get("submitComplaint")!.handler;
        const res = await handler(
          createMockRequest({ params: {}, body: { tenantId: "t-001" } }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(400);
        expect(body.error).toContain("complaintId");
      });

      it("returns 400 on invalid JSON body", async () => {
        const handler = state.httpHandlers.get("submitComplaint")!.handler;
        const res = await handler(
          createMockRequest({ params: { complaintId: "c-001" }, throwOnJson: true }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(400);
        expect(body.error).toContain("Invalid JSON");
      });

      it("returns 400 when tenantId is missing from body", async () => {
        const handler = state.httpHandlers.get("submitComplaint")!.handler;
        const res = await handler(
          createMockRequest({ params: { complaintId: "c-001" }, body: {} }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(400);
        expect(body.error).toContain("tenantId");
      });

      it("returns 409 when orchestration is already running", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue({ runtimeStatus: "Running" });

        const handler = state.httpHandlers.get("submitComplaint")!.handler;
        const res = await handler(
          createMockRequest({ params: { complaintId: "c-001" }, body: { tenantId: "t-001" } }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(409);
        expect(body.error).toContain("already running");
        expect(body.instanceId).toBe("c-001");
      });

      it("returns 409 when orchestration is pending", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue({ runtimeStatus: "Pending" });

        const handler = state.httpHandlers.get("submitComplaint")!.handler;
        const res = await handler(
          createMockRequest({ params: { complaintId: "c-001" }, body: { tenantId: "t-001" } }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(409);
        expect(body.error).toContain("already running");
      });

      it("starts orchestration and returns status check response", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue(null);
        state.mockDurableClient.startNew.mockResolvedValue("c-001");
        state.mockDurableClient.createCheckStatusResponse.mockReturnValue(
          new Response(JSON.stringify({ id: "c-001", statusQueryGetUri: "..." }), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          }),
        );

        const handler = state.httpHandlers.get("submitComplaint")!.handler;
        const req = createMockRequest({
          params: { complaintId: "c-001" },
          body: { tenantId: "t-001" },
        });
        const ctx = createMockContext();
        const res = await handler(req, ctx);

        expect(state.mockDurableClient.startNew).toHaveBeenCalledWith("complaintLifecycle", {
          instanceId: "c-001",
          input: { complaintId: "c-001", tenantId: "t-001" },
        });
        expect(state.mockDurableClient.createCheckStatusResponse).toHaveBeenCalledWith(req, "c-001");
        expect((res as Response).status).toBe(202);
      });

      it("allows start when previous orchestration is completed", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue({ runtimeStatus: "Completed" });
        state.mockDurableClient.startNew.mockResolvedValue("c-001");
        state.mockDurableClient.createCheckStatusResponse.mockReturnValue(
          new Response("{}", { status: 202 }),
        );

        const handler = state.httpHandlers.get("submitComplaint")!.handler;
        const res = await handler(
          createMockRequest({ params: { complaintId: "c-001" }, body: { tenantId: "t-001" } }),
          createMockContext(),
        );

        expect(state.mockDurableClient.startNew).toHaveBeenCalled();
        expect((res as Response).status).toBe(202);
      });
    });

    // ── PATCH /api/complaints/:complaintId/status ──
    describe("PATCH /api/complaints/:complaintId/status", () => {
      it("returns 400 when complaintId is missing", async () => {
        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        const res = await handler(
          createMockRequest({ params: {}, body: { tenantId: "t-001", status: "acknowledged" } }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(400);
        expect(body.error).toContain("complaintId");
      });

      it("returns 400 on invalid JSON body", async () => {
        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        const res = await handler(
          createMockRequest({ params: { complaintId: "c-001" }, throwOnJson: true }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(400);
        expect(body.error).toContain("Invalid JSON");
      });

      it("returns 400 when tenantId or status is missing", async () => {
        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        const res = await handler(
          createMockRequest({ params: { complaintId: "c-001" }, body: { tenantId: "t-001" } }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(400);
        expect(body.error).toContain("required");
      });

      it("returns 400 for unsupported status value", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue({ runtimeStatus: "Running" });

        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        const res = await handler(
          createMockRequest({
            params: { complaintId: "c-001" },
            body: { tenantId: "t-001", status: "invalid_status" },
          }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(400);
        expect(body.error).toContain("Unsupported status");
      });

      it("returns 404 when no running orchestration exists", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue(null);

        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        const res = await handler(
          createMockRequest({
            params: { complaintId: "c-001" },
            body: { tenantId: "t-001", status: "acknowledged" },
          }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(404);
        expect(body.error).toContain("No running orchestration");
      });

      it("raises complaint_acknowledged event for acknowledged status", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue({ runtimeStatus: "Running" });
        state.mockDurableClient.raiseEvent.mockResolvedValue(undefined);

        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        const res = await handler(
          createMockRequest({
            params: { complaintId: "c-001" },
            body: { tenantId: "t-001", status: "acknowledged" },
          }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(state.mockDurableClient.raiseEvent).toHaveBeenCalledWith(
          "c-001",
          "complaint_acknowledged",
          expect.objectContaining({ iccMemberId: "auth-pending", timestamp: expect.any(String) }),
        );
      });

      it("raises complaint_resolved event with resolution text", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue({ runtimeStatus: "Running" });
        state.mockDurableClient.raiseEvent.mockResolvedValue(undefined);

        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        const res = await handler(
          createMockRequest({
            params: { complaintId: "c-001" },
            body: {
              tenantId: "t-001",
              status: "resolved",
              resolution: "Action taken against accused",
            },
          }),
          createMockContext(),
        );
        const { status, body } = await parseResponse(res);

        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.status).toBe("resolved");
        expect(state.mockDurableClient.raiseEvent).toHaveBeenCalledWith(
          "c-001",
          "complaint_resolved",
          expect.objectContaining({
            resolution: "Action taken against accused",
            iccMemberId: "auth-pending",
            timestamp: expect.any(String),
          }),
        );
      });

      it("raises complaint_resolved with empty resolution when not provided", async () => {
        state.mockDurableClient.getStatus.mockResolvedValue({ runtimeStatus: "Running" });
        state.mockDurableClient.raiseEvent.mockResolvedValue(undefined);

        const handler = state.httpHandlers.get("updateComplaintStatus")!.handler;
        await handler(
          createMockRequest({
            params: { complaintId: "c-001" },
            body: { tenantId: "t-001", status: "resolved" },
          }),
          createMockContext(),
        );

        expect(state.mockDurableClient.raiseEvent).toHaveBeenCalledWith(
          "c-001",
          "complaint_resolved",
          expect.objectContaining({ resolution: "" }),
        );
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Activity Functions
  // ──────────────────────────────────────────────────────────────────────────

  describe("Activity Functions", () => {
    // ── updateStatus ──
    describe("updateStatus", () => {
      it("merges updates into existing complaint", async () => {
        const complaint = createSampleComplaint();
        state.complaintsStore.set(complaint.id, complaint);

        const handler = state.activityHandlers.get("updateStatus")!.handler;
        const result = await handler({
          complaintId: "c-001",
          tenantId: "t-001",
          updates: { complaintPdfUrl: "https://blob/c-001.pdf", status: "acknowledged" },
        });

        expect(result.success).toBe(true);

        const updated = state.complaintsStore.get("c-001");
        expect(updated.complaintPdfUrl).toBe("https://blob/c-001.pdf");
        expect(updated.status).toBe("acknowledged");
      });

      it("increments version number", async () => {
        const complaint = createSampleComplaint();
        state.complaintsStore.set(complaint.id, complaint);

        const handler = state.activityHandlers.get("updateStatus")!.handler;
        await handler({
          complaintId: "c-001",
          tenantId: "t-001",
          updates: { status: "under_inquiry" },
        });

        const updated = state.complaintsStore.get("c-001");
        expect(updated.version).toBe(2);
      });

      it("sets updatedAt timestamp", async () => {
        const complaint = createSampleComplaint();
        state.complaintsStore.set(complaint.id, complaint);
        const originalUpdatedAt = complaint.updatedAt;

        const handler = state.activityHandlers.get("updateStatus")!.handler;
        await handler({
          complaintId: "c-001",
          tenantId: "t-001",
          updates: { status: "resolved" },
        });

        const updated = state.complaintsStore.get("c-001");
        expect(updated.updatedAt).not.toBe(originalUpdatedAt);
      });

      it("throws when complaint not found", async () => {
        const handler = state.activityHandlers.get("updateStatus")!.handler;
        await expect(
          handler({ complaintId: "nonexistent", tenantId: "t-001", updates: {} }),
        ).rejects.toThrow("not found");
      });
    });

    // ── logAudit ──
    describe("logAudit", () => {
      it("creates audit log entry in Cosmos", async () => {
        const handler = state.activityHandlers.get("logAudit")!.handler;
        const result = await handler({
          complaintId: "c-001",
          tenantId: "t-001",
          action: "submitted",
          performedBy: "system",
          performedByRole: "system",
          details: { orchestrationId: "c-001" },
        });

        expect(result.success).toBe(true);
        expect(state.auditLogsStore.size).toBe(1);

        const entry = Array.from(state.auditLogsStore.values())[0];
        expect(entry.complaintId).toBe("c-001");
        expect(entry.tenantId).toBe("t-001");
        expect(entry.action).toBe("submitted");
        expect(entry.performedBy).toBe("system");
        expect(entry.performedByRole).toBe("system");
        expect(entry.details.orchestrationId).toBe("c-001");
        expect(entry.timestamp).toBeTruthy();
        expect(entry.id).toBeTruthy();
        expect(entry.ipAddress).toBeNull();
      });

      it("generates unique IDs for multiple entries", async () => {
        const handler = state.activityHandlers.get("logAudit")!.handler;

        await handler({
          complaintId: "c-001",
          tenantId: "t-001",
          action: "submitted",
          performedBy: "system",
          performedByRole: "system",
        });
        await handler({
          complaintId: "c-001",
          tenantId: "t-001",
          action: "acknowledged",
          performedBy: "icc-member-001",
          performedByRole: "icc",
        });

        expect(state.auditLogsStore.size).toBe(2);
        const ids = Array.from(state.auditLogsStore.keys());
        expect(ids[0]).not.toBe(ids[1]);
      });
    });

    // ── fetchComplaint ──
    describe("fetchComplaint", () => {
      it("returns complaint data for existing complaint", async () => {
        const complaint = createSampleComplaint();
        state.complaintsStore.set(complaint.id, complaint);

        const handler = state.activityHandlers.get("fetchComplaint")!.handler;
        const result = await handler({ complaintId: "c-001", tenantId: "t-001" });

        expect(result.complaintNumber).toBe("RKS-20260415-0001");
        expect(result.complainantName).toBe("Test User");
        expect(result.complainantId).toBe("user-001");
        expect(result.category).toBe("sexual_harassment");
        expect(result.severity).toBe("high");
        expect(result.isCriminalThreshold).toBe(false);
        expect(result.escalationLevel).toBe(0);
      });

      it("throws when complaint not found", async () => {
        const handler = state.activityHandlers.get("fetchComplaint")!.handler;
        await expect(
          handler({ complaintId: "nonexistent", tenantId: "t-001" }),
        ).rejects.toThrow("not found");
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Orchestrator: complaintLifecycle
  // ──────────────────────────────────────────────────────────────────────────

  describe("Orchestrator: complaintLifecycle", () => {
    /**
     * Create a mock orchestration context that supports:
     *   - callActivity (tracks calls)
     *   - callSubOrchestrator (tracks calls, returns a sentinel object)
     *   - waitForExternalEvent (returns a sentinel object)
     *   - Task.any (returns a sentinel that is the "winner")
     *   - createTimer (returns a sentinel)
     *   - log (no-op)
     */
    function createOrchestratorContext(input: any) {
      const activityCalls: Array<{ name: string; input: any }> = [];
      const subOrchCalls: Array<{ name: string; input: any; instanceId: string }> = [];
      const externalEvents: string[] = [];

      // Sentinels for Task.any winner resolution
      const ACK_EVENT = Symbol("ack_event");
      const ESCALATION_TASK = Symbol("escalation_task");
      const RESOLVE_EVENT = Symbol("resolve_event");
      const INQUIRY_TASK = Symbol("inquiry_task");

      // Configurable: which event wins the Task.any race
      let ackWins = true;
      let resolveWins = true;

      const context = {
        df: {
          getInput: <T = any>() => input as T,
          callActivity: (name: string, actInput: any) => {
            activityCalls.push({ name, input: actInput });
            return `activity:${name}`;
          },
          callSubOrchestrator: (name: string, subInput: any, instanceId: string) => {
            subOrchCalls.push({ name, input: subInput, instanceId });
            if (name === "escalationChain") return ESCALATION_TASK;
            if (name === "inquiryDeadline") return INQUIRY_TASK;
            return Symbol("sub_orch");
          },
          waitForExternalEvent: (eventName: string) => {
            externalEvents.push(eventName);
            if (eventName === "complaint_acknowledged") return ACK_EVENT;
            if (eventName === "complaint_resolved") return RESOLVE_EVENT;
            return Symbol("event");
          },
          Task: {
            any: (tasks: unknown[]) => {
              // Return the winning task sentinel
              if (tasks.includes(ACK_EVENT) && tasks.includes(ESCALATION_TASK)) {
                return ackWins ? ACK_EVENT : ESCALATION_TASK;
              }
              if (tasks.includes(RESOLVE_EVENT) && tasks.includes(INQUIRY_TASK)) {
                return resolveWins ? RESOLVE_EVENT : INQUIRY_TASK;
              }
              return tasks[0];
            },
          },
          instanceId: input?.complaintId ?? "unknown",
          currentUtcDateTime: new Date("2026-04-15T10:00:00Z"),
        },
        log: () => {},
      };

      return {
        context,
        activityCalls,
        subOrchCalls,
        externalEvents,
        setAckWins: (v: boolean) => { ackWins = v; },
        setResolveWins: (v: boolean) => { resolveWins = v; },
        ACK_EVENT,
        ESCALATION_TASK,
        RESOLVE_EVENT,
        INQUIRY_TASK,
      };
    }

    /**
     * Helper: Step through fetchComplaint + Phase 1 of the lifecycle (3 activities).
     * Returns the generator after all Phase 1 yields have been fed.
     */
    function stepThroughPhase1(gen: Generator) {
      // Step 0: fetchComplaint
      let step = gen.next();
      expect(step.done).toBe(false);

      // Feed fetchComplaint result → Step 1: sendNotification
      step = gen.next({
        complaintNumber: "RKS-20260415-0001",
        complainantName: "Test User",
        complainantId: "user-001",
        category: "sexual_harassment",
        severity: "high",
        isCriminalThreshold: false,
        escalationLevel: 0,
      });
      expect(step.done).toBe(false);

      // Feed notificationResult → Step 2: logAudit (submitted)
      step = gen.next({ success: true });
      expect(step.done).toBe(false);

      return step;
    }

    it("calls Phase 1 activities in correct order", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context, activityCalls, setAckWins } = createOrchestratorContext({
        complaintId: "c-001",
        tenantId: "t-001",
      });

      const gen = orchestrationFn(context);
      stepThroughPhase1(gen);

      // Verify Phase 1 activity order
      expect(activityCalls.map(c => c.name)).toEqual([
        "fetchComplaint",
        "sendNotification",
        "logAudit",
      ]);

      // fetchComplaint input
      expect(activityCalls[0].input).toEqual({ complaintId: "c-001", tenantId: "t-001" });

      // sendNotification uses complaint_submitted key
      expect(activityCalls[1].input.notificationKey).toBe("complaint_submitted");

      // logAudit records submitted
      expect(activityCalls[2].input.action).toBe("submitted");
    });

    it("starts escalationChain sub-orchestrator after Phase 1", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context, activityCalls, subOrchCalls, ACK_EVENT } = createOrchestratorContext({
        complaintId: "c-001",
        tenantId: "t-001",
      });

      const gen = orchestrationFn(context);
      stepThroughPhase1(gen);

      // Feed logAudit result → enters Phase 2 (Task.any yield)
      const taskAnyStep = gen.next({ success: true });
      expect(taskAnyStep.done).toBe(false);

      // Sub-orchestrator was registered
      expect(subOrchCalls).toHaveLength(1);
      expect(subOrchCalls[0].name).toBe("escalationChain");
      expect(subOrchCalls[0].instanceId).toBe("escalation-c-001");
      expect(subOrchCalls[0].input.complaintId).toBe("c-001");
    });

    it("handles acknowledgement → inquiry → resolution flow", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context, activityCalls, subOrchCalls, setAckWins, setResolveWins } = createOrchestratorContext({
        complaintId: "c-001",
        tenantId: "t-001",
      });
      setAckWins(true);
      setResolveWins(true);

      const gen = orchestrationFn(context);
      stepThroughPhase1(gen);

      // Feed logAudit result → Phase 2: Task.any([ackEvent, escalationTask])
      let step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Feed Task.any winner (ack) → updateStatus (under_inquiry)
      step = gen.next(step.value);
      expect(step.done).toBe(false);

      // Feed updateStatus → sendNotification (complaint_acknowledged)
      step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Feed notification → logAudit (acknowledged)
      step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Feed logAudit → Phase 3: starts inquiryDeadline sub-orch, then Task.any
      step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Inquiry sub-orchestrator was started
      expect(subOrchCalls).toHaveLength(2);
      expect(subOrchCalls[1].name).toBe("inquiryDeadline");
      expect(subOrchCalls[1].instanceId).toBe("inquiry-c-001");

      // Feed Task.any winner (resolve) → updateStatus (resolved)
      step = gen.next(step.value);
      expect(step.done).toBe(false);

      // Feed updateStatus → sendNotification (resolved)
      step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Feed notification → logAudit (resolved)
      step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Feed logAudit → done
      step = gen.next({ success: true });
      expect(step.done).toBe(true);
      expect(step.value).toMatchObject({
        success: true,
        complaintId: "c-001",
        outcome: "resolved",
      });
    });

    it("handles escalation chain exhausted (no acknowledgement)", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context, setAckWins } = createOrchestratorContext({
        complaintId: "c-001",
        tenantId: "t-001",
      });
      setAckWins(false); // Escalation wins the race

      const gen = orchestrationFn(context);
      stepThroughPhase1(gen);

      // Feed logAudit → Phase 2 Task.any (escalation wins)
      let step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Feed Task.any result — escalation task won → updateStatus (escalated)
      step = gen.next(step.value);
      expect(step.done).toBe(false);

      // Feed updateStatus → logAudit (escalated)
      step = gen.next({ success: true });
      expect(step.done).toBe(false);

      // Feed logAudit → done
      step = gen.next({ success: true });
      expect(step.done).toBe(true);
      expect(step.value).toMatchObject({
        success: true,
        complaintId: "c-001",
        outcome: "escalation_exhausted",
      });
    });

    it("handles inquiry breach (no resolution)", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context, setAckWins, setResolveWins } = createOrchestratorContext({
        complaintId: "c-001",
        tenantId: "t-001",
      });
      setAckWins(true);
      setResolveWins(false); // Inquiry task wins (breach)

      const gen = orchestrationFn(context);
      stepThroughPhase1(gen);

      // Phase 2: Task.any → ack wins
      let step = gen.next({ success: true }); // logAudit → Task.any
      step = gen.next(step.value); // ack → updateStatus
      step = gen.next({ success: true }); // → sendNotification
      step = gen.next({ success: true }); // → logAudit

      // Phase 3: Task.any → inquiry wins (breach)
      step = gen.next({ success: true }); // logAudit → Task.any
      step = gen.next(step.value); // inquiry wins

      expect(step.done).toBe(true);
      expect(step.value).toMatchObject({
        success: true,
        complaintId: "c-001",
        outcome: "inquiry_breached",
      });
    });

    it("throws when no input is provided", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context } = createOrchestratorContext(null);

      const gen = orchestrationFn(context);
      expect(() => gen.next()).toThrow("no input provided");
    });

    it("passes tenantId to every activity", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context, activityCalls } = createOrchestratorContext({
        complaintId: "c-999",
        tenantId: "tenant-xyz",
      });

      const gen = orchestrationFn(context);
      stepThroughPhase1(gen);

      for (const call of activityCalls) {
        expect(call.input.tenantId).toBe("tenant-xyz");
      }
    });

    it("passes complaintId to every activity that needs it", () => {
      const orchestrationFn = state.orchestrationHandlers.get("complaintLifecycle")!;
      const { context, activityCalls } = createOrchestratorContext({
        complaintId: "c-abc",
        tenantId: "t-001",
      });

      const gen = orchestrationFn(context);
      stepThroughPhase1(gen);

      // sendNotification doesn't have complaintId directly — it uses templateVars
      // All other activities should have complaintId
      const activitiesWithComplaintId = activityCalls.filter(c => c.name !== "sendNotification");
      for (const call of activitiesWithComplaintId) {
        expect(call.input.complaintId).toBe("c-abc");
      }

      // sendNotification should have it in templateVars
      const notifCall = activityCalls.find(c => c.name === "sendNotification")!;
      expect(notifCall.input.templateVars.complaintId).toBe("c-abc");
    });

  });

  // ──────────────────────────────────────────────────────────────────────────
  // Orchestrator: escalationChain
  // ──────────────────────────────────────────────────────────────────────────

  describe("Orchestrator: escalationChain", () => {
    function createEscalationContext(input: any) {
      const activityCalls: Array<{ name: string; input: any }> = [];
      const timerDates: Date[] = [];

      const context = {
        df: {
          getInput: <T = any>() => input as T,
          callActivity: (name: string, actInput: any) => {
            activityCalls.push({ name, input: actInput });
            return `activity:${name}`;
          },
          createTimer: (date: Date) => {
            timerDates.push(date);
            return `timer:${date.toISOString()}`;
          },
          currentUtcDateTime: new Date("2026-04-15T10:00:00Z"),
        },
        log: () => {},
      };

      return { context, activityCalls, timerDates };
    }

    it("self-terminates when complaint is already acknowledged", () => {
      const orchestrationFn = state.orchestrationHandlers.get("escalationChain")!;
      const { context, activityCalls, timerDates } = createEscalationContext({
        complaintId: "c-001",
        tenantId: "t-001",
        complainant: { name: "Test", email: "test@test.com", userId: "u-001" },
        templateVars: { complaintNumber: "C-001" },
      });

      const gen = orchestrationFn(context);

      // Step 1: createTimer for acknowledgement deadline (7 days)
      let step = gen.next();
      expect(step.done).toBe(false);
      expect(timerDates).toHaveLength(1);

      // Feed timer → level 0 has waitDaysAfterPrevious=0, so next is checkComplaintStatus
      step = gen.next(); // timer resolved
      expect(step.done).toBe(false);
      expect(activityCalls.at(-1)!.name).toBe("checkComplaintStatus");

      // Feed: complaint already acknowledged → should log and exit
      step = gen.next({ status: "under_inquiry", escalationLevel: 0, acknowledgedAt: "2026-04-20", resolvedAt: null });
      expect(step.done).toBe(false); // logAudit
      expect(activityCalls.at(-1)!.name).toBe("logAudit");
      expect(activityCalls.at(-1)!.input.action).toBe("escalation_check_passed");

      // Feed logAudit → done
      step = gen.next({ success: true });
      expect(step.done).toBe(true);
      expect(step.value).toMatchObject({
        escalated: false,
        selfTerminated: true,
      });
    });

    it("escalates through all levels when complaint stays submitted", () => {
      const orchestrationFn = state.orchestrationHandlers.get("escalationChain")!;
      const { context, activityCalls, timerDates } = createEscalationContext({
        complaintId: "c-002",
        tenantId: "t-001",
        complainant: { name: "Test", email: "test@test.com", userId: "u-001" },
        templateVars: { complaintNumber: "C-002" },
      });

      const gen = orchestrationFn(context);
      const submittedStatus = { status: "submitted", escalationLevel: 0, acknowledgedAt: null, resolvedAt: null };

      // Step through the generator. Each yield is either:
      //   - createTimer → feed undefined (timer resolved)
      //   - callActivity("checkComplaintStatus") → feed submittedStatus
      //   - callActivity(other) → feed { success: true }
      let lastStep = gen.next(); // first yield: createTimer for ack deadline
      for (let i = 0; i < 200 && !lastStep.done; i++) {
        const lastActivity = activityCalls.at(-1);
        if (lastActivity?.name === "checkComplaintStatus") {
          lastStep = gen.next(submittedStatus);
        } else {
          lastStep = gen.next({ success: true });
        }
      }

      // Should exhaust all levels and return escalated
      expect(lastStep.done).toBe(true);
      expect(lastStep.value).toMatchObject({
        escalated: true,
        selfTerminated: false,
      });

      // Verify all escalation levels triggered activities
      const auditActions = activityCalls
        .filter(c => c.name === "logAudit")
        .map(c => c.input.action);
      expect(auditActions).toContain("reminder_sent_icc");
      expect(auditActions).toContain("escalated_audit_committee");
      expect(auditActions).toContain("escalated_district_officer");
    });

    it("throws when no input is provided", () => {
      const orchestrationFn = state.orchestrationHandlers.get("escalationChain")!;
      const { context } = createEscalationContext(null);

      const gen = orchestrationFn(context);
      expect(() => gen.next()).toThrow("no input provided");
    });

    it("skips initial deadline wait when skipInitialWait is true", () => {
      const orchestrationFn = state.orchestrationHandlers.get("escalationChain")!;
      const { context, activityCalls, timerDates } = createEscalationContext({
        complaintId: "c-003",
        tenantId: "t-001",
        complainant: { name: "Test", email: "test@test.com", userId: "u-001" },
        templateVars: { complaintNumber: "C-003" },
        skipInitialWait: true,
      });

      const gen = orchestrationFn(context);

      // First yield should be checkComplaintStatus (level 0 has waitDaysAfterPrevious=0),
      // NOT the initial deadline timer
      let step = gen.next();
      expect(step.done).toBe(false);
      // With skipInitialWait, no initial timer should have been set
      expect(timerDates).toHaveLength(0);
      expect(activityCalls.at(-1)!.name).toBe("checkComplaintStatus");

      // Feed: complaint already acknowledged → should self-terminate
      step = gen.next({ status: "under_inquiry", escalationLevel: 0, acknowledgedAt: "2026-04-20", resolvedAt: null });
      expect(step.done).toBe(false); // logAudit
      step = gen.next({ success: true });
      expect(step.done).toBe(true);
      expect(step.value).toMatchObject({
        escalated: false,
        selfTerminated: true,
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Orchestrator: inquiryDeadline
  // ──────────────────────────────────────────────────────────────────────────

  describe("Orchestrator: inquiryDeadline", () => {
    function createInquiryContext(input: any) {
      const activityCalls: Array<{ name: string; input: any }> = [];
      const timerDates: Date[] = [];

      const context = {
        df: {
          getInput: <T = any>() => input as T,
          callActivity: (name: string, actInput: any) => {
            activityCalls.push({ name, input: actInput });
            return `activity:${name}`;
          },
          createTimer: (date: Date) => {
            timerDates.push(date);
            return `timer:${date.toISOString()}`;
          },
          currentUtcDateTime: new Date("2026-04-15T10:00:00Z"),
        },
        log: () => {},
      };

      return { context, activityCalls, timerDates };
    }

    it("self-terminates when complaint is resolved during reminders", () => {
      const orchestrationFn = state.orchestrationHandlers.get("inquiryDeadline")!;
      const { context, activityCalls } = createInquiryContext({
        complaintId: "c-001",
        tenantId: "t-001",
        inquiryStartedAt: "2026-04-15T10:00:00Z",
        complainant: { name: "Test", email: "test@test.com", userId: "u-001" },
        templateVars: { complaintNumber: "C-001" },
      });

      const gen = orchestrationFn(context);

      // First reminder: createTimer
      let step = gen.next();
      expect(step.done).toBe(false);

      // Timer resolved → checkComplaintStatus
      step = gen.next();
      expect(step.done).toBe(false);
      expect(activityCalls.at(-1)!.name).toBe("checkComplaintStatus");

      // Feed: complaint resolved
      step = gen.next({ status: "resolved", escalationLevel: 0, acknowledgedAt: "2026-04-15", resolvedAt: "2026-05-01" });
      expect(step.done).toBe(true);
      expect(step.value).toMatchObject({ breached: false, selfTerminated: true });
    });

    it("reports breach when deadline passes without resolution", () => {
      const orchestrationFn = state.orchestrationHandlers.get("inquiryDeadline")!;
      const { context, activityCalls } = createInquiryContext({
        complaintId: "c-002",
        tenantId: "t-001",
        inquiryStartedAt: "2026-04-15T10:00:00Z",
        complainant: { name: "Test", email: "test@test.com", userId: "u-001" },
        templateVars: { complaintNumber: "C-002" },
      });

      const gen = orchestrationFn(context);
      const unresolvedStatus = { status: "under_inquiry", escalationLevel: 0, acknowledgedAt: "2026-04-15", resolvedAt: null };

      // Step through all reminders + final check
      let lastStep = gen.next();
      for (let i = 0; i < 200 && !lastStep.done; i++) {
        const lastActivity = activityCalls.at(-1);
        if (lastActivity?.name === "checkComplaintStatus") {
          lastStep = gen.next(unresolvedStatus);
        } else {
          lastStep = gen.next({ success: true });
        }
      }

      expect(lastStep.done).toBe(true);
      expect(lastStep.value).toMatchObject({ breached: true, selfTerminated: false });
    });

    it("throws when no input is provided", () => {
      const orchestrationFn = state.orchestrationHandlers.get("inquiryDeadline")!;
      const { context } = createInquiryContext(null);

      const gen = orchestrationFn(context);
      expect(() => gen.next()).toThrow("no input provided");
    });
  });
});
