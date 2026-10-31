// Zoomable lists: a remembered size (tile size or list font size) that
// Ctrl+wheel over the list changes, the way Unity's project browser does.
// The wheel listener is attached by hand because React's is passive and
// could not stop the browser from zooming the whole page.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ListZoom {
  value: number;
  set(v: number): void;
  /** Put on the scrolling element. */
  ref: React.RefObject<HTMLDivElement | null>;
}

export function useListZoom(key: string, fallback: number, min: number, max: number, step: number): ListZoom {
  const [value, setValue] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(key));
      return v >= min && v <= max ? v : fallback;
    } catch {
      return fallback;
    }
  });
  // The list may mount after the hook (the browsers show «загрузка контента…» first, or switch between
  // tiles and a list): the ref keeps the element in state so the listeners below follow it.
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useMemo(() => {
    let node: HTMLDivElement | null = null;
    return {
      get current() {
        return node;
      },
      set current(v: HTMLDivElement | null) {
        node = v;
        setEl(v);
      },
    };
  }, []);
  const set = useCallback(
    (v: number) => {
      const next = Math.max(min, Math.min(max, Math.round(v / step) * step));
      setValue(next);
      try {
        localStorage.setItem(key, String(next));
      } catch {
        /* storage unavailable */
      }
    },
    [key, min, max, step],
  );
  const setRef = useRef(set);
  setRef.current = set;
  const valueRef = useRef(value);
  valueRef.current = value;
  useEffect(() => {
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setRef.current(valueRef.current - Math.sign(e.deltaY) * step);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [el, step]);
  // Tile grids get explicit column and row sizes: WebView2 sized implicit grid
  // rows at a few pixels for tiles whose only height came from an aspect
  // ratio, so the tiles stacked over each other. Measuring the width here and
  // writing --cols / --tile-w keeps the tiles square at any panel width.
  useEffect(() => {
    if (!el || !el.classList.contains("tiles")) return;
    const fit = () => {
      // The padding and gap differ between the side and bottom docks: read the ones in force.
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
      const gap = parseFloat(cs.columnGap) || 0;
      const w = el.clientWidth - pad;
      const cols = Math.max(1, Math.floor((w + gap) / (valueRef.current + gap)));
      const tileW = Math.max(16, Math.floor((w - gap * (cols - 1)) / cols));
      el.style.setProperty("--cols", String(cols));
      el.style.setProperty("--tile-w", `${tileW}px`);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, value]);
  return { value, set, ref };
}

/** Tile size shared by the browsers that show thumbnails. */
export const TILE = { key: "gme.tileSize", fallback: 64, min: 32, max: 160, step: 8 };
/** Font size of the plain lists (models, prefabs, entity report). */
export const LIST = { key: "gme.listSize", fallback: 13, min: 11, max: 20, step: 1 };

/**
 * Loads the next page by itself, as the content browsers of Unity and Unreal do: when the list is
 * scrolled near its end, or does not yet fill its box (a tall panel), `more` is asked once; the
 * next page arriving (`count` changes) arms it again. `box` gives the scrolling element.
 */
export function useAutoMore(box: () => HTMLElement | null, hasMore: boolean, more: () => void, count: number): void {
  const boxRef = useRef(box);
  boxRef.current = box;
  const moreRef = useRef(more);
  moreRef.current = more;
  useEffect(() => {
    const el = boxRef.current();
    if (!el || !hasMore) return;
    let asked = false;
    const check = () => {
      if (asked) return;
      // A box that grows with its content never scrolls: stop at a thousand rather than load the whole game.
      if (el.scrollHeight <= el.clientHeight + 1 && count >= 1000) return;
      // Within half a screen (at least 200 px) of the end, or nothing to scroll yet.
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - Math.max(200, el.clientHeight / 2)) {
        asked = true;
        moreRef.current();
      }
    };
    const t = window.setTimeout(check, 0);
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      window.clearTimeout(t);
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [hasMore, count]);
}

