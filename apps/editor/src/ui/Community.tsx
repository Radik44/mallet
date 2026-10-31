// Where the project lives online: the pages that exist open in the browser, the
// ones still to come are shown greyed with a «скоро» mark so people know they
// are planned. The menu bar shows the compact row (icons only), the start
// window the full one (icon, name, mark).

import { useEffect, useRef, useState } from "react";
import { api } from "../tauri";
import { BOOSTY_URL, GITHUB_URL, PATREON_URL } from "../app/links";
import { Icon } from "./Icon";
import { t as tr } from "../i18n";
import { BrandIcon, type BrandName } from "./BrandIcon";

interface Place {
  id: BrandName;
  name: string;
  /** Missing until the page exists; then the row turns into a link. */
  url?: string;
  /** A way to support the project: in the heart's menu, and among the chips, but not in the compact row. */
  support?: boolean;
}

export const COMMUNITY: Place[] = [
  { id: "github", name: "GitHub", url: GITHUB_URL },
  { id: "patreon", name: "Patreon", url: PATREON_URL, support: true },
  { id: "boosty", name: "Boosty", url: BOOSTY_URL || undefined, support: true },
  { id: "discord", name: "Discord" },
  { id: "steam", name: "Steam" },
  { id: "youtube", name: "YouTube" },
  { id: "telegram", name: "Telegram" },
  { id: "vk", name: "VK" },
  { id: "x", name: "X" },
  { id: "reddit", name: "Reddit" },
];

/** Ways to support the project; a missing url means «скоро». */
const SUPPORT = COMMUNITY.filter((p) => p.support);

/** The heart in the menu bar: a small menu in the menu bar's own style with the support pages. */
export function SupportMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);
  return (
    <div className={`menu menu-right support-menu${open ? " open" : ""}`} ref={box}>
      <button className={`icon-btn menubar-heart${open ? " open" : ""}`} onMouseDown={() => setOpen(!open)} title={tr("Поддержать Mallet")} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="heart" size={13} />
      </button>
      {open && (
        <div className="menu-list" role="menu">
          <div className="menu-head muted small">{tr("Поддержать Mallet")}</div>
          {SUPPORT.map((p) =>
            p.url ? (
              <button
                key={p.id}
                className="menu-item support-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  void api.openUrl(p.url!).catch(() => undefined);
                }}
                title={tr("Открыть {0}", [p.name])}
              >
                <BrandIcon name={p.id} size={14} />
                <span className="grow">{p.name}</span>
                <span className="muted menu-key">{p.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
              </button>
            ) : (
              <button key={p.id} className="menu-item support-item" role="menuitem" disabled title={tr("{0}: скоро", [p.name])}>
                <BrandIcon name={p.id} size={14} />
                <span className="grow">{p.name}</span>
                <em className="community-soon">{tr("скоро")}</em>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function CommunityLinks({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`community${compact ? " compact" : ""}`}>
      {compact ? null : <span className="muted small community-label">{tr("Сообщество")}</span>}
      {COMMUNITY.filter((p) => !compact || !p.support).map((p) =>
        p.url ? (
          <button key={p.id} className={`icon-btn community-link${compact ? "" : " chip"}`} onClick={() => void api.openUrl(p.url!).catch(() => undefined)} title={tr("Открыть {0}", [p.name])}>
            <BrandIcon name={p.id} size={compact ? 13 : 14} />
            {compact ? null : <span>{p.name}</span>}
          </button>
        ) : (
          <span key={p.id} className={`community-link soon${compact ? "" : " chip"}`} title={tr("{0}: скоро", [p.name])} aria-disabled>
            <BrandIcon name={p.id} size={compact ? 13 : 14} />
            {compact ? <i className="community-soon-dot">{tr("скоро")}</i> : <span>{p.name}</span>}
            {compact ? null : <em>{tr("скоро")}</em>}
          </span>
        ),
      )}
    </div>
  );
}
