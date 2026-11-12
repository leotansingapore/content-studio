// First-run set-up at /welcome, modelled on Holo's: the website, where you post, the read (with two questions to fill
// the wait), a review confirmed section by section, connecting accounts where this sign-in may, and a finish that opens
// the writer on the brand's first topic. The steps are onboardingFlow.ts; this file owns the read and the savers, which
// are the ones Add a brand uses (brand kit, positioning, social accounts, voice), written to the open brand.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { isDna, NETWORKS, parseTopics, profileAddress, READ_STEPS, readBody, type BrandDna } from "@/lib/addBrand";
import { failedLine } from "@/lib/brandRead";
import { DEFAULT_BRAND, loadBrand, normalizeHandle, normalizeHex, saveBrand } from "@/lib/carousel";
import { saveCreateTopic } from "@/lib/createTopic";
import { callFn, EdgeError } from "@/lib/edgeFn";
import { saveGoals, setPlatformGoal } from "@/lib/goals";
import { NEW_POST } from "@/lib/newPost";
import {
  afterConnect, afterNetworks, back, backStep, confirmSection, firstTopic, flowKey, mainPlatform, newFlow, noSite, parseFlow, patchDraft, progress, readDone,
  readFailed, reopenSection, stopWaiting, submitNoSite, submitSite, toggleNetwork, type Draft, type Flow, type Network, type Section,
} from "@/lib/onboardingFlow";
import { EMPTY_POSITIONING, goalChips, loadPositioning, saveGoal, savePositioning, type GoalKind } from "@/lib/positioning";
import { activeProfileId } from "@/lib/profiles";
import { speakerFor } from "@/lib/remixBrand";
import { loadSocialAccounts, saveSocialAccounts } from "@/lib/socialAccounts";
import { checkSocialConnect, connectLink, saveConnectReturn, socialConnectShown } from "@/lib/socialConnect";
import { loadVoiceProfile, saveVoiceProfile } from "@/lib/voiceProfile";
import { ConnectStep, DoneStep, NetworksStep, NoSiteStep, QUIET, ReadingStep, ReviewStep, WebsiteStep } from "./OnboardingSteps";

const kept = (userId: string): Flow | null => {
  try {
    return parseFlow(localStorage.getItem(flowKey(userId)));
  } catch {
    return null;
  }
};

// One read per submit, outside React, so leaving the page or a second mount never sends it twice. The logo it finds
// goes to the brand kit there and then (onboardingFlow.ts says why), unless the kit has one.
const reads = new Map<string, Promise<BrandDna>>();
function readSite(userId: string, address: string, at: number): Promise<BrandDna> {
  const key = `${userId}|${address}|${at}`;
  let p = reads.get(key);
  if (!p) {
    p = callFn<BrandDna>("brand-dna", readBody(address), failedLine(address)).then((d) => {
      // an answer of another shape would break the review: it counts as a failed read
      if (!isDna(d)) throw new Error(failedLine(address));
      const kit = loadBrand(userId) ?? DEFAULT_BRAND;
      if (d.logo && !kit.logo) saveBrand(userId, { ...kit, logo: d.logo });
      return d;
    });
    reads.set(key, p);
  }
  return p;
}
// brand-dna's own 422 ends "or start with just a name", which only fits /brands/new
const failLine = (e: unknown, address: string) => (e instanceof EdgeError && e.status !== 422 && e.message ? e.message : failedLine(address));

/** A confirmed section's values, written through each store's own saver to the open brand. */
function saveSection(userId: string, f: Flow, s: Section): void {
  const d = f.draft;
  const at = new Date().toISOString();
  const kit = loadBrand(userId) ?? DEFAULT_BRAND;
  const pos = loadPositioning(userId) ?? EMPTY_POSITIONING;
  if (s === "brand") {
    // the kit's Instagram, Facebook and handle as Add a brand sets them (newBrandKit), for the networks picked
    const ig = f.networks.includes("instagram") ? normalizeHandle(d.handles.instagram ?? "").replace(/^@/, "") : "";
    const fb = f.networks.includes("facebook") ? (d.handles.facebook ?? "").trim() : "";
    saveBrand(userId, { ...kit, name: d.name.trim().slice(0, 40), profession: d.profession.trim(), ...(ig ? { handle: `@${ig}`, instagram: ig } : {}), ...(fb ? { facebook: fb } : {}) });
    const platform = mainPlatform(f, pos.platform);
    savePositioning(userId, { ...pos, oneLiner: d.oneLiner.trim(), audience: d.audience, audienceDetail: d.audienceDetail.trim(), platform, ...(f.cadence ? { cadence: f.cadence } : {}) });
    if (f.cadence) saveGoals(userId, { [platform]: f.cadence });
    const found = NETWORKS.filter((n) => d.handles[n.key]?.trim() && f.networks.includes(n.key));
    if (found.length) {
      const accounts = { ...loadSocialAccounts(userId) };
      for (const n of found) accounts[n.key] = { handle: profileAddress(n.base, d.handles[n.key]!.trim()), connectedAt: accounts[n.key]?.connectedAt ?? at };
      saveSocialAccounts(userId, accounts);
    }
  }
  if (s === "look") {
    const hex = normalizeHex(d.colour);
    if (hex) saveBrand(userId, { ...kit, color: hex });
  }
  if (s === "voice") {
    if (d.voice.trim()) saveVoiceProfile(userId, { posts: loadVoiceProfile(userId)?.posts ?? [], voiceSummary: d.voice.trim(), updatedAt: at });
    savePositioning(userId, { ...pos, topics: parseTopics(d.topics) });
  }
}

export default function OnboardingFlow({ userId, go }: { userId: string; /** Marks the account onboarded, then opens the page. */ go: (to: string) => void }) {
  const [flow, setFlow] = useState<Flow>(() => kept(userId) ?? newFlow());
  const [canConnect, setCanConnect] = useState(socialConnectShown);
  const [logo, setLogo] = useState(() => loadBrand(userId)?.logo ?? "");
  const [now, setNow] = useState(Date.now);
  const [connecting, setConnecting] = useState("");
  const [connectError, setConnectError] = useState("");
  const touched = useRef(false);
  const goals = useMemo(() => goalChips(speakerFor(userId)), [userId]);

  const change = (fn: (f: Flow) => Flow) => {
    touched.current = true;
    setFlow(fn);
  };
  const patch = (p: Partial<Draft>) => change((f) => patchDraft(f, p));

  useEffect(() => {
    document.title = "Welcome - Postmosis";
    let live = true;
    void checkSocialConnect().then((on) => live && setCanConnect(on));
    // Until something is done here, a flow the sync brings down from another device replaces this empty one.
    const watch = window.setInterval(() => {
      if (touched.current) return window.clearInterval(watch);
      const cloud = kept(userId);
      if (cloud) setFlow((f) => (JSON.stringify(f) === JSON.stringify(cloud) ? f : cloud));
    }, 1500);
    return () => {
      live = false;
      window.clearInterval(watch);
    };
  }, [userId]);

  // Kept on every change, under the synced prefix: a reload or another device opens on the same step and values.
  useEffect(() => {
    if (!touched.current) return;
    try {
      localStorage.setItem(flowKey(userId), JSON.stringify(flow));
    } catch {
      // storage full or blocked: the flow still works for this visit
    }
  }, [flow, userId]);

  // The read: started the moment the site is submitted, and again after a reload that caught it running.
  useEffect(() => {
    if (flow.read !== "running") return;
    const { address, readAt } = flow;
    let live = true;
    const mine = (f: Flow) => f.address === address && f.readAt === readAt;
    readSite(userId, address, readAt).then(
      (d) => {
        if (!live) return;
        setLogo(loadBrand(userId)?.logo ?? "");
        change((f) => (mine(f) ? readDone(f, d) : f));
      },
      (e) => live && change((f) => (mine(f) ? readFailed(f, failLine(e, address)) : f)),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.read, flow.address, flow.readAt, userId]);

  const waiting = flow.step === "reading";
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [waiting]);
  // the steps tick over while the one request runs; the last waits for the answer (as /brands/new)
  const tick = Math.max(0, Math.min(Math.floor((now - flow.readAt) / 2500), READ_STEPS.length - 1));

  const confirm = (s: Section) => {
    saveSection(userId, flow, s);
    change((f) => confirmSection(f, s, canConnect));
  };
  const removeLogo = () => {
    const kit = loadBrand(userId);
    if (kit) saveBrand(userId, { ...kit, logo: undefined });
    setLogo("");
  };
  const connect = async (n: Network) => {
    setConnecting(n);
    setConnectError("");
    try {
      saveConnectReturn("/welcome");
      const { authUrl } = await connectLink(activeProfileId(userId), n);
      window.location.assign(authUrl);
    } catch (e) {
      setConnecting("");
      setConnectError(e instanceof Error ? e.message : "Couldn't start the connection. Try again in a minute.");
    }
  };
  const skip = () => {
    // what was typed for "What do you do?" is kept even on the way out: unanswered, writers write as a financial adviser
    const kit = loadBrand(userId) ?? DEFAULT_BRAND;
    const p = flow.draft.profession.trim();
    if (p && !kit.profession?.trim()) saveBrand(userId, { ...kit, profession: p, name: kit.name.trim() ? kit.name : flow.draft.name.trim().slice(0, 40) });
    go("/home");
  };
  const write = () => {
    const topic = firstTopic(flow);
    if (topic) saveCreateTopic(userId, topic);
    go(NEW_POST);
  };

  const { at, of } = progress(flow, canConnect);
  return (
    <div className="mx-auto max-w-xl space-y-6 py-4">
      <div className="flex items-center gap-3">
        {backStep(flow) ? (
          <button type="button" onClick={() => change(back)} aria-label="Back" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeftIcon className="h-5 w-5" />
          </button>
        ) : (
          <span className="h-11 w-0" />
        )}
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={at} aria-valuemin={1} aria-valuemax={of} aria-label={`Step ${at} of ${of}`}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(at / of) * 100}%` }} />
        </div>
        <button type="button" onClick={skip} className={`${QUIET} shrink-0`}>Skip set-up</button>
      </div>

      {flow.step === "website" && (
        <WebsiteStep value={flow.typed} onChange={(v) => change((f) => ({ ...f, typed: v }))} onRead={() => change((f) => submitSite(f, Date.now()))} onNoSite={() => change(noSite)} />
      )}
      {flow.step === "nosite" && <NoSiteStep draft={flow.draft} patch={patch} onNext={() => change(submitNoSite)} onHaveSite={() => change(back)} />}
      {flow.step === "networks" && <NetworksStep picked={flow.networks} onToggle={(n) => change((f) => toggleNetwork(f, n))} onNext={() => change(afterNetworks)} />}
      {flow.step === "reading" && (
        <ReadingStep
          flow={flow}
          tick={tick}
          goals={goals}
          onGoal={(k: GoalKind) => {
            saveGoal(userId, goals[k], k);
            change((f) => ({ ...f, goalKind: k }));
          }}
          onCadence={(n) => {
            setPlatformGoal(userId, mainPlatform(flow, EMPTY_POSITIONING.platform), n);
            change((f) => ({ ...f, cadence: n }));
          }}
          onStop={() => change(stopWaiting)}
        />
      )}
      {flow.step === "review" && <ReviewStep flow={flow} patch={patch} logo={logo} onRemoveLogo={removeLogo} onConfirm={confirm} onReopen={(s) => change((f) => reopenSection(f, s))} />}
      {flow.step === "connect" && <ConnectStep networks={flow.networks} busy={connecting} error={connectError} onConnect={(n) => void connect(n)} onNext={() => change(afterConnect)} />}
      {flow.step === "done" && <DoneStep flow={flow} logo={!!logo} onWrite={write} />}
    </div>
  );
}
