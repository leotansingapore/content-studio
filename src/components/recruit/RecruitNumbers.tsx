import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { COHORT_BENCHMARK, SPRINT } from "@/data/recruitKit";
import { useRecruitBrain } from "@/hooks/useRecruitBrain";
import { loadDrafts } from "@/lib/draftHistory";
import { recruitPostsInWeek, stageMix, upsertWeek, weekOf, type WeekNumbers } from "@/lib/recruit";

const FIELDS: { key: keyof Omit<WeekNumbers, "week">; label: string; hint: string }[] = [
  { key: "posts", label: "Posts", hint: "What you published this week" },
  { key: "conversations", label: "Conversations", hint: "New chats from content and Send 10" },
  { key: "inProgress", label: "Recruits in progress", hint: "Interview held or exams started" },
];

const fmtWeek = (w: string) => {
  const [y, m, d] = w.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { day: "numeric", month: "short" });
};

// The kit's "one system": three numbers every Friday, the 3C path and the
// 50/30/20 mix. Shown only to people who have opened the recruit kit.
export default function RecruitNumbers() {
  const { userId, brain, update, ready, savedAt } = useRecruitBrain();
  const thisWeek = weekOf(new Date());
  const drafts = useMemo(() => loadDrafts(userId), [userId]);
  const autoPosts = useMemo(() => recruitPostsInWeek(drafts, thisWeek), [drafts, thisWeek]);
  const mix = useMemo(() => stageMix(drafts, new Date(Date.now() - 28 * 86_400_000)), [drafts]);
  const mixTotal = mix.reduce((s, m) => s + m.count, 0);

  if (!ready || !brain.updatedAt) return null;

  const row = brain.weeks.find((w) => w.week === thisWeek) ?? { week: thisWeek, posts: autoPosts, conversations: 0, inProgress: 0 };
  const setField = (key: keyof Omit<WeekNumbers, "week">, value: string) => {
    const n = Math.max(0, Math.round(Number(value) || 0));
    update((b) => ({ ...b, weeks: upsertWeek(b.weeks, { ...row, [key]: n }) }));
  };

  const last4 = brain.weeks.slice(0, 4);
  const totals = last4.reduce(
    (t, w) => ({ posts: t.posts + w.posts, conversations: t.conversations + w.conversations, inProgress: t.inProgress + w.inProgress }),
    { posts: 0, conversations: 0, inProgress: 0 },
  );
  const cohortPostsPerChat = COHORT_BENCHMARK.posts / COHORT_BENCHMARK.conversations;
  const yourPostsPerChat = totals.conversations ? totals.posts / totals.conversations : null;

  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          Recruitment: 3 numbers every Friday
          <InfoTip label="About the 3 numbers">Not likes. Count what gets you closer to a recruit.</InfoTip>
        </CardTitle>
        <Link to="/recruit" className="text-xs font-semibold text-primary hover:underline">Open recruit kit</Link>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="mb-2 flex justify-between text-xs font-semibold text-muted-foreground">
            <span>Week of {fmtWeek(thisWeek)}</span>
            {savedAt && <span aria-live="polite" className="font-normal">Saved {new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}
          </p>
          <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
            {FIELDS.map((f) => (
              <label key={f.key} className="space-y-1">
                <span className="block text-xs font-semibold leading-tight">{f.label}</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={row[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  className="h-10 font-serif text-lg"
                />
                <span className="hidden text-[11px] text-muted-foreground sm:block">
                  {f.key === "posts" && autoPosts > 0 ? `${autoPosts} recruitment posts marked posted` : f.hint}
                </span>
              </label>
            ))}
          </div>
        </div>

        {last4.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Content, conversations, conversions: last {last4.length} week{last4.length > 1 ? "s" : ""}
            </p>
            {last4.length > 1 && <div className="grid grid-cols-3 gap-2 text-center">
              {FIELDS.map((f) => (
                <div key={f.key} className="rounded-xl border border-border/60 p-2">
                  <div className="font-serif text-2xl font-semibold">{totals[f.key]}</div>
                  <div className="text-[11px] text-muted-foreground">{f.label}</div>
                </div>
              ))}
            </div>}
            <p className="text-xs text-muted-foreground">
              {yourPostsPerChat !== null
                ? `You: 1 conversation per ${yourPostsPerChat.toFixed(1)} posts. `
                : ""}
              Last cohort ({COHORT_BENCHMARK.leaders} leaders): 1 per {cohortPostsPerChat.toFixed(1)} posts, and{" "}
              {Math.round((COHORT_BENCHMARK.interviews / COHORT_BENCHMARK.conversations) * 100)}% of conversations reached an interview.
            </p>
          </div>
        )}

        {mixTotal > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Your mix, last 28 days ({mixTotal} recruitment posts)
            </p>
            {mix.map((m) => (
              <div key={m.id} className="flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 font-semibold">{m.label}</span>
                <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${m.share}%` }} />
                  <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${m.target}%` }} title={`Target ${m.target}%`} />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">{m.share}% / {m.target}%</span>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">The Chosen Sprint, next 7 days</p>
            {SPRINT.map((s) => (
              <label key={s.id} className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={!!brain.sprint[s.id]}
                  onChange={(e) => update((b) => ({ ...b, sprint: { ...b.sprint, [s.id]: e.target.checked } }))}
                />
                <span><span className="font-semibold">{s.when}</span> {s.task}</span>
              </label>
            ))}
          </div>
          <label className="space-y-1 sm:w-56">
            <span className="block text-xs font-semibold">Accountability partner (Day 7 check-in)</span>
            <Input value={brain.partner} placeholder="Name + number" onChange={(e) => update((b) => ({ ...b, partner: e.target.value }))} />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
