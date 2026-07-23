import { useMemo, useState } from "react";

// Single-series line + area trend chart (engagement rate over recent tracked
// posts). One series needs no legend box — the card title already names
// what's plotted. Hover/focus shows a crosshair + tooltip; the same value is
// always readable from the endpoint label and the row list below the chart,
// so the tooltip enhances rather than gates.

export interface TrendChartPoint {
  id: string;
  label: string;
  value: number; // engagement rate %
  detail: string; // secondary tooltip line, e.g. "LinkedIn · 1,204 impressions"
}

const WIDTH = 600;
const HEIGHT = 180;
const PAD = { top: 16, right: 8, bottom: 24, left: 30 };

function niceMax(dataMax: number): number {
  const target = Math.max(dataMax * 1.2, 5);
  const step = target <= 10 ? 2 : target <= 50 ? 5 : target <= 100 ? 10 : 20;
  return Math.ceil(target / step) * step;
}

export function TrendChart({ points }: { points: TrendChartPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const { linePath, areaPath, coords, yMax, ticks } = useMemo(() => {
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const dataMax = Math.max(...points.map((p) => p.value), 0);
    const yMax = niceMax(dataMax);
    const xFor = (i: number) =>
      points.length > 1
        ? PAD.left + (i / (points.length - 1)) * innerW
        : PAD.left + innerW / 2;
    const yFor = (v: number) => PAD.top + innerH * (1 - v / yMax);
    const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }));
    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
    const baseline = PAD.top + innerH;
    const areaPath =
      coords.length > 0
        ? `M ${coords[0].x.toFixed(1)} ${baseline} ` +
          coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ") +
          ` L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} Z`
        : "";
    const ticks = [0, yMax / 2, yMax];
    return { linePath, areaPath, coords, yMax, ticks };
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No dated, tracked posts yet — mark posts as posted with impressions
        entered to see a trend line.
      </p>
    );
  }

  const active = hover !== null ? points[hover] : null;
  const activeCoord = hover !== null ? coords[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ height: HEIGHT }}
        role="img"
        aria-label="Engagement rate trend across recent tracked posts"
      >
        {ticks.map((t, i) => {
          const y = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - t / yMax);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {Math.round(t)}%
              </text>
            </g>
          );
        })}

        {activeCoord && (
          <line
            x1={activeCoord.x}
            x2={activeCoord.x}
            y1={PAD.top}
            y2={HEIGHT - PAD.bottom}
            stroke="hsl(var(--muted-foreground))"
            strokeOpacity={0.35}
            strokeWidth={1}
          />
        )}

        <path d={areaPath} fill="hsl(var(--primary))" fillOpacity={0.1} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {coords.map((c, i) => {
          const isLast = i === coords.length - 1;
          const isHover = hover === i;
          return (
            <circle
              key={points[i].id}
              cx={c.x}
              cy={c.y}
              r={isHover ? 5 : isLast ? 4 : 3}
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth={2}
            />
          );
        })}

        {/* Endpoint direct label. */}
        {coords.length > 0 && (
          <text
            x={coords[coords.length - 1].x}
            y={coords[coords.length - 1].y - 10}
            textAnchor="end"
            className="fill-foreground text-[10px] font-semibold"
          >
            {points[points.length - 1].value}%
          </text>
        )}

        {/* Invisible hit targets, generous width, keyboard-focusable. */}
        {coords.map((c, i) => (
          <rect
            key={`hit-${points[i].id}`}
            x={c.x - (coords.length > 1 ? WIDTH / coords.length / 2 : WIDTH / 2)}
            y={PAD.top}
            width={coords.length > 1 ? WIDTH / coords.length : WIDTH}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="transparent"
            tabIndex={0}
            role="button"
            aria-label={`${points[i].label}: ${points[i].value}% engagement rate, ${points[i].detail}`}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onPointerLeave={() => setHover((h) => (h === i ? null : h))}
            onBlur={() => setHover((h) => (h === i ? null : h))}
            className="cursor-pointer outline-none"
          />
        ))}
      </svg>

      {active && activeCoord && (
        <div
          className="pointer-events-none absolute z-10 -translate-y-full rounded-lg border border-border/70 bg-popover px-2.5 py-1.5 text-xs shadow-elegant"
          style={{
            left: `${(activeCoord.x / WIDTH) * 100}%`,
            top: `${(activeCoord.y / HEIGHT) * 100}%`,
            transform: `translate(${
              activeCoord.x / WIDTH > 0.85 ? "-95%" : activeCoord.x / WIDTH < 0.15 ? "-5%" : "-50%"
            }, calc(-100% - 8px))`,
          }}
        >
          <div className="font-semibold text-popover-foreground">
            {active.value}% engagement
          </div>
          <div className="text-muted-foreground">{active.label} · {active.detail}</div>
        </div>
      )}
    </div>
  );
}
