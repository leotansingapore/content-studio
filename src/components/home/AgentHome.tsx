// Leo's Home (docs/north-star/items/agent-home.md; phase6-build-brief.md, "agent-home"): the header line, Next up, the
// "Ask the agent for" tiles, Agent now and the agent's composer, in place of the due card, the Today rows, "Your next
// move", the three buttons and "Get set up". HomePage loads it lazily, so the agent engine never loads for anyone else.

import { useMemo, useRef, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import AgentNow from "@/components/home/AgentNow";
import AskFor from "@/components/home/AskFor";
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
import { activeProfileId, loadProfiles } from "@/lib/profiles";
import type { Board, Me } from "@/lib/reelsBoard";
import { ownBrandName } from "@/lib/remixBrand";
import { readTeamPosts, readTeamReviews } from "@/lib/teamPosts";
import { useScrollToHash } from "@/lib/urlState";

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
  useScrollToHash();

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
              <MessageSquare /> Ask the agent
            </Link>
          </Button>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <NextUp
          className="lg:col-start-1 lg:row-start-1"
          userId={userId}
          today={sgDay()}
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
            teamPosts: readTeamPosts(userId),
            reviews: readTeamReviews(userId),
            autopilot: plan?.autopilot,
            campaigns: plan?.list,
            ideas: plan?.ideas,
            setup,
          }}
        />
        <AskFor className="lg:col-span-2" userId={userId} onPick={(text) => composer.current?.fill(text)} />
        <AgentNow className="lg:col-start-2 lg:row-start-1 lg:self-start" now={agentNow(userId)} />
        {/* pinned above the phone's bottom bar while Home's top part scrolls */}
        <div className="sticky bottom-[calc(3.25rem+env(safe-area-inset-bottom))] z-20 -mx-4 bg-background px-4 py-2 sm:-mx-6 sm:px-6 lg:bottom-0 lg:col-span-2 lg:mx-0 lg:px-0">
          <Composer ref={composer} userId={userId} threadId={null} slot="home" placeholder={PLACEHOLDER} onSent={(id) => navigate(links.agent({ thread: id }))} />
        </div>
      </div>
    </div>
  );
}
