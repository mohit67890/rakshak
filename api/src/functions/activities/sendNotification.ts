/**
 * Raksha API — Activity: Send Notification
 *
 * Unified notification activity that replaces the old sendIccNotification
 * and notifyComplainant stubs. Dispatches to the right channel(s) based
 * on the notification definition in orchestration.config.json.
 *
 * Called by orchestrators with a notification key + context.
 * The dispatcher resolves audiences, renders templates, and sends.
 */

import * as df from "durable-functions";
import {
  dispatchNotification,
  type DispatchInput,
  type DispatchResult,
} from "../../shared/notificationDispatcher";

export type { DispatchInput as SendNotificationInput };
export type { DispatchResult as SendNotificationResult };

df.app.activity("sendNotification", {
  handler: async (input: DispatchInput): Promise<DispatchResult> => {
    return dispatchNotification(input);
  },
});
