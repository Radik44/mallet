// The "Свет" card of the inspector for light entities: a glowing preview of
// the colour at its brightness, the colour picker, a brightness slider and
// the few keys a mapper touches on each kind of light (ambient for the sun,
// cone for spots, the falloff distances for point lights).

import { ColorField } from "./ColorField";
import { parseSourceColor } from "./color";
import { t } from "../i18n";

interface Props {
  classname: string;
  keyvalues: [string, string][];
  onSetKeys(changes: [string, string | null][]): void;
}

const DEFAULT_LIGHT = "255 255 255 200";

/** The classes the card knows; light_dynamic keeps the generic sheet. */
export function isLightClass(classname: string): boolean {
  const c = classname.toLowerCase();
  return c === "light" || c === "light_spot" || c === "light_environment";
}

function Row({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div className="props-row" title={title}>
      <span className="key-label">{label}</span>
      {children}
    </div>
  );
}

function NumberField({ value, step, min, max, onCommit }: { value: string; step?: number; min?: number; max?: number; onCommit(v: string): void }) {
  return <input type="number" step={step} min={min} max={max} value={value} onChange={(e) => onCommit(e.target.value)} />;
}

export function LightCard({ classname, keyvalues, onSetKeys }: Props) {
  const c = classname.toLowerCase();
  const kv = new Map(keyvalues.map(([k, v]) => [k.toLowerCase(), v]));
  const get = (k: string, def = "") => kv.get(k) ?? def;
  const set = (k: string) => (v: string) => onSetKeys([[k, v]]);
  const light = parseSourceColor(get("_light", DEFAULT_LIGHT), 255);
  const rgb = light?.rgb ?? [255, 255, 255];
  const brightness = light?.extra ?? 200;
  // The preview: how bright the lamp looks next to a plain 200 one.
  const glow = Math.max(0.15, Math.min(1.6, Math.sqrt(Math.max(0, brightness) / 200)));
  const css = `rgb(${rgb.join(", ")})`;
  const kind = c === "light_environment" ? t("солнце и небо") : c === "light_spot" ? t("прожектор") : t("лампа");
  return (
    <section className="insp-card light-card">
      <div className="insp-head">
        <span className="light-preview" style={{ "--glow": css, "--glow-k": glow } as React.CSSProperties} title={t("{0}, яркость {1}", [css, brightness])} />
        <strong>{t("Свет")}</strong>
        <span className="muted list-text">{kind}</span>
      </div>
      <div className="props-list">
        <Row label={t("Цвет и яркость")} title={t("_light: r g b яркость. 200 для обычной лампы, 50 для ночника, 1000 и выше для солнца")}>
          <ColorField value={get("_light")} placeholder={DEFAULT_LIGHT} scale={255} brightness onCommit={set("_light")} />
        </Row>
        <Row label={t("Яркость")} title={t("Четвёртое число ключа _light")}>
          <div className="with-swatch">
            <input
              type="range"
              className="grow"
              min={0}
              max={c === "light_environment" ? 2000 : 1000}
              step={10}
              value={Math.max(0, Math.min(2000, brightness))}
              onChange={(e) => onSetKeys([["_light", `${rgb.join(" ")} ${e.target.value}`]])}
            />
            <NumberField value={String(brightness)} step={10} onCommit={(v) => onSetKeys([["_light", `${rgb.join(" ")} ${v}`]])} />
          </div>
        </Row>
        {c === "light_environment" && (
          <>
            <Row label={t("Небо (ambient)")} title={t("_ambient: рассеянный свет неба со всех сторон, обычно слабее и холоднее солнечного")}>
              <ColorField value={get("_ambient")} placeholder="255 255 255 20" scale={255} brightness onCommit={set("_ambient")} />
            </Row>
            <Row label={t("Высота солнца")} title={t("Высота солнца: −90 в зените, 0 на горизонте")}>
              <div className="with-swatch">
                <input
                  type="range"
                  className="grow"
                  min={-90}
                  max={0}
                  step={5}
                  value={Math.max(-90, Math.min(0, Number(get("pitch", "-60")) || 0))}
                  onChange={(e) => onSetKeys([["pitch", e.target.value]])}
                />
                <NumberField value={get("pitch", "-60")} step={5} min={-90} max={90} onCommit={set("pitch")} />
              </div>
            </Row>
            <Row label={t("Размытие тени")} title={t("SunSpreadAngle: 0 - резкие тени, 5–10 - мягкие, как в пасмурный день")}>
              <NumberField value={get("sunspreadangle", "0")} step={1} min={0} max={90} onCommit={set("SunSpreadAngle")} />
            </Row>
          </>
        )}
        {c === "light_spot" && (
          <>
            <Row label={t("Конус, внутренний")} title={t("_inner_cone: угол полной яркости в градусах")}>
              <NumberField value={get("_inner_cone", "30")} step={5} min={0} max={90} onCommit={set("_inner_cone")} />
            </Row>
            <Row label={t("Конус, внешний")} title={t("_cone: угол полного затухания света в градусах")}>
              <NumberField value={get("_cone", "45")} step={5} min={0} max={90} onCommit={set("_cone")} />
            </Row>
            <Row label={t("Наклон")} title={t("pitch: отрицательные значения - вверх, 90 - строго вниз (у прожектора отдельный ключ; angles также учитывается)")}>
              <div className="with-swatch">
                <input
                  type="range"
                  className="grow"
                  min={-90}
                  max={90}
                  step={5}
                  value={Math.max(-90, Math.min(90, Number(get("pitch", "-90")) || 0))}
                  onChange={(e) => onSetKeys([["pitch", e.target.value]])}
                />
                <NumberField value={get("pitch", "-90")} step={5} min={-90} max={90} onCommit={set("pitch")} />
              </div>
            </Row>
          </>
        )}
        {c !== "light_environment" && (
          <>
            <Row label={t("Дистанция 50 %")} title={t("_fifty_percent_distance: расстояние, на котором яркость падает вдвое; 0 - стандартное затухание")}>
              <NumberField value={get("_fifty_percent_distance", "0")} step={16} min={0} onCommit={set("_fifty_percent_distance")} />
            </Row>
            <Row label={t("Дистанция 0 %")} title={t("_zero_percent_distance: расстояние, на котором свет полностью гаснет; 0 - стандартное затухание")}>
              <NumberField value={get("_zero_percent_distance", "0")} step={16} min={0} onCommit={set("_zero_percent_distance")} />
            </Row>
          </>
        )}
      </div>
    </section>
  );
}
