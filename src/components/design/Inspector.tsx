// The editor's right panel: the slide (background, caption) with nothing selected, else the selected layer's
// controls, then its layout and the slide's layers. Controls follow Volume's panels.

import { useState, type ReactNode } from "react";
import { Eye, EyeOff, GripVertical, Lock, Plus, Trash2, X } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { Textarea } from "@/components/ui/textarea";
import ImagePicker from "@/components/design/ImagePicker";
import { ColorField, Segmented, field } from "@/components/design/fields";
import {
  BRAND_FONT,
  FONT_NAMES,
  FONTS,
  LOOKS,
  MAX_CAPTION,
  MAX_TEXT,
  plainText,
  type Design,
  type DesignSlide,
  type GradientLayer,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
} from "@/lib/design";

export interface InspectorProps {
  userId: string;
  design: Design;
  slide: DesignSlide;
  layer: Layer | null;
  brandColors: string[];
  brandFont: boolean;
  onSlide: (patch: Partial<DesignSlide>, tag?: string) => void;
  onCaption: (caption: string) => void;
  onLayer: (id: string, patch: Partial<Layer>, tag?: string) => void;
  onSelect: (id: string | null) => void;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  /** "Use on every photo in this slideshow". */
  onLookAll: (look: ImageLayer["look"], strength: number) => void;
}

/** A labelled control; `group` for a row of buttons, which a <label> would name wrongly. */
const Row = ({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) => {
  const inner = (
    <>
      <span>{label}</span>
      <span className="min-w-0 text-foreground">{children}</span>
    </>
  );
  const cls = "grid grid-cols-[5.5rem_1fr] items-center gap-2 text-xs text-muted-foreground";
  return group ? (
    <div role="group" aria-label={label} className={cls}>
      {inner}
    </div>
  ) : (
    <label className={cls}>{inner}</label>
  );
};
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2 border-b border-border px-3 py-3">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </section>
);

function Num({ value, onChange, min, max, step = 1 }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      type="number"
      className={field}
      value={Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = e.target.valueAsNumber;
        if (Number.isFinite(n)) onChange(min !== undefined && max !== undefined ? Math.min(max, Math.max(min, n)) : n);
      }}
    />
  );
}
function Slider({ value, onChange, min, max, step = 1 }: { value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <span className="flex items-center gap-2">
      <input type="range" className="min-w-0 flex-1 accent-primary" value={value} min={min} max={max} step={step} onChange={(e) => onChange(e.target.valueAsNumber)} />
      <span className="w-9 text-right tabular-nums text-muted-foreground">{Math.round(value * 100) / 100}</span>
    </span>
  );
}
function Toggle({ label, on, onChange, children }: { label: string; on: boolean; onChange: (on: boolean) => void; children?: ReactNode }) {
  return (
    <div className="rounded-md border border-border">
      <label className="flex cursor-pointer items-center gap-2 px-2.5 py-2 text-xs">
        <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="accent-primary" />
        {label}
      </label>
      {on && children && <div className="space-y-2 border-t border-border px-2.5 py-2">{children}</div>}
    </div>
  );
}

function TextPanel({ l, set, swatches, brandFont }: { l: TextLayer; set: (p: Partial<TextLayer>, tag?: string) => void; swatches: string[]; brandFont: boolean }) {
  const fonts = brandFont ? [BRAND_FONT, ...FONT_NAMES] : FONT_NAMES;
  const weights = FONTS[l.font]?.weights ?? [400, 700];
  return (
    <Section title="Text">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        Words
        <InfoTip>Put [[ ]] around words to colour them with the accent.</InfoTip>
      </span>
      <Textarea value={l.text} maxLength={MAX_TEXT} rows={3} onChange={(e) => set({ text: e.target.value, name: plainText(e.target.value).split("\n")[0].slice(0, 40) || "Text" }, "text")} />
      <Row label="Font">
        <select className={field} value={l.font} onChange={(e) => set({ font: e.target.value })}>
          {(fonts.includes(l.font) ? fonts : [l.font, ...fonts]).map((f) => (
            <option key={f} value={f}>
              {f === BRAND_FONT ? "Your brand font" : f}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Weight">
        <select className={field} value={weights.includes(l.weight) ? l.weight : weights[0]} onChange={(e) => set({ weight: Number(e.target.value) })}>
          {weights.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </Row>
      <Row label={l.auto_fit ? "Max size" : "Size"}>
        <Num value={l.size} min={8} max={600} onChange={(size) => set({ size }, "size")} />
      </Row>
      <Row label="Colour">
        <ColorField value={l.color} onChange={(color) => set({ color }, "color")} swatches={swatches} />
      </Row>
      <Row label="Align" group>
        <Segmented value={l.align} options={[{ value: "left", label: "Left" }, { value: "center", label: "Center" }, { value: "right", label: "Right" }] as const} onChange={(align) => set({ align })} />
      </Row>
      <Row label="Vertical" group>
        <Segmented value={l.valign} options={[{ value: "top", label: "Top" }, { value: "middle", label: "Middle" }, { value: "bottom", label: "Bottom" }] as const} onChange={(valign) => set({ valign })} />
      </Row>
      <Row label="Direction" group>
        <Segmented value={l.direction} options={[{ value: "auto", label: "Auto" }, { value: "ltr", label: "LTR" }, { value: "rtl", label: "RTL" }] as const} onChange={(direction) => set({ direction })} />
      </Row>
      <Row label="Line height">
        <Num value={l.line_height} min={0.6} max={3} step={0.01} onChange={(line_height) => set({ line_height }, "lh")} />
      </Row>
      <Row label="Spacing">
        <Num value={l.letter_spacing} min={-0.2} max={1} step={0.01} onChange={(letter_spacing) => set({ letter_spacing }, "ls")} />
      </Row>
      <div className="flex flex-wrap gap-3 text-xs">
        {(
          [
            ["auto_fit", "Fit to box"],
            ["caps", "Caps"],
            ["italic", "Italic"],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-primary" checked={l[k]} onChange={(e) => set({ [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
      <Toggle label="Accent colour" on={!!l.accent} onChange={(on) => set({ accent: on ? { color: swatches[0] ?? "#00e676" } : null })}>
        {l.accent && (
          <>
            <Row label="Colour">
              <ColorField value={l.accent.color} onChange={(color) => set({ accent: { ...l.accent!, color } }, "accent")} swatches={swatches} />
            </Row>
            <Row label="Font">
              <select className={field} value={l.accent.font ?? ""} onChange={(e) => set({ accent: { ...l.accent!, font: e.target.value || undefined } })}>
                <option value="">Same as text</option>
                {fonts.map((f) => (
                  <option key={f} value={f}>
                    {f === BRAND_FONT ? "Your brand font" : f}
                  </option>
                ))}
              </select>
            </Row>
          </>
        )}
      </Toggle>
      <Toggle label="Underline" on={!!l.underline} onChange={(on) => set({ underline: on ? { color: l.color } : null })}>
        {l.underline && (
          <Row label="Colour">
            <ColorField value={l.underline.color} onChange={(color) => set({ underline: { color } }, "u")} swatches={swatches} />
          </Row>
        )}
      </Toggle>
      <Toggle label="Strikethrough" on={!!l.strike} onChange={(on) => set({ strike: on ? { color: l.color } : null })}>
        {l.strike && (
          <Row label="Colour">
            <ColorField value={l.strike.color} onChange={(color) => set({ strike: { color } }, "s")} swatches={swatches} />
          </Row>
        )}
      </Toggle>
      <Toggle label="Outline" on={!!l.stroke} onChange={(on) => set({ stroke: on ? { color: "#000000", width: 6 } : null })}>
        {l.stroke && (
          <>
            <Row label="Colour">
              <ColorField value={l.stroke.color} onChange={(color) => set({ stroke: { ...l.stroke!, color } }, "o")} swatches={swatches} />
            </Row>
            <Row label="Width">
              <Slider value={l.stroke.width} min={0} max={40} onChange={(width) => set({ stroke: { ...l.stroke!, width } }, "ow")} />
            </Row>
          </>
        )}
      </Toggle>
      <Toggle label="Shadow" on={!!l.shadow} onChange={(on) => set({ shadow: on ? { color: "#00000099", x: 0, y: 4, blur: 12 } : null })}>
        {l.shadow && (
          <>
            <Row label="Colour">
              <ColorField value={l.shadow.color} onChange={(color) => set({ shadow: { ...l.shadow!, color } }, "sh")} />
            </Row>
            <Row label="Blur">
              <Slider value={l.shadow.blur} min={0} max={80} onChange={(blur) => set({ shadow: { ...l.shadow!, blur } }, "shb")} />
            </Row>
            <Row label="Offset Y">
              <Slider value={l.shadow.y} min={-40} max={40} onChange={(y) => set({ shadow: { ...l.shadow!, y } }, "shy")} />
            </Row>
          </>
        )}
      </Toggle>
      <Toggle label="Highlight" on={!!l.fill} onChange={(on) => set({ fill: on ? { color: "#ffffff", padding: 16, radius: 6 } : null })}>
        {l.fill && (
          <>
            <Row label="Colour">
              <ColorField value={l.fill.color} onChange={(color) => set({ fill: { ...l.fill!, color } }, "f")} swatches={swatches} />
            </Row>
            <Row label="Padding">
              <Slider value={l.fill.padding} min={0} max={80} onChange={(padding) => set({ fill: { ...l.fill!, padding } }, "fp")} />
            </Row>
            <Row label="Radius">
              <Slider value={l.fill.radius} min={0} max={80} onChange={(radius) => set({ fill: { ...l.fill!, radius } }, "fr")} />
            </Row>
          </>
        )}
      </Toggle>
    </Section>
  );
}

function ImagePanel({ userId, l, set, onLookAll, format }: { userId: string; l: ImageLayer; set: (p: Partial<ImageLayer>, tag?: string) => void; onLookAll: InspectorProps["onLookAll"]; format: Design["format"] }) {
  return (
    <>
      <Section title="Image">
        <ImagePicker userId={userId} format={format} onPick={(src) => set({ src })} />
        <Row label="Fit" group>
          <Segmented value={l.fit} options={[{ value: "cover", label: "Cover" }, { value: "contain", label: "Contain" }] as const} onChange={(fit) => set({ fit })} />
        </Row>
        <Row label="Focus X">
          <Slider value={l.focus_x} min={0} max={100} onChange={(focus_x) => set({ focus_x }, "fx")} />
        </Row>
        <Row label="Focus Y">
          <Slider value={l.focus_y} min={0} max={100} onChange={(focus_y) => set({ focus_y }, "fy")} />
        </Row>
        <Row label="Mask" group>
          <Segmented value={l.mask} options={[{ value: "none", label: "None" }, { value: "rounded", label: "Rounded" }, { value: "ellipse", label: "Ellipse" }] as const} onChange={(mask) => set({ mask, ...(mask === "rounded" && !l.radius ? { radius: 28 } : {}) })} />
        </Row>
        {l.mask === "rounded" && (
          <Row label="Radius">
            <Slider value={l.radius} min={0} max={400} onChange={(radius) => set({ radius }, "r")} />
          </Row>
        )}
        <Toggle label="Border" on={!!l.border} onChange={(on) => set({ border: on ? { color: "#ffffff", width: 8 } : null })}>
          {l.border && (
            <>
              <Row label="Colour">
                <ColorField value={l.border.color} onChange={(color) => set({ border: { ...l.border!, color } }, "b")} />
              </Row>
              <Row label="Width">
                <Slider value={l.border.width} min={0} max={60} onChange={(width) => set({ border: { ...l.border!, width } }, "bw")} />
              </Row>
            </>
          )}
        </Toggle>
      </Section>
      <Section title="Filter">
        <div className="grid grid-cols-3 gap-1.5">
          {LOOKS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={l.look === k.value}
              onClick={() => set({ look: k.value })}
              className={`rounded-md border px-1.5 py-1.5 text-xs ${l.look === k.value ? "border-primary text-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {l.look !== "none" && (
          <Row label="Strength">
            <Slider value={l.look_strength} min={0} max={100} onChange={(look_strength) => set({ look_strength }, "ls")} />
          </Row>
        )}
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => onLookAll(l.look, l.look_strength)}>
          Use on every photo in this slideshow
        </button>
      </Section>
    </>
  );
}

function ShapePanel({ l, set, swatches }: { l: ShapeLayer; set: (p: Partial<ShapeLayer>, tag?: string) => void; swatches: string[] }) {
  return (
    <Section title="Shape">
      <Row label="Shape" group>
        <Segmented value={l.shape} options={[{ value: "rect", label: "Rect" }, { value: "ellipse", label: "Ellipse" }, { value: "line", label: "Line" }] as const} onChange={(shape) => set({ shape, ...(shape === "line" ? { h: 6 } : {}) })} />
      </Row>
      <Row label="Colour">
        <ColorField value={l.color} onChange={(color) => set({ color }, "c")} swatches={swatches} />
      </Row>
      {l.shape === "rect" && (
        <Row label="Radius">
          <Slider value={l.radius} min={0} max={400} onChange={(radius) => set({ radius }, "r")} />
        </Row>
      )}
      <Toggle label="Border" on={!!l.border} onChange={(on) => set({ border: on ? { color: "#000000", width: 4 } : null })}>
        {l.border && (
          <>
            <Row label="Colour">
              <ColorField value={l.border.color} onChange={(color) => set({ border: { ...l.border!, color } }, "b")} swatches={swatches} />
            </Row>
            <Row label="Width">
              <Slider value={l.border.width} min={0} max={60} onChange={(width) => set({ border: { ...l.border!, width } }, "bw")} />
            </Row>
          </>
        )}
      </Toggle>
    </Section>
  );
}

function FadePanel({ l, set }: { l: GradientLayer; set: (p: Partial<GradientLayer>, tag?: string) => void }) {
  const stop = (i: number, p: Partial<GradientLayer["stops"][number]>) => set({ stops: l.stops.map((s, j) => (j === i ? { ...s, ...p } : s)) }, `stop${i}`);
  return (
    <Section title="Fade">
      <Row label="Angle">
        <Slider value={l.angle} min={0} max={360} onChange={(angle) => set({ angle }, "a")} />
      </Row>
      {l.stops.map((s, i) => (
        <div key={i} className="space-y-1.5 rounded-md border border-border p-2">
          <span className="flex items-center justify-between">
            <ColorField value={s.color} onChange={(color) => stop(i, { color })} />
            {l.stops.length > 2 && (
              <button type="button" aria-label="Remove stop" onClick={() => set({ stops: l.stops.filter((_, j) => j !== i) })} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
          <Row label="Opacity">
            <Slider value={s.opacity} min={0} max={1} step={0.01} onChange={(opacity) => stop(i, { opacity })} />
          </Row>
          <Row label="Position">
            <Slider value={s.at} min={0} max={100} onChange={(at) => stop(i, { at })} />
          </Row>
        </div>
      ))}
      {l.stops.length < 8 && (
        <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => set({ stops: [...l.stops, { at: 100, color: "#000000", opacity: 1 }] })}>
          <Plus className="h-3.5 w-3.5" /> Add stop
        </button>
      )}
    </Section>
  );
}

function LayoutPanel({ l, set }: { l: Layer; set: (p: Partial<Layer>, tag?: string) => void }) {
  return (
    <Section title="Layout">
      <Row label="Name">
        <input className={field} value={l.name} maxLength={80} onChange={(e) => set({ name: e.target.value }, "name")} />
      </Row>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "w", "h"] as const).map((k) => (
          <label key={k} className="grid grid-cols-[1rem_1fr] items-center gap-1.5 text-xs text-muted-foreground">
            {k.toUpperCase()}
            <Num value={l[k]} onChange={(n) => set({ [k]: k === "w" || k === "h" ? Math.max(1, n) : n }, k)} />
          </label>
        ))}
      </div>
      <Row label="Rotate">
        <Slider value={l.rotation} min={-180} max={180} onChange={(rotation) => set({ rotation }, "rot")} />
      </Row>
      <Row label="Opacity">
        <Slider value={Math.round(l.opacity * 100)} min={0} max={100} onChange={(n) => set({ opacity: n / 100 }, "op")} />
      </Row>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" className="accent-primary" checked={l.locked} onChange={(e) => set({ locked: e.target.checked })} />
        Lock position
      </label>
    </Section>
  );
}

function Layers({ slide, selected, onSelect, onLayer, onRemove, onMove }: Pick<InspectorProps, "slide" | "onSelect" | "onLayer" | "onRemove" | "onMove"> & { selected: string | null }) {
  const [drag, setDrag] = useState<number | null>(null);
  // shown top first, as they stack
  const rows = slide.layers.map((l, i) => ({ l, i })).reverse();
  return (
    <Section title="Layers">
      {!rows.length && <p className="text-xs text-muted-foreground">Add text, an image, a shape or a fade from the toolbar.</p>}
      <ul className="space-y-1">
        {rows.map(({ l, i }) => (
          <li
            key={l.id}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag !== null && drag !== i) onMove(drag, i);
              setDrag(null);
            }}
            className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs ${selected === l.id ? "bg-muted" : "hover:bg-muted/60"}`}
          >
            <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden />
            <button type="button" onClick={() => onSelect(l.id)} className="min-w-0 flex-1 truncate text-left">
              {l.name}
            </button>
            {l.locked && <Lock className="h-3 w-3 text-muted-foreground" aria-label="Locked" />}
            <button type="button" aria-label={l.hidden ? `Show ${l.name}` : `Hide ${l.name}`} onClick={() => onLayer(l.id, { hidden: !l.hidden })} className="p-1 text-muted-foreground hover:text-foreground">
              {l.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <button type="button" aria-label={`Delete ${l.name}`} onClick={() => onRemove(l.id)} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export default function Inspector(p: InspectorProps) {
  const { layer: l, slide } = p;
  const set = (patch: Partial<Layer>, tag?: string) => l && p.onLayer(l.id, patch, tag);
  return (
    <div className="text-sm">
      {!l && (
        <>
          <Section title="Slide">
            <Row label="Background">
              <ColorField value={slide.background} onChange={(background) => p.onSlide({ background }, "bg")} swatches={p.brandColors} />
            </Row>
          </Section>
          <Section title="Caption">
            <Textarea
              value={p.design.caption}
              maxLength={MAX_CAPTION}
              rows={4}
              placeholder="What goes under the post, hashtags included."
              onChange={(e) => p.onCaption(e.target.value)}
            />
          </Section>
        </>
      )}
      {l?.type === "text" && <TextPanel l={l} set={set} swatches={p.brandColors} brandFont={p.brandFont} />}
      {l?.type === "image" && <ImagePanel userId={p.userId} l={l} set={set} onLookAll={p.onLookAll} format={p.design.format} />}
      {l?.type === "shape" && <ShapePanel l={l} set={set} swatches={p.brandColors} />}
      {l?.type === "gradient" && <FadePanel l={l} set={set} />}
      {l && <LayoutPanel l={l} set={set} />}
      <Layers slide={slide} selected={l?.id ?? null} onSelect={p.onSelect} onLayer={p.onLayer} onRemove={p.onRemove} onMove={p.onMove} />
    </div>
  );
}
