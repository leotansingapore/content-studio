import { Link } from "react-router-dom";
import SectionTabs, { LEARN_TABS } from "@/components/SectionTabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Mic,
  Pencil,
  Lightbulb,
  Users as UsersIcon,
  History,
  Sparkles,
  Keyboard,
  AlertTriangle,
  ArrowRight,
  CalendarRange,
  Home,
  CalendarClock,
  Gauge,
  BarChart3,
  BookMarked,
  GraduationCap,
} from "lucide-react";

export default function TutorialPage() {
  return (
    <div className="space-y-6">
      <SectionTabs tabs={LEARN_TABS} />
      {/* Why */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-2xl">
            Why this tool exists
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-foreground">
          <p>
            Most new FCs stall at the same point - Tuesday afternoon, blank
            page, no first sentence. Posting once a week becomes once a month,
            then never. Day 41 is explicit:{" "}
            <strong>
              the highest-leverage habit in your first year is consistent
              content, not perfect content.
            </strong>
          </p>
          <p>
            Content Studio doesn&apos;t write your post for you. It removes the
            blank-page tax. You arrive with a topic and a real client moment;
            you leave 10 minutes later with three drafts to pick from, hashtags
            ready, an image prompt to drop into Canva. Edit into your voice.
            Publish.
          </p>
          <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
            <strong>Use it weekly.</strong> Treat it as scaffolding, not the
            final post.
          </p>
        </CardContent>
      </Card>

      {/* Setup once */}
      <Card className="border-accent/40 bg-accent/5 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mic className="h-5 w-5 text-accent-foreground" />
            <CardTitle className="font-serif text-xl">
              Setup once: lock in your voice
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>
            Go to{" "}
            <Link
              to="/voice"
              className="font-mono text-primary hover:underline"
            >
              /voice
            </Link>
            . Paste 3-5 of your past posts (LinkedIn / IG / FB - whatever you
            already have). Hit Save. The tool distills your tone, hook patterns,
            and structural quirks into a voice profile that&apos;s injected
            into every future generation. Drafts will sound like{" "}
            <em>you</em>, not like AI-generic.
          </p>
          <p className="text-muted-foreground">
            If you skip this step, drafts will read generic. Spend the 10
            minutes. It&apos;s the single biggest quality lever in the tool.
          </p>
          <Link
            to="/voice"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            Set your voice <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardContent>
      </Card>

      {/* The flow */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            <CardTitle className="font-serif text-xl">
              The guided flow on /generate
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p className="text-muted-foreground">
            The Write tab walks you through it one step at a time - Topic,
            Funnel, Idea, then Format. Every step has a sensible default, so you
            can click Next through the ones you don&apos;t care about and only
            tweak what matters. A progress bar up top lets you jump around.
          </p>
          <div>
            <p className="font-semibold">1. Topic (pick your pillar).</p>
            <p className="text-muted-foreground">
              Day 41 framework - Interest, Identity, Topic, Market.
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-6 text-muted-foreground">
              <li>
                <strong>Topic</strong> = the financial thing you want to teach
                (CPF SA top-ups)
              </li>
              <li>
                <strong>Market</strong> = the segment you want to attract (fresh
                grads earning $4K)
              </li>
              <li>
                <strong>Interest / Identity</strong> = social posts that
                humanise you
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold">
              2. Funnel &rarr; 3. Idea (the spark).
            </p>
            <p className="text-muted-foreground">
              Real client question, common mistake, news hook, story,
              before-after, &quot;3 things you didn&apos;t know&quot;,
              myth-bust.{" "}
              <strong>
                Strongest posts come from a real conversation you had this
                week.
              </strong>{" "}
              Type the actual question into Context. Specific beats generic
              every time.
            </p>
          </div>

          <div>
            <p className="font-semibold">
              4. Format (where and how to post).
            </p>
            <p className="text-muted-foreground">
              LinkedIn / IG / FB / TikTok &middot; Text / Carousel / Short
              video / Story &middot; DM keyword / Comment keyword / Save-share
              / Soft 15-min call / Open question &middot; young-adult /
              working-adult / parent / pre-retiree / general.
            </p>
            <p className="mt-1 text-muted-foreground">
              Optional: <strong>Singlish toggle</strong> if your audience lands
              harder with light &quot;lah / leh / can?&quot;.
            </p>
          </div>

          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p>
              Hit <strong>Generate 5 hooks</strong>. Pick the one you&apos;d
              actually write. Three full-body drafts stream in side-by-side.
              Click <strong>Use this</strong> on the strongest. Edit, copy,
              post.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* What happens after */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            What happens after you pick a draft
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong>Hashtags</strong> appear automatically (5-8 SG-relevant
                tags). One-click &quot;Copy all&quot;.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong>Image prompt</strong> appears - paste into Canva /
                kie.ai / Midjourney for the visual.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong>Word + character counters</strong> show whether
                you&apos;re inside each platform&apos;s sweet spot (LinkedIn
                ~140 words, IG caption first 138 chars critical).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                <strong>Compliance flags</strong> auto-scan for risky phrases
                (&quot;guaranteed&quot;, &quot;risk-free&quot;, &quot;100%
                safe&quot;, &quot;AIA is the best&quot;). Fix before you post.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <History className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                <strong>
                  Auto-saved to <Link to="/drafts" className="underline">/drafts</Link>
                </strong>{" "}
                - never lose work. Last 50 drafts kept per user.
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">The tabs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Tab</th>
                  <th className="py-2 pr-3 font-semibold">URL</th>
                  <th className="py-2 font-semibold">What&apos;s there</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Home className="h-3.5 w-3.5" /> Home
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /home
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Your dashboard: what to do next, this week&apos;s rhythm and
                    streak, and posts coming up.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Pencil className="h-3.5 w-3.5" /> Write
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /generate
                  </td>
                  <td className="py-2 text-muted-foreground">
                    The guided draft flow, with a live preview and craft check.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarRange className="h-3.5 w-3.5" /> Plan
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /plan
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Turn your positioning into a full week of posts, then add
                    the whole week to your calendar in one click.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5" /> Calendar
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /calendar
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Schedule posts onto days and mark them posted when they go
                    live.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5" /> Inspiration
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /inspiration
                  </td>
                  <td className="py-2 text-muted-foreground">
                    100 client-attracting examples mapped to Day 40-42.
                    Filter, click &quot;Use as vibe&quot; to pre-fill the form.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <UsersIcon className="h-3.5 w-3.5" /> Creators
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /profiles
                  </td>
                  <td className="py-2 text-muted-foreground">
                    33 SG finance creators worth following long-term.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Mic className="h-3.5 w-3.5" /> Voice
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /voice
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Set / update your voice profile.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <History className="h-3.5 w-3.5" /> My posts
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /drafts
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Every post you&apos;ve made. Filter by status, schedule,
                    mark posted, and log its numbers.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5" /> Coach
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /coach
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Scores your posts on hooks, CTA, length and more, with fixes
                    to try next.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5" /> Analytics
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /analytics
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Log real numbers and see your top posts and what&apos;s
                    working.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <BookMarked className="h-3.5 w-3.5" /> My Playbook
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /playbook
                  </td>
                  <td className="py-2 text-muted-foreground">
                    Your positioning, voice and saved examples in one place.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="h-3.5 w-3.5" /> Academy
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">
                    /academy
                  </td>
                  <td className="py-2 text-muted-foreground">
                    A short video course on creating content with AI.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Every page has its own URL. Share <code>/inspiration/&lt;id&gt;</code>{" "}
            or <code>/profiles/&lt;id&gt;</code> directly with peers in
            WhatsApp.
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Keyboard className="h-3.5 w-3.5" /> Shortcuts:{" "}
            <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">
              Cmd+Enter
            </kbd>{" "}
            generate &middot;{" "}
            <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono text-[10px]">
              Cmd+Shift+C
            </kbd>{" "}
            copy
          </p>
        </CardContent>
      </Card>

      {/* Hard rules */}
      <Card className="border-destructive/30 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Hard rules</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
            <li>
              <strong>Never publish raw output.</strong> Cut 30% of words.
              Swap generic examples for one from your real client conversations.
              The tool is scaffolding; your voice is the differentiator.
            </li>
            <li>
              <strong>Use a real client moment in Context.</strong> Generic
              prompt = generic draft.
            </li>
            <li>
              <strong>The hook is the post.</strong> First 1-2 lines decide
              whether anyone reads further. That&apos;s why hooks-first is on
              by default.
            </li>
            <li>
              <strong>One post per week is the floor.</strong> Sunday ideate /
              Tuesday draft / Thursday publish.
            </li>
          </ol>
        </CardContent>
      </Card>

      {/* Weekly rhythm */}
      <Card className="border-border/60 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">Weekly rhythm</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Day</th>
                  <th className="py-2 pr-3 font-semibold">What</th>
                  <th className="py-2 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                <tr>
                  <td className="py-2 pr-3 font-semibold">Sunday</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    List 5 client questions / news hooks / mistakes from this
                    week. Pick 1.
                  </td>
                  <td className="py-2 text-muted-foreground">30 min</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">Tuesday</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    Open <Link to="/generate" className="underline">Write</Link>, run the guided flow,
                    pick the strongest hook + body.
                  </td>
                  <td className="py-2 text-muted-foreground">15 min</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">Tuesday</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    Edit into your voice. Cut 30%. Add a real client moment.
                  </td>
                  <td className="py-2 text-muted-foreground">15 min</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 font-semibold">Thursday</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    Final read on mobile. Verify hashtags + CTA. Publish. Reply
                    to early DMs within 2 hours.
                  </td>
                  <td className="py-2 text-muted-foreground">15 min</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <strong>75 min/week. One post. 50 posts in your first year.</strong>{" "}
            That alone separates you from 90% of new FCs.
          </p>
        </CardContent>
      </Card>

      {/* First action */}
      <Card className="border-primary/40 bg-primary/5 shadow-card">
        <CardHeader>
          <CardTitle className="font-serif text-xl">First action</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>
              Go to{" "}
              <Link to="/voice" className="font-mono text-primary underline">
                /voice
              </Link>{" "}
              - paste 3-5 of your past posts. Save.
            </li>
            <li>
              Go to{" "}
              <Link
                to="/inspiration"
                className="font-mono text-primary underline"
              >
                /inspiration
              </Link>{" "}
              - pick a card, click &quot;Use as vibe&quot;.
            </li>
            <li>Generate. Edit. Publish by Friday.</li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/voice"
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Mic className="h-3.5 w-3.5" /> Set your voice
            </Link>
            <Link
              to="/inspiration"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold hover:bg-muted/50"
            >
              <Lightbulb className="h-3.5 w-3.5" /> Browse inspiration
            </Link>
            <Link
              to="/generate"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs font-semibold hover:bg-muted/50"
            >
              <Pencil className="h-3.5 w-3.5" /> Start generating
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
