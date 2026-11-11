// /settings/post-choices (Settings > You; Fastlane's Post choices): five per-brand choices the makers start from
// (src/lib/postChoices.ts). Any sign-in; each change saves at once and says so. A row shows only where this sign-in
// has a maker that reads it: Your influencers is Leo's (saved presenters are), and it needs a presenter picked as
// the brand's Who appears on /people. Language (Leo's, as on Brand kit: the kit's postLang) and Post labels (what a post
// says about AI and ads, and where each is set) follow, each with its own Settings tile: #language and #labels scroll to
// them. Nothing here is a view or filter, so the page has no URL params.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { links, type PostLang } from "@/lib/links";
import { DISCLOSURES } from "@/lib/plainText";
import { LANG_NAMES } from "@/lib/translate";
import { useScrollToHash } from "@/lib/urlState";
import { CAPTION_CHOICES, TEXT_STYLES, TEXT_STYLE_IDS, loadPostChoices, postLangOf, savePostChoices, savePostLang, type PostChoices } from "@/lib/postChoices";
import { loadPresenters, onPresenters } from "@/lib/presenters";
import { ownBrandName } from "@/lib/remixBrand";
import { useLeoUser, useSignedInUser } from "@/lib/useLeoOnly";
import { cn } from "@/lib/utils";
import { STYLES, styleLabel } from "@/lib/videoEdit";
import { defaultSkill, loadSkills } from "@/lib/videoSkills";

const TILE = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ON = "border-primary/60 bg-primary/10 text-primary";
const OFF = "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground";
// a stand-in for a video frame, dark in both themes so the white sample words read
const FRAME = "grid h-16 w-full place-items-center rounded-md bg-neutral-800 dark:bg-neutral-800 px-2";

function Row({ id, title, hint, children }: { id: string; title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <section id={id.replace("pc-", "")} aria-labelledby={id} className="scroll-mt-20 space-y-3 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
      <div>
        <h2 id={id} className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Picks<T extends string>({ labelledBy, value, options, onPick }: { labelledBy: string; value: T; options: readonly (readonly [T, string])[]; onPick: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {options.map(([v, text]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onPick(v)} className={cn(TILE, value === v ? ON : OFF)}>
          {text}
        </button>
      ))}
    </div>
  );
}

const HOW_OFTEN = [["always", "Always"], ["sometimes", "Sometimes"], ["never", "Never"]] as const;
const LANGS = [["en", "English"], ...(Object.entries(LANG_NAMES) as [PostLang, string][])] as const;
const GO = "inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline";
/** What a post can say about AI and ads today, and the page that sets it. */
export const POST_LABELS = [
  { what: "A line in the caption", how: `Disclose adds ${Object.values(DISCLOSURES).map((d) => d.label).join(", ").replace(/, ([^,]*)$/, " or $1")} to a written post.`, to: links.generate(), go: "Write a post" },
  { what: "TikTok's ad label", how: "A slideshow campaign that posts straight to your profile can say it promotes your business or is a paid partnership.", to: "/design/campaigns", go: "Slideshow campaigns" },
  { what: "Made with AI label", how: "Not sent with a post yet. Set it in the network's own app." },
] as const;

function Choices({ userId, leo }: { userId: string; leo: boolean }) {
  const [c, setC] = useState<PostChoices>(() => loadPostChoices(userId));
  const [saved, setSaved] = useState<"" | "saved" | "failed">("");
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (patch: Partial<PostChoices>) => {
    const next = { ...c, ...patch };
    setC(next);
    const ok = savePostChoices(userId, next);
    setSaved(ok ? "saved" : "failed");
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setSaved(""), 2500);
  };

  useScrollToHash();
  // the brand kit's post language (postChoices.ts)
  const [lang, setLangState] = useState(() => postLangOf(userId));
  const setLang = (v: PostLang | "en") => {
    const ok = savePostLang(userId, v);
    if (ok) setLangState(v);
    setSaved(ok ? "saved" : "failed");
    clearTimeout(timer.current);
    if (ok) timer.current = setTimeout(() => setSaved(""), 2500);
  };
  const brand = ownBrandName(userId);
  const people = loadPresenters(userId);
  const presenter = leo ? onPresenters(people).find((p) => p.id === people.who) : undefined;
  const skill = defaultSkill(loadSkills(userId));
  const skillSetsCaptions = !!skill && ("style" in skill.look || "captions" in skill.look);

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">Post choices</h1>
      {/* stays in view while the page scrolls, so a pick near the foot still says it saved */}
      <div className="pointer-events-none sticky top-16 z-10 flex h-0 justify-end lg:top-4">
        <p role="status" aria-live="polite" className={cn("h-fit rounded-full border border-border/70 bg-popover px-3 py-1 text-sm font-medium shadow-sm empty:hidden", saved === "failed" ? "text-destructive" : "text-primary")}>
          {saved === "saved" ? "Saved" : saved === "failed" ? "Couldn't save on this device. Free some space and pick again." : ""}
        </p>
      </div>
      <p className="text-sm text-muted-foreground">Picks save as you make them. Posts already made stay as they are.</p>

      <Row id="pc-who" title="Who appears" hint="The AI presenter a new video starts with.">
        <Picks labelledBy="pc-who" value={c.who} onPick={(who) => change({ who })} options={[["anyone", "Anyone"], ["women", "Women only"], ["men", "Men only"]]} />
      </Row>

      <Row id="pc-mention" title="Name your business" hint={brand ? `Whether new posts mention ${brand}. Sometimes is about half of them.` : "Whether new posts mention your business."}>
        {brand ? (
          <Picks labelledBy="pc-mention" value={c.mention} onPick={(mention) => change({ mention })} options={HOW_OFTEN} />
        ) : (
          <Link to={links.brand()} className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline">Add your business name first</Link>
        )}
      </Row>

      {leo && (
        <Row id="pc-influencers" title="Your influencers" hint={presenter ? `How often ${presenter.name} starts picked for a talking video.` : "How often your saved presenter starts picked for a talking video."}>
          {presenter ? (
            <Picks labelledBy="pc-influencers" value={c.influencers} onPick={(influencers) => change({ influencers })} options={HOW_OFTEN} />
          ) : (
            <Link to={links.people({ tab: "presenters" })} className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline">Pick a presenter for this brand first</Link>
          )}
        </Row>
      )}

      <Row id="pc-captions" title="Spoken captions" hint="The captions a new video starts with in the editor.">
        <div role="radiogroup" aria-labelledby="pc-captions" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CAPTION_CHOICES.map((id) => {
            const s = id === "off" ? null : STYLES[id];
            return (
              <button key={id} type="button" role="radio" aria-checked={c.captions === id} onClick={() => change({ captions: id })}
                className={cn(TILE, "flex-col gap-1.5 p-2", c.captions === id ? ON : OFF)}>
                <span className={FRAME} aria-hidden>
                  {s && (
                    <span
                      className={cn("text-sm leading-none", s.box === "pill" && "rounded bg-black/60 px-1.5 py-1")}
                      style={{ color: s.base, fontWeight: s.weight, textTransform: s.uppercase ? "uppercase" : undefined, textShadow: s.stroke ? "0 0 2px #000, 0 1px 2px #000" : undefined }}
                    >
                      Your <span style={{ color: s.active }}>words</span>
                    </span>
                  )}
                </span>
                {id === "off" ? "No captions" : styleLabel(id, leo)}
              </button>
            );
          })}
        </div>
        {skillSetsCaptions && <p className="text-xs text-muted-foreground">Your default editor skill, {skill.name}, sets its own captions and wins over this.</p>}
      </Row>

      <Row id="pc-text" title="Post text style"
        hint={`The words on new slideshows${leo ? " and wall of text videos" : ""}. Ticked styles are mixed; with none ticked, each keeps its own.`}>
        <div role="group" aria-labelledby="pc-text" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {TEXT_STYLE_IDS.map((id) => {
            const t = TEXT_STYLES[id];
            const on = c.textStyles.includes(id);
            return (
              <button key={id} type="button" role="checkbox" aria-checked={on}
                onClick={() => change({ textStyles: on ? c.textStyles.filter((x) => x !== id) : [...c.textStyles, id] })}
                className={cn(TILE, "flex-col gap-1.5 p-2", on ? ON : OFF)}>
                <span className={FRAME} aria-hidden>
                  <span className={cn(
                    "rounded px-2 py-0.5 text-lg leading-none",
                    t.font === "heavy" ? "font-black" : t.font === "serif" ? "font-serif font-semibold" : "font-medium",
                    t.box === "white" ? "bg-white text-black dark:bg-white dark:text-black" : t.box === "bar" ? "bg-black/70 text-white dark:bg-black/70 dark:text-white" : "text-white dark:text-white",
                  )}>Aa</span>
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </Row>

      {leo && (
        <Row id="pc-language" title="Language" hint="Posts are written and checked in English, then a version in this language is made beside each one.">
          {lang ? (
            <Picks labelledBy="pc-language" value={lang} onPick={setLang} options={LANGS} />
          ) : (
            <Link to={links.brand()} className={GO}>Set up your brand kit first</Link>
          )}
        </Row>
      )}

      <Row id="pc-labels" title="Post labels" hint="What a post says about AI and ads. Nothing is added unless you pick it.">
        <ul className="divide-y divide-border/60">
          {POST_LABELS.map((l) => (
            <li key={l.what} className="flex flex-wrap items-center justify-between gap-x-4 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-sm font-medium text-foreground">{l.what}</p>
                <p className="text-xs text-muted-foreground">{l.how}</p>
              </div>
              {"to" in l && <Link to={l.to} className={GO}>{l.go}</Link>}
            </li>
          ))}
        </ul>
      </Row>
    </div>
  );
}

export default function PostChoicesPage() {
  const user = useSignedInUser();
  const leo = useLeoUser();
  // both hooks answer from one session read; waiting for leo too keeps the Influencers row from popping in
  if (!user || leo === undefined) return <div className="min-h-[40vh]" aria-busy="true" />;
  return <Choices userId={user.id} leo={!!leo} />;
}
