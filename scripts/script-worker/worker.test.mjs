import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { PARALLEL, STOPPED, childEnv, claudeArgs, problemOf, readClaudeJson, runClaude, runJob, startWorker, templatesOf } from "./worker.mjs";

// A child process that answers like `claude -p --output-format json` and records what it was given.
function fakeSpawn(answer, seen) {
  return (bin, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => child.emit("close", null);
    let input = "";
    child.stdin = {
      on: () => child.stdin,
      end: (s) => {
        input = s;
        const systemFile = args[args.indexOf("--system-prompt-file") + 1];
        seen.push({ bin, args, opts, input, system: fs.readFileSync(systemFile, "utf8"), cwdEmpty: fs.readdirSync(opts.cwd).length === 0, systemFile });
        setTimeout(() => {
          if (answer) child.stdout.emit("data", Buffer.from(answer));
          child.emit("close", 0);
        }, 5);
      },
    };
    return child;
  };
}

const REQUEST = { system: "Stub system prompt.", message: "Stub message.", model: "claude-opus-5-5", effort: "low" };

// A made-up templates module, as the private one on Leo's Mac is shaped: build(kind, inputs) -> the request.
const STUB = `export function build(kind, inputs) {
  if (kind === "boom") throw new Error("no such kind");
  return { system: "Stub system for " + kind + ".", message: "Stub message about " + inputs.topic + ".", model: "claude-opus-5-5", effort: kind === "rescript" ? "medium" : "low" };
}`;
function stubTemplates(source = STUB) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-templates-"));
  const file = path.join(dir, "templates.mjs");
  fs.writeFileSync(file, source);
  return { file, done: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const OK = JSON.stringify({ result: '{"hooks": []}', is_error: false, modelUsage: { "claude-opus-5-5": {} } });

describe("script worker", () => {
  it("hands Claude Code an environment with no key, token or parent-session marker", () => {
    const env = childEnv({
      PATH: "/bin", HOME: "/Users/leo", ANTHROPIC_API_KEY: "sk-ant", ANTHROPIC_BASE_URL: "x", CLAUDECODE: "1", CLAUDE_CODE_USE_BEDROCK: "1",
      CLAUDE_CODE_OAUTH_TOKEN: "t", SCRIPT_WORKER_SECRET: "s", BROWSER_USE_API_KEY: "bu", AWS_PROFILE: "p", GITHUB_TOKEN: "g", OPENAI_API_KEY: "o",
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/Users/leo" });
  });

  it("runs Claude Code with the reference runner's arguments: no tools, no MCP, no settings, no saved session", () => {
    expect(claudeArgs("/t/system.txt", "claude-opus-5-5", "medium")).toEqual([
      "-p", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence",
      "--output-format", "json", "--model", "claude-opus-5-5", "--effort", "medium", "--system-prompt-file", "/t/system.txt",
    ]);
  });

  it("reads Claude Code's JSON, and turns a sign-out, a limit or an empty answer into a sentence", () => {
    expect(readClaudeJson(OK)).toEqual({ text: '{"hooks": []}', model: "claude-opus-5-5" });
    // the writer is the model with the most output, not the first key (a Haiku side call can come first)
    const both = { result: "x", modelUsage: { "claude-haiku-5-5": { outputTokens: 20 }, "claude-opus-5-5": { outputTokens: 528 } } };
    expect(readClaudeJson(JSON.stringify(both)).model).toBe("claude-opus-5-5");
    const tiny = { result: "x", modelUsage: { "claude-haiku-5-5": { outputTokens: 20 }, "claude-opus-5-5": { outputTokens: 11 } } };
    expect(readClaudeJson(JSON.stringify(tiny), "claude-opus-5-5").model).toBe("claude-opus-5-5");
    expect(readClaudeJson(JSON.stringify({ result: "x", modelUsage: { "claude-sonnet-5-5": {} } }), "claude-opus-5-5").model).toBe("claude-sonnet-5-5");
    expect(() => readClaudeJson(JSON.stringify({ result: "", is_error: true }))).toThrow(/answered with an error/);
    expect(() => readClaudeJson(JSON.stringify({ result: "Failed to authenticate. API Error: 401", is_error: true }))).toThrow(/signed out/);
    expect(problemOf("Claude AI usage limit reached")).toMatch(/limit is reached/);
    expect(problemOf("all fine")).toBeNull();
  });

  it("writes the system prompt to a fresh folder, sends the message on stdin from an empty folder, and deletes both", async () => {
    const seen = [];
    const answer = await runClaude(REQUEST, { spawnFn: fakeSpawn(OK, seen), env: { PATH: "/bin", ANTHROPIC_API_KEY: "sk", CLAUDECODE: "1" } });
    expect(answer.model).toBe("claude-opus-5-5");
    const [s] = seen;
    expect([s.bin, s.input, s.system, s.cwdEmpty]).toEqual(["claude", "Stub message.", "Stub system prompt.", true]);
    expect(s.opts.env).toEqual({ PATH: "/bin" });
    expect(fs.existsSync(s.systemFile)).toBe(false);
    expect(fs.existsSync(s.opts.cwd)).toBe(false);
  });

  it("refuses a model or effort it doesn't run, and a job with no message, without starting Claude", async () => {
    const seen = [];
    await expect(runClaude({ ...REQUEST, model: "claude-sonnet-4" }, { spawnFn: fakeSpawn(OK, seen) })).rejects.toThrow(/model or effort/);
    await expect(runClaude({ ...REQUEST, effort: "max" }, { spawnFn: fakeSpawn(OK, seen) })).rejects.toThrow(/model or effort/);
    await expect(runClaude({ ...REQUEST, message: " " }, { spawnFn: fakeSpawn(OK, seen) })).rejects.toThrow(/no message/);
    expect(seen).toEqual([]);
  });

  it("reports a run it couldn't even set up (a full disk) as a failure, never a throw", async () => {
    const p = runClaude(REQUEST, { tmpdir: "/nonexistent/for-this-test", spawnFn: fakeSpawn(OK, []) });
    await expect(p).rejects.toThrow(/ENOENT/);
  });

  it("builds each job's request with the templates module and runs it: the system prompt in the file, the message on stdin", async () => {
    const t = stubTemplates();
    try {
      const seen = [];
      await runJob({ id: "j", kind: "rescript", request: { topic: "pricing" } }, { templates: t.file, spawnFn: fakeSpawn(OK, seen), env: { PATH: "/bin" } });
      expect([seen[0].system, seen[0].input]).toEqual(["Stub system for rescript.", "Stub message about pricing."]);
      expect(seen[0].args.slice(seen[0].args.indexOf("--effort"), seen[0].args.indexOf("--effort") + 2)).toEqual(["--effort", "medium"]);
      // a build that throws fails the job with a sentence, and Claude never starts
      await expect(runJob({ id: "j", kind: "boom", request: {} }, { templates: t.file, spawnFn: fakeSpawn(OK, seen) })).rejects.toThrow(/couldn't build this boom job \(no such kind\)/);
      expect(seen).toHaveLength(1);
    } finally {
      t.done();
    }
  });

  it("fails every job with a plain sentence while the templates aren't installed, and loads them once they are", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "worker-test-missing-"));
    const file = path.join(dir, "templates.mjs");
    try {
      const seen = [];
      await expect(runJob({ id: "j", kind: "hooks", request: { topic: "x" } }, { templates: file, spawnFn: fakeSpawn(OK, seen) })).rejects.toThrow(/no templates installed/);
      expect(seen).toEqual([]);
      fs.writeFileSync(file, STUB);
      await runJob({ id: "j", kind: "hooks", request: { topic: "x" } }, { templates: file, spawnFn: fakeSpawn(OK, seen), env: { PATH: "/bin" } });
      expect(seen[0].input).toBe("Stub message about x.");
      const bad = stubTemplates("export const nothing = 1;");
      await expect(templatesOf(bad.file)).rejects.toThrow(/no build function/);
      bad.done();
      const broken = stubTemplates("export function build( {");
      await expect(templatesOf(broken.file)).rejects.toThrow(/didn't load \(.+\)\. Reinstall them/);
      broken.done();
      const empty = stubTemplates("export const build = () => null;");
      await expect(runJob({ id: "j", kind: "hooks", request: {} }, { templates: empty.file, spawnFn: fakeSpawn(OK, seen) })).rejects.toThrow(/couldn't build this hooks job \(build gave no request\)/);
      empty.done();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // a child that never answers until it is killed, and whose stdin breaks (claude gone before it read the message)
  function hangingSpawn(killed) {
    return () => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.stdin = new EventEmitter();
      child.stdin.end = () => setTimeout(() => child.stdin.emit("error", Object.assign(new Error("write EPIPE"), { code: "EPIPE" })), 1);
      child.kill = (sig) => (killed.push(sig), sig === "SIGKILL" && setTimeout(() => child.emit("close", null), 1));
      return child;
    };
  }

  it("ends a run past its time with SIGTERM then SIGKILL, survives a broken stdin, and says so", async () => {
    vi.useFakeTimers();
    try {
      const killed = [];
      const p = runClaude(REQUEST, { spawnFn: hangingSpawn(killed), timeoutMs: 1000 });
      const caught = p.catch((e) => e);
      await vi.advanceTimersByTimeAsync(1000);
      expect(killed).toEqual(["SIGTERM"]);
      await vi.advanceTimersByTimeAsync(10_001);
      expect(killed).toEqual(["SIGTERM", "SIGKILL"]);
      expect((await caught).message).toMatch(/over 3 minutes/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("on stop, ends the running jobs, reports them failed, and hands back a job claimed as it stopped", async () => {
    const reports = [];
    let claims = 0;
    let w;
    const fetchFn = async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.op === "claim") {
        claims++;
        // the second claim answers after the stop has begun
        if (claims === 2) {
          const stopping = w.stop();
          void stopping;
        }
        return Response.json({ job: claims <= 2 ? { id: `j${claims}`, kind: "hooks", request: { topic: "x" } } : null });
      }
      reports.push(body);
      return Response.json({ ok: true });
    };
    const run = (_r, { signal }) => new Promise((_ok, bad) => signal.addEventListener("abort", () => bad(new Error(STOPPED))));
    w = startWorker({ url: "http://stub", secret: "sec", worker: "mac", run, fetchFn, log: () => {} });
    await new Promise((ok) => setTimeout(ok, 50));
    await w.stop();
    expect(reports.map((r) => [r.op, r.id, r.error])).toEqual(expect.arrayContaining([["failed", "j1", STOPPED], ["failed", "j2", STOPPED]]));
    expect(claims).toBe(2);
  });

  it("runs at most two jobs at once and reports each one done or failed", async () => {
    const queue = ["a", "b", "c"].map((id, i) => ({ id, kind: "hooks", request: { topic: `job ${i}` } }));
    const reports = [];
    let peak = 0;
    let live = 0;
    const fetchFn = async (_url, init) => {
      const body = JSON.parse(init.body);
      expect(init.headers["x-script-worker-secret"]).toBe("sec");
      if (body.op === "claim") return Response.json({ job: queue.shift() ?? null });
      reports.push(body);
      return Response.json({ ok: true });
    };
    const run = async (job) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((ok) => setTimeout(ok, 30));
      live--;
      if (job.request.topic === "job 1") throw new Error("Claude Code didn't answer (exit 1: nothing). Try again.");
      return { text: `answer to ${job.request.topic}`, model: "claude-opus-5-5" };
    };
    const w = startWorker({ url: "http://stub", secret: "sec", worker: "mac", run, fetchFn, log: () => {} });
    while (reports.length < 3) await new Promise((ok) => setTimeout(ok, 10));
    await w.stop();
    expect(peak).toBe(PARALLEL);
    expect(reports.map((r) => [r.op, r.id])).toEqual(expect.arrayContaining([["done", "a"], ["failed", "b"], ["done", "c"]]));
    expect(reports.find((r) => r.id === "b").error).toMatch(/didn't answer/);
    expect(reports.find((r) => r.id === "a")).toMatchObject({ worker: "mac", text: "answer to job 0", model: "claude-opus-5-5" });
  });
});
