#!/usr/bin/env node
// End to end on this Mac, never the live project: a local stub of script-worker holds three made-up jobs (hooks, a
// breakdown, a claim check) as script-desk files them, inputs only. The real worker.mjs claims them, builds each with
// the private templates installed on this Mac (SCRIPT_WORKER_TEMPLATES, default ~/.local/share/script-worker/
// templates.mjs; not in this repo), and runs it on the real `claude` CLI (Leo's Max plan). The stub checks the secret,
// that no more than two ran at once, that every answer reads in its JSON shape, and that no temp folder is left. The worker is started with a fake ANTHROPIC_API_KEY, CLAUDECODE and the
// secret in its environment, and runs Claude Code through a wrapper that writes down the environment it was given:
// none of the three may reach it. (A leaked key can't be caught by a failing run: on 4 Nov Claude Code answered on
// the Max plan with a fake ANTHROPIC_API_KEY set, so a real key would have billed the API without a sign.)
//
//   node --experimental-strip-types scripts/script-worker/e2e.mjs
//
// Prints PASS/FAIL lines and exits non-zero on any FAIL. Takes about a minute.

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readBreakdown, readClaims, readHooks, sanitizeContext } from "../../supabase/functions/script-desk/logic.ts";
import { TEMPLATES, childEnv, claudeArgs } from "./worker.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
if (!fs.existsSync(TEMPLATES)) {
  console.log(`FAIL 0 the private templates are installed (nothing at ${TEMPLATES}; set SCRIPT_WORKER_TEMPLATES or install them)`);
  process.exit(1);
}
const SECRET = "e2e-" + Math.random().toString(36).slice(2);
// made-up inputs in the shapes script-desk files (logic.ts JobInputs)
const context = sanitizeContext({ niche: "bookkeeping for cafe owners", product: { name: "Counterbook", what: "Monthly bookkeeping for cafes", cta: "Comment BOOKS for the price list" } });
const transcript = "I kept the books for my parents' cafe for ten years. Most owners open their receipts once a year. Open them every Monday instead. Follow for part two.";
const source = { platform: "instagram", author: "made.up.creator", views: 52000, likes: 2100, comments: 88, shares: 140, postedAt: "2026-09-01T09:00:00.000Z", caption: "Receipts are not a once-a-year job.", transcript };
const adapted = "I've run Counterbook for ten years and signed 400 cafes. Most owners open their receipts once a year. Open them every Monday instead. Comment BOOKS for the price list.";
const queue = [
  { id: "j-hooks", kind: "hooks", request: { topic: "cafe owners who dread tax season", context } },
  { id: "j-breakdown", kind: "breakdown", request: { source, context } },
  { id: "j-claims", kind: "claims", request: { original: transcript, adapted, context } },
];
const read = { hooks: readHooks, breakdown: readBreakdown, claims: readClaims };

const tempsBefore = new Set(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("script-desk-")));
const reports = [];
let claimed = 0;
let live = 0;
let peak = 0;
let refused = 0;

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (d) => (raw += d));
  req.on("end", () => {
    const send = (status, body) => (res.writeHead(status, { "Content-Type": "application/json" }), res.end(JSON.stringify(body)));
    if (req.headers["x-script-worker-secret"] !== SECRET) return (refused++, send(403, { error: "Forbidden." }));
    const body = JSON.parse(raw || "{}");
    if (body.op === "claim") {
      const next = queue.shift() ?? null;
      if (next) (claimed++, live++, (peak = Math.max(peak, live)));
      return send(200, { job: next });
    }
    live--;
    reports.push(body);
    return send(200, { ok: true });
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/`;

// Claude Code through a wrapper that writes down the environment it gets
const spy = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-claude-env-"));
const wrapper = path.join(spy, "claude");
fs.writeFileSync(wrapper, `#!/bin/sh\nenv > "${spy}/env-$$.txt"\nexec claude "$@"\n`, { mode: 0o755 });

const started = Date.now();
const child = spawn(process.execPath, [path.join(HERE, "worker.mjs")], {
  env: { ...process.env, SCRIPT_WORKER_URL: url, SCRIPT_WORKER_SECRET: SECRET, ANTHROPIC_API_KEY: "sk-ant-api03-not-a-real-key", CLAUDECODE: "1", CLAUDE_BIN: wrapper },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (d) => (log += d));
child.stderr.on("data", (d) => (log += d));
while (reports.length < 3 && Date.now() - started < 300_000) await new Promise((r) => setTimeout(r, 500));
child.kill("SIGTERM");
await new Promise((r) => child.on("close", r));
server.close();

let fails = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fails++;
};
check("1 the worker claimed all three jobs", claimed === 3, `${claimed}`);
check("2 never more than two at once", peak <= 2 && peak >= 1, `peak ${peak}`);
check("3 every call carried the secret", refused === 0, `${refused} refused`);
for (const r of reports) {
  const kind = r.id.replace("j-", "");
  const answer = r.op === "done" ? read[kind](r.text) : null;
  check(`4 ${kind} built from its inputs, done on Claude Code and readable in its JSON shape`, Boolean(answer), r.op === "done" ? `${r.model}, ${Math.round(r.ms / 1000)}s` : r.error);
}
const left = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("script-desk-") && !tempsBefore.has(f));
check("5 no temp folder left behind", left.length === 0, left.join(", "));
check("6 answered by Opus 5.5", reports.every((r) => r.model === "claude-opus-5-5"), [...new Set(reports.map((r) => r.model))].join(", "));
const envs = fs.readdirSync(spy).filter((f) => f.startsWith("env-")).map((f) => fs.readFileSync(path.join(spy, f), "utf8"));
const leaked = envs.flatMap((e) => e.split("\n").map((l) => l.split("=")[0]).filter((k) => /^(ANTHROPIC_|CLAUDECODE$|SCRIPT_WORKER_SECRET$)|KEY|TOKEN|SECRET/.test(k)));
check("7 Claude Code got no API key, token, secret or CLAUDECODE", envs.length === 3 && leaked.length === 0, `${envs.length} runs seen${leaked.length ? `, leaked ${[...new Set(leaked)].join(" ")}` : ""}`);
fs.rmSync(spy, { recursive: true, force: true });

// 8: what the worker's exact arguments load, from Claude Code's own init event (stream-json in place of json)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-init-"));
fs.mkdirSync(path.join(tmp, "empty"));
fs.writeFileSync(path.join(tmp, "system.txt"), "Answer in one word.");
const args = claudeArgs(path.join(tmp, "system.txt"), "claude-opus-5-5", "low").map((a) => (a === "json" ? "stream-json" : a));
const init = await new Promise((resolve) => {
  const c = spawn("claude", [...args, "--verbose"], { cwd: path.join(tmp, "empty"), env: childEnv(process.env), stdio: ["pipe", "pipe", "ignore"] });
  let buf = "";
  c.stdout.on("data", (d) => (buf += d));
  c.on("close", () => resolve(buf.split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((e) => e?.type === "system" && e.subtype === "init") ?? null));
  c.stdin.end("Say ok.");
});
fs.rmSync(tmp, { recursive: true, force: true });
const loaded = init ? { tools: init.tools?.length, mcp: init.mcp_servers?.length, commands: init.slash_commands?.length, skills: init.skills?.length } : null;
check("8 Claude Code loads no tools, MCP servers, slash commands or skills", Boolean(loaded) && Object.values(loaded).every((n) => n === 0), JSON.stringify(loaded));
console.log(`${Math.round((Date.now() - started) / 1000)}s in all. Worker log:\n${log.trim()}`);
process.exit(fails ? 1 : 0);
