import { useEffect } from "react";
import { Link } from "react-router-dom";
import { links, type GuideStep } from "@/lib/links";
import { useScrollToHash } from "@/lib/urlState";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Wand2,
  LayoutGrid,
  Video,
  FileText,
  ShieldCheck,
  CalendarClock,
  ExternalLink,
  PlayCircle,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { adviserBrand } from "@/lib/profession";
import { socialConnectShown } from "@/lib/socialConnect";

// Stable deep links. Tutorials point at a YouTube search so they never rot to a
// dead video, and stay current as creators re-publish.
function tut(q: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

interface Tool {
  name: string;
  what: string;
  url: string;
  tutorial?: string;
}

function ToolRow({ tool }: { tool: Tool }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{tool.name}</p>
        <p className="text-[11px] text-muted-foreground">{tool.what}</p>
      </div>
      <div className="flex items-center gap-2">
        {tool.tutorial && (
          <a
            href={tool.tutorial}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] [@media(pointer:coarse)]:min-h-11 font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <PlayCircle className="h-3 w-3" /> Tutorial
          </a>
        )}
        <a
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] [@media(pointer:coarse)]:min-h-11 font-semibold text-primary hover:bg-primary/10"
        >
          <ExternalLink className="h-3 w-3" /> Open
        </a>
      </div>
    </div>
  );
}

function Step({
  n,
  id,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  /** The step's #anchor (docs/deep-links.md). */
  id: GuideStep;
  icon: typeof Wand2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20 border-border/60 shadow-card">
      <CardHeader className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-primary text-[12px] font-bold text-primary-foreground">
            {n}
          </span>
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle className="font-serif text-lg font-semibold">
            {title}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-foreground/85">
        {children}
      </CardContent>
    </Card>
  );
}

export default function CreateGuidePage() {
  useScrollToHash();
  // Top posts is an adviser brand's library (Singapore finance creators): another brand's guide starts at the draft
  const top = adviserBrand();
  // Post it for me only shows once posting is switched on for this sign-in (Leo does it at onboarding)
  const posting = socialConnectShown();
  const n = (step: number) => (top ? step : step - 1);
  useEffect(() => {
    document.title = "Create the post - Postmosis";
    return () => {
      document.title = "Postmosis";
    };
  }, []);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Sparkles className="h-6 w-6 text-primary" />
          Create the post, end to end
        </h1>
      </header>

      {top && <Step n={1} id="idea" icon={TrendingUp} title="Find an idea that already works">
        <p>
          Open <Link to="/swipe" className="font-semibold text-primary hover:underline">Top posts</Link>{" "}
          and browse the best-performing posts from advisors like you. Each card
          shows the hook, why it worked, and how to adapt it. Pick one that fits
          your niche.
        </p>
      </Step>}

      <Step n={n(2)} id="draft" icon={Wand2} title="Turn it into your draft">
        {top ? (
          <p>
            Hit <span className="font-semibold">Remix in Write</span> on any post.
            That opens <Link to="/generate" className="font-semibold text-primary hover:underline">Write</Link>{" "}
            pre-filled with the angle, context and that advisor as a style
            reference. Generate hooks, pick one, then generate the full post in
            your own voice. Tune the audience, format and call-to-action.
          </p>
        ) : (
          <p>
            Open <Link to={links.generate()} className="font-semibold text-primary hover:underline">Write</Link> and give it
            something from your week: a question someone asked you, a mistake you
            keep seeing, a result you are proud of. Generate hooks, pick one, then
            generate the full post in your own voice. Tune the audience, format and
            call-to-action.
          </p>
        )}
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Tip: set up <Link to="/voice" className="font-semibold text-primary hover:underline">Your voice</Link>{" "}
          first so every draft sounds like you, not like AI.
        </p>
      </Step>

      <Step n={n(3)} id="carousel" icon={LayoutGrid} title="Build a carousel">
        <p>
          {top ? "Carousels are the workhorse for advisors: one idea" : "One idea"}, one slide at a
          time, ending on a clear takeaway. Open{" "}
          <Link to={links.carousel({ tab: "drafts" })} className="font-semibold text-primary hover:underline">Carousel</Link>, pick
          the draft you just wrote, and it lays the post out as 2 to 10 slides in
          your brand colours, with your headshot or logo. Download the slides as
          pictures, or as one PDF for LinkedIn.
        </p>
        <p className="text-[12px] text-muted-foreground">
          Keep it to 6-10 slides, big text, one idea per slide, brand colour on
          the cover, and a save/share prompt on the last slide.
        </p>
        {top && (
          <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
            Always re-check figures and add your advisory disclaimer before publishing.
          </p>
        )}
      </Step>

      <Step n={n(4)} id="reel" icon={Video} title="Film a reel">
        <p>
          For talking-head reels, use the script from Write as your teleprompter.
          Hook in the first 2 seconds, keep it under 45 seconds, add captions.
        </p>
        <p>
          Then open <Link to={links.edit()} className="font-semibold text-primary hover:underline">Video</Link> and upload the
          take. It cuts the pauses and filler words, adds captions in one of 6
          styles, keeps your face in frame and exports four sizes at once.
        </p>
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Not filming today?{" "}
          <Link to={links.edit({ panel: ["ai"] })} className="font-semibold text-primary hover:underline">Make a video without filming</Link>{" "}
          from a template, stock clips or a photo of you, up to 2 a day.
        </p>
      </Step>

      <Step n={n(5)} id="reverse-engineer" icon={FileText} title="Reverse-engineer a video you love">
        <p>
          {top ? "If a top post is a reel" : "Seen a reel that works"}, paste its Instagram or TikTok
          link into <Link to={links.clone()} className="font-semibold text-primary hover:underline">Clone a reel</Link>. You get a
          breakdown of its hook and structure, three concepts, your own script, a
          shot list and a caption, written for your work.
        </p>
      </Step>

      <Step n={n(6)} id="compliance" icon={ShieldCheck} title={top ? "Compliance check before you post" : "Check it before you post"}>
        {top ? (
          <p>
            Write flags risky claims automatically. As a licensed advisor, avoid
            guarantees and unbalanced return claims, add the usual advisory
            disclaimer, and keep to your company and MAS guidelines. When in doubt,
            run it past your compliance team.
          </p>
        ) : (
          <p>
            Before a post goes out, check that it sounds human (one tap clears the
            usual AI tells) and that it fits each network&apos;s character count. The
            writers are told never to invent a number, a result or a client story,
            so any figure in the post is one you added: check it against its source.
          </p>
        )}
      </Step>

      <Step n={n(7)} id="schedule" icon={CalendarClock} title="Schedule and track">
        <p>
          Batch a week of posts in{" "}
          <Link to="/plan" className="font-semibold text-primary hover:underline">Plan a week</Link>,
          then schedule them.
        </p>
        {posting ? (
          <p>
            On the <Link to={links.calendar()} className="font-semibold text-primary hover:underline">Calendar</Link>, use{" "}
            <span className="font-semibold">Post it for me</span> to send a post to
            Instagram, Facebook, TikTok, LinkedIn, YouTube or Threads at the time
            you pick, in your own time zone.
          </p>
        ) : (
          <div className="space-y-2">
            <ToolRow
              tool={{
                name: "Meta Business Suite",
                what: "Free scheduling for Instagram and Facebook.",
                url: "https://business.facebook.com",
                tutorial: tut("meta business suite schedule instagram reels"),
              }}
            />
          </div>
        )}
      </Step>

      <div className="flex flex-wrap gap-2 pt-1">
        {top && <Button asChild size="lg" className="gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95">
          <Link to="/swipe">
            <TrendingUp className="h-4 w-4" /> Browse top posts
          </Link>
        </Button>}
        <Button asChild size="lg" variant="outline" className="gap-2">
          <Link to="/generate">
            Start writing <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
