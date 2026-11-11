import { callFn } from "@/lib/edgeFn";
import { supabase } from "@/lib/supabase";
import { disconnectTelegram, readOwnBot, readTelegramRows, removeOwnBot } from "@/lib/telegramConnect";

const CHAT_STATES = ["connected", "cant_post", "removed"];

export const stopBrandTelegram = async (profileId: string) => {
  const rows = await readTelegramRows(profileId);
  for (const r of rows.filter((r) => CHAT_STATES.includes(r.status))) await disconnectTelegram(profileId, r.id);
  if (await readOwnBot(profileId)) await removeOwnBot(profileId);
};

export const pauseBrandCampaigns = async (profileId: string) => {
  const { data, error } = await supabase.from("cs_slide_campaigns").select("id, status").eq("profile_id", profileId);
  if (error) throw new Error("Couldn't load the brand's campaigns. Try again in a minute.");
  for (const c of (data ?? []) as { id: string; status: string }[]) {
    if (c.status === "live") await callFn("slide-campaigns", { action: "pause", id: c.id }, "Couldn't pause the brand's campaign. Try again in a minute.");
  }
};
