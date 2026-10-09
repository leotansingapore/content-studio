import { ExternalLink } from "lucide-react";
import { safeExternalUrl } from "@/lib/embed";
import { REAL_QUESTIONS, type RealQuestion } from "@/lib/sgFeeds";

/** Under Write's spark when the source is "a real question": questions people asked this fortnight. */
export default function RealQuestions({
  onPick,
  questions = REAL_QUESTIONS,
}: {
  onPick: (question: string) => void;
  questions?: RealQuestion[];
}) {
  if (!questions.length) return null;
  return (
    <div className="space-y-1.5" data-testid="real-questions">
      <p className="text-xs font-medium text-muted-foreground">Asked this week in Singapore</p>
      <ul className="space-y-1.5">
        {questions.slice(0, 5).map((q) => (
          <li key={q.url} className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={() => onPick(q.question)}
              className="min-h-11 flex-1 rounded-md border border-border/60 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {q.question}
            </button>
            <a
              href={safeExternalUrl(q.url) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Read it on ${q.source}`}
              className="flex w-11 shrink-0 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
