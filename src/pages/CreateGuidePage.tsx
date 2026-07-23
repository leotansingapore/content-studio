import { useEffect } from "react";
import SectionTabs, { LEARN_TABS } from "@/components/SectionTabs";
import { Link } from "react-router-dom";
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
      <SectionTabs tabs={LEARN_TABS} />
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
            className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:border-primary/40 hover:text-foreground"
          >
            <PlayCircle className="h-3 w-3" /> Tutorial
          </a>
        )}
        <a
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/10"
        >
          <ExternalLink className="h-3 w-3" /> Open
        </a>
      </div>
    </div>
  );
}

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  icon: typeof Wand2;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 shadow-card">
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
  useEffect(() => {
    document.title = "Create the post - Content Studio";
    return () => {
      document.title = "Content Studio";
    };
  }, []);

  return (
    <div className="space-y-5">
      <header className="space-y-1.5">
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <Sparkles className="h-6 w-6 text-primary" />
          Create the post, end to end
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          From a proven idea to a published post. Content Studio handles the
          strategy and the words; for the visuals we point you to the best tool
          for the job with a tutorial, so you are never stuck.
        </p>
      </header>

      <Step n={1} icon={TrendingUp} title="Find an idea that already works">
        <p>
          Open <Link to="/swipe" className="font-semibold text-primary hover:underline">Top posts</Link>{" "}
          and browse the best-performing posts from advisors like you. Each card
          shows the hook, why it worked, and how to adapt it. Pick one that fits
          your niche.
        </p>
      </Step>

      <Step n={2} icon={Wand2} title="Turn it into your draft">
        <p>
          Hit <span className="font-semibold">Remix in Write</span> on any post.
          That opens <Link to="/generate" className="font-semibold text-primary hover:underline">Write</Link>{" "}
          pre-filled with the angle, context and that advisor as a style
          reference. Generate hooks, pick one, then generate the full post in
          your own voice. Tune the audience, format and call-to-action.
        </p>
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Tip: set up <Link to="/voice" className="font-semibold text-primary hover:underline">Your voice</Link>{" "}
          first so every draft sounds like you, not like AI.
        </p>
      </Step>

      <Step n={3} icon={LayoutGrid} title="Build a carousel">
        <p>
          Carousels are the workhorse for advisors: one idea, one slide at a
          time, ending on a clear takeaway. Write already gives you the
          slide-by-slide text - paste each line onto a slide.
        </p>
        <div className="space-y-2">
          <ToolRow
            tool={{
              name: "Canva",
              what: "Easiest carousel builder. Use a 1080x1350 Instagram template, one point per slide.",
              url: "https://www.canva.com/instagram-posts/templates/",
              tutorial: tut("canva instagram carousel tutorial 2025"),
            }}
          />
          <ToolRow
            tool={{
              name: "ChatGPT",
              what: "Yes - paste your slide text and ask it to design each slide as an image (1080x1350), or generate a Canva-ready layout. Great for a first draft you then tidy up.",
              url: "https://chatgpt.com",
              tutorial: tut("chatgpt instagram carousel images tutorial"),
            }}
          />
          <ToolRow
            tool={{
              name: "Higgsfield",
              what: "Generate on-brand background images or an AI presenter for slides.",
              url: "https://higgsfield.ai",
              tutorial: tut("higgsfield ai image generation tutorial"),
            }}
          />
        </div>
        <p className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
          Using ChatGPT? Paste the slide-by-slide text from Write and prompt:
          "Design these as a 6-slide Instagram carousel, 1080x1350, bold heading
          per slide, consistent colours, minimal icons." Then export and post, or
          drop the images into Canva for final tweaks. Always re-check figures and
          add your advisory disclaimer before publishing.
        </p>
        <p className="text-[12px] text-muted-foreground">
          Keep it to 6-10 slides, big text, one idea per slide, brand colour on
          the cover, and a save/share prompt on the last slide.
        </p>
      </Step>

      <Step n={4} icon={Video} title="Film a reel">
        <p>
          For talking-head reels, use the script from Write as your teleprompter.
          Hook in the first 2 seconds, keep it under 45 seconds, add captions.
        </p>
        <div className="space-y-2">
          <ToolRow
            tool={{
              name: "CapCut",
              what: "Free editor with auto-captions and trending templates.",
              url: "https://www.capcut.com",
              tutorial: tut("capcut instagram reels editing tutorial beginners"),
            }}
          />
          <ToolRow
            tool={{
              name: "Higgsfield",
              what: "Generate a UGC-style or AI-presenter video if you are not filming yourself.",
              url: "https://higgsfield.ai",
              tutorial: tut("higgsfield ai video ugc tutorial"),
            }}
          />
        </div>
      </Step>

      <Step n={5} icon={FileText} title="Reverse-engineer a video you love">
        <p>
          If a top post is a reel, get its transcript to study the exact hook and
          structure, then rebuild it in your own words.
        </p>
        <div className="space-y-2">
          <ToolRow
            tool={{
              name: "Descript",
              what: "Paste a video to get an editable transcript.",
              url: "https://www.descript.com",
              tutorial: tut("descript transcript tutorial"),
            }}
          />
          <ToolRow
            tool={{
              name: "iGram / reel downloader",
              what: "Download the reel first if you need the file for transcription.",
              url: "https://igram.world",
            }}
          />
        </div>
        <p className="text-[12px] text-muted-foreground">
          Then paste the transcript into the context box in Write and remix it.
        </p>
      </Step>

      <Step n={6} icon={ShieldCheck} title="Compliance check before you post">
        <p>
          Write flags risky claims automatically. As a licensed advisor, avoid
          guarantees and unbalanced return claims, add the usual advisory
          disclaimer, and keep to your company and MAS guidelines. When in doubt,
          run it past your compliance team.
        </p>
      </Step>

      <Step n={7} icon={CalendarClock} title="Schedule and track">
        <p>
          Batch a week of posts in{" "}
          <Link to="/plan" className="font-semibold text-primary hover:underline">Plan a week</Link>,
          then schedule them.
        </p>
        <div className="space-y-2">
          <ToolRow
            tool={{
              name: "Meta Business Suite",
              what: "Free scheduling for Instagram and Facebook.",
              url: "https://business.facebook.com",
              tutorial: tut("meta business suite schedule instagram reels"),
            }}
          />
          <ToolRow
            tool={{
              name: "Later / Buffer",
              what: "Visual planner and auto-poster with best-time suggestions.",
              url: "https://later.com",
              tutorial: tut("later instagram scheduling tutorial"),
            }}
          />
        </div>
      </Step>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild size="lg" className="gap-2 bg-gradient-primary text-primary-foreground shadow-sm hover:opacity-95">
          <Link to="/swipe">
            <TrendingUp className="h-4 w-4" /> Browse top posts
          </Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="gap-2">
          <Link to="/generate">
            Start writing <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
