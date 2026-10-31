// The renderer session: WebGPU renderer, the fly camera and the three ortho
// cameras with their 2D tool handlers, the frame loop. Moved out of App.tsx
// whole; returns the cleanup the effect used to return.

import { api, inTauri } from "../tauri";
import { CURSORS, cursorCss } from "../ui/cursors";
import { initCore, pickInfo } from "../map/loader";
import { FlyCamera, readFlyHold, readViewSettings } from "../viewport/camera";
import { OrthoCamera, type ViewKind } from "../viewport/camera2d";
import { Renderer, type View2D } from "../viewport/renderer";
import { VIEW_KINDS } from "./constants";
import type { EditorApi } from "./editorApi";
import { createOrthoHandlers } from "./tools/view2d";
import { t } from "../i18n";

export function startSession(
  e: Pick<
    EditorApi,
    | "canvasRef"
    | "canvas2dRefs"
    | "session"
    | "current"
    | "satChannelRef"
    | "selection"
    | "hoverPending"
    | "activeView"
    | "drag"
    | "toolRef"
    | "handleMode"
    | "setHandleMode"
    | "handleHover"
    | "liveBounds"
    | "liveLabel"
    | "pressedCss"
    | "perfSampler"
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
    | "setGpu"
    | "setGpuOk"
    | "setRender"
    | "setError"
    | "lockedViewsRef"
    | "views"
    | "setHover"
    | "hover"
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
    | "drawOverlays"
    | "updateGizmo"
  >,
): void | (() => void) {
  const { canvasRef, canvas2dRefs, session, current, hoverPending, perfSampler, setGpu, setGpuOk, setRender, setHover, drawOverlays, updateGizmo } = e;
  const canvas = canvasRef.current;
  if (!canvas) return;
  let raf = 0;
  let cancelled = false;
  const camera = new FlyCamera();
  window.addEventListener("gme-fly-hold", () => (camera.flyOnlyWhileLooking = readFlyHold()));
  // Draw distance and field of view from the settings, as Hammer's far clip and Unity's camera FOV.
  const applyView = () => {
    const v = readViewSettings();
    camera.far = v.far;
    camera.fovDeg = v.fov;
  };
  applyView();
  window.addEventListener("gme-view", applyView);
  // The flight speed set with the wheel stays between runs and is shown in the status bar.
  try {
    const saved = Number(localStorage.getItem("gme.flySpeed"));
    if (saved >= 25 && saved <= 8000) camera.speed = saved;
  } catch {
    /* storage unavailable */
  }
  camera.onSpeed = (v) => {
    try {
      localStorage.setItem("gme.flySpeed", String(Math.round(v)));
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new CustomEvent("gme-fly-speed", { detail: v }));
  };
  camera.attach(canvas);
  void initCore();

  const setCursor = (view: OrthoCamera, cursor: string) => {
    const c = canvas2dRefs.current[view.kind];
    if (c) c.style.cursor = cursorCss(cursor);
  };

  const handlers = createOrthoHandlers(e, setCursor);

  Renderer.create(canvas)
    .then((renderer) => {
      if (cancelled) {
        renderer.dispose();
        return;
      }
      const views = {} as Record<ViewKind, View2D>;
      for (const kind of VIEW_KINDS) {
        const c = canvas2dRefs.current[kind];
        if (!c) continue;
        const cam = new OrthoCamera(kind);
        cam.handlers = handlers;
        cam.attach(c);
        views[kind] = renderer.attach2D(c, cam);
      }
      session.current = { renderer, camera, views };
      setGpu(`WebGPU: ${renderer.adapterInfo}${renderer.hasBc ? "" : t(" (без BC, текстуры в RGBA8)")}`);
      setGpuOk(true);
      if (inTauri) void api.gpuReport({ ok: true, message: t("WebGPU работает"), adapter: renderer.adapterInfo });

      let last = performance.now();
      let lastStats = 0;
      const loop = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        camera.update(dt);
        updateGizmo(camera);
        renderer.frame(camera);
        drawOverlays();
        const ps = perfSampler.current;
        if (ps) {
          ps.stamps.push(now);
          if (now >= ps.until) perfSampler.current = null;
        }
        if (hoverPending.current && current.current) {
          const { x, y } = hoverPending.current;
          hoverPending.current = null;
          void renderer.pick(camera, x, y).then((id) => {
            // The glow under the cursor belongs to the select tool; other tools keep the view calm.
            renderer.setHover(e.toolRef.current === "select" ? id : null);
            if (e.toolRef.current === "select" && (canvas.style.cursor === "" || canvas.style.cursor === CURSORS.pointer)) canvas.style.cursor = id === null ? "" : CURSORS.pointer;
            setHover(id === null || !current.current ? null : pickInfo(current.current, id));
          });
        }
        if (now - lastStats > 250) {
          lastStats = now;
          setRender(renderer.stats());
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })
    .catch((e) => {
      setGpu(String(e));
      setGpuOk(false);
      if (inTauri) void api.gpuReport({ ok: false, message: String(e) });
    });

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    camera.detach();
    session.current?.renderer.dispose();
    session.current = null;
  };
}
