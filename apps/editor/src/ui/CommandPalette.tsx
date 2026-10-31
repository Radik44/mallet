// Command palette (Ctrl+P): every action of the editor by name, filtered
// as you type, with its hotkey, for people who do not know Hammer's keys.

import { useEffect, useMemo, useRef, useState } from "react";
import { menuLabel } from "./MenuBar";
import { loadRecent, pushRecent, recentFirst, storeRecent } from "../app/recent";
import { t } from "../i18n";

const RECENT_KEY = "gme.recentCommands";

export interface Command {
  /** Shown in the menu bar as it is; without it the title is cut at «: » there. */
  menuTitle?: string;
  id: string;
  title: string;
  /** Extra words to match: English names, synonyms. */
  keywords?: string;
  hotkey?: string;
  group: string;
  run(): void;
  disabled?: boolean;
}

interface Props {
  commands: Command[];
  /** Commands made from what was typed: an object id, coordinates… */
  extra?(query: string): Command[];
  onClose(): void;
}

export function CommandPalette({ commands, extra, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const [recent] = useState(() => loadRecent(RECENT_KEY));

  const matches = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const dynamic = extra ? extra(query) : [];
    const found = commands.filter((c) => {
      const hay = `${c.title} ${c.keywords ?? ""} ${c.group} ${c.hotkey ?? ""}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    // What was run lately comes first, as in Blender's F3 search.
    return dynamic.concat(recentFirst(found, recent));
  }, [commands, extra, query, recent]);
  const at = Math.min(cursor, Math.max(0, matches.length - 1));

  const run = (c: Command | undefined) => {
    if (!c || c.disabled) return;
    storeRecent(RECENT_KEY, pushRecent(recent, c.id));
    onClose();
    c.run();
  };

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div className="palette" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={input}
          value={query}
          placeholder={t("Команда, id объекта или координаты x y z…")}
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, matches.length - 1));
            else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
            else if (e.key === "Enter") run(matches[at]);
            else return;
            e.preventDefault();
          }}
        />
        <div className="palette-list">
          {matches.slice(0, 40).map((c, i) => (
            <div key={c.id} className={`palette-row${i === at ? " current" : ""}${c.disabled ? " disabled" : ""}`} onMouseEnter={() => setCursor(i)} onClick={() => run(c)}>
              <span className="muted palette-group">{recent.includes(c.id) ? t("Недавние") : c.group}</span>
              <span className="palette-title">
                {menuLabel(c.title)}
                {menuLabel(c.title) !== c.title ? <span className="muted palette-more"> {c.title.slice(menuLabel(c.title).length).replace(/^[:\s]+/, "")}</span> : null}
              </span>
              {c.hotkey && <span className="muted palette-key">{c.hotkey}</span>}
            </div>
          ))}
          {!matches.length && <div className="muted pad">{t("Ничего не найдено")}</div>}
        </div>
      </div>
    </div>
  );
}
