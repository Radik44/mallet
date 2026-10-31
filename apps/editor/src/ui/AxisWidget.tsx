// The axis widget in the corner of the 3D view (Unity's scene gizmo,
// Blender's navigation gizmo): it follows the camera every frame without
// React re-rendering, and a click on an axis end turns the view along it.

import { useEffect, useRef } from "react";
import type { FlyCamera } from "../viewport/camera";
import { axisEnds, viewAlong } from "../viewport/axisWidget";
import { t } from "../i18n";

type Vec3 = [number, number, number];
type Box = [Vec3, Vec3] | [[number, number, number], [number, number, number]];

const COLORS = { x: "#e5484d", y: "#46a758", z: "#3e8fff" };
const SIZE = 72;
const R = 26;

export function AxisWidget({ camera, selectionBounds, onTurned }: { camera: () => FlyCamera | null; selectionBounds: () => Box | null; onTurned?(text: string): void }) {
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const cam = camera();
      const el = svg.current;
      if (!cam || !el) return;
      const key = `${cam.yaw.toFixed(1)}|${cam.pitch.toFixed(1)}`;
      if (key === last) return;
      last = key;
      // Far ends first, so the near ones are drawn on top.
      const ends = axisEnds(cam.yaw, cam.pitch).sort((a, b) => a.depth - b.depth);
      ends.forEach((e, i) => {
        const g = el.querySelector<SVGGElement>(`[data-end="${e.axis}${e.sign}"]`);
        if (!g) return;
        const x = SIZE / 2 + e.x * R;
        const y = SIZE / 2 + e.y * R;
        g.setAttribute("transform", `translate(${x} ${y})`);
        g.style.order = String(i);
        el.appendChild(g);
        const line = el.querySelector<SVGLineElement>(`[data-line="${e.axis}${e.sign}"]`);
        if (line) {
          line.setAttribute("x2", String(x));
          line.setAttribute("y2", String(y));
        }
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [camera]);

  const pick = (axis: "x" | "y" | "z", sign: 1 | -1) => {
    const cam = camera();
    if (!cam) return;
    // Orbit what is selected, or the point 512 units ahead.
    const b = selectionBounds();
    const p = cam.position;
    let pivot: Vec3;
    if (b) pivot = [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2];
    else {
      const f = cam.forward();
      pivot = [p[0] + f[0] * 512, p[1] + f[1] * 512, p[2] + f[2] * 512];
    }
    const distance = Math.max(64, Math.hypot(p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]));
    const v = viewAlong(axis, sign, pivot, distance);
    cam.position = new Float32Array(v.position);
    cam.yaw = v.yaw;
    cam.pitch = v.pitch;
    onTurned?.(t("вид {0}{1}{2}", [sign > 0 ? t("с +") : t("с −"), axis.toUpperCase(), axis === "z" ? (sign > 0 ? t(" (сверху)") : t(" (снизу)")) : ""]));
  };

  return (
    <svg ref={svg} className="axis-widget" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-label={t("Оси камеры")}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 1} className="axis-widget-bg" />
      {(["x", "y", "z"] as const).flatMap((a) =>
        ([1, -1] as const).map((s) => (
          <line key={`l${a}${s}`} data-line={`${a}${s}`} x1={SIZE / 2} y1={SIZE / 2} x2={SIZE / 2} y2={SIZE / 2} stroke={COLORS[a]} strokeWidth={s > 0 ? 2 : 1} opacity={s > 0 ? 1 : 0.45} />
        )),
      )}
      {(["x", "y", "z"] as const).flatMap((a) =>
        ([1, -1] as const).map((s) => (
          <g key={`e${a}${s}`} data-end={`${a}${s}`} className="axis-end" onClick={() => pick(a, s)}>
            <title>{t("Вид {0}{1}{2}", [s > 0 ? t("с +") : t("с −"), a.toUpperCase(), a === "z" ? (s > 0 ? t(" (сверху)") : t(" (снизу)")) : ""])}</title>
            <circle r={s > 0 ? 8 : 5} fill={s > 0 ? COLORS[a] : "var(--panel, #262626)"} stroke={COLORS[a]} strokeWidth={1.5} />
            {s > 0 && (
              <text textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="700" fill="#fff">
                {a.toUpperCase()}
              </text>
            )}
          </g>
        )),
      )}
    </svg>
  );
}
