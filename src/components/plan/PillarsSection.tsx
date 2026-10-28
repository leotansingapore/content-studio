// /plan's Pillars (Leo only): the brand's labels as the topics the plan spreads its topic and market slots over, each
// with an aim, and a grid of what went out in the last 4 weeks against what this plan holds, per format. The labels
// and their targets are the ones My posts and Analytics' Mix card use, so an aim set here moves the Mix card too.
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { links } from "@/lib/links";
import { scoped } from "@/lib/profiles";
import { pillarGrid, slotLabel, type ContentPlan } from "@/lib/contentPlan";
import type { DraftEntry } from "@/lib/draftHistory";
import {
  addLabel,
  deleteLabel,
  hasSavedLabels,
  labelWeights,
  updateLabel,
  LABEL_COLORS,
  LABEL_COLOR_NAME,
  LABEL_SWATCH,
  MAX_LABELS,
  type Label,
} from "@/lib/labels";
import { adviserBrand } from "@/lib/profession";

const GRID_FORMATS = ["text-post", "carousel", "short-video"] as const;

// The aims typed in the open panel, kept for this tab until Save or Cancel.
const workKey = (userId: string) => `cs-pillars-work-${scoped(userId)}`;
function readWork(userId: string): Record<string, string> {
  try {
    const w = JSON.parse(sessionStorage.getItem(workKey(userId)) ?? "null");
    return w && typeof w === "object" ? w : {};
  } catch {
    return {};
  }
}

const shares = (labels: Label[]) => {
  const w = labelWeights(labels);
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map((x) => (sum > 0 ? Math.round((x / sum) * 100) : 0));
};

export default function PillarsSection({
  userId,
  labels,
  drafts,
  plan,
  formatLabel,
  editing,
  onEdit,
  onClose,
  onLabelsChange,
  onDraftsChange,
  onSaved,
}: {
  userId: string;
  labels: Label[];
  drafts: DraftEntry[];
  plan: ContentPlan;
  formatLabel: Record<string, string>;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onLabelsChange: (labels: Label[]) => void;
  onDraftsChange: (drafts: DraftEntry[]) => void;
  /** The aims are saved on the labels: the page rebuilds the plan around them. */
  onSaved: (labels: Label[]) => void;
}) {
  const [aims, setAims] = useState<Record<string, string>>(() => (editing ? readWork(userId) : {}));
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState("");

  useEffect(() => {
    try {
      if (editing) sessionStorage.setItem(workKey(userId), JSON.stringify(aims));
      else sessionStorage.removeItem(workKey(userId));
    } catch {
      // storage blocked: the typed aims just won't survive a page change
    }
  }, [userId, editing, aims]);

  const grid = pillarGrid(labels, drafts, plan, new Date());
  const inPlan = (id: string) => plan.items.filter((i) => slotLabel(i, labels)?.id === id).length;
  const aimOf = (l: Label, i: number) => aims[l.id] ?? String(Math.round(labelWeights(labels)[i]));
  const total = labels.reduce((s, l, i) => s + (Number(aimOf(l, i)) || 0), 0);

  const close = () => {
    setAims({});
    setConfirmId(null);
    onClose();
  };
  const save = () => {
    let next = labels;
    labels.forEach((l, i) => (next = updateLabel(userId, l.id, { target: Math.min(100, Math.max(0, Number(aimOf(l, i)) || 0)) })));
    setAims({});
    onSaved(next);
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const added = addLabel(userId, newName);
    if (!added) {
      setAddError(labels.some((l) => l.name.toLowerCase() === newName.trim().toLowerCase()) ? "You already have that label." : "Give the pillar a name.");
      return;
    }
    setNewName("");
    setAddError("");
    onLabelsChange(added.labels);
  };

  const panel = (
    <div className="space-y-3">
      {labels.map((l, i) => {
        const uses = drafts.filter((d) => d.labels?.includes(l.id)).length;
        return (
          <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
            <input
              key={l.name}
              defaultValue={l.name}
              maxLength={30}
              aria-label={`Name of ${l.name}`}
              onBlur={(e) => {
                if (e.target.value.trim() === l.name) return;
                const next = updateLabel(userId, l.id, { name: e.target.value });
                onLabelsChange(next);
                // A blank or taken name is refused: show the kept name again.
                if (next.find((x) => x.id === l.id)?.name !== e.target.value.trim()) e.target.value = l.name;
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="h-9 min-w-0 flex-1 basis-40 rounded-md border border-input bg-background px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
            />
            <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              Aim
              <input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                value={aimOf(l, i)}
                onChange={(e) => setAims({ ...aims, [l.id]: e.target.value })}
                aria-label={`Aim for ${l.name}, in %`}
                className="h-9 w-16 rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
              />
              %
            </label>
            <div className="flex items-center gap-0.5" role="radiogroup" aria-label={`Colour of ${l.name}`}>
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={l.color === c}
                  aria-label={LABEL_COLOR_NAME[c]}
                  onClick={() => onLabelsChange(updateLabel(userId, l.id, { color: c }))}
                  className="grid h-9 w-9 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
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
                const out = deleteLabel(userId, l.id);
                setConfirmId(null);
                onLabelsChange(out.labels);
                onDraftsChange(out.drafts);
              }}
              onBlur={() => setConfirmId((cur) => (cur === l.id ? null : cur))}
              className={`ml-auto gap-1.5 text-xs ${confirmId === l.id ? "text-destructive hover:text-destructive" : "text-muted-foreground"}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {confirmId === l.id ? (uses ? `Remove from ${uses} post${uses === 1 ? "" : "s"}` : "Confirm") : "Delete"}
            </Button>
          </div>
        );
      })}
      {labels.length < MAX_LABELS ? (
        <form onSubmit={add} className="space-y-1">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setAddError("");
              }}
              maxLength={30}
              placeholder={adviserBrand() ? "New pillar, e.g. CPF" : "New pillar, e.g. Client stories"}
              aria-label="New pillar name"
              aria-invalid={!!addError}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!newName.trim()} className="gap-1">
              <Plus className="h-3.5 w-3.5" /> Add a pillar
            </Button>
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">That's the most pillars you can have ({MAX_LABELS}).</p>
      )}
      {labels.length > 0 && (
        <div className="space-y-0.5 text-xs">
          <p className="font-medium tabular-nums text-foreground">Adds up to {total}%</p>
          {total !== 100 && <p className="text-muted-foreground">They don't need to add up to 100. Each is read as a share of the total.</p>}
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!labels.length}>
          Save and rebuild plan
        </Button>
      </div>
    </div>
  );

  const aim = shares(labels);
  const overview = (
    <>
      <ul className="space-y-1.5">
        {labels.map((l, i) => (
          <li key={l.id} className="flex items-center gap-2 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LABEL_SWATCH[l.color]}`} />
            <span className="min-w-0 flex-1 truncate font-medium text-foreground">{l.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">aim {aim[i]}%</span>
            <span className="w-24 shrink-0 text-right tabular-nums text-muted-foreground">{inPlan(l.id)} in this plan</span>
          </li>
        ))}
      </ul>
      {!hasSavedLabels(userId) && <p className="text-xs text-muted-foreground">These come from your topics. Set an aim for each to steer the plan.</p>}
      <div>
        {/* Only the grid scrolls sideways on a phone; the pillar names stay put. */}
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-xs text-muted-foreground">
                <th scope="col" className="sticky left-0 bg-card px-3 py-2 text-left font-medium">
                  <span className="sr-only">Pillar</span>
                </th>
                {GRID_FORMATS.map((f) => (
                  <th key={f} scope="col" className="px-3 py-2 text-center font-medium">
                    {formatLabel[f]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row) => {
                const l = labels.find((x) => x.id === row.labelId)!;
                return (
                  <tr key={row.labelId} className="border-b border-border/40 last:border-0">
                    <th scope="row" className="sticky left-0 max-w-[9rem] truncate bg-card px-3 py-1.5 text-left font-medium text-foreground">
                      {l.name}
                    </th>
                    {GRID_FORMATS.map((f) => {
                      const c = row.cells[f];
                      return (
                        <td key={f} className="px-3 py-1.5 text-center tabular-nums text-muted-foreground">
                          {c.posted || c.planned ? (
                            `${c.posted} | ${c.planned}`
                          ) : (
                            <Link
                              to={links.generate({ pillar: "topic", detail: l.name, format: f, label: l.id })}
                              aria-label={`Write a ${formatLabel[f].toLowerCase()} about ${l.name}`}
                              className="inline-grid h-8 w-8 place-items-center rounded-full font-semibold text-primary hover:bg-primary/10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                            >
                              +
                            </Link>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">posted in the last 4 weeks | in this plan</p>
      </div>
    </>
  );

  return (
    <Card id="pillars" className="scroll-mt-20 border-border/60 shadow-card">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <h3 className="font-serif text-lg font-semibold">Pillars</h3>
            <InfoTip label="About pillars">Same as your labels on My posts.</InfoTip>
          </div>
          {!editing && labels.length > 0 && (
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit pillars
            </Button>
          )}
        </div>
        {editing ? (
          panel
        ) : labels.length ? (
          overview
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Add the 3 to 5 topics you post about, and the plan rotates through them.</p>
            <Button size="sm" variant="outline" onClick={onEdit}>
              Add pillars
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
