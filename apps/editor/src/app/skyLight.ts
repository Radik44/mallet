// The sun of an outdoor map: faces with the skybox tool texture need one
// light_environment, or the open air stays dark; a second one is ignored by
// VRAD. Hammer warns about neither.

export interface SkyIssue {
  kind: "no_sun" | "extra_sun";
  /** The extra light_environment, or 0 for a missing sun. */
  object: number;
}

/** Sun problems from the count of sky faces and the light_environment ids in map order (the first one is the one VRAD uses). */
export function skyLightIssues(skyFaces: number, suns: number[]): SkyIssue[] {
  if (suns.length > 1) return suns.slice(1).map((id) => ({ kind: "extra_sun", object: id }));
  if (skyFaces > 0 && !suns.length) return [{ kind: "no_sun", object: 0 }];
  return [];
}

/** Whether a material is the sky: tools/toolsskybox and tools/toolsskybox2d. */
export const isSkyMaterial = (m: string) => /^tools\/toolsskybox(2d)?$/i.test(m);
