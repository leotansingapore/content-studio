// Phone alerts and the Monday results email (supabase/hub/016_notify.sql).
// pg_cron calls this every hour with a shared secret. run.ts pages through the
// advisers who switched something on, 10 per request, each page a fresh
// request of this function; logic.ts decides what is due and words it. This
// file only wires Supabase, web push and Resend into run.ts.
//
// Body, all optional:
//   dryRun: true     send and record nothing; return what would go out
//   only: <user id>  just this adviser
//   testTo: address  a test send: the email goes to this inbox instead (only
//                    delivered@resend.dev or spleotan@gmail.com, and only with
//                    `only`); no phone alerts, nothing claimed or logged
//   now: ISO time    pretend it is this time (with dryRun or testTo only)
//   after, upTo      page cursors; the function sets them for itself
//
// Secrets: NOTIFY_CRON_SECRET (the same value is in Vault as
// cs_notify_cron_secret), VAPID_KEYS (JSON {publicKey, privateKey} JWKs),
// RESEND_API_KEY. Deploy with --no-verify-jwt: the secret header is the auth.
//   supabase functions deploy notify --project-ref hgdbflprrficdoyxmdxe --use-api --no-verify-jwt

// pinned: this runs with the service key
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.3";
import { ApplicationServer, importVapidKeys, PushMessageError, Urgency } from "jsr:@negrel/webpush@0.5.0";
import { APP_URL, isPushEndpoint, PREFS_PREFIX } from "./logic.ts";
import { runPage, type Deps, type Options } from "./run.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;

const FROM = "Content Studio <noreply@mail.themoneybees.co>";
const TEST_INBOXES = ["delivered@resend.dev", "spleotan@gmail.com"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);
let vapid: Promise<CryptoKeyPair> | null = null;

function wire(secret: string): Deps {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const ok = <T>({ data, error }: { data: T; error: { message: string } | null }): T => {
    if (error) throw new Error(error.message);
    return data;
  };
  return {
    async listPrefs({ after, upTo, only, limit }) {
      // A LIKE scan of cs_user_data in primary-key order. If that table grows
      // large, add a partial index on (key text_pattern_ops) where
      // key like 'content-studio-notify-%'.
      let q = admin.from("cs_user_data").select("user_id,key,data").like("key", `${PREFS_PREFIX}%`).order("user_id").limit(limit);
      if (only) q = q.eq("user_id", only);
      if (after) q = q.gt("user_id", after);
      if (upTo) q = q.lte("user_id", upTo);
      return ok(await q) ?? [];
    },
    async userRows(uid) {
      const rows = ok(
        await admin
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
          ),
      ) ?? [];
      return Object.fromEntries(rows.map((r) => [r.key as string, r.data as string]));
    },
    async subs(uid) {
      return ok(await admin.from("cs_push_subscriptions").select("id,endpoint,p256dh,auth,updated_at").eq("user_id", uid)) ?? [];
    },
    async authUser(uid) {
      const { data, error } = await admin.auth.admin.getUserById(uid);
      if (error) console.error("could not read the sign-in email", error.message);
      return data?.user ?? null;
    },
    async logged(uid, items) {
      const rows = ok(await admin.from("cs_notify_sent").select("item").eq("user_id", uid).in("item", items)) ?? [];
      return new Set(rows.map((r) => r.item as string));
    },
    async claim(uid, items, retakeAfter) {
      const rows: unknown[] =
        ok(await admin.rpc("cs_notify_claim", { p_user: uid, p_items: items, p_retake_after: retakeAfter })) ?? [];
      return new Set(rows.map((r) => (typeof r === "string" ? r : (r as { cs_notify_claim: string }).cs_notify_claim)));
    },
    async markSent(uid, items) {
      ok(await admin.from("cs_notify_sent").update({ sent_at: new Date().toISOString() }).eq("user_id", uid).in("item", items));
    },
    async sendPush(subs, m) {
      const raw = Deno.env.get("VAPID_KEYS");
      if (!raw) {
        console.error("VAPID_KEYS missing, no push sent");
        return 0;
      }
      vapid ??= importVapidKeys(JSON.parse(raw));
      const vapidKeys = await vapid;
      const payload = JSON.stringify({ title: m.title, body: m.body, url: m.url, tag: m.tag });
      let delivered = 0;
      for (const s of subs) {
        if (!isPushEndpoint(s.endpoint)) continue;
        try {
          // A fresh application server key pair per message (RFC 8291). The
          // library's fetch follows redirects and takes no options; the
          // endpoint allowlist keeps it to the four push services.
          const server = await ApplicationServer.new({ contactInformation: APP_URL, vapidKeys });
          await server
            .subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } })
            .pushTextMessage(payload, { ttl: m.ttl, urgency: Urgency.High });
          delivered++;
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
      return delivered;
    },
    async sendEmail(to, email, idempotencyKey) {
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
    },
    async next(body) {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-notify-secret": secret },
        body: JSON.stringify(body),
      });
      if (!res.ok) console.error("next request refused", res.status);
      await res.body?.cancel();
    },
    clock: () => Date.now(),
  };
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
    upTo: id(body.upTo),
    testTo,
  };
  const deps = wire(secret);

  // A dry run or a test send answers with its report; the hourly run works after answering.
  if (dryRun || testTo) {
    try {
      return json({ dryRun, now: new Date(o.now).toISOString(), ...(await runPage(deps, o)) });
    } catch (e) {
      return json({ error: errText(e) }, 500);
    }
  }
  const work = runPage(deps, o)
    .then((r) => console.log("notify page", JSON.stringify({ checked: r.checked, users: r.reports.length, next: !!r.next, handedOff: r.handedOff })))
    .catch((e) => console.error("notify page failed", errText(e)));
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(work);
  else await work;
  return json({ started: true }, 202);
});
