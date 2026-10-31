// Parametric geometry that stays editable: a cylinder, sphere, arch or
// stairs made by the block tool is grouped and remembered with its
// parameters in the project's sidecar, so the inspector can offer the
// sides, wall, arc or step height again and rebuild the brushes in place
// (Blender's modifiers, Unity's procedural components), instead of
// deleting and drawing anew as Hammer makes you do.

export type GeneratorKind = "cylinder" | "sphere" | "arch" | "stairs";

export interface GeneratorRecord {
  /** The VMF group holding the generated brushes; a rebuild makes a new group and updates this. */
  group: number;
  kind: GeneratorKind;
  /** Extrusion axis of the primitive (0 X, 1 Y, 2 Z); stairs rise along Z. */
  axis: number;
  sides: number;
  wall: number;
  arc: number;
  /** Stairs: the height of one step in units. */
  step: number;
  reverse: boolean;
  material: string;
  /** The box the shape was built in (an arch or sphere does not fill its box, so vertices alone cannot restore it). */
  bounds: [[number, number, number], [number, number, number]];
  /** The brushes' own bounds right after building, to tell a later move or scale of the group. */
  extent: [[number, number, number], [number, number, number]];
}

/** The build box for a rebuild: `bounds` carried along with the group's move and scale since it was built. */
export function rebuildBounds(rec: GeneratorRecord, cur: [[number, number, number], [number, number, number]]): [[number, number, number], [number, number, number]] {
  const lo: [number, number, number] = [0, 0, 0];
  const hi: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const size = rec.extent[1][a] - rec.extent[0][a];
    const ratio = size > 1e-6 ? (cur[1][a] - cur[0][a]) / size : 1;
    lo[a] = Math.round((cur[0][a] + (rec.bounds[0][a] - rec.extent[0][a]) * ratio) * 16) / 16;
    hi[a] = Math.round((cur[0][a] + (rec.bounds[1][a] - rec.extent[0][a]) * ratio) * 16) / 16;
  }
  return [lo, hi];
}

export const GENERATOR_LIMITS: Record<"sides" | "wall" | "arc" | "step", [number, number]> = {
  sides: [3, 64],
  wall: [1, 2048],
  arc: [1, 360],
  step: [1, 512],
};

/** Shapes the block tool can rebuild later; a block or a wedge is a single brush and needs no record. */
export function isGeneratorKind(shape: string): shape is GeneratorKind {
  return shape === "cylinder" || shape === "sphere" || shape === "arch" || shape === "stairs";
}

/** The record for a group id, if the group is generated. */
export function findGenerator(records: GeneratorRecord[] | undefined, group: number): GeneratorRecord | undefined {
  if (!group) return undefined;
  return records?.find((r) => r.group === group);
}

/** A record with `patch` applied and every number kept inside its limits. */
export function withPatch(rec: GeneratorRecord, patch: Partial<GeneratorRecord>): GeneratorRecord {
  const next = { ...rec, ...patch };
  const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)));
  next.sides = clamp(next.sides, GENERATOR_LIMITS.sides);
  next.wall = clamp(next.wall, GENERATOR_LIMITS.wall);
  next.arc = clamp(next.arc, GENERATOR_LIMITS.arc);
  next.step = clamp(next.step, GENERATOR_LIMITS.step);
  return next;
}

/** Records without `group`, plus `replacement` when given (a rebuild moves the record to the new group). */
export function replaceRecord(records: GeneratorRecord[], group: number, replacement: GeneratorRecord | null): GeneratorRecord[] {
  const rest = records.filter((r) => r.group !== group);
  return replacement ? [...rest, replacement] : rest;
}

/** Which parameters the kind uses, for the inspector card. */
export function generatorFields(kind: GeneratorKind): ("sides" | "wall" | "arc" | "step" | "reverse")[] {
  switch (kind) {
    case "cylinder":
    case "sphere":
      return ["sides"];
    case "arch":
      return ["sides", "wall", "arc"];
    case "stairs":
      return ["step", "reverse"];
  }
}
