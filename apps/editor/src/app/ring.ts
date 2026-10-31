// A ring of copies, as Blender's array around an empty: the selection and
// its copies stand evenly around a centre `radius` units along −X from it,
// each turned with the ring, so columns round a square or lamps round a
// fountain come out in one go. Hammer's Paste Special only makes rows.

type Vec3 = [number, number, number];

/** The ring's centre and the turn of each copy about it (degrees about Z), for `count` copies besides the original. */
export function ringPlan(centre: Vec3, radius: number, count: number): { pivot: Vec3; angles: number[] } {
  const step = 360 / (count + 1);
  return {
    pivot: [centre[0] - radius, centre[1], centre[2]],
    angles: Array.from({ length: count }, (_, i) => Math.round(step * (i + 1) * 1000) / 1000),
  };
}
