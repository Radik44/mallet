// Angle editor for "pitch yaw roll" keys: the text field plus a button with
// an arrow turned to the yaw; the button opens a dial to drag the yaw (15°
// steps unless Shift is held), a pitch slider, a roll field and Hammer's
// shortcuts "вверх" and "вниз" (pitch -90 / 90).

import { useRef, useState } from "react";
import { Popover } from "./Popover";
import { t } from "../i18n";

interface Props {
  value: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  onCommit(value: string): void;
}

export function parseAngles(value: string): [number, number, number] {
  const p = value.trim().split(/\s+/).map(Number);
  return [p[0], p[1], p[2]].map((n) => (Number.isFinite(n) ? n : 0)) as [number, number, number];
}

const norm = (deg: number) => (((Math.round(deg * 100) / 100) % 360) + 360) % 360;

export function AngleField({ value, placeholder, title, disabled, onCommit }: Props) {
  const [draft, setDraft] = useState(value);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const dial = useRef<HTMLDivElement>(null);
  const last = useRef(value);
  if (last.current !== value) {
    last.current = value;
    setDraft(value);
  }
  const [pitch, yaw, roll] = parseAngles(value || placeholder || "0 0 0");
  const commit = (p: number, y: number, r: number) => {
    const text = [p, y, r].map((n) => String(Math.round(n * 100) / 100)).join(" ");
    setDraft(text);
    if (text !== value) onCommit(text);
  };
  const dragDial = (e: React.PointerEvent) => {
    if (disabled) return;
    const el = dial.current!;
    const move = (ev: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const dx = ev.clientX - (r.left + r.width / 2);
      const dy = r.top + r.height / 2 - ev.clientY;
      // Yaw counts from +X counter-clockwise, as in Source; the dial shows +X to the right.
      let a = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (!ev.shiftKey) a = Math.round(a / 15) * 15;
      commit(pitch, norm(a), roll);
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
  const compass: [string, number][] = [
    [t("В"), 0],
    [t("С"), 90],
    [t("З"), 180],
    [t("Ю"), 270],
  ];
  return (
    <div className="with-swatch angle-field">
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
        className={`angle-btn${open ? " open" : ""}`}
        disabled={disabled}
        title={t("Рыскание {0}°, тангаж {1}°: открыть пикер углов", [norm(yaw), pitch])}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="angle-arrow" style={{ transform: `rotate(${-norm(yaw)}deg)` }}>
          ➜
        </span>
      </button>
      <Popover anchor={btn.current} open={open} onClose={() => setOpen(false)} width={220} height={250} className="angle-pop">
        <div className="angle-body">
          <div ref={dial} className="angle-dial" onPointerDown={dragDial} title={t("Перетащите, чтобы задать рыскание (yaw) с шагом 15°; с Shift - плавно. 0° - вдоль +X, 90° - вдоль +Y")}>
            {compass.map(([l, a]) => (
              <span key={l} className="angle-mark" style={{ transform: `rotate(${-a}deg) translate(44px) rotate(${a}deg)` }}>
                {l}
              </span>
            ))}
            <span className="angle-needle" style={{ transform: `rotate(${-norm(yaw)}deg)` }} />
            <span className="angle-val">{Math.round(norm(yaw))}°</span>
          </div>
          <div className="angle-side">
            <label title={t("Тангаж (pitch): отрицательные значения - вверх, положительные - вниз, как в Source")}>
              <span className="muted small">
                {t("Тангаж")} {Math.round(pitch)}°
              </span>
              <input type="range" min={-90} max={90} step={5} value={Math.max(-90, Math.min(90, pitch))} onChange={(e) => commit(Number(e.target.value), yaw, roll)} />
            </label>
            <div className="angle-row">
              <button type="button" onClick={() => commit(-90, yaw, roll)} title={t("Смотреть вверх: pitch -90 (Hammer: Up)")}>
                {t("Вверх")}
              </button>
              <button type="button" onClick={() => commit(90, yaw, roll)} title={t("Смотреть вниз: pitch 90 (Hammer: Down)")}>
                {t("Вниз")}
              </button>
              <button type="button" onClick={() => commit(0, yaw, roll)} title={t("Горизонтально")}>
                0°
              </button>
            </div>
            <label title={t("Крен (roll) в градусах")}>
              <span className="muted small">{t("Крен")}</span>
              <input type="number" step={15} value={roll} onChange={(e) => commit(pitch, yaw, Number(e.target.value) || 0)} />
            </label>
          </div>
        </div>
      </Popover>
    </div>
  );
}
