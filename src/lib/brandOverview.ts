// What the AI knows about the open brand, in one list (/playbook): Fastlane's Brand > Profile groups (identity,
// offer, personas, proof, look, tone and voice) plus what the brand keeps on file. Each row reads a store another
// page owns. A row with `edit` opens in place on Profile and saves to that same store (ProfileRows.tsx); the others
// link to the page that edits them. Nothing is saved here. Rows from Leo-only pages (website, products, audiences,
// proof, competitors, demo videos, Media types) appear only when `leo` is set.

import type { Audience } from "@/lib/audiences";
import { DEFAULT_BRAND, type CarouselBrand } from "@/lib/carousel";
import type { Positioning } from "@/lib/positioning";
import type { Product } from "@/lib/products";
import type { VoiceProfile } from "@/lib/voiceProfile";

/** The rows Profile edits in place, each against the store its page saves to. */
export type ProfileEdit = "name" | "does" | "price" | "edge" | "who" | "topics" | "proof" | "logo" | "colours" | "avoid" | "signoff";

export interface OverviewRow {
  id: string;
  label: string;
  /** What is on file, "" when nothing is. */
  value: string;
  /** Shown as chips instead of `value` when there are any. */
  chips?: string[];
  /** Colour swatches (hex), for the colours row. */
  swatches?: string[];
  /** Where it is edited. */
  to: string;
  /** The link's words when the row is empty. */
  add: string;
  /** A count of things kept (products, competitors): shown, never counted as a gap when 0 is fine. */
  optional?: boolean;
  /** Edited in place on Profile; without it the row links to `to`. */
  edit?: ProfileEdit;
  /** A picture that stands for the value (the logo). */
  image?: string;
  /** Shown in place of "Not set" when nothing is on file but something sensible is used meanwhile. */
  note?: string;
}

export interface OverviewGroup {
  id: string;
  title: string;
  rows: OverviewRow[];
}

export interface OverviewInput {
  leo: boolean;
  kit: CarouselBrand | null;
  positioning: Positioning | null;
  voice: VoiceProfile | null;
  /** The script desk's product proof line (Leo only). */
  proof?: string;
  marketName?: string;
  audiences?: Audience[];
  products?: Product[];
  competitors?: { name: string }[];
  demos?: number;
  media?: number;
  /** The brand's colours and logo come from its site's kit: they are read here, never edited. */
  kitLocked?: boolean;
}

const STAGE: Record<string, string> = {
  "young-adult": "Young adults",
  "working-adult": "Working adults",
  parent: "Parents",
  "pre-retiree": "Pre-retirees",
};

const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const count = (n: number, one: string, many = `${one}s`) => (n ? `${n} ${n === 1 ? one : many}` : "");
export const isSet = (r: OverviewRow) => !!r.value || !!r.chips?.length || !!r.swatches?.length;

export function brandOverview(i: OverviewInput): OverviewGroup[] {
  const kit = i.kit;
  const pos = i.positioning;
  const products = (i.products ?? []).filter((p) => p.use);
  const offers = (kit?.offers ?? []).map((o) => t(o.name)).filter(Boolean);
  const audiences = (i.audiences ?? []).filter((a) => !a.offAt);
  const who = [STAGE[pos?.audience ?? ""], t(pos?.audienceDetail)].filter(Boolean);
  const posts = (i.voice?.posts ?? []).filter((p) => t(p)).length;
  const main = products[0];
  // the kit saves whole, so typing a name stores the default navy too: a colour counts once one is picked
  const picked = !!kit && (kit.color !== DEFAULT_BRAND.color || !!kit.palette?.length);

  const groups: OverviewGroup[] = [
    {
      id: "identity",
      title: "Identity",
      rows: [
        { id: "name", label: "Name", value: t(kit?.name) || t(i.marketName), to: "/brand#you", add: "Add your name", edit: "name" },
        { id: "does", label: "What you do", value: t(pos?.oneLiner) || t(kit?.profession) || t(kit?.role), to: pos?.oneLiner ? "/plan" : "/brand#you", add: "Say what you do", edit: "does" },
        ...(i.leo ? [{ id: "website", label: "Website", value: t(kit?.website).replace(/^https?:\/\//, ""), to: "/brand#website", add: "Add your website" }] : []),
      ],
    },
    {
      id: "offer",
      title: "Offer",
      rows: [
        i.leo
          ? { id: "sells", label: "What you sell", value: "", chips: products.length ? products.map((p) => p.name) : offers, to: "/brand/products", add: "Add what you sell" }
          : { id: "sells", label: "What you sell", value: "", chips: offers, to: "/brand#offers", add: "Add an offer" },
        ...(i.leo ? [{ id: "price", label: "Price point", value: t(main?.price), to: main ? `/brand/products?product=${main.id}` : "/brand/products", add: "Add a price", ...(main ? { edit: "price" as const } : {}) }] : []),
        { id: "edge", label: "Why they choose you", value: t(pos?.edge), to: "/plan", add: "Say why you", edit: "edge" },
      ],
    },
    {
      id: "personas",
      title: "Personas",
      rows: [
        i.leo
          ? { id: "who", label: "Who buys", value: "", chips: audiences.length ? audiences.map((a) => a.name) : who, to: "/audiences", add: "Add an audience" }
          : { id: "who", label: "Who buys", value: "", chips: who, to: "/plan", add: "Say who you serve", edit: "who" },
        { id: "topics", label: "Topics", value: "", chips: pos?.topics ?? [], to: "/plan", add: "Add your topics", edit: "topics" },
      ],
    },
    ...(i.leo
      ? [{
        id: "proof",
        title: "Proof",
        rows: [{ id: "proof", label: "Real words and numbers", value: t(i.proof), to: "/brand/products#script-product", add: "Add proof", edit: "proof" as const }],
      }]
      : []),
    {
      id: "look",
      title: "Look",
      rows: [
        { id: "logo", label: "Logo", value: kit?.logo ? "On file" : "", to: "/brand#logo", add: "Add a logo", ...(kit?.logo ? { image: kit.logo } : {}), ...(i.kitLocked ? {} : { edit: "logo" as const }) },
        // navy is our default, not something the brand told us: shown as the default and neither known nor a gap, so a
        // brand that wants navy is never chased for it (shortcut: the kit cannot tell navy picked from navy untouched)
        { id: "colours", label: "Colours", value: "", swatches: picked && kit ? [kit.color, ...(kit.palette ?? []).map((c) => c.hex)] : [], to: "/brand#colour", add: "Pick a colour",
          ...(picked ? {} : { optional: true, note: "Navy, the default" }), ...(i.kitLocked ? {} : { edit: "colours" as const }) },
      ],
    },
    {
      id: "tone",
      title: "Tone and voice",
      rows: [
        { id: "voice", label: "How you sound", value: t(i.voice?.voiceSummary) || count(posts, "past post"), to: "/voice", add: "Paste past posts" },
        { id: "avoid", label: "Words you never use", value: t(kit?.avoidWords).replace(/\s*\n+\s*/g, ", "), to: "/brand#avoid-words", add: "Add words to avoid", optional: true, edit: "avoid" },
        { id: "signoff", label: "Sign-off", value: t(kit?.signOff), to: "/brand#sign-off", add: "Add a sign-off", optional: true, edit: "signoff" },
      ],
    },
  ];
  if (i.leo) {
    const names = (i.competitors ?? []).map((c) => c.name);
    groups.push({
      id: "on-file",
      title: "On file",
      rows: [
        { id: "competitors", label: "Competitors", value: "", chips: names, to: "/competitors?view=list", add: "Add a competitor" },
        { id: "demos", label: "Demo videos", value: count(i.demos ?? 0, "video"), to: "/brand/demo-videos", add: "Upload a demo", optional: true },
        { id: "media", label: "Photos and videos", value: count(i.media ?? 0, "file"), to: "/media", add: "Add photos" },
      ],
    });
  }
  return groups;
}

/** How much is on file: optional rows count only once set, so nobody is told an empty sign-off is a gap. */
export function completeness(groups: OverviewGroup[]): { set: number; total: number; missing: OverviewRow[] } {
  const rows = groups.flatMap((g) => g.rows).filter((r) => !r.optional || isSet(r));
  const missing = rows.filter((r) => !isSet(r));
  return { set: rows.length - missing.length, total: rows.length, missing };
}
