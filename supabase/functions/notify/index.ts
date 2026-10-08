// Phone alerts and the Monday results email (supabase/hub/016_notify.sql).
// pg_cron calls this every hour with a shared secret. Each call takes one page
// of advisers who switched something on in My Playbook, sends what is due
// (logic.ts decides what and words it), and hands the next page to a fresh call
// of itself, so no single request carries much CPU.
//
// Body, all optional:
//   dryRun: true     send and record nothing; return what would go out
//   only: <user id>  just this adviser
//   testTo: address  send the email here instead of the adviser's sign-in
//                    address; only delivered@resend.dev or spleotan@gmail.com,
//                    and only with `only`
//   now: ISO time    pretend it is this time (with dryRun or testTo only)
//   after: <user id> the page cursor; the function sets it for itself
//
// Every item is claimed in cs_notify_sent BEFORE it is sent, so overlapping
// runs never send twice; a failed email gives its claim back to retry next
// hour, a failed push does not (an alert an hour late is noise).
//
// Secrets: NOTIFY_CRON_SECRET (the same value is in Vault as
// cs_notify_cron_secret), VAPID_KEYS (JSON {publicKey, privateKey} JWKs),
// RESEND_API_KEY. Deploy with --no-verify-jwt: the secret header is the auth.
//   supabase functions deploy notify --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt

// pinned: this runs with the service key
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from "jsr:@negrel/webpush@0.5.0";
import {
  APP_URL,
  dueMessage,
  duePosts,
  goalAlert,
  isPushEndpoint,
  parsePrefs,
  PREFS_PREFIX,
  profilesFrom,
  weeklyEmail,
  type Email,
  type PushMessage,
} from "./logic.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const PAGE = 25;
const FROM = "Content Studio <noreply@mail.themoneybees.co>";
const TEST_INBOXES = ["delivered@resend.dev", "spleotan@gmail.com"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Options {
  dryRun: boolean;
  now: number;
  only: string | null;
  after: string | null;
  testTo: string | null;
}

interface Sub {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Constant-time comparison via digests, so timing leaks neither length nor prefix.
async function secretMatches(provided: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0;
}

const mask = (email: string) => email.replace(/^(.).*(@.*)$/, "$1***$2");
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

/** Items not sent yet. Outside a dry run this claims them: only the run that inserts a row sends it. */
async function claim(admin: SupabaseClient, uid: string, items: string[], dryRun: boolean): Promise<Set<string>> {
  if (!items.length) return new Set();
  if (dryRun) {
    const { data, error } = await admin.from("cs_notify_sent").select("item").eq("user_id", uid).in("item", items);
    if (error) throw error;
    const sent = new Set((data ?? []).map((r) => r.item as string));
    return new Set(items.filter((i) => !sent.has(i)));
  }
  const { data, error } = await admin
    .from("cs_notify_sent")
    .upsert(items.map((item) => ({ user_id: uid, item })), { onConflict: "user_id,item", ignoreDuplicates: true })
    .select("item");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.item as string));
}

let vapid: Promise<CryptoKeyPair> | null = null;

async function sendPush(admin: SupabaseClient, subs: Sub[], m: PushMessage): Promise<number> {
  const raw = Deno.env.get("VAPID_KEYS");
  if (!raw) {
    console.error("VAPID_KEYS missing, no push sent");
    return 0;
  }
  vapid ??= importVapidKeys(JSON.parse(raw));
  const vapidKeys = await vapid;
  const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag });
  let ok = 0;
  for (const s of subs) {
    if (!isPushEndpoint(s.endpoint)) continue;
    try {
      // A fresh application server key pair per message (RFC 8291).
      const server = await ApplicationServer.new({ contactInformation: APP_URL, vapidKeys });
      await server
        .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
        .pushTextMessage(payload, { ttl: m.ttl, urgency: Urgency.High });
      ok++;
    } catch (e) {
      const status = e instanceof PushMessageError ? e.response.status : 0;
      if (e instanceof PushMessageError) await e.response.body?.cancel();
      if (status === 404 || status === 410) {
        // The browser dropped this subscription: retire the device.
        const { error } = await admin.from("cs_push_subscriptions").delete().eq("id", s.id);
        if (error) console.error("could not retire a gone subscription", error.message);
      } else {
        console.error("push failed", status || errText(e));
      }
    }
  }
  return ok;
}

async function sendEmail(to: string, email: Email, idempotencyKey: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) {
    console.error("RESEND_API_KEY missing, no email sent");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from: FROM, to: [to], subject: email.subject, text: email.text }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      await res.body?.cancel();
      return true;
    }
    console.error("resend refused", res.status, (await res.text()).slice(0, 300));
  } catch (e) {
    console.error("resend failed", errText(e));
  }
  return false;
}

async function runUser(admin: SupabaseClient, uid: string, prefs: { email: boolean; push: boolean }, o: Options) {
  const { data: rows, error } = await admin
    .from("cs_user_data")
    .select("key,data")
    .eq("user_id", uid)
    .or(
      [
        `key.like.content-studio-drafts-${uid}*`,
        `key.like.content-studio-goals-${uid}*`,
        `key.like.content-studio-positioning-${uid}*`,
        `key.eq.content-studio-profiles-${uid}`,
      ].join(","),
    );
  if (error) throw error;
  const profiles = profilesFrom(uid, Object.fromEntries((rows ?? []).map((r) => [r.key as string, r.data as string])));
  const report: { user: string; push: object[]; email: object | null } = { user: uid.slice(0, 8), push: [], email: null };

  if (prefs.push) {
    const { data: subs, error: subsError } = await admin
      .from("cs_push_subscriptions")
      .select("id,endpoint,p256dh,auth")
      .eq("user_id", uid);
    if (subsError) throw subsError;
    if (subs?.length) {
      const due = duePosts(profiles, o.now);
      const goal = goalAlert(profiles, o.now);
      const fresh = await claim(admin, uid, [...due.map((d) => d.item), ...(goal ? [goal.item] : [])], o.dryRun);
      const messages = [dueMessage(due.filter((d) => fresh.has(d.item))), goal && fresh.has(goal.item) ? goal.message : null];
      for (const m of messages) {
        if (!m) continue;
        const delivered = o.dryRun ? null : await sendPush(admin, subs as Sub[], m);
        report.push.push({ ...m, devices: subs.length, delivered });
      }
    }
  }

  if (prefs.email) {
    const email = weeklyEmail(profiles, o.now);
    if (email && (await claim(admin, uid, [email.item], o.dryRun)).has(email.item)) {
      let to = o.testTo;
      if (!to) {
        const { data, error: userError } = await admin.auth.admin.getUserById(uid);
        if (userError) console.error("could not read the sign-in email", userError.message);
        to = data?.user?.email ?? null;
      }
      if (to) {
        const sent = o.dryRun ? null : await sendEmail(to, email, `cs-${email.item}-${uid}${o.testTo ? "-test" : ""}`);
        // Give the claim back so the next hourly run tries again.
        if (sent === false) await admin.from("cs_notify_sent").delete().eq("user_id", uid).eq("item", email.item);
        report.email = { to: mask(to), subject: email.subject, text: email.text, sent };
      }
    }
  }
  return report;
}

async function runPage(admin: SupabaseClient, o: Options) {
  let q = admin
    .from("cs_user_data")
    .select("user_id,key,data")
    .like("key", `${PREFS_PREFIX}%`)
    .order("user_id")
    .limit(PAGE);
  if (o.only) q = q.eq("user_id", o.only);
  if (o.after) q = q.gt("user_id", o.after);
  const { data: rows, error } = await q;
  if (error) throw error;
  const reports: object[] = [];
  for (const row of rows ?? []) {
    // Only the key named after the row's own user counts, so nobody can switch on someone else.
    if (row.key !== `${PREFS_PREFIX}${row.user_id}`) continue;
    const prefs = parsePrefs(row.data);
    if (!prefs.email && !prefs.push) continue;
    try {
      reports.push(await runUser(admin, row.user_id, prefs, o));
    } catch (e) {
      console.error("notify failed for a user", errText(e));
      reports.push({ user: String(row.user_id).slice(0, 8), error: errText(e) });
    }
  }
  const next = rows && rows.length === PAGE ? (rows[PAGE - 1].user_id as string) : null;
  return { checked: rows?.length ?? 0, next, reports };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("NOTIFY_CRON_SECRET");
  if (!secret || !(await secretMatches(req.headers.get("x-notify-secret") ?? "", secret))) {
    return json({ error: "forbidden" }, 403);
  }
  let body: Record<string, unknown> = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") body = parsed;
  } catch {
    // the cron sends {}; an empty body is the same
  }
  const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null);
  const dryRun = body.dryRun === true;
  const only = id(body.only);
  const testTo = typeof body.testTo === "string" ? body.testTo.toLowerCase() : null;
  if (testTo && (!TEST_INBOXES.includes(testTo) || !only)) {
    return json({ error: "testTo takes only a test inbox, and needs only" }, 400);
  }
  const at = typeof body.now === "string" ? Date.parse(body.now) : NaN;
  const o: Options = {
    dryRun,
    now: (dryRun || testTo) && !Number.isNaN(at) ? at : Date.now(),
    only,
    after: id(body.after),
    testTo,
  };

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // A dry run or a test send answers with its report; the hourly run works after answering.
  if (dryRun || testTo) {
    try {
      return json({ dryRun, now: new Date(o.now).toISOString(), ...(await runPage(admin, o)) });
    } catch (e) {
      return json({ error: errText(e) }, 500);
    }
  }

  const work = runPage(admin, o)
    .then(async (r) => {
      console.log("notify page", JSON.stringify({ checked: r.checked, sent: r.reports.length, next: !!r.next }));
      if (!r.next || o.only) return;
      // The next page runs as its own request with its own CPU budget.
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-notify-secret": secret },
        body: JSON.stringify({ after: r.next }),
      });
      if (!res.ok) console.error("next page refused", res.status);
      await res.body?.cancel();
    })
    .catch((e) => console.error("notify page failed", errText(e)));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;
  return json({ started: true }, 202);
});
