// Settings: the panel layout, theme, scale and which keys run which commands.
// Click a hotkey, press the new combo (Backspace clears, Esc cancels);
// conflicts are shown in red, "Сбросить" returns the default.

import { useEffect, useState } from "react";
import type { Command } from "./CommandPalette";
import { Select } from "./Select";
import { Icon } from "./Icon";
import { Card, Field, PanelFrame, Row, Segmented } from "./kit";
import { comboFromEvent, effectiveHotkey, KEYMAP_PRESETS, type Keymap } from "./hotkeys";
import { readFlyHold, FAR_CHOICES, FOV_CHOICES, readViewSettings } from "../viewport/camera";
import { t as tr, LANGUAGES, setLocale, useLocale } from "../i18n";

export type Theme = "dark" | "light" | "system";
export const UI_SCALES = [90, 100, 110, 125, 150];
type Tab = "view" | "layout" | "keys";

interface Props {
  commands: Command[];
  keymap: Keymap;
  onChangeKeymap(map: Keymap): void;
  /** Tool reminders over the views. */
  hints: boolean;
  onChangeHints(v: boolean): void;
  /** The inspector opens by itself when something is selected. */
  autoInspector: boolean;
  onChangeAutoInspector(v: boolean): void;
  /** Moves go in grid steps (Hammer's default) or smoothly. */
  snap: boolean;
  onChangeSnap(v: boolean): void;
  gridSize: number;
  gridSizes: number[];
  onChangeGrid(size: number): void;
  theme: Theme;
  onChangeTheme(t: Theme): void;
  /** Interface scale in percent (100 = default). */
  uiScale: number;
  onChangeScale(s: number): void;
  /** Ready-made layouts and the ones the user saved under a name. */
  presets: { id: string; title: string; hint: string }[];
  onApplyPreset(id: string): void;
  savedLayouts: string[];
  onSaveLayout(name: string): void;
  onApplySaved(name: string): void;
  onDeleteSaved(name: string): void;
}

export function SettingsPanel({
  commands,
  keymap,
  onChangeKeymap,
  presets,
  onApplyPreset,
  savedLayouts,
  onSaveLayout,
  onApplySaved,
  onDeleteSaved,
  hints,
  onChangeHints,
  autoInspector,
  onChangeAutoInspector,
  snap,
  onChangeSnap,
  gridSize,
  gridSizes,
  onChangeGrid,
  theme,
  onChangeTheme,
  uiScale,
  onChangeScale,
}: Props) {
  const locale = useLocale();
  const [flyHold, setFlyHold] = useState(readFlyHold);
  const [view3d, setView3d] = useState(readViewSettings);
  const storeView = (key: "gme.farClip" | "gme.fov", value: number) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      /* storage unavailable */
    }
    setView3d(readViewSettings());
    window.dispatchEvent(new Event("gme-view"));
  };
  const [recording, setRecording] = useState<string | null>(null);
  const [layoutName, setLayoutName] = useState("");
  const [tab, setTab] = useState<Tab>("view");
  const saveLayout = () => {
    const name = layoutName.trim();
    if (!name) return;
    onSaveLayout(name);
    setLayoutName("");
  };

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === "Escape") {
        setRecording(null);
        return;
      }
      if (e.code === "Backspace" || e.code === "Delete") {
        onChangeKeymap({ ...keymap, [recording]: "" });
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return;
      onChangeKeymap({ ...keymap, [recording]: combo });
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, keymap, onChangeKeymap]);

  const bound = new Map<string, number>();
  for (const c of commands) {
    const k = effectiveHotkey(keymap, c.id, c.hotkey);
    if (k) bound.set(k, (bound.get(k) ?? 0) + 1);
  }
  const groups: string[] = [];
  for (const c of commands) if (!groups.includes(c.group)) groups.push(c.group);
  const overridden = Object.keys(keymap).length;

  const view = (
    <>
      <Card title={tr("Язык")} icon="world" hint={locale === "en" ? undefined : "Language"}>
        <Field label={tr("Язык интерфейса")} hint={tr("Применяется сразу; названия классов и ключей из FGD остаются английскими")}>
          <Select value={locale} options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))} onChange={(v) => void setLocale(v)} title={tr("Язык интерфейса")} />
        </Field>
      </Card>
      <Card title={tr("Вид")} icon="eye">
        <Field label={tr("Тема")}>
          <Segmented<Theme>
            small
            value={theme}
            options={[
              { value: "dark", label: tr("Тёмная") },
              { value: "light", label: tr("Светлая") },
              { value: "system", label: tr("Как в системе") },
            ]}
            onChange={onChangeTheme}
          />
        </Field>
        <Field label={tr("Масштаб")} hint={tr("Размер интерфейса для экранов с высокой плотностью")}>
          <Select value={String(uiScale)} options={UI_SCALES.map((v) => ({ value: String(v), label: `${v}%` }))} onChange={(v) => onChangeScale(Number(v))} />
        </Field>
        <Field label={tr("Подсказки")}>
          <label className="chk" title={tr("Строка над видами с подсказкой по текущему инструменту")}>
            <input type="checkbox" checked={hints} onChange={(e) => onChangeHints(e.target.checked)} /> {tr("Над видами")}
          </label>
          <label className="chk" title={tr("При выделении объекта справа открывается инспектор с его размерами и свойствами")}>
            <input type="checkbox" checked={autoInspector} onChange={(e) => onChangeAutoInspector(e.target.checked)} /> {tr("Инспектор при выделении")}
          </label>
        </Field>
        <Field label={tr("Полёт")} hint={tr("Как полёт с правой кнопкой в Unity и Unreal: без зажатого колеса клавиши W, A, S, D не двигают камеру, и сочетания с ними её не смещают")}>
          <label className="chk">
            <input
              type="checkbox"
              checked={flyHold}
              onChange={(e) => {
                setFlyHold(e.target.checked);
                try {
                  localStorage.setItem("gme.flyHold", e.target.checked ? "1" : "0");
                } catch {
                  /* storage unavailable */
                }
                window.dispatchEvent(new Event("gme-fly-hold"));
              }}
            />{" "}
            {tr("WASD только при зажатом колесе")}
          </label>
        </Field>
        <Field
          label={tr("Дальность 3D")}
          hint={tr("Как дальность отсечения в Hammer: дальше этого расстояния 3D-вид ничего не отображает. Меньшее значение ускоряет работу на больших картах и убирает дальний план")}
        >
          <Select
            value={String(view3d.far)}
            options={FAR_CHOICES.map((f) => ({ value: String(f), label: f === 65536 ? tr("Вся карта") : tr("{0} юн.", [f]) }))}
            onChange={(v) => storeView("gme.farClip", Number(v))}
          />
        </Field>
        <Field label={tr("Угол обзора")} hint={tr("Вертикальное поле зрения 3D-камеры, как FOV в Unity и Unreal: больше - шире обзор, меньше - эффект телеобъектива")}>
          <Select value={String(view3d.fov)} options={FOV_CHOICES.map((f) => ({ value: String(f), label: `${f}°` }))} onChange={(v) => storeView("gme.fov", Number(v))} />
        </Field>
      </Card>
      <Card title={tr("Сетка")} icon="grid">
        <Field label={tr("Шаг")} hint={tr("Размер сетки в юнитах: шаг привязки и размер клетки 2D-видов (меняется клавишами [ и ])")}>
          <Select value={String(gridSize)} options={gridSizes.map((g) => ({ value: String(g), label: `${g}` }))} onChange={(v) => onChangeGrid(Number(v))} />
        </Field>
        <Field
          label={tr("Перенос")}
          hint={tr(
            "Включено: перемещение, гизмо и клонирование идут с шагом сетки, Alt во время перемещения отключает привязку. Выключено: объекты плавно следуют за курсором, Alt включает шаг. Shift прижимает к соседнему объекту, V ведёт вершину к вершине другого объекта, Ctrl клонирует (переключение - Shift+W)",
          )}
        >
          <label className="chk">
            <input type="checkbox" checked={snap} onChange={(e) => onChangeSnap(e.target.checked)} /> {tr("Привязка к сетке")}
          </label>
        </Field>
      </Card>
    </>
  );
  const layoutTab = (
    <>
      <Card title={tr("Готовые раскладки")} icon="window" hint={tr("расстановка панелей")}>
        <Select
          value=""
          placeholder={tr("Выбрать…")}
          options={presets.map((p) => ({ value: p.id, label: p.title, hint: p.hint }))}
          onChange={onApplyPreset}
          title={tr("Применить готовую расстановку панелей")}
        />
        <div className="muted small">{tr("Вкладки можно перетаскивать между зонами и на виды, а границы зон - сдвигать. Правый щелчок по вкладке открывает меню.")}</div>
      </Card>
      <Card title={tr("Мои раскладки")} icon="save" hint={savedLayouts.length ? `${savedLayouts.length}` : tr("текущую расстановку можно сохранить")}>
        <Row>
          <input
            className="grow"
            placeholder={tr("Название раскладки")}
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveLayout();
            }}
          />
          <button className="primary" disabled={!layoutName.trim()} onClick={saveLayout} title={tr("Сохранить текущее расположение и размеры панелей и окон под этим именем")}>
            {tr("Сохранить")}
          </button>
        </Row>
        {savedLayouts.map((name) => (
          <div key={name} className="layout-row">
            <button className="link grow" onClick={() => onApplySaved(name)} title={tr("Применить эту раскладку")}>
              {name}
            </button>
            <button className="icon-btn" onClick={() => onDeleteSaved(name)} title={tr("Удалить раскладку")}>
              <Icon name="trash" size={13} />
            </button>
          </div>
        ))}
      </Card>
    </>
  );
  const keysTab = (
    <>
      <Row>
        <Select
          value=""
          placeholder={tr("Набор клавиш…")}
          title={tr("Готовый набор клавиш: заменяет ваши переназначения")}
          options={KEYMAP_PRESETS.map((p) => ({ value: p.id, label: p.title }))}
          onChange={(v) => {
            const p = KEYMAP_PRESETS.find((x) => x.id === v);
            if (p) onChangeKeymap({ ...p.map });
          }}
        />
        <span className="muted grow">{overridden ? tr("изменено: {0}", [overridden]) : tr("по умолчанию")}</span>
        {overridden > 0 && (
          <button onClick={() => onChangeKeymap({})} title={tr("Вернуть все клавиши по умолчанию")}>
            {tr("Сбросить")}
          </button>
        )}
      </Row>
      <div className="muted small">{tr("Щёлкните по сочетанию, затем нажмите новое. Backspace - удалить, Esc - отмена.")}</div>
      <div className="list">
        {groups.map((g) => (
          <div key={g}>
            <div className="list-group muted">{g}</div>
            {commands
              .filter((c) => c.group === g)
              .map((c) => {
                const k = effectiveHotkey(keymap, c.id, c.hotkey);
                const conflict = k && (bound.get(k) ?? 0) > 1;
                const changed = c.id in keymap;
                return (
                  <div key={c.id} className="list-row hotkey-row">
                    <span className="list-text" title={c.title}>
                      {c.title}
                    </span>
                    <button
                      className={`hotkey-btn${recording === c.id ? " active" : ""}${conflict ? " bad" : ""}`}
                      onClick={() => setRecording(recording === c.id ? null : c.id)}
                      title={conflict ? tr("Это сочетание назначено ещё одной команде") : tr("Нажмите, чтобы назначить")}
                    >
                      {recording === c.id ? tr("нажмите…") : k || "-"}
                    </button>
                    {changed && (
                      <button
                        className="icon-btn"
                        onClick={() => {
                          const next = { ...keymap };
                          delete next[c.id];
                          onChangeKeymap(next);
                        }}
                        title={tr("По умолчанию: {0}", [c.hotkey || tr("нет")])}
                      >
                        ↺
                      </button>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </>
  );
  return (
    <PanelFrame title={tr("Настройки")} className={tab === "keys" ? "browser" : ""}>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "view", label: tr("Вид") },
          { value: "layout", label: tr("Панели") },
          { value: "keys", label: tr("Клавиши"), count: overridden || undefined },
        ]}
      />
      {tab === "view" ? view : tab === "layout" ? layoutTab : keysTab}
    </PanelFrame>
  );
}
