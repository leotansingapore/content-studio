import { useEffect, useReducer, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loadPositioning } from "@/lib/positioning";
import { loadVoiceProfile } from "@/lib/voiceProfile";
import { brandOverview, completeness } from "@/lib/brandOverview";
import { loadBrand } from "@/lib/carousel";
import { loadScriptContext } from "@/lib/scriptContext";
import { loadMarket } from "@/lib/market";
import { loadAudiences } from "@/lib/audiences";
import { loadProducts } from "@/lib/products";
import { loadCompetitors } from "@/lib/competitors";
import { demoVideos } from "@/lib/demoVideos";
import { loadMedia } from "@/lib/mediaLibrary";
import { useLeoUser, useSignedInUser } from "@/lib/useLeoOnly";
import { useScrollToHash, useUrlItem } from "@/lib/urlState";
import { activeProfile } from "@/lib/profiles";
import { KIT_FEEDS, cachedKit } from "@/lib/brandKitFeed";
import { NextGap, ProfileGroups } from "@/components/brand/ProfileRows";
import { loadSaved, type SavedItems } from "@/lib/savedItems";
import { adviserBrand } from "@/lib/profession";
import type { ThemeOutlet } from "@/lib/theme";
import { ThemeSwitch } from "@/pages/StudioLayout";
import inspirationData from "@/data/inspiration.json";
import advisorsData from "@/data/advisors.json";
import { TargetIcon, LightbulbIcon, UsersIcon, CheckCircleIcon, BookmarkSimpleIcon } from "@phosphor-icons/react";

type Insp = { id: string; hook: string; topic: string };
type Adv = { id: string; name: string; handle: string };

const INSP = inspirationData as Insp[];
const ADV = advisorsData as Adv[];

function SectionCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof TargetIcon;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 shadow-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Icon className="h-4 w-4 text-primary" /> {title}
        </CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function PlaybookPage() {
  const leo = useLeoUser();
  // the stored session answers on the first frame, so the page never paints an empty brand and then fills in
  const user = useSignedInUser();
  const look = useOutletContext<ThemeOutlet | undefined>();
  const [saved, setSaved] = useState<SavedItems>({
    inspiration: [],
    creators: [],
    topPosts: [],
  });

  useEffect(() => {
    document.title = "Profile - Postmosis";
  }, []);

  // read on each draw: these stores change on other pages, and this page only shows them
  const uid = user?.id ?? null;
  useEffect(() => setSaved(loadSaved(uid)), [uid]);
  const isLeo = !!leo && !!uid;
  // ig-kit: a profile tied to a board brand whose site publishes a kit takes its colours and logo from there (BrandPage)
  const board = uid ? activeProfile(uid)?.boardBrand : undefined;
  // ?edit=<row id>: the row open in place; a save redraws the rows, which read the stores each time
  const [editing, openRow, closeRow] = useUrlItem("edit");
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (editing) document.querySelector(`[data-profile-row="${CSS.escape(editing)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [editing]);
  // /playbook#look lands on that group once the sign-in is known (docs/deep-links.md)
  useScrollToHash(!!uid);
  const groups = brandOverview({
    leo: isLeo,
    kit: loadBrand(uid),
    positioning: loadPositioning(uid),
    voice: loadVoiceProfile(uid),
    ...(isLeo && uid
      ? {
        proof: loadScriptContext(uid).product.proof,
        marketName: loadMarket(uid).name,
        audiences: loadAudiences(uid),
        products: loadProducts(uid).items,
        competitors: loadCompetitors(uid).list,
        demos: demoVideos(uid).length,
        media: loadMedia(uid, { videos: true }).length,
        kitLocked: !!(board && KIT_FEEDS[board] && cachedKit(board)),
      }
      : {}),
  });
  const done = completeness(groups);
  const next = done.missing[0];
  // what the open row's Next offers: the first gap that is not the row being typed in
  const after = done.missing.find((r) => r.id !== editing);
  // while a row is open its own Next sits beside its field, so the one up here would only repeat it
  const rowOpen = groups.some((g) => g.rows.some((r) => r.id === editing && r.edit));
  const savedInsp = saved.inspiration
    .map((id) => INSP.find((e) => e.id === id))
    .filter(Boolean) as Insp[];
  const savedAdv = saved.creators
    .map((id) => ADV.find((a) => a.id === id))
    .filter(Boolean) as Adv[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl">
          Profile
        </h1>
      </header>

      {/* What the AI knows, as Fastlane's Profile: a line on why it matters with how much is on file, then one card of rows
          per group. The basics open in place (ProfileRows.tsx); the rest open their own page. */}
      {uid && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm">
            <span className="flex min-w-0 items-start gap-2.5 text-muted-foreground">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              The AI reads these before it makes anything. Change one here.
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="tabular-nums text-muted-foreground" data-testid="known-count">
                {done.missing.length ? `${done.set} of ${done.total} on file` : (
                  <span className="inline-flex items-center gap-1 font-medium text-success">
                    <CheckCircleIcon className="h-3.5 w-3.5" aria-hidden /> All {done.total} on file
                  </span>
                )}
              </span>
              {next && !rowOpen && <NextGap row={next} onOpen={openRow} />}
            </span>
          </div>
          <ProfileGroups groups={groups} uid={uid} openId={editing} next={after} onOpen={openRow} onClose={closeRow} onSaved={redraw} />
        </>
      )}

      {/* Appearance (Jilian, 12 Nov): the theme switch, as Profile's last group in the same row shape */}
      {look && (
        <section id="appearance" aria-labelledby="appearance-title" className="scroll-mt-20 space-y-2">
          <h2 id="appearance-title" className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Appearance</h2>
          <div className="rounded-xl border border-border/60 bg-card px-4 py-3.5 shadow-card sm:flex sm:items-start sm:gap-4">
            <span className="block text-xs text-muted-foreground sm:w-40 sm:shrink-0 sm:pt-2 sm:text-sm">Theme</span>
            <div className="mt-2 max-w-sm flex-1 space-y-2 sm:mt-0">
              <ThemeSwitch theme={look.theme} onTheme={look.onTheme} />
              <p className="text-xs text-muted-foreground">Light, Dark, or System to follow this device.</p>
            </div>
          </div>
        </section>
      )}

      {/* Saved: Inspiration and Creators are an adviser brand's libraries; another brand sees only what it saved before */}
      {(adviserBrand(user?.id) || savedInsp.length + savedAdv.length > 0) && <div className="grid gap-4 md:grid-cols-2">
        <SectionCard icon={LightbulbIcon} title={`Saved inspiration (${savedInsp.length})`}>
          {savedInsp.length ? (
            <ul className="space-y-2">
              {savedInsp.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/inspiration/${encodeURIComponent(e.id)}`}
                    className="group flex items-start gap-2 text-sm text-foreground hover:text-primary"
                  >
                    <BookmarkSimpleIcon weight="duotone" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="line-clamp-2 leading-snug">{e.hook}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bookmark examples in{" "}
              <Link to="/inspiration" className="font-semibold text-primary hover:underline">
                Inspiration
              </Link>{" "}
              and they'll collect here.
            </p>
          )}
        </SectionCard>

        <SectionCard icon={UsersIcon} title={`Saved creators (${savedAdv.length})`}>
          {savedAdv.length ? (
            <ul className="space-y-2">
              {savedAdv.slice(0, 6).map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/profiles/${encodeURIComponent(a.id)}`}
                    className="group flex items-center gap-2 text-sm text-foreground hover:text-primary"
                  >
                    <BookmarkSimpleIcon weight="duotone" className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="font-medium">{a.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {a.handle}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Bookmark creators in{" "}
              <Link to="/profiles" className="font-semibold text-primary hover:underline">
                Creators
              </Link>{" "}
              to build your follow list.
            </p>
          )}
        </SectionCard>
      </div>}

    </div>
  );
}
