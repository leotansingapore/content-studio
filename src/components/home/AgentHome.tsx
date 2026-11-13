// Leo's Home (docs/north-star/items/agent-home.md; phase6-build-brief.md, "agent-home"), in Fastlane's order since 12 Nov
// (11 Nov frames t01-18, t01-03): "What should the agent make for <brand>?" with the composer under it, Agent now as one
// line over the box, the ask-for line, then Next up, Recent creations, Start from a format, Remix a competitor ad and
// Publish and promote (HomeRows). HomePage loads it lazily, so the agent engine never loads for anyone else.

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import AgentNow from "@/components/home/AgentNow";
import AskFor from "@/components/home/AskFor";
import { useBrandChannels } from "@/components/ChannelsBlock";
import NextUp from "@/components/home/NextUp";
import { useThreads } from "@/components/agent/AgentThread";
import Composer, { useAgentUsage, type ComposerHandle } from "@/components/agent/Composer";
import { leftOf, limitOf } from "@/lib/agentBudget";
import { priceLine } from "@/lib/agentCards";
import { agentNow, waitingCards } from "@/lib/agentRun";
import type { Campaign } from "@/lib/campaigns";
import { draftsOfBrand, type DraftEntry } from "@/lib/draftHistory";
import { sgDay } from "@/lib/goals";
import { links } from "@/lib/links";
import type { NextUpInput } from "@/lib/needsYou";
import { activeProfile, activeProfileId, loadProfiles } from "@/lib/profiles";
import { refreshIfStale } from "@/lib/realNumbers";
import type { Board, Me } from "@/lib/reelsBoard";
import { ownBrandName } from "@/lib/remixBrand";
import { socialConnectShown } from "@/lib/socialConnect";
import { readTeamPostsHere, readTeamReviews } from "@/lib/teamPosts";
import { useScrollToHash } from "@/lib/urlState";
import type { HomeCampaign } from "@/components/home/HomeRows";

// Recent creations, formats, competitor ads and Publish and promote load after Home paints; a chunk gone after a deploy draws none
const HomeRows = lazy(() => import("@/components/home/HomeRows").catch(() => ({ default: () => null })));

const PLACEHOLDER = "Ask the agent for a post, a remix, a video or a campaign";

interface Props {
  userId: string;
  /** The page's heading and GoalLine, drawn by HomePage (and its fallback while this chunk loads). */
  greeting: ReactNode;
  drafts: DraftEntry[];
  day: { me: Me; board: Board | null } | null;
  plan: { autopilot: number; ideas: number; list: Campaign[] } | null;
  market: boolean;
  setup: { label: string; to: string } | null;
  /** Publish and promote's Campaigns card (HomePage reads them). */
  campaigns?: HomeCampaign[];
  markPosted: (draftId: string) => void;
  blocked: (draftId: string) => string | null;
}

export default function AgentHome({ userId, greeting, drafts, day, plan, market, setup, campaigns, markPosted, blocked }: Props) {
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
    <div className="space-y-8">
      <div className="space-y-2">
        {greeting}
        <p className="text-center text-xs tabular-nums text-muted-foreground">{meta}</p>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-2">
        <AgentNow compact now={agentNow(userId)} />
        <Composer ref={composer} userId={userId} threadId={null} slot="home" placeholder={PLACEHOLDER} onSent={(id) => navigate(links.agent({ thread: id }))} />
        <AskFor userId={userId} onPick={(text) => composer.current?.fill(text)} />
      </div>
      <NextUp
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
          boardBrand: activeProfile(userId).boardBrand,
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
      <Suspense fallback={null}>
        <HomeRows className="min-w-0" userId={userId} drafts={drafts} campaigns={campaigns} leo />
      </Suspense>
    </div>
  );
}
