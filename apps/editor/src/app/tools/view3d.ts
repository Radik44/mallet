// The 3D view's mouse: hover, texture strokes, gizmo drags, click-select,
// and the grid step commands. A hook, so the callbacks keep their memoization.

import { useCallback, useRef } from "react";
import { pickScatter } from "../scatter";
import { CURSORS, cursorCss } from "../../ui/cursors";
import { SAT_ANY } from "../../ui/satellite";
import { api } from "../../tauri";
import { type FaceInfo } from "../../ui/FaceEditor";
import { pickInfo } from "../../map/loader";
import { axisParam, GIZMO_AXES, mouseRay, rayPlane, ringAngle } from "../../viewport/gizmo";
import { boxCenter, type Vec3 } from "../../viewport/transform";
import { canvasCss } from "../constants";
import { nextAlong, rayOrder } from "../pickCycle";
import { instanceMatrix } from "../../viewport/models";
import type { EditorApi } from "../editorApi";
import { t } from "../../i18n";

export function useView3DTools(
  e: Pick<
    EditorApi,
    | "session"
    | "current"
    | "selection"
    | "pressed"
    | "hoverPending"
    | "activeView"
    | "toolRef"
    | "gridRef"
    | "handleMode"
    | "setHandleMode"
    | "liveLabel"
    | "gizmo"
    | "faceSel"
    | "entityClassRef"
    | "busy"
    | "setHover"
    | "setGridSize"
    | "tool"
    | "paintClickRef"
    | "setStatusText"
    | "paintRef"
    | "painting"
    | "currentModelRef"
    | "withGroup"
    | "setCurrentMaterial"
    | "refreshFaces"
    | "clearFaces"
    | "applySelection"
    | "selectedIndices"
    | "ensureModel"
    | "commitTranslate"
    | "commitRotate"
    | "commitScale"
    | "paintAt"
    | "faceHit"
    | "applyMaterial"
    | "createEntityAt"
    | "finishPickTarget"
    | "selectionBounds"
    | "selectionEdges"
    | "showTransformPreview"
    | "placementBox"
    | "pushOutOfSurface"
    | "gizmoAxisAt"
    | "updateGizmoDrag"
    | "landscapeHit"
    | "sculptAt"
    | "showBrush"
    | "sculpting"
    | "landscapeRef"
    | "scatterRef"
    | "mergeUndo"
    | "measureRef"
    | "setMeasure"
    | "selectIds"
    | "objectBounds"
  >,
) {
  /** Where a gizmo drag was pressed: released without moving it is a click. */
  const gizmoPress = useRef<{ x: number; y: number } | null>(null);
  /** The last plain 3D click, for picking what is behind on the next one. */
  const cycleRef = useRef<{ x: number; y: number; cam: string; id: number } | null>(null);
  const {
    objectBounds,
    session,
    current,
    selection,
    pressed,
    hoverPending,
    activeView,
    toolRef,
    gridRef,
    handleMode,
    setHandleMode,
    liveLabel,
    gizmo,
    faceSel,
    entityClassRef,
    setHover,
    paintClickRef,
    setStatusText,
    paintRef,
    painting,
    currentModelRef,
    withGroup,
    setCurrentMaterial,
    refreshFaces,
    clearFaces,
    applySelection,
    selectedIndices,
    ensureModel,
    commitTranslate,
    commitRotate,
    commitScale,
    paintAt,
    faceHit,
    applyMaterial,
    createEntityAt,
    finishPickTarget,
    selectionBounds,
    selectionEdges,
    showTransformPreview,
    placementBox,
    pushOutOfSurface,
    gizmoAxisAt,
    updateGizmoDrag,
    landscapeHit,
    sculptAt,
    showBrush,
    sculpting,
    landscapeRef,
    scatterRef,
    mergeUndo,
    measureRef,
    setMeasure,
    selectIds,
  } = e;

  // ---- Placing props: a ghost follows the cursor; the left button held and
  // dragged turns the prop to face the drag and lays a row of copies along it,
  // the wheel sets the gap. Released, the row becomes entities.
  const placeYaw = useRef(0);
  const placeGap = useRef(0);
  const ghostBusy = useRef(false);
  const ghostShown = useRef(false);
  const placeToken = useRef(0);
  const placeReleased = useRef(0);
  /** Where the cursor was last seen, for a row that starts after the cursor already moved. */
  const lastMove = useRef<{ css: [number, number]; w: number; h: number } | null>(null);
  const place = useRef<{
    model: string;
    key: string;
    cls: string;
    anchor: Vec3;
    n: Vec3;
    d: number;
    offset: Vec3;
    yaw: number;
    count: number;
    last: { css: [number, number]; w: number; h: number };
  } | null>(null);
  const isPlacing = () => toolRef.current === "entity" && entityClassRef.current.trim().startsWith("prop_") && !!currentModelRef.current;
  /** Where the cursor's ray meets a face: the point, the face normal and plane distance. */
  const faceUnderCursor = useCallback(async (css: [number, number], w: number, h: number): Promise<{ hit: Vec3; n: Vec3; d: number } | null> => {
    const s = session.current;
    const map = current.current;
    if (!s || !map) return null;
    const id = await s.renderer.pick(s.camera, css[0], css[1]);
    const info = id === null ? null : pickInfo(map, id);
    if (info?.kind !== "face") return null;
    const plane = map.doc.face_plane(info.solidId, info.sideId);
    if (plane.length !== 4) return null;
    const n: Vec3 = [plane[0], plane[1], plane[2]];
    const hit = rayPlane(mouseRay(s.camera.viewProjection(w / h), s.camera.position, css, w, h), n, plane[3]);
    return hit ? { hit, n, d: plane[3] } : null;
  }, []);
  const clearGhost = useCallback(() => {
    if (ghostShown.current) session.current?.renderer.setGhostModels(null, []);
    ghostShown.current = false;
  }, []);
  /** The hover ghost: one copy under the cursor with the last yaw. */
  const showPlaceGhost = useCallback(
    async (css: [number, number], w: number, h: number) => {
      if (ghostBusy.current) return;
      ghostBusy.current = true;
      try {
        const s = session.current;
        const model = currentModelRef.current;
        const cls = entityClassRef.current.trim();
        if (!s || !model) return;
        const face = await faceUnderCursor(css, w, h);
        if (!face || !isPlacing()) {
          clearGhost();
          return;
        }
        const key = await ensureModel(model, 0);
        if (!key) return;
        const origin = pushOutOfSurface(face.hit, face.n, placementBox(cls, model, placeYaw.current));
        s.renderer.setGhostModels(key, [instanceMatrix(origin, [0, placeYaw.current, 0])]);
        ghostShown.current = true;
      } finally {
        ghostBusy.current = false;
      }
    },
    [clearGhost, ensureModel, faceUnderCursor, placementBox, pushOutOfSurface],
  );
  /** The row for the current drag: direction, yaw, count from the distance, gap from the wheel. */
  const rowOrigins = (p: NonNullable<typeof place.current>, css: [number, number], w: number, h: number): { origins: Vec3[]; yaw: number } => {
    const s = session.current!;
    const cur = rayPlane(mouseRay(s.camera.viewProjection(w / h), s.camera.position, css, w, h), p.n, p.d);
    let yaw = p.yaw;
    let origins: Vec3[] = [[p.anchor[0] + p.offset[0], p.anchor[1] + p.offset[1], p.anchor[2] + p.offset[2]]];
    if (cur) {
      const v: Vec3 = [cur[0] - p.anchor[0], cur[1] - p.anchor[1], cur[2] - p.anchor[2]];
      const along = v[0] * p.n[0] + v[1] * p.n[1] + v[2] * p.n[2];
      const flat: Vec3 = [v[0] - p.n[0] * along, v[1] - p.n[1] * along, v[2] - p.n[2] * along];
      const len = Math.hypot(flat[0], flat[1], flat[2]);
      if (len > 6) {
        yaw = ((Math.atan2(flat[1], flat[0]) * 180) / Math.PI + 360) % 360;
        yaw = Math.round(yaw / 5) * 5;
        const box = placementBox(p.cls, p.model, 0);
        const length = Math.max(8, box[1][0] - box[0][0]);
        const step = length + placeGap.current;
        const count = Math.max(1, Math.min(64, 1 + Math.floor(len / step)));
        const dir: Vec3 = [flat[0] / len, flat[1] / len, flat[2] / len];
        origins = [];
        for (let i = 0; i < count; i++) origins.push([p.anchor[0] + p.offset[0] + dir[0] * step * i, p.anchor[1] + p.offset[1] + dir[1] * step * i, p.anchor[2] + p.offset[2] + dir[2] * step * i]);
      }
    }
    return { origins, yaw };
  };
  const updateRow = useCallback(
    (css: [number, number], w: number, h: number) => {
      const p = place.current;
      const s = session.current;
      if (!p || !s) return;
      p.last = { css, w, h };
      const { origins, yaw } = rowOrigins(p, css, w, h);
      p.yaw = yaw;
      p.count = origins.length;
      s.renderer.setGhostModels(
        p.key,
        origins.map((o) => instanceMatrix(o, [0, yaw, 0])),
      );
      ghostShown.current = true;
      setStatusText(
        origins.length > 1
          ? t("ряд: {0} × {1}, поворот {2}°, зазор {3} (колесо)", [origins.length, p.model.replace(/^.*\//, ""), Math.round(yaw), placeGap.current])
          : t("поворот {0}°; продолжайте тянуть, чтобы выложить ряд", [Math.round(yaw)]),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placementBox, setStatusText],
  );
  const finishRow = useCallback(async () => {
    const p = place.current;
    const s = session.current;
    place.current = null;
    if (s) s.camera.wheelHook = null;
    clearGhost();
    if (!p || !s) return;
    const { origins, yaw } = rowOrigins(p, p.last.css, p.last.w, p.last.h);
    placeYaw.current = yaw;
    const ids: number[] = [];
    for (const o of origins) {
      const id = await createEntityAt(o.map((v) => Math.round(v * 100) / 100) as Vec3, yaw ? [["angles", `0 ${yaw} 0`]] : []);
      if (id !== undefined) ids.push(id);
    }
    if (ids.length) {
      mergeUndo(ids.length, t("Ряд: {0} × {1}", [ids.length, p.model.replace(/^.*\//, "")]));
      selectIds(ids);
      applySelection();
    }
    setStatusText(ids.length > 1 ? t("размещён ряд: {0} × {1}", [ids.length, p.model.replace(/^.*\//, "")]) : t("размещён {0}", [p.model.replace(/^.*\//, "")]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applySelection, clearGhost, createEntityAt, mergeUndo, selectIds, setStatusText]);
  // ---- The prop brush: the button held scatters models over the surface, the spacing kept.
  const scatterStroke = useRef<{ placed: Vec3[]; ids: number[]; busy: boolean } | null>(null);
  const scatterAt = useCallback(
    async (css: [number, number], w: number, h: number) => {
      const st = scatterStroke.current;
      if (!st || st.busy) return;
      st.busy = true;
      try {
        const face = await faceUnderCursor(css, w, h);
        if (!face || !scatterStroke.current) return;
        const pick = pickScatter(scatterRef.current, face.hit, st.placed, currentModelRef.current);
        if (!pick) return;
        const cls = entityClassRef.current.trim();
        const origin = pushOutOfSurface(face.hit, face.n, placementBox(cls, pick.model, pick.yaw));
        st.placed.push(face.hit);
        const id = await createEntityAt(origin.map((v) => Math.round(v * 100) / 100) as Vec3, [["model", pick.model], ...(pick.yaw ? [["angles", `0 ${pick.yaw} 0`] as [string, string]] : [])]);
        if (id !== undefined) st.ids.push(id);
        setStatusText(t("кисть: {0} × {1} моделей, шаг {2}", [st.ids.length, scatterRef.current.models.length || 1, scatterRef.current.spacing]));
      } finally {
        if (scatterStroke.current) scatterStroke.current.busy = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createEntityAt, faceUnderCursor, placementBox, pushOutOfSurface, setStatusText],
  );
  const finishScatter = useCallback(() => {
    const st = scatterStroke.current;
    scatterStroke.current = null;
    if (!st) return;
    if (st.ids.length) {
      mergeUndo(st.ids.length, t("Кисть: {0} пропов", [st.ids.length]));
      selectIds(st.ids);
      applySelection();
    }
    setStatusText(st.ids.length ? t("кисть: размещено {0}", [st.ids.length]) : t("кисть: ничего не размещено - ведите курсором по поверхности"));
  }, [applySelection, mergeUndo, selectIds, setStatusText]);
  /** Texture tool, left button held and moved: every face the cursor crosses gets the current material once. */
  const texStroke = useRef<{ done: Set<string>; busy: boolean } | null>(null);
  const paintStroke = useCallback(
    async (css: [number, number], wholeBrush: boolean) => {
      const s = session.current;
      const map = current.current;
      if (!s || !map) return;
      const stroke = (texStroke.current ??= { done: new Set(), busy: false });
      if (stroke.busy) return;
      stroke.busy = true;
      try {
        const id = await s.renderer.pick(s.camera, css[0], css[1]);
        const info = id === null ? null : pickInfo(map, id);
        if (info?.kind !== "face") return;
        const faces = (wholeBrush ? Array.from(map.doc.solid_sides(info.solidId)).map((side) => [info.solidId, side] as [number, number]) : [[info.solidId, info.sideId] as [number, number]]).filter(
          ([solid, side]) => !stroke.done.has(`${solid}:${side}`),
        );
        if (!faces.length) return;
        for (const [solid, side] of faces) stroke.done.add(`${solid}:${side}`);
        await applyMaterial(faces.flat());
      } finally {
        stroke.busy = false;
      }
    },
    [applyMaterial],
  );
  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (document.pointerLockElement || document.documentElement.classList.contains("look-capture")) return;
      const { css, w, h } = canvasCss(e);
      lastMove.current = { css, w, h };
      if (scatterStroke.current) {
        if (e.buttons & 1) {
          void scatterAt(css, w, h);
          e.currentTarget.style.cursor = CURSORS.row;
          return;
        }
        finishScatter();
        return;
      }
      if (place.current) {
        if (e.buttons & 1) {
          updateRow(css, w, h);
          e.currentTarget.style.cursor = CURSORS.row;
          return;
        }
        void finishRow();
        return;
      }
      if (isPlacing()) {
        void showPlaceGhost(css, w, h);
        e.currentTarget.style.cursor = CURSORS.place;
        return;
      } else if (ghostShown.current) clearGhost();
      if (toolRef.current === "texture" && pressed.current && !paintRef.current.on && !e.altKey) {
        if (Math.hypot(e.clientX - pressed.current.x, e.clientY - pressed.current.y) > 4) {
          e.currentTarget.style.cursor = CURSORS.texture;
          void paintStroke(css, e.shiftKey);
          return;
        }
      }
      if (toolRef.current === "landscape") {
        const hit = landscapeHit(css, w, h);
        const stroke = sculpting.current;
        if (stroke && e.buttons & 1) {
          if (hit && hit.disp) {
            const d = Math.hypot(hit.point[0] - stroke.last[0], hit.point[1] - stroke.last[1], hit.point[2] - stroke.last[2]);
            if (d >= landscapeRef.current.radius / 4) {
              stroke.last = hit.point;
              void sculptAt(hit.point, stroke.lower, true, stroke.height, { solidId: hit.solidId, sideId: hit.sideId });
            }
          }
        } else if (stroke) sculpting.current = null;
        showBrush(hit ? hit.point : null, hit?.normal);
        e.currentTarget.style.cursor = hit?.disp ? "" : CURSORS.pick;
        return;
      }
      const stroke = painting.current;
      if (stroke) {
        if (!(e.buttons & 1)) {
          painting.current = null;
          return;
        }
        const at = faceHit(css, w, h, stroke.pickId);
        if (!at) return;
        // Dab again once the brush moved a quarter of its radius.
        const d = Math.hypot(at[0] - stroke.last[0], at[1] - stroke.last[1], at[2] - stroke.last[2]);
        if (d < paintRef.current.radius / 4) return;
        stroke.last = at;
        void paintAt(stroke.solid, stroke.side, at, stroke.lower, true);
        return;
      }
      const g = gizmo.current;
      if (g.drag) {
        updateGizmoDrag(css, w, h, e);
        return;
      }
      g.hover = gizmoAxisAt(css, w, h);
      // Over the gizmo: the cursor of the mode. Otherwise the arrow over an object (set by the pick) stays, the rest inherits the tool's cursor.
      const keep = toolRef.current === "select" && e.currentTarget.style.cursor === CURSORS.pointer;
      e.currentTarget.style.cursor = g.hover !== null ? cursorCss(handleMode.current === "rotate" ? "rotate" : handleMode.current === "scale" ? "scale" : "move") : keep ? CURSORS.pointer : "";
      hoverPending.current = g.hover !== null ? null : { x: css[0], y: css[1] };
    },
    [faceHit, gizmoAxisAt, paintAt, paintStroke, updateGizmoDrag, updateRow, finishRow, showPlaceGhost, clearGhost, scatterAt, finishScatter],
  );
  const onMouseLeave = useCallback(() => {
    hoverPending.current = null;
    if (place.current) {
      place.current = null;
      if (session.current) session.current.camera.wheelHook = null;
    }
    clearGhost();
    sculpting.current = null;
    showBrush(null);
    gizmo.current.hover = null;
    session.current?.renderer.setHover(null);
    setHover(null);
  }, [clearGhost]);
  const onMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      activeView.current = null;
      if (e.button !== 0 || SAT_ANY) return;
      const s = session.current;
      const g = gizmo.current;
      const { css, w, h } = canvasCss(e);
      if (toolRef.current === "landscape" && s && current.current) {
        // The landscape brush: the press starts a stroke on the displacement under the cursor.
        e.preventDefault();
        const hit = landscapeHit(css, w, h);
        if (!hit || !hit.disp) {
          setStatusText(
            hit
              ? t("грань {0} браша {1} без дисплейсмента: кисть работает только с дисплейсментами (создать участок - «Ландшафт…» в контекстной строке)", [hit.sideId, hit.solidId])
              : t("кисть ландшафта: наведите курсор на дисплейсмент"),
          );
          return;
        }
        sculpting.current = { last: hit.point, lower: e.ctrlKey, height: hit.point[2] };
        void sculptAt(hit.point, e.ctrlKey, false, hit.point[2], { solidId: hit.solidId, sideId: hit.sideId });
        return;
      }
      if (toolRef.current === "texture" && paintRef.current.on && s && current.current && !e.altKey) {
        // Sculpt mode: the press starts a stroke on a displacement face.
        e.preventDefault();
        void s.renderer.pick(s.camera, css[0], css[1]).then((id) => {
          const map = current.current;
          if (id === null || !map) return;
          const info = pickInfo(map, id);
          if (info?.kind !== "face") return;
          const fi = map.doc.face_info(info.solidId, info.sideId) as FaceInfo | undefined;
          if (!fi || fi.disp_power === 0) {
            setStatusText(t("грань {0} браша {1} без дисплейсмента", [info.sideId, info.solidId]));
            return;
          }
          const at = faceHit(css, w, h, id);
          if (!at) {
            void api.log(`paint: ray misses face ${id} (${info.solidId}:${info.sideId})`);
            return;
          }
          painting.current = { solid: info.solidId, side: info.sideId, pickId: id, last: at, lower: e.ctrlKey };
          void paintAt(info.solidId, info.sideId, at, e.ctrlKey, false);
        });
        return;
      }
      if (toolRef.current === "measure" && e.button === 0) {
        // First click sets the start, the second the end; a third starts over.
        e.preventDefault();
        void faceUnderCursor(css, w, h).then((face) => {
          if (!face) return;
          const p = face.hit.map((v) => Math.round(v * 10) / 10) as Vec3;
          const m = measureRef.current;
          if (!m || m.a[0] !== m.b[0] || m.a[1] !== m.b[1] || m.a[2] !== m.b[2]) setMeasure({ a: p, b: p });
          else setMeasure({ a: m.a, b: p });
        });
        return;
      }
      if (toolRef.current === "entity" && isPlacing() && s && current.current && scatterRef.current.on) {
        e.preventDefault();
        clearGhost();
        scatterStroke.current = { placed: [], ids: [], busy: false };
        void scatterAt(css, w, h);
        return;
      }
      if (toolRef.current === "entity" && isPlacing() && s && current.current) {
        // A prop: the press starts a row; a release before the pick returns is a plain click (see onMouseUp).
        e.preventDefault();
        const token = ++placeToken.current;
        void (async () => {
          const face = await faceUnderCursor(css, w, h);
          const model = currentModelRef.current;
          const cls = entityClassRef.current.trim();
          if (!face || !model || placeReleased.current === token || placeToken.current !== token) return;
          const key = await ensureModel(model, 0);
          if (!key || placeReleased.current === token || placeToken.current !== token) return;
          const yaw = placeYaw.current;
          const origin = pushOutOfSurface(face.hit, face.n, placementBox(cls, model, yaw));
          place.current = {
            model,
            key,
            cls,
            anchor: face.hit,
            n: face.n,
            d: face.d,
            offset: [origin[0] - face.hit[0], origin[1] - face.hit[1], origin[2] - face.hit[2]],
            yaw,
            count: 1,
            last: { css, w, h },
          };
          s.camera.wheelHook = (ev: WheelEvent) => {
            const p = place.current;
            if (!p) return false;
            const step = Math.max(1, gridRef.current);
            placeGap.current = Math.max(-64, Math.min(1024, placeGap.current - Math.sign(ev.deltaY) * step));
            updateRow(p.last.css, p.last.w, p.last.h);
            return true;
          };
          const at = lastMove.current ?? { css, w, h };
          updateRow(at.css, at.w, at.h);
        })();
        return;
      }
      const axis = gizmoAxisAt(css, w, h);
      if (s && axis !== null) {
        const bounds = selectionBounds();
        const mode = handleMode.current;
        const viewProj = s.camera.viewProjection(w / h);
        const t0 = !bounds
          ? null
          : mode === "rotate"
            ? ringAngle(viewProj, s.camera.position, axis, boxCenter(bounds), css, w, h)
            : axisParam(viewProj, s.camera.position, axis, boxCenter(bounds), css, w, h);
        if (t0 !== null && bounds) {
          g.hover = axis;
          gizmoPress.current = { x: e.clientX, y: e.clientY };
          g.drag = { mode, axis, t0, objects: selectedIndices(), delta: [0, 0, 0], bounds, edges: mode === "move" ? new Float32Array(0) : selectionEdges(), degrees: 0, factors: [1, 1, 1] };
          e.preventDefault();
          return;
        }
      }
      pressed.current = { x: e.clientX, y: e.clientY };
    },
    [faceHit, gizmoAxisAt, paintAt, selectedIndices, selectionBounds, faceUnderCursor, ensureModel, placementBox, pushOutOfSurface, updateRow],
  );
  const onMouseUp = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (sculpting.current) {
        sculpting.current = null;
        return;
      }
      if (scatterStroke.current && e.button === 0) {
        pressed.current = null;
        finishScatter();
        return;
      }
      if (place.current && e.button === 0) {
        pressed.current = null;
        await finishRow();
        return;
      }
      if (e.button === 0 && isPlacing()) placeReleased.current = placeToken.current;
      const s = session.current;
      const g = gizmo.current;
      if (e.button === 0 && painting.current) {
        painting.current = null;
        return;
      }
      if (e.button === 0 && g.drag) {
        const press = gizmoPress.current;
        gizmoPress.current = null;
        // A press on the gizmo released without moving is a plain click: it selects, or picks what is behind.
        const still = !!press && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 4;
        const { css, w, h } = canvasCss(e);
        if (!still) updateGizmoDrag(css, w, h, e);
        const d = g.drag;
        g.drag = null;
        liveLabel.current = "";
        s?.renderer.setPreview([], [0, 0, 0]);
        showTransformPreview(null, null);
        if (!still) {
          if (d.mode === "rotate") await commitRotate(selection.current, boxCenter(d.bounds), GIZMO_AXES[d.axis], d.degrees);
          else if (d.mode === "scale") await commitScale(selection.current, boxCenter(d.bounds), d.factors);
          else await commitTranslate(selection.current, d.delta);
          return;
        }
        pressed.current = press;
      }
      const start = pressed.current;
      pressed.current = null;
      const painted = !!texStroke.current?.done.size;
      texStroke.current = null;
      e.currentTarget.style.cursor = "";
      if (e.button !== 0 || !s || !start || !current.current) return;
      if (painted || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) return;
      const { css, w, h } = canvasCss(e);
      const id = await s.renderer.pick(s.camera, css[0], css[1]);
      const info = id === null ? null : pickInfo(current.current, id);
      const tool = toolRef.current;
      if (tool === "texture") {
        if (info?.kind !== "face") {
          if (!e.ctrlKey) clearFaces();
          return;
        }
        if (e.altKey) {
          // Eyedropper: take the material from the face.
          setCurrentMaterial(info.material);
          return;
        }
        if (paintClickRef.current) {
          // Paint mode (double click on a texture tile): a click paints the face, Shift the brush.
          const faces = e.shiftKey ? Array.from(current.current.doc.solid_sides(info.solidId)).flatMap((side) => [info.solidId, side]) : [info.solidId, info.sideId];
          await applyMaterial(faces);
          return;
        }
        // Like Hammer's face edit: click picks a face, Shift the whole brush, Ctrl adds or removes.
        const picked: [number, number][] = e.shiftKey
          ? Array.from(current.current.doc.solid_sides(info.solidId)).map((side) => [info.solidId, side] as [number, number])
          : [[info.solidId, info.sideId]];
        if (!e.ctrlKey) faceSel.current.clear();
        for (const [solid, side] of picked) {
          const key = `${solid}:${side}`;
          if (e.ctrlKey && picked.length === 1 && faceSel.current.has(key)) faceSel.current.delete(key);
          else faceSel.current.set(key, [solid, side]);
        }
        refreshFaces();
        return;
      }
      if (tool === "entity") {
        if (info?.kind !== "face") return;
        const plane = current.current.doc.face_plane(info.solidId, info.sideId);
        if (plane.length !== 4) return;
        const n: Vec3 = [plane[0], plane[1], plane[2]];
        const hit = rayPlane(mouseRay(s.camera.viewProjection(w / h), s.camera.position, css, w, h), n, plane[3]);
        if (!hit) return;
        // Push the entity's box out of the surface, as Hammer does; a prop uses its model's real box.
        const cls = entityClassRef.current.trim();
        const model = currentModelRef.current;
        if (model && cls.startsWith("prop_")) await ensureModel(model, 0);
        const yaw = model && cls.startsWith("prop_") ? placeYaw.current : 0;
        const origin = pushOutOfSurface(hit, n, placementBox(cls, model, yaw));
        await createEntityAt(origin.map((v) => Math.round(v * 100) / 100) as Vec3, yaw ? [["angles", `0 ${yaw} 0`]] : []);
        return;
      }
      let hitId = info ? (info.kind === "face" ? info.solidId : info.entity.id) : null;
      // A second plain click on the same spot, the camera still, picks the next object behind (Blender, Unity).
      const camKey = `${Array.from(s.camera.position, (v) => v.toFixed(1)).join(",")}|${s.camera.yaw.toFixed(2)}|${s.camera.pitch.toFixed(2)}`;
      const last = cycleRef.current;
      if (!e.shiftKey && !e.ctrlKey && hitId !== null && last && last.cam === camKey && Math.hypot(css[0] - last.x, css[1] - last.y) <= 4 && selection.current.has(last.id)) {
        const map = current.current;
        const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
        const boxes: { id: number; box: [Vec3, Vec3] }[] = [];
        const solids = map.mesh.solidIds.length;
        for (let idx = 0; idx < solids + map.pointEntities.length; idx++) {
          const id = idx < solids ? map.mesh.solidIds[idx] : map.pointEntities[idx - solids].id;
          if (hidden.has(map.doc.entity_of_solid(id) || id)) continue;
          const b = objectBounds(map, idx);
          if (b) boxes.push({ id, box: b as [Vec3, Vec3] });
        }
        const ray = mouseRay(s.camera.viewProjection(w / h), s.camera.position, css, w, h);
        const order = rayOrder(ray.origin, ray.dir, boxes);
        const next = nextAlong(order, last.id);
        if (next !== null && next !== last.id) {
          hitId = next;
          setStatusText(t("объект за выделенным: {0} из {1} под курсором · ещё щелчок - следующий", [order.indexOf(next) + 1, order.length]));
        } else setStatusText(t("за выделенным под курсором больше ничего нет (объектов на луче: {0})", [order.length]));
      }
      cycleRef.current = hitId !== null ? { x: css[0], y: css[1], cam: camKey, id: hitId } : null;
      if (finishPickTarget(hitId)) return;
      if (!e.shiftKey && !e.ctrlKey) {
        selection.current.clear();
        setHandleMode("move");
      }
      if (hitId !== null) {
        const ids = withGroup(hitId);
        if (e.ctrlKey && selection.current.has(hitId)) for (const i of ids) selection.current.delete(i);
        else for (const i of ids) selection.current.add(i);
      }
      applySelection();
    },
    [applyMaterial, applySelection, clearFaces, commitTranslate, createEntityAt, refreshFaces, setCurrentMaterial, updateGizmoDrag, withGroup, objectBounds, setStatusText],
  );

  return { onMouseMove, onMouseLeave, onMouseDown, onMouseUp };
}
