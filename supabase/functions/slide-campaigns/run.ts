// One campaign run: pick a hook, have the writer fill the slides, draw a picture per slide from the role's library,
// render the PNGs, keep them in cs-slide-campaigns, and (for a scheduled run) send them to the account's TikTok drafts.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { openaiChat, OPENAI_MODEL } from "../_shared/openaiChat.ts";
import { HONEST_LINE, professionOf } from "../_shared/profession.ts";
import { PEXELS_SRC, ownUpload, parseWriter, pickHook, pickImages, runPlan, sanitizeSchedule, sanitizeSpec, slotKey, writerPrompt, type Role } from "../_shared/slideCampaign.ts";
import { renderSlide } from "../_shared/slideRender.ts";
import { zernioClient } from "../_shared/zernio.ts";
import { checkSchedule, runPost } from "../social/posts.ts";

export const BUCKET = "cs-slide-campaigns";
/** Long enough for Zernio to fetch the slides when it posts, however far ahead the run is made. */
const POST_LINK_SECONDS = 7 * 24 * 3600;
export const VIEW_LINK_SECONDS = 3600;

export interface CampaignRow {
  id: string;
  owner_id: string;
  profile_id: string;
  name: string;
  status: string;
  spec: unknown;
  schedule: unknown;
  publish: unknown;
  account_id: string | null;
  next_run_at: string | null;
  last_run_at?: string | null;
  last_hook: string | null;
}
export class RunError extends Error {}

const scopedKey = (uid: string, profile: string) => (profile === "me" ? uid : `${uid}~${profile}`);

/** What the brand does and for whom, from its brand kit, for the writer. */
async function brandBrief(admin: SupabaseClient, uid: string, profile: string): Promise<string> {
  const { data } = await admin.from("cs_user_data").select("data").eq("user_id", uid).eq("key", `content-studio-carousel-brand-${scopedKey(uid, profile)}`).maybeSingle();
  try {
    const kit = JSON.parse(data?.data ?? "{}");
    const name = typeof kit.name === "string" ? kit.name.trim() : "";
    const work = professionOf(kit.profession) || "financial adviser";
    const offers = Array.isArray(kit.offers) ? kit.offers.map((o: { name?: string }) => o?.name).filter(Boolean).slice(0, 3) : [];
    return [name && `${name}, a ${work}`, !name && `A ${work}`, offers.length && `offers: ${offers.join(", ")}`].filter(Boolean).join("; ");
  } catch {
    return "";
  }
}

async function write(spec: ReturnType<typeof sanitizeSpec>, hook: string, brief: string) {
  const p = writerPrompt(spec, hook, brief, HONEST_LINE);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await openaiChat({ model: OPENAI_MODEL, response_format: { type: "json_object" }, max_tokens: 1200, messages: [{ role: "system", content: p.system }, { role: "user", content: p.user }] });
    if (!res.ok) continue;
    const j = await res.json().catch(() => null);
    const w = parseWriter(j?.choices?.[0]?.message?.content ?? "", spec);
    if (w) return w;
  }
  throw new RunError("The writer didn't answer in time. Try again in a minute.");
}

const b64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
/** A library picture as a data URL Satori can draw: a Pexels photo at 1080 wide, or the owner's upload. */
async function pictureData(admin: SupabaseClient, uid: string, src: string): Promise<string | null> {
  try {
    // only a Pexels photo or this owner's own upload, checked again here whatever the table holds
    if (!PEXELS_SRC.test(src) && !ownUpload(uid, src)) return null;
    if (PEXELS_SRC.test(src)) {
      const u = new URL(src);
      u.searchParams.set("w", "1080");
      const r = await fetch(u);
      if (!r.ok) return null;
      return `data:${r.headers.get("content-type") ?? "image/jpeg"};base64,${b64(new Uint8Array(await r.arrayBuffer()))}`;
    }
    const { data } = await admin.storage.from(BUCKET).download(src);
    return data ? `data:${data.type || "image/jpeg"};base64,${b64(new Uint8Array(await data.arrayBuffer()))}` : null;
  } catch {
    return null;
  }
}

export interface MadeRun {
  id: string;
  hook: string;
  caption: string;
  slides: { role: Role; text: string }[];
  files: string[];
}

/** Makes one run and keeps it; `kind` post also schedules it to the account's TikTok drafts at `at`. */
export async function makeRun(admin: SupabaseClient, c: CampaignRow, kind: "preview" | "post", at?: Date): Promise<MadeRun> {
  const uid = c.owner_id;
  const spec = sanitizeSpec(c.spec);
  const hook = pickHook(spec.hooks, c.last_hook);
  if (!hook) throw new RunError("Add a hook first.");
  const w = await write(spec, hook, await brandBrief(admin, uid, c.profile_id));
  const plan = runPlan(spec, hook, w);

  // each role's pictures from its library (none: the slide's plain background)
  const pics: (string | null)[] = Array(plan.length).fill(null);
  for (const role of ["hook", "content", "cta"] as const) {
    const lib = spec.images[role];
    const at = plan.flatMap((s, i) => (s.role === role ? [i] : []));
    if (!lib || !at.length) continue;
    const { data } = await admin.from("cs_library_images").select("src").eq("library_id", lib).eq("owner_id", uid).limit(300);
    const chosen = pickImages((data ?? []).map((r) => r.src as string), at.length, spec.images.per_slide);
    const loaded = await Promise.all(chosen.map((src) => pictureData(admin, uid, src)));
    at.forEach((slide, k) => (pics[slide] = loaded[k] ?? null));
  }

  const runId = crypto.randomUUID();
  // the row and its PNG paths go in first, as unfinished, so the sweep finds the files of a run that dies part way
  const files = plan.map((_, i) => `${uid}/runs/${runId}/${i + 1}.png`);
  const ins = await admin.from("cs_slide_campaign_runs").insert({ id: runId, campaign_id: c.id, owner_id: uid, kind, status: "failed", error: "Not finished.", hook, caption: w.caption, slides: plan, files });
  if (ins.error) throw new Error(`run insert: ${ins.error.message}`);
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    const png = await renderSlide({
      format: spec.format,
      photo: pics[i],
      text: s.text,
      style: spec.text_style[s.role],
      look: spec.look,
      lookStrength: spec.look_strength,
      overlay: spec.overlay,
      badge: s.role === "cta" && spec.cta.badge,
    });
    const up = await admin.storage.from(BUCKET).upload(files[i], png, { contentType: "image/png", upsert: false });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
  }
  await admin.from("cs_slide_campaign_runs").update({ status: "made", error: null }).eq("id", runId);
  await admin.from("cs_slide_campaigns").update({ last_hook: hook, updated_at: new Date().toISOString() }).eq("id", c.id);
  if (kind === "post") await schedule(admin, c, { id: runId, hook, caption: w.caption, slides: plan, files }, at!);
  return { id: runId, hook, caption: w.caption, slides: plan, files };
}

/** Sends a made run to the campaign's TikTok account as a draft at `at`, through the same code Post it for me uses. */
async function schedule(admin: SupabaseClient, c: CampaignRow, run: MadeRun, at: Date): Promise<void> {
  const fail = async (error: string) => {
    await admin.from("cs_slide_campaign_runs").update({ status: "failed", error: error.slice(0, 500) }).eq("id", run.id);
    throw new RunError(error);
  };
  const { data: map } = await admin.from("cs_social_profiles").select("zernio_profile_id").eq("owner_id", c.owner_id).eq("profile_id", c.profile_id).maybeSingle();
  if (!map?.zernio_profile_id || !c.account_id) return fail("Connect the TikTok account again on Social accounts.");
  const signed = await admin.storage.from(BUCKET).createSignedUrls(run.files, POST_LINK_SECONDS);
  const urls = (signed.data ?? []).map((s) => s.signedUrl).filter(Boolean) as string[];
  if (urls.length !== run.files.length) return fail("The slides couldn't be shared with TikTok.");
  const tz = sanitizeSchedule(c.schedule).tz;
  const input = checkSchedule({
    // one key per campaign and posting time: Zernio answers a repeat for the same slot with the same post
    clientKey: await slotKey(c.id, at),
    content: run.caption,
    mediaUrls: urls,
    scheduledFor: at.toISOString().replace(/\.\d{3}Z$/, "Z"),
    timezone: tz,
    // a draft: the person finishes and posts it in the TikTok app, where they can change who sees it
    tiktok: { privacyLevel: "PUBLIC_TO_EVERYONE", allowComment: true, allowDuet: false, allowStitch: false, mode: "inbox" },
  });
  if ("error" in input) return fail(input.error);
  const z = zernioClient(Deno.env.get("ZERNIO_API_KEY")!);
  let reply: Awaited<ReturnType<typeof runPost>>;
  try {
    reply = await runPost(z, map.zernio_profile_id, c.owner_id, { action: "schedule", profileId: c.profile_id, accountIds: [c.account_id], input: input.value });
  } catch (e) {
    console.error("slide-campaigns schedule", c.id, e);
    return fail(e instanceof Error && e.name === "NotYours" ? "That TikTok account isn't on this brand any more. Pick it again." : "TikTok couldn't take the post right now. It tries again next time.");
  }
  if (reply.status !== 200) {
    console.error("slide-campaigns zernio refused", c.id, reply.status, reply.body);
    return fail("TikTok didn't take the post. Check the account on Social accounts; it tries again next time.");
  }
  const postId = (reply.body as { post?: { id?: string } })?.post?.id ?? null;
  await admin.from("cs_slide_campaign_runs").update({ status: "scheduled", scheduled_for: at.toISOString(), zernio_post_id: postId }).eq("id", run.id);
}
