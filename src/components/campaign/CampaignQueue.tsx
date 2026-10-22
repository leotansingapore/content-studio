// The review queue on /campaigns/:id, under #queue (plan-review-queue): built by review-queue in wave 4; renders
// nothing until then. `angle` is the page's ?angle= filter (null for all); the queue reads ?post= and ?view= itself.
import type { Campaign } from "@/lib/campaigns";

export default function CampaignQueue(_: { userId: string; campaign: Campaign; angle: string | null }) {
  return null;
}
