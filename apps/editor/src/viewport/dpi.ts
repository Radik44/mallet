// Pixel ratios with the interface scale taken into account: the settings
// zoom the whole page with CSS `zoom`, which changes client rectangles but
// not clientWidth, so canvases and pointer maths go through these helpers.

/** The page zoom set by the interface scale setting (1 = none). */
export function uiZoom(): number {
  const z = Number((document.body.style as CSSStyleDeclaration & { zoom?: string }).zoom || 1);
  return Number.isFinite(z) && z > 0 ? z : 1;
}

/** Backing-store pixels per layout pixel: device ratio times the page zoom. */
export function effectiveDpr(): number {
  return (window.devicePixelRatio || 1) * uiZoom();
}

/** Pointer position relative to an element, in layout pixels (zoom removed). */
export function pointerCss(e: { clientX: number; clientY: number }, el: Element): [number, number] {
  const rect = el.getBoundingClientRect();
  const z = uiZoom();
  return [(e.clientX - rect.left) / z, (e.clientY - rect.top) / z];
}

/** A viewport length (from getBoundingClientRect, innerWidth…) as CSS px for a fixed element inside the zoomed body. */
export function zoomed(v: number): number {
  return v / uiZoom();
}
