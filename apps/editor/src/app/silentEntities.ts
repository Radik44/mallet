// Entities that only act through outputs: a trigger, button or logic entity
// with no output does nothing in the game, and Hammer does not say so.

/** Classes whose whole job is to fire outputs. */
export const OUTPUT_ONLY = ["trigger_once", "trigger_multiple", "func_button", "func_rot_button", "momentary_rot_button", "logic_auto", "logic_relay", "logic_timer", "logic_compare", "logic_branch", "logic_case", "math_counter", "logic_multicompare", "func_physbox_multiplayer"];

/** Ids of output-only entities without a single output, even when something else fires at them: they pass nothing on. */
export function silentEntities(list: { id: number; classname: string; outputs: number }[]): number[] {
  return list.filter((e) => OUTPUT_ONLY.includes(e.classname) && e.outputs === 0).map((e) => e.id);
}
