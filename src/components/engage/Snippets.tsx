// Saved replies: short texts the consultant sends often, kept per profile and
// synced. Each is copied straight from here or put into any Engage draft with
// its Insert button. The compliance flags show on each one and never block.
// Logic: src/lib/replySnippets.ts.
import { useRef, useState, type FormEvent } from "react";
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
import { MAX_SNIPPETS, MAX_SNIPPET_NAME, MAX_SNIPPET_TEXT, loadForm, loadSnippets, removeSnippet, saveForm, saveSnippet, type SnippetForm } from "@/lib/replySnippets";

const small = "inline-flex h-11 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold transition-colors sm:h-8 [@media(pointer:coarse)]:h-11";

export default function Snippets({ userId }: { userId: string }) {
  const copy = useCopy();
  const { toast } = useToast();
  const [list, setList] = useState(() => loadSnippets(userId));
  const [form, setFormState] = useState(() => loadForm(userId));
  const [problem, setProblem] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const nameBox = useRef<HTMLInputElement>(null);
  const editing = Boolean(form.id && list.some((s) => s.id === form.id));
  const full = !editing && list.length >= MAX_SNIPPETS;

  const setForm = (f: SnippetForm) => {
    setFormState(saveForm(userId, f));
    setProblem("");
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = saveSnippet(userId, editing ? form : { name: form.name, text: form.text });
    if (r.problem === "duplicate") return setProblem(`Already saved as "${r.saved?.name}".`);
    if (r.problem) return;
    setList(r.list);
    setForm({ name: "", text: "" });
    toast({ title: editing ? "Changes saved" : `Saved as "${r.saved?.name}"` });
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
              <Zap className="h-4 w-4 text-primary" /> Saved replies
            </h2>
            <InfoTip label="About saved replies">Tap Insert on any draft to put one in.</InfoTip>
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {list.length} of {MAX_SNIPPETS}
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
                placeholder="Hospital plan guide"
                className="h-11 sm:h-9 [@media(pointer:coarse)]:h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="snippet-text">Reply</Label>
              <Textarea
                id="snippet-text"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                maxLength={MAX_SNIPPET_TEXT}
                rows={4}
                placeholder="Happy to send you my 2-page guide on hospital plans. Which email should it go to?"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={full || !form.text.trim()} className="h-11 bg-gradient-primary text-primary-foreground hover:opacity-95 sm:h-10">
                {editing ? "Save changes" : "Save reply"}
              </Button>
              {(editing || form.name || form.text) && (
                <Button type="button" variant="ghost" onClick={() => setForm({ name: "", text: "" })} className="h-11 text-muted-foreground sm:h-10">
                  Cancel
                </Button>
              )}
              {full && <p className="text-[11px] font-medium text-warning">{MAX_SNIPPETS} is the most. Delete one to add another.</p>}
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
