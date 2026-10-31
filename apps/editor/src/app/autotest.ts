// The autotest sequence that drove the editor from App.tsx: moved out whole.

import { api, inTauri, thumbnailUrl, type AppInfo } from "../tauri";
import { DEFAULT_NEW_MAP, type GameTemplate } from "../ui/NewMapPanel";
import { type AssetKind } from "../ui/assetDrag";
import { coreMemoryBytes } from "../map/loader";
import { measureText } from "./measure";
import { tourScript, type TourKind } from "../ui/tutorial";
import { type EntityDetails } from "../ui/PropertiesPanel";
import { buildGraph, type GraphConnection } from "./ioGraph";
import { heldKeys } from "./tools/keyboard";
import { type FaceEdit, type FaceInfo } from "../ui/FaceEditor";
import { type Problem } from "../ui/ProblemsPanel";
import { overlayUvFor } from "../viewport/overlays";
import { history, objectIndexOf, pickInfo, type EditResult } from "../map/loader";
import { type ViewKind } from "../viewport/camera2d";
import { ALL_VIEWS, type ViewId } from "../ui/viewsLayout";
import { boxCenter, type Vec3 } from "../viewport/transform";
import type { EditorApi } from "./editorApi";
import { encodeWav, parseWavInfo, renderClip } from "../ui/wav";
import { SOUND_LOOPS } from "../ui/assetDrag";
import { soundUrl } from "../tauri";
import { dab, imageToPix, makePix, pickColor, pixToPng, rect, stamp, textToPix } from "../ui/paint";
import { assistantTurn, cliTurn, mockBackend, type AssistantEvent, type Backend, type ChatResponse, type Message } from "./assistant";
import { shellCliRunner } from "./assistantCli";
import { journeyText, metaPathOf } from "./journey";
import { ViewMode, Panel, DEFAULT_COMPILE, Shape, PANEL_TITLES } from "./constants";
import { applyLocale } from "../i18n";

/**
 * Development: GME_AUTOLOAD opens a map; GME_AUTO* variables drive an edit
 * and a capture, then GME_AUTOEXIT ends the process. Runs once the GPU is up;
 * `e` is the editor as it was on that render.
 */
export function runAutotest(app: AppInfo, e: EditorApi): void {
  // The steps look for Russian labels whatever language the user chose; a plain autoload (just opening a map) keeps the language.
  if (Object.entries(app).some(([k, v]) => k.startsWith("auto") && k !== "autoload" && v)) void applyLocale("ru");
  const {
    canvasRef,
    canvas2dRefs,
    measureRef,
    setMeasure,
    autoReportRef,
    isolateSelection,
    selectSimilar,
    snapSelectionToGrid,
    pilotSelection,
    selectReferencing,
    selectPathChain,
    nodrawHiddenFaces,
    copyTransform,
    selectRandom,
    mergeBrushes,
    selectParent,
    originToCentre,
    revealAndSelect,
    showAll,
    browseToAsset,
    selectAssetUsers,
    duplicateUnique,
    selectWithChildren,
    placeModelRef,
    paletteExtra,
    openProperties,
    selectAllVisible,
    pasteTransform,
    frameAll,
    moveToCamera,
    gridRef,
    setSymmetry,
    mirrorSelection,
    session,
    current,
    currentPath,
    selection,
    perfSampler,
    lastOpenMs,
    pendingAxis,
    faceSel,
    materialRef,
    culledRef,
    content,
    mapNameRef,
    setPanel,
    modelCache,
    setTourIndex,
    setTourKind,
    lightCountRef,
    modelBoundsRef,
    portalSegs,
    prefabsRef,
    lastBsp,
    leakPointsRef,
    compileLinesRef,
    compileRun,
    compileDoneRef,
    setViewModeState,
    setPathChain,
    pickTargetRef,
    setPickingTarget,
    setCurrentMaterial,
    setEntityClass,
    setTool,
    setCurrentModel,
    setScatter,
    setShape,
    setPrim,
    refreshFaces,
    applySelection,
    refreshHelpers,
    selectIds,
    selectObject,
    selectedIndices,
    snapToVertex,
    loadLeaves,
    showLeaves,
    createGenerated,
    regenerateGenerator,
    detachGenerator,
    jumpHistory,
    setKeysOnEntities,
    addNoteHere,
    addNoteAt,
    setNotes,
    setPendingBox,
    ensureModel,
    applyEdit,
    commitTranslate,
    commitRotate,
    commitScale,
    runEdit,
    hideSelection,
    groupSelection,
    deleteSelection,
    tieSelection,
    moveToWorld,
    collapseInstances,
    clipboardRef,
    copySelection,
    pasteClipboard,
    savePrefab,
    insertPrefab,
    cloneSelection,
    arraySelection,
    setPaint,
    createDisplacement,
    displacementOp,
    paintAt,
    editFaces,
    setWorldKeys,
    replaceTextures,
    showPortals,
    loadPortalfile,
    cubemapsDoneRef,
    bridgeCubemaps,
    analyzePack,
    packCustom,
    importTextureFiles,
    alignSelection,
    checkProblems,
    flipHinge,
    growSelection,
    pasteEntityKeys,
    copyEntityKeys,
    convertProps,
    selectDetailCandidates,
    viewsRef,
    panelRef,
    saveCurrent,
    wrapInTrigger,
    undo,
    fixProblems,
    applyMaterialToSelection,
    createEntityAt,
    createPendingBlock,
    setEntityKeys,
    selectedOverlay,
    finishPickTarget,
    setEntityConnections,
    saveTo,
    compileCurrent,
    objectBounds,
    selectionBounds,
    updateGizmo,
    openSatellite,
    matPreview,
    revertMaterialPreview,
    updateMaterialPreview,
    clearModelGhost,
    updateModelGhost,
    dropAssetRef,
    openPath,
    newMap,
    openPanel,
    compareHistoryEntry,
    closeHistoryDiff,
    paintRef,
    createLandscape,
    sculptAt,
    landscapeRef,
    suggestLandscapeOrigin,
    placeSound,
    applyPaintedTexture,
    assistantTools,
    assistantConfirm,
    assistantBusy,
    journeyRef,
    projectMetaRef,
  } = e;
  const run = async () => {
    if (app.autonew) {
      const [w, l, h, kind = "outdoor", sky = "sky_day01_01", template = "sandbox"] = app.autonew.split(",");
      await newMap({ ...DEFAULT_NEW_MAP, width: Number(w) || 1024, length: Number(l) || 1024, height: Number(h) || 256, outdoor: kind !== "indoor", skyname: sky, template: template as GameTemplate });
    } else await openPath(app.autoload!);
    const s = session.current;
    if (!s || !current.current) return;
    const started = performance.now();
    while (performance.now() - started < 20000) {
      const st = s.renderer.stats();
      if (st.texturesPending === 0 && content?.state !== "loading") break;
      await new Promise((r) => setTimeout(r, 200));
    }
    await new Promise((r) => setTimeout(r, 300));
    if (app.autocam) {
      const n = app.autocam.split(",").map(Number);
      if (n.length === 5 && n.every((x) => Number.isFinite(x))) {
        s.camera.position = new Float32Array([n[0], n[1], n[2]]);
        s.camera.yaw = n[3];
        s.camera.pitch = n[4];
      }
    }
    const map = current.current;
    if (app.autoselect === "all") {
      selectIds([...Array.from(map.mesh.solidIds), ...map.pointEntities.map((e) => e.id)]);
    } else if (app.autoselect === "entities") {
      selectIds(map.pointEntities.map((e) => e.id));
    } else if (app.autoselect && app.autoselect !== "center") {
      selectIds(
        app.autoselect
          .split(",")
          .map(Number)
          .filter((n) => Number.isFinite(n)),
      );
    } else if (app.autoselect === "center") {
      const rect = canvasRef.current!.getBoundingClientRect();
      const id = await s.renderer.pick(s.camera, rect.width / 2, rect.height / 2);
      if (id !== null) {
        const info = pickInfo(map, id);
        if (info) {
          selectIds([info.kind === "face" ? info.solidId : info.entity.id]);
          s.renderer.setHover(id);
          void api.log(`autoshot picked ${id}: ${JSON.stringify(info)}`);
        }
      }
    }
    if (app.automove) {
      const n = app.automove.split(",").map(Number);
      if (n.length === 3 && n.every((x) => Number.isFinite(x))) {
        await commitTranslate(selection.current, [n[0], n[1], n[2]]);
        const h = history(map);
        void api.log(`automove ${app.automove}: version ${h.version}, dirty ${h.dirty}, undo ${h.undo}`);
      }
    }
    if (app.autorotate) {
      const deg = Number(app.autorotate);
      const b = selectionBounds();
      if (Number.isFinite(deg) && b) {
        await commitRotate(selection.current, boxCenter(b), [0, 0, 1], deg);
        const nb = selectionBounds();
        void api.log(`autorotate ${deg}: bounds ${JSON.stringify(b)} -> ${JSON.stringify(nb)}, undo ${history(map).undo}`);
      }
    }
    if (app.autoscale) {
      const n = app.autoscale.split(",").map(Number);
      const b = selectionBounds();
      if (n.length === 3 && n.every((x) => Number.isFinite(x)) && b) {
        await commitScale(selection.current, b[0], [n[0], n[1], n[2]]);
        const nb = selectionBounds();
        void api.log(`autoscale ${app.autoscale}: bounds ${JSON.stringify(b)} -> ${JSON.stringify(nb)}, undo ${history(map).undo}`);
      }
    }
    if (app.autotexture && app.autotexture !== "shaders") {
      setCurrentMaterial(app.autotexture);
      await applyMaterialToSelection();
      const url = thumbnailUrl(app.autotexture);
      let thumb = "n/a";
      if (url) {
        const r = await fetch(url).catch(() => null);
        thumb = r ? `${r.status} ${r.headers.get("content-type")} ${(await r.arrayBuffer()).byteLength} bytes` : "fetch failed";
      }
      void api.log(`autotexture ${app.autotexture}: undo ${history(map).undo}, materials ${map.mesh.materials.length}, thumb ${thumb}`);
    }
    if (app.autoentity) {
      const [cls, ...rest] = app.autoentity.split(",");
      const n = rest.map(Number);
      if (cls && n.length === 3 && n.every((x) => Number.isFinite(x))) {
        setEntityClass(cls);
        await createEntityAt([n[0], n[1], n[2]]);
        void api.log(`autoentity ${app.autoentity}: selection ${Array.from(selection.current).join(",")}, entities ${map.pointEntities.length}, undo ${history(map).undo}`);
      }
    }
    if (app.autokey || app.autooutput) {
      const id = Array.from(selection.current).find((i) => map.pointEntities.some((e) => e.id === i));
      if (id !== undefined) {
        if (app.autokey) {
          const changes: [string, string | null][] = app.autokey.split(";").map((kv) => {
            const [k, v = ""] = kv.split("=");
            return [k, v === "" ? null : v];
          });
          await setEntityKeys(id, changes);
          void api.log(`autokey ${app.autokey}: ${JSON.stringify(map.doc.entity_details(id))}, undo ${history(map).undo}`);
        }
        if (app.autooutput) {
          const [output, target, input, parameter = "", delay = "0", times = "-1"] = app.autooutput.split(",");
          const d = map.doc.entity_details(id) as EntityDetails;
          await setEntityConnections(id, [...d.connections, { output, target, input, parameter, delay: Number(delay), times_to_fire: Number(times) }]);
          void api.log(`autooutput ${app.autooutput}: ${JSON.stringify((map.doc.entity_details(id) as EntityDetails).connections)}, undo ${history(map).undo}`);
        }
      } else void api.log("autokey/autooutput: no point entity selected");
    }
    if (app.autogroup) {
      const res = await groupSelection();
      void api.log(`autogroup: group ${res ? (res as EditResult).changed_ids[0] : "none"}, undo ${history(map).undo}`);
    }
    if (app.autovisgroup) {
      const ids = new Uint32Array(selection.current);
      const res = await runEdit(() => map.doc.create_visgroup(app.autovisgroup!, new Uint8Array([40, 200, 90]), ids));
      void api.log(`autovisgroup ${app.autovisgroup}: id ${res ? res.changed_ids[0] : "none"}, visgroups ${JSON.stringify(map.doc.visgroups())}`);
    }
    if (app.autovertex) {
      const n = app.autovertex.split(/[;,]/).map(Number);
      if (n.length % 6 === 0 && n.every((x) => Number.isFinite(x))) {
        try {
          const res = map.doc.move_vertices(new Uint32Array(selection.current), new Float64Array(n)) as EditResult | undefined;
          if (res) await applyEdit();
          void api.log(`autovertex: changed ${res ? res.changed_ids.join(",") : "none"}, invalid ${map.stats.invalid_solids}, undo ${history(map).undo}`);
        } catch (err) {
          void api.log(`autovertex refused: ${String(err instanceof Error ? err.message : err)}`);
        }
      }
    }
    if (app.autohollow) {
      const t = Number(app.autohollow);
      const res = await runEdit(() => map.doc.hollow(new Uint32Array(selection.current), t));
      if (res) for (const id of res.changed_ids) selection.current.add(id);
      applySelection();
      void api.log(`autohollow ${t}: changed ${res ? res.changed_ids.join(",") : "none"}, solids ${map.stats.solids}, invalid ${map.stats.invalid_solids}, undo ${history(map).undo}`);
    }
    if (app.autocarve) {
      const res = await runEdit(() => map.doc.carve(new Uint32Array(selection.current)));
      void api.log(`autocarve: changed ${res ? res.changed_ids.join(",") : "none"}, solids ${map.stats.solids}, invalid ${map.stats.invalid_solids}, undo ${history(map).undo}`);
    }
    if (app.autoclip) {
      const n = app.autoclip.split(",").map(Number);
      if (n.length === 5 && n.every((x) => Number.isFinite(x))) {
        const res = await runEdit(() => map.doc.clip(new Uint32Array(selection.current), new Float64Array(n.slice(0, 4)), n[4], materialRef.current));
        if (res) for (const id of res.changed_ids) selection.current.add(id);
        applySelection();
        void api.log(`autoclip ${app.autoclip}: changed ${res ? res.changed_ids.join(",") : "none"}, solids ${map.stats.solids}, invalid ${map.stats.invalid_solids}, undo ${history(map).undo}`);
      }
    }
    if (app.autocordon) {
      const n = app.autocordon.split(",").map(Number);
      if (n.length === 6 && n.every((x) => Number.isFinite(x))) {
        await runEdit(() => map.doc.set_cordon(new Float64Array(n), true));
        void api.log(`autocordon ${app.autocordon}: cordon ${JSON.stringify(map.doc.cordon())}, culled ${culledRef.current.size}, undo ${history(map).undo}`);
      }
    }
    if (app.autohide) {
      await hideSelection();
      void api.log(`autohide: hidden ${map.doc.hidden_ids().length}, solids drawn ${map.mesh.solidIds.length}, auto ${JSON.stringify(map.doc.auto_visgroups())}`);
    }
    if (app.autoblock) {
      const n = app.autoblock.split(",").map(Number);
      if (n.length === 6 && n.every((x) => Number.isFinite(x))) {
        setPendingBox([
          [n[0], n[1], n[2]],
          [n[3], n[4], n[5]],
        ]);
        await createPendingBlock();
        void api.log(`autoblock: created, selection ${Array.from(selection.current).join(",")}, undo ${history(map).undo}`);
      }
    }
    if (app.autoprimitive) {
      const [shapeName, ...rest] = app.autoprimitive.split(",");
      const n = rest.map(Number);
      if (n.length >= 7 && n.slice(0, 7).every((x) => Number.isFinite(x))) {
        setShape(shapeName as Shape);
        setPrim({ sides: n[0] });
        pendingAxis.current = n[7] ?? 2;
        setPendingBox([
          [n[1], n[2], n[3]],
          [n[4], n[5], n[6]],
        ]);
        await createPendingBlock();
        const ids = Array.from(selection.current);
        const sides = ids.map((id) => map.doc.solid_sides(id).length);
        void api.log(`autoprimitive ${app.autoprimitive}: solids ${ids.join(",")} with sides ${sides.join(",")}, invalid ${map.stats.invalid_solids}, undo ${history(map).undo}`);
      }
    }
    if (app.autotie) {
      await tieSelection(app.autotie);
      const owner = Array.from(selection.current).map((id) => map.doc.entity_of_solid(id));
      void api.log(`autotie ${app.autotie}: brushes ${Array.from(selection.current).join(",")} now in entity ${owner.join(",")}, entities ${map.entities.length}, undo ${history(map).undo}`);
    }
    if (app.autoworld) {
      await moveToWorld();
      void api.log(`autoworld: selection ${Array.from(selection.current).join(",")}, entities ${map.entities.length}, undo ${history(map).undo}`);
    }
    if (app.autopath) {
      const [cls, countText] = app.autopath.split(",");
      const count = Number(countText) || 3;
      setEntityClass(cls || "path_track");
      setPathChain(true);
      for (let i = 0; i < count; i++) await createEntityAt([i * 128, 0, 0]);
      setPathChain(false);
      const nodes = map.entities
        .filter((e) => e.classname === (cls || "path_track"))
        .map((e) => {
          const d = map.doc.entity_details(e.id) as EntityDetails;
          return `${e.targetname}->${d.keyvalues.find(([k]) => k.toLowerCase() === "target")?.[1] ?? ""}`;
        });
      void api.log(`autopath ${app.autopath}: ${nodes.join(" ")}, undo ${history(map).undo}`);
    }
    if (app.autooverlay) {
      const [iText, dx, dy, dz] = app.autooverlay.split(",").map(Number);
      const ov = selectedOverlay();
      if (ov && Number.isFinite(iText)) {
        const c = ov.frame.corners[iText];
        const uv = overlayUvFor(ov.frame, iText, [c[0] + (dx || 0), c[1] + (dy || 0), c[2] + (dz || 0)]);
        const res = map.doc.set_entity_keyvalues(ov.id, [[`uv${iText}`, uv.map((v) => String(Math.round(v * 1000) / 1000)).join(" ")]]) as EditResult | undefined;
        if (res) await applyEdit();
        const after = selectedOverlay();
        void api.log(
          `autooverlay ${app.autooverlay}: uv${iText} ${after ? after.frame.uv[iText].join(" ") : "?"}, corner ${after ? after.frame.corners[iText].map((v) => Math.round(v)).join(" ") : "?"}, undo ${history(map).undo}`,
        );
      }
    }
    if (app.autotexture === "shaders") {
      const t0 = performance.now();
      const all = await api.listMaterials("", 1, "");
      const wvt = await api.listMaterials("", 5, "worldvertextransition");
      const tools = await api.listMaterials("", 3, "tool");
      const folders = await api.materialFolders("");
      const dev = await api.materialFolders("dev/");
      void api.log(
        `material folders: ${folders.length} at root (${folders
          .slice(0, 6)
          .map((f) => `${f.name}${f.count}`)
          .join(" ")}), ${dev.length} under dev/`,
      );
      if (!folders.some((f) => f.name === "dev/" && f.count > 0) || folders.some((f) => !f.name.endsWith("/")))
        throw new Error(`autotexture: папки материалов без dev/: ${folders.map((f) => f.name).join(" ")}`);
      const mroot = await api.modelFolders("");
      const mc17 = await api.modelFolders("props_c17/");
      void api.log(
        `model folders: ${mroot.length} at root (${mroot
          .slice(0, 4)
          .map((f) => `${f.name}${f.count}`)
          .join(" ")}), ${mc17.length} under props_c17/`,
      );
      if (!mroot.some((f) => f.name === "props_c17/" && f.count > 0) || mroot.some((f) => f.name.startsWith("models/")))
        throw new Error(
          `autotexture: папки моделей без props_c17/: ${mroot
            .slice(0, 8)
            .map((f) => f.name)
            .join(" ")}`,
        );
      void api.log(`shader filter: all ${all.total}, worldvertextransition ${wvt.total} (${wvt.names.join(",")}), tool ${tools.total}, ${Math.round(performance.now() - t0)} ms`);
    }
    if (app.autoimport) {
      const made = await importTextureFiles([app.autoimport], "imported");
      const info = made.length ? (await api.materialsInfo([made[0].material]))[0] : null;
      void api.log(
        `autoimport ${app.autoimport}: ${made.map((m) => `${m.material} ${m.width}x${m.height} translucent ${m.translucent}`).join(",") || "failed"}, found ${info?.found ?? false} ${info ? `${info.width}x${info.height}` : ""}`,
      );
    }
    if (app.autoalign) {
      const [ax, mode] = app.autoalign.split(",");
      const axis = ({ x: 0, y: 1, z: 2 } as Record<string, 0 | 1 | 2>)[ax] ?? 0;
      await alignSelection(axis, (mode as "min" | "center" | "max" | "grid") || "min");
      const b = Array.from(selection.current).map((id) => {
        const index = objectIndexOf(map, id);
        const bb = index === null ? null : objectBounds(map, index);
        return bb ? `${id}:${bb[0].map(Math.round).join(" ")}..${bb[1].map(Math.round).join(" ")}` : `${id}:?`;
      });
      void api.log(`autoalign ${app.autoalign}: ${b.join(" | ")}, undo ${history(map).undo}`);
    }
    if (app.autoarray) {
      const [count, dx, dy, dz, yaw] = app.autoarray.split(",").map(Number);
      const before = map.stats.solids;
      await arraySelection({ count: count || 2, offset: [dx || 0, dy || 0, dz || 0], yaw: yaw || 0 });
      void api.log(`autoarray ${app.autoarray}: solids ${before} -> ${map.stats.solids}, selection ${selection.current.size}, undo ${history(map).undo}`);
    }
    if (app.autopick) {
      const [key, idText] = app.autopick.split(",");
      const target = Number(idText);
      const selected = Array.from(selection.current)[0];
      if (selected !== undefined && key) {
        pickTargetRef.current = { entity: selected, key };
        setPickingTarget(key);
        finishPickTarget(Number.isFinite(target) ? target : null);
        await new Promise((r) => setTimeout(r, 300));
        const d = map.doc.entity_details(selected) as EntityDetails | undefined;
        void api.log(`autopick ${app.autopick}: ${key} = ${d?.keyvalues.find(([k]) => k.toLowerCase() === key.toLowerCase())?.[1] ?? "(none)"}, undo ${history(map).undo}`);
      }
    }
    if (app.autoviewmode) {
      // For the shot only: not remembered, so a test run never changes the person's setting.
      setViewModeState(app.autoviewmode as ViewMode);
      s.renderer.setViewMode(app.autoviewmode as ViewMode);
      try {
        localStorage.removeItem("gme.viewMode");
      } catch {
        /* storage unavailable */
      }
      void api.log(`autoviewmode ${app.autoviewmode}, lights ${lightCountRef.current}`);
    }
    if (app.autoprefab) {
      const before = map.stats.solids;
      await savePrefab(app.autoprefab);
      const list = await api.listPrefabs();
      const p = list.find((x) => x.name === app.autoprefab);
      if (p) await insertPrefab(p);
      void api.log(
        `autoprefab ${app.autoprefab}: library ${list.length} (${p ? `${p.bytes} bytes` : "not saved"}), solids ${before} -> ${map.stats.solids}, selection ${Array.from(selection.current).join(",")}, undo ${history(map).undo}`,
      );
    }
    if (app.autofix) {
      // After the build: the auto-analysis must have fixed what it knows (the fixture's skybox error gets an env_cubemap).
      const t0 = Date.now();
      while (Date.now() - t0 < 120000) {
        await new Promise((r) => setTimeout(r, 500));
        if (compileDoneRef.current === compileRun.current && compileRun.current !== 0) break;
      }
      await new Promise((r) => setTimeout(r, 2500));
      const m2 = current.current ?? map;
      void api.log(`autofix report: «${autoReportRef.current}»; entities ${m2.entities.length}, cubemaps ${m2.entities.filter((e) => e.classname === "env_cubemap").length}`);
      if (!/Исправлено автоматически/.test(autoReportRef.current)) throw new Error(`autofix: авторазбор ничего не исправил: ${autoReportRef.current}`);
    }
    if (app.autoisolate) {
      // Isolate the first brush: everything else hides; the second press shows all; select similar picks every brush sharing its textures.
      const m = current.current ?? map;
      const ids = Array.from(m.doc.solid_ids() as Uint32Array);
      selectIds([ids[0]]);
      await new Promise((r) => setTimeout(r, 300));
      await isolateSelection();
      await new Promise((r) => setTimeout(r, 300));
      const hiddenCount = (m.doc.hidden_ids() as Uint32Array).length;
      const targets = new Set<number>(ids.map((id) => m.doc.entity_of_solid(id) || id));
      for (const e of m.entities) targets.add(e.id);
      const total = targets.size;
      void api.log(`autoisolate: hidden ${hiddenCount} of ${total} hide targets`);
      if (hiddenCount !== total - 1) throw new Error(`autoisolate: ожидалось скрытых ${total - 1}, скрыто ${hiddenCount}`);
      // The status bar says how much is hidden, and says nothing once all is shown.
      await new Promise((r) => setTimeout(r, 300));
      const chip = document.querySelector(".status-hidden")?.textContent ?? "";
      await isolateSelection();
      await new Promise((r) => setTimeout(r, 300));
      const chipAfter = document.querySelector(".status-hidden")?.textContent ?? "";
      void api.log(`autoisolate: status hidden chip «${chip}», after show all «${chipAfter}»`);
      if (chip !== `скрыто: ${hiddenCount}` || chipAfter) throw new Error(`autoisolate: метка скрытого: «${chip}» → «${chipAfter}»`);
      if ((m.doc.hidden_ids() as Uint32Array).length !== 0) throw new Error("autoisolate: повторное нажатие не показало всё");
      // Select similar from the brush with the most common texture, so there is something to find.
      const firstMat = (id: number) => m.doc.face_material(id, (m.doc.solid_sides(id) as Uint32Array)[0]).toLowerCase();
      const counts = new Map<string, number>();
      for (const id of ids) counts.set(firstMat(id), (counts.get(firstMat(id)) ?? 0) + 1);
      const common = ids.reduce((best, id) => ((counts.get(firstMat(id)) ?? 0) > (counts.get(firstMat(best)) ?? 0) ? id : best), ids[0]);
      selectIds([common]);
      await new Promise((r) => setTimeout(r, 200));
      selectSimilar();
      await new Promise((r) => setTimeout(r, 300));
      void api.log(`autoisolate: similar ${selection.current.size} of ${ids.length} brushes`);
      if (selection.current.size < 2) throw new Error(`autoisolate: похожих выбрано ${selection.current.size}`);
      // Snap to grid: knock one brush off the grid by 3 units, Ctrl+B puts its corner back on a node.
      const one = ids[ids.length - 1];
      selectIds([one]);
      await new Promise((r) => setTimeout(r, 200));
      await commitTranslate(selection.current, [3, 0, 0]);
      const g = gridRef.current || 1;
      await snapSelectionToGrid(false);
      await new Promise((r) => setTimeout(r, 200));
      const sb = selectionBounds();
      const off = sb ? sb[0].map((v) => Math.abs(v - Math.round(v / g) * g)) : [1, 1, 1];
      void api.log(`autoisolate: snapped min ${sb?.[0].join(" ")} on grid ${g}`);
      if (off.some((v) => v > 0.01)) throw new Error(`autoisolate: Ctrl+B не прижал к сетке ${g}: ${sb?.[0].join(" ")}`);
      // Move to camera: the brush centre lands within one grid step of the 3D camera.
      await moveToCamera();
      await new Promise((r) => setTimeout(r, 200));
      const cb = selectionBounds();
      const cam = session.current?.camera.position;
      if (!cb || !cam) throw new Error("autoisolate: нет габаритов или камеры");
      const miss = Math.max(...[0, 1, 2].map((k) => Math.abs((cb[0][k] + cb[1][k]) / 2 - cam[k])));
      void api.log(`autoisolate: moved to camera, off by ${miss.toFixed(1)}`);
      if (miss > g) throw new Error(`autoisolate: к камере не перенесено, промах ${miss}`);
      // The step below saves the map: nothing a step changed may stay. +3, snap and the move to the camera go back.
      for (let i = 0; i < 3; i++) await undo();
      // Pilot: the camera stands in a light, a 30° turn is written back to its angles.
      const lamp = m.entities.find((e) => e.classname.startsWith("light") && e.classname !== "light_environment") ?? m.entities.find((e) => !e.brush);
      if (lamp && session.current) {
        selectIds([lamp.id]);
        await new Promise((r) => setTimeout(r, 200));
        await pilotSelection();
        const cam = session.current.camera;
        const d0 = m.doc.entity_details(lamp.id) as { keyvalues: [string, string][] };
        const o = (d0.keyvalues.find(([k]) => k === "origin")?.[1] ?? "").split(" ").map(Number);
        const off = Math.max(...[0, 1, 2].map((k) => Math.abs(cam.position[k] - o[k])));
        if (off > 0.5) throw new Error(`autoisolate: камера не встала в энтити, промах ${off}`);
        const yaw0 = cam.yaw;
        cam.yaw = yaw0 + 30;
        await pilotSelection();
        await new Promise((r) => setTimeout(r, 200));
        const d1 = (current.current ?? m).doc.entity_details(lamp.id) as { keyvalues: [string, string][] };
        const ang = d1.keyvalues.find(([k]) => k === "angles")?.[1] ?? "";
        const yaw1 = Number(ang.split(" ")[1]);
        const want = (((yaw0 + 30) % 360) + 360) % 360;
        void api.log(`autoisolate: piloted ${lamp.classname} ${lamp.id}, angles now «${ang}»`);
        if (Math.abs(yaw1 - want) > 0.2) throw new Error(`autoisolate: поворот не записан: ${ang}, ждали yaw ${want}`);
        await undo();
      }
      // Who references: a named entity, another one gets an output at it (as a star pattern); Ctrl+Alt+R must find exactly that one.
      const mr = current.current ?? m;
      const named = mr.entities.find((e) => e.targetname);
      const caller = mr.entities.find((e) => e !== named && !e.brush);
      if (named && caller) {
        const pattern = named.targetname!.toUpperCase().slice(0, -1) + "*";
        await setEntityConnections(caller.id, [
          { output: "OnUser1", target: pattern, input: "Toggle", parameter: "", delay: 0, times_to_fire: -1 },
          { output: "OnUser2", target: named.targetname!, input: "Start", parameter: "", delay: 0, times_to_fire: -1 },
        ]);
        // A brush entity is selected through its brushes, as a click does.
        const solids = Array.from((current.current ?? mr).doc.entity_solids(named.id) as Uint32Array);
        selectIds(solids.length ? solids : [named.id]);
        await new Promise((r) => setTimeout(r, 300));
        // I/O lines: the brush entity, selected through its brushes, shows the line from the entity that fires at it.
        const ioVerts = session.current?.renderer.overlayVertexCount("helpers") ?? 0;
        void api.log(`autoisolate: I/O lines for ${named.classname} «${named.targetname}»: ${ioVerts} vertices`);
        // Two lines in: one by the exact name, one by the star pattern.
        if (ioVerts < 4) throw new Error(`autoisolate: линий связей у брашевой энтити меньше двух (${ioVerts} вершин)`);
        selectReferencing();
        await new Promise((r) => setTimeout(r, 200));
        const got = [...selection.current];
        void api.log(`autoisolate: references to ${named.targetname} via «${pattern}»: ${got.join(",")}`);
        if (!got.includes(caller.id)) throw new Error(`autoisolate: «кто ссылается» не нашёл ${caller.id}`);
        await undo();
        // Name-key lines: a caller whose target key names the entity draws a line to it, as path_track chains in Hammer.
        selectIds([caller.id]);
        await new Promise((r) => setTimeout(r, 300));
        const before = session.current?.renderer.overlayVertexCount("helpers") ?? 0;
        await setEntityKeys(caller.id, [["target", named.targetname!]]);
        selectIds([caller.id]);
        await new Promise((r) => setTimeout(r, 300));
        const after = session.current?.renderer.overlayVertexCount("helpers") ?? 0;
        // Path chain: from the caller the chain reaches the entity its target names, brushes and all.
        selectPathChain();
        const chain = [...selection.current].map((id) => (current.current ?? mr).doc.entity_of_solid(id) || id);
        void api.log(`autoisolate: path chain from ${caller.id}: ${[...new Set(chain)].join(",")}`);
        if (!chain.includes(named.id) || !chain.includes(caller.id)) throw new Error(`autoisolate: цепочка пути не дошла до ${named.id}`);
        await undo();
        void api.log(`autoisolate: target key line from ${caller.classname}: ${before} -> ${after} vertices`);
        if (after < before + 2) throw new Error(`autoisolate: нет линии по ключу target (${before} -> ${after})`);
        // Parent: a caller parented to the brush entity selects it as its parent, and the entity's children bring the caller back.
        await setEntityKeys(caller.id, [["parentname", named.targetname!]]);
        selectIds([caller.id]);
        selectParent(false);
        const parents = [...selection.current].map((id) => (current.current ?? mr).doc.entity_of_solid(id) || id);
        selectWithChildren();
        const family = [...selection.current].map((id) => (current.current ?? mr).doc.entity_of_solid(id) || id);
        await undo();
        void api.log(`autoisolate: parent of ${caller.id}: ${[...new Set(parents)].join(",")}, with children: ${[...new Set(family)].join(",")}`);
        if (!parents.includes(named.id) || !family.includes(caller.id)) throw new Error(`autoisolate: родитель или дети через брашевую энтити не нашлись`);
        // Parent loop: the rotor parented to itself is flagged, «Разорвать» clears the key.
        await setEntityKeys(named.id, [["parentname", named.targetname!]]);
        const loops = ((await checkProblems()) ?? []).filter((p) => p.kind === "parent_loop");
        await fixProblems(loops);
        const loopsLeft = ((await checkProblems()) ?? []).filter((p) => p.kind === "parent_loop").length;
        await undo();
        await undo();
        void api.log(`autoisolate: parent loop: found ${loops.length} (${loops[0]?.message}), left ${loopsLeft}`);
        if (loops.length !== 1 || loops[0].object !== named.id || loopsLeft !== 0) throw new Error(`autoisolate: петля привязки: найдено ${loops.length}, осталось ${loopsLeft}`);
        // Rotating pivot: the rotor's origin moved far away is flagged, «Origin в центр» brings it back into its brushes.
        if (named.classname.toLowerCase() === "func_rotating") {
          // The map's second rotor really has its axis far from its brushes; it stays found throughout.
          const pivotBefore = ((await checkProblems()) ?? []).filter((p) => p.kind === "pivot_outside" && p.object !== named.id).length;
          await setEntityKeys(named.id, [["origin", "5000 5000 5000"]]);
          const far = ((await checkProblems()) ?? []).filter((p) => p.kind === "pivot_outside" && p.object === named.id);
          await fixProblems(far);
          const fixedAt = ((current.current ?? mr).doc.entity_details(named.id) as { keyvalues: [string, string][] }).keyvalues.find(([k]) => k === "origin")?.[1];
          const pivotLeft = ((await checkProblems()) ?? []).filter((p) => p.kind === "pivot_outside" && p.object === named.id).length;
          await undo();
          await undo();
          void api.log(`autoisolate: rotor pivot: other rotors found ${pivotBefore}, far ${far.length}, fixed to «${fixedAt}», left ${pivotLeft}`);
          if (far.length !== 1 || pivotLeft !== 0) throw new Error(`autoisolate: ось ротора: до ${pivotBefore}, найдено ${far.length}, осталось ${pivotLeft}`);
        }
        // Plain duplicate of a brush entity: the copy comes back selected through all its brushes, so a move takes all of it.
        {
          const rotorSolids = Array.from((current.current ?? mr).doc.entity_solids(named.id) as Uint32Array);
          selectIds(rotorSolids);
          await cloneSelection([0, 0, 0]);
          const doc = (current.current ?? mr).doc;
          const owners = new Set([...selection.current].map((id) => doc.entity_of_solid(id) || id));
          const copy = [...owners][0];
          const copySolids = copy !== undefined ? (doc.entity_solids(copy) as Uint32Array).length : 0;
          const picked = selection.current.size;
          await undo();
          void api.log(`autoisolate: duplicate brush entity: selected ${picked} brushes of copy ${copy} (${copySolids} brushes), owners ${[...owners].join(",")}`);
          if (owners.size !== 1 || copy === named.id || picked !== copySolids || !picked) throw new Error(`autoisolate: копия брашевой энтити выделена не целиком: ${picked} из ${copySolids}`);
          // Copy and paste the same: the pasted brush entity is selected through all its brushes too.
          selectIds(rotorSolids);
          copySelection();
          await pasteClipboard();
          const doc2 = (current.current ?? mr).doc;
          const owners2 = new Set([...selection.current].map((id) => doc2.entity_of_solid(id) || id));
          const pasted = [...owners2][0];
          const pastedSolids = pasted !== undefined ? (doc2.entity_solids(pasted) as Uint32Array).length : 0;
          const picked2 = selection.current.size;
          await undo();
          void api.log(`autoisolate: paste brush entity: selected ${picked2} of ${pastedSolids} brushes of ${pasted}`);
          if (owners2.size !== 1 || pasted === named.id || picked2 !== pastedSolids || !picked2)
            throw new Error(`autoisolate: вставленная брашевая энтити выделена не целиком: ${picked2} из ${pastedSolids}`);
        }
        // Duplicate with fresh names: caller (with an output to the rotor) and rotor copied together; the copies get
        // the next free names and the copy's output aims at the copied rotor, not the original.
        {
          await setEntityConnections(caller.id, [{ output: "OnUser1", target: named.targetname!, input: "Toggle", parameter: "", delay: 0, times_to_fire: -1 }]);
          await setEntityKeys(caller.id, [["targetname", "caller_a"]]);
          const rotorSolids = Array.from((current.current ?? mr).doc.entity_solids(named.id) as Uint32Array);
          const beforeIds = new Set((current.current ?? mr).entities.map((e) => e.id));
          selectIds([caller.id, ...rotorSolids]);
          await duplicateUnique();
          const doc = (current.current ?? mr).doc;
          const fresh = (current.current ?? mr).entities.filter((e) => !beforeIds.has(e.id));
          const copyCaller = fresh.find((e) => e.classname === caller.classname);
          const copyRotor = fresh.find((e) => e.classname === named.classname);
          const aimed = copyCaller ? (doc.entity_details(copyCaller.id) as { connections: { target: string }[] }).connections[0]?.target : undefined;
          await undo();
          await undo();
          await undo();
          void api.log(`autoisolate: duplicate unique: caller copy «${copyCaller?.targetname}», rotor copy «${copyRotor?.targetname}», copy output aims at «${aimed}»`);
          if (!copyCaller || !copyRotor || copyCaller.targetname !== "caller_a_2" || copyRotor.targetname === named.targetname || aimed !== copyRotor.targetname)
            throw new Error(`autoisolate: дублирование с новыми именами: ${copyCaller?.targetname}, ${copyRotor?.targetname}, ${aimed}`);
        }
        // A name with a space: found, «Исправить имя» renames the entity and the output aimed at it together.
        {
          await setEntityKeys(named.id, [["targetname", "wind mill"]]);
          await setEntityConnections(caller.id, [{ output: "OnUser1", target: "wind mill", input: "Start", parameter: "", delay: 0, times_to_fire: -1 }]);
          const bad = ((await checkProblems()) ?? []).filter((p) => p.kind === "bad_name");
          await fixProblems(bad);
          const doc = (current.current ?? mr).doc;
          const newName = (doc.entity_details(named.id) as { keyvalues: [string, string][] }).keyvalues.find(([k]) => k === "targetname")?.[1];
          const aimed = (doc.entity_details(caller.id) as { connections: { target: string }[] }).connections[0]?.target;
          await undo();
          await undo();
          await undo();
          void api.log(`autoisolate: bad name: found ${bad.length}, renamed to «${newName}», output now aims at «${aimed}»`);
          if (bad.length !== 1 || newName !== "wind_mill" || aimed !== "wind_mill") throw new Error(`autoisolate: имя с пробелом: ${bad.length}, ${newName}, ${aimed}`);
        }
        // An input with a typo: "Toogle" to the rotor is found with the suggestion Toggle, and the fix puts it in.
        {
          await setEntityConnections(caller.id, [{ output: "OnUser1", target: named.targetname!, input: "Toogle", parameter: "", delay: 0, times_to_fire: -1 }]);
          const typo = ((await checkProblems()) ?? []).filter((p) => p.kind === "bad_input" && p.object === caller.id);
          await fixProblems(typo);
          const input = ((current.current ?? mr).doc.entity_details(caller.id) as { connections: { input: string }[] }).connections[0]?.input;
          await undo();
          await undo();
          void api.log(`autoisolate: bad input: found ${typo.length} (${typo[0]?.message}), fixed to «${input}»`);
          if (typo.length !== 1 || input !== "Toggle") throw new Error(`autoisolate: опечатка во входе: ${typo.length}, ${input}`);
        }
        // An output with a typo: "OnUsr1" on a lamp (lights fire OnUser1) is found with the suggestion OnUser1.
        {
          const lampO = (current.current ?? mr).entities.find((e) => e.classname === "light");
          if (lampO) {
            await setEntityConnections(lampO.id, [{ output: "OnUsr1", target: named.targetname!, input: "Toggle", parameter: "", delay: 0, times_to_fire: -1 }]);
            const typo = ((await checkProblems()) ?? []).filter((p) => p.kind === "bad_output" && p.object === lampO.id);
            await fixProblems(typo);
            const output = ((current.current ?? mr).doc.entity_details(lampO.id) as { connections: { output: string }[] }).connections[0]?.output;
            await undo();
            await undo();
            void api.log(`autoisolate: bad output: found ${typo.length} (${typo[0]?.message}), fixed to «${output}»`);
            if (typo.length !== 1 || output !== "OnUser1") throw new Error(`autoisolate: опечатка в выходе: ${typo.length}, ${output}`);
            // The outputs tab of the lamp says it in words on the card: wrong output and missing input.
            await setEntityConnections(lampO.id, [{ output: "OnUsr1", target: named.targetname!, input: "Toogle", parameter: "", delay: 0, times_to_fire: -1 }]);
            selectIds([lampO.id]);
            openProperties();
            let warns = 0;
            for (let i = 0; i < 25 && warns < 2; i++) {
              await new Promise((r) => setTimeout(r, 200));
              const tab = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Выходы"));
              if (tab && !tab.getAttribute("aria-pressed")?.includes("true")) (tab as HTMLButtonElement).click();
              warns = document.querySelectorAll(".io-warn").length;
            }
            const texts = [...document.querySelectorAll(".io-warn")].map((w) => w.textContent?.trim());
            await undo();
            selectIds([]);
            void api.log(`autoisolate: I/O card warnings: ${texts.join(" | ")}`);
            if (warns < 2) throw new Error(`autoisolate: на карточке выхода нет предупреждений (${warns})`);
          }
        }
      }
      // Frame all: the 3D camera ends up outside the map's box looking in.
      frameAll();
      await new Promise((r) => setTimeout(r, 200));
      void api.log(
        `autoisolate: frame all, camera at ${Array.from(session.current?.camera.position ?? [])
          .map((v) => Math.round(v))
          .join(" ")}`,
      );
      // Select random: of everything visible, half the objects stay (brush entities whole), all from the old selection.
      {
        const mq = current.current ?? m;
        selectAllVisible(false);
        const ownersOf = () => new Set([...selection.current].map((id) => mq.doc.entity_of_solid(id) || id));
        const all = ownersOf();
        selectRandom();
        const half = ownersOf();
        const strays = [...half].filter((id) => !all.has(id)).length;
        selectIds([]);
        void api.log(`autoisolate: select random: ${half.size} of ${all.size}, strays ${strays}`);
        if (half.size !== Math.max(1, Math.round(all.size / 2)) || strays) throw new Error(`autoisolate: случайная половина: ${half.size} из ${all.size}, чужих ${strays}`);
      }
      // Reveal and select (Blender's Alt+H): a hidden lamp and a hidden brush entity come back selected, nothing else.
      {
        const mh = current.current ?? m;
        const lamp = mh.entities.find((e) => e.classname === "light");
        const brushEnt = mh.entities.find((e) => (mh.doc.entity_solids(e.id) as Uint32Array).length);
        if (lamp && brushEnt) {
          selectIds([lamp.id, ...Array.from(mh.doc.entity_solids(brushEnt.id) as Uint32Array)]);
          await hideSelection();
          selectIds([]);
          await revealAndSelect();
          const owners = new Set([...selection.current].map((id) => (current.current ?? mh).doc.entity_of_solid(id) || id));
          const stillHidden = ((current.current ?? mh).doc.hidden_ids() as Uint32Array).length;
          selectIds([]);
          void api.log(`autoisolate: reveal and select: ${[...owners].join(",")}, still hidden ${stillHidden}`);
          if (owners.size !== 2 || !owners.has(lamp.id) || !owners.has(brushEnt.id) || stillHidden)
            throw new Error(`autoisolate: показать и выделить: ${[...owners].join(",")}, скрыто ${stillHidden}`);
        }
      }
      // Problems with hidden objects: the panel says how many are hidden and its button shows them all.
      {
        const mh2 = current.current ?? m;
        const lamp = mh2.entities.find((e) => e.classname === "light");
        if (lamp) {
          selectIds([lamp.id]);
          await hideSelection();
          selectIds([]);
          setPanel("problems");
          await checkProblems();
          let note: Element | null = null;
          for (let i = 0; i < 20 && !note; i++) {
            await new Promise((r) => setTimeout(r, 150));
            note = document.querySelector(".problems-hidden");
          }
          const text = note?.textContent ?? "";
          (note?.querySelector("button") as HTMLButtonElement | null)?.click();
          await new Promise((r) => setTimeout(r, 500));
          const left = ((current.current ?? mh2).doc.hidden_ids() as Uint32Array).length;
          if (left) await showAll();
          void api.log(`autoisolate: problems hidden note «${text}», hidden after its button ${left}`);
          if (!text.includes("Скрыто 1") || left) throw new Error(`autoisolate: заметка о скрытых в «Проблемах»: «${text}», осталось ${left}`);
        }
      }
      // Stuck spawn: the player start sunk 32 units into the floor shows up in problems; standing on it again it does not.
      const ms = current.current ?? m;
      const start = ms.entities.find((e) => e.classname === "info_player_start");
      if (start) {
        selectIds([start.id]);
        await new Promise((r) => setTimeout(r, 200));
        const all0 = (await checkProblems()) ?? [];
        // An ordinary small map is nowhere near the Source limits.
        if (all0.some((p) => p.kind === "near_limit"))
          throw new Error(
            `autoisolate: ложная тревога о лимитах: ${all0
              .filter((p) => p.kind === "near_limit")
              .map((p) => p.message)
              .join("; ")}`,
          );
        const before = all0.filter((p) => p.kind === "stuck_spawn").length;
        await commitTranslate(selection.current, [0, 0, -32]);
        const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "stuck_spawn" && p.object === start.id);
        const after = found.length;
        void api.log(`autoisolate: stuck spawn before ${before}, sunk ${after}: ${found[0]?.message ?? ""}`);
        if (before !== 0 || after !== 1) throw new Error(`autoisolate: проверка застрявшего старта: до ${before}, в полу ${after}`);
        // The «Поднять» fix stands it on the floor it sank into (its feet on the brush top, not where it stood before).
        const z0 = start.origin?.[2] ?? 0;
        await fixProblems(found);
        const back = (current.current ?? ms).entities.find((e) => e.id === start.id)?.origin?.[2];
        const still = ((await checkProblems()) ?? []).filter((p) => p.kind === "stuck_spawn").length;
        void api.log(`autoisolate: lifted start to z ${back} (was ${z0}, sunk to ${z0 - 32}), still stuck ${still}`);
        if (back === undefined || back <= z0 - 32 || still !== 0) throw new Error(`autoisolate: «Поднять» поставил старт на ${back}, застрявших ${still}`);
        // The sink and the lift go back, so the saved copy keeps the start where it was.
        await undo();
        await undo();
        // Physics prop sunk into the floor under the start: found, «Вытащить» stands it on the floor top.
        {
          const made = (current.current ?? ms).doc.create_entity("prop_physics", new Float64Array([0, 0, -8]), [["model", "models/props_c17/oildrum001.mdl"]], new Uint8Array([220, 30, 220])) as
            { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made) {
            const pid = made.changed_ids[0];
            const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "prop_in_solid" && p.object === pid);
            await fixProblems(found);
            const z = (current.current ?? ms).entities.find((e) => e.id === pid)?.origin?.[2];
            const left = ((await checkProblems()) ?? []).filter((p) => p.kind === "prop_in_solid" && p.object === pid).length;
            await undo();
            await undo();
            void api.log(`autoisolate: physics prop in floor: found ${found.length} (${found[0]?.detail}), z after fix ${z}, left ${left}`);
            if (found.length !== 1 || z === undefined || z < -1 || left !== 0) throw new Error(`autoisolate: проп в полу: найдено ${found.length}, z ${z}, осталось ${left}`);
          }
        }
        // prop_static with a model not built for it: found, «В prop_dynamic» changes the class; a real static model is left alone.
        {
          const names = (await api.listModels("props_c17/", 200)).names;
          const flags = await api.modelFlags(names);
          const dynamicModel = names.find((_, i) => flags[i] !== null && !(flags[i]! & 0x10));
          const staticModel = names.find((_, i) => flags[i] !== null && !!(flags[i]! & 0x10));
          if (dynamicModel && staticModel) {
            const mk = (model: string, x: number) =>
              (current.current ?? ms).doc.create_entity("prop_static", new Float64Array([x, 0, 0]), [["model", model]], new Uint8Array([220, 30, 220])) as { changed_ids: number[] } | undefined;
            const bad = mk(dynamicModel, 64);
            await applyEdit();
            mk(staticModel, -64);
            await applyEdit();
            const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "static_not_static");
            await fixProblems(found.filter((p) => p.object === bad?.changed_ids[0]));
            const cls = (current.current ?? ms).entities.find((e) => e.id === bad?.changed_ids[0])?.classname;
            await undo();
            await undo();
            await undo();
            void api.log(
              `autoisolate: prop_static check: ${dynamicModel} (flags ${flags[names.indexOf(dynamicModel)]}) and ${staticModel}: found ${found.map((p) => p.object).join(",")}, fixed to ${cls}`,
            );
            if (found.length !== 1 || found[0].object !== bad?.changed_ids[0] || cls !== "prop_dynamic")
              throw new Error(`autoisolate: prop_static с чужой моделью: найдено ${found.length}, класс ${cls}`);
          } else void api.log(`autoisolate: prop_static check skipped: no pair of models in props_c17/`);
        }
        // Placing a model picks its class: a model without $staticprop does not land as prop_static.
        {
          const names = (await api.listModels("props_c17/", 200)).names;
          const flags = await api.modelFlags(names);
          const dynamicModel = names.find((_, i) => flags[i] !== null && !(flags[i]! & 0x10));
          const staticModel = names.find((_, i) => flags[i] !== null && !!(flags[i]! & 0x10));
          if (dynamicModel && staticModel) {
            const placed: string[] = [];
            for (const model of [dynamicModel, staticModel]) {
              const before = new Set((current.current ?? ms).entities.map((e) => e.id));
              await placeModelRef.current(model);
              const made = (current.current ?? ms).entities.find((e) => !before.has(e.id));
              placed.push(made?.classname ?? "none");
            }
            await undo();
            await undo();
            void api.log(`autoisolate: placed ${dynamicModel} as ${placed[0]}, ${staticModel} as ${placed[1]}`);
            if (placed[0] === "prop_static" || placed[0] === "none" || placed[1] !== "prop_static") throw new Error(`autoisolate: класс пропа по модели: ${placed.join(", ")}`);
          }
        }
        // Camera look with the middle button: the shell keeps the cursor (no web Pointer Lock), the camera turns
        // from the movement deltas, and an edge move asks for a warp back to the middle without breaking anything.
        {
          const cv = document.querySelector<HTMLCanvasElement>("canvas.viewport");
          const cam = session.current?.camera;
          if (cv && cam) {
            const r = cv.getBoundingClientRect();
            const yaw0 = cam.yaw;
            cv.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 1, buttons: 4, clientX: r.left + 100, clientY: r.top + 100 }));
            await new Promise((res) => setTimeout(res, 150));
            const captured = document.documentElement.classList.contains("look-capture");
            window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 4, clientX: r.left + 140, clientY: r.top + 100, movementX: 40, movementY: 0 }));
            const turned = cam.yaw !== yaw0;
            // Near the window's edge: a warp is requested; the moves until the cursor is back at the middle are ignored.
            window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 4, clientX: 10, clientY: r.top + 100, movementX: -130, movementY: 0 }));
            const yaw1 = cam.yaw;
            window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, buttons: 4, clientX: 20, clientY: r.top + 100, movementX: 10, movementY: 0 }));
            const ignoredWhileWarping = cam.yaw === yaw1;
            window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 1, buttons: 0, clientX: 20, clientY: r.top + 100 }));
            await new Promise((res) => setTimeout(res, 150));
            const released = !document.documentElement.classList.contains("look-capture");
            void api.log(`autoisolate: camera look: captured ${captured}, turned ${turned}, ignored while warping ${ignoredWhileWarping}, released ${released}`);
            if (!captured || !turned || !ignoredWhileWarping || !released) throw new Error("autoisolate: захват курсора камерой не сработал");
          }
        }
        // Notes: one pinned at the selection shows up in the sidecar list and over the 3D view, then goes away.
        {
          const before = projectMetaRef.current.pins.length;
          addNoteHere("autotest");
          await new Promise((r) => setTimeout(r, 400));
          const pins = projectMetaRef.current.pins;
          const tag = [...document.querySelectorAll<HTMLElement>(".note-pin")].find((el) => el.textContent === "autotest");
          void api.log(`autoisolate: notes: ${before} → ${pins.length}, last ${JSON.stringify(pins.at(-1))}, pin tag ${!!tag}`);
          if (pins.length !== before + 1 || pins.at(-1)?.text !== "autotest") throw new Error(`autoisolate: заметки: ${before} → ${pins.length}`);
          setNotes(pins.filter((n) => n.text !== "autotest"));
          await new Promise((r) => setTimeout(r, 200));
          if (projectMetaRef.current.pins.length !== before) throw new Error("autoisolate: заметки: удаление не сработало");
          // A note at a given point (the assistant's add_note with pos, the problems list) keeps the exact place.
          addNoteAt([128, -256, 64], "autotest-2d");
          await new Promise((r) => setTimeout(r, 200));
          const at = projectMetaRef.current.pins.at(-1);
          if (!at || at.text !== "autotest-2d" || at.pos.join() !== "128,-256,64") throw new Error(`autoisolate: заметка в точке: ${JSON.stringify(at)}`);
          void api.log(`autoisolate: notes: at point ${at.pos.join(" ")}`);
          setNotes(projectMetaRef.current.pins.filter((n) => n.text !== "autotest-2d"));
          await new Promise((r) => setTimeout(r, 200));
          if (projectMetaRef.current.pins.length !== before) throw new Error("autoisolate: заметки в точке: удаление не сработало");
        }
        // Multi-entity keys: one key set on two lights at once, one undo step takes it off both.
        {
          const m = current.current ?? ms;
          const lights = m.entities.filter((x) => !x.brush && x.origin).slice(0, 2);
          if (lights.length === 2) {
            const ids = lights.map((x) => x.id);
            const before = history(m).undo_labels.length;
            await setKeysOnEntities(ids, [["gme_autotest", "1"]]);
            const has = ids.map((id) => ((current.current ?? ms).doc.entity_details(id) as EntityDetails | undefined)?.keyvalues.some(([k, v]) => k === "gme_autotest" && v === "1"));
            const after = history(current.current ?? ms).undo_labels.length;
            void api.log(`autoisolate: multi keys: set on ${ids.join(",")} → ${has.join(",")}, undo steps ${before} → ${after}`);
            if (!has.every(Boolean) || after !== before + 1) throw new Error(`autoisolate: общие свойства: ключ у ${has.filter(Boolean).length} из 2, шагов ${before} → ${after}`);
            await undo();
            const gone = ids.every((id) => !((current.current ?? ms).doc.entity_details(id) as EntityDetails | undefined)?.keyvalues.some(([k]) => k === "gme_autotest"));
            if (!gone) throw new Error("autoisolate: общие свойства: отмена не убрала ключ у обеих энтити");
          } else void api.log(`autoisolate: multi keys: only ${lights.length} point entities, skipped`);
        }
        // Undo steps: the history lists every step; a jump of two back and two forward returns to the same state.
        {
          const m = current.current ?? ms;
          const h0 = history(m);
          if (h0.undo_labels.length >= 2) {
            const solids0 = m.mesh.solidIds.length;
            await jumpHistory(-2);
            const h1 = history(current.current ?? ms);
            await jumpHistory(2);
            const h2 = history(current.current ?? ms);
            void api.log(
              `autoisolate: undo steps: ${h0.undo_labels.length} (last «${h0.undo_labels.at(-1)}»), after -2 redo ${h1.redo_labels.length}, after +2 undo ${h2.undo_labels.length}/redo ${h2.redo_labels.length}`,
            );
            if (
              h1.redo_labels.length !== h0.redo_labels.length + 2 ||
              h2.undo_labels.length !== h0.undo_labels.length ||
              h2.redo_labels.length !== h0.redo_labels.length ||
              (current.current ?? ms).mesh.solidIds.length !== solids0
            )
              throw new Error("autoisolate: список шагов отмены: переход на два шага назад и вперёд не вернул состояние");
          } else void api.log(`autoisolate: undo steps: only ${h0.undo_labels.length}, jump skipped`);
        }
        // Generators: an arch is grouped and remembered; a rebuild with more sides replaces the group; two undos restore the map.
        {
          const m = current.current ?? ms;
          const before = m.mesh.solidIds.length;
          const ok = await createGenerated({
            kind: "arch",
            bounds: [
              [8192, 8192, 0],
              [8448, 8448, 128],
            ],
            axis: 2,
            sides: 8,
            wall: 16,
            arc: 180,
            step: 16,
            reverse: false,
            material: "dev/dev_measuregeneric01",
          });
          const rec = projectMetaRef.current.generators.at(-1);
          const made = rec ? (m.doc.group_members(rec.group) as Uint32Array).length : 0;
          void api.log(`autoisolate: generator: created ${ok}, record ${JSON.stringify(rec)}, members ${made}`);
          if (!ok || !rec || rec.kind !== "arch" || made !== 8) throw new Error(`autoisolate: генератор: арка ${ok}, запись ${!!rec}, брашей ${made}, ждали 8`);
          await regenerateGenerator(rec, { sides: 12 });
          const rec2 = projectMetaRef.current.generators.at(-1);
          const made2 = rec2 ? ((current.current ?? ms).doc.group_members(rec2.group) as Uint32Array).length : 0;
          void api.log(`autoisolate: generator: rebuilt sides ${rec2?.sides}, group ${rec2?.group}, members ${made2}`);
          if (!rec2 || rec2.sides !== 12 || made2 !== 12 || rec2.group === rec.group) throw new Error(`autoisolate: генератор: после перестройки ${made2} брашей, ждали 12`);
          await undo();
          await undo();
          const after = (current.current ?? ms).mesh.solidIds.length;
          if (after !== before) throw new Error(`autoisolate: генератор: после двух отмен ${after} брашей, было ${before}`);
          if (projectMetaRef.current.generators.some((g) => g.group === rec2.group)) detachGenerator(rec2);
        }
        // Visleaves: the BSP next to the scratch map gives leaves with clusters; the overlay toggles on and off.
        {
          const path = currentPath.current;
          if (path) {
            let leaves = 0;
            try {
              const rep = await api.bspLeaves(path.replace(/\.vmf$/i, ".bsp"));
              leaves = rep.leaves.length;
              void api.log(`autoisolate: visleaves: ${leaves} leaves, ${rep.clusters} clusters, busiest sees ${rep.maxVisible}`);
              if (!leaves || !rep.clusters || rep.maxVisible < 1) throw new Error(`autoisolate: визлифы: ${leaves} лифов, ${rep.clusters} кластеров, максимум ${rep.maxVisible}`);
            } catch (err) {
              if (String(err).includes("автоисolate") || String(err).includes("autoisolate")) throw err;
              void api.log(`autoisolate: visleaves: no BSP (${String(err).slice(0, 80)})`);
            }
            if (leaves) {
              const n = await loadLeaves();
              showLeaves(true);
              await new Promise((r) => setTimeout(r, 200));
              showLeaves(false);
              if (n !== leaves) throw new Error(`autoisolate: визлифы: загружено ${n}, ждали ${leaves}`);
            }
          }
        }
        // Vertex snapping: V held while the lamp is dragged in the top view lands it on a brush corner.
        {
          const m = current.current ?? ms;
          const top = canvas2dRefs.current.top;
          const view = session.current?.views.top;
          const lamp = m.entities.find((x) => x.classname === "light" && x.origin);
          const solidId = m.mesh.solidIds[0];
          if (top && view && lamp && solidId !== undefined) {
            selectObject(lamp.id);
            await new Promise((r) => setTimeout(r, 400));
            const verts = m.doc.solid_vertices(solidId) as Float32Array;
            const [ax, ay] = view.camera.axes;
            const corner: [number, number] = [verts[ax], verts[ay]];
            const rect = top.getBoundingClientRect();
            const upp = view.camera.unitsPerPixel;
            const client = (w2: [number, number]) => {
              const css = view.camera.worldToCss(w2);
              return [rect.left + css[0], rect.top + css[1]] as const;
            };
            const from = client([lamp.origin![ax], lamp.origin![ay]]);
            const to = client([corner[0] + 3 * upp, corner[1] - 2 * upp]);
            const ev = (type: string, x: number, y: number, buttons: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons });
            window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyV", key: "v", bubbles: true }));
            {
              const probe = snapToVertex(m, selectedIndices(), [corner[0] + 3 * upp, corner[1] - 2 * upp, 0], [ax, ay], [corner[0] + 3 * upp, corner[1] - 2 * upp], 12 * upp, null);
              void api.log(
                `autoisolate: vertex snap probe: held ${heldKeys.has("KeyV")}, indices ${selectedIndices().join(",")}, mine ${probe.lists.mine.length / 2}, others ${probe.lists.others.length / 2}, target ${probe.target?.join(" ")}, upp ${upp}`,
              );
            }
            top.dispatchEvent(ev("mousedown", from[0], from[1], 1));
            for (let i = 1; i <= 4; i++) {
              window.dispatchEvent(ev("mousemove", from[0] + ((to[0] - from[0]) * i) / 4, from[1] + ((to[1] - from[1]) * i) / 4, 1));
              await new Promise((r) => setTimeout(r, 30));
            }
            window.dispatchEvent(ev("mouseup", to[0], to[1], 0));
            window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyV", key: "v", bubbles: true }));
            await new Promise((r) => setTimeout(r, 500));
            const after = (current.current ?? ms).entities.find((x) => x.id === lamp.id)?.origin;
            void api.log(`autoisolate: vertex snap: lamp ${lamp.origin?.join(" ")} → ${after?.join(" ")}, corner ${corner.join(" ")} (axes ${ax} ${ay})`);
            if (!after || Math.abs(after[ax] - corner[0]) > 0.01 || Math.abs(after[ay] - corner[1]) > 0.01)
              throw new Error(`autoisolate: привязка к вершине: лампа ${after?.join(" ")}, ждали угол ${corner.join(" ")}`);
            await undo();
            const restored = (current.current ?? ms).entities.find((x) => x.id === lamp.id)?.origin;
            void api.log(`autoisolate: vertex snap undo: lamp ${restored?.join(" ")}, undo steps ${JSON.stringify(m.doc.history())}`.slice(0, 200));
          }
        }
        // History comparison: a saved version, a moved lamp → one changed row; «revert» → none.
        {
          const m = current.current ?? ms;
          const path = currentPath.current;
          const lamp = m.entities.find((x) => x.classname === "light" && x.origin);
          if (path && lamp) {
            selectIds([]);
            openPanel("history");
            const saved = await api.saveHistory(path, m.doc.to_vmf(), 50);
            const entry = (await api.listHistory(path)).find((x) => x.path === saved);
            if (!entry) throw new Error("autoisolate: история: сохранённая версия не в списке");
            const moved = await runEdit(() => m.doc.translate(Uint32Array.from([lamp.id]), 64, 0, 0, false));
            await compareHistoryEntry(entry);
            void api.log(
              `autoisolate: history step: moved ${!!moved}, lamp ${(current.current ?? ms).entities.find((x) => x.id === lamp.id)?.origin?.join(" ")}, error «${document.querySelector(".status .bad")?.textContent ?? ""}», busy «${document.querySelector(".busy")?.textContent ?? ""}»`,
            );
            let rows = -1;
            for (let i = 0; i < 20; i++) {
              await new Promise((r) => setTimeout(r, 150));
              rows = document.querySelectorAll(".diff-row").length;
              if (rows === 1) break;
            }
            const text = document.querySelector(".diff-row")?.textContent ?? "";
            void api.log(`autoisolate: history diff: ${rows} rows: ${text.slice(0, 80)}`);
            if (rows !== 1 || !text.includes("origin")) throw new Error(`autoisolate: сравнение версий: ${rows} строк «${text.slice(0, 60)}», ждали одну с origin`);
            (document.querySelector(".diff-row .icon-btn") as HTMLButtonElement | null)?.click();
            for (let i = 0; i < 20; i++) {
              await new Promise((r) => setTimeout(r, 150));
              rows = document.querySelectorAll(".diff-row").length;
              if (rows === 0) break;
            }
            const back = (current.current ?? ms).entities.find((x) => x.classname === "light" && x.origin && Math.abs(x.origin[0] - lamp.origin![0]) < 0.01);
            void api.log(`autoisolate: history revert: ${rows} rows left, lamp back ${!!back}`);
            if (rows !== 0 || !back) throw new Error(`autoisolate: возврат из версии: ${rows} строк, лампа на месте ${!!back}`);
            closeHistoryDiff();
            // The restored lamp carries a new id; two undos (restore, move) put the original back before the save check.
            await undo();
            await undo();
            await api.clearHistory(path);
          }
        }
        // Outliner: the «Энтити» heading counts every entity; the eye of the first entity row hides it and «show all» brings it back.
        {
          openPanel("outliner");
          const m = current.current ?? ms;
          let badge = "";
          for (let i = 0; i < 25; i++) {
            await new Promise((r) => setTimeout(r, 200));
            badge = document.querySelector('.outline-row[data-key="section:entities"] .badge')?.textContent ?? "";
            if (badge === String(m.entities.length)) break;
          }
          void api.log(`autoisolate: outliner: entities badge ${badge} for ${m.entities.length} entities, ${document.querySelectorAll(".outline-row").length} rows`);
          if (badge !== String(m.entities.length)) throw new Error(`autoisolate: структура: счётчик энтити ${badge}, ждали ${m.entities.length}`);
          const classRow = [...document.querySelectorAll<HTMLElement>(".outline-row.class")][0];
          classRow?.querySelector<HTMLButtonElement>(".outline-chev")?.click();
          await new Promise((r) => setTimeout(r, 250));
          const entRow = document.querySelector<HTMLElement>(".outline-row.entity");
          if (!entRow) throw new Error("autoisolate: структура: класс не раскрылся до строк энтити");
          const hiddenBefore = (m.doc.hidden_ids() as Uint32Array).length;
          [...entRow.querySelectorAll<HTMLButtonElement>(".outline-ctl")].pop()?.click();
          await new Promise((r) => setTimeout(r, 400));
          const hiddenAfter = ((current.current ?? ms).doc.hidden_ids() as Uint32Array).length;
          void api.log(`autoisolate: outliner: hidden ${hiddenBefore} → ${hiddenAfter}`);
          if (hiddenAfter <= hiddenBefore) throw new Error(`autoisolate: структура: глаз не скрыл энтити (${hiddenBefore} → ${hiddenAfter})`);
          showAll();
          await new Promise((r) => setTimeout(r, 400));
          if ((current.current ?? ms).doc.hidden_ids().length !== hiddenBefore) throw new Error("autoisolate: структура: «показать всё» не вернуло объект");
        }
        // Logic graph: one box per linked entity, one line per pair, as many as the map's outputs say.
        {
          openPanel("logic");
          const m = current.current ?? ms;
          const conns: GraphConnection[] = [];
          for (const en of m.entities)
            ((m.doc.entity_details(en.id) as EntityDetails | undefined)?.connections ?? []).forEach((c, index) =>
              conns.push({ source: en.id, index, output: c.output, target: c.target, input: c.input, parameter: c.parameter, delay: c.delay, times: c.times_to_fire }),
            );
          const g = buildGraph(m.entities, conns);
          let nodes = -1;
          let edges = -1;
          for (let i = 0; i < 25; i++) {
            await new Promise((r) => setTimeout(r, 200));
            nodes = document.querySelectorAll(".logic-node").length;
            edges = document.querySelectorAll(".logic-edge").length;
            if (nodes === g.nodes.length && edges === g.edges.length) break;
          }
          void api.log(`autoisolate: logic graph: ${nodes} nodes, ${edges} edges (expected ${g.nodes.length}/${g.edges.length} from ${conns.length} connections, ${g.lonely} lonely)`);
          if (nodes !== g.nodes.length || edges !== g.edges.length) throw new Error(`autoisolate: граф связей: ${nodes}/${edges} узлов/связей, ждали ${g.nodes.length}/${g.edges.length}`);
          if (g.nodes.length && !document.querySelector(".logic-edge-label")?.textContent) throw new Error("autoisolate: граф связей без подписей на линиях");
        }
        // Textures «@»: the browser lists exactly the map's own materials.
        {
          openPanel("textures");
          const want = new Set((current.current ?? ms).mesh.materials).size;
          let shownCount = -1;
          for (let i = 0; i < 25; i++) {
            await new Promise((r) => setTimeout(r, 200));
            const btn = [...document.querySelectorAll("button")].find((b) => b.getAttribute("title")?.startsWith("Материалы этой карты")) as HTMLButtonElement | undefined;
            if (!btn) continue;
            if (!btn.classList.contains("active")) btn.click();
            await new Promise((r) => setTimeout(r, 200));
            shownCount = document.querySelectorAll("[data-material]").length;
            if (shownCount === want) break;
          }
          const back = [...document.querySelectorAll("button")].find((b) => b.getAttribute("title")?.startsWith("Материалы этой карты")) as HTMLButtonElement | undefined;
          if (back?.classList.contains("active")) back.click();
          void api.log(`autoisolate: textures «@»: ${shownCount} tiles for ${want} map materials`);
          if (shownCount !== want) throw new Error(`autoisolate: фильтр «@» показал ${shownCount} из ${want} материалов карты`);
        }
        // Models «@»: the library lists exactly the models of the map's props.
        {
          openPanel("models");
          const want = new Set((current.current ?? ms).entities.map((e) => e.model).filter((m): m is string => !!m && m.toLowerCase().endsWith(".mdl"))).size;
          let shownCount = -1;
          for (let i = 0; i < 25; i++) {
            await new Promise((r) => setTimeout(r, 200));
            const btn = [...document.querySelectorAll("button")].find((b) => b.getAttribute("title")?.startsWith("Модели этой карты")) as HTMLButtonElement | undefined;
            if (!btn) continue;
            if (!btn.classList.contains("active")) btn.click();
            await new Promise((r) => setTimeout(r, 200));
            shownCount = document.querySelectorAll("[data-model]").length;
            if (shownCount === want) break;
          }
          const back = [...document.querySelectorAll("button")].find((b) => b.getAttribute("title")?.startsWith("Модели этой карты")) as HTMLButtonElement | undefined;
          if (back?.classList.contains("active")) back.click();
          void api.log(`autoisolate: models «@»: ${shownCount} for ${want} map models`);
          if (shownCount !== want) throw new Error(`autoisolate: фильтр «@» моделей показал ${shownCount} из ${want}`);
        }
        // Find in library (Unreal's Ctrl+B): a prop brings its model up in the library, a brush its material in the textures.
        {
          const mb = current.current ?? ms;
          const prop = mb.entities.find((e) => e.model?.toLowerCase().endsWith(".mdl"));
          const brush = mb.mesh.solidIds[0];
          if (prop?.model && brush !== undefined) {
            selectIds([prop.id]);
            browseToAsset();
            let tile: Element | null = null;
            for (let i = 0; i < 25 && !tile; i++) {
              await new Promise((r) => setTimeout(r, 200));
              tile = document.querySelector(`[data-model="${CSS.escape(prop.model)}"]`);
            }
            const material = mb.doc.face_material(brush, (mb.doc.solid_sides(brush) as Uint32Array)[0]);
            selectIds([brush]);
            browseToAsset();
            let tex: Element | null = null;
            for (let i = 0; i < 25 && !tex; i++) {
              await new Promise((r) => setTimeout(r, 200));
              tex = [...document.querySelectorAll("[data-material]")].find((t) => t.getAttribute("data-material")?.toLowerCase() === material.toLowerCase()) ?? null;
            }
            selectIds([]);
            void api.log(`autoisolate: find in library: model ${prop.model} shown ${!!tile}, material ${material} shown ${!!tex}`);
            if (!tile || !tex) throw new Error(`autoisolate: «Найти в библиотеке»: модель ${!!tile}, текстура ${!!tex}`);
            // Select Actors Using This Asset: the material of that brush selects every brush that wears it.
            setCurrentMaterial(material);
            selectAssetUsers("material");
            const wearers = [...selection.current];
            selectIds([]);
            void api.log(`autoisolate: brushes with ${material}: ${wearers.length}`);
            if (!wearers.includes(brush)) throw new Error(`autoisolate: «браши с текстурой» не выбрали браш ${brush}`);
            // And the model branch: the library's current model selects every prop with it.
            setCurrentModel(prop.model);
            selectAssetUsers("model");
            const users = [...selection.current];
            const want = (current.current ?? mb).entities.filter((e) => e.model?.toLowerCase() === prop.model!.toLowerCase()).map((e) => e.id);
            selectIds([]);
            void api.log(`autoisolate: props with ${prop.model}: ${users.length} of ${want.length}`);
            if (users.length !== want.length || want.some((id) => !users.includes(id))) throw new Error(`autoisolate: «пропы с моделью» выбрали ${users.length} из ${want.length}`);
          }
        }
        // Palette search by key: "classname=light" selects every light class (light, light_environment…), "parentname=" none on this map.
        {
          const lights = (current.current ?? ms).entities.filter((e) => e.classname.toLowerCase().includes("light")).map((e) => e.id);
          const cmds = paletteExtra("classname=light");
          cmds.find((c) => c.id === "find-key-all")?.run();
          const got = [...selection.current];
          const none = paletteExtra("parentname=").find((c) => c.id === "find-key-all");
          // "==" takes the whole value: only the plain lights, not light_environment.
          const exact = (current.current ?? ms).entities.filter((e) => e.classname === "light").length;
          const exactTitle = paletteExtra("classname==light").find((c) => c.id === "find-key-all")?.title ?? "";
          if (!exactTitle.includes(`(${exact})`)) throw new Error(`autoisolate: точный поиск classname==light: «${exactTitle}», ламп ${exact}`);
          selectIds([]);
          void api.log(`autoisolate: key search: «${cmds[0]?.title}», selected ${got.length} of ${lights.length} lights; «${none?.title}»`);
          if (!lights.length || got.length !== lights.length || lights.some((id) => !got.includes(id)) || !none?.disabled)
            throw new Error(`autoisolate: поиск по ключу: выбрано ${got.length} из ${lights.length}`);
        }
        // The model library marks models that go in as prop_physics or prop_dynamic.
        {
          openPanel("models");
          let badges = 0;
          for (let i = 0; i < 30 && !badges; i++) {
            await new Promise((r) => setTimeout(r, 200));
            badges = document.querySelectorAll(".tile-class, .list-class").length;
          }
          const shown = document.querySelectorAll("[data-model]").length;
          void api.log(`autoisolate: model library class badges: ${badges} of ${shown} models`);
          if (!badges) throw new Error(`autoisolate: в библиотеке моделей нет меток класса (${shown} моделей)`);
        }
        // Copy/paste transform: the start takes the lamp's place and angles, then both go back.
        const lampT = (current.current ?? ms).entities.find((e) => e.classname === "light" && e.origin);
        if (lampT) {
          const angOf = (id: number) => ((current.current ?? ms).doc.entity_details(id) as { keyvalues: [string, string][] }).keyvalues.find(([k]) => k.toLowerCase() === "angles")?.[1] ?? "0 0 0";
          const turns = angOf(start.id) !== angOf(lampT.id);
          selectIds([lampT.id]);
          copyTransform();
          selectIds([start.id]);
          await pasteTransform("position");
          await pasteTransform("rotation");
          const docT = (current.current ?? ms).doc;
          const kv = (docT.entity_details(start.id) as { keyvalues: [string, string][] }).keyvalues;
          const lampKv = (docT.entity_details(lampT.id) as { keyvalues: [string, string][] }).keyvalues;
          const val = (list: [string, string][], key: string) => list.find(([k]) => k.toLowerCase() === key)?.[1];
          const nums = (t?: string) => (t ?? "").split(/\s+/).map(Number);
          const placed = nums(val(kv, "origin"));
          const want = nums(val(lampKv, "origin"));
          // Equal angles make no edit, so undo exactly what the paste added.
          await undo();
          if (turns) await undo();
          void api.log(`autoisolate: pasted transform onto start: ${placed.join(" ")} angles ${val(kv, "angles")} (lamp ${want.join(" ")}, ${val(lampKv, "angles")})`);
          if (placed.some((v, k) => Math.abs(v - want[k]) > 0.01) || val(kv, "angles") !== (val(lampKv, "angles") ?? "0 0 0"))
            throw new Error("autoisolate: вставка трансформа не поставила старт на место лампы");
        }
        // No cubemap: with the map's env_cubemap removed the finding appears, its fix puts one above the start; undo restores both.
        {
          const cubeIds = () => (current.current ?? ms).entities.filter((e) => e.classname === "env_cubemap").map((e) => e.id);
          const had = cubeIds();
          const falseAlarm = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_cubemap").length;
          if (had.length) {
            (current.current ?? ms).doc.delete_objects(new Uint32Array(had));
            await applyEdit();
          }
          const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_cubemap");
          await fixProblems(found);
          const now = cubeIds().length;
          const left = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_cubemap").length;
          await undo();
          if (had.length) await undo();
          const back = cubeIds().length;
          void api.log(`autoisolate: no cubemap: false alarm ${falseAlarm} with ${had.length}, found ${found.length} at ${found[0]?.detail}, after fix ${now}, left ${left}, restored ${back}`);
          if ((had.length && falseAlarm) || found.length !== 1 || now !== 1 || left !== 0 || back !== had.length)
            throw new Error(`autoisolate: нет кубмапа: ложных ${falseAlarm}, найдено ${found.length}, поставлено ${now}, осталось ${left}, вернулось ${back}`);
        }
        // Mirror: a lamp facing yaw 30, mirrored across X about itself, faces yaw 150.
        {
          const lampM = (current.current ?? ms).entities.find((e) => e.classname === "light" && e.origin);
          if (lampM) {
            await setEntityKeys(lampM.id, [["angles", "0 30 0"]]);
            await commitScale([lampM.id], lampM.origin as Vec3, [-1, 1, 1]);
            const mirrored = ((current.current ?? ms).doc.entity_details(lampM.id) as { keyvalues: [string, string][] }).keyvalues.find(([k]) => k === "angles")?.[1];
            await undo();
            await undo();
            void api.log(`autoisolate: mirrored lamp angles 0 30 0 -> ${mirrored}`);
            if (mirrored !== "0 150 0") throw new Error(`autoisolate: зеркало не развернуло лампу: ${mirrored}`);
          }
        }
        // Overlay: moved by 32 its projection frame (BasisOrigin) goes along, so the decal does not stay behind.
        {
          const made = (current.current ?? ms).doc.create_entity(
            "info_overlay",
            new Float64Array([0, 0, 1]),
            [
              ["material", "decals/lambdaspray_2a"],
              ["BasisOrigin", "0 0 1"],
              ["BasisNormal", "0 0 1"],
              ["BasisU", "1 0 0"],
              ["BasisV", "0 1 0"],
              ["StartU", "0"],
              ["EndU", "1"],
              ["StartV", "0"],
              ["EndV", "1"],
              ["uv0", "-32 -32 0"],
              ["uv1", "-32 32 0"],
              ["uv2", "32 32 0"],
              ["uv3", "32 -32 0"],
            ],
            new Uint8Array([220, 30, 220]),
          ) as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made) {
            const oid = made.changed_ids[0];
            await commitTranslate(new Set([oid]), [32, 0, 0]);
            const kvs = ((current.current ?? ms).doc.entity_details(oid) as { keyvalues: [string, string][] }).keyvalues;
            const basis = kvs.find(([k]) => k === "BasisOrigin")?.[1];
            // Moved onto the floor, it sticks to the face under it in the same undo step, as in Hammer.
            const stuck = kvs.find(([k]) => k === "sides")?.[1];
            await undo();
            await undo();
            const gone = !(current.current ?? ms).entities.some((e) => e.id === oid);
            void api.log(`autoisolate: overlay moved by 32: BasisOrigin «${basis}», sides «${stuck}», gone after two undos ${gone}`);
            if (basis !== "32 0 1") throw new Error(`autoisolate: оверлей не взял с собой BasisOrigin: ${basis}`);
            if (!stuck || !gone) throw new Error(`autoisolate: оверлей не прилип после сдвига (${stuck}) или отмена не в один шаг (${gone})`);
          }
        }
        // Overlay with stale faces: listed side 999999 does not exist; «Прилепить» writes the floor face under it.
        {
          const made = (current.current ?? ms).doc.create_entity(
            "info_overlay",
            new Float64Array([0, 0, 0]),
            [
              ["material", "decals/lambdaspray_2a"],
              ["sides", "999999"],
              ["BasisOrigin", "0 0 0"],
              ["BasisNormal", "0 0 1"],
              ["BasisU", "1 0 0"],
              ["BasisV", "0 1 0"],
              ["uv0", "-16 -16 0"],
              ["uv1", "-16 16 0"],
              ["uv2", "16 16 0"],
              ["uv3", "16 -16 0"],
            ],
            new Uint8Array([220, 30, 220]),
          ) as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made) {
            const oid = made.changed_ids[0];
            const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "overlay_sides" && p.object === oid);
            await fixProblems(found);
            const sides = ((current.current ?? ms).doc.entity_details(oid) as { keyvalues: [string, string][] }).keyvalues.find(([k]) => k === "sides")?.[1];
            const left = ((await checkProblems()) ?? []).filter((p) => p.kind === "overlay_sides" && p.object === oid).length;
            await undo();
            await undo();
            void api.log(`autoisolate: stale overlay: found ${found.length} (${found[0]?.message}), sides now «${sides}», left ${left}`);
            if (found.length !== 1 || !sides || sides === "999999" || left !== 0) throw new Error(`autoisolate: декаль не прилепилась: найдено ${found.length}, sides ${sides}, осталось ${left}`);
          }
        }
        // Stacked twins: a lamp cloned without a move is found, «Удалить лишние» removes the copy and keeps the lamp.
        {
          const lampD = (current.current ?? ms).entities.find((e) => e.classname === "light" && e.origin);
          if (lampD) {
            const before = (current.current ?? ms).entities.length;
            (current.current ?? ms).doc.clone_objects(new Uint32Array([lampD.id]), new Float64Array([0, 0, 0]));
            await applyEdit();
            const twins = ((await checkProblems()) ?? []).filter((p) => p.kind === "stacked_twins" && p.object === lampD.id);
            await fixProblems(twins);
            const after = (current.current ?? ms).entities.length;
            const kept = (current.current ?? ms).entities.some((e) => e.id === lampD.id);
            await undo();
            await undo();
            void api.log(`autoisolate: stacked twins: found ${twins.length} (${twins[0]?.message}), entities ${before} -> ${after}, lamp kept ${kept}`);
            if (twins.length !== 1 || after !== before || !kept) throw new Error(`autoisolate: двойники: найдено ${twins.length}, энтити ${before} -> ${after}, лампа ${kept}`);
          }
        }
        // Stacked brushes: a brush cloned in place is found among the extras and removed, its original kept.
        {
          const mb = current.current ?? ms;
          const brush = mb.mesh.solidIds.find((id) => !mb.doc.entity_of_solid(id));
          if (brush !== undefined) {
            const baseline = ((await checkProblems()) ?? []).filter((p) => p.kind === "stacked_brushes").length;
            const res = mb.doc.clone_objects(new Uint32Array([brush]), new Float64Array([0, 0, 0])) as { changed_ids: number[] } | undefined;
            await applyEdit();
            const copy = res?.changed_ids[0];
            const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "stacked_brushes");
            const listed = (found[0]?.detail ?? "").split(",").map(Number);
            await fixProblems(found);
            const ids = (current.current ?? mb).mesh.solidIds;
            const ok = copy !== undefined && listed.includes(copy) && !ids.includes(copy) && ids.includes(brush);
            await undo();
            await undo();
            void api.log(`autoisolate: stacked brushes: baseline ${baseline}, extras ${listed.join(",")}, copy ${copy} removed and original kept ${ok}`);
            if (baseline !== 0 || !ok) throw new Error(`autoisolate: браши-двойники: до ${baseline}, лишние ${listed.join(",")}, копия ${copy}`);
          }
        }
        // Route length: three path_track stops 128 and 96 apart; the path chain selection reports 224 units.
        {
          const mk = (name: string, next: string, at: [number, number, number]) =>
            (
              (current.current ?? ms).doc.create_entity(
                "path_track",
                new Float64Array(at),
                [["targetname", name], ...(next ? ([["target", next]] as [string, string][]) : [])],
                new Uint8Array([220, 30, 220]),
              ) as { changed_ids: number[] } | undefined
            )?.changed_ids[0];
          const a1 = mk("route_a", "route_b", [0, 0, 64]);
          mk("route_b", "route_c", [128, 0, 64]);
          mk("route_c", "", [128, 96, 64]);
          await applyEdit();
          if (a1 !== undefined) selectIds([a1]);
          selectPathChain();
          await new Promise((r) => setTimeout(r, 200));
          const said = [...document.querySelectorAll(".ok.list-text")].map((n) => n.textContent ?? "").find((t) => t.includes("маршрут")) ?? "";
          for (let i = 0; i < 3; i++) await undo();
          selectIds([]);
          void api.log(`autoisolate: route length: «${said}»`);
          if (!said.includes("маршрут 224 юнита") || !said.includes("3 остановки")) throw new Error(`autoisolate: длина маршрута: «${said}»`);
        }
        // Light in a brush: a lamp moved 4 units into the floor under the start is reported, put back it is not.
        const lampE = (current.current ?? ms).entities.find((e) => e.classname === "light" && e.origin);
        if (lampE) {
          const was = lampE.origin!.join(" ");
          await setEntityKeys(lampE.id, [["origin", "0 0 -4"]]);
          const lit = ((await checkProblems()) ?? []).filter((p) => p.kind === "light_in_solid" && p.object === lampE.id);
          const sunk = lit.length;
          // «Выдвинуть» takes it out through the nearest face: the floor's top.
          await fixProblems(lit);
          const pushed = (current.current ?? ms).entities.find((e) => e.id === lampE.id)?.origin?.join(" ");
          const free = ((await checkProblems()) ?? []).filter((p) => p.kind === "light_in_solid" && p.object === lampE.id).length;
          // Out in the void: 9000 units up is outside every world brush.
          await setEntityKeys(lampE.id, [["origin", "0 0 9000"]]);
          const outside = ((await checkProblems()) ?? []).filter((p) => p.kind === "entity_outside" && p.object === lampE.id).length;
          await setEntityKeys(lampE.id, [["origin", was]]);
          const inside = ((await checkProblems()) ?? []).filter((p) => p.kind === "entity_outside").length;
          void api.log(`autoisolate: entity outside: in the void ${outside}, back home ${inside}`);
          if (outside !== 1 || inside !== 0) throw new Error(`autoisolate: энтити вне карты: снаружи ${outside}, на месте ${inside}`);
          // The check after a save (Unreal's map check): a problem shows up as a word in the status bar, the panel is not forced open.
          setPanel("textures");
          await setEntityKeys(lampE.id, [["origin", "0 0 9000"]]);
          await saveCurrent();
          await new Promise((r) => setTimeout(r, 300));
          const said = [...document.querySelectorAll("span.list-text")].map((el) => el.textContent ?? "").find((t) => t.includes("проверка нашла")) ?? "";
          const panelNow = panelRef.current;
          await setEntityKeys(lampE.id, [["origin", was]]);
          await saveCurrent();
          void api.log(`autoisolate: save check said «${said}», panel ${panelNow}`);
          if (!said || panelNow === "problems") throw new Error(`autoisolate: проверка при сохранении: «${said}», панель ${panelNow}`);
          void api.log(`autoisolate: light in solid: sunk ${sunk}, pushed to ${pushed}, still ${free}`);
          if (sunk !== 1 || free !== 0) throw new Error(`autoisolate: свет в браше: в полу ${sunk}, после «Выдвинуть» ${free}`);
        }
        // No outputs: a fresh trigger around a brush has none and is reported; undo takes it away again.
        const mt = current.current ?? ms;
        const ents0 = mt.entities.length;
        const ids0 = new Set(mt.entities.map((e) => e.id));
        selectIds([Array.from(mt.doc.solid_ids() as Uint32Array)[0]]);
        await new Promise((r) => setTimeout(r, 200));
        await wrapInTrigger();
        const trig = (current.current ?? mt).entities.find((e) => e.classname === "trigger_multiple" && !ids0.has(e.id));
        const silent = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_outputs" && p.object === trig?.id).length;
        await undo();
        await new Promise((r) => setTimeout(r, 300));
        const ents1 = (current.current ?? mt).entities.length;
        void api.log(`autoisolate: new trigger ${trig?.id} without outputs reported ${silent}; entities ${ents0} → ${ents1} after undo`);
        if (!trig || silent !== 1 || ents1 !== ents0) throw new Error(`autoisolate: триггер без выходов: найден ${silent}, энтити ${ents0} → ${ents1}`);
        // The sun: without light_environment the sky map is reported, «Добавить солнце» puts one in; the old one back makes the new one a second sun.
        const sun = (current.current ?? mt).entities.find((e) => e.classname === "light_environment");
        if (sun) {
          await setEntityKeys(sun.id, [["classname", "info_target"]]);
          const noSun = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_sun");
          await fixProblems(noSun);
          const after = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_sun").length;
          await setEntityKeys(sun.id, [["classname", "light_environment"]]);
          const extra = ((await checkProblems()) ?? []).filter((p) => p.kind === "extra_sun").length;
          void api.log(`autoisolate: sun: missing ${noSun.length} (fix at ${noSun[0]?.detail}), after fix ${after}, extra once back ${extra}`);
          if (noSun.length !== 1 || after !== 0 || extra !== 1) throw new Error(`autoisolate: солнце: нет ${noSun.length}, после исправления ${after}, второе ${extra}`);
        }
        // Model favourites: star the first tile, the ★ filter shows just it, unstar puts things back.
        const savedFavs = localStorage.getItem("gme.favModels");
        localStorage.removeItem("gme.favModels");
        setPanel("models");
        let firstTile: HTMLElement | null = null;
        for (let i = 0; i < 40 && !firstTile; i++) {
          await new Promise((r) => setTimeout(r, 250));
          firstTile = document.querySelector<HTMLElement>("[data-model]");
        }
        if (firstTile) {
          const model = firstTile.dataset.model!;
          firstTile.querySelector<HTMLElement>(".tile-star, .list-star")?.click();
          await new Promise((r) => setTimeout(r, 200));
          const stored = JSON.parse(localStorage.getItem("gme.favModels") ?? "[]") as string[];
          const favBtn = [...document.querySelectorAll<HTMLButtonElement>("button.icon-btn")].find((b) => b.title.startsWith("Избранные модели"));
          favBtn?.click();
          await new Promise((r) => setTimeout(r, 300));
          const shownFav = [...document.querySelectorAll<HTMLElement>("[data-model]")].map((el) => el.dataset.model);
          favBtn?.click();
          if (savedFavs === null) localStorage.removeItem("gme.favModels");
          else localStorage.setItem("gme.favModels", savedFavs);
          void api.log(`autoisolate: model favourite ${model}: stored ${stored.length}, ★ shows ${shownFav.join(",")}`);
          if (stored.length !== 1 || stored[0] !== model || shownFav.length !== 1 || shownFav[0] !== model)
            throw new Error(`autoisolate: избранное моделей: сохранено ${stored.join(",")}, показано ${shownFav.join(",")}`);
        } else {
          if (savedFavs !== null) localStorage.setItem("gme.favModels", savedFavs);
          void api.log("autoisolate: model favourites skipped, no model tiles (content not mounted)");
        }
        // Similar props: Shift+G on a prop picks the props with the same model, not every prop_static.
        const mp = current.current ?? ms;
        const props = mp.entities.filter((e) => e.classname === "prop_static" && e.model && !e.hidden);
        if (props.length) {
          const byModel = new Map<string, number>();
          for (const e of props) byModel.set(e.model!.toLowerCase(), (byModel.get(e.model!.toLowerCase()) ?? 0) + 1);
          const [model, count] = [...byModel.entries()].sort((x, y) => y[1] - x[1])[0];
          selectIds([props.find((e) => e.model!.toLowerCase() === model)!.id]);
          await new Promise((r) => setTimeout(r, 200));
          selectSimilar();
          await new Promise((r) => setTimeout(r, 200));
          void api.log(`autoisolate: similar props of ${model}: ${selection.current.size} (want ${count} of ${props.length} prop_static)`);
          if (selection.current.size !== count) throw new Error(`autoisolate: похожие пропы: выбрано ${selection.current.size}, ждали ${count}`);
          // Prop class: three of them become prop_physics in one step, one undo makes them static again.
          const three = [...selection.current].slice(0, 3);
          selectIds(three);
          await new Promise((r) => setTimeout(r, 200));
          await convertProps("prop_physics");
          const cls1 = three.map((id) => (current.current ?? mp).entities.find((e) => e.id === id)?.classname);
          await undo();
          const cls2 = three.map((id) => (current.current ?? mp).entities.find((e) => e.id === id)?.classname);
          void api.log(`autoisolate: props → ${cls1.join(",")}; after undo ${cls2.join(",")}`);
          if (cls1.some((c) => c !== "prop_physics") || cls2.some((c) => c !== "prop_static")) throw new Error(`autoisolate: смена класса пропов: ${cls1.join(",")} → ${cls2.join(",")}`);
          // Physics: a prop_physics whose model has no .phy is reported and the fix makes it prop_dynamic; one with physics is not.
          const candidates = (await api.listModels("props_c17/", 300)).names;
          const report = await api.checkResources(
            [],
            candidates.flatMap((m) => [m, m.replace(/\.mdl$/i, ".phy")]),
            null,
          );
          const has = (path: string) => !report.missingModels.includes(path);
          const without = candidates.find((m) => has(m) && !has(m.replace(/\.mdl$/i, ".phy")));
          const withPhy = candidates.find((m) => has(m) && has(m.replace(/\.mdl$/i, ".phy")));
          const target = three[0];
          if (without && withPhy) {
            await setEntityKeys(target, [
              ["classname", "prop_physics"],
              ["model", withPhy],
            ]);
            const okFound = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_physics" && p.object === target).length;
            await setEntityKeys(target, [["model", without]]);
            // A second one of the same kind: «Выбрать все такие» in the panel selects both.
            const second = three[1];
            await setEntityKeys(second, [
              ["classname", "prop_physics"],
              ["model", without],
            ]);
            const all = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_physics");
            await new Promise((r) => setTimeout(r, 300));
            [...document.querySelectorAll<HTMLElement>(".problem-row")].find((el) => el.textContent?.includes("Проп без физики"))?.click();
            await new Promise((r) => setTimeout(r, 200));
            [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent?.startsWith("Выбрать все такие"))?.click();
            await new Promise((r) => setTimeout(r, 200));
            const picked = [...selection.current];
            void api.log(`autoisolate: select all of a kind: ${all.length} findings, selected ${picked.join(",")}`);
            if (!picked.includes(target) || !picked.includes(second)) throw new Error(`autoisolate: «выбрать все такие»: выделено ${picked.join(",")}`);
            await undo();
            const bad = ((await checkProblems()) ?? []).filter((p) => p.kind === "no_physics" && p.object === target);
            await fixProblems(bad);
            const fixedCls = (current.current ?? mp).entities.find((e) => e.id === target)?.classname;
            for (let i = 0; i < 3; i++) await undo();
            const back = (current.current ?? mp).entities.find((e) => e.id === target);
            void api.log(`autoisolate: physics: ${withPhy} flagged ${okFound}, ${without} flagged ${bad.length}, fixed to ${fixedCls}; back to ${back?.classname} ${back?.model}`);
            if (okFound !== 0 || bad.length !== 1 || fixedCls !== "prop_dynamic" || back?.classname !== "prop_static")
              throw new Error(`autoisolate: проп без физики: с физикой ${okFound}, без ${bad.length}, класс ${fixedCls}, вернулся ${back?.classname}`);
          } else void api.log(`autoisolate: physics check skipped, candidates without .phy: ${without ?? "none"}, with: ${withPhy ?? "none"}`);
        }
        // Shift+Space fills the area with one view and back (the 3D view when no view is under the pointer).
        {
          // Space is also the camera's "up" key: the release must follow, or the flight keeps climbing.
          const press = () => {
            for (const type of ["keydown", "keyup"]) window.dispatchEvent(new KeyboardEvent(type, { code: "Space", key: " ", shiftKey: true, bubbles: true, cancelable: true }));
          };
          const before = viewsRef.current.max;
          press();
          await new Promise((r) => setTimeout(r, 150));
          const filled = viewsRef.current.max;
          press();
          await new Promise((r) => setTimeout(r, 150));
          const back = viewsRef.current.max;
          void api.log(`autoisolate: view-max: ${before} → ${filled} → ${back}`);
          // The run may already have one view filled: the first press then restores the grid, the second fills again.
          const want = before ? null : "3d";
          if (filled !== want || back !== before) throw new Error(`autoisolate: Shift+Space: ${before} → ${filled} → ${back}, ждали ${want} → ${before}`);
        }
        // Arithmetic in the inspector: "+64" in the X field moves a lamp 64 units; undo puts it back.
        const me = current.current ?? ms;
        const lampX = me.entities.find((e) => e.classname === "light" && e.origin);
        if (lampX) {
          const x0 = lampX.origin![0];
          selectIds([lampX.id]);
          setPanel("inspector");
          // Wait for the field to show the lamp: a field still showing the previous selection is reset when the
          // lamp's value arrives, and that would wipe the typed text before it commits.
          let field: HTMLInputElement | null = null;
          for (let i = 0; i < 20 && field?.value !== String(Math.round(x0 * 100) / 100); i++) {
            await new Promise((r) => setTimeout(r, 150));
            field = document.querySelector<HTMLInputElement>('.insp-axis[data-axis="X"] input');
          }
          if (!field) throw new Error("autoisolate: нет поля X в инспекторе");
          const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
          field.focus();
          // The window may not hold the focus (the clipboard steps before take it): then the field never gets
          // it either, and its leave event is sent by hand so the value still commits as a person's Tab would.
          const focused = document.activeElement === field;
          setter.call(field, "+64");
          field.dispatchEvent(new Event("input", { bubbles: true }));
          await new Promise((r) => setTimeout(r, 50));
          if (focused) field.blur();
          else field.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
          // The move goes through the core and a rebuild: wait for it rather than a fixed pause.
          let x1 = x0;
          for (let i = 0; i < 20 && x1 === x0; i++) {
            await new Promise((r) => setTimeout(r, 100));
            x1 = (current.current ?? me).entities.find((e) => e.id === lampX.id)?.origin?.[0] ?? x0;
          }
          await undo();
          void api.log(`autoisolate: inspector "+64": x ${x0} → ${x1}`);
          if (x1 !== x0 + 64) throw new Error(`autoisolate: выражение в инспекторе: x ${x0} → ${x1}, ждали ${x0 + 64}`);
        }
        // Click again to pick what is behind: two plain clicks on the middle of the 3D view, camera still, give two different objects.
        const cv = canvasRef.current;
        if (cv) {
          selectIds([]);
          frameAll();
          // The pick buffer needs a frame or two drawn from the new camera.
          await new Promise((r) => setTimeout(r, 1000));
          const rect = cv.getBoundingClientRect();
          const click = async () => {
            const at = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, bubbles: true, button: 0 };
            cv.dispatchEvent(new MouseEvent("mousedown", at));
            cv.dispatchEvent(new MouseEvent("mouseup", at));
            await new Promise((r) => setTimeout(r, 1000));
            return [...selection.current];
          };
          let first = await click();
          for (let i = 0; i < 3 && !first.length; i++) {
            await new Promise((r) => setTimeout(r, 500));
            first = await click();
          }
          const second = await click();
          const said = [...document.querySelectorAll("span.list-text")].map((el) => el.textContent ?? "").find((t) => t.includes("под курсором")) ?? "";
          const cam = session.current?.camera;
          void api.log(
            `autoisolate: click cycle: first ${first.join(",")}, second ${second.join(",")}; status «${said}»; camera ${Array.from(cam?.position ?? [])
              .map(Math.round)
              .join(" ")} yaw ${cam?.yaw.toFixed(1)} pitch ${cam?.pitch.toFixed(1)}; canvas ${rect.width}×${rect.height}`,
          );
          if (!first.length || !second.length || first.join() === second.join()) throw new Error(`autoisolate: повторный клик не выбрал объект за первым: ${first.join(",")} → ${second.join(",")}`);
        }
        // func_detail candidates: a fresh 32-unit cube is among the small world brushes; Ctrl+T makes it func_detail; two undos clean up.
        {
          const md = current.current ?? me;
          const made = md.doc.create_block(new Float64Array([200, 200, 0, 232, 232, 32]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          const cube = made?.changed_ids[0];
          selectDetailCandidates();
          await new Promise((r) => setTimeout(r, 200));
          const picked = [...selection.current];
          await tieSelection("func_detail");
          const owner = cube ? (current.current ?? md).doc.entity_of_solid(cube) : 0;
          const cls = (current.current ?? md).entities.find((e) => e.id === owner)?.classname;
          await undo();
          await undo();
          void api.log(`autoisolate: detail candidates ${picked.length} incl. cube ${cube}: ${picked.includes(cube ?? -1)}, tied to ${cls}`);
          if (!cube || !picked.includes(cube) || cls !== "func_detail") throw new Error(`autoisolate: кандидаты в func_detail: куб ${cube}, выбран ${picked.includes(cube ?? -1)}, класс ${cls}`);
        }
        // «Мелкие браши в мире»: eight cubes make the finding, «В func_detail» ties them all, nine undos clean up.
        {
          const cubes: number[] = [];
          for (let i = 0; i < 8; i++) {
            const made = (current.current ?? me).doc.create_block(new Float64Array([200 + i * 48, 300, 0, 232 + i * 48, 332, 32]), "dev/dev_measuregeneric01b") as
              { changed_ids: number[] } | undefined;
            await applyEdit();
            if (made) cubes.push(made.changed_ids[0]);
          }
          const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "world_detail");
          await fixProblems(found);
          const mm = current.current ?? me;
          const tied = cubes.filter((c) => mm.entities.find((e) => e.id === mm.doc.entity_of_solid(c))?.classname === "func_detail").length;
          for (let i = 0; i < 9; i++) await undo();
          void api.log(`autoisolate: world detail: finding ${found.length} (${found[0]?.message ?? ""}), cubes tied ${tied} of ${cubes.length}`);
          if (found.length !== 1 || tied !== cubes.length) throw new Error(`autoisolate: мелкие браши: находок ${found.length}, привязано ${tied} из ${cubes.length}`);
        }
        // A ring of copies: a cube and 3 copies round a centre 256 units along −X; every centre lies on the circle. Last step, left in the unsaved map.
        {
          const mr2 = current.current ?? me;
          const made = mr2.doc.create_block(new Float64Array([400, 400, 0, 432, 432, 32]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made) {
            selectIds(made.changed_ids);
            await new Promise((r) => setTimeout(r, 200));
            await arraySelection({ count: 3, offset: [0, 0, 0], yaw: 0, ring: 256 });
            const copies = [...selection.current];
            const mm = current.current ?? mr2;
            const radii = copies.map((id) => {
              const i = mm.mesh.solidIds.indexOf(id);
              const b = i >= 0 ? objectBounds(mm, i) : null;
              return b ? Math.round(Math.hypot((b[0][0] + b[1][0]) / 2 - 160, (b[0][1] + b[1][1]) / 2 - 416)) : -1;
            });
            void api.log(`autoisolate: ring copies ${copies.length}, distances to centre ${radii.join(",")}`);
            if (copies.length !== 3 || radii.some((r) => Math.abs(r - 256) > 1)) throw new Error(`autoisolate: по кругу: копий ${copies.length}, радиусы ${radii.join(",")}`);
          }
        }
        // Stairs: a 128×64×64 box with 16-unit steps gives four blocks, one undo takes them all back.
        {
          const mst = current.current ?? me;
          const solids0 = mst.stats.solids;
          setShape("stairs");
          setPendingBox([
            [600, 600, 0],
            [728, 664, 64],
          ]);
          // While the box is pending, the four steps are outlined (12 edges, 24 vertices each).
          const preview = session.current?.renderer.overlayVertexCount("stairs") ?? 0;
          await createPendingBlock();
          const previewAfter = session.current?.renderer.overlayVertexCount("stairs") ?? 0;
          void api.log(`autoisolate: stairs preview ${preview} vertices, after creating ${previewAfter}`);
          if (preview !== 96 || previewAfter !== 0) throw new Error(`autoisolate: предпросмотр лестницы: ${preview} → ${previewAfter}`);
          const made = [...selection.current];
          const solids1 = (current.current ?? mst).stats.solids;
          // Select More: from the bottom step one ring reaches the second step, not the fourth; the next ring the third.
          const msz = current.current ?? mst;
          const byZ = made
            .map((id) => {
              const i = msz.mesh.solidIds.indexOf(id);
              const b = i >= 0 ? objectBounds(msz, i) : null;
              return { id, z: b ? b[0][2] : 0 };
            })
            .sort((x, y) => x.z - y.z)
            .map((x) => x.id);
          selectIds([byZ[0]]);
          growSelection();
          const ring1 = new Set(selection.current);
          growSelection();
          const ring2 = new Set(selection.current);
          void api.log(`autoisolate: grow from the bottom step: ring 1 ${ring1.size} objects (2nd ${ring1.has(byZ[1])}, 4th ${ring1.has(byZ[3])}), ring 2 ${ring2.size} (3rd ${ring2.has(byZ[2])})`);
          // The floor under the stairs is far larger than a step: it stays out, so ring 2 does not spill over the room.
          if (!ring1.has(byZ[1]) || ring1.has(byZ[3]) || !ring2.has(byZ[2]) || ring2.size > 10) throw new Error(`autoisolate: расширение выделения на соседей ошиблось (второй круг ${ring2.size})`);
          await undo();
          const solids2 = (current.current ?? mst).stats.solids;
          // ↔: the same box rising the other way has its top step at the near end (x 600–632).
          setPrim({ reverse: true });
          setPendingBox([
            [600, 600, 0],
            [728, 664, 64],
          ]);
          await createPendingBlock();
          const mrev = current.current ?? mst;
          const tops = [...selection.current]
            .map((id) => {
              const i = mrev.mesh.solidIds.indexOf(id);
              return i >= 0 ? objectBounds(mrev, i) : null;
            })
            .filter((b): b is NonNullable<typeof b> => !!b)
            .sort((x, y) => y[1][2] - x[1][2]);
          const top = tops[0];
          await undo();
          setPrim({ reverse: false });
          void api.log(`autoisolate: reversed stairs top step x ${top?.[0][0]}–${top?.[1][0]}`);
          if (!top || top[0][0] !== 600 || top[1][0] !== 632) throw new Error(`autoisolate: обратная лестница: верхняя ступень ${top?.[0][0]}–${top?.[1][0]}`);
          setShape("block");
          void api.log(`autoisolate: stairs made ${made.length} steps, solids ${solids0} → ${solids1} → ${solids2} after one undo`);
          if (made.length !== 4 || solids1 !== solids0 + 4 || solids2 !== solids0) throw new Error(`autoisolate: лестница: ступеней ${made.length}, брашей ${solids0} → ${solids1} → ${solids2}`);
        }
        // Face texture copy (Hammer's Lift / Apply values): Ctrl+Alt+C on one face, Ctrl+Alt+V on a face of another brush.
        {
          const mf = current.current ?? me;
          const [s1, s2] = Array.from(mf.doc.solid_ids() as Uint32Array).slice(0, 2);
          const side1 = (mf.doc.solid_sides(s1) as Uint32Array)[0];
          const side2 = (mf.doc.solid_sides(s2) as Uint32Array)[0];
          setTool("texture");
          faceSel.current.clear();
          faceSel.current.set(`${s1}:${side1}`, [s1, side1]);
          await editFaces({ shift_x: 24, shift_y: 8, scale_x: 0.5, scale_y: 0.75 });
          copyEntityKeys();
          faceSel.current.clear();
          faceSel.current.set(`${s2}:${side2}`, [s2, side2]);
          await pasteEntityKeys();
          const f1 = (current.current ?? mf).doc.face_info(s1, side1) as { material: string; uaxis: number[]; vaxis: number[] };
          const f2 = (current.current ?? mf).doc.face_info(s2, side2) as { material: string; uaxis: number[]; vaxis: number[] };
          await undo();
          await undo();
          faceSel.current.clear();
          setTool("select");
          const same = f1.material === f2.material && f1.uaxis[3] === f2.uaxis[3] && f1.vaxis[3] === f2.vaxis[3] && f1.uaxis[4] === f2.uaxis[4] && f1.vaxis[4] === f2.vaxis[4];
          void api.log(
            `autoisolate: face style ${f1.material} shift ${f1.uaxis[3]},${f1.vaxis[3]} scale ${f1.uaxis[4]},${f1.vaxis[4]} → ${f2.material} shift ${f2.uaxis[3]},${f2.vaxis[3]} scale ${f2.uaxis[4]},${f2.vaxis[4]}`,
          );
          if (!same) throw new Error("autoisolate: текстура грани не перенеслась");
        }
        // Outputs travel with Ctrl+Alt+C / Ctrl+Alt+V: one ambient_generic's output lands on another of the class.
        {
          const mo = current.current ?? me;
          const [snd1, snd2] = mo.entities.filter((e) => e.classname === "ambient_generic");
          if (snd1 && snd2) {
            setTool("select");
            await setEntityConnections(snd1.id, [{ output: "OnUser1", target: "lamp_x", input: "TurnOn", parameter: "", delay: 0, times_to_fire: -1 }]);
            selectIds([snd1.id]);
            copyEntityKeys();
            selectIds([snd2.id]);
            await pasteEntityKeys();
            const got = ((current.current ?? mo).doc.entity_details(snd2.id) as { connections: { target: string }[] }).connections.map((c) => c.target);
            await undo();
            await undo();
            void api.log(`autoisolate: outputs pasted onto ${snd2.id}: ${got.join(",")}`);
            // A selected ambient_generic shows how far it is heard: three rings of 24 strokes.
            selectIds([snd2.id]);
            await new Promise((r) => setTimeout(r, 300));
            const ringVerts = session.current?.renderer.overlayVertexCount("helpers") ?? 0;
            void api.log(`autoisolate: ambient_generic reach rings: ${ringVerts} vertices`);
            if (ringVerts < 144) throw new Error(`autoisolate: у звука нет колец слышимости (${ringVerts})`);
            if (!got.includes("lamp_x")) throw new Error(`autoisolate: выходы не перенеслись: ${got.join(",")}`);
          }
        }
        // Off-grid boxes: a block half a unit off is found, «На сетку» puts its corner on whole units.
        {
          const mg = current.current ?? me;
          const offBefore = ((await checkProblems()) ?? []).filter((p) => p.kind === "off_grid").length;
          const made = mg.doc.create_block(new Float64Array([1300.5, 800, 0.25, 1364.5, 864, 64.25]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made) {
            const id = made.changed_ids[0];
            const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "off_grid" && (p.detail ?? "").split(",").includes(String(id)));
            await fixProblems(found);
            const mg2 = current.current ?? mg;
            const idx = mg2.mesh.solidIds.indexOf(id);
            const lo = idx >= 0 ? Array.from(mg2.mesh.solidBounds.slice(idx * 6, idx * 6 + 3)) : [];
            const left = ((await checkProblems()) ?? []).filter((p) => p.kind === "off_grid").length;
            await undo();
            await undo();
            void api.log(`autoisolate: off-grid before ${offBefore}, found ${found.length}, fixed corner ${lo.join(" ")}, left ${left}`);
            if (offBefore !== 0 || found.length !== 1 || left !== 0 || lo.some((v) => Math.abs(v - Math.round(v)) > 0.01))
              throw new Error(`autoisolate: браши не на сетке: до ${offBefore}, найдено ${found.length}, угол ${lo.join(" ")}, осталось ${left}`);
          }
        }
        // Merge brushes: five blocks in a row become one box, one undo brings them back; «Проблемы» offer the same and fix it.
        {
          const mergeBefore = ((await checkProblems()) ?? []).filter((p) => p.kind === "mergeable").length;
          const ids: number[] = [];
          for (const x of [1400, 1464, 1528, 1592, 1656]) {
            const r = (current.current ?? me).doc.create_block(new Float64Array([x, 800, 200, x + 64, 864, 264]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
            await applyEdit();
            if (r) ids.push(r.changed_ids[0]);
          }
          const count = () => (current.current ?? me).mesh.solidIds.length;
          const before = count();
          selectIds(ids);
          await mergeBrushes();
          const after = count();
          const b = selectionBounds();
          await undo();
          const back = count();
          const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "mergeable");
          await fixProblems(found);
          const fixedCount = count();
          await undo();
          for (let i = 0; i < ids.length; i++) await undo();
          void api.log(
            `autoisolate: merge brushes: findings before ${mergeBefore}, ${before} -> ${after} solids, box ${JSON.stringify(b)}, undo -> ${back}, problem ${found.length} fixed -> ${fixedCount}`,
          );
          if (mergeBefore !== 0 || after !== before - 4 || back !== before || !b || b[0][0] !== 1400 || b[1][0] !== 1720)
            throw new Error(`autoisolate: склейка брашей: ${before} -> ${after}, отмена ${back}, коробка ${JSON.stringify(b)}`);
          if (found.length !== 1 || fixedCount !== before - 4) throw new Error(`autoisolate: находка «можно склеить»: ${found.length}, после починки ${fixedCount}`);
        }
        // Displacement in a func_detail: «Проблемы» flag it, «В мир» brings the brush back to the world.
        {
          const md = current.current ?? me;
          const made = md.doc.create_block(new Float64Array([1800, 800, 200, 1864, 864, 264]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made) {
            const sid = made.changed_ids[0];
            selectIds([sid]);
            await tieSelection("func_detail");
            const doc = (current.current ?? md).doc;
            const top = Array.from(doc.solid_sides(sid) as Uint32Array).find((side) => (doc.face_info(sid, side) as { normal: number[] }).normal[2] > 0.5)!;
            doc.create_displacements(new Uint32Array([sid, top]), 2);
            await applyEdit();
            const found = ((await checkProblems()) ?? []).filter((p) => p.kind === "disp_in_entity");
            await fixProblems(found);
            const owner = (current.current ?? md).doc.entity_of_solid(sid);
            const left = ((await checkProblems()) ?? []).filter((p) => p.kind === "disp_in_entity").length;
            await undo();
            await undo();
            await undo();
            await undo();
            const gone = !(current.current ?? md).mesh.solidIds.includes(sid);
            void api.log(`autoisolate: displacement in func_detail: found ${found.length}, owner after fix ${owner}, left ${left}, cleaned up ${gone}`);
            if (found.length !== 1 || owner !== 0 || left !== 0 || !gone)
              throw new Error(`autoisolate: дисплейсмент в энтити: найдено ${found.length}, владелец ${owner}, осталось ${left}, убрано ${gone}`);
          }
        }
        // Nodraw on hidden faces: of two stacked blocks, the lower one's top face goes nodraw (its bottom too when it stands on a floor), no side.
        {
          const mh = current.current ?? me;
          const lower = mh.doc.create_block(new Float64Array([1200, 800, 0, 1264, 864, 64]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          const upper = (current.current ?? mh).doc.create_block(new Float64Array([1192, 792, 64, 1272, 872, 128]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (lower && upper) {
            const id = lower.changed_ids[0];
            selectIds([id]);
            await nodrawHiddenFaces();
            const doc = (current.current ?? mh).doc;
            const faces = Array.from(doc.solid_sides(id) as Uint32Array).map((side) => doc.face_info(id, side) as { material: string; normal: number[] });
            const nodraw = faces.filter((f) => f.material === "tools/toolsnodraw").map((f) => f.normal.map((v) => Math.round(v)).join(" "));
            await undo();
            await undo();
            await undo();
            void api.log(`autoisolate: nodraw on hidden faces: ${nodraw.join(" | ")}`);
            if (!nodraw.includes("0 0 1") || nodraw.some((n) => !n.endsWith(" 1") && !n.endsWith(" -1"))) throw new Error(`autoisolate: nodraw на скрытых гранях: ${nodraw.join(" | ") || "ничего"}`);
          }
        }
        // Door direction: a block tied to func_door shows its move arrow (three strokes) when selected.
        {
          const mdr = current.current ?? me;
          const made = mdr.doc.create_block(new Float64Array([800, 800, 0, 816, 864, 96]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made) {
            selectIds(made.changed_ids);
            await tieSelection("func_door");
            selectIds([]);
            await new Promise((r) => setTimeout(r, 100));
            selectIds(made.changed_ids);
            await new Promise((r) => setTimeout(r, 300));
            const verts = session.current?.renderer.overlayVertexCount("helpers") ?? 0;
            // Turned a quarter about Z, the door's travel (movedir) turns with it.
            const doorOwner = (current.current ?? mdr).doc.entity_of_solid(made.changed_ids[0]);
            const dirOf = () => ((current.current ?? mdr).doc.entity_details(doorOwner) as { keyvalues: [string, string][] }).keyvalues.find(([k]) => k.toLowerCase() === "movedir")?.[1];
            const dirBefore = dirOf();
            await commitRotate(new Set(made.changed_ids), [808, 832, 48], [0, 0, 1], 90);
            const dirAfter = dirOf();
            await undo();
            void api.log(`autoisolate: func_door turned 90: movedir «${dirBefore}» -> «${dirAfter}»`);
            if (dirBefore !== undefined && dirBefore === dirAfter) throw new Error(`autoisolate: movedir не повернулся с дверью: ${dirBefore}`);
            await undo();
            await undo();
            void api.log(`autoisolate: func_door move arrow: ${verts} vertices`);
            // Three arrow strokes and the twelve edges of the open outline.
            if (verts < 30) throw new Error(`autoisolate: у двери нет стрелки и контура открытого положения (${verts} вершин)`);
          }
          // A rotating door shows the arc its far edge sweeps: twelve strokes and two radii.
          const made2 = (current.current ?? mdr).doc.create_block(new Float64Array([900, 800, 0, 964, 804, 96]), "dev/dev_measuregeneric01b") as { changed_ids: number[] } | undefined;
          await applyEdit();
          if (made2) {
            selectIds(made2.changed_ids);
            await tieSelection("func_door_rotating");
            selectIds([]);
            await new Promise((r) => setTimeout(r, 100));
            selectIds(made2.changed_ids);
            await new Promise((r) => setTimeout(r, 300));
            const arcVerts = session.current?.renderer.overlayVertexCount("helpers") ?? 0;
            // Tie puts the hinge at the near end (900, 802, 48) at once, so no «Дверь без петли»; «Петля на другой край» moves it to 964.
            const doorId = (current.current ?? mdr).doc.entity_of_solid(made2.changed_ids[0]);
            const keyOf = () => ((current.current ?? mdr).doc.entity_details(doorId) as { keyvalues: [string, string][] }).keyvalues.find(([k]) => k === "origin")?.[1];
            const tiedAt = keyOf();
            // The hinge rides along when the whole door moves (it stayed behind before).
            await commitTranslate(new Set(made2.changed_ids), [0, 16, 0]);
            const movedAt = keyOf();
            await undo();
            void api.log(`autoisolate: door moved by 16: hinge «${tiedAt}» -> «${movedAt}»`);
            if (movedAt !== "900 818 48") throw new Error(`autoisolate: петля не поехала за дверью: ${movedAt}`);
            // Snapping each brush (translate_each) by the same step carries the hinge too.
            (current.current ?? mdr).doc.translate_each(new Uint32Array(made2.changed_ids), new Float64Array(made2.changed_ids.flatMap(() => [0, 8, 0])), false);
            await applyEdit();
            const eachAt = keyOf();
            await undo();
            if (eachAt !== "900 810 48") throw new Error(`autoisolate: петля не поехала при сдвиге по отдельности: ${eachAt}`);
            const noHinge = ((await checkProblems()) ?? []).filter((p) => p.kind === "door_no_hinge" && p.object === doorId).length;
            await flipHinge();
            const flipped = keyOf();
            // Origin to the middle of the door's brush: 932 802 48.
            await originToCentre();
            const centred = keyOf();
            await undo();
            if (centred !== "932 802 48") throw new Error(`autoisolate: origin в центр двери: ${centred}`);
            await undo();
            void api.log(`autoisolate: door hinge after tie «${tiedAt}», findings ${noHinge}, flipped «${flipped}»`);
            if (tiedAt !== "900 802 48" || noHinge !== 0 || flipped !== "964 802 48") throw new Error(`autoisolate: петля двери: ${tiedAt}, находок ${noHinge}, перенос ${flipped}`);
            await undo();
            await undo();
            void api.log(`autoisolate: func_door_rotating swing: ${arcVerts} vertices`);
            if (arcVerts < 28) throw new Error(`autoisolate: у вращающейся двери нет дуги (${arcVerts} вершин)`);
          }
        }
        // Entity labels: on, the camera 300 units from the named lamp looking at it, its name shows over the 3D view; off again.
        {
          const ml = current.current ?? me;
          const named = ml.entities.find((e) => e.classname === "light" && e.targetname && e.origin);
          const cam = session.current?.camera;
          if (named && cam) {
            const savedLabels = localStorage.getItem("gme.labels");
            localStorage.setItem("gme.labels", "1");
            window.dispatchEvent(new Event("gme-labels"));
            cam.position = new Float32Array([named.origin![0] - 300, named.origin![1], named.origin![2]]);
            cam.yaw = 0;
            cam.pitch = 0;
            await new Promise((r) => setTimeout(r, 500));
            const shown = [...document.querySelectorAll<HTMLElement>(".entity-label")].filter((el) => el.style.display !== "none").map((el) => el.textContent);
            // A brush entity's label stands in the middle of its brushes: the rotor seen from 400 units away.
            const rotor = ml.entities.find((e) => e.classname === "func_rotating" && e.targetname);
            let rotorShown = true;
            if (rotor) {
              const idx = ml.mesh.solidIds.indexOf((ml.doc.entity_solids(rotor.id) as Uint32Array)[0]);
              const b = ml.mesh.solidBounds;
              const mid = [0, 1, 2].map((k) => (b[idx * 6 + k] + b[idx * 6 + 3 + k]) / 2);
              cam.position = new Float32Array([mid[0] - 400, mid[1], mid[2]]);
              await new Promise((r) => setTimeout(r, 500));
              rotorShown = [...document.querySelectorAll<HTMLElement>(".entity-label")].some((el) => el.style.display !== "none" && el.textContent === rotor.targetname);
            }
            // Game view hides the axis widget along with the labels.
            document.body.classList.add("game-view");
            const widget = document.querySelector(".axis-widget");
            const widgetHidden = !widget || getComputedStyle(widget).display === "none";
            document.body.classList.remove("game-view");
            void api.log(`autoisolate: rotor label shown ${rotorShown}, axis widget hidden in game view ${widgetHidden}`);
            if (!rotorShown || !widgetHidden) throw new Error(`autoisolate: подпись ротора ${rotorShown}, значок осей в виде игры скрыт ${widgetHidden}`);
            if (savedLabels === null) localStorage.removeItem("gme.labels");
            else localStorage.setItem("gme.labels", savedLabels);
            window.dispatchEvent(new Event("gme-labels"));
            void api.log(`autoisolate: labels shown: ${shown.join(", ")}`);
            if (!shown.includes(named.targetname!)) throw new Error(`autoisolate: подписи: нет «${named.targetname}» среди ${shown.join(", ")}`);
          }
        }
      }
    }
    if (app.autosymmetry) {
      // Mirror the selection across X = 0, then place a light with the mode on: both must double.
      const m0 = current.current ?? map;
      const solids0 = m0.stats.solids;
      const ents0 = m0.entities.length;
      setSymmetry({ on: true, axis: 0, pos: 0 });
      const ids0 = m0.doc.solid_ids();
      const bounds0 = m0.doc.solid_bounds();
      let first: number | undefined;
      for (let i = 0; i < ids0.length; i++)
        if (bounds0[i * 6] > 1) {
          first = ids0[i];
          break;
        }
      if (first === undefined) throw new Error("autosymmetry: нет браша целиком правее X=0");
      selectIds([first]);
      applySelection();
      await mirrorSelection();
      await new Promise((r) => setTimeout(r, 200));
      const m1 = current.current ?? map;
      void api.log(`autosymmetry mirror: solids ${solids0} -> ${m1.stats.solids}, selected ${selection.current.size}, undo «${history(m1).undo}»`);
      if (m1.stats.solids !== solids0 + 1) throw new Error(`autosymmetry: ожидали ${solids0 + 1} брашей, стало ${m1.stats.solids}`);
      setEntityClass("light");
      await createEntityAt([256, 64, 32]);
      await new Promise((r) => setTimeout(r, 200));
      const m2 = current.current ?? map;
      const lights = m2.entities.filter((e) => e.classname === "light");
      void api.log(
        `autosymmetry entity: entities ${ents0} -> ${m2.entities.length}; lights at ${lights.map((e) => e.origin?.map((v) => Math.round(v)).join(" ")).join(" | ")}; undo «${history(m2).undo}»`,
      );
      if (m2.entities.length !== ents0 + 2) throw new Error(`autosymmetry: ожидали ${ents0 + 2} энтити, стало ${m2.entities.length}`);
      if (!lights.some((e) => e.origin && Math.round(e.origin[0]) === -256)) throw new Error("autosymmetry: зеркальный light не на X=-256");
      setSymmetry({ on: false });
    }
    if (app.automeasure) {
      // The ruler: a drag of 200 px in the top view, then two clicks on the 3D view; both must give a length.
      setTool("measure");
      await new Promise((r) => setTimeout(r, 300));
      const top = canvas2dRefs.current.top;
      if (!top) throw new Error("automeasure: нет вида сверху");
      const r2 = top.getBoundingClientRect();
      const x0 = r2.left + r2.width * 0.3;
      const y0 = r2.top + r2.height * 0.5;
      const ev = (type: string, x: number, y: number, buttons: number) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons });
      top.dispatchEvent(ev("mousedown", x0, y0, 1));
      for (let i = 1; i <= 5; i++) {
        window.dispatchEvent(ev("mousemove", x0 + 40 * i, y0, 1));
        await new Promise((r) => setTimeout(r, 30));
      }
      window.dispatchEvent(ev("mouseup", x0 + 200, y0, 0));
      await new Promise((r) => setTimeout(r, 200));
      const m2d = measureRef.current;
      void api.log(`automeasure 2d: ${m2d ? measureText(m2d) : "нет"}`);
      if (!m2d || Math.hypot(m2d.b[0] - m2d.a[0], m2d.b[1] - m2d.a[1]) < 1) throw new Error("automeasure: протяжка в 2D не дала длины");
      const el = canvasRef.current;
      if (!el) throw new Error("automeasure: нет 3D-холста");
      const r3 = el.getBoundingClientRect();
      const click = (fx: number, fy: number) => {
        const x = r3.left + r3.width * fx;
        const y = r3.top + r3.height * fy;
        el.dispatchEvent(ev("mousedown", x, y, 1));
        el.dispatchEvent(ev("mouseup", x, y, 0));
      };
      click(0.35, 0.65);
      await new Promise((r) => setTimeout(r, 400));
      click(0.65, 0.65);
      await new Promise((r) => setTimeout(r, 400));
      const m3d = measureRef.current;
      void api.log(`automeasure 3d: ${m3d ? measureText(m3d) : "нет"}`);
      if (!m3d || Math.hypot(m3d.b[0] - m3d.a[0], m3d.b[1] - m3d.a[1], m3d.b[2] - m3d.a[2]) < 1) throw new Error("automeasure: два клика в 3D не дали длины");
      setMeasure(null);
      setTool("select");
    }
    if (app.autoscatter) {
      // model,dx,spacing: the prop brush with the model, dragged dx pixels across the 3D view; several props must land.
      const [model, dxs, sps] = app.autoscatter.split(",");
      const el = canvasRef.current;
      if (!el) throw new Error("autoscatter: нет 3D-холста");
      setTool("entity");
      setEntityClass("prop_static");
      setCurrentModel(model);
      setScatter({ on: true, spacing: Number(sps) || 48, randomYaw: true, models: [model] });
      await new Promise((r) => setTimeout(r, 2500));
      const r = el.getBoundingClientRect();
      const x0 = r.left + r.width * 0.35;
      const y0 = r.top + r.height * 0.62;
      const dx = Number(dxs) || 300;
      const fire = (type: string, x: number, y: number) =>
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "mouseup" ? 0 : 1 }));
      const before = map.entities.length;
      fire("mousedown", x0, y0);
      await new Promise((r) => setTimeout(r, 600));
      for (let i = 1; i <= 20; i++) {
        fire("mousemove", x0 + (dx * i) / 20, y0 + Math.sin(i / 3) * 12);
        await new Promise((r) => setTimeout(r, 120));
      }
      fire("mouseup", x0 + dx, y0);
      await new Promise((r) => setTimeout(r, 800));
      setScatter({ on: false });
      const m2 = current.current ?? map;
      const placed = m2.entities.slice(before);
      void api.log(
        `autoscatter ${model} dx ${dx} spacing ${sps}: entities ${before} -> ${m2.entities.length}; yaws ${placed.map((e) => (e.angles ? Math.round(e.angles[1]) : "?")).join(" ")}; undo «${history(m2).undo}»`,
      );
      if (placed.length < 3) throw new Error(`autoscatter: кисть поставила ${placed.length}`);
      if (!(history(m2).undo ?? "").startsWith("Кисть")) throw new Error(`autoscatter: штрих не склеен в один шаг отмены: ${history(m2).undo}`);
      m2.doc.undo();
      await applyEdit();
      const after = (current.current ?? m2).entities.length;
      void api.log(`autoscatter undo: entities ${m2.entities.length} -> ${after}`);
      if (after !== before) throw new Error(`autoscatter: после отмены ${after} энтити, ждали ${before}`);
    }
    if (app.autoplace) {
      // model,dx,wheel: the entity tool with a prop, the left button held from the view's centre and dragged dx pixels
      // (a row), the wheel turned `wheel` notches (the gap), released: the row becomes entities.
      const [model, dxs, wheels] = app.autoplace.split(",");
      const el = canvasRef.current;
      if (!el) throw new Error("autoplace: нет 3D-холста");
      setTool("entity");
      setEntityClass("prop_static");
      setCurrentModel(model);
      await new Promise((r) => setTimeout(r, 300));
      const r = el.getBoundingClientRect();
      const x0 = r.left + r.width * 0.5;
      const y0 = r.top + r.height * 0.62;
      const dx = Number(dxs) || 300;
      const wheel = Number(wheels) || 0;
      const fire = (type: string, x: number, y: number, extra: MouseEventInit = {}) =>
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: type === "mouseup" ? 0 : 1, ...extra }));
      const before = map.entities.length;
      // Hover first: the ghost appears under the cursor.
      el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: x0, clientY: y0, buttons: 0 }));
      // A cold model loads from the game's VPKs: give the ghost and the row start time to fetch it.
      await new Promise((r) => setTimeout(r, 2500));
      fire("mousedown", x0, y0);
      await new Promise((r) => setTimeout(r, 2500));
      for (let i = 1; i <= 10; i++) {
        fire("mousemove", x0 + (dx * i) / 10, y0);
        await new Promise((r) => setTimeout(r, 40));
      }
      for (let i = 0; i < Math.abs(wheel); i++) el.dispatchEvent(new WheelEvent("wheel", { bubbles: true, cancelable: true, clientX: x0 + dx, clientY: y0, deltaY: wheel < 0 ? 100 : -100 }));
      await new Promise((r) => setTimeout(r, 200));
      fire("mouseup", x0 + dx, y0);
      await new Promise((r) => setTimeout(r, 800));
      const m2 = current.current ?? map;
      const placed = m2.entities.slice(before);
      void api.log(
        `autoplace ${model} dx ${dx} wheel ${wheel}: entities ${before} -> ${m2.entities.length}; placed ${placed.map((e) => `${e.classname}@${e.origin ? e.origin.map((v) => Math.round(v)).join(" ") : "?"} ang ${e.angles ? e.angles.map((v) => Math.round(v)).join(" ") : "?"}`).join(" | ")}; selected ${selection.current.size}, undo ${history(m2).undo}`,
      );
      if (placed.length < 2) throw new Error(`autoplace: ряд не выложился (${placed.length})`);
    }
    if (app.autodrop) {
      // kind,name,view,fx,fy: a drop at that fraction of the view, as if dragged from a panel.
      const [kind, name, view, fxs, fys] = app.autodrop.split(",");
      const el = view === "3d" ? canvasRef.current : canvas2dRefs.current[view as ViewKind];
      if (el) {
        const r = el.getBoundingClientRect();
        const ev = { clientX: r.left + r.width * (Number(fxs) || 0.5), clientY: r.top + r.height * (Number(fys) || 0.5), shiftKey: false } as MouseEvent;
        const before = { solids: map.stats.solids, entities: map.entities.length };
        const under = document.elementFromPoint(ev.clientX, ev.clientY);
        void api.log(
          `autodrop at ${Math.round(ev.clientX)},${Math.round(ev.clientY)} rect ${Math.round(r.width)}x${Math.round(r.height)} under ${under?.tagName}.${under?.className} view ${(under?.closest("[data-view]") as HTMLElement | null)?.dataset.view}`,
        );
        if (kind === "prefab") prefabsRef.current = await api.listPrefabs();
        await dropAssetRef.current(kind as AssetKind, name, ev);
        const m2 = current.current ?? map;
        const last = m2.pointEntities[m2.pointEntities.length - 1];
        const box = modelCache.current.get(`${name}|0|0`);
        void api.log(
          `autodrop ${kind} ${name} on ${view}: solids ${before.solids} -> ${m2.stats.solids}, entities ${before.entities} -> ${m2.entities.length}, materials ${m2.mesh.materials.includes(name) ? "include" : "lack"} ${name}, undo ${history(m2).undo}, last ${last?.classname} at ${JSON.stringify(last?.origin)} angles ${JSON.stringify(last?.angles)}, model box ${box ? `${box.mins.map((v) => Math.round(v))}..${box.maxs.map((v) => Math.round(v))}` : "none"}`,
        );
      } else void api.log(`autodrop: no view ${view}`);
    }
    if (app.automatpreview) {
      // name,fx,fy[,shift|ctrl]: the drag preview of a material at that point of the 3D view, then a screenshot.
      const [name, fxs, fys, mod] = app.automatpreview.split(",");
      const el = canvasRef.current;
      const s = session.current;
      if (el && s) {
        const r = el.getBoundingClientRect();
        const ev = { clientX: r.left + r.width * (Number(fxs) || 0.5), clientY: r.top + r.height * (Number(fys) || 0.5), shiftKey: mod === "shift", ctrlKey: mod === "ctrl" } as MouseEvent;
        const t0 = performance.now();
        await updateMaterialPreview(name, ev);
        const t1 = performance.now();
        await new Promise((r) => setTimeout(r, 1500));
        void api.log(`automatpreview ${name}: key ${matPreview.current?.key ?? "none"}, ${Math.round(t1 - t0)} ms, history ${history(map).undo}`);
        if (app.autoshot) await api.debugScreenshot(await s.renderer.capture(s.camera), app.autoshot.replace(/\.png$/i, "_matpreview.png"));
        await revertMaterialPreview();
      }
    }
    if (app.automodelghost) {
      // model,fx,fy: the drag ghost of a model at that point of the 3D view, then a screenshot.
      const [name, fxs, fys] = app.automodelghost.split(",");
      const el = canvasRef.current;
      const s = session.current;
      if (el && s) {
        const r = el.getBoundingClientRect();
        const ev = { clientX: r.left + r.width * (Number(fxs) || 0.5), clientY: r.top + r.height * (Number(fys) || 0.5) } as MouseEvent;
        const t0 = performance.now();
        await updateModelGhost(name, ev);
        const t1 = performance.now();
        await new Promise((r) => setTimeout(r, 1500));
        void api.log(`automodelghost ${name}: ${Math.round(t1 - t0)} ms, entities ${map.entities.length}, history ${history(map).undo}`);
        if (app.autoshot) await api.debugScreenshot(await s.renderer.capture(s.camera), app.autoshot.replace(/\.png$/i, "_ghost.png"));
        clearModelGhost();
      }
    }
    if (app.autocollapse) {
      const before = { solids: map.stats.solids, entities: map.entities.length };
      await collapseInstances();
      const named = map.entities.filter((e) => e.targetname).map((e) => e.targetname);
      void api.log(
        `autocollapse: solids ${before.solids} -> ${map.stats.solids}, entities ${before.entities} -> ${map.entities.length}, names ${named.slice(0, 8).join(",")}, undo ${history(map).undo}`,
      );
    }
    if (app.autoface) {
      const edit: Record<string, string | number> = {};
      for (const kv of app.autoface.split(";")) {
        const [k, v] = kv.split("=");
        if (!k) continue;
        edit[k] = ["material", "align", "justify"].includes(k) ? v : Number(v);
      }
      faceSel.current.clear();
      for (const id of selection.current) for (const side of map.doc.solid_sides(id)) faceSel.current.set(`${id}:${side}`, [id, side]);
      refreshFaces();
      await editFaces(edit as FaceEdit);
      const first = faceSel.current.values().next().value as [number, number] | undefined;
      void api.log(`autoface ${app.autoface}: faces ${faceSel.current.size}, first ${JSON.stringify(first ? map.doc.face_info(first[0], first[1]) : null)}, undo ${history(map).undo}`);
    }
    if (app.autoclone) {
      const n = app.autoclone.split(",").map(Number);
      if (n.length === 3 && n.every((x) => Number.isFinite(x))) {
        const before = Array.from(selection.current);
        copySelection();
        await cloneSelection([n[0], n[1], n[2]]);
        const clones = Array.from(selection.current);
        const pasted = map.doc.paste_vmf(clipboardRef.current, new Float64Array([0, 0, 0])) as EditResult | undefined;
        if (pasted) await applyEdit();
        void api.log(
          `autoclone ${app.autoclone}: ${before.join(",")} -> clones ${clones.join(",")}, paste ${pasted ? pasted.changed_ids.join(",") : "none"}, solids ${map.stats.solids}, entities ${map.entities.length}, invalid ${map.stats.invalid_solids}, undo ${history(map).undo}`,
        );
      }
    }
    if (app.autodisp) {
      const [power, radius, amount] = app.autodisp.split(",").map(Number);
      // Top quads of the selected brushes become displacements; the first is sculpted at its centre.
      faceSel.current.clear();
      for (const id of selection.current) {
        for (const side of map.doc.solid_sides(id)) {
          const fi = map.doc.face_info(id, side) as FaceInfo | undefined;
          if (fi?.quad && fi.normal[2] > 0.5) faceSel.current.set(`${id}:${side}`, [id, side]);
        }
      }
      refreshFaces();
      await createDisplacement(power || 3);
      const first = faceSel.current.values().next().value as [number, number] | undefined;
      let report = "no quad";
      if (first) {
        const poly = map.doc.face_polygon(first[0], first[1]);
        const c: Vec3 = [0, 0, 0];
        for (let i = 0; i < poly.length; i += 3) for (let k = 0; k < 3; k++) c[k] += poly[i + k] / (poly.length / 3);
        const before = Array.from(map.doc.displacement_grid(first[0], first[1]));
        setPaint({ on: true, radius: radius || 128, amount: amount || 32, axis: 0, mode: "geometry" });
        await paintAt(first[0], first[1], c, false, false);
        await paintAt(first[0], first[1], c, false, true);
        const after = Array.from(map.doc.displacement_grid(first[0], first[1]));
        const mid = Math.floor(before.length / 6) * 3;
        report = `face ${first.join(":")} grid ${before.length / 3} verts, centre z ${before[mid + 2]} -> ${after[mid + 2]}, disp faces ${map.stats.displacement_faces}`;
      }
      void api.log(`autodisp ${app.autodisp}: faces ${faceSel.current.size}, ${report}, invalid ${map.stats.invalid_solids}, undo ${history(map).undo}`);
      if (app.autodispop && first) {
        const grid = () => Array.from(map.doc.displacement_grid(first[0], first[1]));
        const mid = (g: number[]) => g[Math.floor(g.length / 6) * 3 + 2];
        for (const op of app.autodispop.split(",")) {
          const g0 = grid();
          if (op === "smooth") {
            setPaint({ ...paintRef.current, mode: "smooth", amount: 32, radius: 512 });
            const poly = map.doc.face_polygon(first[0], first[1]);
            const c: Vec3 = [0, 0, 0];
            for (let i = 0; i < poly.length; i += 3) for (let k = 0; k < 3; k++) c[k] += poly[i + k] / (poly.length / 3);
            for (let i = 0; i < 4; i++) await paintAt(first[0], first[1], c, false, i > 0);
          } else await displacementOp(op as "invert" | "subdivide");
          const g1 = grid();
          const fi = map.doc.face_info(first[0], first[1]) as FaceInfo | undefined;
          void api.log(`autodispop ${op}: verts ${g0.length / 3} -> ${g1.length / 3}, centre z ${mid(g0)} -> ${mid(g1)}, power ${fi?.disp_power}, undo ${history(map).undo}`);
        }
      }
    }
    if (app.autoprop) {
      const [model, ...rest] = app.autoprop.split(",");
      const n = rest.map(Number);
      if (model && n.length === 3 && n.every((x) => Number.isFinite(x))) {
        setCurrentModel(model);
        setEntityClass("prop_static");
        await createEntityAt([n[0], n[1], n[2]]);
        const st = s.renderer.stats();
        const id = Array.from(selection.current)[0];
        const list = await api.listModels("props_c17 drum", 5);
        const previewKey = await ensureModel(model, 0);
        const png = previewKey ? await s.renderer.renderModelPreview(previewKey, 128) : null;
        void api.log(`autoprop preview: ${png ? `${png.length} chars` : "none"}`);
        if (png && app.autoshot) await api.debugScreenshot(png, app.autoshot.replace(/\.png$/i, "_model.png"));
        void api.log(
          `autoprop ${app.autoprop}: entity ${id}, bounds ${JSON.stringify(modelBoundsRef.current.get(id) ?? null)}, models ${st.models}, props ${st.props}, triangles ${st.triangles}, browser "props_c17 drum" ${list.total}: ${list.names.join(",")}, undo ${history(map).undo}`,
        );
      }
    }
    if (app.autoworldkey) {
      const changes: [string, string | null][] = app.autoworldkey.split(";").map((kv) => {
        const [k, v = ""] = kv.split("=");
        return [k, v === "" ? null : v];
      });
      await setWorldKeys(changes);
      void api.log(`autoworldkey ${app.autoworldkey}: ${JSON.stringify(map.doc.world_keyvalues())}, undo ${history(map).undo}`);
    }
    if (app.autoreplace) {
      const [f, r, scope = "map"] = app.autoreplace.split(",");
      await replaceTextures(f, r, scope === "selection" ? "selection" : "map", false);
      void api.log(`autoreplace ${app.autoreplace}: materials ${map.mesh.materials.join(",")}, undo ${history(map).undo}`);
    }
    if (app.autoalpha) {
      const [radius, amount] = app.autoalpha.split(",").map(Number);
      let first: [number, number] | undefined;
      for (const id of selection.current) {
        for (const side of map.doc.solid_sides(id)) {
          const fi = map.doc.face_info(id, side) as FaceInfo | undefined;
          if (fi && fi.disp_power > 0) first = [id, side];
          if (first) break;
        }
        if (first) break;
      }
      if (first) {
        const poly = map.doc.face_polygon(first[0], first[1]);
        const c: Vec3 = [0, 0, 0];
        for (let i = 0; i < poly.length; i += 3) for (let k = 0; k < 3; k++) c[k] += poly[i + k] / (poly.length / 3);
        setPaint({ on: true, radius: radius || 128, amount: amount || 255, axis: 0, mode: "alpha" });
        await paintAt(first[0], first[1], c, false, false);
        const alphas = Array.from(map.doc.displacement_alphas(first[0], first[1]));
        const mid = Math.floor(alphas.length / 2);
        void api.log(
          `autoalpha ${app.autoalpha}: face ${first.join(":")}, centre alpha ${alphas[mid]}, max ${Math.max(...alphas)}, mesh alphas>0 ${Array.from(map.mesh.alphas).filter((a) => a > 0).length}, undo ${history(map).undo}`,
        );
      } else void api.log("autoalpha: no displacement in the selection");
    }
    if (app.autolandscape) {
      // The wizard in front of the camera, then the brush: a few dabs along +x.
      const [w = 1024, l = 1024, nx = 2, ny = 2, power = 3] = app.autolandscape.split(",").map(Number);
      const c = suggestLandscapeOrigin();
      const t0 = performance.now();
      await createLandscape({ width: w, length: l, nx, ny, power, thickness: 64, origin: [c[0] - w / 2, c[1] - l / 2, c[2]], material: materialRef.current });
      const m = current.current!;
      void api.log(`autolandscape ${w}x${l} ${nx}x${ny} p${power}: ${Math.round(performance.now() - t0)} ms, solids ${m.stats.solids}, selected ${selection.current.size}, undo ${history(m).undo}`);
    }
    if (app.autosculpt) {
      const [mode = "raise", xs = "0", ys = "0", zs = "0", rs = "256", as = "32", ds = "4"] = app.autosculpt.split(",");
      // "c" for the coordinates means the centre of the selection's top (the landscape just made).
      const sb = selectionBounds();
      const cx = sb ? (sb[0][0] + sb[1][0]) / 2 : 0;
      const cy = sb ? (sb[0][1] + sb[1][1]) / 2 : 0;
      const cz = sb ? sb[1][2] : 0;
      const [x, y, z, radius, amount, dabs] = [xs === "c" ? cx : Number(xs), ys === "c" ? cy : Number(ys), zs === "c" ? cz : Number(zs), Number(rs), Number(as), Number(ds)];
      landscapeRef.current = { ...landscapeRef.current, mode: mode as typeof landscapeRef.current.mode, radius, amount };
      const m = current.current!;
      const ids = new Set(selection.current);
      const t0 = performance.now();
      for (let i = 0; i < Math.max(1, dabs); i++) {
        await sculptAt([x + (i * radius) / 3, y, z], false, i > 0, z, null);
      }
      const ms = performance.now() - t0;
      // The height reached: the highest vertex of the selected solids' displacements.
      let peak = -Infinity;
      let verts = 0;
      const seen = new Set<string>();
      const ft = m.mesh.faceTable;
      for (let f = 0; f < ft.length / 4; f++) {
        const sid = ft[f * 4 + 1];
        const side = ft[f * 4 + 2];
        const key = `${sid}:${side}`;
        if (!ids.has(sid) || seen.has(key)) continue;
        seen.add(key);
        const fi = m.doc.face_info(sid, side) as FaceInfo | undefined;
        if (!fi || fi.disp_power === 0) continue;
        const grid = m.doc.displacement_grid(sid, side) as Float32Array;
        for (let i = 2; i < grid.length; i += 3) {
          peak = Math.max(peak, grid[i]);
          verts++;
        }
      }
      void api.log(
        `autosculpt ${mode} r${radius} a${amount} x${dabs}: ${Math.round(ms)} ms (${Math.round(ms / Math.max(1, dabs))} per dab), undo ${history(m).undo}, verts ${verts}, peak z ${peak.toFixed(1)}`,
      );
    }
    if (app.autosound) {
      // A second of 440 Hz through the export path: WAV with a loop cue, into the project, then an ambient_generic.
      const rate = 44100;
      const off = new OfflineAudioContext(1, rate, rate);
      const osc = off.createOscillator();
      osc.frequency.value = 440;
      osc.connect(off.destination);
      osc.start();
      const buf = await off.startRendering();
      const chans = [buf.getChannelData(0).slice()];
      const rendered = renderClip(chans, rate, { start: 0, end: rate, gain: 0.5, fadeIn: 10, fadeOut: 10, crossfade: 50 });
      const bytes = encodeWav(rendered, rate, 0);
      const res = await api.writeSound(currentPath.current, "autotest_tone", bytes);
      SOUND_LOOPS.set(res.name, true);
      await placeSound(res.name, true);
      const back = new Uint8Array(await (await fetch(soundUrl(res.name))).arrayBuffer());
      const info = parseWavInfo(back);
      const m = current.current!;
      const ent = m.pointEntities.find((e) => e.classname === "ambient_generic");
      const keys = ent ? (m.doc.entity_details(ent.id) as { keyvalues: [string, string][] }).keyvalues : [];
      void api.log(
        `autosound: wrote ${res.name} ${res.bytes} bytes -> ${res.path}; read back ${back.length} bytes, ${info ? `${info.sampleRate} Hz ${info.channels} ch ${info.frames} frames cue ${info.cue}` : "unparsed"}; ambient_generic ${ent ? ent.id : "none"} message=${keys.find(([k]) => k === "message")?.[1]} spawnflags=${keys.find(([k]) => k === "spawnflags")?.[1]}; sounds listed ${(await api.listSounds("autotest_tone", 5)).total}`,
      );
      if (!info || info.cue !== 0 || !ent) throw new Error("autosound: экспорт или энтити не сошлись");
    }
    if (app.autopaint) {
      // A 128×128 picture through the painter's export: grey, a red dab across the seam, a blue square, text.
      const pix = makePix(128, 128, [90, 90, 90, 255]);
      dab(pix, 0, 0, { radius: 24, hardness: 1, opacity: 1, color: [220, 40, 40, 255], wrap: true });
      rect(pix, 40, 40, 88, 88, { radius: 1, hardness: 1, opacity: 1, color: [30, 60, 220, 255] }, false);
      const label = textToPix("Mallet", 18, [255, 255, 255, 255]);
      if (label) stamp(pix, label, 34, 98, 1, false);
      const png = await pixToPng(pix);
      const res = await api.writeTexture(currentPath.current, "autotest_paint", "custom", "UnlitGeneric", png);
      await applyPaintedTexture(res.material, true);
      const back = await imageToPix(new Uint8Array(await (await fetch(thumbnailUrl(res.material, 128))).arrayBuffer()));
      const corner = pickColor(back, 127, 127);
      const mid = pickColor(back, 64, 64);
      const m = current.current!;
      const first = Array.from(selection.current).find((id) => m.doc.solid_sides(id).length > 0);
      const fi = first !== undefined ? (m.doc.face_info(first, m.doc.solid_sides(first)[0]) as FaceInfo | undefined) : undefined;
      const info = (await api.materialsInfo([res.material]))[0];
      void api.log(
        `autopaint: ${res.material} ${res.width}x${res.height} translucent ${res.translucent} -> ${res.vtf}; shader ${info?.shader} ${info?.width}x${info?.height}; read back ${back.w}x${back.h} corner ${corner?.join(",")} mid ${mid?.join(",")}; png ${png.length} bytes; face material ${fi?.material ?? "no selection"}, undo ${history(m).undo}`,
      );
      if (!corner || corner[0] < 150 || corner[2] > 100 || !mid || mid[2] < 150 || (fi && fi.material !== res.material)) throw new Error("autopaint: экспорт не сошёлся");
    }
    if (app.autoassist) {
      // The assistant on a request: the real API when a key is stored, else the canned backend; every tool runs for real.
      const key = await api.assistantKeyStatus();
      const real = key.present || !!key.cli;
      const backend: Backend = real
        ? async (req) => (await api.assistantChat({ model: req.model, system: req.system, messages: req.messages, tools: req.tools, maxTokens: req.maxTokens, backend: "auto" })) as ChatResponse
        : mockBackend;
      assistantConfirm.current = async (title) => {
        void api.log(`autoassist: confirm "${title}" -> yes`);
        return true;
      };
      const before = current.current!.stats.solids;
      assistantBusy.current = true;
      const t0 = performance.now();
      const messages: Message[] = [{ role: "user", content: app.autoassist }];
      let deltas = 0;
      const onEv = (ev: AssistantEvent) => {
        if (ev.kind === "text") void api.log(`autoassist text: ${ev.text.replace(/\s+/g, " ").slice(0, 300)}`);
        else if (ev.kind === "text_delta") deltas++;
        else if (ev.kind === "text_end") void api.log(`autoassist text streamed in ${deltas} pieces`);
        else if (ev.kind === "tool_pending") void api.log(`autoassist pending ${ev.name}`);
        else if (ev.kind === "tool") void api.log(`autoassist tool ${ev.name} ${JSON.stringify(ev.input).slice(0, 160)} -> ${ev.error ? "ERROR " : ""}${ev.result.replace(/\s+/g, " ").slice(0, 160)}`);
        else if (ev.kind === "usage") void api.log(`autoassist usage: ${ev.inputTokens} in, ${ev.outputTokens} out`);
        else if (ev.kind === "error") void api.log(`autoassist error: ${ev.text}`);
      };
      // Claude Code runs the request itself with the editor's tools over MCP; the API and the demo go through the editor's loop.
      const cliSession = { id: null as string | null };
      const r = key.cli
        ? await cliTurn(app.autoassist, "claude-sonnet-5-5", shellCliRunner, assistantTools, onEv, undefined, cliSession)
        : await assistantTurn(messages, "claude-sonnet-5-5", backend, assistantTools, onEv);
      if (key.cli) {
        // A follow-up goes to the same living process: no start-up, the conversation remembered.
        const t1 = performance.now();
        const r2 = await cliTurn("Теперь удали браш, который ты только что создал, и ответь одной строкой.", "claude-sonnet-5-5", shellCliRunner, assistantTools, onEv, undefined, cliSession);
        void api.log(`autoassist follow-up: ${r2.steps} steps, ${r2.edits} edits, ${Math.round(performance.now() - t1)} ms, session kept ${!!cliSession.id}`);
        if (r2.edits < 1) throw new Error("autoassist: второй запрос не изменил карту");
      }
      assistantBusy.current = false;
      const m = current.current!;
      void api.log(
        `autoassist: backend ${key.cli ? `cli ${key.cli}` : key.present ? "api" : "mock"}, ${r.steps} steps, ${r.edits} edits, ${Math.round(performance.now() - t0)} ms, solids ${before} -> ${m.stats.solids}, entities ${m.stats.entities}, undo ${history(m).undo}`,
      );
      if (!real && (r.edits < 3 || m.stats.solids < before + 6)) throw new Error("autoassist: демо-ход не построил комнату");
      if (real && r.steps === 0) throw new Error("autoassist: бэкенд не ответил");
    }
    if (app.autosew) {
      const res = map.doc.sew_displacements(new Uint32Array(selection.current)) as EditResult | undefined;
      if (res) await applyEdit();
      void api.log(`autosew: ${res ? res.label : "nothing"}, undo ${history(map).undo}`);
    }
    if (app.autohelpers) {
      refreshHelpers();
      void api.log(`autohelpers: ${JSON.stringify(s.renderer.overlayInfo("helpers"))}`);
    }
    if (app.autoproblems) {
      // What the status bar said right after opening (a map saved with hidden objects says so).
      const opened = [...document.querySelectorAll(".statusbar .ok.list-text, .ok.list-text")].map((n) => n.textContent).find((t) => t?.includes("скрыто в файле"));
      void api.log(`autoproblems: hidden ${(map.doc.hidden_ids() as Uint32Array).length}, status on open «${opened ?? ""}»`);
      const t0 = performance.now();
      const list = (await checkProblems()) ?? [];
      const first = performance.now() - t0;
      // A second pass shows the cost of the checks themselves, with the FGD and resource answers cached.
      const t1 = performance.now();
      await checkProblems(true);
      const again = performance.now() - t1;
      const kinds = new Map<string, number>();
      for (const p of list) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
      void api.log(
        `autoproblems: ${list.length} found in ${Math.round(first)} ms (again ${Math.round(again)} ms), solids ${map.mesh.solidIds.length}, entities ${map.entities.length}; kinds ${[...kinds].map(([k, n]) => `${k}:${n}`).join(" ")}`,
      );
      void api.log(
        `autoproblems: ${list
          .slice(0, 8)
          .map((p) => `[${p.kind}] ${p.message}`)
          .join(" | ")}`,
      );
      const lit = list.filter((p) => p.kind === "light_in_solid").slice(0, 3);
      for (const p of lit) {
        const brush = Number(/браша (\d+)/.exec(p.message)?.[1]);
        const sides = brush ? [...(map.doc.solid_sides(brush) as Uint32Array)] : [];
        void api.log(
          `autoproblems: ${p.message} · brush ${brush} owner ${brush ? map.doc.entity_of_solid(brush) : "-"} materials ${[...new Set(sides.map((sd) => map.doc.face_material(brush, sd)))].join(",")}`,
        );
      }
      if (app.autoproblems === "fix") {
        const fixed = await fixProblems(list);
        const after = map.doc.problems() as Problem[];
        void api.log(
          `autofix: fixed ${fixed}, left ${after.length}: ${after
            .slice(0, 6)
            .map((p) => `[${p.kind}] ${p.message}`)
            .join(" | ")}, undo ${history(map).undo}`,
        );
      }
    }
    if (app.autodelete) {
      await deleteSelection();
      void api.log(`autodelete: ${map.stats.solids} solids left, undo ${history(map).undo}`);
    }
    if (app.autosatellite && ALL_VIEWS.includes(app.autosatellite as ViewId)) {
      const t0 = performance.now();
      const n = await openSatellite(app.autosatellite as ViewId);
      void api.log(`autosatellite ${app.autosatellite}: ${n < 0 ? "no answer" : `${n} solids`} in ${Math.round(performance.now() - t0)} ms`);
    }
    if (app.autopanel && app.autopanel in PANEL_TITLES) {
      openPanel(app.autopanel as Panel);
      await new Promise((r) => setTimeout(r, 800));
    }
    if (app.autodom) {
      // Layout debugging: sizes and the styles that decide them, for the first matches of a selector.
      await new Promise((r) => setTimeout(r, 400));
      const els = Array.from(document.querySelectorAll(app.autodom)).slice(0, 4);
      for (const el of els) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const extra = el instanceof HTMLImageElement ? ` natural ${el.naturalWidth}x${el.naturalHeight} complete ${el.complete}` : "";
        const grid = cs.display === "grid" ? ` rows ${cs.gridTemplateRows.split(" ").slice(0, 3).join(" ")} autoRows ${cs.gridAutoRows}` : "";
        void api.log(
          `autodom ${el.tagName}.${el.className}: ${Math.round(r.width)}x${Math.round(r.height)} display ${cs.display} h ${cs.height} minH ${cs.minHeight} maxH ${cs.maxHeight} ar ${cs.aspectRatio} w ${cs.width} pad ${cs.padding} ov ${cs.overflow}${grid}${extra}`,
        );
      }
      if (!els.length) void api.log(`autodom: nothing matches ${app.autodom}`);
    }
    if (app.autotour) {
      // Every step's target must be on screen in the default layout: log where each one is.
      setTourKind(app.autotour === "full" ? "full" : app.autotour === "hammer" ? "hammer" : "quick");
      setTourIndex(0);
      // The apply button lives in the textures panel: open it, as the tour's own step does.
      setPanel("textures");
      await new Promise((r) => setTimeout(r, 600));
      const found: string[] = [];
      const kind: TourKind = app.autotour === "full" ? "full" : app.autotour === "hammer" ? "hammer" : "quick";
      const steps = tourScript(kind, {
        hasMap: true,
        tool: "select",
        texturesShown: true,
        brush: false,
        texture: false,
        entity: false,
        compile: false,
        inTauri,
        gameFound: content?.state === "ready",
      });
      for (const st of steps) {
        if (!st.target) continue;
        const el = st.target ? (document.querySelector(st.target) as HTMLElement | null) : null;
        const r = el?.getBoundingClientRect();
        found.push(`${st.id}:${r && r.width > 0 ? `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : "missing"}`);
      }
      const tip = document.querySelector(".tour-tip")?.getBoundingClientRect();
      const spot = document.querySelector(".tour-spot")?.getBoundingClientRect();
      void api.log(
        `autotour: ${found.join("; ")}; tip ${tip ? `${Math.round(tip.left)},${Math.round(tip.top)} ${Math.round(tip.width)}x${Math.round(tip.height)}` : "none"}; spot ${spot ? `${Math.round(spot.left)},${Math.round(spot.top)} ${Math.round(spot.width)}x${Math.round(spot.height)}` : "none"}`,
      );
      if (found.some((f) => f.endsWith("missing"))) throw new Error(`autotour: targets missing: ${found.filter((f) => f.endsWith("missing")).join(", ")}`);
      setTourIndex(null);
    }
    if (app.autoperf) {
      // Seconds of frames with the opening camera, once the textures have settled.
      const secs = Math.max(1, Number(app.autoperf) || 5);
      const t0 = performance.now();
      while (s.renderer.stats().texturesPending > 0 && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 100));
      const settle = performance.now() - t0;
      const sampler = { until: performance.now() + secs * 1000, stamps: [] as number[] };
      perfSampler.current = sampler;
      await new Promise((r) => setTimeout(r, secs * 1000 + 200));
      perfSampler.current = null;
      const d: number[] = [];
      for (let i = 1; i < sampler.stamps.length; i++) d.push(sampler.stamps[i] - sampler.stamps[i - 1]);
      d.sort((a, b) => a - b);
      const avg = d.length ? d.reduce((a, b) => a + b, 0) / d.length : 0;
      const p95 = d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : 0;
      const max = d.length ? d[d.length - 1] : 0;
      const rs = s.renderer.stats();
      const mem = s.renderer.memory();
      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
      const mb = (b: number) => (b / 1048576).toFixed(1);
      void api.log(
        `autoperf ${mapNameRef.current}: open ${lastOpenMs.current.toFixed(0)} ms, textures settled in ${settle.toFixed(0)} ms, ${d.length} frames in ${secs} s: avg ${avg.toFixed(2)} ms (${avg > 0 ? (1000 / avg).toFixed(0) : "?"} fps), p95 ${p95.toFixed(2)} ms, max ${max.toFixed(1)} ms, render ${rs.frameMs.toFixed(2)} ms; draws ${rs.drawCalls}, tris ${rs.triangles}, props ${rs.props}; gpu geometry ${mb(mem.geometry)} MB, models ${mb(mem.models)} MB, textures ${mb(mem.textures)} MB (${mem.textureCount}); core ${mb(coreMemoryBytes())} MB, js heap ${mb(heap)} MB`,
      );
    }
    if (app.autoshot) {
      const st = s.renderer.stats();
      void api.log(`capture: ${st.texturesLoaded} loaded, ${st.texturesMissing} missing, ${st.texturesPending} pending, ${st.drawCalls} draws, ${st.entities} entities`);
      updateGizmo(s.camera);
      await api.debugScreenshot(await s.renderer.capture(s.camera), app.autoshot);
      const top = s.views.top;
      if (top) await api.debugScreenshot(await s.renderer.capture2D(top), app.autoshot.replace(/\.png$/i, "_top.png"));
    }
    if (app.autosave) {
      await saveTo(app.autosave);
      await new Promise((r) => setTimeout(r, 300));
      const versions = await api.listHistory(app.autosave).catch(() => []);
      void api.log(`autosave: dirty ${history(map).dirty}, history ${versions.length}`);
    }
    if (app.autocompile) {
      const tools = app.autocompile.split(",");
      await compileCurrent({
        ...DEFAULT_COMPILE,
        vbsp: tools.includes("vbsp"),
        vvis: tools.includes("vvis"),
        vrad: tools.includes("vrad"),
        fast: true,
        install: !!app.autobridge,
        extraCommands: app.autoextra ?? "",
      });
      void api.log(`autocompile ${app.autocompile}: started on ${currentPath.current}`);
      if (app.autoexit) {
        // Leave once the compile reports back (or after a generous wait).
        const started = performance.now();
        while (compileRun.current === 0 || performance.now() - started < 180000) {
          await new Promise((r) => setTimeout(r, 500));
          if (compileDoneRef.current === compileRun.current && compileRun.current !== 0) break;
        }
        // Let the pointfile load settle, then report what the log parser found.
        await new Promise((r) => setTimeout(r, 1000));
        if (app.autoshot) await api.debugScreenshot(await s.renderer.capture(s.camera), app.autoshot.replace(/\.png$/i, "_leak.png"));
        if (app.autopack) {
          const report = await analyzePack();
          if (report) await packCustom(report);
          void api.log(`autopack: done, bsp ${lastBsp.current ?? "none"}`);
        }
        const lines = compileLinesRef.current;
        const found = lines.filter((l) => /leaked|error|warning|brush \d+/i.test(l));
        void api.log(`autocompile findings: ${found.length}, leak points ${leakPointsRef.current}: ${found.slice(0, 4).join(" | ")}`);
        if (tools.includes("vvis")) {
          const n = await loadPortalfile();
          showPortals(true);
          void api.log(`portals: ${n}, segments ${portalSegs.current ? portalSegs.current.length / 6 : 0}`);
          if (app.autoshot) await api.debugScreenshot(await s.renderer.capture(s.camera), app.autoshot.replace(/\.png$/i, "_portals.png"));
        }
        if (app.autobridge) {
          // Start the game on the installed BSP, wait for the addon, build cubemaps, end the game.
          const waitFor = async (event: string, ms: number) => {
            const started = performance.now();
            while (performance.now() - started < ms) {
              const reports = await api.bridgeReports();
              if (reports.some((r) => r.event === event)) return performance.now() - started;
              await new Promise((r) => setTimeout(r, 500));
            }
            return -1;
          };
          const stem = (currentPath.current ?? "").replace(/^.*[\/]/, "").replace(/\.vmf$/i, "");
          void api.log(`autobridge: ${await api.runGame(stem)}`);
          const hello = await waitFor("hello", 240000);
          const st = await api.bridgeStatus();
          if (hello < 0) {
            await api.gameKill();
            throw new Error(`autobridge: игра не вышла на связь (running ${st.running}, ready ${st.ready})`);
          }
          // A screenshot proves the picture path: JPEG bytes from the game.
          try {
            const shot = await api.bridgeScreenshot({ quality: 70 });
            void api.log(`autobridge: screenshot ${shot.length} bytes, jpeg ${shot[0] === 0xff && shot[1] === 0xd8}`);
            if (!(shot[0] === 0xff && shot[1] === 0xd8)) throw new Error("не JPEG");
          } catch (err) {
            throw new Error(`autobridge: снимок из игры не удался: ${String(err)}`);
          }
          // A teleport proves commands reach the game: the player's position must change.
          const posBefore = st.pos;
          await api.bridgeSend({ type: "teleport", x: 100, y: 100, z: 0, pitch: 0, yaw: 90 });
          await new Promise((r) => setTimeout(r, 2500));
          const after = await api.bridgeStatus();
          // Live sync: a point entity moved in the editor must be acknowledged by the game.
          const start = map.pointEntities.find((e) => e.classname.toLowerCase() === "info_player_start");
          let acked = -1;
          if (start) {
            await commitTranslate([start.id], [64, 0, 0]);
            const t1 = performance.now();
            while (performance.now() - t1 < 10000) {
              const reports = await api.bridgeReports();
              if (reports.some((r) => r.event === "ran" && r.type === "move_entity" && Number(r.id) === start.id)) {
                acked = performance.now() - t1;
                break;
              }
              await new Promise((r) => setTimeout(r, 250));
            }
          }
          void api.log(`autobridge: live move of ${start ? `entity ${start.id}` : "nothing"} ${acked < 0 ? "not acknowledged" : `acknowledged in ${Math.round(acked)} ms`}`);
          // Then the cubemaps: the game is started again with -buildcubemaps and leaves by itself.
          const t0 = performance.now();
          await bridgeCubemaps(false);
          while (!cubemapsDoneRef.current && performance.now() - t0 < 600000) await new Promise((r) => setTimeout(r, 1000));
          const d = cubemapsDoneRef.current;
          void api.log(
            `autobridge: hello ${Math.round(hello)} ms, map ${st.map}, player ${
              posBefore
                ? posBefore
                    .slice(0, 3)
                    .map((v) => Math.round(v))
                    .join(" ")
                : "?"
            } -> ${
              after.pos
                ? after.pos
                    .slice(0, 3)
                    .map((v) => Math.round(v))
                    .join(" ")
                : "?"
            }, cubemaps ${d ? `${d.ok ? "ok" : "failed"} in ${Math.round(d.ms / 1000)} s${d.timeout ? " (timeout)" : ""}` : "no result"}`,
          );
          await api.gameKill();
          if (!d?.ok) throw new Error("autobridge: кубмапы не собрались");
          if (start && acked < 0) throw new Error("autobridge: игра не подтвердила перенос энтити");
        }
      }
    }
    if (app.autoworkshop) {
      // pack: the addon folder and the GMA from the last compiled BSP, next to the map; publishing needs Steam and stays manual.
      const bsp = lastBsp.current;
      if (!bsp) throw new Error("autoworkshop: нет собранной карты (нужен GME_AUTOCOMPILE)");
      const dir = currentPath.current.replace(/[\/][^\/]*$/, "") + "/workshop";
      const r = await api.workshopPack({ bsp, map: mapNameRef.current, title: `Автотест ${mapNameRef.current}`, tags: ["fun", "build"], outDir: dir });
      void api.log(`autoworkshop pack: ${r.gma} ${r.bytes} bytes, files ${r.files.join(", ")}; ${r.log.slice(-2).join(" | ")}`);
      if (r.bytes < 1024 || !r.files.includes("addon.json")) throw new Error("autoworkshop: GMA пустой");
    }
    if (app.autojourney) {
      // The journey bar's verdict and the project file next to the map.
      await new Promise((r) => setTimeout(r, 300));
      const j = journeyRef.current;
      let metaText = "(нет пути)";
      if (currentPath.current) {
        try {
          metaText = await api.readTextFile(metaPathOf(currentPath.current));
        } catch (err) {
          metaText = `нет файла: ${String(err)}`;
        }
      }
      void api.log(`autojourney: ${journeyText(j)}`);
      void api.log(
        `autojourney meta ${currentPath.current ? metaPathOf(currentPath.current) : "-"}: ${metaText.replace(/\s+/g, " ").slice(0, 300)}; in memory compiledStamp ${projectMetaRef.current.compiledStamp} ok ${projectMetaRef.current.compiledOk} leak ${projectMetaRef.current.leak} tested ${projectMetaRef.current.testedStamp}`,
      );
      if (j.length !== 7 || j[0].status !== "done") throw new Error("autojourney: полоса пути не сошлась");
    }
    if (app.autoexit) {
      await api.log("autoexit");
      await api.exitApp(0);
    }
  };
  // A failed step is logged and still ends the run, so a harness sees the failure instead of a hang.
  void run().catch(async (e) => {
    await api.log(`autotest failed: ${String(e)}`);
    if (app.autoexit) await api.exitApp(1);
  });
}
