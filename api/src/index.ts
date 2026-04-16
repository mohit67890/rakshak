/**
 * Raksha API — Entry Point
 *
 * Imports all function modules so the Azure Functions runtime discovers them.
 * Each module registers itself via df.app.activity(), df.app.orchestration(),
 * or app.http() at import time.
 */

// Activities
import "./functions/activities/logAudit";
import "./functions/activities/updateStatus";
import "./functions/activities/sendNotification";
import "./functions/activities/checkComplaintStatus";
import "./functions/activities/fetchComplaint";

// Orchestrators
import "./functions/orchestrators/complaintLifecycle";
import "./functions/orchestrators/escalationChain";
import "./functions/orchestrators/inquiryDeadline";

// Timer Triggers
import "./functions/timerTriggers/dailyEscalationCheck";

// HTTP Triggers
import "./functions/httpTriggers/submitComplaint";
import "./functions/httpTriggers/updateComplaintStatus";
import "./functions/httpTriggers/healthCheck";
import "./functions/httpTriggers/getComplaints";
import "./functions/httpTriggers/getComplaintById";
import "./functions/httpTriggers/getIccDashboard";
import "./functions/httpTriggers/getUserRole";
import "./functions/httpTriggers/uploadEvidence";
import "./functions/httpTriggers/comments";
