// Source engine map limits (BSP v20, as in Garry's Mod): VBSP stops with
// "MAX_MAP_BRUSHES" and friends only at the end of a long compile. These
// warn while there is still room to change the map.

import { t, lazy } from "../i18n";

export const SOURCE_LIMITS = lazy(
  () =>
    ({
      brushes: { max: 8192, label: t("браши"), what: "MAX_MAP_BRUSHES" },
      sides: { max: 65536, label: t("грани брашей"), what: "MAX_MAP_BRUSHSIDES" },
      entities: { max: 8192, label: t("энтити"), what: "MAX_MAP_ENTITIES" },
      displacements: { max: 2048, label: t("дисплейсменты"), what: "MAX_MAP_DISPINFO" },
    }) as const,
);

export type LimitKey = keyof typeof SOURCE_LIMITS;

/** The limits the map uses at least `share` of (0.8 by default), fullest first, with how full they are. */
export function limitIssues(counts: Record<LimitKey, number>, share = 0.8): { key: LimitKey; used: number; max: number; fill: number }[] {
  return (Object.keys(SOURCE_LIMITS) as LimitKey[])
    .map((key) => ({ key, used: counts[key], max: SOURCE_LIMITS[key].max, fill: counts[key] / SOURCE_LIMITS[key].max }))
    .filter((x) => x.fill >= share)
    .sort((a, b) => b.fill - a.fill);
}
