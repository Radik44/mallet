// The prop brush: the entity tool with "кисть" on scatters models over the
// surface under the mouse while the button is held. Models come from a set
// (one or many), each gets a random yaw, and no two land closer than the
// spacing. Hammer has nothing of the kind: fences, rocks and barrels went in
// one copy at a time.

export interface ScatterSettings {
  on: boolean;
  /** Minimum distance between placed props, in units. */
  spacing: number;
  randomYaw: boolean;
  /** Model paths the brush draws from; empty means the current model. */
  models: string[];
}

export const DEFAULT_SCATTER: ScatterSettings = { on: false, spacing: 64, randomYaw: true, models: [] };

export interface ScatterPick {
  model: string;
  yaw: number;
}

/** A model and a yaw for the point, or null when the point is too close to one already placed. */
export function pickScatter(s: ScatterSettings, point: [number, number, number], placed: [number, number, number][], fallbackModel: string, rand: () => number = Math.random): ScatterPick | null {
  const spacing = Math.max(1, s.spacing);
  for (const p of placed) {
    if (Math.hypot(p[0] - point[0], p[1] - point[1], p[2] - point[2]) < spacing) return null;
  }
  const models = s.models.length ? s.models : [fallbackModel];
  const model = models[Math.min(models.length - 1, Math.floor(rand() * models.length))];
  if (!model) return null;
  const yaw = s.randomYaw ? Math.round((rand() * 360) / 5) * 5 : 0;
  return { model, yaw };
}

/** The set with `model` added once, keeping at most eight. */
export function addScatterModel(s: ScatterSettings, model: string): ScatterSettings {
  if (!model || s.models.includes(model)) return s;
  return { ...s, models: [...s.models, model].slice(-8) };
}
