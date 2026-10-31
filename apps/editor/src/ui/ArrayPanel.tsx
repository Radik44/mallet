// "Размножить": Hammer's Paste Special as a small sheet. The selection is
// copied N times, each copy shifted by the offset and, optionally, turned
// about its own centre, so fences, lamps and stairs come out in one go.

import { useState } from "react";
import { ExprField } from "./ExprField";
import { Icon } from "./Icon";
import { Card, Empty, Field, PanelFrame, Row, Segmented } from "./kit";
import { t } from "../i18n";

export interface ArrayOptions {
  count: number;
  offset: [number, number, number];
  /** Yaw added per copy, degrees. */
  yaw: number;
  /** Radius of a ring of copies (0 for a row): the centre stands this far along −X from the selection. */
  ring?: number;
}

interface Props {
  selectedCount: number;
  /** Size of the selection, suggested as the offset. */
  size: [number, number, number] | null;
  busy: boolean;
  onApply(o: ArrayOptions): void;
  onClose(): void;
}

type Dir = "x" | "y" | "z" | "custom" | "ring";

const snap = (v: number) => Math.max(16, Math.ceil(v / 16) * 16);

export function ArrayPanel({ selectedCount, size, busy, onApply, onClose }: Props) {
  const [count, setCount] = useState(3);
  const [dir, setDir] = useState<Dir>("x");
  const [offset, setOffset] = useState<[number, number, number]>([size ? snap(size[0]) : 128, 0, 0]);
  const [yaw, setYaw] = useState(0);
  const [radius, setRadius] = useState(256);
  const pick = (d: Dir) => {
    setDir(d);
    if (d === "x") setOffset([size ? snap(size[0]) : 128, 0, 0]);
    else if (d === "y") setOffset([0, size ? snap(size[1]) : 128, 0]);
    else if (d === "z") setOffset([0, 0, size ? snap(size[2]) : 128]);
  };
  const axis = (i: 0 | 1 | 2) => (
    <ExprField
      step={16}
      value={offset[i]}
      onCommit={(v) => {
        const next: [number, number, number] = [...offset];
        next[i] = v || 0;
        setOffset(next);
      }}
    />
  );
  return (
    <PanelFrame
      title={t("Размножить")}
      subtitle={selectedCount ? t("{0} объектов, копии будут расставлены в ряд", [selectedCount]) : t("выделите объекты для размножения")}
      actions={
        <button className="icon-btn" onClick={onClose} title={t("Закрыть")}>
          <Icon name="close" />
        </button>
      }
      footer={
        <Row>
          <span className="muted list-text">{t("Все копии останутся выделенными; Ctrl+Z отменяет их по одной.")}</span>
          <span className="grow" />
          <button className="primary" onClick={() => onApply({ count, offset, yaw, ring: dir === "ring" ? radius : 0 })} disabled={busy || !selectedCount}>
            <Icon name="plus" /> {t("Создать")}
          </button>
        </Row>
      }
    >
      {!selectedCount ? (
        <Empty icon="copy" title={t("Ничего не выделено")} text={t("Выделите браши или энтити, чтобы размножить их в ряд с заданным шагом.")} />
      ) : (
        <>
          <Card title={t("Расстановка")} icon="copy">
            <Field label={t("Копий")} hint={t("Не считая оригинала")}>
              <ExprField className="num" value={count} onCommit={(v) => setCount(Math.max(1, Math.min(64, Math.round(v) || 1)))} />
            </Field>
            <Field label={t("Направление")} hint={t("По X, по Y и вверх шаг равен размеру выделения по этой оси: копии располагаются встык")}>
              <Segmented<Dir>
                small
                value={dir}
                onChange={pick}
                options={[
                  { value: "x", label: t("По X") },
                  { value: "y", label: t("По Y") },
                  { value: "z", label: t("Вверх") },
                  { value: "custom", label: t("Свой шаг") },
                  { value: "ring", label: t("По кругу") },
                ]}
              />
            </Field>
            {dir === "ring" && (
              <Field label={t("Радиус")} hint={t("Расстояние в юнитах от выделения до центра круга по −X; копии располагаются через равные углы и поворачиваются вместе с кругом")}>
                <ExprField className="num" step={16} value={radius} onCommit={(v) => setRadius(Math.max(1, v || 1))} />
              </Field>
            )}
            {dir === "custom" && (
              <Field label={t("Шаг X Y Z")} hint={t("Сдвиг каждой следующей копии в юнитах")}>
                {axis(0)}
                {axis(1)}
                {axis(2)}
              </Field>
            )}
          </Card>
          <Card title={t("Поворот")} icon="rotate" hint={t("вокруг своего центра")} collapsible defaultOpen={false} id="array-turn">
            <Field label={t("На копию")}>
              <ExprField className="num" step={15} value={yaw} onCommit={(v) => setYaw(v || 0)} />
              <span className="muted">°</span>
            </Field>
          </Card>
        </>
      )}
    </PanelFrame>
  );
}
