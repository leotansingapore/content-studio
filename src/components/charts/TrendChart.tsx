import { useMemo, useState } from "react";

// Single-series line + area trend chart (engagement rate over recent tracked
// posts). One series needs no legend box — the card title already names
// what's plotted. Hover/focus shows a crosshair + tooltip; the same value is
// always readable from the endpoint label and the row list below the chart,
// so the tooltip enhances rather than gates.

export interface TrendChartPoint {
  id: string;
  label: string;
  value: number; // engagement rate % by default
  detail: string; // secondary tooltip line, e.g. "LinkedIn · 1,204 impressions"
}

const PAD = { top: 16, right: 8, bottom: 24, left: 30 };

function niceMax(dataMax: number): number {
  const target = Math.max(dataMax * 1.2, 5);
  const step = target <= 10 ? 2 : target <= 50 ? 5 : target <= 100 ? 10 : 20;
  return Math.ceil(target / step) * step;
}

/** A y range two round steps (1, 2 or 5 x 10^n) wide around lo..hi, for counts like followers where zero would flatten the line. */
export function fitDomain(lo: number, hi: number): [number, number] {
  if (lo === hi) [lo, hi] = [lo - 1, hi + 1];
  for (let mag = 1; ; mag *= 10) {
    for (const s of [1, 2, 5]) {
      const step = s * mag;
      const y0 = Math.floor(lo / step) * step;
      if (y0 + 2 * step >= hi) return [y0, y0 + 2 * step];
    }
  }
}

const percent = (v: number) => `${v}%`;

export function TrendChart({
  points,
  format = percent,
  measure = "engagement rate",
  title = "Engagement rate trend across recent tracked posts",
  fit = false,
  width: WIDTH = 600,
  height: HEIGHT = 180,
}: {
  points: TrendChartPoint[];
  format?: (value: number) => string;
  /** What a value is, after the number: "12% engagement rate", "1,204 followers". */
  measure?: string;
  title?: string;
  /** Fit the y axis to the data (a line, no area) instead of starting at zero. */
  fit?: boolean;
  width?: number;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  const { linePath, areaPath, coords, yMin, yMax, ticks, left } = useMemo(() => {
    const values = points.map((p) => p.value);
    const [yMin, yMax] = fit && values.length ? fitDomain(Math.min(...values), Math.max(...values)) : [0, niceMax(Math.max(...values, 0))];
    const ticks = [yMin, (yMin + yMax) / 2, yMax];
    // Room for the longest tick label ("10,250" needs more than "20%"), about 5.5px a character at 9px.
    const left = Math.max(PAD.left, 8 + 5.5 * Math.max(...ticks.map((t) => format(Math.round(t)).length)));
    const innerW = WIDTH - left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const xFor = (i: number) =>
      points.length > 1
        ? left + (i / (points.length - 1)) * innerW
        : left + innerW / 2;
    const yFor = (v: number) => PAD.top + innerH * (1 - (v - yMin) / (yMax - yMin));
    const coords = points.map((p, i) => ({ x: xFor(i), y: yFor(p.value) }));
    const linePath = coords
      .map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(" ");
    const baseline = PAD.top + innerH;
    const areaPath =
      coords.length > 0 && !fit
        ? `M ${coords[0].x.toFixed(1)} ${baseline} ` +
          coords.map((c) => `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ") +
          ` L ${coords[coords.length - 1].x.toFixed(1)} ${baseline} Z`
        : "";
    return { linePath, areaPath, coords, yMin, yMax, ticks, left };
  }, [points, fit, format, WIDTH, HEIGHT]);

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
        aria-label={title}
      >
        {ticks.map((t, i) => {
          const y = PAD.top + (HEIGHT - PAD.top - PAD.bottom) * (1 - (t - yMin) / (yMax - yMin));
          return (
            <g key={i}>
              <line
                x1={left}
                x2={WIDTH - PAD.right}
                y1={y}
                y2={y}
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
              <text
                x={left - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {format(Math.round(t))}
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
            {format(points[points.length - 1].value)}
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
            aria-label={`${points[i].label}: ${format(points[i].value)} ${measure}, ${points[i].detail}`}
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
          className="pointer-events-none absolute z-10 w-max max-w-[15rem] -translate-y-full rounded-lg border border-border/70 bg-popover px-2.5 py-1.5 text-xs shadow-elegant"
          style={{
            left: `${(activeCoord.x / WIDTH) * 100}%`,
            top: `${(activeCoord.y / HEIGHT) * 100}%`,
            transform: `translate(${
              activeCoord.x / WIDTH > 0.85 ? "-95%" : activeCoord.x / WIDTH < 0.15 ? "-5%" : "-50%"
            }, calc(-100% - 8px))`,
          }}
        >
          <div className="font-semibold text-popover-foreground">
            {format(active.value)} {measure}
          </div>
          <div className="text-muted-foreground">{active.label} · {active.detail}</div>
        </div>
      )}
    </div>
  );
}
