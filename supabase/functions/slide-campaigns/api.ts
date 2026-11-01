// slide-campaigns (the requests; index.ts serves them): slideshow campaigns and their image libraries (Volume's, folded in 31 Oct 2026). Deployed
// --no-verify-jwt because pg_cron calls it too:
//   * a signed-in user (Authorization: Bearer <jwt>) runs the studio's actions on their own rows;
//   * pg_cron (x-slide-campaigns-secret = SLIDE_CAMPAIGNS_SECRET) makes the runs that are due and sends each to the
//     account's TikTok drafts. Answers 202 at once and works on (EdgeRuntime.waitUntil).
// Every write is here (the tables give clients select only). Posting (start, accounts, the cron's runs) needs the
// owner on SOCIAL_CONNECT_USERS, the switch Leo turns on per customer.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { openaiChat, OPENAI_MODEL } from "../_shared/openaiChat.ts";
import { pool } from "../_shared/pool.ts";
import { PEXELS_SRC, nextRunAt, ownUpload, publishMode, sanitizePublish, sanitizeSchedule, sanitizeSpec, type Publish } from "../_shared/slideCampaign.ts";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { callerAccounts, zernioClient } from "../_shared/zernio.ts";
import { isAllowed } from "../social/logic.ts";
import { runPost } from "../social/posts.ts";
import { secretMatches } from "../social-sweep/logic.ts";
import { BUCKET, RunError, VIEW_LINK_SECONDS, makeRun, schedule, type CampaignRow, type MadeRun } from "./run.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export const MAX_CAMPAIGNS = 20;
export const MAX_LIBRARIES = 30;
export const MAX_LIBRARY_IMAGES = 300;
/** Campaigns the cron takes per tick, how many runs it makes at once, and the time after which a tick starts no new
 *  run, so it ends inside its limit. 12 a tick, 4 ticks inside the 20-minute lead: about 48 campaigns per posting time. */
const PER_TICK = 12;
const AT_ONCE = 6;
const TICK_BUDGET_MS = 90_000;
/** How long example runs and posted runs (with their PNGs) are kept; posted ones outlive Zernio's 7-day links. */
const KEEP_PREVIEW_MS = 7 * 24 * 3600_000;
const KEEP_POST_MS = 14 * 24 * 3600_000;
const SWEEP_PER_TICK = 40;
/** A few of the sweep's deletions on a studio request too, since the cron only calls in while a live campaign is due. */
const sweepSome = (admin: SupabaseClient, now: Date) => sweep(admin, now, 3, 5).catch((e) => console.error("slide-campaigns sweep", e));
/** Send to phone: a link that opens the slides on a phone for a day. The token is the only key to them. */
const PHONE_MS = 24 * 3600_000;
const PHONE_MAX = 20;
const PHONE_TOKEN = /^[0-9a-z]{6,12}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const phoneMade = (token: string) => parseInt(token.split("-")[0], 36);
/** A run is made this long before its posting time and handed to Zernio for the time itself. */
const LEAD_MS = 20 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE = /^[A-Za-z0-9_-]{1,40}$/;
const posting = (uid: string) => !!Deno.env.get("ZERNIO_API_KEY") && isAllowed(Deno.env.get("SOCIAL_CONNECT_USERS"), uid);
const signed = async (admin: SupabaseClient, paths: string[]) =>
  paths.length ? ((await admin.storage.from(BUCKET).createSignedUrls(paths, VIEW_LINK_SECONDS)).data ?? []).map((s) => s.signedUrl ?? null) : [];

/** The campaign's posts already handed to Zernio for a later time, taken back off it, so a pause, a delete or a change
 *  of account or consent stops them. Null when every one is stopped, else the error to answer: a post Zernio didn't
 *  let go keeps its run and files, so trying again can still stop it. */
async function stopHandedPosts(admin: SupabaseClient, c: CampaignRow, why: string): Promise<string | null> {
  const { data } = await admin.from("cs_slide_campaign_runs").select("id, zernio_post_id").eq("campaign_id", c.id).eq("status", "scheduled").gt("scheduled_for", new Date().toISOString());
  const handed = (data ?? []).filter((r) => r.zernio_post_id);
  if (!handed.length) return null;
  const { data: map } = await admin.from("cs_social_profiles").select("zernio_profile_id").eq("owner_id", c.owner_id).eq("profile_id", c.profile_id).maybeSingle();
  const z = zernioClient(Deno.env.get("ZERNIO_API_KEY") ?? "");
  for (const r of handed) {
    const reply = await runPost(z, map?.zernio_profile_id ?? null, c.owner_id, { action: "cancel", profileId: c.profile_id, postId: r.zernio_post_id }).catch((e) => (console.error("slide-campaigns cancel", c.id, e), null));
    if (reply?.status !== 200) {
      if (reply) console.error("slide-campaigns cancel refused", c.id, reply.status, reply.body);
      return "A post already sent to TikTok for later couldn't be stopped. Try again in a minute.";
    }
    await admin.from("cs_slide_campaign_runs").update({ status: "failed", error: why }).eq("id", r.id);
  }
  return null;
}

async function own<T>(admin: SupabaseClient, table: string, id: unknown, uid: string, cols = "*"): Promise<T | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await admin.from(table).select(cols).eq("id", id).eq("owner_id", uid).maybeSingle();
  return (data as T) ?? null;
}

export async function userAction(admin: SupabaseClient, uid: string, b: Record<string, unknown>): Promise<Response> {
  const now = new Date();
  // campaigns post to TikTok, so building one is for owners with posting switched on; anyone keeps reading, pausing
  // and deleting what they have
  if (!posting(uid) && !["runs", "pause", "delete", "library-delete", "library-remove", "library-urls", "thumbs", "libraries", "phone-create"].includes(String(b.action))) {
    return json({ code: "not_enabled", error: "Posting isn't switched on for your account yet." }, 403);
  }
  switch (b.action) {
    case "save": {
      const c = (b.campaign ?? {}) as Record<string, unknown>;
      const profile = typeof c.profile_id === "string" && PROFILE.test(c.profile_id) ? c.profile_id : null;
      const was = c.id ? await own<CampaignRow>(admin, "cs_slide_campaigns", c.id, uid) : null;
      if (c.id && !was) return json({ error: "Not found." }, 404);
      const row: Record<string, unknown> = {
        name: (typeof c.name === "string" && c.name.trim().slice(0, 120)) || "Untitled campaign",
        spec: sanitizeSpec(c.spec),
        schedule: sanitizeSchedule(c.schedule),
        publish: sanitizePublish(c.publish, was?.publish, now),
        updated_at: now.toISOString(),
      };
      if (was) {
        // straight to the profile turned off, or the mode changed: what Zernio holds for later was sent the old way
        const pub = row.publish as Publish;
        if (publishMode(was.publish) !== pub.mode || ((was.publish as Partial<Publish> | null)?.consent_at && !pub.consent_at)) {
          const stuck = await stopHandedPosts(admin, was, "Cancelled: the campaign's posting settings changed.");
          if (stuck) return json({ error: stuck }, 502);
        }
        // a live campaign moves its next posting time with its schedule
        if (was.status === "live") row.next_run_at = nextRunAt(row.schedule as ReturnType<typeof sanitizeSchedule>, new Date(now.getTime() + LEAD_MS))?.toISOString() ?? null;
        if (was.status === "live" && !row.next_run_at) row.status = "paused";
        const { data, error } = await admin.from("cs_slide_campaigns").update(row).eq("id", was.id).select().single();
        if (error) throw error;
        return json({ campaign: data });
      }
      if (!profile) return json({ error: "Open a brand first." }, 400);
      const { count } = await admin.from("cs_slide_campaigns").select("id", { count: "exact", head: true }).eq("owner_id", uid);
      if ((count ?? 0) >= MAX_CAMPAIGNS) return json({ error: `You can keep up to ${MAX_CAMPAIGNS} campaigns. Delete one to make another.` }, 400);
      const { data, error } = await admin.from("cs_slide_campaigns").insert({ ...row, owner_id: uid, profile_id: profile }).select().single();
      if (error) throw error;
      return json({ campaign: data });
    }
    case "delete": {
      const c = await own<CampaignRow>(admin, "cs_slide_campaigns", b.id, uid);
      if (!c) return json({ error: "Not found." }, 404);
      // first: deleting the runs loses the posts' ids, and their files are what Zernio would post
      const stuck = await stopHandedPosts(admin, c, "Cancelled: the campaign was deleted.");
      if (stuck) return json({ error: stuck }, 502);
      const { data: runs } = await admin.from("cs_slide_campaign_runs").select("files").eq("campaign_id", c.id);
      const files = (runs ?? []).flatMap((r) => r.files as string[]);
      if (files.length) await admin.storage.from(BUCKET).remove(files);
      await admin.from("cs_slide_campaigns").delete().eq("id", c.id);
      return json({ deleted: true });
    }
    case "accounts": {
      if (!posting(uid)) return json({ code: "not_enabled", accounts: [] });
      const profile = typeof b.profile_id === "string" && PROFILE.test(b.profile_id) ? b.profile_id : "";
      const { data: map } = await admin.from("cs_social_profiles").select("zernio_profile_id").eq("owner_id", uid).eq("profile_id", profile).maybeSingle();
      if (!map?.zernio_profile_id) return json({ accounts: [] });
      const list = await callerAccounts(zernioClient(Deno.env.get("ZERNIO_API_KEY")!), map.zernio_profile_id);
      return json({ accounts: list.filter((a) => a.platform === "tiktok" && a.enabled !== false).map((a) => ({ id: a._id, name: a.username || a.displayName || "TikTok", needsReconnection: !!a.needsReconnection })) });
    }
    case "account": {
      // the account a campaign posts to, checked against the owner's own Zernio profile
      const c = await own<CampaignRow>(admin, "cs_slide_campaigns", b.id, uid);
      if (!c) return json({ error: "Not found." }, 404);
      // a post Zernio holds for later would still go out from the old account
      const why = "Cancelled: the campaign's TikTok account changed.";
      if (b.account_id === null) {
        const stuck = await stopHandedPosts(admin, c, why);
        if (stuck) return json({ error: stuck }, 502);
        await admin.from("cs_slide_campaigns").update({ account_id: null, account_name: null, status: c.status === "live" ? "paused" : c.status }).eq("id", c.id);
        return json({ ok: true });
      }
      if (!posting(uid)) return json({ code: "not_enabled", error: "Posting isn't switched on for your account yet." }, 403);
      const { data: map } = await admin.from("cs_social_profiles").select("zernio_profile_id").eq("owner_id", uid).eq("profile_id", c.profile_id).maybeSingle();
      const list = map?.zernio_profile_id ? await callerAccounts(zernioClient(Deno.env.get("ZERNIO_API_KEY")!), map.zernio_profile_id) : [];
      const acct = list.find((a) => a._id === b.account_id && a.platform === "tiktok");
      if (!acct) return json({ error: "Connect that TikTok account on Social accounts first." }, 400);
      const stuck = acct._id !== c.account_id ? await stopHandedPosts(admin, c, why) : null;
      if (stuck) return json({ error: stuck }, 502);
      await admin.from("cs_slide_campaigns").update({ account_id: acct._id, account_name: (acct.username || acct.displayName || "TikTok").slice(0, 120) }).eq("id", c.id);
      return json({ ok: true });
    }
    case "start":
    case "pause": {
      const c = await own<CampaignRow>(admin, "cs_slide_campaigns", b.id, uid);
      if (!c) return json({ error: "Not found." }, 404);
      if (b.action === "pause") {
        await admin.from("cs_slide_campaigns").update({ status: "paused", next_run_at: null }).eq("id", c.id);
        const stuck = await stopHandedPosts(admin, c, "Cancelled: the campaign was paused.");
        if (stuck) return json({ error: stuck }, 502);
        return json({ status: "paused" });
      }
      if (!posting(uid)) return json({ code: "not_enabled", error: "Posting isn't switched on for your account yet." }, 403);
      const spec = sanitizeSpec(c.spec);
      if (!spec.hooks.length) return json({ error: "Add a hook first." }, 400);
      if (!c.account_id) return json({ error: "Pick the TikTok account it posts to." }, 400);
      const next = nextRunAt(sanitizeSchedule(c.schedule), new Date(now.getTime() + LEAD_MS));
      if (!next) return json({ error: "Add a posting time first." }, 400);
      await admin.from("cs_slide_campaigns").update({ status: "live", next_run_at: next.toISOString(), last_error: null }).eq("id", c.id);
      return json({ status: "live", next_run_at: next.toISOString() });
    }
    case "preview": {
      const c = await own<CampaignRow>(admin, "cs_slide_campaigns", b.id, uid);
      if (!c) return json({ error: "Not found." }, 404);
      const usage = await consumeUsage(admin, uid, "slide-campaign-make");
      if (!usage.allowed) {
        const r = usageRefusal(usage);
        return json(r.body, r.status);
      }
      const run = await makeRun(admin, c, "preview");
      await sweepSome(admin, now);
      return json({ run: { ...run, urls: await signed(admin, run.files) } });
    }
    case "send": {
      // Send to TikTok now: an example run goes to the account as it is, with the caption as edited
      const c = await own<CampaignRow>(admin, "cs_slide_campaigns", b.id, uid);
      if (!c) return json({ error: "Not found." }, 404);
      if (!c.account_id) return json({ error: "Pick the TikTok account it posts to." }, 400);
      const r = await own<{ id: string; campaign_id: string; status: string; hook: string; caption: string; slides: MadeRun["slides"]; files: string[] }>(admin, "cs_slide_campaign_runs", b.run_id, uid);
      if (!r || r.campaign_id !== c.id) return json({ error: "Not found." }, 404);
      if (r.status !== "made") return json({ error: r.status === "scheduled" ? "That one's already sent." : "Generate a new example first." }, 400);
      const usage = await consumeUsage(admin, uid, "slide-campaign-post");
      if (!usage.allowed) {
        const x = usageRefusal(usage);
        return json(x.body, x.status);
      }
      const caption = typeof b.caption === "string" && b.caption.trim() ? b.caption.trim().slice(0, 2200) : r.caption;
      const review = await schedule(admin, c, { id: r.id, hook: r.hook, caption, slides: r.slides, files: r.files }, null);
      if (review) await admin.from("cs_slide_campaigns").update({ last_error: review }).eq("id", c.id);
      return json({ sent: true, ...(review ? { review } : {}) });
    }
    case "optimize": {
      // Optimize prompt: the topic rewritten as a sharper brief for the writer. Counted with the examples.
      const topic = typeof b.topic === "string" ? b.topic.trim().slice(0, 1200) : "";
      if (!topic) return json({ error: "Write what the posts are about first." }, 400);
      const usage = await consumeUsage(admin, uid, "slide-campaign-make");
      if (!usage.allowed) {
        const x = usageRefusal(usage);
        return json(x.body, x.status);
      }
      const res = await openaiChat({
        model: OPENAI_MODEL,
        max_tokens: 400,
        messages: [
          { role: "system", content: "Rewrite the user's note into a brief for a writer of TikTok photo slideshows: who it is for, the angle, and what each slide should give the reader, with numbers wherever they help. Keep the user's meaning and facts; add none. Under 90 words, plain sentences, no bullet points. Answer with the brief only." },
          { role: "user", content: topic },
        ],
      });
      const j = res.ok ? await res.json().catch(() => null) : null;
      const out = typeof j?.choices?.[0]?.message?.content === "string" ? j.choices[0].message.content.trim().slice(0, 1200) : "";
      if (!out) return json({ error: "Couldn't rewrite it right now. Try again in a minute." }, 502);
      return json({ topic: out });
    }
    case "thumbs": {
      // each campaign's newest made post, first slide, for the list
      const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).slice(0, MAX_CAMPAIGNS);
      if (!ids.length) return json({ thumbs: {} });
      const { data } = await admin.from("cs_slide_campaign_runs").select("campaign_id, files").eq("owner_id", uid).in("campaign_id", ids).in("status", ["made", "scheduled"]).order("created_at", { ascending: false }).limit(200);
      const first = new Map<string, string>();
      for (const r of data ?? []) if (!first.has(r.campaign_id) && (r.files as string[])[0]) first.set(r.campaign_id, (r.files as string[])[0]);
      const links = await signed(admin, [...first.values()]);
      return json({ thumbs: Object.fromEntries([...first.keys()].map((k, i) => [k, links[i]])) });
    }
    case "libraries": {
      // the Libraries page: each library with its count, up to 4 pictures, where they came from and who uses it
      const profile = typeof b.profile_id === "string" && PROFILE.test(b.profile_id) ? b.profile_id : "";
      const [{ data: libs }, { data: camps }] = await Promise.all([
        admin.from("cs_image_libraries").select("id, name, updated_at").eq("owner_id", uid).eq("profile_id", profile).order("name"),
        admin.from("cs_slide_campaigns").select("name, spec").eq("owner_id", uid).eq("profile_id", profile),
      ]);
      const out = await Promise.all(
        (libs ?? []).map(async (l) => {
          // a library holds at most 300, under the API's 1,000-row page
          const { data: imgs } = await admin.from("cs_library_images").select("src").eq("library_id", l.id).order("created_at").limit(MAX_LIBRARY_IMAGES);
          const mine = (imgs ?? []).map((i) => i.src as string);
          const shown = mine.slice(0, 4);
          const ups = shown.filter((src) => ownUpload(uid, src));
          const links = await signed(admin, ups);
          const usedBy = (camps ?? []).filter((c) => Object.values((c.spec as { images?: Record<string, unknown> })?.images ?? {}).includes(l.id)).map((c) => c.name as string);
          return {
            ...l,
            count: mine.length,
            stock: mine.filter((src) => src.startsWith("https://")).length,
            uploads: mine.filter((src) => ownUpload(uid, src)).length,
            previews: shown.map((src) => (src.startsWith("https://") ? src : (links[ups.indexOf(src)] ?? null))),
            used_by: usedBy,
          };
        }),
      );
      return json({ libraries: out });
    }
    case "phone-create": {
      // Send to phone: links to put up to 20 slides where the phone page reads them for the next day
      const n = typeof b.count === "number" ? Math.floor(b.count) : 0;
      if (n < 1 || n > PHONE_MAX) return json({ error: `Send 1 to ${PHONE_MAX} slides.` }, 400);
      const usage = await consumeUsage(admin, uid, "slide-phone");
      if (!usage.allowed) {
        const x = usageRefusal(usage);
        return json(x.body, x.status);
      }
      const token = `${now.getTime().toString(36)}-${crypto.randomUUID()}`;
      const uploads = await Promise.all(
        Array.from({ length: n }, async (_, i) => {
          const path = `phone/${token}/${i + 1}.png`;
          const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
          if (error || !data) throw error ?? new Error("no upload link");
          return { path, token: data.token };
        }),
      );
      await sweepSome(admin, now);
      return json({ token, uploads, expires_at: new Date(now.getTime() + PHONE_MS).toISOString() });
    }
    case "runs": {
      const c = await own<CampaignRow>(admin, "cs_slide_campaigns", b.id, uid, "id");
      if (!c) return json({ error: "Not found." }, 404);
      const { data } = await admin.from("cs_slide_campaign_runs").select("id, kind, status, hook, caption, slides, files, scheduled_for, error, created_at").eq("campaign_id", c.id).order("created_at", { ascending: false }).limit(12);
      const runs = await Promise.all((data ?? []).map(async (r) => ({ ...r, urls: await signed(admin, r.files as string[]) })));
      return json({ runs });
    }
    // ---- libraries ----
    case "library-save": {
      const name = typeof b.name === "string" ? b.name.trim().slice(0, 80) : "";
      if (!name) return json({ error: "Name the library." }, 400);
      if (b.id) {
        const lib = await own<{ id: string }>(admin, "cs_image_libraries", b.id, uid, "id");
        if (!lib) return json({ error: "Not found." }, 404);
        const { data, error } = await admin.from("cs_image_libraries").update({ name, updated_at: now.toISOString() }).eq("id", lib.id).select().single();
        if (error) throw error;
        return json({ library: data });
      }
      const profile = typeof b.profile_id === "string" && PROFILE.test(b.profile_id) ? b.profile_id : null;
      if (!profile) return json({ error: "Open a brand first." }, 400);
      const { count } = await admin.from("cs_image_libraries").select("id", { count: "exact", head: true }).eq("owner_id", uid);
      if ((count ?? 0) >= MAX_LIBRARIES) return json({ error: `You can keep up to ${MAX_LIBRARIES} libraries.` }, 400);
      const { data, error } = await admin.from("cs_image_libraries").insert({ owner_id: uid, profile_id: profile, name }).select().single();
      if (error) throw error;
      return json({ library: data });
    }
    case "library-delete": {
      const lib = await own<{ id: string }>(admin, "cs_image_libraries", b.id, uid, "id");
      if (!lib) return json({ error: "Not found." }, 404);
      const { data: imgs } = await admin.from("cs_library_images").select("src").eq("library_id", lib.id);
      const uploads = (imgs ?? []).map((i) => i.src as string).filter((src) => ownUpload(uid, src));
      if (uploads.length) await admin.storage.from(BUCKET).remove(uploads);
      await admin.from("cs_image_libraries").delete().eq("id", lib.id);
      return json({ deleted: true });
    }
    case "library-add": {
      const lib = await own<{ id: string }>(admin, "cs_image_libraries", b.library_id, uid, "id");
      if (!lib) return json({ error: "Not found." }, 404);
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 60) as { src?: unknown; credit?: unknown }[];
      const { count } = await admin.from("cs_library_images").select("id", { count: "exact", head: true }).eq("library_id", lib.id);
      if ((count ?? 0) + items.length > MAX_LIBRARY_IMAGES) return json({ error: `A library holds up to ${MAX_LIBRARY_IMAGES} pictures.` }, 400);
      // stock photos only: an upload gets its row from upload-url
      const rows = items
        .filter((it) => typeof it.src === "string" && PEXELS_SRC.test(it.src))
        .map((it) => {
          const cr = it.credit && typeof it.credit === "object" ? (it.credit as { by?: unknown; url?: unknown }) : null;
          const url = typeof cr?.url === "string" && /^https:\/\/[^\s]{1,290}$/.test(cr.url) ? cr.url : "";
          return { library_id: lib.id, owner_id: uid, src: (it.src as string).slice(0, 500), credit: cr ? { by: String(cr.by ?? "").slice(0, 80), url } : null };
        });
      if (!rows.length) return json({ error: "Pick a picture to add." }, 400);
      const { error } = await admin.from("cs_library_images").upsert(rows, { onConflict: "library_id,src", ignoreDuplicates: true });
      if (error) throw error;
      return json({ added: rows.length });
    }
    case "library-remove": {
      const img = await own<{ id: string; src: string }>(admin, "cs_library_images", b.id, uid, "id, src");
      if (!img) return json({ error: "Not found." }, 404);
      if (ownUpload(uid, img.src)) await admin.storage.from(BUCKET).remove([img.src]);
      await admin.from("cs_library_images").delete().eq("id", img.id);
      return json({ deleted: true });
    }
    case "upload-url": {
      // a signed link to put one picture in a library; its row is written first, so no file is ever without one
      const lib = await own<{ id: string }>(admin, "cs_image_libraries", b.library_id, uid, "id");
      if (!lib) return json({ error: "Not found." }, 404);
      const { count } = await admin.from("cs_library_images").select("id", { count: "exact", head: true }).eq("library_id", lib.id);
      if ((count ?? 0) >= MAX_LIBRARY_IMAGES) return json({ error: `A library holds up to ${MAX_LIBRARY_IMAGES} pictures.` }, 400);
      // JPEG or PNG only: the drawer (resvg) can't draw WebP
      const ext = b.ext === "png" ? "png" : b.ext === undefined || b.ext === "jpg" ? "jpg" : null;
      if (!ext) return json({ error: "Add a JPG or PNG picture." }, 400);
      const path = `${uid}/lib/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("no upload link");
      const ins = await admin.from("cs_library_images").insert({ library_id: lib.id, owner_id: uid, src: path }).select("id").single();
      if (ins.error) throw ins.error;
      return json({ path, token: data.token, id: ins.data.id });
    }
    case "library-urls": {
      // links to show a library's uploads (stock photos show from Pexels)
      const lib = await own<{ id: string }>(admin, "cs_image_libraries", b.library_id, uid, "id");
      if (!lib) return json({ error: "Not found." }, 404);
      const { data } = await admin.from("cs_library_images").select("id, src").eq("library_id", lib.id).order("created_at");
      const imgs = data ?? [];
      const ups = imgs.filter((i) => ownUpload(uid, i.src));
      const links = await signed(admin, ups.map((i) => i.src));
      const byPath = new Map(ups.map((i, k) => [i.src, links[k]]));
      return json({ images: imgs.map((i) => ({ id: i.id, src: i.src, url: i.src.startsWith("https://") ? i.src : (byPath.get(i.src) ?? null) })) });
    }
  }
  return json({ error: "Unknown action." }, 400);
}

/** The cron's tick: make the due runs, hand each to Zernio for its time, and move the campaign to its next time. */
export async function tick(admin: SupabaseClient): Promise<{ made: number; failed: number }> {
  const now = new Date();
  const { data } = await admin.from("cs_slide_campaigns").select("*").eq("status", "live").lte("next_run_at", new Date(now.getTime() + LEAD_MS).toISOString()).order("next_run_at").limit(PER_TICK);
  let made = 0;
  let failed = 0;
  await pool((data ?? []) as CampaignRow[], AT_ONCE, async (c) => {
    const at = new Date(c.next_run_at!);
    const next = nextRunAt(sanitizeSchedule(c.schedule), new Date(Math.max(at.getTime(), now.getTime())))?.toISOString() ?? null;
    if (Date.now() - now.getTime() > TICK_BUDGET_MS) return;
    // claim the slot first: a second tick that read the same row finds next_run_at moved and leaves it
    const { data: claimed } = await admin
      .from("cs_slide_campaigns")
      .update({ next_run_at: next, ...(next ? {} : { status: "paused" }) })
      .eq("id", c.id)
      .eq("status", "live")
      .eq("next_run_at", c.next_run_at)
      .select("id");
    if (!claimed?.length) return;
    // a slot already passed (the tick was late) is skipped rather than posted at the wrong time
    const due = at.getTime() > now.getTime() + 60_000;
    let error: string | null = null;
    let review: string | null = null;
    if (!posting(c.owner_id)) error = "Posting was switched off for this account.";
    else if (due) {
      const usage = await consumeUsage(admin, c.owner_id, "slide-campaign-post");
      if (!usage.allowed) error = "Today's campaign posts are used up. It posts again tomorrow.";
      else
        try {
          review = (await makeRun(admin, c, "post", at)).review ?? null;
          made++;
        } catch (e) {
          error = e instanceof RunError ? e.message : "Something went wrong making the post. It tries again next time.";
          if (!(e instanceof RunError)) console.error("slide-campaigns tick", c.id, e);
        }
    } else error = "Missed a posting time. It posts at the next one.";
    if (error) failed++;
    await admin
      .from("cs_slide_campaigns")
      .update({ ...(due ? { last_run_at: now.toISOString() } : {}), last_error: error ?? review, ...(posting(c.owner_id) ? {} : { status: "paused", next_run_at: null }) })
      .eq("id", c.id);
  });
  await sweep(admin, now);
  return { made, failed };
}

/** The phone page's slides: links for an hour while the token is under a day old. Anyone with the token may read. */
export async function phoneSlides(admin: SupabaseClient, token: unknown, now = new Date()): Promise<Response> {
  if (typeof token !== "string" || !PHONE_TOKEN.test(token)) return json({ error: "That link isn't right." }, 404);
  const made = phoneMade(token);
  if (!(made <= now.getTime()) || now.getTime() - made > PHONE_MS) return json({ error: "That link has run out. Send it to your phone again." }, 410);
  const { data } = await admin.storage.from(BUCKET).list(`phone/${token}`, { limit: PHONE_MAX + 5 });
  const names = (data ?? []).map((f) => f.name).filter((nm) => /^\d{1,2}\.png$/.test(nm)).sort((a, b) => parseInt(a) - parseInt(b));
  if (!names.length) return json({ error: "That link isn't right." }, 404);
  const urls = await signed(admin, names.map((nm) => `phone/${token}/${nm}`));
  return json({ urls, expires_at: new Date(made + PHONE_MS).toISOString() });
}

/** Deletes example runs older than a week and posted runs older than two, with their PNGs, a few at a time; and
 *  Send to phone folders over a day old. */
async function sweep(admin: SupabaseClient, now: Date, phonesMax = 10, runsMax = SWEEP_PER_TICK): Promise<void> {
  const { data: phones } = await admin.storage.from(BUCKET).list("phone", { limit: 100 });
  for (const f of (phones ?? []).filter((x) => PHONE_TOKEN.test(x.name) && now.getTime() - phoneMade(x.name) > PHONE_MS).slice(0, phonesMax)) {
    const { data: files } = await admin.storage.from(BUCKET).list(`phone/${f.name}`, { limit: PHONE_MAX + 5 });
    const paths = (files ?? []).map((x) => `phone/${f.name}/${x.name}`);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
  }
  for (const [kind, keep] of [["preview", KEEP_PREVIEW_MS], ["post", KEEP_POST_MS]] as const) {
    const { data } = await admin.from("cs_slide_campaign_runs").select("id, files").eq("kind", kind).lte("created_at", new Date(now.getTime() - keep).toISOString()).limit(runsMax);
    const old = data ?? [];
    if (!old.length) continue;
    const files = old.flatMap((r) => r.files as string[]);
    if (files.length) await admin.storage.from(BUCKET).remove(files);
    for (const r of old) await admin.from("cs_slide_campaign_runs").delete().eq("id", r.id);
  }
}

/** The whole request: the cron with its secret, else a signed-in user. */
export async function handle(req: Request, admin: SupabaseClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } })): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const secret = req.headers.get("x-slide-campaigns-secret");
  if (secret !== null) {
    const expected = Deno.env.get("SLIDE_CAMPAIGNS_SECRET");
    if (!expected || !(await secretMatches(secret, expected))) return json({ error: "Forbidden." }, 403);
    const work = tick(admin).then((r) => console.log("slide-campaigns tick", r)).catch((e) => console.error("slide-campaigns tick failed", e));
    (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work);
    return json({ accepted: true }, 202);
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // the phone page is opened from a QR code on a phone that isn't signed in: the token is the key
  if (body.action === "phone-get") return await phoneSlides(admin, body.token).catch((e) => (console.error("slide-campaigns phone", e), json({ error: "Something went wrong. Try again." }, 500)));
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Sign in again." }, 401);
  // every studio write counts against one generous cap, so a stuck loop can't hammer the tables
  const usage = await consumeUsage(admin, uid, "slide-campaign-write");
  if (!usage.allowed) {
    const r = usageRefusal(usage);
    return json(r.body, r.status);
  }
  try {
    return await userAction(admin, uid, body);
  } catch (e) {
    if (e instanceof RunError) return json({ error: e.message }, 400);
    console.error("slide-campaigns", body.action, e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
}
