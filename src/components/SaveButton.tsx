import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookmarkCheck, ChevronDown, Plus } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  addBoard,
  addItem,
  lastBoard,
  loadBoards,
  MAX_BOARD_NAME,
  MAX_BOARDS,
  onBoardsChanged,
  rememberBoard,
  removeItem,
  restoreItem,
  runRead,
  SAVE_COPY,
  setItemBoards,
  toBoardItem,
  type Board,
  type BoardItem,
  type BoardsState,
} from "@/lib/boards";
import type { RemixSource } from "@/lib/remixSource";
import { useLeoUser } from "@/lib/useLeoOnly";
import { cn } from "@/lib/utils";

// Save on any card or drawer (docs/north-star/items/find-save-anywhere.md), Leo's sign-ins only. A tap files the
// card into the board last used on this device; "Saved" again takes it out with Undo; the chevron picks boards.

const EMPTY: BoardsState = { boards: [], items: [] };

/** This brand's boards, drawn again whenever anything saves to them on this device. */
export function useBoards(userId: string | null | undefined): BoardsState {
  const [, tick] = useState(0);
  useEffect(() => onBoardsChanged(() => tick((n) => n + 1)), []);
  return userId ? loadBoards(userId) : EMPTY;
}

/** Takes an item out at once and offers Undo for 6 seconds; `after` hears false, then true on Undo. */
export function useRemoveWithUndo(userId: string | null | undefined) {
  const { toast } = useToast();
  return (key: string, after?: (saved: boolean) => void) => {
    const removed = userId ? removeItem(userId, key) : null;
    if (!removed || !userId) return;
    after?.(false);
    toast({
      title: "Removed.",
      duration: 6000,
      action: (
        <ToastAction altText="Undo" onClick={() => restoreItem(userId, removed) && after?.(true)}>
          Undo
        </ToastAction>
      ),
    });
  };
}

/** "New board": an inline name box, Enter creates. Disabled at 20 boards, with the reason beside it. */
export function NewBoard({ userId, count, onCreated, className }: { userId: string; count: number; onCreated?: (id: string) => void; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const full = count >= MAX_BOARDS;
  if (!editing || full) {
    return (
      <div className={cn("space-y-1", className)}>
        <Button type="button" variant="ghost" size="sm" disabled={full} onClick={() => setEditing(true)} className="h-9 gap-1.5 px-2 text-xs">
          <Plus className="h-3.5 w-3.5" /> New board
        </Button>
        {full && <p className="px-2 text-[11px] text-muted-foreground">{SAVE_COPY.boardCap}</p>}
      </div>
    );
  }
  const create = () => {
    const r = addBoard(userId, name);
    if ("board" in r) {
      setName("");
      setError("");
      setEditing(false);
      onCreated?.(r.board.id);
    } else if (r.reason !== "empty") setError(r.reason === "duplicate" ? SAVE_COPY.boardDup : SAVE_COPY.boardCap);
  };
  return (
    <div className={cn("space-y-1", className)}>
      <Input
        autoFocus
        value={name}
        maxLength={MAX_BOARD_NAME}
        placeholder="Board name"
        aria-label="Board name"
        aria-invalid={Boolean(error)}
        onChange={(e) => {
          setName(e.target.value);
          setError("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            create();
          } else if (e.key === "Escape") {
            // only the box closes, not the drawer or menu around it
            e.stopPropagation();
            setEditing(false);
          }
        }}
        className="h-9"
      />
      {error && (
        <p role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** The boards an item is on, as checkboxes, with New board; none ticked = Unsorted. */
export function BoardChecklist({ userId, item, boards, id }: { userId: string; item: BoardItem; boards: Board[]; id?: string }) {
  const put = (next: string[], picked?: string) => {
    setItemBoards(userId, item.key, next);
    if (picked) rememberBoard(picked);
  };
  return (
    <div id={id} className="space-y-1">
      {boards.length > 0 && (
        <ul className="space-y-0.5">
          {boards.map((b) => {
            const on = item.boards.includes(b.id);
            return (
              <li key={b.id}>
                <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent [@media(pointer:coarse)]:min-h-11">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => (on ? put(item.boards.filter((x) => x !== b.id)) : put([...item.boards, b.id], b.id))}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="min-w-0 truncate">{b.name}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <NewBoard userId={userId} count={boards.length} onCreated={(b) => put([...item.boards, b], b)} />
    </div>
  );
}

export default function SaveButton({
  source,
  onChange,
  className,
  size = "sm",
}: {
  source: RemixSource;
  onChange?: (saved: boolean) => void;
  className?: string;
  size?: ButtonProps["size"];
}) {
  const leo = useLeoUser();
  const store = useBoards(leo?.id);
  const removeWithUndo = useRemoveWithUndo(leo?.id);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const chevron = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - r.right);
    // below the button, or above it when the page has no room left underneath
    setPos(window.innerHeight - r.bottom < 280 && r.top > 280 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    // the panel is placed once, so a scroll of the page (not of the panel) closes it
    const scrolled = (e: Event) => !panel.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", scrolled);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", scrolled);
    };
  }, [open]);

  if (!leo) return null;
  const saved = store.items.find((i) => i.key === source.key || (source.url && i.url === source.url));

  const save = () => {
    const board = lastBoard(leo.id);
    const r = addItem(leo.id, toBoardItem(source), board ? [board] : []);
    if ("item" in r) {
      onChange?.(true);
      if (r.item.read === "pending") void runRead(leo.id, r.item.key);
    } else toast({ title: r.reason === "full" ? SAVE_COPY.full : r.reason === "storage" ? SAVE_COPY.storage : SAVE_COPY.already });
  };
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !open) return;
    // the drawer around a card closes on Escape too: this one closes only the panel
    e.stopPropagation();
    setOpen(false);
    chevron.current?.focus();
  };

  if (!saved) {
    return (
      <Button type="button" variant="outline" size={size} onClick={save} className={cn("gap-1.5", className)}>
        <Bookmark className="h-4 w-4" /> Save
      </Button>
    );
  }
  return (
    <div ref={anchor} className={cn("inline-flex", className)}>
      <Button
        type="button"
        variant="outline"
        size={size}
        aria-pressed
        onClick={() => removeWithUndo(saved.key, onChange)}
        className="flex-1 gap-1.5 rounded-r-none border-primary/50 text-primary"
      >
        <BookmarkCheck className="h-4 w-4" /> Saved
      </Button>
      <Button
        ref={chevron}
        type="button"
        variant="outline"
        size={size}
        aria-label="Choose boards"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={closeOnEscape}
        className="-ml-px rounded-l-none border-primary/50 px-2 text-primary"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="dialog"
            aria-label="Save to"
            onKeyDown={closeOnEscape}
            style={pos}
            className="fixed z-[75] max-h-[60vh] w-64 overflow-y-auto rounded-xl border border-border/70 bg-popover p-2 shadow-elegant"
          >
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Save to</p>
            <BoardChecklist userId={leo.id} item={saved} boards={store.boards} />
          </div>,
          document.body,
        )}
    </div>
  );
}
