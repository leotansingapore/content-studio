#!/usr/bin/env node
// Hub trend scout: research trending content per niche, write drops to hub_trends.
// Runs via launchd every 5h (com.leo.hub-trend-scout). ASCII-only output.
// Source of truth: content-studio repo supabase/hub/scout/. Deployed copy: ~/.local/bin.
// Env: ~/.local/state/hub-scout/.env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STATE = join(homedir(), ".local/state/hub-scout");
mkdirSync(STATE, { recursive: true });

const env = Object.fromEntries(
  readFileSync(join(STATE, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in " + join(STATE, ".env"));
  process.exit(1);
}

// Market localization + niche reference accounts (real local creators the
// research should ground itself in). Optional file; scout works without it.
const MARKET = env.MARKET || "Singapore";
let refGroups = [];
try {
  refGroups = JSON.parse(
    readFileSync(join(STATE, "reference-accounts.json"), "utf8"),
  ).groups || [];
} catch {
  // no reference file; research runs unguided
}
const refAccountsFor = (niche) => {
  const g = refGroups.find((x) => new RegExp(x.match, "i").test(niche));
  return g ? g.accounts.slice(0, 20) : [];
};

const H = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

const log = (m) => {
  const line = "[" + new Date().toISOString() + "] " + m;
  console.log(line);
  appendFileSync(join(STATE, "scout.log"), line + "\n");
};

const rest = async (path, opts = {}) => {
  const r = await fetch(env.SUPABASE_URL + "/rest/v1/" + path, { headers: H, ...opts });
  if (!r.ok) throw new Error(path + ": " + r.status + " " + (await r.text()).slice(0, 300));
  if (opts.method === "POST") return null;
  return r.json();
};

// A video link only counts if the platform confirms it exists.
const videoOk = async (u) => {
  try {
    if (/tiktok\.com/i.test(u)) {
      return (await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(u))).ok;
    }
    if (/youtube\.com|youtu\.be/i.test(u)) {
      return (
        await fetch("https://www.youtube.com/oembed?url=" + encodeURIComponent(u) + "&format=json")
      ).ok;
    }
    return (await fetch(u, { method: "HEAD", redirect: "follow" })).ok;
  } catch {
    return false;
  }
};

const claudeJson = (prompt, retries = 1) => {
  for (let i = 0; i <= retries; i++) {
    try {
      const out = execFileSync("claude", ["-p", "--model", "sonnet"], {
        input: prompt,
        encoding: "utf8",
        timeout: 900000,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env, PATH: process.env.PATH + ":/usr/local/bin:/opt/homebrew/bin" },
      });
      const m = out.match(/\[[\s\S]*\]/);
      return JSON.parse(m ? m[0] : out);
    } catch (e) {
      log("claude attempt " + (i + 1) + " failed: " + String(e).slice(0, 200));
    }
  }
  return null;
};

log("run start");

// 1. Collect niches: allowlist niches + member industries
const allow = await rest("hub_allowlist?select=email,client_name,niche,brand_notes");
const members = await rest(
  "hub_memberships?select=industry&status=in.(client,active)&industry=not.is.null",
);
const niches = [
  ...new Set([...allow.map((a) => a.niche), ...members.map((m) => m.industry)]),
].filter(Boolean);
log("niches: " + (niches.join(", ") || "(none)"));

for (const niche of niches) {
  const recent = await rest(
    "hub_trends?select=title&niche=eq." +
      encodeURIComponent(niche) +
      "&order=created_at.desc&limit=20",
  );
  const refs = refAccountsFor(niche);
  const drops = claudeJson(
    'You are a social content trend scout for the ' +
      MARKET +
      ' market. Research with web search what is trending RIGHT NOW (' +
      new Date().toDateString() +
      ') for short-form content creators in the "' +
      niche +
      '" niche in ' +
      MARKET +
      ': formats, audio and meme trends, hooks, platform shifts. Global trends only count if they are landing with ' +
      MARKET +
      ' audiences; local trends beat global ones.' +
      (refs.length
        ? ' Ground your research in what real ' +
          MARKET +
          ' creators in this niche are actually posting - search for recent posts from these accounts and note what formats are working for them: ' +
          refs.join(", ") +
          '.'
        : '') +
      ' Angles must fit a ' +
      MARKET +
      ' audience (local terms, local money context). Skip anything matching these recent titles: ' +
      JSON.stringify(recent.map((r) => r.title)) +
      '. EVERY trend MUST come with example videos: 1-3 links to REAL public videos that show the trend in action (TikTok, Instagram Reel, or YouTube Shorts URLs you actually found during your web search - never invent URLs; a member will watch one before filming). Trends you cannot find a real example video for are not worth returning. Return ONLY a JSON array of at most 5 objects, each: {"title": string, "summary_md": string (2-3 sentences, what it is and why it works), "angles_md": string (markdown bullet list of 3-5 concrete post angles a "' +
      niche +
      '" creator can film this week), "source_urls": [string], "example_video_urls": [string]}. No prose outside the JSON.',
  );
  if (!drops || !Array.isArray(drops) || drops.length === 0) {
    log("skip niche " + niche + ": no valid JSON");
    continue;
  }
  const rows = [];
  for (const d of drops) {
    if (rows.length >= 3) break;
    const candidates = Array.isArray(d.example_video_urls)
      ? d.example_video_urls.map(String).filter((u) => /^https?:\/\//i.test(u)).slice(0, 5)
      : [];
    const verified = [];
    for (const u of candidates) {
      if (verified.length >= 3) break;
      if (await videoOk(u)) verified.push(u);
    }
    if (verified.length === 0) {
      log("drop rejected (no live example video): " + String(d.title || "").slice(0, 60));
      continue;
    }
    rows.push({
      niche,
      title: String(d.title || "").slice(0, 200),
      summary_md: String(d.summary_md || ""),
      angles_md: String(d.angles_md || ""),
      source_urls: Array.isArray(d.source_urls)
        ? d.source_urls.map(String).filter((u) => /^https?:\/\//i.test(u)).slice(0, 6)
        : [],
      example_video_urls: verified,
      audience_type: "industry",
      audience_value: niche,
    });
  }
  if (rows.length === 0) {
    log("skip niche " + niche + ": no drops survived video verification");
    continue;
  }
  await rest("hub_trends", { method: "POST", body: JSON.stringify(rows) });
  log("inserted " + rows.length + " drops for " + niche);

  // 2. Client-specific adaptation
  for (const c of allow.filter((a) => a.niche === niche && a.brand_notes)) {
    const adapted = claudeJson(
      "Adapt these trend drops for a specific client. Client: " +
        c.client_name +
        ". Brand notes: " +
        c.brand_notes +
        ". Drops: " +
        JSON.stringify(rows.map(({ title, summary_md, angles_md }) => ({ title, summary_md, angles_md }))) +
        '. Return ONLY a JSON array with one object per drop, each: {"title": string (same trend, framed for this client), "summary_md": string, "angles_md": string (3-5 angles rewritten specifically for this client brand, voice, and offers)}. No prose outside the JSON.',
    );
    if (!adapted || !Array.isArray(adapted)) {
      log("skip client " + c.email + ": no valid JSON");
      continue;
    }
    await rest("hub_trends", {
      method: "POST",
      body: JSON.stringify(
        adapted.slice(0, rows.length).map((d, i) => ({
          niche,
          title: String(d.title || "").slice(0, 200),
          summary_md: String(d.summary_md || ""),
          angles_md: String(d.angles_md || ""),
          source_urls: rows[i] ? rows[i].source_urls : [],
          example_video_urls: rows[i] ? rows[i].example_video_urls : [],
          audience_type: "client",
          audience_value: c.email,
        })),
      ),
    });
    log("inserted client drops for " + c.email);
  }
}

log("run complete");
