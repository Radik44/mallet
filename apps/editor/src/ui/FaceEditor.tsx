// Face-edit sheet: Hammer's texture application dialog for the faces picked
// with the texture tool. Shows the first picked face's placement; every
// field commits one edit to all picked faces, which is one undo step.

import { ExprField } from "./ExprField";
import { useState } from "react";
import { Field, Row } from "./kit";
import { Select } from "./Select";
import { t } from "../i18n";

export interface FaceInfo {
  material: string;
  /** `[x, y, z, shift, scale]`. */
  uaxis: [number, number, number, number, number];
  vaxis: [number, number, number, number, number];
  rotation: number;
  lightmap_scale: number;
  smoothing_groups: number;
  normal: [number, number, number];
  /** Displacement power, 0 for a plain face. */
  disp_power: number;
  /** A four-sided face, so a displacement can be created on it. */
  quad: boolean;
}

/** Sculpt brush of the displacement paint mode. */
export interface PaintSettings {
  on: boolean;
  radius: number;
  amount: number;
  /** 0 along the face normal, 1 straight up. */
  axis: 0 | 1;
  /** What the brush does: raise the surface, smooth it, or paint the WorldVertexTransition alpha. */
  mode: "geometry" | "smooth" | "alpha";
}

/** Absent fields leave the property alone (mirrors `FaceEditDto`). */
export interface FaceEdit {
  material?: string;
  align?: "world" | "face";
  rotation?: number;
  scale_x?: number;
  scale_y?: number;
  shift_x?: number;
  shift_y?: number;
  lightmap_scale?: number;
  smoothing_groups?: number;
  justify?: "left" | "right" | "top" | "bottom" | "center" | "fit";
  tex_w?: number;
  tex_h?: number;
  /** Justify and fit against all the selected faces together. */
  treat_as_one?: boolean;
}

interface Props {
  face: FaceInfo | null;
  count: number;
  currentMaterial: string;
  onEdit(edit: FaceEdit): void;
  onApplyMaterial(): void;
  onClear(): void;
  paint: PaintSettings;
  onPaint(p: PaintSettings): void;
  onCreateDisp(power: number): void;
  onRemoveDisp(): void;
  /** Sews the displacements of the selected brushes along shared edges. */
  onSew(): void;
  /** Hammer's Invert: hills become pits. */
  onInvertDisp(): void;
  /** One power up, same shape. */
  onSubdivideDisp(): void;
}

function NumberField({ value, step, title, onCommit }: { value: number; step?: number; title: string; onCommit(v: number): void }) {
  return <ExprField value={value} step={step} title={title} onCommit={onCommit} />;
}

export function FaceEditor({ face, count, currentMaterial, onEdit, onApplyMaterial, onClear, paint, onPaint, onCreateDisp, onRemoveDisp, onSew, onInvertDisp, onSubdivideDisp }: Props) {
  const [power, setPower] = useState(3);
  const [asOne, setAsOne] = useState(false);
  if (!face || !count) return null;
  const sameMaterial = face.material.toLowerCase() === currentMaterial.toLowerCase();
  return (
    <div className="face-sheet card">
      <div className="card-head">
        <strong>
          {t("Грани:")} {count}
        </strong>
        <span className="muted list-text card-hint" title={face.material}>
          {face.material}
        </span>
        <span className="grow" />
        <button className="icon-btn" onClick={onClear} title={t("Снять выбор граней (Esc)")}>
          ✕
        </button>
      </div>
      <div className="card-body">
        <Row>
          <button className="primary" onClick={onApplyMaterial} disabled={sameMaterial} title={t("Применить {0} к выбранным граням", [currentMaterial])}>
            {t("Применить текстуру")}
          </button>
          <span className="muted list-text">{sameMaterial ? t("текстура уже применена") : currentMaterial.split("/").pop()}</span>
        </Row>
        <Field label={t("Сдвиг")}>
          <NumberField value={face.uaxis[3]} title={t("Сдвиг текстуры по X (текселей)")} onCommit={(v) => onEdit({ shift_x: v })} />
          <NumberField value={face.vaxis[3]} title={t("Сдвиг текстуры по Y (текселей)")} onCommit={(v) => onEdit({ shift_y: v })} />
        </Field>
        <Field label={t("Масштаб")}>
          <NumberField value={face.uaxis[4]} step={0.05} title={t("Масштаб по X: юнитов на тексель")} onCommit={(v) => onEdit({ scale_x: v })} />
          <NumberField value={face.vaxis[4]} step={0.05} title={t("Масштаб по Y")} onCommit={(v) => onEdit({ scale_y: v })} />
        </Field>
        <Field label={t("Поворот")}>
          <NumberField value={face.rotation} step={15} title={t("Поворот текстуры в градусах")} onCommit={(v) => onEdit({ rotation: v })} />
          <span className="muted">°</span>
        </Field>
        <Field label={t("Выровнять")} hint={t("Прижать текстуру к краю грани или вписать целиком")}>
          <Row wrap>
            {(
              [
                ["left", t("Влево")],
                ["right", t("Вправо")],
                ["top", t("Вверх")],
                ["bottom", t("Вниз")],
                ["center", t("Центр")],
                ["fit", t("Вписать")],
              ] as const
            ).map(([j, label]) => (
              <button
                key={j}
                onClick={() => onEdit({ justify: j, treat_as_one: asOne })}
                title={j === "fit" ? t("Растянуть текстуру на всю грань (или на все выбранные грани, если включено «Как одну»)") : label}
              >
                {label}
              </button>
            ))}
            {count >= 2 && (
              <label className="chk" title={t("Выравнивать по общему контуру всех выбранных граней, чтобы текстура ложилась без швов")}>
                <input type="checkbox" checked={asOne} onChange={(e) => setAsOne(e.target.checked)} /> {t("Как одну")}
              </label>
            )}
          </Row>
        </Field>
        <Field label={t("Оси")} hint={t("По миру - как у новых брашей; по грани - в плоскости грани")}>
          <Row>
            <button onClick={() => onEdit({ align: "world" })}>{t("По миру")}</button>
            <button onClick={() => onEdit({ align: "face" })}>{t("По грани")}</button>
          </Row>
        </Field>
        <details className="face-more">
          <summary className="muted">{t("Дополнительно: лайтмап и сглаживание")}</summary>
          <Field label={t("Лайтмап")} hint={t("Lightmap scale: юнитов на люксель; чем меньше, тем чётче тени")}>
            <NumberField value={face.lightmap_scale} title="Lightmap scale" onCommit={(v) => onEdit({ lightmap_scale: Math.max(1, Math.round(v)) })} />
          </Field>
          <Field label={t("Сглаживание")} hint={t("Smoothing groups: битовая маска")}>
            <NumberField value={face.smoothing_groups} title="Smoothing groups" onCommit={(v) => onEdit({ smoothing_groups: Math.max(0, Math.round(v)) })} />
          </Field>
        </details>
        <Field label={t("Рельеф")} hint={t("Дисплейсмент: грань превращается в сетку вершин, которую можно редактировать кистью «Ландшафт»")}>
          {face.disp_power === 0 ? (
            <Row>
              <Select
                value={String(power)}
                options={[
                  { value: "2", label: "5×5", hint: "power 2" },
                  { value: "3", label: "9×9", hint: "power 3" },
                  { value: "4", label: "17×17", hint: "power 4" },
                ]}
                onChange={(v) => setPower(Number(v))}
                title={t("Плотность сетки дисплейсмента")}
              />
              <button
                onClick={() => onCreateDisp(power)}
                disabled={!face.quad}
                title={face.quad ? t("Сделать выбранные четырёхугольные грани дисплейсментами") : t("Дисплейсмент можно создать только на четырёхугольной грани")}
              >
                {t("Создать")}
              </button>
            </Row>
          ) : (
            <Row wrap>
              <span className="badge muted">
                {(1 << face.disp_power) + 1}×{(1 << face.disp_power) + 1}
              </span>
              <button className={paint.on ? "active" : ""} onClick={() => onPaint({ ...paint, on: !paint.on })} title={t("Кисть: ЛКМ в 3D поднимает (или красит альфу), Ctrl+ЛКМ опускает")}>
                {t("Рисовать")}
              </button>
              <button onClick={onSew} title={t("Сшить дисплейсменты выделенных брашей по общим рёбрам")}>
                {t("Сшить")}
              </button>
              <button onClick={onInvertDisp} title={t("Инвертировать высоты: возвышения становятся впадинами и наоборот")}>
                {t("Инверсия")}
              </button>
              <button onClick={onSubdivideDisp} disabled={face.disp_power >= 4} title={t("Подразделить сетку вдвое с сохранением формы (максимум 17×17)")}>
                {t("Подразделить")}
              </button>
              <button className="icon-btn" onClick={onRemoveDisp} title={t("Удалить дисплейсмент с выбранных граней")}>
                ✕
              </button>
            </Row>
          )}
        </Field>
        {face.disp_power > 0 && paint.on && (
          <>
            <Field label={t("Кисть")}>
              <Select
                value={paint.mode}
                options={[
                  { value: "geometry", label: t("Рельеф") },
                  { value: "smooth", label: t("Сглаживание") },
                  { value: "alpha", label: t("Альфа (вторая текстура)") },
                ]}
                onChange={(v) => onPaint({ ...paint, mode: v as "geometry" | "smooth" | "alpha" })}
                title={t("«Рельеф» сдвигает вершины, «Сглаживание» выравнивает их, «Альфа» задаёт смешивание двух текстур")}
              />
              <Select
                value={String(paint.axis)}
                options={[
                  { value: "0", label: t("По нормали") },
                  { value: "1", label: t("Вверх") },
                ]}
                onChange={(v) => onPaint({ ...paint, axis: Number(v) as 0 | 1 })}
                title={t("Направление сдвига")}
              />
            </Field>
            <Field label={t("Радиус и сила")}>
              <NumberField value={paint.radius} step={8} title={t("Радиус кисти в юнитах")} onCommit={(v) => onPaint({ ...paint, radius: Math.max(1, v) })} />
              <NumberField
                value={paint.amount}
                step={4}
                title={paint.mode === "alpha" ? t("Целевая альфа 0–255: ЛКМ приближает к ней, Ctrl+ЛКМ - к нулю") : t("Сдвиг вершины в центре кисти, в юнитах")}
                onCommit={(v) => onPaint({ ...paint, amount: v })}
              />
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
