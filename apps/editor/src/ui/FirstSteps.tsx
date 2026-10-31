// "First steps": a small card over the views that ticks itself off as a
// newcomer draws a brush, applies a texture, places an entity and
// compiles. Only the next step shows its hint, so the card stays short.
// Hidden for good once dismissed; the Help menu brings it back.

import { useState } from "react";
import { Icon } from "./Icon";
import { t, lazy } from "../i18n";

const COLLAPSED_KEY = "gme.firstStepsCollapsed";

export interface FirstStepsState {
  brush: boolean;
  texture: boolean;
  entity: boolean;
  compile: boolean;
}

interface Props {
  state: FirstStepsState;
  onClose(): void;
  /** Starts the interactive tour: a spotlight on each button in turn. */
  onTour?(): void;
}

const STEPS: { key: keyof FirstStepsState; text: string; hint: string }[] = lazy(() => [
  { key: "brush", text: t("Нарисуйте браш"), hint: t("Инструмент «Блок»: протяните рамку в 2D-виде и нажмите Enter") },
  { key: "texture", text: t("Примените текстуру"), hint: t("Во вкладке «Текстуры» выберите материал и нажмите «На выделение»") },
  { key: "entity", text: t("Поставьте энтити"), hint: t("Инструмент «Энтити»: выберите класс в строке сверху и щёлкните по полу в 3D-виде") },
  { key: "compile", text: t("Соберите карту"), hint: t("F9 собирает карту и копирует её в игру, затем нажмите «Играть»") },
]);

export function FirstSteps({ state, onClose, onTour }: Props) {
  const done = STEPS.filter((s) => state[s.key]).length;
  const next = STEPS.find((s) => !state[s.key]);
  // Folded to its title row when it is in the way; the choice is kept.
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed(!collapsed);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? "0" : "1");
    } catch {
      /* private mode */
    }
  };
  return (
    <div className={`first-steps${collapsed ? " collapsed" : ""}`}>
      <div className="first-steps-head">
        <button className="icon-btn first-steps-fold" onClick={toggle} title={collapsed ? t("Развернуть карточку") : t("Свернуть карточку до заголовка")}>
          <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={12} />
        </button>
        <strong className="clickable" onClick={toggle}>
          {done === STEPS.length ? t("Первая карта готова") : t("Первые шаги")}
        </strong>
        <span className="muted grow">
          {done} {t("из")} {STEPS.length}
        </span>
        <button className="icon-btn" onClick={onClose} title={t("Скрыть. Вернуть можно через меню «Справка»")}>
          ✕
        </button>
      </div>
      {collapsed ? null : (
        <div className="first-steps-bar">
          <span style={{ width: `${(done / STEPS.length) * 100}%` }} />
        </div>
      )}
      {collapsed
        ? null
        : STEPS.map((s) => {
            const isNext = next?.key === s.key;
            return (
              <div key={s.key} className={`first-step${state[s.key] ? " done" : ""}${isNext ? " next" : ""}`} title={s.hint}>
                <span className="first-step-mark">{state[s.key] ? "✓" : STEPS.indexOf(s) + 1}</span>
                <span className="first-step-body">
                  {s.text}
                  {isNext && <span className="muted first-step-hint">{s.hint}</span>}
                </span>
              </div>
            );
          })}
      {!collapsed && onTour && next && (
        <button className="first-steps-tour link" onClick={onTour} title={t("Интерактивный тур: нужная кнопка подсвечивается, пока вы её не нажмёте")}>
          {t("Запустить тур")}
        </button>
      )}
    </div>
  );
}
