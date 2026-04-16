/**
 * Raksha — Evidence Card
 *
 * Shown when a user sends a file attachment in the bot chat.
 * Asks for confirmation before saving the file as evidence.
 *
 * Edge cases handled:
 *   - Invalid file type → rejection message (no card)
 *   - File too large → rejection message (no card)
 *   - No active complaint → card with "start documenting" prompt
 *   - Valid file + active complaint → save/skip confirmation card
 */

import {
  AdaptiveCard,
  TextBlock,
  ActionSet,
  ExecuteAction,
  FactSet,
  Fact,
  Container,
} from "@microsoft/teams.cards";

// ============================================================================
// Evidence Confirmation Card
// ============================================================================

/**
 * Build a card asking the user to confirm saving a file as evidence.
 */
export function buildEvidenceConfirmCard(params: {
  fileName: string;
  typeLabel: string;
  sizeLabel: string;
  /** The Teams download URL — passed in card action data so the handler can retrieve it */
  downloadUrl: string;
  contentType: string;
  complaintNumber: string;
}): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("File received", {
      weight: "Bolder",
      size: "Medium",
      wrap: true,
    }),

    new FactSet(
      new Fact("File", params.fileName),
      new Fact("Type", params.typeLabel),
      new Fact("Size", params.sizeLabel),
    ),

    new TextBlock(
      `Save this as evidence for complaint **${params.complaintNumber}**?`,
      { wrap: true, spacing: "Medium", size: "Small" },
    ),

    new ActionSet(
      new ExecuteAction({ title: "Save as Evidence" })
        .withVerb("save_evidence")
        .withData({
          action: "save_evidence",
          fileName: params.fileName,
          downloadUrl: params.downloadUrl,
          contentType: params.contentType,
        })
        .withStyle("positive"),

      new ExecuteAction({ title: "Skip" })
        .withVerb("skip_evidence")
        .withData({ action: "skip_evidence", fileName: params.fileName }),
    ),
  );
}

// ============================================================================
// No Active Complaint Card
// ============================================================================

/**
 * Shown when a user sends a file but has no draft complaint.
 * Offers to start documenting so evidence can be attached.
 */
export function buildNoComplaintEvidenceCard(fileName: string): AdaptiveCard {
  return new AdaptiveCard(
    new TextBlock("File received", {
      weight: "Bolder",
      size: "Medium",
      wrap: true,
    }),

    new TextBlock(
      `I received "${fileName}", but you don't have an active complaint to attach it to. ` +
      "Would you like to start documenting what happened? You can attach evidence during or after.",
      { wrap: true, spacing: "Small", size: "Small" },
    ),

    new ActionSet(
      new ExecuteAction({ title: "Start documenting" })
        .withVerb("start_intake")
        .withData({ action: "start_intake" }),

      new ExecuteAction({ title: "Not now" })
        .withVerb("skip_evidence")
        .withData({ action: "skip_evidence", fileName }),
    ),
  );
}

// ============================================================================
// Evidence Saved Confirmation
// ============================================================================

/**
 * Brief confirmation after evidence is saved.
 */
export function buildEvidenceSavedCard(
  fileName: string,
  totalCount: number,
): AdaptiveCard {
  const countText = totalCount === 1
    ? "1 file attached"
    : `${totalCount} files attached`;

  return new AdaptiveCard(
    new Container(
      new TextBlock(
        `Saved **${fileName}** as evidence. (${countText} total)`,
        { wrap: true, size: "Small", color: "Good" },
      ),
      new TextBlock(
        "You can continue sharing what happened, or send more files.",
        { wrap: true, size: "Small", isSubtle: true },
      ),
    ),
  );
}
