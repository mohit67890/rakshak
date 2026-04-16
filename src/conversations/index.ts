/**
 * Raksha — Conversations barrel export
 */

export {
  getOrCreateConversation,
  transitionState,
  switchMode,
  addMessage,
  appendMessages,
  getMessages,
  getRecentMessages,
  updateCollectedData,
  linkComplaint,
} from "./stateMachine";

export {
  registerFlow,
  handleMessage,
  handleCardAction,
  type FlowHandler,
  type MessageInput,
  type CardActionInput,
} from "./router";
