// The writer box: a customer's composer, in Fastlane's composer's place on Home and in Studio's first card. A topic
// typed here opens the post writer on its last step (Write it), or goes with a chip to its maker (createTopic.ts
// tileHref), and stays in the box on the way back. New post lands on #topic, which puts the cursor here.
// Write it is quiet until there is a topic, as Fastlane's send arrow is, unless `primary` makes it the page's one
// filled button (nothing else waits on Home).

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { loadCreateTopic, saveCreateTopic, tileHref } from "@/lib/createTopic";
import { links } from "@/lib/links";
import { cn } from "@/lib/utils";

/** Where Write it goes: the writer's last step with the topic typed, or null to ask for the topic first. */
export const writeTarget = (topic: string): string | null => (topic.trim() ? links.generate({ detail: topic.trim() }) : null);

/** The chips under the box, as Fastlane's Image / Video / Script / Campaign: each maker that takes the topic. */
export const WRITER_CHIPS = [
  { to: "/carousel", label: "Carousel" },
  { to: "/slideshow", label: "Slideshow" },
  { to: "/edit", label: "Video" },
  { to: "/generate/batch", label: "Weekly batch" },
] as const;

export default function HomeWriter({ userId, primary = false, className }: { userId: string | null; primary?: boolean; className?: string }) {
  const navigate = useNavigate();
  const [topic, setTopicState] = useState("");
  useEffect(() => {
    if (userId) setTopicState((t) => t || loadCreateTopic(userId));
  }, [userId]);
  const setTopic = (t: string) => {
    setTopicState(t);
    if (userId) saveCreateTopic(userId, t);
  };
  // New post lands here as #topic: the box takes the cursor (never on a plain visit, where a phone would open its keyboard)
  const { hash, key } = useLocation();
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (hash === "#topic") box.current?.focus();
  }, [hash, key]);
  const [asked, setAsked] = useState(false);
  const write = () => {
    const to = writeTarget(topic);
    if (to) return navigate(to);
    setAsked(true);
    box.current?.focus();
  };
  const typed = !!topic.trim();

  return (
    <form
      className={cn("rounded-2xl border border-border/70 bg-card p-3 shadow-card focus-within:border-primary/40", className)}
      onSubmit={(e) => {
        e.preventDefault();
        write();
      }}
    >
      <textarea
        ref={box}
        id="topic"
        value={topic}
        rows={2}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          // Enter writes it, Shift and Enter is a new line, as the agent's composer
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            write();
          }
        }}
        aria-label="What your post is about"
        aria-describedby={asked && !typed ? "topic-ask" : undefined}
        placeholder="What's your post about?"
        maxLength={300}
        className="block w-full resize-none bg-transparent px-1 py-1 text-base text-foreground outline-none placeholder:text-muted-foreground"
      />
      {asked && !typed && (
        <p id="topic-ask" role="status" className="px-1 text-sm text-muted-foreground">
          Type a topic first, a few words will do.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {WRITER_CHIPS.map((c) => (
          <button
            key={c.to}
            type="button"
            onClick={() => navigate(tileHref(c.to, topic, userId))}
            className="inline-flex min-h-9 items-center rounded-full px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [@media(pointer:coarse)]:min-h-11"
          >
            {c.label}
          </button>
        ))}
        <Button type="submit" variant={typed || primary ? "default" : "outline"} className="ml-auto h-10 gap-2 px-4 [@media(pointer:coarse)]:h-11">
          Write it <ArrowRightIcon className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}
