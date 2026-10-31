// Resources: what the open map costs. Source engine limits with how much
// of each is used, the load by kind of object, the editor's memory by
// what holds it, and the frame. Refreshed every second while open.

import { Card, Empty, PanelFrame, Status } from "./kit";
import { currentLocale, t } from "../i18n";

export interface LimitRow {
  key: string;
  label: string;
  hint: string;
  value: number;
  limit: number;
}

export interface LoadRow {
  key: string;
  label: string;
  value: string;
  /** Share of the frame's triangles or draws this kind takes, 0..1, when it makes sense. */
  share?: number;
  hint?: string;
}

export interface MemoryRow {
  key: string;
  label: string;
  bytes: number;
  hint: string;
}

export interface ResourceSnapshot {
  limits: LimitRow[];
  load: LoadRow[];
  memory: MemoryRow[];
  frameMs: number;
  drawCalls: number;
  triangles: number;
  takenAt: number;
}

const COLORS = ["#4c6ef5", "#f08c3a", "#2fbf8f", "#c05fd6", "#e3c23c", "#5fb4e6", "#e05c5c", "#8b8d97"];

export function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return t("{0} ГБ", [(n / 1024 / 1024 / 1024).toFixed(2)]);
  if (n >= 1024 * 1024) return t("{0} МБ", [(n / 1024 / 1024).toFixed(1)]);
  if (n >= 1024) return t("{0} КБ", [Math.round(n / 1024)]);
  return t("{0} Б", [n]);
}

function level(ratio: number): "ok" | "warn" | "bad" {
  return ratio >= 0.9 ? "bad" : ratio >= 0.6 ? "warn" : "ok";
}

export function ResourcesPanel({ snapshot, mapName }: { snapshot: ResourceSnapshot | null; mapName: string }) {
  if (!snapshot) {
    return (
      <PanelFrame title={t("Ресурсы")} subtitle={mapName ? t("подсчёт…") : t("откройте карту")}>
        <Empty icon="resources" title={mapName ? t("Подсчёт…") : t("Откройте карту")} text={t("Панель показывает заполнение лимитов Source и нагрузку отрисовки в кадре.")} />
      </PanelFrame>
    );
  }
  const total = snapshot.memory.reduce((a, m) => a + m.bytes, 0) || 1;
  const worst = snapshot.limits.reduce((w, r) => Math.max(w, r.value / r.limit), 0);
  const tone = level(worst);
  return (
    <PanelFrame
      title={t("Ресурсы")}
      className="resources"
      subtitle={
        <Status tone={tone} title={t("Самый заполненный лимит Source")}>
          {worst >= 0.9 ? t("лимиты почти исчерпаны") : worst >= 0.6 ? t("лимиты заполняются") : t("в пределах лимитов")}
        </Status>
      }
      actions={
        <span className="muted" title={t("Время кадра и число вызовов отрисовки в 3D-виде")}>
          {snapshot.frameMs.toFixed(1)} {t("мс ·")} {snapshot.drawCalls} draw
        </span>
      }
    >
      <Card title={t("Лимиты Source")} icon="resources" hint={t("заполнение лимитов движка")}>
        {snapshot.limits.map((r) => {
          const ratio = Math.min(1, r.value / r.limit);
          return (
            <div key={r.key} className="res-row" title={r.hint}>
              <span className="res-label">{r.label}</span>
              <span className="res-bar">
                <span className={`res-fill ${level(ratio)}`} style={{ width: `${Math.max(1, ratio * 100)}%` }} />
              </span>
              <span className="res-value">
                {r.value.toLocaleString(currentLocale())} <span className="muted">/ {r.limit.toLocaleString(currentLocale())}</span>
              </span>
              <span className={`res-pct ${level(ratio)}`}>{Math.round(ratio * 100)}%</span>
            </div>
          );
        })}
      </Card>
      <Card title={t("Нагрузка в кадре")} icon="camera" hint={t("объекты отрисовки")} collapsible defaultOpen={false} id="res-load">
        {snapshot.load.map((r) => (
          <div key={r.key} className="res-row" title={r.hint}>
            <span className="res-label">{r.label}</span>
            {r.share !== undefined ? (
              <span className="res-bar">
                <span className="res-fill" style={{ width: `${Math.max(1, Math.min(1, r.share) * 100)}%` }} />
              </span>
            ) : (
              <span className="grow" />
            )}
            <span className="res-value">{r.value}</span>
            {r.share !== undefined && <span className="res-pct muted">{Math.round(r.share * 100)}%</span>}
          </div>
        ))}
      </Card>
      <Card title={t("Память редактора")} icon="settings" hint={fmtBytes(total)} collapsible defaultOpen={false} id="res-memory">
        <div className="res-stack">
          {snapshot.memory.map((m, i) => (
            <span key={m.key} className="res-stack-part" style={{ width: `${(m.bytes / total) * 100}%`, background: COLORS[i % COLORS.length] }} title={`${m.label}: ${fmtBytes(m.bytes)}`} />
          ))}
        </div>
        {snapshot.memory.map((m, i) => (
          <div key={m.key} className="res-row" title={m.hint}>
            <span className="res-dot" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="res-label">{m.label}</span>
            <span className="grow" />
            <span className="res-value">{fmtBytes(m.bytes)}</span>
            <span className="res-pct muted">{((m.bytes / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </Card>
      <div className="muted small">{t("Обновляется раз в секунду, пока панель открыта.")}</div>
    </PanelFrame>
  );
}
