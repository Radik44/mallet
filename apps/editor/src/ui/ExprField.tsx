// A number field that takes arithmetic, as in Blender and Unity: "128*3",
// "(64+32)/2", and "+64", "*2", "/2" from the value it holds. The value is
// written on Enter or when the field loses focus; Esc and junk put the old
// one back; ↑ and ↓ step it (Shift ten steps).

import { useEffect, useState } from "react";
import { evalNumber } from "../app/numberExpr";
import { t } from "../i18n";

const HINT = () => t("Число или выражение: 128*3, (64+32)/2. Запись +64, *2, /2 применяется к текущему значению. ↑↓ - на шаг, с Shift - на 10 шагов");

export function ExprField({ value, step, title, className, onCommit }: { value: number; step?: number; title?: string; className?: string; onCommit(v: number): void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <input
      type="text"
      className={className ? `expr-field ${className}` : "expr-field"}
      inputMode="decimal"
      spellCheck={false}
      title={title ? `${title}\n${HINT()}` : HINT()}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = evalNumber(draft, value);
        if (n !== null && n !== value) onCommit(n);
        // Show what was taken: a clamped value (200 sides → 128) leaves `value` as it was, so the effect would not reset the text.
        setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setDraft(String(value));
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const base = evalNumber(draft, value) ?? value;
          const next = Math.round((base + (step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1)) * 1e6) / 1e6;
          onCommit(next);
          setDraft(String(value));
        }
      }}
    />
  );
}
