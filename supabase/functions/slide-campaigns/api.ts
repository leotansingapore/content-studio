// slide-campaigns (the requests; index.ts serves them): slideshow campaigns and their image libraries (Volume's, folded in 31 Oct 2026). Deployed
// --no-verify-jwt because pg_cron calls it too:
//   * a signed-in user (Authorization: Bearer <jwt>) runs the studio's actions on their own rows;
//   * pg_cron (x-slide-campaigns-secret = SLIDE_CAMPAIGNS_SECRET) makes the runs that are due and sends each to the
//     account's TikTok drafts. Answers 202 at once and works on (EdgeRuntime.waitUntil).
// Every write is here (the tables give clients select only). Posting (start, accounts, the cron's runs) needs the
// owner on SOCIAL_CONNECT_USERS, the switch Leo turns on per customer.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { nextRunAt, sanitizePublish, sanitizeSchedule, sanitizeSpec } from "../_shared/slideCampaign.ts";
import { consumeUsage, usageRefusal } from "../_shared/usageCaps.ts";
import { callerAccounts, zernioClient } from "../_shared/zernio.ts";
import { isAllowed } from "../social/logic.ts";
import { secretMatches } from "../social-sweep/logic.ts";
import { BUCKET, RunError, VIEW_LINK_SECONDS, makeRun, type CampaignRow } from "./run.ts";

const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

export const MAX_CAMPAIGNS = 20;
export const MAX_LIBRARIES = 30;
export const MAX_LIBRARY_IMAGES = 300;
/** Runs the cron takes per tick, so one tick stays inside the function's time. */
const PER_TICK = 4;
/** A run is made this long before its posting time and handed to Zernio for the time itself. */
const LEAD_MS = 20 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE = /^[A-Za-z0-9_-]{1,40}$/;
const posting = (uid: string) => !!Deno.env.get("ZERNIO_API_KEY") && isAllowed(Deno.env.get("SOCIAL_CONNECT_USERS"), uid);
const signed = async (admin: SupabaseClient, paths: string[]) =>
  paths.length ? ((await admin.storage.from(BUCKET).createSignedUrls(paths, VIEW_LINK_SECONDS)).data ?? []).map((s) => s.signedUrl ?? null) : [];

async function own<T>(admin: SupabaseClient, table: string, id: unknown, uid: string, cols = "*"): Promise<T | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null;
  const { data } = await admin.from(table).select(cols).eq("id", id).eq("owner_id", uid).maybeSingle();
  return (data as T) ?? null;
}

export async function userAction(admin: SupabaseClient, uid: string, b: Record<string, unknown>): Promise<Response> {
  const now = new Date();
  switch (b.action) {
    case "save": {
      const c = (b.campaign ?? {}) as Record<string, unknown>;
      const profile = typeof c.profile_id === "string" && PROFILE.test(c.profile_id) ? c.profile_id : null;
      const row: Record<string, unknown> = {
        name: (typeof c.name === "string" && c.name.trim().slice(0, 120)) || "Untitled campaign",
        spec: sanitizeSpec(c.spec),
        schedule: sanitizeSchedule(c.schedule),
        publish: { ...sanitizePublish(c.publish), mode: "inbox" },
        updated_at: now.toISOString(),
      };
      if (c.id) {
        const was = await own<CampaignRow>(admin, "cs_slide_campaigns", c.id, uid);
        if (!was) return json({ error: "Not found." }, 404);
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
      if (b.account_id === null) {
        await admin.from("cs_slide_campaigns").update({ account_id: null, account_name: null, status: c.status === "live" ? "paused" : c.status }).eq("id", c.id);
        return json({ ok: true });
      }
      if (!posting(uid)) return json({ code: "not_enabled", error: "Posting isn't switched on for your account yet." }, 403);
      const { data: map } = await admin.from("cs_social_profiles").select("zernio_profile_id").eq("owner_id", uid).eq("profile_id", c.profile_id).maybeSingle();
      const list = map?.zernio_profile_id ? await callerAccounts(zernioClient(Deno.env.get("ZERNIO_API_KEY")!), map.zernio_profile_id) : [];
      const acct = list.find((a) => a._id === b.account_id && a.platform === "tiktok");
      if (!acct) return json({ error: "Connect that TikTok account on Social accounts first." }, 400);
      await admin.from("cs_slide_campaigns").update({ account_id: acct._id, account_name: (acct.username || acct.displayName || "TikTok").slice(0, 120) }).eq("id", c.id);
      return json({ ok: true });
    }
    case "start":
    case "pause": {
      const c = await own<CampaignRow>(admin, "cs_slide_campaigns", b.id, uid);
      if (!c) return json({ error: "Not found." }, 404);
      if (b.action === "pause") {
        await admin.from("cs_slide_campaigns").update({ status: "paused", next_run_at: null }).eq("id", c.id);
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
      return json({ run: { ...run, urls: await signed(admin, run.files) } });
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
      const uploads = (imgs ?? []).map((i) => i.src as string).filter((s) => s.startsWith(`${uid}/lib/`));
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
      const rows = items
        .filter((it) => typeof it.src === "string" && (/^https:\/\/images\.pexels\.com\/[A-Za-z0-9/._?=&%-]+$/.test(it.src) || (it.src as string).startsWith(`${uid}/lib/`)))
        .map((it) => ({
          library_id: lib.id,
          owner_id: uid,
          src: (it.src as string).slice(0, 500),
          credit: it.credit && typeof it.credit === "object" ? { by: String((it.credit as { by?: unknown }).by ?? "").slice(0, 80), url: String((it.credit as { url?: unknown }).url ?? "").slice(0, 300) } : null,
        }));
      if (!rows.length) return json({ error: "Pick a picture to add." }, 400);
      const { error } = await admin.from("cs_library_images").upsert(rows, { onConflict: "library_id,src", ignoreDuplicates: true });
      if (error) throw error;
      return json({ added: rows.length });
    }
    case "library-remove": {
      const img = await own<{ id: string; src: string }>(admin, "cs_library_images", b.id, uid, "id, src");
      if (!img) return json({ error: "Not found." }, 404);
      if (img.src.startsWith(`${uid}/lib/`)) await admin.storage.from(BUCKET).remove([img.src]);
      await admin.from("cs_library_images").delete().eq("id", img.id);
      return json({ deleted: true });
    }
    case "upload-url": {
      // a signed link to put one picture in the owner's library folder; library-add files it afterwards
      const ext = b.ext === "png" || b.ext === "webp" ? b.ext : "jpg";
      const path = `${uid}/lib/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
      if (error || !data) throw error ?? new Error("no upload link");
      return json({ path, token: data.token, signedUrl: data.signedUrl });
    }
    case "library-urls": {
      // links to show a library's uploads (stock photos show from Pexels)
      const lib = await own<{ id: string }>(admin, "cs_image_libraries", b.library_id, uid, "id");
      if (!lib) return json({ error: "Not found." }, 404);
      const { data } = await admin.from("cs_library_images").select("id, src").eq("library_id", lib.id).order("created_at");
      const imgs = data ?? [];
      const ups = imgs.filter((i) => !i.src.startsWith("https://"));
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
  for (const c of (data ?? []) as CampaignRow[]) {
    const at = new Date(c.next_run_at!);
    // a slot already passed (the tick was late): skip to the next one rather than post at the wrong time
    const due = at.getTime() > now.getTime() + 60_000;
    const next = nextRunAt(sanitizeSchedule(c.schedule), new Date(Math.max(at.getTime(), now.getTime())))?.toISOString() ?? null;
    let error: string | null = null;
    if (!posting(c.owner_id)) error = "Posting was switched off for this account.";
    else if (due) {
      const usage = await consumeUsage(admin, c.owner_id, "slide-campaign-post");
      if (!usage.allowed) error = "Today's campaign posts are used up. It posts again tomorrow.";
      else
        try {
          await makeRun(admin, c, "post", at);
          made++;
        } catch (e) {
          error = e instanceof RunError ? e.message : "Something went wrong making the post. It tries again next time.";
          if (!(e instanceof RunError)) console.error("slide-campaigns tick", c.id, e);
        }
    }
    if (error) failed++;
    await admin
      .from("cs_slide_campaigns")
      .update({ next_run_at: next, last_run_at: due ? now.toISOString() : c.next_run_at, last_error: error, ...(next && posting(c.owner_id) ? {} : { status: "paused", next_run_at: null }) })
      .eq("id", c.id);
  }
  return { made, failed };
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

  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: "Sign in again." }, 401);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
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
