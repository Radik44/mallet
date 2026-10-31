// The interactive tour over "First steps": a spotlight on the button or
// view the newcomer should use next and a card beside it that says what to
// do. Steps tick themselves off from the editor's state (the tool chosen,
// the brush drawn, the texture applied…) and the tour moves on by itself;
// "Дальше" and "Назад" also work, Esc or ✕ ends it.

import { useEffect, useRef, useState } from "react";
import { zoomed } from "../viewport/dpi";
import { t } from "../i18n";

export interface TourStep {
  id: string;
  /** CSS selector of the element to spotlight; null centres the card. */
  target: string | null;
  title: string;
  text: string;
  /** The step's deed is done: the tour moves on after a moment. Absent on steps that only explain. */
  done?: boolean;
  /** Lesson chapter shown above the title. */
  chapter?: string;
  /** The closing card: bigger, centred, with a single «Готово». */
  final?: boolean;
  /** The panel the step is about: the editor opens it when the step shows, so the target is on screen. */
  panel?: string;
}

interface Props {
  steps: TourStep[];
  index: number;
  onIndex(i: number): void;
  onClose(): void;
}

type Rect = { left: number; top: number; width: number; height: number };

/** Where the target is right now, in the zoomed CSS pixels fixed elements use; null when absent or hidden. */
function targetRect(selector: string | null): Rect | null {
  if (!selector) return null;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { left: zoomed(r.left), top: zoomed(r.top), width: zoomed(r.width), height: zoomed(r.height) };
}

const TIP_W = 300;
const TIP_H = 150;
const PAD = 6;

export function Tour({ steps, index, onIndex, onClose }: Props) {
  const step = steps[Math.max(0, Math.min(steps.length - 1, index))];
  const [rect, setRect] = useState<Rect | null>(() => targetRect(step?.target ?? null));
  const last = useRef<string>("");

  // The target moves with the layout (panels resize, zones collapse): follow it five times a second.
  useEffect(() => {
    const tick = () => {
      const r = targetRect(step?.target ?? null);
      const key = r ? `${r.left},${r.top},${r.width},${r.height}` : "none";
      if (key !== last.current) {
        last.current = key;
        setRect(r);
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    window.addEventListener("resize", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", tick);
    };
  }, [step?.target, index]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);

  if (!step) return null;
  const vw = zoomed(window.innerWidth);
  const vh = zoomed(window.innerHeight);
  // The card sits to the right of the target, else to the left, else under or over it; without one it
  // keeps to the bottom-right corner, clear of the start card, the wizards and the first-steps list.
  let tip: { left: number; top: number };
  if (rect) {
    const right = rect.left + rect.width + 12;
    const leftSide = rect.left - TIP_W - 12;
    if (right + TIP_W < vw) tip = { left: right, top: rect.top };
    else if (leftSide > 0) tip = { left: leftSide, top: rect.top };
    else if (rect.top + rect.height + 12 + TIP_H < vh) tip = { left: rect.left, top: rect.top + rect.height + 12 };
    else tip = { left: rect.left, top: rect.top - TIP_H - 12 };
    tip.left = Math.max(8, Math.min(tip.left, vw - TIP_W - 8));
    tip.top = Math.max(8, Math.min(tip.top, vh - TIP_H - 8));
  } else tip = { left: Math.max(8, vw - TIP_W - 16), top: Math.max(8, vh - TIP_H - 44) };
  const lastStep = index >= steps.length - 1;
  const explains = step.done === undefined;
  return (
    <div className="tour-layer" data-tour-step={step.id}>
      {rect && <div className={`tour-spot${step.done ? " done" : ""}`} style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />}
      <div className={`tour-tip${step.final ? " final" : ""}`} style={{ left: tip.left, top: tip.top, width: TIP_W }} onMouseDown={(e) => e.stopPropagation()}>
        <div className="tour-tip-head">
          <span className="muted small">
            {step.chapter ? `${step.chapter} · ` : ""}
            {index + 1} {t("из")} {steps.length}
          </span>
          <span className="grow" />
          {step.done && <span className="tour-done">{t("✓ выполнено")}</span>}
          <button className="link" onClick={onClose} title={t("Завершить тур (Esc)")}>
            ✕
          </button>
        </div>
        <strong>{step.title}</strong>
        <div className="tour-text">{step.text}</div>
        {!rect && step.target && <div className="muted small">{t("Элемент сейчас не виден: разверните панель или откройте нужную вкладку.")}</div>}
        <div className="tour-buttons">
          <button disabled={index === 0} onClick={() => onIndex(index - 1)}>
            {t("Назад")}
          </button>
          <span className="grow" />
          {lastStep ? (
            <button className="primary" onClick={onClose}>
              {t("Готово")}
            </button>
          ) : (
            <button className={step.done || explains ? "primary" : ""} onClick={() => onIndex(index + 1)} title={step.done || explains ? "" : t("Пропустить шаг и перейти к следующему")}>
              {step.done || explains ? t("Далее") : t("Пропустить")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
