// Hammer-style main toolbar: a row of icon buttons for the commands a
// mapper reaches for all day. Built from the command list, so titles,
// keys and availability match the menus.

import type { Command } from "./CommandPalette";
import { Icon, type IconName } from "./Icon";

export type ToolbarItem = { id: string; icon: IconName; active?: boolean; tone?: "play" | "debug" | "build" } | "sep";

interface Props {
  items: ToolbarItem[];
  /** Buttons pinned to the right end: build and run. */
  right?: ToolbarItem[];
  byId: Map<string, Command>;
}

export function Toolbar({ items, right = [], byId }: Props) {
  // Runs of buttons between separators become rounded groups.
  const groups: Exclude<ToolbarItem, "sep">[][] = [[]];
  for (const it of items) {
    if (it === "sep") groups.push([]);
    else groups[groups.length - 1].push(it);
  }
  const button = (it: Exclude<ToolbarItem, "sep">) => {
    const c = byId.get(it.id);
    if (!c) return null;
    return (
      <button key={it.id} data-cmd={it.id} className={`icon-btn tb-btn${it.active ? " active" : ""}${it.tone ? ` tb-${it.tone}` : ""}`} disabled={c.disabled} onClick={() => c.run()} title={`${c.title}${c.hotkey ? ` (${c.hotkey})` : ""}`}>
        <Icon name={it.icon} size={16} />
      </button>
    );
  };
  return (
    <div className="toolbar">
      {groups
        .filter((g) => g.length)
        .map((g, gi) => (
          <div key={gi} className="tb-group">
            {g.map(button)}
          </div>
        ))}
      <span className="grow" />
      <div className="tb-group tb-right">{right.filter((it): it is Exclude<ToolbarItem, "sep"> => it !== "sep").map(button)}</div>
    </div>
  );
}
