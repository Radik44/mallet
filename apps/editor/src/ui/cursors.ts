// The editor's own cursors: a slim arrow or a thin crosshair on a 24×24
// canvas, with a small badge in the corner naming the tool or the action
// under the mouse. Drawn as SVG and handed to CSS as data URLs. `cursorCss`
// maps the browser's names (move, grab, the resize cursors) to these too,
// so every place that sets a cursor gets the same family.

const OUT = "rgba(12,14,20,0.9)";
const INK = "#ffffff";
const ACC = "#5ad7ec";

/** A 24×24 SVG as a CSS cursor with its hotspot. */
function svg(body: string, hx: number, hy: number, fallback: string): string {
  const doc = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(doc)}") ${hx} ${hy}, ${fallback}`;
}

/** A stroke drawn twice: a thin dark halo below, the light line above. */
const stroke = (d: string, w = 1.4, color = INK) => `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${w + 1.6}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const fill = (d: string, color = INK) => `<path d="${d}" fill="${OUT}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/><path d="${d}" fill="${color}"/>`;

/** A slim arrow, hotspot at its tip (3, 2). */
const ARROW = fill("M3.5 2.5 L3.5 16.5 L7.2 13.2 L9.6 18.8 L11.8 17.9 L9.5 12.4 L14.4 12.4 Z");
/** A thin crosshair with a gap and a dot in the middle, hotspot (12, 12). */
const CROSS = stroke("M12 2.5 V8 M12 16 V21.5 M2.5 12 H8 M16 12 H21.5", 1.3) + `<circle cx="12" cy="12" r="1.1" fill="${INK}" stroke="${OUT}" stroke-width="0.8"/>`;

/** A 9×9 badge in the bottom-right corner; the glyph is drawn in a 7×7 box at its centre. */
const badge = (inner: string, x = 14, y = 14) => `<rect x="${x}" y="${y}" width="9.5" height="9.5" rx="2.4" fill="${OUT}"/><g transform="translate(${x + 1.25} ${y + 1.25})">${inner}</g>`;
const line = (d: string, color = ACC, w = 1.15) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

const G = {
  box: line("M1 2.5 L3.5 1 L6 2.5 V5.5 L3.5 7 L1 5.5 Z M1 2.5 L3.5 4 L6 2.5 M3.5 4 V7", INK),
  brush: line("M1 6 C1 4.5 2 4.5 2.5 4 L5 1.5 L5.5 2 L3 4.5 C2.5 5 2.5 6 1 6 Z"),
  bulb: line("M3.5 0.75 A2.3 2.3 0 0 1 4.6 5 V5.8 H2.4 V5 A2.3 2.3 0 0 1 3.5 0.75 Z M2.7 6.6 H4.3", "#ffd56a"),
  scissors: line("M1 1 L6 6 M6 1 L1 6", ACC) + `<circle cx="1.6" cy="1.6" r="0.8" fill="${ACC}"/><circle cx="5.4" cy="1.6" r="0.8" fill="${ACC}"/>`,
  dot: `<circle cx="3.5" cy="3.5" r="1.9" fill="${ACC}"/>`,
  cordon: line("M0.75 0.75 H2.5 M4.5 0.75 H6.25 V2.5 M6.25 4.5 V6.25 H4.5 M2.5 6.25 H0.75 V4.5 M0.75 2.5 V0.75", "#ffa352"),
  hills: line("M0.75 6 L2.5 2.5 L3.75 4.5 L4.75 1.5 L6.25 6", "#7ee29a"),
  plus: line("M3.5 1 V6 M1 3.5 H6", ACC, 1.3),
  row: line("M1 2 H2.5 M4 2 H5.5 M1 5 H5 M4 3.8 L5.5 5 L4 6.2", ACC),
  pipette: line("M1 6 L4 3 M3.4 2.4 L4.6 3.6 M4.6 1.4 L5.6 2.4", ACC),
  eye: line("M0.75 3.5 C2 1.2 5 1.2 6.25 3.5 C5 5.8 2 5.8 0.75 3.5 Z", INK) + `<circle cx="3.5" cy="3.5" r="0.9" fill="${INK}"/>`,
  question: line("M2.1 2.3 A1.4 1.4 0 1 1 3.5 3.8 V4.6 M3.5 6.1 V6.3", ACC),
  ruler: line("M0.75 5.25 L5.25 0.75 L6.25 1.75 L1.75 6.25 Z M2.5 4 L3 4.5 M3.75 2.75 L4.25 3.25", "#ffd56a"),
};

/** The family, by name. */
export const CURSORS = {
  arrow: svg(ARROW, 3, 2, "default"),
  pointer: svg(ARROW + badge(G.box), 3, 2, "pointer"),
  pick: svg(ARROW + badge(G.question), 3, 2, "crosshair"),
  move: svg(stroke("M12 3 V21 M3 12 H21 M12 3 L9.5 5.5 M12 3 L14.5 5.5 M12 21 L9.5 18.5 M12 21 L14.5 18.5 M3 12 L5.5 9.5 M3 12 L5.5 14.5 M21 12 L18.5 9.5 M21 12 L18.5 14.5"), 12, 12, "move"),
  rotate: svg(stroke("M18 9 A7 7 0 1 0 19 14 M18 9 V4.5 M18 9 H13.5"), 12, 12, "grab"),
  scale: svg(stroke("M5 19 L19 5 M19 5 H13.5 M19 5 V10.5 M5 19 H10.5 M5 19 V13.5"), 12, 12, "nwse-resize"),
  "scale-nesw": svg(stroke("M19 19 L5 5 M5 5 H10.5 M5 5 V10.5 M19 19 H13.5 M19 19 V13.5"), 12, 12, "nesw-resize"),
  "scale-ns": svg(stroke("M12 3 V21 M12 3 L8.5 6.5 M12 3 L15.5 6.5 M12 21 L8.5 17.5 M12 21 L15.5 17.5"), 12, 12, "ns-resize"),
  "scale-ew": svg(stroke("M3 12 H21 M3 12 L6.5 8.5 M3 12 L6.5 15.5 M21 12 L17.5 8.5 M21 12 L17.5 15.5"), 12, 12, "ew-resize"),
  grab: svg(fill("M7.5 11 V6.5 A1.4 1.4 0 0 1 10.3 6.5 V5 A1.4 1.4 0 0 1 13.1 5 V6.3 A1.4 1.4 0 0 1 15.9 6.3 V8.5 A1.4 1.4 0 0 1 18.7 8.5 V15 A6 6 0 0 1 12.7 21 H11.6 A6 6 0 0 1 6.6 18.2 L4.6 14.3 A1.4 1.4 0 0 1 7 13 Z"), 12, 12, "grab"),
  grabbing: svg(fill("M7.5 13 V10.5 A1.4 1.4 0 0 1 10.3 10.5 V9.8 A1.4 1.4 0 0 1 13.1 9.8 V10.5 A1.4 1.4 0 0 1 15.9 10.5 V11.5 A1.4 1.4 0 0 1 18.7 11.5 V16 A6 6 0 0 1 12.7 22 H11.6 A6 6 0 0 1 6.6 19 L5.2 16.3 A1.4 1.4 0 0 1 7.5 14.8 Z"), 12, 12, "grabbing"),
  look: svg(CROSS + badge(G.eye), 12, 12, "crosshair"),
  block: svg(CROSS + badge(G.box), 12, 12, "crosshair"),
  texture: svg(CROSS + badge(G.brush), 12, 12, "crosshair"),
  pipette: svg(CROSS + badge(G.pipette), 12, 12, "crosshair"),
  entity: svg(CROSS + badge(G.bulb), 12, 12, "crosshair"),
  place: svg(CROSS + badge(G.plus), 12, 12, "crosshair"),
  row: svg(CROSS + badge(G.row), 12, 12, "crosshair"),
  clip: svg(CROSS + badge(G.scissors), 12, 12, "crosshair"),
  vertex: svg(CROSS + badge(G.dot), 12, 12, "crosshair"),
  cordon: svg(CROSS + badge(G.cordon), 12, 12, "crosshair"),
  landscape: svg(CROSS + badge(G.hills), 12, 12, "crosshair"),
  measure: svg(CROSS + badge(G.ruler), 12, 12, "crosshair"),
  crosshair: svg(CROSS, 12, 12, "crosshair"),
} as const;

export type CursorName = keyof typeof CURSORS;

/** The browser's cursor names that places in the code still use, mapped to the family. */
const ALIASES: Record<string, CursorName> = {
  default: "arrow",
  pointer: "pointer",
  move: "move",
  grab: "grab",
  grabbing: "grabbing",
  crosshair: "crosshair",
  cell: "texture",
  alias: "rotate",
  "nwse-resize": "scale",
  "nesw-resize": "scale-nesw",
  "ns-resize": "scale-ns",
  "ew-resize": "scale-ew",
  "n-resize": "scale-ns",
  "s-resize": "scale-ns",
  "e-resize": "scale-ew",
  "w-resize": "scale-ew",
  "ne-resize": "scale-nesw",
  "sw-resize": "scale-nesw",
  "nw-resize": "scale",
  "se-resize": "scale",
};

/** CSS for a cursor by family name or browser name; empty stays empty (inherit). */
export function cursorCss(name: string): string {
  if (!name) return "";
  if (name in CURSORS) return CURSORS[name as CursorName];
  const alias = ALIASES[name];
  return alias ? CURSORS[alias] : name;
}

/** Cursor of a tool while nothing special is under the mouse. */
export const TOOL_CURSORS: Record<string, CursorName> = {
  select: "arrow",
  block: "block",
  texture: "texture",
  entity: "entity",
  clip: "clip",
  vertex: "vertex",
  cordon: "cordon",
  landscape: "landscape",
  measure: "measure",
};

/** Publishes the family as CSS variables (`--cur-arrow`…), so stylesheets can use them. */
export function installCursors(): void {
  const root = document.documentElement.style;
  for (const [name, css] of Object.entries(CURSORS)) root.setProperty(`--cur-${name}`, css);
}
