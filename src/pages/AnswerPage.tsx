// /generate/answer: three answers to a question someone asked on Reddit, in a Facebook or Telegram group, or on Quora,
// for the user to post themselves (generate-social-content answer mode). The whole answer sits in the reply and the
// user's work is named only when the question asks for it (Starter Story: Elephas, Sheets Resume, Algrow).
// Copy out only: nothing is saved to My posts or sent anywhere. Every field lives in the URL.
import { useEffect, useRef, useState } from "react";
import { Check, Copy, MessageCircleQuestion } from "lucide-react";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ANSWER_COUNT, streamAnswers } from "@/lib/batchGenerate";
import { stripDashes } from "@/lib/plainText";
import { professionFor } from "@/lib/profession";
import { supabase } from "@/lib/supabase";
import { useUrlState } from "@/lib/urlState";
import { useLeoOnly } from "@/lib/useLeoOnly";
import { isVoiceProfileUsable, loadVoiceProfile, voiceSummaryOf } from "@/lib/voiceProfile";
import { ANSWER_SHAPES, type AnswerShape } from "../../supabase/functions/generate-social-content/logic.ts";

type Answer = { status: "writing" | "done" | "error"; text: string; error?: string };

/** A guide's first line is "TITLE: ...": split off so the title and the post copy into their own boxes. */
export function splitTitle(text: string): { title: string | null; body: string } {
  const m = /^\s*TITLE:\s*(.+)\n+/i.exec(text);
  return m ? { title: m[1].trim(), body: text.slice(m[0].length).trim() } : { title: null, body: text.trim() };
}

export default function AnswerPage() {
  const { toast } = useToast();
  const leo = useLeoOnly();
  const [question, setQuestion] = useUrlState("q", "");
  const [where, setWhere] = useUrlState("where", "");
  const [rule, setRule] = useUrlState("rule", "");
  const [shape, setShape] = useUrlState<AnswerShape>("shape", "reply", { allowed: ANSWER_SHAPES });
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const writing = answers.some((a) => a.status === "writing");

  useEffect(() => () => abortRef.current?.abort(), []);

  const write = async () => {
    if (!question.trim() || writing) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setAnswers(Array.from({ length: ANSWER_COUNT }, () => ({ status: "writing", text: "" })));
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    const voice = loadVoiceProfile(uid);
    const voiceSummary = isVoiceProfileUsable(voice) ? voice?.voiceSummary : leo ? voiceSummaryOf(voice) || undefined : undefined;
    const profession = professionFor(uid);
    const set = (i: number, a: Partial<Answer>) => setAnswers((prev) => prev.map((x, j) => (j === i ? { ...x, ...a } : x)));
    await streamAnswers(
      {
        ideaContext: question.trim(),
        answerShape: shape,
        ...(where.trim() ? { community: where.trim() } : {}),
        ...(rule.trim() ? { linkRule: rule.trim() } : {}),
        ...(voiceSummary ? { voiceSummary } : {}),
        ...(profession ? { profession } : {}),
      },
      {
        onToken: (i, text) => set(i, { text }),
        onComplete: (i, text) => set(i, { status: "done", text: stripDashes(text) }),
        onError: (i, message) =>
          i === null ? setAnswers((prev) => prev.map((x) => (x.status === "writing" ? { ...x, status: "error", error: message } : x))) : set(i, { status: "error", error: message }),
      },
      ctrl.signal,
    );
    // an answer the stream ended without finishing is an error, never a spinner left turning
    setAnswers((prev) => prev.map((x) => (x.status === "writing" ? { ...x, status: "error", error: "This one stopped before it finished." } : x)));
  };

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast({ title: "Copied" });
    } catch {
      toast({ title: "Couldn't copy", description: "Select the text and copy it by hand.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          <MessageCircleQuestion className="h-6 w-6 text-primary" /> Answer a question
        </h1>
      </header>

      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-4 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="answer-question">The question</Label>
            <Textarea
              id="answer-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Paste the question, and any detail from the thread that matters."
              rows={4}
              autoResize
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="answer-where">Where it was asked</Label>
              <Input id="answer-where" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="e.g. r/SGExams, a Facebook group for new agents" maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="answer-rule">
                Their rule on links <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="answer-rule" value={rule} onChange={(e) => setRule(e.target.value)} placeholder="e.g. no self-promotion, links only if asked" maxLength={1000} />
            </div>
          </div>
          <RadioGroup value={shape} onValueChange={(v) => setShape(v as AnswerShape)} className="flex flex-wrap gap-4" aria-label="Length">
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="reply" /> A reply
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value="guide" /> A long guide post
            </label>
          </RadioGroup>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button onClick={() => void write()} disabled={!question.trim() || writing} className="min-h-11 gap-1.5">
              <MessageCircleQuestion className="h-4 w-4" /> {writing ? "Writing..." : `Write ${ANSWER_COUNT} answers`}
            </Button>
            <span className="text-xs text-muted-foreground">You post it yourself. Nothing is sent from here.</span>
          </div>
        </CardContent>
      </Card>

      {answers.length > 0 && (
        <div ref={resultsRef} className="grid gap-4 lg:grid-cols-3">
          {answers.map((a, i) => {
            const { title, body } = splitTitle(a.text);
            return (
              <Card key={i} className="border-border/60 shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="font-serif text-base">Answer {i + 1}</CardTitle>
                  {a.status === "writing" && <ThinkingOrb state="composing" size={20} theme="light" aria-label={`Writing answer ${i + 1}`} />}
                </CardHeader>
                <CardContent className="space-y-3">
                  {a.status === "error" ? (
                    <div className="space-y-2">
                      <p className="text-sm text-destructive">{a.error}</p>
                      <Button size="sm" variant="outline" className="min-h-11 sm:min-h-9" disabled={writing} onClick={() => void write()}>
                        Try again
                      </Button>
                    </div>
                  ) : (
                    <>
                      {title && <p className="font-semibold text-foreground">{title}</p>}
                      <p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/85">{body || "..."}</p>
                    </>
                  )}
                  {a.status === "done" && (
                    <div className="flex flex-wrap gap-2">
                      {title && (
                        <Button size="sm" variant="outline" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => void copy(`${i}-title`, title)}>
                          {copied === `${i}-title` ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />} Copy title
                        </Button>
                      )}
                      <Button size="sm" className="min-h-11 gap-1.5 sm:min-h-9" onClick={() => void copy(`${i}`, body)}>
                        {copied === `${i}` ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {title ? "Copy post" : "Copy answer"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
