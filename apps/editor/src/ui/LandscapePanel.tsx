// The landscape wizard: a grid of floor blocks with displacements on top,
// laid out in front of the camera, ready for the landscape brush.

import { useState } from "react";
import type { Vec3 } from "../viewport/transform";
import { Icon } from "./Icon";
import { Card, Field, PanelFrame, Row, Segmented } from "./kit";
import { t, lazy } from "../i18n";

export interface LandscapeOptions {
  width: number;
  length: number;
  nx: number;
  ny: number;
  power: number;
  thickness: number;
  /** Lowest corner of the landscape (its top surface is at origin z). */
  origin: Vec3;
  material: string;
}

/** The landscape brush as the context bar sets it up. */
export interface LandscapeSettings {
  mode: "raise" | "smooth" | "flatten" | "noise" | "alpha";
  radius: number;
  /** Units per dab for raise and noise, blend strength (32 = full) for smooth and flatten, alpha for painting. */
  amount: number;
  /** 0 along the face normal, 1 straight up. */
  axis: 0 | 1;
  /** Bump size of the noise in units. */
  scale: number;
  seed: number;
}

/** Where the brush ray meets the map. */
export interface LandscapeHit {
  point: Vec3;
  normal: Vec3;
  solidId: number;
  sideId: number;
  /** The face carries a displacement, so the brush can work on it. */
  disp: boolean;
}

export const LANDSCAPE_MODES: { value: LandscapeSettings["mode"]; label: string; hint: string }[] = lazy(() => [
  { value: "raise", label: t("Поднять"), hint: t("ЛКМ поднимает, Ctrl+ЛКМ опускает") },
  { value: "smooth", label: t("Сгладить"), hint: t("Сдвигает вершины к среднему уровню соседних") },
  { value: "flatten", label: t("Выровнять"), hint: t("Выравнивает по высоте начальной точки мазка") },
  { value: "noise", label: t("Шум"), hint: t("Случайные неровности заданного размера") },
  { value: "alpha", label: t("Покраска"), hint: t("Альфа blend-материала: ЛКМ наносит, Ctrl+ЛКМ стирает") },
]);

interface Props {
  busy: boolean;
  currentMaterial: string;
  /** A spot on the ground in front of the camera, on the grid. */
  suggest(): Vec3;
  onCreate(options: LandscapeOptions): void;
  onClose(): void;
}

const field = (v: number) => (Number.isFinite(v) ? String(v) : "");

export function LandscapePanel({ busy, currentMaterial, suggest, onCreate, onClose }: Props) {
  const [width, setWidth] = useState(2048);
  const [length, setLength] = useState(2048);
  const [nx, setNx] = useState(4);
  const [ny, setNy] = useState(4);
  const [power, setPower] = useState(3);
  const [thickness, setThickness] = useState(64);
  const [centre, setCentre] = useState<Vec3>(() => suggest());
  const verts = (1 << power) + 1;
  const cell = `${Math.round(width / nx)} × ${Math.round(length / ny)}`;
  const num = (value: number, set: (v: number) => void, min: number, max: number, step = 1) => (
    <input
      type="number"
      value={field(value)}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) set(Math.max(min, Math.min(max, n)));
      }}
    />
  );
  const SIZES = [
    { id: "small", label: t("Малая"), w: 1024, l: 1024, n: 2 },
    { id: "medium", label: t("Средняя"), w: 2048, l: 2048, n: 4 },
    { id: "large", label: t("Большая"), w: 4096, l: 4096, n: 8 },
  ];
  const sizeId = SIZES.find((x) => x.w === width && x.l === length)?.id ?? "custom";
  const [custom, setCustom] = useState(false);
  const create = () =>
    onCreate({
      width,
      length,
      nx,
      ny,
      power,
      thickness,
      origin: [centre[0] - width / 2, centre[1] - length / 2, centre[2]],
      material: currentMaterial,
    });
  return (
    <PanelFrame
      title={t("Ландшафт")}
      subtitle={t("площадка из дисплейсментов для скульптинга")}
      actions={
        <button className="icon-btn" onClick={onClose} title={t("Закрыть")}>
          <Icon name="close" />
        </button>
      }
      footer={
        <Row>
          <span className="muted list-text" title={t("Секция {0}, {1}×{2} вершин на секцию", [cell, verts, verts])}>
            {nx * ny} {t("брашей ·")} {nx * ny * verts * verts} {t("вершин")}
          </span>
          <span className="grow" />
          <button className="primary" disabled={busy} onClick={create}>
            <Icon name="plus" /> {t("Создать")}
          </button>
        </Row>
      }
    >
      <Card title={t("Размер")} icon="scale" hint={t("в юнитах")}>
        <Segmented
          value={custom ? "custom" : sizeId}
          options={[...SIZES.map((x) => ({ value: x.id, label: x.label, title: t("{0}×{1}, {2}×{3} секций", [x.w, x.l, x.n, x.n]) })), { value: "custom", label: t("Свой") }]}
          onChange={(v) => {
            const x = SIZES.find((y) => y.id === v);
            if (x) {
              setCustom(false);
              setWidth(x.w);
              setLength(x.l);
              setNx(x.n);
              setNy(x.n);
            } else setCustom(true);
          }}
        />
        {(custom || sizeId === "custom") && (
          <>
            <Field label={t("Ширина, длина")}>
              {num(width, setWidth, 64, 32768, 64)}
              {num(length, setLength, 64, 32768, 64)}
            </Field>
            <Field label={t("Секций")} hint={t("Число брашей по X и Y: чем больше секций, тем ровнее сетка и быстрее правки")}>
              {num(nx, setNx, 1, 32)}
              {num(ny, setNy, 1, 32)}
            </Field>
          </>
        )}
      </Card>
      <Card title={t("Рельеф")} icon="landscape" hint={t("плотность сетки на секцию")}>
        <Segmented
          value={String(power)}
          options={[
            { value: "2", label: "5×5", title: t("Грубая сетка, быстрая сборка") },
            { value: "3", label: "9×9", title: t("Стандартная плотность") },
            { value: "4", label: "17×17", title: t("Детальный рельеф, более долгая сборка") },
          ]}
          onChange={(v) => setPower(Number(v))}
        />
        <Field label={t("Материал")} hint={t("Текущий материал будет применён ко всем секциям; для покраски кистью выберите blend-материал (nature/blend…)")}>
          <span className="list-text" title={currentMaterial}>
            {currentMaterial}
          </span>
        </Field>
      </Card>
      <Card title={t("Дополнительно")} icon="settings" collapsible defaultOpen={false} id="landscape-more">
        <Field label={t("Толщина")} hint={t("Толщина брашей под поверхностью")}>
          {num(thickness, setThickness, 1, 4096, 16)}
        </Field>
        <Field label={t("Центр")} hint={t("Центр площадки; поверхность на высоте Z")}>
          {([0, 1, 2] as const).map((k) => (
            <input
              key={k}
              type="number"
              value={field(centre[k])}
              step={64}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                const c: Vec3 = [...centre];
                c[k] = n;
                setCentre(c);
              }}
            />
          ))}
          <button className="icon-btn" onClick={() => setCentre(suggest())} title={t("Точка на земле перед камерой 3D-вида")}>
            ⌖
          </button>
        </Field>
      </Card>
    </PanelFrame>
  );
}
