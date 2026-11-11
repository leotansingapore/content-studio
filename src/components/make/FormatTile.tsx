// A video format card's picture when it has no preview clip (/make): a three-frame storyboard drawn here, free, so a
// page of formats is not a wall of the same icon. The frames show what the format puts on screen (a person, two
// people, words, slides, a picture, footage, a character) and an animated story's frames wear its look's sample
// colours. Everything else is drawn in theme tokens, so it reads in light and dark.

import type { FormatDef } from "@/data/formats";

export type TileMotif = "person" | "duo" | "words" | "slides" | "page" | "picture" | "footage" | "character";

/** Sample colours for each narrated look: backdrop, figure, accent. Illustration only, the same in both themes. */
export const LOOK_COLOURS: Record<string, [string, string, string]> = {
  clay: ["#E8B28A", "#C4673F", "#7A3E22"],
  paper: ["#F2E3C6", "#E0563B", "#2F6F8F"],
  felt: ["#DCE8D2", "#8FB38A", "#D98BA0"],
  chalk: ["#23493A", "#F4F1E6", "#F2C84B"],
  comic: ["#FFD23F", "#E63946", "#1D3557"],
  cartoon3d: ["#BEE7F8", "#FA7921", "#3A86C8"],
  storybook: ["#E3EEF0", "#E9B38C", "#7FA6A0"],
  bricks: ["#F7D117", "#E3262E", "#1F6FD0"],
  dolls: ["#FDE2EC", "#F28DB2", "#C2447A"],
  skeleton: ["#1F2430", "#F3F0E6", "#6FD3C7"],
  anime: ["#BFE3F5", "#5E9B6B", "#F0C36B"],
  metaphor: ["#2B2D5B", "#70C1B3", "#F25F5C"],
  object: ["#F7EDE2", "#F6BD60", "#84A59D"],
  animal: ["#F1E3D0", "#C8A27A", "#6B8E5A"],
  puppet: ["#E9D8B8", "#8B5E3C", "#B23A48"],
  host: ["#E0FBFC", "#3D5A80", "#EE6C4D"],
};

const DUO = /podcast|car-|three-levels|street-interview|reaction|hook-demo|green-screen/;

/** What a format's frames show, and its look's colours when it is an animated story. */
export function tileOf(f: Pick<FormatDef, "slug" | "kind" | "section">): { motif: TileMotif; colours?: [string, string, string] } {
  const look = f.slug.startsWith("look-") ? LOOK_COLOURS[f.slug.slice(5)] : undefined;
  if (f.section === "animated") return { motif: "character", colours: look };
  if (f.kind === "slides") return { motif: "slides" };
  if (f.kind === "text") return { motif: "page" };
  if (f.kind === "image") return { motif: "picture" };
  if (DUO.test(f.slug)) return { motif: "duo" };
  if (f.section === "person") return { motif: "person" };
  if (f.section === "words") return { motif: "words" };
  return { motif: "footage" };
}

// one frame is 24 wide and 42 tall; (x, 0) is its top left
function Motif({ motif, x, n, fig, accent }: { motif: TileMotif; x: number; n: number; fig: string; accent: string }) {
  const cx = x + 12;
  const person = (px: number, r = 4) => (
    <>
      <circle cx={px} cy={17} r={r} fill={fig} />
      <path d={`M${px - r * 1.9} 34 a${r * 1.9} ${r * 2.2} 0 0 1 ${r * 3.8} 0 z`} fill={fig} />
    </>
  );
  const caption = <rect x={x + 4} y={36} width={n === 1 ? 12 : 16} height={2.4} rx={1.2} fill={accent} />;
  switch (motif) {
    case "person":
      return <>{person(cx)}{caption}</>;
    case "duo":
      return <>{person(cx - 5, 3)}{person(cx + 5, 3)}{caption}</>;
    case "character":
      return (
        <>
          <rect x={cx - 6} y={14 + n} width={12} height={14} rx={4} fill={fig} />
          <circle cx={cx - 2.5} cy={19 + n} r={1.1} fill={accent} />
          <circle cx={cx + 2.5} cy={19 + n} r={1.1} fill={accent} />
          <rect x={x} y={32} width={24} height={10} fill={accent} opacity={0.35} />
        </>
      );
    case "words":
      return <>{[12, 17, 22, 27].slice(0, 4 - n).map((y, i) => <rect key={y} x={x + 4} y={y + n * 3} width={i % 2 ? 12 : 16} height={2.6} rx={1.3} fill={i === 0 ? accent : fig} />)}</>;
    case "slides":
      return (
        <>
          <rect x={x + 4} y={9} width={16} height={14} rx={2} fill={fig} opacity={0.45} />
          <rect x={x + 4} y={27} width={n === 2 ? 10 : 16} height={2.6} rx={1.3} fill={accent} />
          <rect x={x + 4} y={32} width={12} height={2.6} rx={1.3} fill={fig} />
        </>
      );
    case "page":
      return <>{[10, 15, 20, 25, 30].map((y, i) => <rect key={y} x={x + 4} y={y} width={i === 4 ? 9 : 16} height={2.2} rx={1.1} fill={i === 0 ? accent : fig} opacity={i === 0 ? 1 : 0.7} />)}</>;
    case "picture":
      return (
        <>
          <circle cx={x + 17} cy={13} r={2.5} fill={accent} />
          <path d={`M${x + 2} 30 l7 -10 5 6 3 -4 5 8 z`} fill={fig} opacity={0.7} />
          {caption}
        </>
      );
    default:
      return <path d={`M${cx - 4} 15 l9 6 -9 6 z`} fill={n === 1 ? accent : fig} />;
  }
}

export default function FormatTile({ f }: { f: Pick<FormatDef, "slug" | "kind" | "section"> }) {
  const { motif, colours } = tileOf(f);
  const [back, fig, accent] = colours ?? ["hsl(var(--background))", "hsl(var(--muted-foreground))", "hsl(var(--primary))"];
  return (
    <svg viewBox="26 19 108 52" className="h-full w-full" aria-hidden data-motif={motif}>
      {[0, 1, 2].map((n) => {
        const x = 34 + n * 34;
        return (
          <g key={n} transform="translate(0 24)">
            <clipPath id={`tile-${f.slug}-${n}`}>
              <rect x={x} y={0} width={24} height={42} rx={4} />
            </clipPath>
            <rect x={x} y={0} width={24} height={42} rx={4} fill={back} stroke="hsl(var(--border))" strokeWidth={0.75} />
            <g clipPath={`url(#tile-${f.slug}-${n})`} opacity={colours ? 1 : 0.8}>
              <Motif motif={motif} x={x} n={n} fig={fig} accent={accent} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}
