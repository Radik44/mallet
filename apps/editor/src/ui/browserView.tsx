// How a browser panel shows its items: icons (tiles), a list or a table,
// the way a file manager does. Remembered per panel.

import { useState } from "react";
import { Icon, type IconName } from "./Icon";
import { t, lazy } from "../i18n";

export type BrowserView = "icons" | "list" | "table";

const TITLES: Record<BrowserView, string> = lazy(() => ({ icons: t("Значки: плитки с картинками"), list: t("Список: по строке на элемент"), table: t("Таблица: имя и папка колонками") }));
const ICONS: Record<BrowserView, IconName> = { icons: "grid", list: "list", table: "table" };

export function useBrowserView(key: string, fallback: BrowserView, allowed: BrowserView[]): [BrowserView, (v: BrowserView) => void] {
  const [view, setView] = useState<BrowserView>(() => {
    try {
      const v = localStorage.getItem(key) as BrowserView | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  });
  return [
    view,
    (v) => {
      setView(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* storage unavailable */
      }
    },
  ];
}

export function ViewSwitch({ value, options, onChange }: { value: BrowserView; options: BrowserView[]; onChange(v: BrowserView): void }) {
  return (
    <span className="view-switch">
      {options.map((v) => (
        <button key={v} className={`icon-btn${value === v ? " active" : ""}`} onClick={() => onChange(v)} title={TITLES[v]}>
          <Icon name={ICONS[v]} size={13} />
        </button>
      ))}
    </span>
  );
}

/** "props_c17/chair02a.mdl" → ["props_c17", "chair02a.mdl"]. */
export function splitPath(name: string): [string, string] {
  const i = name.lastIndexOf("/");
  return i < 0 ? ["", name] : [name.slice(0, i), name.slice(i + 1)];
}
