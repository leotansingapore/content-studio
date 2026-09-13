// Content Studio's board on the feedback service. The key names exactly one board
// there and nothing lists boards, so it can only ever reach Content Studio's posts.
// Shared by the board page and the assistant dock.
import { isFeedbackNew } from "./FeedbackBoard";

export const FEEDBACK_API = "https://leotan-feedback.vercel.app/api/v1";
export const FEEDBACK_BOARD_KEY = "fb_160b1f216061333a6eab92896d5619858b9e0a1a547effb0";

/** True until the person has opened the board once in this browser; the rail shows New. */
export function feedbackIsNew() {
  return isFeedbackNew(FEEDBACK_BOARD_KEY);
}
