// Dragging a texture or a model out of its browser into a view: the material
// preview on the face under the cursor, the model ghost where it would land,
// and the drop itself. A hook, so the callbacks keep their memoization.

import { useCallback, useRef, useState } from "react";
import { api } from "../../tauri";
import { type AssetKind, SOUND_LOOPS } from "../../ui/assetDrag";
import { instanceMatrix } from "../../viewport/models";
import { pointerCss } from "../../viewport/dpi";
import { pickInfo, type LoadedMap, type PickInfo } from "../../map/loader";
import { FlyCamera } from "../../viewport/camera";
import { type ViewId } from "../../ui/viewsLayout";
import { mouseRay, rayPlane } from "../../viewport/gizmo";
import { type View2D } from "../../viewport/renderer";
import { boxCenter, type Box3, type Vec3 } from "../../viewport/transform";
import type { EditorApi } from "../editorApi";
import { t as tr } from "../../i18n";

/** Keys of an ambient_generic for a sound: audible, a room-sized radius, looping unless the WAV says otherwise. */
export function soundKeys(name: string): [string, string][] {
  return [
    ["message", name],
    ["health", "10"],
    ["radius", "1250"],
    ["pitch", "100"],
    ["pitchstart", "100"],
    // Flag 32 "Is NOT Looped" lets the engine replay a one-shot sound on every trigger.
    ["spawnflags", SOUND_LOOPS.get(name) === false ? "32" : "0"],
  ];
}

export function useAssetDrag(
  e: Pick<
    EditorApi,
    | "canvasRef"
    | "session"
    | "current"
    | "materialInfos"
    | "classInfos"
    | "gridRef"
    | "setStatusText"
    | "modelCache"
    | "prefabsRef"
    | "setCurrentMaterial"
    | "setEntityClass"
    | "setCurrentModel"
    | "selectionBoundsRef"
    | "ensureModel"
    | "insertPrefab"
    | "applyMaterial"
    | "createEntityAt"
    | "selectionBounds"
    | "openSoundSetup"
  >,
) {
  const {
    canvasRef,
    session,
    current,
    materialInfos,
    classInfos,
    gridRef,
    setStatusText,
    modelCache,
    prefabsRef,
    setCurrentMaterial,
    setEntityClass,
    setCurrentModel,
    selectionBoundsRef,
    ensureModel,
    insertPrefab,
    applyMaterial,
    createEntityAt,
    openSoundSetup,
    selectionBounds,
  } = e;
  const [assetDrag, setAssetDrag] = useState<{ kind: AssetKind; name: string; x: number; y: number; over: ViewId | null; yaw?: number } | null>(null);
  const viewUnder = (x: number, y: number): ViewId | null => ((document.elementFromPoint(x, y)?.closest("[data-view]") as HTMLElement | null)?.dataset.view as ViewId | undefined) ?? null;
  /** The faces a dropped material covers: the face, the brush (Shift) or the brush's whole group (Ctrl). */
  const facesForDrop = (map: LoadedMap, info: PickInfo, mods: { shiftKey: boolean; ctrlKey: boolean }): number[] => {
    if (info.kind !== "face") return [];
    if (mods.ctrlKey) {
      const g = map.doc.group_of(info.solidId);
      const ids = g ? Array.from(map.doc.group_members(g)) : [info.solidId];
      return ids.flatMap((id) => Array.from(map.doc.solid_sides(id)).flatMap((side) => [id, side]));
    }
    if (mods.shiftKey) return Array.from(map.doc.solid_sides(info.solidId)).flatMap((side) => [info.solidId, side]);
    return [info.solidId, info.sideId];
  };
  /** Pick ids of the faces a dropped material covers: the face, the brush (Shift) or its group (Ctrl). */
  const pickIdsForDrop = (map: LoadedMap, info: PickInfo, mods: { shiftKey: boolean; ctrlKey: boolean }): number[] => {
    if (info.kind !== "face") return [];
    if (!mods.shiftKey && !mods.ctrlKey) return [info.pickId];
    let solids = new Set<number>([info.solidId]);
    if (mods.ctrlKey) {
      const g = map.doc.group_of(info.solidId);
      if (g) solids = new Set(Array.from(map.doc.group_members(g)));
    }
    const t = map.mesh.faceTable;
    const out: number[] = [];
    for (let f = 0; f * 4 < t.length; f++) if (solids.has(t[f * 4 + 1])) out.push(f);
    return out;
  };
  /**
   * While a material is dragged over the 3D view the faces under the cursor
   * already wear it. The renderer draws them again with the new material;
   * the document is untouched until the drop, so the preview follows the
   * cursor at frame rate.
   */
  const matPreview = useRef<{ key: string } | null>(null);
  const matPreviewBusy = useRef(false);
  const matPreviewNext = useRef<{ name: string; ev: MouseEvent } | null>(null);
  const revertMaterialPreview = useCallback(async () => {
    matPreview.current = null;
    session.current?.renderer.clearMaterialPreview();
  }, []);
  const updateMaterialPreview = useCallback(async (name: string, ev: MouseEvent) => {
    if (matPreviewBusy.current) {
      matPreviewNext.current = { name, ev };
      return;
    }
    matPreviewBusy.current = true;
    // Read through an alias: TypeScript keeps the ref narrowed to null after the assignment below.
    const queue: React.MutableRefObject<{ name: string; ev: MouseEvent } | null> = matPreviewNext;
    try {
      do {
        matPreviewNext.current = null;
        const s = session.current;
        const map = current.current;
        const canvas = canvasRef.current;
        if (!s || !map || !canvas) return;
        let faces: number[] = [];
        if (viewUnder(ev.clientX, ev.clientY) === "3d") {
          const css = pointerCss(ev, canvas);
          const id = await s.renderer.pick(s.camera, css[0], css[1]);
          const info = id === null ? null : pickInfo(map, id);
          if (info) faces = pickIdsForDrop(map, info, ev);
        }
        const key = faces.length ? `${name}|${faces.join(",")}` : "";
        if (key !== (matPreview.current?.key ?? "")) {
          let info = materialInfos.current.get(name) ?? null;
          if (!info) {
            const [fetched] = await api.materialsInfo([name]);
            if (fetched) {
              info = fetched;
              materialInfos.current.set(name, fetched);
            }
          }
          matPreview.current = key ? { key } : null;
          s.renderer.setMaterialPreview(faces, name, info);
        }
        const next = queue.current;
        if (next) {
          name = next.name;
          ev = next.ev;
        }
      } while (queue.current);
    } finally {
      matPreviewBusy.current = false;
    }
  }, []);
  /**
   * The box an entity occupies around its origin: a model's real bounds
   * (turned by its yaw) when it is a prop whose model is loaded, else the
   * FGD class box. Placing on a surface pushes this box out of it, so a door
   * stands on the floor instead of sinking to its middle.
   */
  const placementBox = (cls: string, model: string | null, yaw = 0): Box3 => {
    const data = model && cls.startsWith("prop_") ? modelCache.current.get(`${model}|0|0`) : null;
    if (data) {
      const r = (yaw * Math.PI) / 180;
      const c = Math.cos(r);
      const sn = Math.sin(r);
      const lo: Vec3 = [Infinity, Infinity, data.mins[2]];
      const hi: Vec3 = [-Infinity, -Infinity, data.maxs[2]];
      for (const x of [data.mins[0], data.maxs[0]]) {
        for (const y of [data.mins[1], data.maxs[1]]) {
          const rx = x * c - y * sn;
          const ry = x * sn + y * c;
          lo[0] = Math.min(lo[0], rx);
          lo[1] = Math.min(lo[1], ry);
          hi[0] = Math.max(hi[0], rx);
          hi[1] = Math.max(hi[1], ry);
        }
      }
      return [lo, hi];
    }
    const info = classInfos.current.get(cls);
    return [info?.mins ?? [-8, -8, -8], info?.maxs ?? [8, 8, 8]];
  };
  /** The point on the surface's normal where `box` (around the origin) just touches the plane hit at `hit`. */
  const pushOutOfSurface = (hit: Vec3, n: Vec3, box: Box3): Vec3 => {
    let offset = 0;
    for (let k = 0; k < 3; k++) offset += Math.abs(n[k]) * (n[k] > 0 ? -box[0][k] : box[1][k]);
    return [hit[0] + n[0] * offset, hit[1] + n[1] * offset, hit[2] + n[2] * offset];
  };
  /** Where a dropped model or prefab lands in the 3D view: on the surface under the cursor (`box` pushed out of it), else 256 units ahead. */
  const dropOrigin3D = (map: LoadedMap, camera: FlyCamera, css: [number, number], w: number, h: number, info: PickInfo | null, box: Box3 | null): Vec3 => {
    const ray = mouseRay(camera.viewProjection(w / h), camera.position, css, w, h);
    if (info?.kind === "face") {
      const plane = map.doc.face_plane(info.solidId, info.sideId);
      if (plane.length === 4) {
        const n: Vec3 = [plane[0], plane[1], plane[2]];
        const hit = rayPlane(ray, n, plane[3]);
        if (hit) return box ? pushOutOfSurface(hit, n, box) : hit;
      }
    }
    return [ray.origin[0] + ray.dir[0] * 256, ray.origin[1] + ray.dir[1] * 256, ray.origin[2] + ray.dir[2] * 256];
  };
  /** Yaw of the model being dragged from the browser, turned by the wheel; reset at each drag. */
  const dragYaw = useRef(0);
  /** Where a drop lands in a 2D view: on the grid, the unseen axis from the selection centre (or 0). */
  const dropOrigin2D = (v2: View2D, ev: MouseEvent, sel: Box3 | null): Vec3 => {
    const world = v2.camera.cssToWorld(pointerCss(ev, v2.canvas));
    const origin: Vec3 = sel ? boxCenter(sel) : [0, 0, 0];
    origin[v2.camera.axes[0]] = v2.camera.snap(world[0]);
    origin[v2.camera.axes[1]] = v2.camera.snap(world[1]);
    return origin;
  };
  /**
   * While a model is dragged over a view its ghost already stands where the
   * drop would put it, so the cursor carries the prop through the scene.
   */
  const modelGhostBusy = useRef(false);
  const modelGhostNext = useRef<{ name: string; ev: MouseEvent } | null>(null);
  const clearModelGhost = useCallback(() => {
    session.current?.renderer.setGhostModel(null);
  }, []);
  const updateModelGhost = useCallback(
    async (name: string, ev: MouseEvent) => {
      if (modelGhostBusy.current) {
        modelGhostNext.current = { name, ev };
        return;
      }
      modelGhostBusy.current = true;
      const queue: React.MutableRefObject<{ name: string; ev: MouseEvent } | null> = modelGhostNext;
      try {
        do {
          modelGhostNext.current = null;
          const s = session.current;
          const map = current.current;
          const canvas = canvasRef.current;
          if (!s || !map || !canvas) return;
          const view = viewUnder(ev.clientX, ev.clientY);
          let origin: Vec3 | null = null;
          if (view === "3d") {
            const css = pointerCss(ev, canvas);
            const r = canvas.getBoundingClientRect();
            const id = await s.renderer.pick(s.camera, css[0], css[1]);
            const info = id === null ? null : pickInfo(map, id);
            await ensureModel(name, 0);
            origin = dropOrigin3D(map, s.camera, css, r.width, r.height, info, placementBox("prop_static", name, dragYaw.current));
          } else if (view) {
            const v2 = s.views[view];
            if (v2) origin = dropOrigin2D(v2, ev, selectionBoundsRef.current());
          }
          const key = origin ? await ensureModel(name, 0) : null;
          if (key && origin) s.renderer.setGhostModel(key, instanceMatrix(origin, [0, dragYaw.current, 0]));
          else s.renderer.setGhostModel(null);
          const next = queue.current;
          if (next) {
            name = next.name;
            ev = next.ev;
          }
        } while (queue.current);
      } finally {
        modelGhostBusy.current = false;
      }
    },
    [ensureModel],
  );
  /**
   * Drops an asset into a view: a material onto the face under the cursor
   * (Shift: the whole brush, Ctrl: its group), a model or prefab onto the
   * surface in 3D or onto the grid in a 2D view.
   */
  const dropAsset = useCallback(
    async (kind: AssetKind, name: string, ev: MouseEvent) => {
      const s = session.current;
      const map = current.current;
      const view = viewUnder(ev.clientX, ev.clientY);
      if (!s || !map || !view) return;
      const g = gridRef.current || 1;
      const prefab = kind === "prefab" ? (prefabsRef.current ?? []).find((p) => p.name === name) : null;
      if (kind === "prefab" && !prefab) return;
      if (view === "3d") {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const css = pointerCss(ev, canvas);
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const id = await s.renderer.pick(s.camera, css[0], css[1]);
        const info = id === null ? null : pickInfo(map, id);
        if (kind === "material") {
          if (info?.kind !== "face") {
            setStatusText(tr("Перетащите текстуру на грань браша в 3D-виде"));
            return;
          }
          setCurrentMaterial(name);
          const faces = facesForDrop(map, info, ev);
          await applyMaterial(faces);
          setStatusText(`${name} → ${ev.ctrlKey ? tr("группа брашей") : ev.shiftKey ? tr("браш") : tr("грань")}`);
          return;
        }
        if (kind === "model") await ensureModel(name, 0);
        const origin = dropOrigin3D(map, s.camera, css, w, h, info, kind === "model" ? placementBox("prop_static", name, dragYaw.current) : null);
        if (kind === "model") {
          setCurrentModel(name);
          setEntityClass("prop_static");
          await createEntityAt(origin.map((v) => Math.round(v * 100) / 100) as Vec3, dragYaw.current ? [["angles", `0 ${dragYaw.current} 0`]] : []);
        } else if (kind === "sound") {
          setEntityClass("ambient_generic");
          const id = await createEntityAt(origin.map((v) => Math.round(v / g) * g) as Vec3, soundKeys(name));
          if (id !== undefined) openSoundSetup(id, name);
        } else if (prefab) await insertPrefab(prefab, origin.map((v) => Math.round(v / g) * g) as Vec3);
        return;
      }
      // 2D: on the grid; the unseen axis comes from the selection centre (or 0).
      const v2 = s.views[view];
      if (!v2) return;
      if (kind === "material") {
        setStatusText(tr("Текстуру можно перетащить только на грань в 3D-виде"));
        return;
      }
      const origin = dropOrigin2D(v2, ev, selectionBounds());
      if (kind === "model") {
        setCurrentModel(name);
        setEntityClass("prop_static");
        await createEntityAt(origin, dragYaw.current ? [["angles", `0 ${dragYaw.current} 0`]] : []);
      } else if (kind === "sound") {
        setEntityClass("ambient_generic");
        const id = await createEntityAt(origin, soundKeys(name));
        if (id !== undefined) openSoundSetup(id, name);
      } else if (prefab) await insertPrefab(prefab, origin);
    },
    [applyMaterial, createEntityAt, ensureModel, insertPrefab, selectionBounds, setCurrentMaterial, setCurrentModel, setEntityClass, openSoundSetup],
  );
  const dropAssetRef = useRef(dropAsset);
  dropAssetRef.current = dropAsset;
  /** Panels call this on mousedown over a tile or row; the drag starts after a few pixels. */
  const startAssetDrag = useCallback(
    (kind: AssetKind, name: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // Pictures would otherwise start the browser's own drag, which swallows our mouse events.
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      let started = false;
      let lastEv: MouseEvent | null = null;
      dragYaw.current = 0;
      const move = (ev: MouseEvent) => {
        if (!started) {
          if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
          started = true;
        }
        ev.preventDefault();
        lastEv = ev;
        setAssetDrag({ kind, name, x: ev.clientX, y: ev.clientY, over: viewUnder(ev.clientX, ev.clientY), yaw: dragYaw.current });
        if (kind === "material") void updateMaterialPreview(name, ev);
        if (kind === "model") void updateModelGhost(name, ev);
      };
      // The wheel turns a dragged model about Z: 15° a notch, 5° with Shift.
      const wheel = (ev: WheelEvent) => {
        if (!started || kind !== "model") return;
        ev.preventDefault();
        const step = ev.shiftKey ? 5 : 15;
        dragYaw.current = (((dragYaw.current - Math.sign(ev.deltaY) * step) % 360) + 360) % 360;
        if (lastEv) move(lastEv);
      };
      const up = (ev: MouseEvent) => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
        window.removeEventListener("wheel", wheel);
        if (!started) return;
        setAssetDrag(null);
        void (async () => {
          // The preview edit goes away; the drop applies the material for real.
          matPreviewNext.current = null;
          modelGhostNext.current = null;
          while (matPreviewBusy.current || modelGhostBusy.current) await new Promise((r) => setTimeout(r, 10));
          await revertMaterialPreview();
          clearModelGhost();
          await dropAssetRef.current(kind, name, ev);
        })();
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
      window.addEventListener("wheel", wheel, { passive: false });
    },
    [clearModelGhost, revertMaterialPreview, updateMaterialPreview, updateModelGhost],
  );
  return { assetDrag, matPreview, revertMaterialPreview, updateMaterialPreview, placementBox, pushOutOfSurface, clearModelGhost, updateModelGhost, dropAssetRef, startAssetDrag };
}
