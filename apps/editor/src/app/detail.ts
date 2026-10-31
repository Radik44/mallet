// Brushes that should be func_detail: small world brushes (trim, steps,
// pillars, furniture) cut the world into many visleafs and make VVIS slow,
// the classic Hammer beginner trap. This finds them so they can be tied to
// func_detail in one go.

type Vec3 = [number, number, number];

/** From this many small world brushes on, «Проблемы» suggest turning them into func_detail. */
export const DETAIL_HINT_MIN = 8;

/** Ids of world brushes no larger than `maxSize` on any axis; tool brushes (clip, trigger, skybox…) stay out. */
export function detailCandidates(brushes: { id: number; box: [Vec3, Vec3]; tools: boolean }[], maxSize = 128): number[] {
  return brushes.filter((b) => !b.tools && [0, 1, 2].every((k) => b.box[1][k] - b.box[0][k] <= maxSize)).map((b) => b.id);
}
