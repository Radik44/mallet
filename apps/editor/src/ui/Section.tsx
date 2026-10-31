// Collapsible section of a panel: a header line that opens and closes the
// content below, so a panel shows only what is needed at the moment.

import { t } from "../i18n";

interface Props {
  title: string;
  hint?: string;
  open: boolean;
  onToggle(): void;
  /** Takes the rest of the panel and lets a list inside scroll. */
  fill?: boolean;
  children: React.ReactNode;
}

export function Section({ title, hint, open, onToggle, fill, children }: Props) {
  return (
    <div className={`section${fill && open ? " fill" : ""}`}>
      <button className="section-head" onClick={onToggle} title={open ? t("Свернуть") : t("Развернуть")}>
        <span className="chev">{open ? "▾" : "▸"}</span>
        <span>{title}</span>
        {hint && <span className="muted grow section-hint">{hint}</span>}
      </button>
      {open && children}
    </div>
  );
}
