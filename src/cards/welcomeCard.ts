/**
 * Raksha — Welcome Card
 *
 * Conversation-first design. The card leads with warmth and safety,
 * not with action buttons. Actions are offered gently after the
 * person feels heard.
 */

import {
  AdaptiveCard,
  TextBlock,
  ActionSet,
  ExecuteAction,
} from "@microsoft/teams.cards";

/**
 * First-contact card. Warm, low-pressure. Buttons at the bottom
 * are optional — the user can just start typing instead.
 */
export function buildWelcomeCard(): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("Rakshak", {
      size: "Large",
      weight: "Bolder",
      wrap: true,
    }),

    new TextBlock(
      "Your workplace safety assistant. Whatever's on your mind — " +
      "a question, something that happened, or just wanting to understand " +
      "your rights — this is a safe space to talk.",
      { wrap: true, spacing: "Small" },
    ),

    new TextBlock(
      "**Everything here is confidential and encrypted.** " +
      "Your manager and HR cannot see this conversation.",
      { wrap: true, size: "Small", spacing: "Medium" },
    ),

    new TextBlock(
      "You can start typing, or pick one of these:",
      { wrap: true, spacing: "Large", size: "Small", isSubtle: true },
    ),

    new ActionSet(
      new ExecuteAction({ title: "I need to report something" })
        .withVerb("report")
        .withData({ action: "report" })
        .withStyle("positive"),

      new ExecuteAction({ title: "Check my complaint status" })
        .withVerb("status")
        .withData({ action: "status" }),

      new ExecuteAction({ title: "Help me understand my rights" })
        .withVerb("learn")
        .withData({ action: "learn" }),
    ),
  );
}

/**
 * Shown when the user returns to an in-progress intake conversation.
 * Reminds them where they left off and what's been collected.
 */
export function buildResumptionCard(
  lastUpdated: string,
  summary: string,
): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("Welcome back", {
      size: "Large",
      weight: "Bolder",
      wrap: true,
    }),

    new TextBlock(
      `I've kept everything you shared. Here's where we are:`,
      { wrap: true, spacing: "Small" },
    ),

    new TextBlock(summary, {
      wrap: true,
      spacing: "Small",
      isSubtle: true,
      size: "Small",
    }),

    new TextBlock(
      `_Last updated: ${formatTimeAgo(lastUpdated)}_`,
      { wrap: true, size: "Small", isSubtle: true, spacing: "Small" },
    ),

    new ActionSet(
      new ExecuteAction({ title: "Pick up where I left off" })
        .withVerb("resume")
        .withData({ action: "resume" })
        .withStyle("positive"),

      new ExecuteAction({ title: "Start fresh" })
        .withVerb("restart")
        .withData({ action: "restart" }),
    ),
  );
}

/**
 * Shown when the bot detects enough information for a complaint.
 * Gently offers to prepare a summary without forcing the user.
 */
export function buildReadinessCard(): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock(
      "I think we have a **strong foundation** for your complaint. " +
      "Whenever you're ready, I can put together a formal summary for your review — " +
      "and you'll be able to change anything before it's submitted.",
      { wrap: true },
    ),

    new TextBlock(
      "Or if there's more you want to share, I'm listening.",
      { wrap: true, spacing: "Small", isSubtle: true, size: "Small" },
    ),

    new ActionSet(
      new ExecuteAction({ title: "Prepare my complaint summary" })
        .withVerb("review")
        .withData({ action: "ready_review" })
        .withStyle("positive"),

      new ExecuteAction({ title: "I have more to share" })
        .withVerb("continue")
        .withData({ action: "continue_intake" }),
    ),
  );
}

/**
 * Shown when the LLM detects the user is describing harassment in chat mode.
 * Gently offers to switch to formal intake without pressuring.
 */
export function buildIntakeSuggestionCard(): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock(
      "What you've shared sounds like something that could be formally documented. " +
      "If you'd like, I can help you build a complaint — it stays with you until *you* decide to submit it.",
      { wrap: true },
    ),

    new TextBlock(
      "Completely your call. No pressure.",
      { wrap: true, spacing: "Small", size: "Small", isSubtle: true },
    ),

    new ActionSet(
      new ExecuteAction({ title: "Yes, let's document this" })
        .withVerb("start_intake")
        .withData({ action: "start_intake" })
        .withStyle("positive"),

      new ExecuteAction({ title: "Not right now — I just want to talk" })
        .withVerb("stay_chat")
        .withData({ action: "stay_chat" }),
    ),
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}
