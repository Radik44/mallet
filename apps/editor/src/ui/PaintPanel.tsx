// The texture painter: a zoomable canvas with layers, brushes, shapes,
// fill, text, seamless wrapping with a tiled preview and mirroring; a
// palette with recent colours; layer thumbnails. The result goes through
// the texture importer as VTF+VMT into the map project and onto the
// selected faces.

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import type { DragAsset } from "./assetDrag";
import {
  PAINT_SIZES,
  clonePix,
  composite,
  dab,
  floodFill,
  hasAlpha,
  hexToRgb,
  imageToPix,
  line,
  makePix,
  pickColor,
  pixToPng,
  rect,
  resizePix,
  rgbToHex,
  stamp,
  stroke,
  textToPix,
  vtfSize,
  type BrushOptions,
  type Layer,
  type Pix,
  type Rgba,
} from "./paint";
import { formatBytes } from "./wav";
import { t as tr, tb, lazy } from "../i18n";

export interface PaintedTexture {
  material: string;
  width: number;
  height: number;
  translucent: boolean;
}

interface Props {
  mapPath: string | null;
  contentReady: boolean;
  currentMaterial: string;
  faceMaterial: string | null;
  selectedFaces: number;
  selectedCount: number;
  thumbUrl(material: string, size: number): string;
  pickFile(): Promise<string | null>;
  readFileBytes(path: string): Promise<Uint8Array>;
  writeTexture(name: string, dir: string, shader: string, png: Uint8Array): Promise<PaintedTexture>;
  onExported(material: string, apply: boolean): void;
  onDragAsset?: DragAsset;
}

type Tool = "brush" | "pencil" | "eraser" | "line" | "rect" | "fill" | "pick" | "text";

const TOOLS: { id: Tool; title: string; hint: string; icon: IconName; key: string }[] = lazy(() => [
  { id: "brush", title: tr("Кисть"), hint: tr("Мягкий край, размер и сила"), icon: "brush", key: "B" },
  { id: "pencil", title: tr("Карандаш"), hint: tr("Жёсткий край по пикселям"), icon: "edit", key: "P" },
  { id: "eraser", title: tr("Ластик"), hint: tr("Стирает до прозрачности"), icon: "eraser", key: "E" },
  { id: "line", title: tr("Линия"), hint: tr("Протяните от начальной точки до конечной"), icon: "line", key: "L" },
  { id: "rect", title: tr("Прямоугольник"), hint: tr("Протяните по диагонали; Shift - только контур"), icon: "rect", key: "R" },
  { id: "fill", title: tr("Заливка"), hint: tr("Заливает соседние пиксели похожего цвета"), icon: "fill", key: "G" },
  { id: "pick", title: tr("Пипетка"), hint: tr("Берёт цвет с холста"), icon: "pick", key: "I" },
  { id: "text", title: tr("Текст"), hint: tr("Введите текст и щёлкните по холсту"), icon: "text", key: "T" },
]);

const SHADERS: { id: string; title: string }[] = lazy(() => [
  { id: "LightmappedGeneric", title: tr("Стены и пол (LightmappedGeneric)") },
  { id: "UnlitGeneric", title: tr("Без освещения: экраны, знаки (UnlitGeneric)") },
  { id: "VertexLitGeneric", title: tr("Модели (VertexLitGeneric)") },
]);

const PALETTE = ["#1b1b1f", "#ffffff", "#8a8a8a", "#d9480f", "#f5a623", "#ffd43b", "#2fbf8f", "#1f8a99", "#4c6ef5", "#7c5cff", "#c05fd6", "#e05c5c", "#6b4a2b", "#9c7b4f", "#dcc9a6", "#3e5a3a"];
const ZOOMS = [0.25, 0.5, 1, 2, 3, 4, 6, 8];

interface Doc {
  w: number;
  h: number;
  layers: Layer[];
  active: number;
  nextId: number;
}

let kept: Doc | null = null;
let keptExport: PaintedTexture | null = null;
let keptRecent: string[] = [];

function newDoc(w: number, h: number): Doc {
  return { w, h, layers: [{ id: 1, name: tr("Фон"), pix: makePix(w, h, [128, 128, 128, 255]), visible: true, opacity: 1 }], active: 0, nextId: 2 };
}

const UNDO_MAX = 24;

export function PaintPanel(p: Props) {
  const docRef = useRef<Doc>(kept ?? (kept = newDoc(256, 256)));
  const [, bump] = useState(0);
  const redraw = () => bump((n) => n + 1);
  const doc = docRef.current;

  const [tool, setTool] = useState<Tool>("brush");
  const [hex, setHex] = useState("#d9480f");
  const [alpha, setAlpha] = useState(255);
  const [size, setSize] = useState(16);
  const [hardness, setHardness] = useState(0.6);
  const [opacity, setOpacity] = useState(1);
  const [wrap, setWrap] = useState(false);
  const [tile, setTile] = useState(false);
  const [mirrorX, setMirrorX] = useState(false);
  const [mirrorY, setMirrorY] = useState(false);
  const [tolerance, setTolerance] = useState(32);
  const [text, setText] = useState("Mallet");
  const [zoom, setZoom] = useState(1);
  const [name, setName] = useState("painted1");
  const [dir, setDir] = useState("custom");
  const [shader, setShader] = useState("LightmappedGeneric");
  const [applyToSel, setApplyToSel] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [exported, setExported] = useState<PaintedTexture | null>(keptExport);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [version, setVersion] = useState(0);

  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const off = useRef<HTMLCanvasElement | null>(null);
  const comp = useRef<Pix>(makePix(doc.w, doc.h));
  const undo = useRef<{ layer: number; data: Uint8ClampedArray }[]>([]);
  const redo = useRef<{ layer: number; data: Uint8ClampedArray }[]>([]);
  const drawing = useRef<{ start: [number, number]; last: [number, number]; base: Uint8ClampedArray | null; outline: boolean } | null>(null);
  const panning = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const space = useRef(false);
  const dirty = useRef(true);

  const color: Rgba = [...hexToRgb(hex), alpha] as Rgba;
  const active = doc.layers[doc.active] ?? doc.layers[0];
  const brush = (): BrushOptions => ({
    radius: Math.max(0.5, size / 2),
    hardness: tool === "pencil" || tool === "line" || tool === "rect" ? 1 : hardness,
    opacity: tool === "pencil" ? 1 : opacity,
    color,
    erase: tool === "eraser",
    wrap,
    mirrorX,
    mirrorY,
  });

  const invalidate = () => {
    dirty.current = true;
    setVersion((v) => v + 1);
  };

  // Composite and draw whenever something changed.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (comp.current.w !== doc.w || comp.current.h !== doc.h) comp.current = makePix(doc.w, doc.h);
    if (!off.current) off.current = document.createElement("canvas");
    const o = off.current;
    if (o.width !== doc.w || o.height !== doc.h) {
      o.width = doc.w;
      o.height = doc.h;
    }
    if (dirty.current) {
      composite(doc.layers, comp.current);
      o.getContext("2d")!.putImageData(new ImageData(comp.current.data as Uint8ClampedArray<ArrayBuffer>, doc.w, doc.h), 0, 0);
      dirty.current = false;
    }
    const n = tile ? 3 : 1;
    if (c.width !== doc.w * n || c.height !== doc.h * n) {
      c.width = doc.w * n;
      c.height = doc.h * n;
    }
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) g.drawImage(o, tx * doc.w, ty * doc.h);
    if (tile) {
      g.strokeStyle = "rgba(255,212,59,0.85)";
      g.lineWidth = Math.max(1, doc.w / 128);
      g.strokeRect(doc.w, doc.h, doc.w, doc.h);
    }
    if (cursor && tool !== "fill" && tool !== "pick" && tool !== "text") {
      const r = Math.max(0.5, size / 2);
      const cx = cursor[0] + (tile ? doc.w : 0);
      const cy = cursor[1] + (tile ? doc.h : 0);
      g.lineWidth = Math.max(1, 1 / zoom);
      g.strokeStyle = "rgba(0,0,0,0.6)";
      g.beginPath();
      g.arc(cx, cy, r + g.lineWidth, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.9)";
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.stroke();
    }
  });

  const toPix = (e: React.PointerEvent): [number, number] => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const n = tile ? 3 : 1;
    let x = ((e.clientX - r.left) / r.width) * doc.w * n - (tile ? doc.w : 0);
    let y = ((e.clientY - r.top) / r.height) * doc.h * n - (tile ? doc.h : 0);
    if (tile) {
      x = ((x % doc.w) + doc.w) % doc.w;
      y = ((y % doc.h) + doc.h) % doc.h;
    }
    return [x, y];
  };

  const pushUndo = () => {
    undo.current.push({ layer: doc.active, data: new Uint8ClampedArray(active.pix.data) });
    if (undo.current.length > UNDO_MAX) undo.current.shift();
    redo.current = [];
  };
  const doUndo = () => {
    const u = undo.current.pop();
    if (!u) return;
    const layer = doc.layers[u.layer];
    if (!layer || layer.pix.data.length !== u.data.length) return;
    redo.current.push({ layer: u.layer, data: new Uint8ClampedArray(layer.pix.data) });
    layer.pix.data.set(u.data);
    invalidate();
  };
  const doRedo = () => {
    const r = redo.current.pop();
    if (!r) return;
    const layer = doc.layers[r.layer];
    if (!layer || layer.pix.data.length !== r.data.length) return;
    undo.current.push({ layer: r.layer, data: new Uint8ClampedArray(layer.pix.data) });
    layer.pix.data.set(r.data);
    invalidate();
  };

  const useColor = (h: string) => {
    setHex(h);
    keptRecent = [h, ...keptRecent.filter((x) => x !== h)].slice(0, 8);
  };

  const onDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && space.current)) {
      const st = stage.current!;
      panning.current = { x: e.clientX, y: e.clientY, sl: st.scrollLeft, st: st.scrollTop };
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
    if (e.button !== 0 || !active) return;
    const pt = toPix(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "pick") {
      const c = pickColor(comp.current, pt[0], pt[1]);
      if (c) {
        useColor(rgbToHex(c[0], c[1], c[2]));
        setAlpha(c[3]);
      }
      return;
    }
    pushUndo();
    if (tool === "fill") {
      floodFill(active.pix, pt[0], pt[1], color, tolerance, wrap);
      invalidate();
      return;
    }
    if (tool === "text") {
      const t = textToPix(text, Math.max(6, size * 2), color);
      if (t) stamp(active.pix, t, pt[0] - t.w / 2, pt[1] - t.h / 2, opacity, wrap);
      invalidate();
      return;
    }
    drawing.current = { start: pt, last: pt, base: tool === "line" || tool === "rect" ? new Uint8ClampedArray(active.pix.data) : null, outline: e.shiftKey };
    if (tool === "brush" || tool === "pencil" || tool === "eraser") {
      dab(active.pix, pt[0], pt[1], brush());
      invalidate();
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (panning.current) {
      const st = stage.current!;
      st.scrollLeft = panning.current.sl - (e.clientX - panning.current.x);
      st.scrollTop = panning.current.st - (e.clientY - panning.current.y);
      return;
    }
    const pt = toPix(e);
    setCursor(pt);
    const d = drawing.current;
    if (!d || !active) return;
    if (tool === "brush" || tool === "pencil" || tool === "eraser") {
      stroke(active.pix, d.last[0], d.last[1], pt[0], pt[1], brush());
      d.last = pt;
    } else if (d.base) {
      active.pix.data.set(d.base);
      if (tool === "line") line(active.pix, d.start[0], d.start[1], pt[0], pt[1], brush());
      else rect(active.pix, d.start[0], d.start[1], pt[0], pt[1], brush(), d.outline || e.shiftKey);
    }
    invalidate();
  };
  const onUp = () => {
    if (drawing.current) useColor(hex);
    drawing.current = null;
    panning.current = null;
  };

  // Keyboard: tools by letter, size with brackets, undo and redo, space to pan.
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (e.key === " ") {
        space.current = true;
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        e.stopPropagation();
        doRedo();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = TOOLS.find((t) => t.key.toLowerCase() === e.key.toLowerCase());
      if (t) {
        e.stopPropagation();
        setTool(t.id);
      } else if (e.key === "[") setSize((s) => Math.max(1, Math.round(s / 1.25)));
      else if (e.key === "]") setSize((s) => Math.min(256, Math.round(s * 1.25) + 1));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") space.current = false;
    };
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKeyUp);
    return () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKeyUp);
    };
  });

  const zoomBy = (d: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 1e-6);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + d))];
    setZoom(next);
  };
  const fit = () => {
    const st = stage.current;
    if (!st) return;
    const n = tile ? 3 : 1;
    const z = Math.min((st.clientWidth - 16) / (doc.w * n), (st.clientHeight - 16) / (doc.h * n));
    setZoom(Math.max(0.1, Math.min(8, Math.floor(z * 20) / 20)));
  };
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.w, doc.h, tile]);

  // Layers.
  const addLayer = (pix: Pix, label: string) => {
    const layer: Layer = { id: doc.nextId++, name: label, pix, visible: true, opacity: 1 };
    doc.layers.splice(doc.active + 1, 0, layer);
    doc.active = doc.layers.indexOf(layer);
    undo.current = [];
    redo.current = [];
    invalidate();
  };
  const removeLayer = () => {
    if (doc.layers.length <= 1) return;
    doc.layers.splice(doc.active, 1);
    doc.active = Math.max(0, Math.min(doc.layers.length - 1, doc.active));
    undo.current = [];
    redo.current = [];
    invalidate();
  };
  const moveLayer = (d: 1 | -1) => {
    const to = doc.active + d;
    if (to < 0 || to >= doc.layers.length) return;
    const [l] = doc.layers.splice(doc.active, 1);
    doc.layers.splice(to, 0, l);
    doc.active = to;
    invalidate();
  };
  const duplicateLayer = () => addLayer(clonePix(active.pix), tr("{0} (копия)", [active.name]));
  const mergeDown = () => {
    if (doc.active <= 0) return;
    const below = doc.layers[doc.active - 1];
    stamp(below.pix, active.pix, 0, 0, active.opacity, false);
    doc.layers.splice(doc.active, 1);
    doc.active -= 1;
    undo.current = [];
    redo.current = [];
    invalidate();
  };
  const resizeAll = (w: number, h: number) => {
    for (const l of doc.layers) l.pix = resizePix(l.pix, w, h);
    doc.w = w;
    doc.h = h;
    undo.current = [];
    redo.current = [];
    invalidate();
  };
  const clearCanvas = () => {
    docRef.current = kept = newDoc(doc.w, doc.h);
    undo.current = [];
    redo.current = [];
    invalidate();
  };
  const importImage = async () => {
    setError("");
    try {
      const path = await p.pickFile();
      if (!path) return;
      setBusy(tr("Открытие изображения…"));
      const pix = await imageToPix(await p.readFileBytes(path));
      addLayer(resizePix(pix, doc.w, doc.h), path.replace(/^.*[\\/]/, ""));
    } catch (err) {
      setError(tb(String(err)));
    } finally {
      setBusy("");
    }
  };
  const fromTexture = async (material: string) => {
    setError("");
    const url = p.thumbUrl(material, Math.max(doc.w, doc.h));
    if (!url) {
      setError(tr("Текстуры игры доступны только в приложении"));
      return;
    }
    setBusy(tr("Загрузка {0}…", [material]));
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${material}: ${res.status}`);
      const pix = await imageToPix(new Uint8Array(await res.arrayBuffer()));
      addLayer(resizePix(pix, doc.w, doc.h), material.replace(/^.*\//, ""));
    } catch (err) {
      setError(tb(String(err)));
    } finally {
      setBusy("");
    }
  };
  const exportTexture = async () => {
    setError("");
    if (!p.mapPath) {
      setError(tr("Сначала сохраните карту: текстура будет записана в папку materials рядом с ней"));
      return;
    }
    setBusy(tr("Сохранение текстуры…"));
    try {
      composite(doc.layers, comp.current);
      const png = await pixToPng(comp.current);
      const t = await p.writeTexture(name.trim() || "painted", dir, shader, png);
      keptExport = t;
      setExported(t);
      p.onExported(t.material, applyToSel && (p.selectedFaces > 0 || p.selectedCount > 0));
    } catch (err) {
      setError(tb(String(err)));
    } finally {
      setBusy("");
    }
  };

  const translucent = hasAlpha(composite(doc.layers, clonePix(comp.current)));
  const bytes = vtfSize(doc.w, doc.h);
  const source = p.faceMaterial || p.currentMaterial;
  const under = cursor ? pickColor(comp.current, cursor[0], cursor[1]) : null;
  const toolMeta = TOOLS.find((t) => t.id === tool)!;
  const n = tile ? 3 : 1;

  return (
    <aside className="panel paint" ref={panelRef} tabIndex={-1}>
      <header className="paint-head">
        <div className="paint-tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={`paint-tool${tool === t.id ? " active" : ""}`} onClick={() => setTool(t.id)} title={`${t.title} (${t.key}): ${t.hint}`}>
              <Icon name={t.icon} />
            </button>
          ))}
        </div>
        <span className="grow" />
        <button className="icon-btn" onClick={doUndo} disabled={!undo.current.length} title={tr("Отменить (Ctrl+Z)")}>
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={doRedo} disabled={!redo.current.length} title={tr("Вернуть (Ctrl+Y)")}>
          <Icon name="redo" />
        </button>
      </header>
      <div className="paint-options">
        <span className="paint-tool-name">{toolMeta.title}</span>
        <label className="paint-opt" title={tr("Размер кисти в пикселях ([ и ])")}>
          <span>{tr("Размер")}</span>
          <input type="range" min={1} max={128} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <input type="number" className="num" min={1} max={256} value={size} onChange={(e) => setSize(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        {tool === "brush" || tool === "eraser" ? (
          <label className="paint-opt" title={tr("Жёсткость края: 100% - чёткий, 0% - мягкий")}>
            <span>{tr("Край")}</span>
            <input type="range" min={0} max={1} step={0.05} value={hardness} onChange={(e) => setHardness(Number(e.target.value))} />
            <span className="muted num">{Math.round(hardness * 100)}%</span>
          </label>
        ) : null}
        {tool !== "pencil" && tool !== "fill" && tool !== "pick" ? (
          <label className="paint-opt" title={tr("Сила: прозрачность мазка")}>
            <span>{tr("Сила")}</span>
            <input type="range" min={0.05} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} />
            <span className="muted num">{Math.round(opacity * 100)}%</span>
          </label>
        ) : null}
        {tool === "fill" ? (
          <label className="paint-opt" title={tr("Допустимое отличие цвета соседних пикселей")}>
            <span>{tr("Допуск")}</span>
            <input type="range" min={0} max={255} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} />
            <span className="muted num">{tolerance}</span>
          </label>
        ) : null}
        {tool === "text" ? (
          <label className="paint-opt grow" title={tr("Текст размещается щелчком по холсту; размер шрифта задаётся полем «Размер»")}>
            <span>{tr("Текст")}</span>
            <input className="grow" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </label>
        ) : null}
      </div>
      <div className="paint-colors">
        <label className="paint-swatch-current" title={tr("Текущий цвет")}>
          <input type="color" value={hex} onChange={(e) => useColor(e.target.value)} />
          <span style={{ background: hex, opacity: alpha / 255 }} />
        </label>
        <div className="paint-palette">
          {PALETTE.map((c) => (
            <button key={c} className={`paint-swatch${hex === c ? " on" : ""}`} style={{ background: c }} onClick={() => useColor(c)} title={c} />
          ))}
        </div>
        {keptRecent.length ? (
          <div className="paint-palette recent" title={tr("Недавние цвета")}>
            {keptRecent.map((c) => (
              <button key={c} className={`paint-swatch${hex === c ? " on" : ""}`} style={{ background: c }} onClick={() => useColor(c)} title={c} />
            ))}
          </div>
        ) : null}
        <label className="paint-opt alpha" title={tr("Прозрачность цвета: {0}%", [Math.round((alpha / 255) * 100)])}>
          <span>α</span>
          <input type="range" min={0} max={255} value={alpha} onChange={(e) => setAlpha(Number(e.target.value))} />
        </label>
      </div>
      <div className="paint-canvas-bar">
        <button className={`chip${wrap ? " on" : ""}`} onClick={() => setWrap(!wrap)} title={tr("Бесшовный режим: мазки и заливка переходят через край, текстура повторяется без шва")}>
          {tr("Бесшовно")}
        </button>
        <button className={`chip${tile ? " on" : ""}`} onClick={() => setTile(!tile)} title={tr("Показать холст плиткой 3×3 для проверки стыков; рисовать можно на любой плитке")}>
          3×3
        </button>
        <button className={`chip${mirrorX ? " on" : ""}`} onClick={() => setMirrorX(!mirrorX)} title={tr("Зеркало по горизонтали")}>
          ⇔
        </button>
        <button className={`chip${mirrorY ? " on" : ""}`} onClick={() => setMirrorY(!mirrorY)} title={tr("Зеркало по вертикали")}>
          ⇕
        </button>
        <span className="grow" />
        <button className="icon-btn" onClick={() => zoomBy(-1)} title={tr("Отдалить (Ctrl+колесо)")}>
          <Icon name="minus" />
        </button>
        <button className="link" onClick={fit} title={tr("Вписать холст в панель")}>
          {Math.round(zoom * 100)}%
        </button>
        <button className="icon-btn" onClick={() => zoomBy(1)} title={tr("Приблизить (Ctrl+колесо)")}>
          <Icon name="plus" />
        </button>
      </div>
      <div
        className="paint-stage"
        ref={stage}
        onWheel={(e) => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          zoomBy(e.deltaY < 0 ? 1 : -1);
        }}
      >
        <canvas
          ref={canvas}
          className="paint-canvas"
          style={{ width: doc.w * n * zoom, height: doc.h * n * zoom }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={() => setCursor(null)}
          onContextMenu={(e) => e.preventDefault()}
        />
      </div>
      <div className="paint-status muted">
        <span>
          {doc.w}×{doc.h}
        </span>
        <span>{cursor ? `${Math.floor(cursor[0])}, ${Math.floor(cursor[1])}` : "-"}</span>
        {under ? (
          <span className="paint-under" title={tr("Цвет под курсором")}>
            <i style={{ background: `rgba(${under[0]},${under[1]},${under[2]},${under[3] / 255})` }} /> {rgbToHex(under[0], under[1], under[2])}
          </span>
        ) : null}
        <span className="grow" />
        <span title={tr("Средняя кнопка или пробел - панорама; Ctrl+колесо - масштаб")}>{tr("Ctrl+колесо · пробел")}</span>
      </div>
      <section className="paint-section">
        <div className="paint-section-head">
          <strong>{tr("Слои")}</strong>
          <span className="muted">{tr("Холст")}</span>
          <select value={doc.w} onChange={(e) => resizeAll(Number(e.target.value), doc.h)} title={tr("Ширина холста")}>
            {PAINT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="muted">×</span>
          <select value={doc.h} onChange={(e) => resizeAll(doc.w, Number(e.target.value))} title={tr("Высота холста")}>
            {PAINT_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="grow" />
          <button className="icon-btn" onClick={() => addLayer(makePix(doc.w, doc.h), tr("Слой {0}", [doc.nextId]))} title={tr("Новый прозрачный слой")}>
            <Icon name="plus" />
          </button>
          <button className="icon-btn" onClick={() => void importImage()} title={tr("Импортировать изображение с диска как новый слой (PNG, JPG…)")}>
            <Icon name="import" />
          </button>
          <button
            className="link"
            onClick={() => void fromTexture(source)}
            disabled={!source || !p.contentReady}
            title={tr("Добавить текстуру {0} как новый слой: материал выделенной грани или текущий", [source || "…"])}
          >
            {tr("Из текстуры")}
          </button>
        </div>
        <div className="paint-layer-list">
          {doc.layers
            .map((l, i) => ({ l, i }))
            .reverse()
            .map(({ l, i }) => (
              <div
                key={l.id}
                className={`paint-layer${i === doc.active ? " current" : ""}${l.visible ? "" : " hidden"}`}
                onClick={() => {
                  doc.active = i;
                  redraw();
                }}
                onDoubleClick={() => setRenaming(l.id)}
                title={tr("Щелчок - выбрать, двойной щелчок - переименовать")}
              >
                <button
                  className={`paint-eye${l.visible ? "" : " off"}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    l.visible = !l.visible;
                    invalidate();
                  }}
                  title={l.visible ? tr("Скрыть слой") : tr("Показать слой")}
                >
                  <Icon name="eye" size={12} />
                </button>
                <LayerThumb pix={l.pix} version={version} />
                {renaming === l.id ? (
                  <input
                    className="grow"
                    autoFocus
                    defaultValue={l.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      l.name = e.target.value.trim() || l.name;
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
                      e.stopPropagation();
                    }}
                  />
                ) : (
                  <span className="list-text grow">{l.name}</span>
                )}
                {i === doc.active ? (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={l.opacity}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      l.opacity = Number(e.target.value);
                      invalidate();
                    }}
                    title={tr("Прозрачность слоя: {0}%", [Math.round(l.opacity * 100)])}
                    className="paint-layer-opacity"
                  />
                ) : null}
              </div>
            ))}
        </div>
        <div className="paint-layer-actions">
          <button className="icon-btn" onClick={() => moveLayer(1)} disabled={doc.active >= doc.layers.length - 1} title={tr("Слой выше")}>
            <Icon name="up" />
          </button>
          <button className="icon-btn" onClick={() => moveLayer(-1)} disabled={doc.active <= 0} title={tr("Слой ниже")}>
            <Icon name="down" />
          </button>
          <button className="icon-btn" onClick={duplicateLayer} title={tr("Дублировать слой")}>
            <Icon name="copy" />
          </button>
          <button className="link" onClick={mergeDown} disabled={doc.active <= 0} title={tr("Объединить с нижним слоем")}>
            {tr("Слить вниз")}
          </button>
          <span className="grow" />
          <button className="link" onClick={clearCanvas} title={tr("Очистить холст: останется один серый слой")}>
            {tr("Очистить")}
          </button>
          <button className="icon-btn" onClick={removeLayer} disabled={doc.layers.length <= 1} title={tr("Удалить слой")}>
            <Icon name="trash" />
          </button>
        </div>
      </section>
      <section className="paint-section paint-export">
        <div className="paint-section-head">
          <strong>{tr("Сохранить в карту")}</strong>
          <span className="muted grow">
            {formatBytes(bytes)} VTF{translucent ? tr(" · с прозрачностью") : ""}
          </span>
        </div>
        <div className="paint-export-grid">
          <span className="muted">{tr("Имя")}</span>
          <div className="paint-export-name">
            <input value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} title={tr("Имя материала: materials/<папка>/<имя>.vtf")} />
            <span className="muted">{tr("в")}</span>
            <input className="paint-dir" value={dir} spellCheck={false} onChange={(e) => setDir(e.target.value)} title={tr("Папка внутри materials проекта карты")} />
          </div>
          <span className="muted">{tr("Для")}</span>
          <select value={shader} onChange={(e) => setShader(e.target.value)}>
            {SHADERS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="paint-export-actions">
          <label
            title={tr("После сохранения применить к выделенным граням или брашам (сейчас: {0})", [
              p.selectedFaces ? tr("{0} гр.", [p.selectedFaces]) : p.selectedCount ? tr("{0} объ.", [p.selectedCount]) : tr("ничего не выделено"),
            ])}
          >
            <input type="checkbox" checked={applyToSel} onChange={(e) => setApplyToSel(e.target.checked)} /> {tr("Применить к выделению")}
          </label>
          <span className="grow" />
          <button className="primary" onClick={() => void exportTexture()} disabled={!!busy || !p.mapPath} title={p.mapPath ? tr("Записать VTF и VMT в проект карты") : tr("Сначала сохраните карту")}>
            <Icon name="check" /> {tr("Сохранить")}
          </button>
        </div>
        {busy ? <div className="muted">{busy}</div> : null}
        {error ? <div className="bad">{error}</div> : null}
        {exported ? (
          <div className="paint-exported">
            <span className="asset-chip" onMouseDown={(e) => p.onDragAsset?.("material", exported.material, e)} title={tr("Перетащите на грань в любом окне вида")}>
              <Icon name="brush" /> {exported.material}
            </span>
            <span className="muted">
              {exported.width}×{exported.height}
            </span>
          </div>
        ) : null}
      </section>
    </aside>
  );
}

/** A layer's picture, small. */
function LayerThumb({ pix, version }: { pix: Pix; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const tmp = document.createElement("canvas");
    tmp.width = pix.w;
    tmp.height = pix.h;
    tmp.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(pix.data), pix.w, pix.h), 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(tmp, 0, 0, c.width, c.height);
  }, [pix, version]);
  return <canvas ref={ref} width={28} height={28} className="paint-thumb" />;
}
