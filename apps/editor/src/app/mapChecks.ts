// The placement checks of «Проблемы» that live in the editor, not in the
// document core: the sun of an outdoor map, entities that fire nothing,
// player starts and lights inside brushes, entities out in the void.

import type { LoadedMap } from "../map/loader";
import type { Problem } from "../ui/ProblemsPanel";
import type { EntityDetails } from "../ui/PropertiesPanel";
import { START_CLASSES } from "./journey";
import { DETAIL_HINT_MIN, detailCandidates } from "./detail";
import { faceAxis } from "./hiddenFaces";
import { offGridShift } from "./offGrid";
import { mergeBoxes } from "./mergeBoxes";
import { ROTATING_CLASSES, originAtCentre, outsideBox } from "./transformClip";
import { parentLoops } from "./findObjects";
import { badNames } from "./rename";
import { stackedBrushes, stackedTwins } from "./stacked";
import { overlayFaces, parseSides, staleSides, type FaceRef } from "./overlaySides";
import { keyMap, overlayFrame } from "../viewport/overlays";
import { SOURCE_LIMITS, limitIssues } from "./limits";
import { edgeHinge } from "../viewport/helpers";
import { isSkyMaterial, skyLightIssues } from "./skyLight";
import { OUTPUT_ONLY, silentEntities } from "./silentEntities";
import { NONSOLID_TOOLS, isPhysicsProp, pointsInsideShapes, shapeAround, stuckStartsShapes, type Shape, liftOut, outsideWorld, pushOut, unionBox } from "./spawnCheck";
import { currentLocale, t as tr } from "../i18n";

type Box3 = [[number, number, number], [number, number, number]];

/** The visible world brushes no larger than 128 units (tool brushes left out): func_detail candidates, and how many world brushes were looked at. */
export function smallWorldBrushes(map: LoadedMap, objectBounds: (map: LoadedMap, index: number) => Box3 | null): { small: number[]; total: number } {
  const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
  const brushes: { id: number; box: Box3; tools: boolean }[] = [];
  map.mesh.solidIds.forEach((sid, idx) => {
    if (map.doc.entity_of_solid(sid) || hidden.has(sid)) return;
    const b = objectBounds(map, idx);
    if (!b) return;
    const sides = map.doc.solid_sides(sid) as Uint32Array;
    const tools = sides.length > 0 && [...sides].every((side) => map.doc.face_material(sid, side).toLowerCase().startsWith("tools/"));
    brushes.push({ id: sid, box: b, tools });
  });
  return { small: detailCandidates(brushes), total: brushes.length };
}

/** Visible box brushes whose corner sits between whole units while their size is whole, with the move that fixes each. */
export function offGridBoxes(map: LoadedMap, objectBounds: (map: LoadedMap, index: number) => Box3 | null): { id: number; shift: [number, number, number] }[] {
  const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
  const out: { id: number; shift: [number, number, number] }[] = [];
  map.mesh.solidIds.forEach((sid, idx) => {
    if (hidden.has(map.doc.entity_of_solid(sid) || sid)) return;
    const b = objectBounds(map, idx);
    const shift = b ? offGridShift(b) : null;
    if (!shift) return;
    const sides = [...(map.doc.solid_sides(sid) as Uint32Array)];
    const box = sides.length === 6 && sides.every((side) => faceAxis((map.doc.face_info(sid, side) as { normal: [number, number, number] }).normal));
    if (box) out.push({ id: sid, shift });
  });
  return out;
}

/**
 * A map with brushes but no env_cubemap: every shiny surface (water, glass, metal, wet floors)
 * reflects a black or default sky. Returns where one cubemap goes (64 units above the first player
 * start, else the middle of the map near its top), or null when the map has one or has no brushes.
 */
export function missingCubemap(map: LoadedMap): [number, number, number] | null {
  if (!map.mesh.solidIds.length || map.entities.some((e) => e.classname.toLowerCase() === "env_cubemap")) return null;
  const start = map.entities.find((e) => START_CLASSES.includes(e.classname) && e.origin);
  if (start?.origin) return [start.origin[0], start.origin[1], start.origin[2] + 64];
  const b = map.stats.bounds;
  if (!b) return [0, 0, 64];
  return [Math.round((b[0][0] + b[1][0]) / 32) * 16, Math.round((b[0][1] + b[1][1]) / 32) * 16, Math.round((b[1][2] - 64) / 16) * 16];
}

/** Brush entities holding displacements, which VBSP refuses ("displacement found on a brush entity"): entity id and its displacement brushes. */
export function displacementsInEntities(map: LoadedMap): { entity: number; classname: string; solids: number[] }[] {
  const byOwner = new Map<number, number[]>();
  for (const sid of map.mesh.solidIds) {
    const owner = map.doc.entity_of_solid(sid);
    if (!owner) continue;
    const disp = [...(map.doc.solid_sides(sid) as Uint32Array)].some((side) => ((map.doc.face_info(sid, side) as { disp_power: number }).disp_power ?? 0) > 0);
    if (disp) byOwner.set(owner, [...(byOwner.get(owner) ?? []), sid]);
  }
  return [...byOwner].map(([entity, solids]) => ({ entity, classname: map.entities.find((e) => e.id === entity)?.classname ?? "", solids }));
}

/** Every info_overlay (or only `only`) with the faces it lists and the faces actually under it now. */
export function overlaySideReport(
  map: LoadedMap,
  objectBounds: (map: LoadedMap, index: number) => Box3 | null,
  only: Set<number> | null = null,
): { id: number; listed: number[]; under: number[]; stale: boolean }[] {
  const overlays = map.entities.filter((e) => e.classname.toLowerCase() === "info_overlay" && (!only || only.has(e.id)));
  if (!overlays.length) return [];
  const faces: FaceRef[] = [];
  const existing = new Set<number>();
  map.mesh.solidIds.forEach((sid, idx) => {
    const box = objectBounds(map, idx);
    for (const side of map.doc.solid_sides(sid) as Uint32Array) {
      existing.add(side);
      const p = map.doc.face_plane(sid, side) as Float64Array | number[];
      if (box && p.length === 4) faces.push({ side, normal: [p[0], p[1], p[2]], dist: p[3], box });
    }
  });
  return overlays.map((e) => {
    const kv = keyMap((map.doc.entity_details(e.id) as EntityDetails) ?? { keyvalues: [] });
    const listed = parseSides(kv.get("sides"));
    const under = overlayFaces(overlayFrame(kv), faces);
    return { id: e.id, listed, under, stale: staleSides(listed, existing, under) };
  });
}

/** A run of box brushes that join into one box, and the look the joined box keeps. */
export type MergeGroup = { ids: number[]; box: Box3; material: string; scale: [number, number] };

/** A merge is worth a finding when it removes this many brushes from the map. */
export const MERGE_HINT_MIN = 4;

/**
 * Visible world box brushes (all of `only` when given) grouped by material and texture scale, then
 * joined wherever two share a whole face; only the groups of two or more come back.
 */
export function mergePlan(map: LoadedMap, objectBounds: (map: LoadedMap, index: number) => Box3 | null, only: Set<number> | null): MergeGroup[] {
  const hidden = new Set<number>(map.doc.hidden_ids() as Uint32Array);
  const byLook = new Map<string, { id: number; box: Box3 }[]>();
  map.mesh.solidIds.forEach((id, idx) => {
    if ((only && !only.has(id)) || map.doc.entity_of_solid(id) || hidden.has(id)) return;
    const sides = [...(map.doc.solid_sides(id) as Uint32Array)].map((side) => map.doc.face_info(id, side) as { material: string; normal: [number, number, number]; uaxis: number[]; vaxis: number[] });
    if (sides.length !== 6 || !sides.every((f) => faceAxis(f.normal))) return;
    const looks = new Set(sides.map((f) => `${f.material.toLowerCase()}|${f.uaxis[4]}|${f.vaxis[4]}`));
    const box = objectBounds(map, idx);
    if (looks.size !== 1 || !box) return;
    const key = [...looks][0];
    byLook.set(key, [...(byLook.get(key) ?? []), { id, box }]);
  });
  const out: MergeGroup[] = [];
  for (const [key, items] of byLook) {
    const [material, su, sv] = key.split("|");
    for (const g of mergeBoxes(items)) if (g.ids.length > 1) out.push({ ids: g.ids, box: g.box, material, scale: [Number(su), Number(sv)] });
  }
  return out;
}

/** Makes each joined box (its texture scale kept) and removes its pieces; returns the edits made and the new brush ids. */
export function applyMerge(map: LoadedMap, groups: MergeGroup[]): { steps: number; made: number[] } {
  let steps = 0;
  const made: number[] = [];
  for (const g of groups) {
    const res = map.doc.create_block(new Float64Array([...g.box[0], ...g.box[1]]), g.material) as { changed_ids: number[] } | undefined;
    if (!res) continue;
    steps++;
    const id = res.changed_ids[0];
    made.push(id);
    const faces = [...(map.doc.solid_sides(id) as Uint32Array)].flatMap((side) => [id, side]);
    if (map.doc.edit_faces(new Uint32Array(faces), { scale_x: g.scale[0], scale_y: g.scale[1], tex_w: 512, tex_h: 512 })) steps++;
    if (map.doc.delete_objects(new Uint32Array(g.ids))) steps++;
  }
  return { steps, made };
}

/** Findings about where things stand in the map; `objectBounds` gives the box of an object by its index (brushes first, then point entities). */
export function placementChecks(map: LoadedMap, objectBounds: (map: LoadedMap, index: number) => Box3 | null): Problem[] {
  const list: Problem[] = [];
  // The sun: sky faces want one light_environment, a second is ignored.
  {
    const t = map.mesh.faceTable;
    const skyIdx = new Set(map.mesh.materials.map((m, i) => (isSkyMaterial(m) ? i : -1)).filter((i) => i >= 0));
    let skyFaces = 0;
    for (let f = 0; f < t.length / 4; f++) if (skyIdx.has(t[f * 4 + 3])) skyFaces++;
    const suns = map.entities.filter((e) => e.classname === "light_environment").map((e) => e.id);
    for (const issue of skyLightIssues(skyFaces, suns)) {
      if (issue.kind === "extra_sun") {
        list.push({ kind: "extra_sun", object: issue.object, message: tr("light_environment ({0}): лишний источник солнца, VRAD использует только первый ({1})", [issue.object, suns[0]]) });
      } else {
        // The sun goes 64 units above a player start, inside the map: a point entity out in the void would leak.
        const start = map.entities.find((e) => START_CLASSES.includes(e.classname) && e.origin);
        list.push({
          kind: "no_sun",
          object: 0,
          message: tr("на карте есть небо (граней: {0}), но нет light_environment: открытые участки останутся тёмными", [skyFaces]),
          detail: start?.origin ? `${start.origin[0]} ${start.origin[1]} ${start.origin[2] + 64}` : undefined,
        });
      }
    }
  }
  // Triggers, buttons and logic with no outputs do nothing in the game.
  const withOutputs = map.entities
    .filter((e) => OUTPUT_ONLY.includes(e.classname))
    .map((e) => ({ id: e.id, classname: e.classname, outputs: (map.doc.entity_details(e.id) as EntityDetails | undefined)?.connections.length ?? 0 }));
  for (const id of silentEntities(withOutputs)) {
    const e = map.entities.find((x) => x.id === id)!;
    list.push({ kind: "no_outputs", object: id, message: tr("{0}{1} ({2}): нет ни одного выхода, срабатывание ни на что не повлияет", [e.classname, e.targetname ? ` «${e.targetname}»` : "", id]) });
  }
  // Player starts stuck in a wall or floor: the hull against solid brushes; lights sunk into a brush.
  const starts = map.entities.filter((e) => START_CLASSES.includes(e.classname) && e.origin).map((e) => ({ id: e.id, origin: e.origin as [number, number, number] }));
  // Baked lights only: a light_dynamic is not compiled into lightmaps and is often parented and moved at run time.
  const lamps = map.entities.filter((e) => /^light(_spot)?$/.test(e.classname) && e.origin).map((e) => ({ id: e.id, origin: e.origin as [number, number, number] }));
  if (starts.length || lamps.length || map.pointEntities.length) {
    const solidOwners = new Set(map.entities.filter((e) => ["func_detail", "func_brush", "func_wall"].includes(e.classname)).map((e) => e.id));
    const boxes: [[number, number, number], [number, number, number]][] = [];
    // The same brushes with their face planes: a box alone counts the air beside a slope or a cylinder as solid.
    const shapes: Shape[] = [];
    map.mesh.solidIds.forEach((sid, idx) => {
      const owner = map.doc.entity_of_solid(sid);
      if (owner && !solidOwners.has(owner)) return;
      const sides = map.doc.solid_sides(sid) as Uint32Array;
      if (sides.length && [...sides].every((side) => NONSOLID_TOOLS.includes(map.doc.face_material(sid, side).toLowerCase()))) return;
      // A displacement's brush is no solid block: only its bent surface collides, so a lamp or a start
      // above a hill would sit "inside" the hill's box. Its box is left out.
      if ([...sides].some((side) => ((map.doc.face_info(sid, side) as { disp_power?: number }).disp_power ?? 0) > 0)) return;
      const b = objectBounds(map, idx);
      if (!b) return;
      boxes.push(b as [[number, number, number], [number, number, number]]);
      const planes = [...sides]
        .map((side) => map.doc.face_plane(sid, side) as Float64Array | number[])
        .filter((p) => p.length === 4)
        .map((p): [[number, number, number], number] => [[p[0], p[1], p[2]], p[3]]);
      shapes.push({ box: b as [[number, number, number], [number, number, number]], planes, id: sid });
    });
    for (const id of stuckStartsShapes(starts, shapes)) {
      const e = map.entities.find((x) => x.id === id)!;
      const o = e.origin as [number, number, number];
      // The lift that stands it on the floor it sank into goes along for the fix; none for a start in a wall.
      const lift = liftOut(o, boxes);
      list.push({
        kind: "stuck_spawn",
        object: id,
        message: tr("{0} ({1}) в {2}: игрок появится внутри браша{3}", [
          e.classname,
          id,
          o.map((v) => Math.round(v)).join(" "),
          lift ? tr("; исправление поднимет точку на {0}", [Math.round(lift)]) : tr("; отодвиньте точку от стены"),
        ]),
        detail: lift ? `${o[0]} ${o[1]} ${o[2] + lift}` : undefined,
      });
    }
    // Point entities out in the void: outside the box of every world brush, VBSP will leak.
    const worldBoxes: [[number, number, number], [number, number, number]][] = [];
    map.mesh.solidIds.forEach((sid, idx) => {
      if (map.doc.entity_of_solid(sid)) return;
      const b = objectBounds(map, idx);
      if (b) worldBoxes.push(b as [[number, number, number], [number, number, number]]);
    });
    const points = map.pointEntities.filter((e) => e.origin).map((e) => ({ id: e.id, origin: e.origin as [number, number, number] }));
    for (const id of outsideWorld(points, unionBox(worldBoxes))) {
      const e = map.entities.find((x) => x.id === id)!;
      list.push({ kind: "entity_outside", object: id, message: tr("{0}{1} ({2}) вне геометрии карты: при сборке возникнет утечка", [e.classname, e.targetname ? ` «${e.targetname}»` : "", id]) });
    }
    // Physics props sunk into a brush: stood on the floor they sank into, else pushed out through the nearest face.
    const props = map.pointEntities.filter((e) => e.origin && isPhysicsProp(e.classname)).map((e) => ({ id: e.id, origin: e.origin as [number, number, number] }));
    for (const id of pointsInsideShapes(props, shapes)) {
      const e = map.entities.find((x) => x.id === id)!;
      const o = e.origin as [number, number, number];
      const lift = liftOut(o, boxes);
      const out = lift ? [o[0], o[1], o[2] + lift] : pushOut(o, boxes, 1);
      list.push({
        kind: "prop_in_solid",
        object: id,
        message: tr("{0} ({1}){2} внутри браша: в игре физика вытолкнет проп или он застрянет", [e.classname, id, e.model ? ` ${e.model.split("/").pop()}` : ""]),
        detail: out ? out.join(" ") : undefined,
      });
    }
    for (const id of pointsInsideShapes(lamps, shapes)) {
      const e = map.entities.find((x) => x.id === id)!;
      const out = pushOut(e.origin as [number, number, number], boxes);
      list.push({
        kind: "light_in_solid",
        object: id,
        message: tr("{0}{1} ({2}) внутри браша {3}: свет не попадёт в помещение", [
          e.classname,
          e.targetname ? ` «${e.targetname}»` : "",
          id,
          shapeAround(e.origin as [number, number, number], shapes)?.id ?? "",
        ]),
        detail: out ? out.join(" ") : undefined,
      });
    }
  }
  // A rotating door without an origin turns about its middle like a turnstile: offer a hinge at its edge.
  for (const e of map.entities) {
    if (e.classname.toLowerCase() !== "func_door_rotating") continue;
    let lo: [number, number, number] | null = null;
    let hi: [number, number, number] | null = null;
    for (const sid of map.doc.entity_solids(e.id) as Uint32Array) {
      const idx = map.mesh.solidIds.indexOf(sid);
      const b = idx >= 0 ? objectBounds(map, idx) : null;
      if (!b) continue;
      lo = lo ? [Math.min(lo[0], b[0][0]), Math.min(lo[1], b[0][1]), Math.min(lo[2], b[0][2])] : [...b[0]];
      hi = hi ? [Math.max(hi[0], b[1][0]), Math.max(hi[1], b[1][1]), Math.max(hi[2], b[1][2])] : [...b[1]];
    }
    // An origin in the middle of the door (Tie to Entity puts one there) is no hinge either.
    const mid = lo && hi ? [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2] : null;
    if (e.origin && (!mid || Math.hypot(e.origin[0] - mid[0], e.origin[1] - mid[1]) > 2)) continue;
    const hinge = lo && hi ? edgeHinge([lo, hi]) : null;
    list.push({
      kind: "door_no_hinge",
      object: e.id,
      message: tr("func_door_rotating{0} ({1}): {2}, дверь будет вращаться вокруг своего центра", [
        e.targetname ? ` «${e.targetname}»` : "",
        e.id,
        e.origin ? tr("ось вращения (origin) в центре двери") : tr("не задана ось вращения (origin)"),
      ]),
      detail: hinge ? hinge.map((v) => Math.round(v)).join(" ") : undefined,
    });
  }
  // Source limits: VBSP only says MAX_MAP_… at the end of a compile; warn from 80 % on.
  for (const l of limitIssues({ brushes: map.stats.solids, sides: map.mesh.faceTable.length / 4, entities: map.entities.length, displacements: map.stats.displacement_faces })) {
    const def = SOURCE_LIMITS[l.key];
    list.push({
      kind: "near_limit",
      object: 0,
      message: tr("{0}: {1} из {2} ({3} %, {4})", [def.label, l.used.toLocaleString(currentLocale()), l.max.toLocaleString(currentLocale()), Math.round(l.fill * 100), def.what]),
    });
  }
  // Many small world brushes: VVIS slows down; one fix ties them all to func_detail.
  {
    const { small } = smallWorldBrushes(map, objectBounds);
    if (small.length >= DETAIL_HINT_MIN) {
      list.push({
        kind: "world_detail",
        object: small[0],
        message: tr("мелких брашей в мире: {0} - в составе func_detail они не будут участвовать в расчёте видимости VVIS", [small.length]),
        detail: small.join(","),
      });
    }
  }
  // No cubemap: reflections come out black until there is one and cubemaps are built.
  {
    const spot = missingCubemap(map);
    if (spot) list.push({ kind: "no_cubemap", object: 0, message: tr("на карте нет env_cubemap: отражения воды, стекла и металла будут чёрными"), detail: spot.join(" ") });
  }
  // Names with spaces, commas or quotes: outputs aimed at them never arrive.
  for (const b of badNames(map.entities.map((e) => e.targetname))) {
    const holders = map.entities.filter((e) => e.targetname === b.old);
    list.push({
      kind: "bad_name",
      object: holders[0].id,
      message: tr("имя «{0}» ({1} энтити) содержит пробел, запятую или кавычку - выходы на него не сработают; исправленное имя: «{2}»", [b.old, holders.length, b.next]),
      detail: JSON.stringify([b.old, b.next]),
    });
  }
  // Stacked twins: identical point entities in one spot, left by a duplicate without a move.
  for (const group of stackedTwins(
    map.entities.filter((e) => !e.brush).map((e) => ({ id: e.id, classname: e.classname, model: e.model, origin: e.origin, angles: e.angles ? e.angles.join(" ") : null, targetname: e.targetname })),
  )) {
    const first = map.entities.find((e) => e.id === group[0])!;
    list.push({
      kind: "stacked_twins",
      object: group[0],
      message: tr("{0}{1}: {2} одинаковых энтити в одной точке - дубликаты мерцают и нарушают физику", [first.classname, first.model ? ` ${first.model.split("/").pop()}` : "", group.length]),
      detail: group.slice(1).join(","),
    });
  }
  // Stacked brushes: the same brush twice in one place; one finding for the map, its fix removes every extra.
  {
    const items: { id: number; owner: number; box: Box3; materials: string[] }[] = [];
    map.mesh.solidIds.forEach((sid, idx) => {
      const box = objectBounds(map, idx);
      if (box) items.push({ id: sid, owner: map.doc.entity_of_solid(sid), box, materials: [...(map.doc.solid_sides(sid) as Uint32Array)].map((side) => map.doc.face_material(sid, side)) });
    });
    const groups = stackedBrushes(items);
    const extras = groups.flatMap((g) => g.slice(1));
    if (extras.length)
      list.push({
        kind: "stacked_brushes",
        object: groups[0][0],
        message: tr("дублирующихся брашей: {0} в {1} местах - мерцание в игре и лишняя нагрузка на сборку", [extras.length, groups.length]),
        detail: extras.join(","),
      });
  }
  // Parent loops: a chain of parentname that comes back to itself cannot be placed by the engine.
  {
    const chain = map.entities.map((e) => {
      const d = map.doc.entity_details(e.id) as EntityDetails | undefined;
      const parent = d?.keyvalues.find(([k]) => k.toLowerCase() === "parentname")?.[1] ?? null;
      return { id: e.id, targetname: e.targetname, parent: parent ? parent.split(",")[0].trim() : null };
    });
    for (const loop of parentLoops(chain)) {
      const names = loop.map((id) => chain.find((c) => c.id === id)?.targetname ?? String(id));
      list.push({
        kind: "parent_loop",
        object: loop[0],
        message: tr("циклическая привязка: {0} - движок не сможет разместить эти энтити", [[...names, names[0]].join(" → ")]),
        detail: String(loop[0]),
      });
    }
  }
  // Rotating brush entities whose origin (their axis) lies outside their brushes: they orbit instead of spinning. No origin means 0 0 0.
  for (const e of map.entities) {
    if (!ROTATING_CLASSES.includes(e.classname.toLowerCase())) continue;
    const solids = new Set<number>(map.doc.entity_solids(e.id) as Uint32Array);
    const boxes: Box3[] = [];
    map.mesh.solidIds.forEach((sid, idx) => {
      const b = solids.has(sid) ? objectBounds(map, idx) : null;
      if (b) boxes.push(b);
    });
    if (!boxes.length) continue;
    const lo = [0, 1, 2].map((k) => Math.min(...boxes.map((b) => b[0][k]))) as [number, number, number];
    const hi = [0, 1, 2].map((k) => Math.max(...boxes.map((b) => b[1][k]))) as [number, number, number];
    const at = (e.origin ?? [0, 0, 0]) as [number, number, number];
    if (!outsideBox(at, [lo, hi])) continue;
    list.push({
      kind: "pivot_outside",
      object: e.id,
      message: tr("{0}{1} ({2}): ось вращения (origin {3}) вне брашей - объект будет двигаться по окружности, а не вращаться на месте", [
        e.classname,
        e.targetname ? ` «${e.targetname}»` : "",
        e.id,
        at.map((v) => Math.round(v)).join(" "),
      ]),
      detail: originAtCentre(boxes) ?? undefined,
    });
  }
  // Overlays whose listed faces are gone or no longer under them: the decal vanishes in the compile.
  for (const o of overlaySideReport(map, objectBounds)) {
    if (!o.stale) continue;
    list.push({
      kind: "overlay_sides",
      object: o.id,
      message: tr("info_overlay ({0}): в sides {1}, а под оверлеем {2} - после сборки оверлей пропадёт", [
        o.id,
        o.listed.length ? tr("грани {0}", [o.listed.join(" ")]) : tr("грани не заданы"),
        o.under.join(" "),
      ]),
      detail: o.under.join(" "),
    });
  }
  // Displacements inside brush entities: the compile stops on them; a func_detail can simply go back to the world.
  for (const d of displacementsInEntities(map)) {
    const detail = d.classname.toLowerCase() === "func_detail";
    list.push({
      kind: "disp_in_entity",
      object: d.entity,
      message: tr("дисплейсменты внутри {0} (брашей: {1}) - VBSP остановится с ошибкой", [d.classname || tr("брашевой энтити"), d.solids.length]),
      detail: detail ? d.solids.join(",") : undefined,
    });
  }
  // Boxes nudged off whole units: hairline gaps in game, one move puts them back.
  {
    const off = offGridBoxes(map, objectBounds);
    const merge = mergePlan(map, objectBounds, null);
    const saved = merge.reduce((n, g) => n + g.ids.length - 1, 0);
    if (saved >= MERGE_HINT_MIN)
      list.push({
        kind: "mergeable",
        object: merge[0].ids[0],
        message: tr("брашей можно объединить: {0} в {1}, на {2} меньше", [saved + merge.length, merge.length, saved]),
        detail: merge.flatMap((g) => g.ids).join(","),
      });
    if (off.length)
      list.push({
        kind: "off_grid",
        object: off[0].id,
        message: tr("брашей не на целых координатах: {0} - возможны щели и утечки; сдвиг на долю юнита выровняет их по сетке", [off.length]),
        detail: off.map((o) => o.id).join(","),
      });
  }
  return list;
}
