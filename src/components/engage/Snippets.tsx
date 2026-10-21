// Saved replies: short texts the consultant sends often, kept per profile and
// synced. Each is copied straight from here or put into any Engage draft with
// its Insert button. The compliance flags show on each one and never block.
// Given another `kind` (Leo's Write Insert panel, Manage), the same list of
// lines, hashtag sets, endings, hooks or post templates. Logic: src/lib/replySnippets.ts.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Pencil, Trash2, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCopy } from "@/components/recruit/shared";
import { useToast } from "@/hooks/use-toast";
import { scanCompliance } from "@/lib/compliance";
import { KIND_NAME, MAX_PER_KIND, MAX_SNIPPET_NAME, MAX_TEXT, loadForm, loadSnippets, ofKind, removeSnippet, saveForm, saveSnippet, type SnippetForm, type SnippetKind } from "@/lib/replySnippets";

// The form's words per kind; a reply's are today's Engage words.
const FORM: Record<SnippetKind, { label: string; save: string; name: string; text: string }> = {
  reply: { label: "Reply", save: "Save reply", name: "Hospital plan guide", text: "Happy to send you my 2-page guide on hospital plans. Which email should it go to?" },
  line: { label: "Line", save: "Save line", name: "Checklist link", text: "Here is my free checklist: {offer_link}" },
  hashtags: { label: "Hashtags", save: "Save hashtag set", name: "CPF posts", text: "#cpf #retirementplanning #singapore" },
  ending: { label: "Ending", save: "Save ending", name: "WhatsApp me", text: "Questions on yours? WhatsApp me here: {whatsapp}" },
  hook: { label: "Hook", save: "Save hook", name: "Client question", text: "A client asked me this week: [question]" },
  post: { label: "Post", save: "Save post template", name: "Myth and fact", text: "Myth: [myth]\n\nFact: [fact]\n\nWhat I tell clients: [your advice]" },
};

const small = "inline-flex h-11 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors sm:h-8 [@media(pointer:coarse)]:h-11";

export default function Snippets({ userId, kind = "reply", focusName = false }: { userId: string; kind?: SnippetKind; focusName?: boolean }) {
  const copy = useCopy();
  const { toast } = useToast();
  const [all, setList] = useState(() => loadSnippets(userId));
  const list = ofKind(all, kind);
  const [form, setFormState] = useState(() => loadForm(userId, kind));
  const [problem, setProblem] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const editing = Boolean(form.id && list.some((s) => s.id === form.id));
  const full = !editing && list.length >= MAX_PER_KIND;
  const reply = kind === "reply";
  const words = FORM[kind];
  useEffect(() => {
    if (focusName) nameBox.current?.focus();
  }, [focusName]);

  const setForm = (f: SnippetForm) => {
    setFormState(saveForm(userId, f, kind));
    setProblem("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = saveSnippet(userId, editing ? form : { name: form.name, text: form.text, kind });
    if (r.problem === "duplicate") return setProblem(`Already saved as "${r.saved?.name}".`);
    if (r.problem) return;
    setList(r.list);
    setForm({ name: "", text: "" });
    // a reply's toast is today's Engage toast; the other kinds name a compliance flag, as Engage's Save does
    const flag = reply ? undefined : scanCompliance(r.saved?.text ?? "")[0];
    toast({ title: editing ? "Changes saved" : `Saved as "${r.saved?.name}"`, description: flag ? `"${flag.match}" ${flag.message}` : undefined });
  };
  const startEdit = (id: string) => {
    const s = list.find((x) => x.id === id);
    if (!s) return;
    setForm({ id: s.id, name: s.name, text: s.text });
    nameBox.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    nameBox.current?.focus({ preventScroll: true });
  };
  const remove = (id: string) => {
    if (confirm !== id) return setConfirm(id);
    setList(removeSnippet(userId, id));
    setConfirm(null);
    if (form.id === id) setForm({ name: "", text: "" });
  };

  return (
    <section className="space-y-4" aria-labelledby="snippets-title">
      <Card className="border-border/60 shadow-card">
        <CardContent className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <h2 id="snippets-title" className="flex items-center gap-2 font-serif text-lg font-semibold text-foreground">
              <Zap className="h-4 w-4 text-primary" /> Saved {KIND_NAME[kind].many}
            </h2>
            {reply && <InfoTip label="About saved replies">Tap Insert on any draft to put one in.</InfoTip>}
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {list.length} of {MAX_PER_KIND}
            </span>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="snippet-name">Name</Label>
              <Input
                id="snippet-name"
                ref={nameBox}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                maxLength={MAX_SNIPPET_NAME}
                placeholder={words.name}
                className="h-11 sm:h-9 [@media(pointer:coarse)]:h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snippet-text">{words.label}</Label>
              <Textarea
                id="snippet-text"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                maxLength={MAX_TEXT[kind]}
                rows={4}
                placeholder={words.text}
              />
              {!reply && <p className="text-[11px] text-muted-foreground">Type {"{name}"}, {"{handle}"}, {"{offer}"}, {"{offer_link}"} or {"{whatsapp}"} and your Brand kit fills it in.</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={full || !form.text.trim()} className="h-11 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
                {editing ? "Save changes" : words.save}
              </Button>
              {(editing || form.name || form.text) && (
                <Button type="button" variant="ghost" onClick={() => setForm({ name: "", text: "" })} className="h-11 text-muted-foreground sm:h-10">
                  Cancel
                </Button>
              )}
              {full && (
                <p className="text-[11px] font-medium text-warning">
                  {reply ? `${MAX_PER_KIND} is the most. Delete one to add another.` : `You have ${MAX_PER_KIND} saved ${KIND_NAME[kind].many}. Delete one to save this.`}
                </p>
              )}
              {problem && (
                <p role="alert" className="text-[11px] font-medium text-warning">
                  {problem}
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {list.length > 0 && (
        <ul className="space-y-2" data-testid="snippet-list">
          {list.map((s) => (
            <li key={s.id} className={`space-y-1.5 rounded-xl border bg-card p-3 ${form.id === s.id ? "border-primary/50" : "border-border/60"}`}>
              <p className="truncate text-sm font-semibold text-foreground">{s.name}</p>
              <p className="line-clamp-4 whitespace-pre-line text-sm text-muted-foreground [overflow-wrap:anywhere]">{s.text}</p>
              {scanCompliance(s.text).map((f) => (
                <p key={f.id} className={`rounded-md border px-2 py-1 text-[11px] ${f.severity === "error" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10"}`}>
                  "{f.match}" {f.message}
                </p>
              ))}
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => startEdit(s.id)} aria-label={`Edit ${s.name}`} className={`${small} text-muted-foreground hover:bg-primary/10 hover:text-primary`}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => remove(s.id)}
                  onBlur={() => confirm === s.id && setConfirm(null)}
                  aria-label={confirm === s.id ? `Confirm delete ${s.name}` : `Delete ${s.name}`}
                  className={`${small} ${confirm === s.id ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
                >
                  <Trash2 className="h-3.5 w-3.5" /> {confirm === s.id ? "Confirm delete" : "Delete"}
                </button>
                <button type="button" onClick={() => void copy(s.text, `${s.name} copied`)} aria-label={`Copy ${s.name}`} className={`${small} ml-auto text-primary hover:bg-primary/10`}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
