// Saved (/saved, Leo's sign-ins only; docs/north-star/items/find-save-anywhere.md): every post, ad, trend and pasted
// link he saved, in boards. The board, platform, search and open item live in the URL; /saved?url= (or text=, from a
// share sheet) saves that link once and opens it. Reads run outside React (boards.ts), so leaving the page keeps them.
// Each saved post is broken down on save (find-ai-tagging): tag chips on the card, a Breakdown in the drawer
// (/saved?item=<key>#breakdown), and the hook, angle, topic, emotion, audience and format filters in the URL.
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import { AtSign, Bookmark, ExternalLink, Facebook, Globe, Instagram, Linkedin, Megaphone, MoreHorizontal, Music, Shuffle, Trash2, X, Youtube } from "lucide-react";
import CopyLinkButton from "@/components/CopyLinkButton";
import PriceChip from "@/components/PriceChip";
import RemixButton from "@/components/remix/RemixButton";
import { BoardChecklist, NewBoard, useBoards, useRemoveWithUndo } from "@/components/SaveButton";
import VideoEmbed from "@/components/VideoEmbed";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  MAX_ITEMS,
  MAX_NOTE,
  PLATFORM_NAME,
  READ_CHIP,
  SAVE_COPY,
  boardCounts,
  deleteBoard,
  fetchTranscript,
  filterItems,
  findItem,
  fromSavedItem,
  lastBoard,
  loadBoards,
  loadTranscripts,
  onReads,
  readShown,
  rememberBoard,
  remixUrlFor,
  runRead,
  runTags,
  saveLink,
  setNote,
  tagShown,
  titleOf,
  writeUrlFor,
  type BoardItem,
  type BoardsState,
  type PlatformChip,
  type SavePlatform,
} from "@/lib/boards";
import { useUsesLeft } from "@/lib/aiUsage";
import { embedUrlFor, safeExternalUrl } from "@/lib/embed";
import { links } from "@/lib/links";
import { TAG_COPY, TAG_FILTERS, chipsFor, filterByTags, formatLine, hookRow, sureTag, tagCounts, tagLabel, tagText, type TagFilter } from "@/lib/postTags";
import { useScrollToHash, useUrlItem, useUrlSearch, useUrlState, useUrlUpdate } from "@/lib/urlState";
import { parseReelUrl } from "../../supabase/functions/clone-reel/logic.ts";
import { useLeoUser } from "@/lib/useLeoOnly";
import { cn } from "@/lib/utils";
import NotFoundPage from "@/pages/NotFoundPage";

const CHIPS: [PlatformChip | "all", string][] = [["all", "All"], ["instagram", "Instagram"], ["tiktok", "TikTok"], ["youtube", "YouTube"], ["ad", "Ads"], ["link", "Links"]];
const ICON: Record<SavePlatform, typeof Globe> = { instagram: Instagram, tiktok: Music, youtube: Youtube, "meta-ad": Megaphone, linkedin: Linkedin, x: AtSign, facebook: Facebook, web: Globe };
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
type Part = "note" | "boards";
// the share params of the landing being saved now: React's dev double effect must not save it twice
let landing = "";

export default function SavedPage() {
  const leo = useLeoUser();
  if (leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  if (!leo) return <NotFoundPage />;
  return <Saved userId={leo.id} />;
}

const boardName = (s: BoardsState, id: string) => s.boards.find((b) => b.id === id)?.name ?? "Unsorted";

function numbersLine(i: BoardItem): string {
  const n = i.numbers;
  return [n.views ? `${compact.format(n.views)} views` : n.likes ? `${compact.format(n.likes)} likes` : "", n.daysRunning !== undefined ? `${n.daysRunning} days` : ""].filter(Boolean).join(", ");
}

function Saved({ userId }: { userId: string }) {
  const { toast } = useToast();
  const store = useBoards(userId);
  const [, tick] = useState(0);
  const [params] = useSearchParams();
  const update = useUrlUpdate();
  const [board, setBoard] = useUrlState("board", "all", { allowed: ["all", "unsorted", ...store.boards.map((b) => b.id)] });
  const [platform, setPlatform] = useUrlState<PlatformChip | "all">("platform", "all", { allowed: CHIPS.map(([c]) => c) });
  const [text, setText, q] = useUrlSearch("q");
  const tagFilter = useTagFilters();
  const [itemKey, openItem, closeItem] = useUrlItem("item");
  const [link, setLink] = useState("");
  const [picked, setPick] = useState(() => lastBoard(userId));
  // a board deleted since it was picked: back to Unsorted
  const pick = store.boards.some((b) => b.id === picked) ? picked : "";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; show?: string } | null>(null);
  const [focus, setFocus] = useState<Part | null>(null);
  const [confirming, setConfirming] = useState(false);
  const removeWithUndo = useRemoveWithUndo(userId);

  useEffect(() => onReads(() => tick((n) => n + 1)), []);
  // a read left pending by a closed tab turns into "Couldn't read it" after a few minutes: look again now and then
  const pending = store.items.some((i) => i.read === "pending");
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [pending]);

  const open = itemKey ? findItem(store, itemKey) : undefined;
  // an unknown item is dropped quietly
  useEffect(() => {
    if (itemKey && !open) closeItem();
  }, [itemKey, open, closeItem]);
  useEffect(() => setConfirming(false), [board]);

  const shareUrl = params.get("url");
  const shareText = params.get("text");
  const shareTitle = params.get("title") ?? "";
  // The link landing (a share sheet, a Shortcut or a pasted /saved?url= link): saved once into the last board used,
  // shown open, and the share params replaced away, so a reload saves nothing.
  useEffect(() => {
    const shared = [shareUrl, shareText].filter(Boolean).join(" ");
    if (!shared || landing === shared) return;
    landing = shared;
    const into = lastBoard(userId);
    const gone = { url: null, text: null, title: null };
    void saveLink(userId, shared, into, shareTitle).then((r) => {
      if ("item" in r) {
        update({ ...gone, item: r.item.key });
        toast({ title: `Saved to ${boardName(store, into)}.`, action: <ToastAction altText="Move to a board" onClick={() => setFocus("boards")}>Move</ToastAction> });
      } else if (r.reason === "duplicate") {
        update({ ...gone, item: r.existing.key });
        toast({ title: SAVE_COPY.already });
      } else {
        update(gone);
        setLink(shared);
        setMsg({ text: r.reason === "bad" ? SAVE_COPY.bad : r.reason === "full" ? SAVE_COPY.full : SAVE_COPY.storage });
      }
      landing = "";
    });
    // store is read only for the board's name
  }, [shareUrl, shareText, shareTitle, userId, update, toast]);

  const full = store.items.length >= MAX_ITEMS;
  const counts = boardCounts(store);
  const inView = filterItems(store.items, { board, platform, q });
  const shown = filterByTags(inView, tagFilter.values);
  const anyTags = store.items.some((i) => i.tags) || tagFilter.on;
  const current = store.boards.find((b) => b.id === board);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy || full || !link.trim()) return;
    setBusy(true);
    setMsg(null);
    const r = await saveLink(userId, link, pick);
    setBusy(false);
    if ("item" in r) {
      setLink("");
      if (pick) rememberBoard(pick);
    } else if (r.reason === "duplicate") setMsg({ text: SAVE_COPY.already, show: r.existing.key });
    else setMsg({ text: r.reason === "bad" ? SAVE_COPY.bad : r.reason === "full" ? SAVE_COPY.full : SAVE_COPY.storage });
  };
  const openAt = (key: string, part: Part | null = null) => {
    setFocus(part);
    openItem(key);
  };

  return (
    <div className="space-y-5">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Saved</h1>

      <form onSubmit={submit} className="space-y-1.5">
        <div className="flex flex-wrap gap-2">
          <Input
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              setMsg(null);
            }}
            placeholder="Paste a link to a post or ad"
            aria-label="Link to save"
            className="min-w-0 basis-full sm:w-auto sm:flex-1 sm:basis-auto"
          />
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            aria-label="Board to save to"
            className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm sm:max-w-[12rem] sm:flex-none [@media(pointer:coarse)]:min-h-11"
          >
            <option value="">Unsorted</option>
            {store.boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy || full || !link.trim()}>
            {busy ? "Saving..." : "Save"}
          </Button>
        </div>
        {full && <p className="text-sm text-muted-foreground">{SAVE_COPY.full}</p>}
        {msg && (
          <p role="alert" className="text-sm text-muted-foreground">
            {msg.text}{" "}
            {msg.show && (
              <button type="button" onClick={() => openAt(msg.show!)} className="font-medium text-primary underline-offset-4 hover:underline">
                Show it
              </button>
            )}
          </p>
        )}
      </form>

      <div className="space-y-4 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6 lg:space-y-0">
        <nav aria-label="Boards" className="flex items-start gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {[{ id: "all", name: "All" }, { id: "unsorted", name: "Unsorted" }, ...store.boards].map((b) => (
            <button
              key={b.id}
              type="button"
              aria-pressed={board === b.id}
              onClick={() => setBoard(b.id)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors lg:w-full lg:justify-between lg:rounded-lg lg:text-sm [@media(pointer:coarse)]:min-h-11",
                board === b.id ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <span className="max-w-[10rem] truncate">{b.name}</span>
              <span className="tabular-nums">{counts[b.id] ?? 0}</span>
            </button>
          ))}
          <NewBoard userId={userId} count={store.boards.length} onCreated={(id) => setBoard(id)} className="shrink-0" />
        </nav>

        <div className="min-w-0 space-y-4">
          {current && (
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto truncate text-base font-semibold">{current.name}</h2>
              {confirming ? (
                <div role="alertdialog" aria-label="Delete board" className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/40 p-2 text-sm sm:w-auto">
                  <span className="mr-1">
                    Delete "{current.name}"? Its {counts[current.id] ?? 0} {counts[current.id] === 1 ? "post stays" : "posts stay"} in All.
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      deleteBoard(userId, current.id);
                      setBoard("all");
                    }}
                  >
                    Delete board
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)} className="gap-1.5 text-muted-foreground">
                  <Trash2 className="h-3.5 w-3.5" /> Delete board
                </Button>
              )}
            </div>
          )}

          {store.items.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex max-w-full gap-1.5 overflow-x-auto">
                {CHIPS.map(([c, label]) => (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={platform === c}
                    onClick={() => setPlatform(c)}
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-medium transition-colors sm:h-7 [@media(pointer:coarse)]:min-h-11",
                      platform === c ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search saved posts" aria-label="Search saved posts" className="h-9 w-full sm:ml-auto sm:w-56" />
            </div>
          )}

          {store.items.length > 0 && anyTags && <TagFilters filter={tagFilter} counts={tagCounts(inView)} />}

          {store.items.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="Nothing saved yet"
              actions={
                <Button asChild variant="outline">
                  <Link to={links.swipe()}>Browse top posts</Link>
                </Button>
              }
            >
              Paste a link above, or press Save on any top post or ad.
            </EmptyState>
          ) : current && !counts[current.id] ? (
            <p className="text-sm text-muted-foreground">No posts in this board yet.</p>
          ) : board === "unsorted" && !counts.unsorted ? (
            <p className="text-sm text-muted-foreground">No posts in this board yet.</p>
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved posts match.{" "}
              <button
                type="button"
                onClick={() => {
                  setText("");
                  update({ platform: null, q: null, ...Object.fromEntries(TAG_FILTERS.map((f) => [f.param, null])) });
                }}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Clear
              </button>
            </p>
          ) : (
            <ul className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((i) => (
                <ItemCard key={i.key} item={i} userId={userId} onOpen={(part) => openAt(i.key, part)} onRemove={() => removeWithUndo(i.key)} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {open && (
        <ItemDrawer
          key={open.key}
          userId={userId}
          item={open}
          store={store}
          focus={focus}
          onFocused={() => setFocus(null)}
          onClose={closeItem}
          onRemove={() => {
            closeItem();
            removeWithUndo(open.key);
          }}
        />
      )}
    </div>
  );
}

type TagParam = TagFilter["param"];
const allowed = (param: TagParam) => ["all", ...TAG_FILTERS.find((f) => f.param === param)!.options.map((o) => o.value)];

/** The six tag filters in the URL (?hook=myth-bust...), "all" left out. */
function useTagFilters() {
  const hook = useUrlState<string>("hook", "all", { allowed: allowed("hook") });
  const angle = useUrlState<string>("angle", "all", { allowed: allowed("angle") });
  const topic = useUrlState<string>("topic", "all", { allowed: allowed("topic") });
  const emotion = useUrlState<string>("emotion", "all", { allowed: allowed("emotion") });
  const audience = useUrlState<string>("audience", "all", { allowed: allowed("audience") });
  const format = useUrlState<string>("format", "all", { allowed: allowed("format") });
  const all: Record<TagParam, [string, (v: string) => void]> = { hook, angle, topic, emotion, audience, format };
  const values = Object.fromEntries(TAG_FILTERS.map((f) => [f.param, all[f.param][0]])) as Record<TagParam, string>;
  return { values, set: (param: TagParam, v: string) => all[param][1](v), on: Object.values(values).some((v) => v !== "all") };
}

function TagFilters({ filter, counts }: { filter: ReturnType<typeof useTagFilters>; counts: ReturnType<typeof tagCounts> }) {
  return (
    <div role="group" aria-label="Filter by tag" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
      {TAG_FILTERS.map((f) => {
        const value = filter.values[f.param];
        const options = f.options.filter((o) => counts[f.param][o.value] || o.value === value);
        return (
          <label key={f.param} className="inline-flex h-9 min-w-0 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-xs [@media(pointer:coarse)]:h-11">
            <span className="shrink-0 font-semibold text-muted-foreground">{f.label}</span>
            <select value={value} onChange={(e) => filter.set(f.param, e.target.value)} aria-label={f.label} className="h-full min-w-0 flex-1 bg-transparent font-medium text-foreground outline-none sm:max-w-[10rem]">
              <option value="all">All</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label} ({counts[f.param][o.value] ?? 0})
                </option>
              ))}
            </select>
          </label>
        );
      })}
    </div>
  );
}

const PILL = "rounded-full px-2 py-0.5 text-[11px] font-medium";

/** Under a card's caption: the tag chips, or where the breakdown is. Nothing while the read runs (ReadChip says so). */
function TagChips({ item, userId }: { item: BoardItem; userId: string }) {
  const state = tagShown(item);
  if (readShown(item) === "pending") return null;
  if (state === "pending") return <span className={cn(PILL, "bg-primary/10 text-primary")}>{TAG_COPY.running}</span>;
  if (state === "capped") return <span className={cn(PILL, "bg-muted text-muted-foreground")}>{TAG_COPY.capped}</span>;
  if (state === "failed") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={cn(PILL, "bg-muted text-muted-foreground")}>{TAG_COPY.failed}</span>
        <button type="button" onClick={() => void runTags(userId, item.key)} className="text-[11px] font-medium text-primary underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11">
          Try again
        </button>
      </span>
    );
  }
  const chips = chipsFor(item);
  if (!chips.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span key={c} className={cn(PILL, "bg-secondary text-secondary-foreground")}>
          {c}
        </span>
      ))}
    </span>
  );
}

const LABEL = "pt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
const TEXT = "min-w-0 text-sm leading-relaxed text-foreground/85 [overflow-wrap:anywhere]";

/** The drawer's Breakdown: the teardown's rows and the tags, or where it is; #breakdown scrolls here. */
function Breakdown({ userId, item, note }: { userId: string; item: BoardItem; note: string }) {
  const { toast } = useToast();
  const state = tagShown(item);
  // pending here or on another device (tagShown turns one that died with its tab into failed)
  const running = state === "pending";
  const left = useUsesLeft(running);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [, tick] = useState(0);
  const t = item.tags;
  if (readShown(item) === "pending") return null;

  const transcript = loadTranscripts(userId)[item.key] ?? "";
  const canRead = tagText({ ...item, note }, transcript) !== "";
  const press = (again: boolean) => {
    // the note box saves a second after typing stops: Break it down reads what is in it now
    if (note !== item.note) setNote(userId, item.key, note);
    void runTags(userId, item.key, again);
  };
  const load = () => {
    setLoading(true);
    setLoadError("");
    fetchTranscript(userId, item.key)
      .then((words) => (words ? setShown(true) : setLoadError("No transcript came back for this post.")))
      .catch((e: Error) => setLoadError(e.message))
      .finally(() => {
        setLoading(false);
        tick((n) => n + 1);
      });
  };
  const copy = () =>
    navigator.clipboard.writeText(transcript).then(
      () => toast({ title: "Transcript copied." }),
      () => toast({ title: "Couldn't copy. Select the text instead." }),
    );
  const chip = <PriceChip feature="post-tags" left={left("post-tags")} />;
  const formula = t ? sureTag(t, "formula") : null;
  const hook = t ? hookRow(t) : null;
  const rows = t
    ? ([
        ["Angle", tagLabel(item, "angle")],
        ["Topic", tagLabel(item, "topic")],
        ["Feeling", tagLabel(item, "emotion")],
        ["For", tagLabel(item, "audience")],
        ["Format", formatLine(t)],
      ] as const).filter(([, v]) => v)
    : [];

  return (
    <section id="breakdown" aria-label="Breakdown" className="scroll-mt-16 space-y-3 rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Breakdown</h3>
        {t && !running && (
          <span className="ml-auto flex flex-wrap-reverse items-center justify-end gap-x-2">
            <span className="whitespace-nowrap">{chip}</span>
            <Button type="button" variant="ghost" size="sm" onClick={() => press(true)}>
              Break it down again
            </Button>
          </span>
        )}
      </div>

      {running && (
        <p role="status" className="text-sm text-muted-foreground">
          {TAG_COPY.running}...
        </p>
      )}
      {state === "capped" && <p className="text-sm text-foreground/85">{TAG_COPY.capped}</p>}
      {state === "failed" && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-foreground/85">{TAG_COPY.failed}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => press(false)}>
            Try again
          </Button>
          {chip}
        </div>
      )}
      {!t && !running && state !== "failed" && state !== "capped" && (
        <div className="space-y-2">
          {!canRead && <p className="text-sm text-muted-foreground">{TAG_COPY.nothing}</p>}
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canRead} onClick={() => press(false)}>
              Break it down
            </Button>
            {chip}
          </div>
        </div>
      )}

      {t && hook && (
        <>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-3">
            {(hook.name || hook.line) && (
              <>
                <dt className={LABEL}>Hook</dt>
                <dd className={TEXT}>
                  {hook.name && <span className="font-medium text-foreground">{hook.name} </span>}
                  {hook.line && `"${hook.line}"`}
                </dd>
              </>
            )}
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className={LABEL}>{label}</dt>
                <dd className={TEXT}>{value}</dd>
              </Fragment>
            ))}
            {t.beats.length > 0 && (
              <>
                <dt className={LABEL}>How it is built</dt>
                <dd className={TEXT}>
                  <ol className="list-decimal space-y-1 pl-4">
                    {t.beats.map((beat, n) => (
                      <li key={n}>{beat}</li>
                    ))}
                  </ol>
                </dd>
              </>
            )}
            {t.words !== null && (
              <>
                <dt className={LABEL}>Transcript</dt>
                <dd className={cn(TEXT, "space-y-2")}>
                  {t.words === 0 ? (
                    TAG_COPY.noSpeech
                  ) : (
                    <>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>{t.words} words</span>
                        {transcript ? (
                          <>
                            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => void copy()}>
                              Copy transcript
                            </Button>
                            <Button type="button" variant="link" size="sm" className="h-auto px-0" aria-expanded={shown} onClick={() => setShown((v) => !v)}>
                              {shown ? "Hide transcript" : "Show transcript"}
                            </Button>
                          </>
                        ) : (
                          parseReelUrl(item.url).ok && (
                            <Button type="button" variant="link" size="sm" className="h-auto px-0" disabled={loading} onClick={load}>
                              {loading ? "Loading..." : "Load transcript"}
                            </Button>
                          )
                        )}
                      </span>
                      {!transcript && parseReelUrl(item.url).ok && <span className="block text-[11px] text-muted-foreground">Uses 1 of today's reads</span>}
                      {loadError && <span role="alert" className="block text-[11px] text-destructive">{loadError}</span>}
                      {shown && transcript && <span className="block max-h-48 overflow-y-auto whitespace-pre-line rounded-md bg-muted/50 p-2 text-[13px]">{transcript}</span>}
                    </>
                  )}
                </dd>
              </>
            )}
          </dl>
          {t.by === "llm" && <p className="text-[11px] text-muted-foreground">{TAG_COPY.noJev}</p>}
          {formula && (
            <Button asChild variant="outline" size="sm" className="w-full gap-1.5">
              <Link to={writeUrlFor(item, { formula, ...(item.caption && !item.title ? { detail: item.caption.split("\n")[0].slice(0, 80) } : {}) })}>
                <Shuffle className="h-3.5 w-3.5" /> Remix with this hook
              </Link>
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function Cover({ item, className }: { item: BoardItem; className?: string }) {
  const Icon = ICON[item.platform];
  if (item.cover) return <img src={item.cover} alt="" loading="lazy" className={cn("w-full bg-muted object-cover", className)} />;
  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-1.5 bg-muted text-muted-foreground", className)}>
      <Icon className="h-7 w-7" />
      <span className="text-xs font-medium">{PLATFORM_NAME[item.platform]}</span>
    </div>
  );
}

function ReadChip({ item, userId }: { item: BoardItem; userId: string }) {
  const state = readShown(item);
  const chip = READ_CHIP[state];
  if (!chip) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", state === "pending" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{chip}</span>
      {state === "failed" && (
        <button type="button" onClick={() => void runRead(userId, item.key)} className="text-[11px] font-medium text-primary underline-offset-4 hover:underline [@media(pointer:coarse)]:min-h-11">
          Try again
        </button>
      )}
    </span>
  );
}

function RemixFor({ item, className }: { item: BoardItem; className?: string }) {
  return (
    <RemixButton source={fromSavedItem(item)} note={item.note || undefined} label={titleOf(item)} className={className}>
      <Button asChild size="sm" variant="outline" className={cn("gap-1.5", className)}>
        <Link to={remixUrlFor(item)}>
          <Shuffle className="h-3.5 w-3.5" /> Remix
        </Link>
      </Button>
    </RemixButton>
  );
}

function ItemCard({ item, userId, onOpen, onRemove }: { item: BoardItem; userId: string; onOpen: (part?: Part) => void; onRemove: () => void }) {
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setMenu(false);
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [menu]);
  const original = safeExternalUrl(item.url);
  const numbers = numbersLine(item);
  const actions: { label: string; run: () => void }[] = [
    { label: "Move to board", run: () => onOpen("boards") },
    { label: "Add a note", run: () => onOpen("note") },
    ...(original ? [{ label: "Open original", run: () => window.open(original, "_blank", "noopener,noreferrer") }] : []),
    { label: "Remove", run: onRemove },
  ];
  return (
    <li className="flex flex-col rounded-xl border border-border/60 bg-card">
      <button type="button" onClick={() => onOpen()} className="flex flex-col text-left" aria-label={`Open ${titleOf(item)}`}>
        <Cover item={item} className="h-28 rounded-t-xl sm:h-36" />
        <span className="space-y-1 p-3">
          <span className="block truncate text-[11px] font-medium text-muted-foreground">
            {PLATFORM_NAME[item.platform]}
            {item.author && ` ${item.author}`}
          </span>
          <span className="line-clamp-3 block text-sm leading-snug">{item.caption && !item.title ? item.caption : titleOf(item)}</span>
          {numbers && <span className="block text-[11px] text-muted-foreground">{numbers}</span>}
        </span>
      </button>
      <div className="mt-auto space-y-2 px-3 pb-3">
        <ReadChip item={item} userId={userId} />
        <TagChips item={item} userId={userId} />
        <div ref={root} className="relative flex items-center gap-2">
          <RemixFor item={item} />
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
            onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
            className="ml-auto h-9 w-9 px-0"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menu && (
            <div role="menu" aria-label="More" onKeyDown={(e) => e.key === "Escape" && setMenu(false)} className="absolute bottom-full right-0 z-30 mb-1 w-48 rounded-xl border border-border/70 bg-popover p-1 shadow-elegant">
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    a.run();
                  }}
                  className="flex h-9 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none [@media(pointer:coarse)]:h-11"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function ItemDrawer({
  userId,
  item,
  store,
  focus,
  onFocused,
  onClose,
  onRemove,
}: {
  userId: string;
  item: BoardItem;
  store: BoardsState;
  focus: Part | null;
  onFocused: () => void;
  onClose: () => void;
  onRemove: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [note, setDraft] = useState(item.note);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);
  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(focus === "note" ? "saved-note" : "saved-item-boards");
    el?.scrollIntoView({ block: "center" });
    (focus === "note" ? el : el?.querySelector<HTMLElement>("input, button"))?.focus();
    onFocused();
  }, [focus, onFocused]);
  // the note saves 1 s after typing stops, on blur, and when the drawer closes
  useEffect(() => {
    if (note === item.note) return;
    const t = setTimeout(() => setNote(userId, item.key, note), 1000);
    return () => clearTimeout(t);
  }, [note, item.note, item.key, userId]);
  useEffect(
    () => () => {
      const stored = findItem(loadBoards(userId), item.key);
      if (stored && stored.note !== noteRef.current) setNote(userId, item.key, noteRef.current);
    },
    [userId, item.key],
  );

  useScrollToHash();

  const embed = embedUrlFor(item.url) !== null;
  const original = safeExternalUrl(item.url);
  const numbers = numbersLine(item);

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titleOf(item)}>
      <button type="button" tabIndex={-1} aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-background shadow-xl sm:h-auto sm:max-h-[92vh] sm:max-w-md sm:rounded-2xl sm:border sm:border-border/70">
        <CopyLinkButton label="Copy link to this post" className="absolute right-14 top-3 z-20 rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 hover:text-white" />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/75 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex-1 overflow-y-auto">
          <div className="bg-black">
            {embed ? (
              <VideoEmbed url={item.url} autoPlay label={titleOf(item)} className="max-w-[calc(50vh*0.5625)] rounded-none border-0 bg-black" />
            ) : (
              <Cover item={item} className="h-48 sm:h-56" />
            )}
          </div>

          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {PLATFORM_NAME[item.platform]}
                {item.author && ` ${item.author}`}
                {numbers && `, ${numbers}`}
              </p>
              {/* a read post goes by its caption; the link's host and path only when there is nothing else */}
              {(item.title || !item.caption) && <p className="text-base font-semibold leading-snug">{titleOf(item)}</p>}
              {item.caption && item.caption !== item.title && <p className="max-h-40 overflow-y-auto whitespace-pre-line text-sm text-foreground/80">{item.caption}</p>}
              <ReadChip item={item} userId={userId} />
            </div>

            <div className="space-y-2">
              <RemixFor item={item} className="w-full" />
              <div className="flex gap-2">
                {original && (
                  <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5">
                    <a href={original} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" /> Open original
                    </a>
                  </Button>
                )}
                <Button type="button" variant="outline" size="sm" onClick={onRemove} className="flex-1 gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            </div>

            <Breakdown userId={userId} item={item} note={note} />

            <Textarea
              id="saved-note"
              value={note}
              maxLength={MAX_NOTE}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => note !== item.note && setNote(userId, item.key, note)}
              placeholder="Why you saved it, or what to keep when you remix"
              aria-label="Note"
              rows={3}
            />

            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Boards</p>
              <BoardChecklist id="saved-item-boards" userId={userId} item={item} boards={store.boards} />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
