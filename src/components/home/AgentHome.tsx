// Leo's Home (docs/north-star/items/agent-home.md; phase6-build-brief.md, "agent-home"): the header line, Next up, the
// "Ask the agent for" tiles, Agent now and the agent's composer, in place of the due card, the Today rows, "Your next
// move", the three buttons and "Get set up". HomePage loads it lazily, so the agent engine never loads for anyone else.

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChatIcon } from "@phosphor-icons/react";
import AgentNow from "@/components/home/AgentNow";
import AskFor from "@/components/home/AskFor";
import { useBrandChannels } from "@/components/ChannelsBlock";
import NextUp from "@/components/home/NextUp";
import { useThreads } from "@/components/agent/AgentThread";
import Composer, { useAgentUsage, type ComposerHandle } from "@/components/agent/Composer";
import { Button } from "@/components/ui/button";
import { leftOf, limitOf } from "@/lib/agentBudget";
import { priceLine } from "@/lib/agentCards";
import { agentNow, waitingCards } from "@/lib/agentRun";
import type { Campaign } from "@/lib/campaigns";
import { draftsOfBrand, type DraftEntry } from "@/lib/draftHistory";
import { sgDay } from "@/lib/goals";
import { links } from "@/lib/links";
import type { NextUpInput } from "@/lib/needsYou";
import { activeProfileId, loadProfiles } from "@/lib/profiles";
import { refreshIfStale } from "@/lib/realNumbers";
import type { Board, Me } from "@/lib/reelsBoard";
import { ownBrandName } from "@/lib/remixBrand";
import { socialConnectShown } from "@/lib/socialConnect";
import { readTeamPostsHere, readTeamReviews } from "@/lib/teamPosts";
import { useScrollToHash } from "@/lib/urlState";

// Recent creations, formats, competitor ads and Publish and promote load after Home paints; a chunk gone after a deploy draws none
const HomeRows = lazy(() => import("@/components/home/HomeRows").catch(() => ({ default: () => null })));

const HOME_HEAD = "flex flex-wrap items-start justify-between gap-x-6 gap-y-3";
const PLACEHOLDER = "Ask the agent for a post, a remix, a video or a campaign";

interface Props {
  userId: string;
  /** The greeting and GoalLine, drawn by HomePage (and its fallback while this chunk loads). */
  greeting: ReactNode;
  drafts: DraftEntry[];
  day: { me: Me; board: Board | null } | null;
  plan: { autopilot: number; ideas: number; list: Campaign[] } | null;
  market: boolean;
  setup: { label: string; to: string } | null;
  markPosted: (draftId: string) => void;
  blocked: (draftId: string) => string | null;
}

export default function AgentHome({ userId, greeting, drafts, day, plan, market, setup, markPosted, blocked }: Props) {
  const navigate = useNavigate();
  const threads = useThreads(userId);
  const usage = useAgentUsage();
  const composer = useRef<ComposerHandle>(null);
  const channels = useBrandChannels(userId);
  useScrollToHash();
  // the open brand's social north star (Next up's play row): its module loads after Home paints, as HomePage's plan rows'
  const [play, setPlay] = useState<NextUpInput["play"]>(null);
  useEffect(() => {
    let active = true;
    let off = () => {};
    void import("@/lib/socialNorthStar").then(
      (ns) => {
        if (!active) return;
        const read = () => setPlay(ns.homePlay(userId));
        read();
        off = ns.onSocialNsChanged(read);
      },
      () => {}, // a chunk gone after a deploy: no play row until the next load
    );
    return () => {
      active = false;
      off();
    };
  }, [userId]);
  // Home's open asks for the real numbers, at most every 6 hours and outside React; each pull also records Pace
  useEffect(() => {
    if (socialConnectShown()) refreshIfStale(userId);
  }, [userId]);

  // the posts board owner's "go out today" counts every brand's posts, as the Today row did
  const owner = !!day?.me.owner;
  const otherDrafts = useMemo(() => {
    if (!owner) return [];
    const open = activeProfileId(userId);
    return loadProfiles(userId)
      .filter((p) => p.id !== open)
      .flatMap((p) => draftsOfBrand(userId, p.id));
  }, [owner, userId, drafts]); // eslint-disable-line react-hooks/exhaustive-deps

  const left = leftOf(usage, "ai-video");
  const meta = [
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", weekday: "short", day: "numeric", month: "short" }).format(new Date()),
    ownBrandName(userId),
    left === null ? "" : `${left} of ${limitOf("ai-video")} AI videos left today`,
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="space-y-6">
      <header className={HOME_HEAD}>
        <div className="min-w-0">{greeting}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:justify-end">
          <p className="text-xs tabular-nums text-muted-foreground">{meta}</p>
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to={links.agent()}>
              <ChatIcon /> Ask the agent
            </Link>
          </Button>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <NextUp
          className="lg:col-start-1 lg:row-start-1"
          userId={userId}
          today={sgDay()}
          usage={usage}
          markPosted={markPosted}
          blocked={blocked}
          input={{
            cards: waitingCards(userId).map((w) => ({ ...w, price: priceLine(w.card, null) })),
            threads,
            drafts,
            otherDrafts,
            me: day?.me ?? null,
            board: day?.board ?? null,
            market,
            teamPosts: readTeamPostsHere(userId),
            reviews: readTeamReviews(userId),
            autopilot: plan?.autopilot,
            campaigns: plan?.list,
            ideas: plan?.ideas,
            play,
            // known 0 only: a brand never read on this device gets no row
            channels: socialConnectShown() ? channels?.channels.length : undefined,
            setup,
          }}
        />
        <AskFor className="lg:col-span-2" userId={userId} onPick={(text) => composer.current?.fill(text)} />
        <AgentNow className="lg:col-start-2 lg:row-start-1 lg:self-start" now={agentNow(userId)} />
        <Suspense fallback={null}>
          <HomeRows className="min-w-0 lg:col-span-2" userId={userId} drafts={drafts} />
        </Suspense>
        {/* pinned above the phone's bottom bar while Home's top part scrolls */}
        <div className="sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-background px-4 py-2 sm:-mx-6 sm:px-6 lg:bottom-0 lg:col-span-2 lg:mx-0 lg:px-0">
          <Composer ref={composer} userId={userId} threadId={null} slot="home" placeholder={PLACEHOLDER} onSent={(id) => navigate(links.agent({ thread: id }))} />
        </div>
      </div>
    </div>
  );
}
