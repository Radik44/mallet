// Name labels over the 3D view (Unreal's actor labels), switched in the View
// menu. A small pool of absolutely placed tags follows the camera every
// frame without React re-rendering.

import { useEffect, useRef, useState } from "react";
import type { FlyCamera } from "../viewport/camera";
import { pickLabels, projectToCss } from "../viewport/labels";

type Vec3 = [number, number, number];

export const LABELS_KEY = "gme.labels";

/** Whether the labels are on (kept in localStorage). */
export function readLabelsOn(): boolean {
  try {
    return localStorage.getItem(LABELS_KEY) === "1";
  } catch {
    return false;
  }
}

export function EntityLabels({ camera, canvas, entities }: { camera: () => FlyCamera | null; canvas: () => HTMLCanvasElement | null; entities: () => { id: number; targetname: string | null; origin: Vec3 | null }[] }) {
  const [on, setOn] = useState(readLabelsOn);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const flip = () => setOn(readLabelsOn());
    window.addEventListener("gme-labels", flip);
    return () => window.removeEventListener("gme-labels", flip);
  }, []);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cam = camera();
      const cv = canvas();
      const el = box.current;
      if (!cam || !cv || !el) return;
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const list = entities();
      const p = cam.position;
      const key = `${p[0].toFixed(1)},${p[1].toFixed(1)},${p[2].toFixed(1)}|${cam.yaw.toFixed(2)}|${cam.pitch.toFixed(2)}|${w}x${h}|${list.length}`;
      if (key === last) return;
      last = key;
      const m = cam.viewProjection(w / h);
      const labels = pickLabels(list, [p[0], p[1], p[2]]);
      let used = 0;
      for (const l of labels) {
        const at = projectToCss(m, l.origin, w, h);
        if (!at) continue;
        let tag = el.children[used] as HTMLDivElement | undefined;
        if (!tag) {
          tag = document.createElement("div");
          tag.className = "entity-label";
          el.appendChild(tag);
        }
        if (tag.textContent !== l.text) tag.textContent = l.text;
        tag.style.transform = `translate(${Math.round(at[0])}px, ${Math.round(at[1])}px) translate(-50%, -150%)`;
        tag.style.opacity = String(Math.max(0.35, 1 - l.dist / 3072));
        tag.style.display = "";
        used++;
      }
      for (let i = used; i < el.children.length; i++) (el.children[i] as HTMLDivElement).style.display = "none";
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, camera, canvas, entities]);
  if (!on) return null;
  return <div ref={box} className="entity-labels" aria-hidden />;
}
