#!/usr/bin/env node
// The script desk's paired worker for Leo's Mac (wave 1). It takes the jobs script-desk files (cs_ai_jobs) through
// the script-worker function, runs each on this Mac's own Claude Code (Leo's Max plan), and hands the answer back:
// one headless `claude -p` per job with no tools, no MCP, no settings, no saved session, the system prompt in
// a file in a fresh temp folder and the message on stdin, run from an empty folder that is deleted afterwards. A job
// carries other people's words (a scraped caption, a transcript), so Claude gets nothing to run and nothing to read.
//
// A job holds inputs only. The words Claude Code gets come from a private templates module that is never in this repo:
// TEMPLATES (SCRIPT_WORKER_TEMPLATES, default ~/.local/share/script-worker/templates.mjs) exports
// build(kind, inputs) -> {system, message, model, effort}. Without it, every job fails with a sentence saying so.
//
// The child's environment has no API key or token of any kind: an inherited ANTHROPIC_API_KEY would silently bill the
// API instead of the Max plan, and CLAUDECODE would mark it as a nested session. At most PARALLEL jobs run at once.
//
// Research (wave 2): ig_reels and ig_reel read public Instagram pages in headless Chromium (instagram.mjs), with no
// Claude Code call; discover runs Claude Code with web search as its only tool, then reads each creator it found. Reads
// have their own READ_PARALLEL slots, so a page of reads never holds up a script.
//
// Config (env): SCRIPT_WORKER_URL (default the live script-worker function), SCRIPT_WORKER_SECRET (else the
// keychain item cs-script-worker-secret), SCRIPT_WORKER_TEMPLATES, SCRIPT_WORKER_PLAYWRIGHT (default Playwright in
// ~/.local/share/script-worker/node_modules), SCRIPT_WORKER_STATE, CLAUDE_BIN (default `claude` on PATH). Its only npm
// dependency is Playwright, for reads, installed beside the templates (the plist's install steps).
// Install: the steps at the top of com.leo.script-worker.plist beside this file.

import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createReader, handlesOf, readCreators, readReel, readReels } from "./instagram.mjs";

export const DEFAULT_URL = "https://hgdbflprrficdoyxmdxe.supabase.co/functions/v1/script-worker";
export const PARALLEL = 2;
export const READ_PARALLEL = 2;
export const WRITE_KINDS = ["write", "hooks", "breakdown", "rescript", "claims"];
export const READ_KINDS = ["ig_reels", "ig_reel", "discover"];
/** Reads stop opening pages by these, well inside script-desk's 6 and 10 minutes. */
export const READ_DEADLINE_MS = { ig_reels: 4.5 * 60_000, discover: 8 * 60_000 };
/** Claude Code gets 3 minutes a job; script-desk fails a claim with no answer after 4. */
export const RUN_TIMEOUT_MS = 180_000;
/** Look every 3 s for 2 minutes after a job, else every 10 s (one function call a look). */
export const QUICK_MS = 3_000;
export const IDLE_MS = 10_000;
export const LINGER_MS = 120_000;
export const MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);
export const TEMPLATES = process.env.SCRIPT_WORKER_TEMPLATES || path.join(os.homedir(), ".local/share/script-worker/templates.mjs");
export const PLAYWRIGHT = process.env.SCRIPT_WORKER_PLAYWRIGHT || path.join(os.homedir(), ".local/share/script-worker/node_modules/playwright/index.mjs");
export const EFFORTS = new Set(["low", "medium", "high"]);

/** The environment without the parent session's marker or anything that would bill another account or provider. */
export function childEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_") || k.startsWith("ANTHROPIC_") || k.startsWith("AWS_") || k.startsWith("VERTEX_")) continue;
    if (/KEY|TOKEN|SECRET|PASSWORD|COOKIE|CREDENTIAL/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * One headless Claude Code call (the reference runner's arguments, with the job's model and effort): no tools at all,
 * or for a creator search web search and nothing else. The worker picks the tools by the job's kind, never the job.
 */
export const claudeArgs = (systemFile, model, effort, webSearch = false) => [
  "-p", ...(webSearch ? ["--tools", "WebSearch", "--allowedTools", "WebSearch"] : ["--tools", ""]), "--strict-mcp-config", "--disable-slash-commands",
  "--setting-sources", "", "--no-session-persistence", "--output-format", "json", "--model", model, "--effort", effort, "--system-prompt-file", systemFile,
];

/** What a failure means for the person, in a sentence they can act on; null when it is nothing known. */
export function problemOf(out) {
  if (/failed to authenticate|\boauth\b[^.]{0,40}\btoken\b|\b401\b|not logged in|please run \/login|invalid api key|authentication/i.test(out)) {
    return "Claude Code on Leo's Mac is signed out. Sign in again there (run claude, then /login), then try again.";
  }
  if (/usage limit|limit reached|rate limit|overloaded/i.test(out)) return "Leo's Claude plan limit is reached for now. Try again once it resets.";
  return null;
}

/** Claude Code's JSON answer (`--output-format json`): its text and model; throws a person-readable Error otherwise. */
export function readClaudeJson(out, wanted = "") {
  const j = JSON.parse(out);
  const text = typeof j.result === "string" ? j.result : "";
  if (j.is_error || !text.trim()) throw new Error(problemOf(text) ?? `Claude Code answered with an error (${text.replace(/\s+/g, " ").slice(0, 160) || "nothing"}). Try again.`);
  // the model asked for when it ran, else the one that wrote the most: Claude Code adds a short Haiku side call to
  // some runs and can list it first, and on a 10-token answer it out-writes the writer (4 Nov e2e)
  const usage = Object.entries(j.modelUsage ?? {}).sort(([, a], [, b]) => (b?.outputTokens ?? 0) - (a?.outputTokens ?? 0));
  return { text, model: wanted && j.modelUsage?.[wanted] ? wanted : (usage[0]?.[0] ?? "") };
}

export const STOPPED = "The script worker on Leo's Mac restarted before this finished. Try again.";

/**
 * Runs one job's request; the temp folder (system.txt and the empty working folder) is gone when it settles. A run
 * past its time gets SIGTERM, then SIGKILL 10 s later; `signal` ends it the same way (the worker stopping).
 */
export async function runClaude(request, opts = {}) {
  const { bin = process.env.CLAUDE_BIN || "claude", spawnFn = spawn, env = process.env, timeoutMs = RUN_TIMEOUT_MS, signal, tmpdir = os.tmpdir(), webSearch = false } = opts;
  if (!MODELS.has(request.model) || !EFFORTS.has(request.effort)) throw new Error("This job asked for a model or effort the worker doesn't run.");
  if (typeof request.system !== "string" || typeof request.message !== "string" || !request.message.trim()) throw new Error("This job has no message.");
  if (signal?.aborted) throw new Error(STOPPED);
  let dir = "";
  try {
    // a full disk fails here, and the job is reported failed like any other
    dir = fs.mkdtempSync(path.join(tmpdir, "script-desk-"));
    const systemFile = path.join(dir, "system.txt");
    const cwd = path.join(dir, "empty");
    fs.mkdirSync(cwd);
    fs.writeFileSync(systemFile, request.system);
    return await new Promise((resolve, reject) => {
      const child = spawnFn(bin, claudeArgs(systemFile, request.model, request.effort, webSearch), { cwd, env: childEnv(env), stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      let ended = "";
      let killer;
      const end = (why) => {
        if (ended) return;
        ended = why;
        child.kill("SIGTERM");
        killer = setTimeout(() => child.kill("SIGKILL"), 10_000);
      };
      const timer = setTimeout(() => end("timeout"), timeoutMs);
      const onAbort = () => end("stopped");
      signal?.addEventListener("abort", onAbort, { once: true });
      const done = () => (clearTimeout(timer), clearTimeout(killer), signal?.removeEventListener("abort", onAbort));
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      // claude exiting before it reads the message (EPIPE) must not take the worker down
      child.stdin.on("error", () => {});
      child.on("error", (e) => {
        done();
        reject(/ENOENT/.test(String(e)) ? new Error("Claude Code isn't installed on Leo's Mac (no claude command).") : e);
      });
      child.on("close", (code) => {
        done();
        if (ended === "stopped") return reject(new Error(STOPPED));
        if (ended === "timeout") return reject(new Error("Claude Code took over 3 minutes on this. Try again."));
        try {
          resolve(readClaudeJson(out, request.model));
        } catch (e) {
          if (out.trim().startsWith("{")) return reject(e);
          const said = `${err} ${out}`.replace(/\s+/g, " ").trim();
          reject(new Error(problemOf(said) ?? `Claude Code didn't answer (exit ${code}: ${said.slice(0, 160) || "nothing"}). Try again.`));
        }
      });
      child.stdin.end(request.message);
    });
  } finally {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

const loaded = new Map();

/** The private templates module; a person-readable Error when it isn't installed or has no build(). */
export async function templatesOf(file = TEMPLATES) {
  if (loaded.has(file)) return loaded.get(file);
  // checked before import(), so a module installed later loads on the next job without a restart
  if (!fs.existsSync(file)) throw new Error(`The script worker on Leo's Mac has no templates installed (${file}). Install them, then try again.`);
  let m;
  try {
    m = await import(pathToFileURL(file).href);
  } catch (e) {
    // not cached when it fails to load: a fixed file loads on the next job
    throw new Error(`The script worker's templates (${file}) didn't load (${String(e?.message ?? e).slice(0, 160)}). Reinstall them, then try again.`);
  }
  // shortcut: a module without build stays cached until the worker restarts, which install.sh does
  if (typeof m.build !== "function") throw new Error(`The script worker's templates (${file}) have no build function. Reinstall them, then try again.`);
  loaded.set(file, m);
  return m;
}

// one promise, so two reads starting together share one reader (one Chromium, one pace, one pause)
let reader = null;

/** The one Instagram reader every read shares (its pacing and pause are the worker's), Playwright loaded on first use. */
export function readerOf(file = PLAYWRIGHT) {
  reader ??= (async () => {
    if (!fs.existsSync(file)) throw new Error(`The script worker on Leo's Mac can't read Instagram yet: Playwright isn't installed (${file}). Install it, then try again.`);
    let chromium;
    try {
      ({ chromium } = await import(pathToFileURL(file).href));
    } catch (e) {
      throw new Error(`The script worker's Playwright (${file}) didn't load (${String(e?.message ?? e).slice(0, 160)}). Reinstall it, then try again.`);
    }
    return createReader({ launch: () => chromium.launch({ headless: true }) });
  })();
  // a failed start is tried again on the next read
  reader.catch(() => (reader = null));
  return reader;
}
export const closeReader = async () => {
  const r = reader;
  reader = null;
  await (await r?.catch(() => null))?.close();
};

/** One read: a grid, a reel, or a search and then its creators' grids. The answer is the worker's own JSON. */
async function runRead(job, opts) {
  const started = Date.now();
  const deadline = started + (READ_DEADLINE_MS[job.kind] ?? READ_DEADLINE_MS.ig_reels);
  const read = opts.reader ?? (await readerOf(opts.playwright));
  const input = job.request ?? {};
  if (job.kind === "ig_reels") return { text: JSON.stringify(await readReels(input, read, { deadline, signal: opts.signal })), model: "instagram" };
  if (job.kind === "ig_reel") return { text: JSON.stringify(await readReel(input, read)), model: "instagram" };
  const found = await runClaude(await built(job, opts), { ...opts, webSearch: true });
  const max = Math.max(1, Math.min(8, Number.isInteger(input.max) ? input.max : 6));
  const creators = await readCreators(handlesOf(found.text, max), read, { deadline, signal: opts.signal });
  return { text: JSON.stringify(creators), model: found.model };
}

/** The job's inputs built into Claude Code's request by the templates. */
async function built(job, opts) {
  const { build } = await templatesOf(opts.templates);
  let request;
  try {
    request = build(job.kind, job.request ?? {});
    if (!request || typeof request !== "object") throw new Error("build gave no request");
  } catch (e) {
    throw new Error(`The script worker couldn't build this ${job.kind} job (${String(e?.message ?? e).slice(0, 160)}). Try again.`);
  }
  return request;
}

/** One claimed job: a read, or its inputs built into Claude Code's request by the templates, then run. */
export async function runJob(job, opts = {}) {
  if (READ_KINDS.includes(job.kind)) return runRead(job, opts);
  return runClaude(await built(job, opts), opts);
}

/** One call to the script-worker function. */
export async function post(url, secret, body, fetchFn = fetch, timeoutMs = 30_000) {
  const res = await fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-script-worker-secret": secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`script-worker ${res.status}: ${json.error ?? "no reason"}`);
  return json;
}

/**
 * The loop: while a slot is free, claim a job and run it; report done or failed (retried 3 times, 10 s each, so a
 * report lands well inside script-desk's 4 minutes). `stop()` claims nothing more, ends the running jobs, reports them
 * failed, and resolves once they are reported.
 */
export function startWorker(o) {
  const { url, secret, worker, run = runJob, fetchFn = fetch, log = (s) => console.log(`${new Date().toISOString()} ${s}`), now = Date.now } = o;
  const running = new Set();
  const slots = { write: new Set(), read: new Set() };
  const slotOf = (kind) => (READ_KINDS.includes(kind) ? slots.read : slots.write);
  // the kinds with a free slot, the only ones the claim asks for
  const free = () => [...(slots.write.size < PARALLEL ? WRITE_KINDS : []), ...(slots.read.size < READ_PARALLEL ? READ_KINDS : [])];
  const stop = new AbortController();
  let stopped = false;
  let lastJobAt = 0;
  let lastWarn = "";
  let wake = () => {};
  const warn = (s) => s !== lastWarn && ((lastWarn = s), log(s));

  const report = async (body) => {
    for (let i = 0; i < 3; i++) {
      try {
        const r = await post(url, secret, body, fetchFn, 10_000);
        // not kept: script-desk had already given up on it, or another worker holds it
        if (r?.ok === false) log(`report ${body.op} ${body.id}: not kept`);
        return r;
      } catch (e) {
        warn(`report ${body.op} ${body.id}: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      }
    }
  };

  const take = (job) => {
    const started = now();
    log(`took ${job.kind} ${job.id}`);
    const p = run(job, { signal: stop.signal })
      .then((a) => report({ op: "done", id: job.id, worker, text: a.text, model: a.model, ms: now() - started }))
      .catch((e) => report({ op: "failed", id: job.id, worker, error: String(e?.message ?? e).slice(0, 400), ms: now() - started }))
      .finally(() => {
        running.delete(p);
        slotOf(job.kind).delete(p);
        lastJobAt = now();
        log(`finished ${job.kind} ${job.id} in ${Math.round((now() - started) / 1000)}s`);
        wake();
      });
    running.add(p);
    slotOf(job.kind).add(p);
  };

  const loop = (async () => {
    while (!stopped) {
      const kinds = free();
      if (kinds.length) {
        try {
          const { job } = await post(url, secret, { op: "claim", worker, kinds }, fetchFn);
          lastWarn = "";
          // claimed as the stop came: hand it straight back as failed rather than start it
          if (job?.id && stopped) {
            await report({ op: "failed", id: job.id, worker, error: STOPPED, ms: 0 });
            break;
          }
          if (job?.id) {
            lastJobAt = now();
            take(job);
            continue;
          }
        } catch (e) {
          warn(`claim: ${e.message}`);
        }
      }
      const wait = !free().length ? IDLE_MS : now() - lastJobAt < LINGER_MS ? QUICK_MS : IDLE_MS;
      await new Promise((r) => {
        const t = setTimeout(r, wait);
        wake = () => (clearTimeout(t), r());
      });
    }
    await Promise.allSettled([...running]);
    // Chromium goes with the worker
    await closeReader();
  })();

  return {
    running: () => running.size,
    stop: () => {
      stopped = true;
      stop.abort();
      wake();
      return loop;
    },
  };
}

/** The shared secret: the environment's, else the login keychain's cs-script-worker-secret. */
export function secretOf(env = process.env) {
  if (env.SCRIPT_WORKER_SECRET) return env.SCRIPT_WORKER_SECRET;
  try {
    return execFileSync("security", ["find-generic-password", "-s", "cs-script-worker-secret", "-w"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const secret = secretOf();
  if (!secret) {
    console.error("No secret: set SCRIPT_WORKER_SECRET or add the keychain item cs-script-worker-secret.");
    process.exit(1);
  }
  const worker = os.hostname().replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60) || "mac";
  const w = startWorker({ url: process.env.SCRIPT_WORKER_URL || DEFAULT_URL, secret, worker });
  console.log(`${new Date().toISOString()} script worker ${worker} started, ${PARALLEL} writing and ${READ_PARALLEL} reads at once`);
  if (!fs.existsSync(TEMPLATES)) console.log(`${new Date().toISOString()} no templates at ${TEMPLATES}: every job fails until they are installed`);
  // launchd stops it with SIGTERM: let the running jobs report, then exit
  for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => void w.stop().then(() => process.exit(0)));
}
