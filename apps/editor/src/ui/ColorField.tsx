// Colour editor for Source colour keys ("r g b" or "r g b brightness"): a
// text field with a swatch; the swatch opens a picker with a saturation
// square, a hue bar, a hex field, presets and, for lights, brightness.

import { useRef, useState } from "react";
import { Popover } from "./Popover";
import { formatSourceColor, fromHex, hsvToRgb, kelvinToRgb, parseSourceColor, rgbToHsv, toHex, type Hsv } from "./color";
import { t, lazy } from "../i18n";

interface Props {
  /** The key's text as stored. */
  value: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  /** 255 for color255 keys, 1 for color1. */
  scale: 1 | 255;
  /** Show the brightness control (the fourth number of _light and friends). */
  brightness?: boolean;
  onCommit(value: string): void;
}

/** Typical Source light colours, as a mapper reaches for them. */
const PRESETS: { label: string; rgb: [number, number, number] }[] = lazy(() => [
  { label: t("Белый"), rgb: [255, 255, 255] },
  { label: t("Лампа накаливания"), rgb: kelvinToRgb(2700) },
  { label: t("Тёплый"), rgb: kelvinToRgb(3500) },
  { label: t("Дневной"), rgb: kelvinToRgb(5500) },
  { label: t("Холодный"), rgb: kelvinToRgb(7500) },
  { label: t("Люминесцентный"), rgb: [230, 245, 255] },
  { label: t("Закат"), rgb: [255, 170, 110] },
  { label: t("Натрий"), rgb: [255, 190, 90] },
  { label: t("Красный"), rgb: [255, 60, 40] },
  { label: t("Зелёный"), rgb: [90, 255, 90] },
  { label: t("Синий"), rgb: [70, 110, 255] },
  { label: t("Фиолетовый"), rgb: [190, 90, 255] },
]);

export function ColorField({ value, placeholder, title, disabled, scale, brightness, onCommit }: Props) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const square = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  if (last.current !== value) {
    last.current = value;
    setDraft(value);
  }
  const parsed = parseSourceColor(value || placeholder || "", scale);
  const rgb = parsed?.rgb ?? [255, 255, 255];
  const extra = parsed?.extra ?? (brightness ? 200 : null);
  // The picker keeps its own hue/sat while dragging, so a black or grey colour does not lose the hue.
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(...rgb));
  const hsvKey = useRef(toHex(rgb));
  if (hsvKey.current !== toHex(rgb)) {
    hsvKey.current = toHex(rgb);
    const h = rgbToHsv(...rgb);
    if (Math.abs(h.v - hsv.v) > 1e-6 || Math.abs(h.s - hsv.s) > 1e-6 || (h.s > 1e-6 && Math.abs(h.h - hsv.h) > 1e-6)) setHsv(h);
  }
  const css = `rgb(${rgb.join(", ")})`;

  const commitRgb = (next: [number, number, number], nextExtra = extra) => {
    const text = formatSourceColor({ rgb: next, extra: brightness ? nextExtra : (parsed?.extra ?? null), rest: parsed?.rest ?? [] }, scale);
    setDraft(text);
    if (text !== value) onCommit(text);
  };
  const commitHsv = (h: Hsv) => {
    setHsv(h);
    commitRgb(hsvToRgb(h));
  };
  const dragSquare = (e: React.PointerEvent) => {
    if (disabled) return;
    const el = square.current!;
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const s = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
      const v = 1 - Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
      commitHsv({ h: hsv.h, s, v });
    };
    el.setPointerCapture(e.pointerId);
    move(e.nativeEvent);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  const dragBar = (e: React.PointerEvent) => {
    if (disabled) return;
    const el = bar.current!;
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const h = Math.max(0, Math.min(359.9, ((ev.clientX - r.left) / r.width) * 360));
      commitHsv({ ...hsv, h });
    };
    el.setPointerCapture(e.pointerId);
    move(e.nativeEvent);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  return (
    <div className="with-swatch color-field">
      <input
        className="grow"
        value={draft}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(value);
        }}
      />
      <button
        ref={btn}
        type="button"
        className={`swatch-btn${open ? " open" : ""}`}
        style={{ background: css }}
        disabled={disabled}
        title={brightness ? t("Цвет {0}, яркость {1}: открыть пикер", [css, extra ?? "?"]) : t("Цвет {0}: открыть пикер", [css])}
        onClick={() => setOpen((o) => !o)}
      />
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} width={236} height={brightness ? 330 : 290} className="color-pop">
        <div
          ref={square}
          className="color-square"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h}, 100%, 50%))` }}
          onPointerDown={dragSquare}
        >
          <span className="color-cursor" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: css }} />
        </div>
        <div ref={bar} className="color-hue" onPointerDown={dragBar}>
          <span className="color-cursor" style={{ left: `${(hsv.h / 360) * 100}%`, top: "50%", background: `hsl(${hsv.h}, 100%, 50%)` }} />
        </div>
        <div className="color-row">
          <span className="swatch-big" style={{ background: css }} />
          <input
            className="color-hex"
            value={toHex(rgb)}
            spellCheck={false}
            onChange={(e) => {
              const c = fromHex(e.target.value);
              if (c) commitRgb(c);
            }}
            title={t("Hex-код цвета")}
          />
          <span className="muted small">{rgb.join(" ")}</span>
        </div>
        {brightness && (
          <div className="color-row" title={t("Яркость - четвёртое число ключа: 200 для обычной лампы, 50 для ночника, 1000 и выше для солнца")}>
            <span className="muted small">{t("Яркость")}</span>
            <input type="range" min={0} max={1000} step={10} value={Math.max(0, Math.min(1000, extra ?? 0))} onChange={(e) => commitRgb(rgb, Number(e.target.value))} />
            <input
              type="number"
              className="color-num"
              value={extra ?? 0}
              step={10}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) commitRgb(rgb, n);
              }}
            />
          </div>
        )}
        <div className="color-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="swatch-btn" style={{ background: `rgb(${p.rgb.join(", ")})` }} title={p.label} onClick={() => commitRgb(p.rgb)} />
          ))}
        </div>
      </Popover>
    </div>
  );
}
