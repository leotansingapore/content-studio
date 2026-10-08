// Content labels on My posts: the chip a post wears, the picker that sets a
// post's labels, and the manager that adds, renames, recolours and deletes them.
import { useState, type FormEvent } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  addLabel,
  deleteLabel,
  updateLabel,
  LABEL_CHIP,
  LABEL_COLORS,
  LABEL_COLOR_NAME,
  LABEL_SWATCH,
  MAX_LABELS,
  type Label,
} from "@/lib/labels";
import type { DraftEntry } from "@/lib/draftHistory";

export function LabelChip({ label }: { label: Label }) {
  return (
    <span className={`inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[11px] font-semibold ${LABEL_CHIP[label.color]}`}>
      {label.name}
    </span>
  );
}

function NewLabelForm({ userId, labels, onAdded }: { userId: string; labels: Label[]; onAdded: (labels: Label[], label: Label) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const full = labels.length >= MAX_LABELS;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const added = addLabel(userId, name);
    if (!added) {
      // Keep what was typed so it can be fixed.
      setError(labels.some((l) => l.name.toLowerCase() === name.trim().toLowerCase()) ? "You already have that label." : "Give the label a name.");
      return;
    }
    setName("");
    setError("");
    onAdded(added.labels, added.label);
  };
  if (full) return <p className="text-xs text-muted-foreground">That's the most labels you can have ({MAX_LABELS}).</p>;
  return (
    <form onSubmit={submit} className="space-y-1">
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError("");
          }}
          maxLength={30}
          placeholder="New label, e.g. CPF"
          aria-label="New label name"
          aria-invalid={!!error}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="sm" variant="outline" disabled={!name.trim()} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

/** Toggles which labels a post has. New labels made here go straight onto the post. */
export function LabelPicker({
  userId,
  labels,
  selected,
  onChange,
  onLabelsChange,
  onManage,
  onClose,
  className = "",
}: {
  className?: string;
  userId: string;
  labels: Label[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onLabelsChange: (labels: Label[]) => void;
  onManage: () => void;
  onClose: () => void;
}) {
  return (
    <div className={`space-y-2.5 rounded-lg border border-primary/20 bg-primary/5 p-3 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">Labels</p>
        <button type="button" onClick={onClose} aria-label="Close labels" className="-m-2 p-2 text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const on = selected.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? selected.filter((x) => x !== l.id) : [...selected, l.id])}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors sm:h-8 ${
                  on ? LABEL_CHIP[l.color] : "border-border/70 bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {on ? <Check className="h-3.5 w-3.5" /> : <span className={`h-2.5 w-2.5 rounded-full ${LABEL_SWATCH[l.color]}`} />}
                {l.name}
              </button>
            );
          })}
        </div>
      )}
      <NewLabelForm
        userId={userId}
        labels={labels}
        onAdded={(next, label) => {
          onLabelsChange(next);
          onChange([...selected, label.id]);
        }}
      />
      {labels.length > 0 && (
        <button type="button" onClick={onManage} className="text-xs font-medium text-primary hover:underline">
          Rename, recolour or delete labels
        </button>
      )}
    </div>
  );
}

/** Adds, renames, recolours and deletes labels. Deleting takes the label off every post. */
export function LabelManager({
  userId,
  labels,
  drafts,
  onLabelsChange,
  onDeleted,
  onClose,
}: {
  userId: string;
  labels: Label[];
  drafts: DraftEntry[];
  onLabelsChange: (labels: Label[]) => void;
  onDeleted: (labels: Label[], drafts: DraftEntry[], name: string, posts: number) => void;
  onClose: () => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const uses = (id: string) => drafts.filter((d) => d.labels?.includes(id)).length;
  return (
    <div id="label-manager" className="space-y-3 rounded-xl border border-border/70 bg-card p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-lg font-semibold text-foreground">Labels</h2>
        <Button size="sm" variant="outline" onClick={onClose}>
          Done
        </Button>
      </div>
      <div className="space-y-2">
        {labels.map((l) => {
          const n = uses(l.id);
          return (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
              <input
                key={l.name}
                defaultValue={l.name}
                maxLength={30}
                aria-label={`Name of ${l.name}`}
                onBlur={(e) => {
                  if (e.target.value.trim() !== l.name) {
                    const next = updateLabel(userId, l.id, { name: e.target.value });
                    onLabelsChange(next);
                    // A blank or taken name is refused: show the kept name again.
                    if (next.find((x) => x.id === l.id)?.name !== e.target.value.trim()) e.target.value = l.name;
                  }
                }}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="h-9 min-w-0 flex-1 basis-40 rounded-md border border-input bg-background px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center gap-0.5" role="radiogroup" aria-label={`Colour of ${l.name}`}>
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={l.color === c}
                    aria-label={LABEL_COLOR_NAME[c]}
                    onClick={() => onLabelsChange(updateLabel(userId, l.id, { color: c }))}
                    className="grid h-9 w-9 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className={`h-5 w-5 rounded-full ${LABEL_SWATCH[c]} ${l.color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : ""}`} />
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (confirmId !== l.id) return setConfirmId(l.id);
                  const { labels: nextLabels, drafts: nextDrafts } = deleteLabel(userId, l.id);
                  setConfirmId(null);
                  onDeleted(nextLabels, nextDrafts, l.name, n);
                }}
                onBlur={() => setConfirmId((cur) => (cur === l.id ? null : cur))}
                className={`ml-auto gap-1.5 text-xs ${confirmId === l.id ? "text-destructive hover:text-destructive" : "text-muted-foreground"}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmId === l.id ? (n ? `Remove from ${n} post${n === 1 ? "" : "s"}` : "Confirm") : "Delete"}
              </Button>
            </div>
          );
        })}
      </div>
      <NewLabelForm userId={userId} labels={labels} onAdded={(next) => onLabelsChange(next)} />
    </div>
  );
}
