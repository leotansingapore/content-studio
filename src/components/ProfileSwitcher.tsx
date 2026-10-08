import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  activeProfileId,
  addProfile,
  DEFAULT_PROFILE_ID,
  loadProfiles,
  removeProfile,
  renameProfile,
  setActiveProfile,
  type Profile,
} from "@/lib/profiles";

const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";

// Which social profile the whole studio is working on. Switching reloads the
// page so every screen reads that profile's posts, plan and voice fresh.
export default function ProfileSwitcher({ compact = false }: { compact?: boolean }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState(DEFAULT_PROFILE_ID);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [switching, setSwitching] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = data.user?.id ?? null;
      setUserId(id);
      setProfiles(loadProfiles(id));
      setActiveId(activeProfileId(id));
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!userId) return null;
  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];

  const switchTo = (id: string) => {
    if (id === activeId) return setOpen(false);
    setSwitching(id);
    setActiveProfile(userId, id);
    window.location.reload();
  };

  const add = () => {
    if (!newName.trim()) return;
    const p = addProfile(userId, newName);
    setNewName("");
    switchTo(p.id);
  };

  const saveRename = (id: string) => {
    setProfiles(renameProfile(userId, id, editName));
    setEditing(null);
  };

  const remove = (p: Profile) => {
    if (!window.confirm(`Remove ${p.name}? Its posts, plan, voice and recruit kit are deleted on every device. This can't be undone.`)) return;
    const wasActive = p.id === activeId;
    setProfiles(removeProfile(userId, p.id));
    if (wasActive) window.location.reload();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Profile: ${active?.name}. Switch profile`}
        className={`flex items-center gap-2 rounded-lg border border-border/70 bg-background text-left transition-colors hover:border-primary/40 ${
          compact ? "h-11 px-2" : "w-full px-2.5 py-2"
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
          {initial(active?.name ?? "")}
        </span>
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Profile</span>
            <span className="block truncate text-sm font-semibold text-foreground">{active?.name}</span>
          </span>
        )}
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1.5 w-64 rounded-xl border border-border/70 bg-popover p-1.5 shadow-elegant ${
            compact ? "right-0" : "left-0"
          }`}
        >
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {profiles.map((p) => (
              <li key={p.id} className="group flex items-center gap-1">
                {editing === p.id ? (
                  <form
                    className="flex flex-1 items-center gap-1 p-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveRename(p.id);
                    }}
                  >
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      aria-label={`New name for ${p.name}`}
                      className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                    />
                    <button type="submit" className="h-8 rounded-md px-2 text-xs font-semibold text-primary hover:bg-primary/10">
                      Save
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => switchTo(p.id)}
                      disabled={!!switching}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                        {initial(p.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{switching === p.id ? `Opening ${p.name}...` : p.name}</span>
                      {p.id === activeId && <Check className="h-4 w-4 shrink-0 text-primary" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(p.id);
                        setEditName(p.name);
                      }}
                      aria-label={`Rename ${p.name}`}
                      title={`Rename ${p.name}`}
                      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {p.id !== DEFAULT_PROFILE_ID && (
                      <button
                        type="button"
                        onClick={() => remove(p)}
                        aria-label={`Remove ${p.name}`}
                        title={`Remove ${p.name}`}
                        className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <form
            className="mt-1 flex items-center gap-1 border-t border-border/70 p-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Profile name"
              aria-label="New profile name"
              maxLength={40}
              className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
