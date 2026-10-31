// Note pins over the 3D view: a small tag at each note's place, following
// the camera every frame the way entity labels do. Click one to fly there
// and open the notes panel.

import { useEffect, useRef } from "react";
import type { FlyCamera } from "../viewport/camera";
import { projectToCss } from "../viewport/labels";
import type { MapNote } from "../app/notes";

export function NotePins({ camera, canvas, notes, onPick }: { camera: () => FlyCamera | null; canvas: () => HTMLCanvasElement | null; notes: () => MapNote[]; onPick(note: MapNote): void }) {
  const box = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  pick.current = onPick;
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cam = camera();
      const cv = canvas();
      const el = box.current;
      if (!cam || !cv || !el) return;
      const list = notes();
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const p = cam.position;
      const key = `${p[0].toFixed(1)},${p[1].toFixed(1)},${p[2].toFixed(1)}|${cam.yaw.toFixed(2)}|${cam.pitch.toFixed(2)}|${w}x${h}|${list.map((n) => `${n.id}${n.done ? "d" : ""}${n.text.length}`).join(",")}`;
      if (key === last) return;
      last = key;
      const m = cam.viewProjection(w / h);
      let used = 0;
      for (const n of list) {
        const at = projectToCss(m, n.pos, w, h);
        if (!at) continue;
        let tag = el.children[used] as HTMLDivElement | undefined;
        if (!tag) {
          tag = document.createElement("div");
          tag.className = "note-pin";
          tag.addEventListener("click", (ev) => {
            const id = Number((ev.currentTarget as HTMLElement).dataset.id);
            const note = notes().find((x) => x.id === id);
            if (note) pick.current(note);
          });
          el.appendChild(tag);
        }
        const text = n.text.length > 36 ? `${n.text.slice(0, 35)}…` : n.text || "…";
        if (tag.textContent !== text) tag.textContent = text;
        tag.dataset.id = String(n.id);
        tag.classList.toggle("done", n.done);
        tag.style.transform = `translate(${Math.round(at[0])}px, ${Math.round(at[1])}px) translate(-50%, -100%)`;
        used++;
      }
      while (el.children.length > used) el.removeChild(el.lastChild!);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [camera, canvas, notes]);
  return <div ref={box} className="note-pins" />;
}
