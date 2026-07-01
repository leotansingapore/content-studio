import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { markOnboarded } from "@/lib/onboarding";
import {
  Sparkles,
  Mic,
  Pencil,
  CalendarRange,
  ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    n: 1,
    icon: Mic,
    title: "Set your voice",
    body: "Paste a few of your past posts once. Every draft then sounds like you, not generic AI. Takes about 2 minutes.",
    cta: "Set my voice",
    to: "/voice",
  },
  {
    n: 2,
    icon: Pencil,
    title: "Write your first post",
    body: "Answer a few quick questions and the studio drafts a post you can edit and publish. Everything has a sensible default.",
    cta: "Write a post",
    to: "/generate",
  },
  {
    n: 3,
    icon: CalendarRange,
    title: "Plan your week",
    body: "Turn your positioning into a full week of posts, then drop them onto your calendar in one click.",
    cta: "Plan a week",
    to: "/plan",
  },
];

export default function WelcomePage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [name, setName] = useState("");

  useEffect(() => {
    document.title = "Welcome - Content Studio";
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUserId(data.user?.id ?? null);
      const email = data.user?.email ?? "";
      setName(email ? email.split("@")[0].replace(/[._-]+/g, " ") : "");
    });
    return () => {
      active = false;
    };
  }, []);

  const go = (to: string) => {
    markOnboarded(userId);
    navigate(to);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-4">
      <header className="space-y-3 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-elegant">
          <Sparkles className="h-7 w-7" />
        </span>
        <h1 className="font-serif text-3xl font-semibold leading-tight tracking-tight text-foreground">
          Welcome{name ? <span className="capitalize">, {name}</span> : ""} 👋
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Content Studio is your home base for showing up online — ideate,
          write, plan, and track your posts in one place. Here's the fastest way
          to get value in the next 10 minutes.
        </p>
      </header>

      <div className="space-y-3">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.n}
              type="button"
              onClick={() => go(s.to)}
              className="group flex w-full items-center gap-4 rounded-2xl border border-border/70 bg-card p-5 text-left shadow-card transition-colors hover:border-primary/40"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">
                  <span className="text-muted-foreground">Step {s.n} · </span>
                  {s.title}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
              </div>
              <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary group-hover:underline sm:flex">
                {s.cta} <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3">
        <Button
          size="lg"
          onClick={() => go("/generate")}
          className="gap-2 bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-95"
        >
          <Pencil className="h-4 w-4" /> Start with my first post
        </Button>
        <button
          type="button"
          onClick={() => go("/home")}
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Skip — take me to my dashboard
        </button>
      </div>
    </div>
  );
}
