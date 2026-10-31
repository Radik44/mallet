// The 2D views' mouse: select and marquee, move with cloning and docking to
// neighbours, scale and rotate handles, vertex drags, the block, cordon,
// clip and overlay tools. Moved out of the renderer session whole.

import { SAT_ANY, type DocMessage } from "../../ui/satellite";
import { overlayUvFor } from "../../viewport/overlays";
import { previewMovedEdges, vertexMoves } from "../../viewport/vertices";
import { type EditResult } from "../../map/loader";
import { OrthoCamera, type OrthoHandlers } from "../../viewport/camera2d";
import { NOTE_HIT_RADIUS, handleCursor, hitHandle, nextMode } from "../../viewport/handles";
import { boxEdges } from "../../viewport/renderer";
import { applyAffine, boxCenter, rotationAbout, scalingAbout, translation, type Vec3 } from "../../viewport/transform";
import { VIEW_KINDS, PREVIEW_COLOR } from "../constants";
import type { EditorApi } from "../editorApi";
import { t } from "../../i18n";
import { heldKeys } from "./keyboard";

export function createOrthoHandlers(
  e: Pick<
    EditorApi,
    | "session"
    | "current"
    | "satChannelRef"
    | "selection"
    | "activeView"
    | "drag"
    | "toolRef"
    | "handleMode"
    | "setHandleMode"
    | "handleHover"
    | "liveBounds"
    | "liveLabel"
    | "pressedCss"
    | "pendingBox"
    | "blockStart"
    | "blockEdit"
    | "pendingAxis"
    | "cordonStart"
    | "clipLineRef"
    | "measureRef"
    | "setMeasure"
    | "vertexHandles"
    | "vertexHover"
    | "setError"
    | "lockedViewsRef"
    | "withGroup"
    | "pickTargetRef"
    | "applySelection"
    | "selectedIndices"
    | "selectIds"
    | "setPendingBox"
    | "setClipLine"
    | "setTool"
    | "moveStep"
    | "dockToNeighbours"
    | "snapToVertex"
    | "vertexSnapMarker"
    | "projectMetaRef"
    | "goToPoint"
    | "setPanel"
    | "refreshCordon"
    | "applyEdit"
    | "commitTranslate"
    | "commitRotate"
    | "commitScale"
    | "runEdit"
    | "cloneSelection"
    | "createEntityAt"
    | "selectedOverlay"
    | "finishPickTarget"
    | "propsOnlyFactors"
    | "selectionBounds"
    | "ensureVertexHandles"
    | "vertexHandleAt"
    | "selectionEdges"
    | "hitTest2D"
    | "idOf"
    | "objectsInRect"
    | "cordonFromRect"
    | "boxFromRect"
    | "resizeBoxByHandle"
    | "scaleFromHandle"
    | "viewAxisVector"
    | "showTransformPreview"
  >,
  setCursor: (view: OrthoCamera, cursor: string) => void,
): OrthoHandlers {
  const {
    session,
    current,
    satChannelRef,
    selection,
    activeView,
    drag,
    toolRef,
    handleMode,
    setHandleMode,
    handleHover,
    liveBounds,
    liveLabel,
    pressedCss,
    pendingBox,
    blockStart,
    blockEdit,
    pendingAxis,
    cordonStart,
    clipLineRef,
    measureRef,
    setMeasure,
    vertexHandles,
    vertexHover,
    setError,
    lockedViewsRef,
    withGroup,
    pickTargetRef,
    applySelection,
    selectedIndices,
    selectIds,
    setPendingBox,
    setClipLine,
    setTool,
    moveStep,
    dockToNeighbours,
    snapToVertex,
    vertexSnapMarker,
    projectMetaRef,
    goToPoint,
    setPanel,
    refreshCordon,
    applyEdit,
    commitTranslate,
    commitRotate,
    commitScale,
    runEdit,
    cloneSelection,
    createEntityAt,
    selectedOverlay,
    finishPickTarget,
    propsOnlyFactors,
    selectionBounds,
    ensureVertexHandles,
    vertexHandleAt,
    selectionEdges,
    hitTest2D,
    idOf,
    objectsInRect,
    cordonFromRect,
    boxFromRect,
    resizeBoxByHandle,
    scaleFromHandle,
    viewAxisVector,
    showTransformPreview,
  } = e;
  return {
    enter: (view) => {
      activeView.current = view;
    },
    zoomed: (view) => {
      const s = session.current;
      if (!s || lockedViewsRef.current.includes(view.kind)) return;
      for (const kind of VIEW_KINDS) {
        const v = s.views[kind];
        if (v && v.camera !== view && !lockedViewsRef.current.includes(kind)) v.camera.unitsPerPixel = view.unitsPerPixel;
      }
      // The other windows follow too, unless their view is locked.
      satChannelRef.current?.postMessage({ type: "zoom", upp: view.unitsPerPixel } satisfies DocMessage);
    },
    hover: (view, css) => {
      if (toolRef.current === "vertex" && selection.current.size) {
        ensureVertexHandles();
        const i = vertexHandleAt(view, css);
        vertexHover.current = i === null ? null : { view: view.kind, index: i };
        setCursor(view, i === null ? "" : "pointer");
        return;
      }
      if (toolRef.current === "block" && pendingBox.current) {
        const box = pendingBox.current;
        const h = hitHandle(view, box, "scale", css);
        handleHover.current = h ? { view: view.kind, handle: h } : null;
        const w = view.cssToWorld(css);
        const [ax, ay] = view.axes;
        const inside = w[0] >= box[0][ax] && w[0] <= box[1][ax] && w[1] >= box[0][ay] && w[1] <= box[1][ay];
        setCursor(view, h ? handleCursor(h) : inside ? "move" : "crosshair");
        return;
      }
      if (toolRef.current !== "select" || !selection.current.size) {
        handleHover.current = null;
        setCursor(view, "");
        return;
      }
      const bounds = selectionBounds();
      const h = bounds ? hitHandle(view, bounds, handleMode.current, css) : null;
      handleHover.current = h ? { view: view.kind, handle: h } : null;
      setCursor(view, handleCursor(h));
    },
    dblclick: (view, world) => {
      // Any tool: a double click grabs the object and goes to moving it.
      if (SAT_ANY) return;
      const map = current.current;
      if (!map) return;
      const hit = hitTest2D(view, world);
      const id = hit === null ? null : idOf(map, hit);
      if (id === null) return;
      if (toolRef.current !== "select") setTool("select");
      selection.current = new Set(withGroup(id));
      setHandleMode("move");
      applySelection();
    },
    press: (view, world, e) => {
      if (SAT_ANY) return false;
      const map = current.current;
      if (!map) return false;
      if (toolRef.current === "block") {
        const box = pendingBox.current;
        if (box) {
          // A handle resizes the box, its inside moves it; only outside starts a new one.
          const h = hitHandle(view, box, "scale", view.eventToCss(e));
          if (h && h.kind === "scale") {
            blockEdit.current = { kind: "resize", handle: h, bounds: box };
            return true;
          }
          const [ax, ay] = view.axes;
          if (world[0] >= box[0][ax] && world[0] <= box[1][ax] && world[1] >= box[0][ay] && world[1] <= box[1][ay]) {
            blockEdit.current = { kind: "move", start: world, bounds: box };
            return true;
          }
        }
        blockStart.current = world;
        setPendingBox(null);
        return true;
      }
      if (toolRef.current === "cordon") {
        cordonStart.current = world;
        return true;
      }
      if (toolRef.current === "clip") {
        const a: [number, number] = [view.snap(world[0]), view.snap(world[1])];
        setClipLine({ axes: view.axes, a, b: a });
        return true;
      }
      if (toolRef.current === "measure") {
        const sel = selectionBounds();
        const a: Vec3 = sel ? boxCenter(sel) : [0, 0, 0];
        a[view.axes[0]] = view.snap(world[0]);
        a[view.axes[1]] = view.snap(world[1]);
        setMeasure({ a, b: [...a] as Vec3 });
        return true;
      }
      if (toolRef.current === "entity") {
        // Place on the grid; the unseen axis comes from the selection centre (or 0).
        const sel = selectionBounds();
        const origin: Vec3 = sel ? boxCenter(sel) : [0, 0, 0];
        origin[view.axes[0]] = view.snap(world[0]);
        origin[view.axes[1]] = view.snap(world[1]);
        void createEntityAt(origin);
        return false;
      }
      if (toolRef.current === "texture") return false;
      const css = view.eventToCss(e);
      pressedCss.current = css;
      if (toolRef.current === "select" && !e.ctrlKey && !e.shiftKey) {
        // A note's dot: the click flies there and opens the list, as over the 3D view.
        const [nx, ny] = view.axes;
        const note = projectMetaRef.current.pins.find((n) => {
          const p = view.worldToCss([n.pos[nx], n.pos[ny]]);
          return Math.hypot(p[0] - css[0], p[1] - css[1]) <= NOTE_HIT_RADIUS;
        });
        if (note) {
          goToPoint(note.pos);
          setPanel("notes");
          return false;
        }
      }
      if (toolRef.current === "vertex") {
        ensureVertexHandles();
        const i = vertexHandleAt(view, css);
        if (i === null) return false;
        const handle = vertexHandles.current[view.kind][i];
        drag.current = { kind: "vertex", handle, edges: selectionEdges(), delta: [0, 0, 0] };
        return true;
      }
      // A selected overlay's corners come first: they sit inside its rectangle.
      const ov = selectedOverlay();
      if (ov) {
        const [ax, ay] = view.axes;
        let best = -1;
        let bestD = 7;
        ov.frame.corners.forEach((c, i) => {
          const p = view.worldToCss([c[ax], c[ay]]);
          const dist = Math.max(Math.abs(p[0] - css[0]), Math.abs(p[1] - css[1]));
          if (dist < bestD) {
            bestD = dist;
            best = i;
          }
        });
        if (best >= 0) {
          drag.current = { kind: "overlay", id: ov.id, index: best, frame: ov.frame, delta: [0, 0, 0] };
          return true;
        }
      }
      // Handles first: they sit on the selection rectangle's edge.
      const bounds = selection.current.size ? selectionBounds() : null;
      const handle = bounds && !e.ctrlKey && !e.shiftKey ? hitHandle(view, bounds, handleMode.current, css) : null;
      if (bounds && handle) {
        const edges = selectionEdges();
        if (handle.kind === "scale") {
          drag.current = { kind: "scale", handle, bounds, edges, result: null };
        } else {
          const c = boxCenter(bounds);
          const [ax, ay] = view.axes;
          drag.current = {
            kind: "rotate",
            bounds,
            axis: viewAxisVector(view),
            startAngle: Math.atan2(world[1] - c[ay], world[0] - c[ax]),
            edges,
            degrees: 0,
          };
        }
        return true;
      }
      // Inside the selection's rectangle the selection itself is hit, as in
      // Hammer: a drag there moves it even where smaller objects overlap.
      const [ax, ay] = view.axes;
      const insideSelection = !!bounds && !e.ctrlKey && world[0] >= bounds[0][ax] && world[0] <= bounds[1][ax] && world[1] >= bounds[0][ay] && world[1] <= bounds[1][ay];
      const hit = insideSelection ? null : hitTest2D(view, world);
      const hitId = insideSelection ? (selection.current.values().next().value ?? null) : hit === null ? null : idOf(map, hit);
      if (pickTargetRef.current) {
        finishPickTarget(hit === null ? null : idOf(map, hit));
        return false;
      }
      if (hitId === null) {
        drag.current = { kind: "marquee", startCss: css, view: view.kind };
        return true;
      }
      if (e.ctrlKey) {
        const ids = withGroup(hitId);
        if (selection.current.has(hitId)) for (const i of ids) selection.current.delete(i);
        else for (const i of ids) selection.current.add(i);
        applySelection();
        return false;
      }
      const wasSelected = selection.current.has(hitId);
      if (!wasSelected) {
        if (!e.shiftKey) selection.current.clear();
        for (const i of withGroup(hitId)) selection.current.add(i);
        setHandleMode("move");
        applySelection();
      }
      // Ctrl+drag on the selection clones it (Shift is for docking to neighbours).
      drag.current = { kind: "move", objects: selectedIndices(), hitId, moved: false, wasSelected, clone: wasSelected && e.ctrlKey };
      return true;
    },
    drag: (view, delta, e) => {
      if (toolRef.current === "block") {
        const edit = blockEdit.current;
        if (edit) {
          const w = view.eventToWorld(e);
          if (edit.kind === "resize") setPendingBox(resizeBoxByHandle(view, edit.handle, edit.bounds, w));
          else {
            const [ax, ay] = view.axes;
            const dx = view.snap(w[0] - edit.start[0]);
            const dy = view.snap(w[1] - edit.start[1]);
            const lo: Vec3 = [...edit.bounds[0]];
            const hi: Vec3 = [...edit.bounds[1]];
            lo[ax] += dx;
            hi[ax] += dx;
            lo[ay] += dy;
            hi[ay] += dy;
            setPendingBox([lo, hi]);
          }
          const b = pendingBox.current;
          if (b) liveLabel.current = t("блок {0} × {1} × {2}", [b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]]);
          return;
        }
        const start = blockStart.current;
        if (!start) return;
        const w = view.eventToWorld(e);
        setPendingBox(boxFromRect(view, start, w));
        return;
      }
      if (toolRef.current === "cordon") {
        const start = cordonStart.current;
        if (!start) return;
        const box = cordonFromRect(view, start, view.eventToWorld(e));
        session.current?.renderer.setOverlay("cordon", box ? boxEdges(box) : null, [1, 0.25, 0.25]);
        return;
      }
      if (toolRef.current === "clip") {
        const line = clipLineRef.current;
        if (!line) return;
        const w = view.eventToWorld(e);
        setClipLine({ ...line, b: [view.snap(w[0]), view.snap(w[1])] });
        return;
      }
      if (toolRef.current === "measure") {
        const m = measureRef.current;
        if (!m) return;
        const w = view.eventToWorld(e);
        const b: Vec3 = [...m.a] as Vec3;
        b[view.axes[0]] = view.snap(w[0]);
        b[view.axes[1]] = view.snap(w[1]);
        setMeasure({ a: m.a, b });
        return;
      }
      const d = drag.current;
      if (!d) return;
      const r = session.current?.renderer;
      pressedCss.current = view.eventToCss(e);
      switch (d.kind) {
        case "move": {
          const snapped: [number, number] = [moveStep(delta[0], view.gridSize, e), moveStep(delta[1], view.gridSize, e)];
          if (!d.moved && Math.hypot(delta[0], delta[1]) > 3 * view.unitsPerPixel) d.moved = true;
          if (!d.moved) return;
          let w3 = view.toWorld3(snapped);
          const b = selectionBounds();
          const map = current.current;
          if (e.shiftKey && b && map) w3 = dockToNeighbours(map, d.objects, b, w3, [view.axes[0], view.axes[1]], 10 * view.unitsPerPixel);
          // V held: vertex to vertex, as Unity does it; the snapped-to vertex is marked in the view.
          vertexSnapMarker.current = null;
          let onVertex = false;
          if (heldKeys.has("KeyV") && map) {
            const res = snapToVertex(map, d.objects, w3, [view.axes[0], view.axes[1]], view.eventToWorld(e), 12 * view.unitsPerPixel, d.snapCache ?? null);
            d.snapCache = res.lists;
            if (res.target) {
              w3 = res.delta;
              onVertex = true;
              vertexSnapMarker.current = { view: view.kind, world2: res.target };
            }
          }
          d.last = w3;
          r?.setPreview(d.objects, w3);
          liveBounds.current = b ? [applyAffine(translation(w3), b[0]), applyAffine(translation(w3), b[1])] : null;
          const shown = [w3[view.axes[0]], w3[view.axes[1]]];
          liveLabel.current = shown[0] || shown[1] ? t("сдвиг {0}, {1}{2}", [shown[0], shown[1], (e.shiftKey ? t(" · стык") : "") + (onVertex ? t(" · вершина") : "")]) : "";
          break;
        }
        case "scale": {
          const world = view.eventToWorld(e);
          const res = scaleFromHandle(view, d.handle, d.bounds, world);
          res.factors = propsOnlyFactors(res.factors);
          d.result = res;
          liveBounds.current = res.bounds;
          const sz = [res.bounds[1][0] - res.bounds[0][0], res.bounds[1][1] - res.bounds[0][1], res.bounds[1][2] - res.bounds[0][2]];
          liveLabel.current = `${sz[0]} × ${sz[1]} × ${sz[2]}`;
          showTransformPreview(scalingAbout(res.pivot, res.factors), d.edges);
          break;
        }
        case "rotate": {
          const world = view.eventToWorld(e);
          const c = boxCenter(d.bounds);
          const [ax, ay] = view.axes;
          let deg = ((Math.atan2(world[1] - c[ay], world[0] - c[ax]) - d.startAngle) * 180) / Math.PI;
          if (e.shiftKey) deg = Math.round(deg / 15) * 15;
          else deg = Math.round(deg * 10) / 10;
          deg = ((deg + 540) % 360) - 180;
          d.degrees = deg;
          liveLabel.current = t("поворот {0}°", [deg]);
          showTransformPreview(rotationAbout(c, d.axis, deg), d.edges);
          break;
        }
        case "vertex": {
          // The handle lands on the grid; its whole stack of corners follows.
          const target: [number, number] = [view.snap(d.handle.world2[0] + delta[0]), view.snap(d.handle.world2[1] + delta[1])];
          d.delta = view.toWorld3([target[0] - d.handle.world2[0], target[1] - d.handle.world2[1]]);
          liveLabel.current = t("вершина {0}, {1}", [target[0], target[1]]);
          r?.setOverlay("xform", previewMovedEdges(d.edges, d.handle.members, d.delta), PREVIEW_COLOR);
          break;
        }
        case "overlay": {
          const [ax, ay] = view.axes;
          const c = d.frame.corners[d.index];
          const target: [number, number] = [view.snap(c[ax] + delta[0]), view.snap(c[ay] + delta[1])];
          d.delta = view.toWorld3([target[0] - c[ax], target[1] - c[ay]]);
          liveLabel.current = t("угол {0}: {1}, {2}", [d.index, target[0], target[1]]);
          // Outline of the quad with the moved corner.
          const cs = d.frame.corners.map((p, i): Vec3 => (i === d.index ? [p[0] + d.delta[0], p[1] + d.delta[1], p[2] + d.delta[2]] : p));
          const lines = new Float32Array(24);
          for (let i = 0; i < 4; i++) {
            lines.set(cs[i], i * 6);
            lines.set(cs[(i + 1) % 4], i * 6 + 3);
          }
          r?.setOverlay("xform", lines, PREVIEW_COLOR);
          break;
        }
        case "marquee":
          break;
      }
    },
    release: (view, delta, e) => {
      if (toolRef.current === "block") {
        if (blockEdit.current) {
          blockEdit.current = null;
          liveLabel.current = "";
          return;
        }
        const start = blockStart.current;
        blockStart.current = null;
        if (start) {
          pendingAxis.current = 3 - view.axes[0] - view.axes[1];
          setPendingBox(boxFromRect(view, start, view.eventToWorld(e)));
        }
        return;
      }
      if (toolRef.current === "cordon") {
        const start = cordonStart.current;
        cordonStart.current = null;
        const box = start ? cordonFromRect(view, start, view.eventToWorld(e)) : null;
        if (box) void runEdit(() => current.current?.doc.set_cordon(new Float64Array([...box[0], ...box[1]]), true));
        else refreshCordon();
        return;
      }
      if (toolRef.current === "clip") {
        const line = clipLineRef.current;
        if (line && line.a[0] === line.b[0] && line.a[1] === line.b[1]) setClipLine(null);
        return;
      }
      if (toolRef.current === "measure") {
        const m = measureRef.current;
        if (m && m.a[0] === m.b[0] && m.a[1] === m.b[1] && m.a[2] === m.b[2]) setMeasure(null);
        return;
      }
      const d = drag.current;
      drag.current = null;
      liveBounds.current = null;
      liveLabel.current = "";
      const r = session.current?.renderer;
      r?.setPreview([], [0, 0, 0]);
      showTransformPreview(null, null);
      if (!d) return;
      switch (d.kind) {
        case "move": {
          vertexSnapMarker.current = null;
          if (!d.moved) {
            // A plain click on an already selected object cycles the handles.
            if (d.wasSelected && !e.shiftKey) setHandleMode(nextMode(handleMode.current));
            return;
          }
          const move = d.last ?? view.toWorld3([moveStep(delta[0], view.gridSize, e), moveStep(delta[1], view.gridSize, e)]);
          if (d.clone) void cloneSelection(move);
          else void commitTranslate(selection.current, move);
          break;
        }
        case "marquee": {
          const endCss = view.eventToCss(e);
          if (Math.hypot(endCss[0] - d.startCss[0], endCss[1] - d.startCss[1]) < 3) {
            if (!e.shiftKey && !e.ctrlKey && selection.current.size) selectIds([]);
            return;
          }
          const ids = objectsInRect(view, view.cssToWorld(d.startCss), view.cssToWorld(endCss));
          if (e.ctrlKey || e.shiftKey) {
            for (const id of ids) selection.current.add(id);
            applySelection();
          } else selectIds(ids);
          break;
        }
        case "scale":
          if (d.result) void commitScale(selection.current, d.result.pivot, d.result.factors);
          break;
        case "rotate":
          void commitRotate(selection.current, boxCenter(d.bounds), d.axis, d.degrees);
          break;
        case "overlay": {
          const map = current.current;
          if (!map || (d.delta[0] === 0 && d.delta[1] === 0 && d.delta[2] === 0)) break;
          const c = d.frame.corners[d.index];
          const uv = overlayUvFor(d.frame, d.index, [c[0] + d.delta[0], c[1] + d.delta[1], c[2] + d.delta[2]]);
          const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
          const res = map.doc.set_entity_keyvalues(d.id, [[`uv${d.index}`, `${fmt(uv[0])} ${fmt(uv[1])} ${fmt(uv[2])}`]]) as EditResult | undefined;
          if (res) void applyEdit();
          break;
        }
        case "vertex": {
          if (d.delta[0] === 0 && d.delta[1] === 0 && d.delta[2] === 0) break;
          const map = current.current;
          if (!map) break;
          try {
            const res = map.doc.move_vertices(new Uint32Array(selection.current), vertexMoves(d.handle.members, d.delta)) as EditResult | undefined;
            if (res) void applyEdit();
          } catch (err) {
            setError(String(err instanceof Error ? err.message : err));
          }
          break;
        }
      }
    },
  };
}
