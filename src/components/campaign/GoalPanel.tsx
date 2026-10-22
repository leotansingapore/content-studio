// THE GOAL on /campaigns/:id (plan-campaign-page): built by campaign-panels in wave 4; renders nothing until then.
// `angle` is the page's ?angle= filter (null for all), and `onAngle` sets it: AngleMix's chips filter the queue.
import type { Campaign } from "@/lib/campaigns";

export default function GoalPanel(_: { userId: string; campaign: Campaign; angle: string | null; onAngle: (id: string | null) => void }) {
  return null;
}
