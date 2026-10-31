// Compile panel: one big "build" with presets, a status card, the log read
// in the mapper's words (issues with fixes), findings without the game's
// noise, content packing, and the game on a short leash. The full log is
// there, folded, with a filter.

import { useMemo, useState } from "react";
import type { CompileIssue } from "../map/compileIssues";
import { collectFindings, refOf, type LogRef } from "../map/compilelog";
import type { BridgeStatus, CompileOptions, PackReport } from "../tauri";
import { Icon } from "./Icon";
import { Badge, Card, Empty, PanelFrame, Row, Segmented, Status } from "./kit";
import { t, lazy } from "../i18n";

export interface CompileState {
  running: boolean;
  lines: string[];
  result: string;
  ok: boolean | null;
}

interface Props {
  options: CompileOptions;
  state: CompileState;
  mapName: string;
  canCompile: boolean;
  leakPoints: number;
  issues: CompileIssue[];
  onFixIssue(issue: CompileIssue): void;
  onAskAssistant(): void;
  pack: PackReport | null;
  packBusy: boolean;
  packAfterCompile: boolean;
  canPack: boolean;
  onChange(options: CompileOptions): void;
  onRun(): void;
  onClear(): void;
  onGoTo(ref: LogRef): void;
  onHideLeak(): void;
  onRunGame(): void;
  onRunGameDebug(): void;
  bridge: BridgeStatus | null;
  bridgeFollow: boolean;
  onBridgeFollow(v: boolean): void;
  bridgeLive: boolean;
  onBridgeLive(v: boolean): void;
  onTeleport(): void;
  onCameraToGame(): void;
  onGameToCamera(): void;
  onCubemaps(): void;
  onSyncEntities(): void;
  onReloadGame(): void;
  onKillGame(): void;
  portalCount: number;
  portalsShown: boolean;
  onTogglePortals(): void;
  /** Visleaves of the compiled BSP (0 until a BSP was read). */
  leafCount: number;
  leavesShown: boolean;
  onToggleLeaves(): void;
  onAnalyze(): void;
  onPack(): void;
  onPackAfterCompile(v: boolean): void;
  onGameView?(): void;
  autoFix: boolean;
  onAutoFix(v: boolean): void;
  autoAsk: boolean;
  onAutoAsk(v: boolean): void;
  /** What the auto-analysis did after the last build. */
  autoReport: string;
}

const fmtBytes = (n: number) => (n >= 1 << 20 ? t("{0} МБ", [(n / (1 << 20)).toFixed(1)]) : n >= 1024 ? t("{0} КБ", [Math.round(n / 1024)]) : t("{0} Б", [n]));

/** Compile presets: a quick pass for geometry and leaks, a full one, or the flags as set. HDR is a flag of its own, not a preset. */
const PRESETS: { id: string; title: string; hint: string; patch: Partial<CompileOptions> }[] = lazy(() => [
  { id: "quick", title: t("Быстрая"), hint: t("VBSP и VVIS -fast без освещения: проверка геометрии и утечек"), patch: { vbsp: true, vvis: true, vrad: false, fast: true, hdr: false } },
  { id: "full", title: t("Полная"), hint: t("VBSP, полный VVIS и VRAD: итоговое освещение. HDR включается в параметрах сборки"), patch: { vbsp: true, vvis: true, vrad: true, fast: false } },
  { id: "custom", title: t("Своя"), hint: t("Параметры заданы вручную"), patch: {} },
]);

/** Console lines that are the game's own noise, not the map's. */
const NOISE =
  /find\/load font|custom font file|txr_smoke|overbrightfactor|Unknown command|ConVarRef|KeyValues Error|CSoundEmitterSystem|lua_openscript|Changing gamemode|Addon .* is|SOLID_VPHYSICS|Couldn't find any entities named/i;

function presetOf(o: CompileOptions): string {
  for (const p of PRESETS) {
    if (p.id === "custom") continue;
    if (Object.entries(p.patch).every(([k, v]) => (o as unknown as Record<string, unknown>)[k] === v)) return p.id;
  }
  return "custom";
}

export function CompilePanel(p: Props) {
  const { options, state, bridge } = p;
  const [flags, setFlags] = useState(false);
  const [findTab, setFindTab] = useState<"build" | "game">("build");
  const [showNoise, setShowNoise] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [more, setMore] = useState(() => !!options.extraCommands || !!options.vbspArgs || !!options.vvisArgs || !!options.vradArgs);
  const connected = !!bridge?.connected;
  const set = (patch: Partial<CompileOptions>) => p.onChange({ ...options, ...patch });
  const preset = presetOf(options);

  const findings = useMemo(() => collectFindings(state.lines), [state.lines]);
  const grouped = useMemo(() => {
    const build = new Map<string, { text: string; count: number; ref: LogRef | null; leak: boolean; error: boolean }>();
    const game = new Map<string, { text: string; count: number; ref: LogRef | null; leak: boolean; error: boolean }>();
    let noise = 0;
    for (const f of findings) {
      const isGame = f.text.startsWith("[game]");
      const text = f.text.replace(/^\[\w+\]\s*/, "").trim();
      if (isGame && NOISE.test(text)) {
        noise++;
        if (!showNoise) continue;
      }
      const m = isGame ? game : build;
      const prev = m.get(text);
      if (prev) prev.count++;
      else m.set(text, { text, count: 1, ref: f.ref, leak: f.leak, error: /error|leaked/i.test(text) });
    }
    return { build: Array.from(build.values()), game: Array.from(game.values()), noise };
  }, [findings, showNoise]);
  const list = findTab === "build" ? grouped.build : grouped.game;
  const logLines = useMemo(() => (filter ? state.lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase())) : state.lines), [state.lines, filter]);

  const custom = p.pack ? p.pack.files.filter((f) => f.custom) : [];
  const lastLine = state.lines.length ? state.lines[state.lines.length - 1] : "";
  const gameLabel = !bridge
    ? t("связь с игрой доступна только в приложении")
    : connected
      ? t("подключено: {0}", [bridge.map ?? "?"])
      : bridge.running
        ? t("игра запущена, ожидание аддона…")
        : bridge.exitHint
          ? bridge.exitHint
          : t("игра не запущена");

  return (
    <PanelFrame
      title={t("Сборка")}
      subtitle={p.mapName || t("карта не сохранена")}
      actions={
        <button className={`icon-btn${flags ? " active" : ""}`} onClick={() => setFlags(!flags)} title={t("Параметры сборки: этапы, быстрый режим, HDR, копирование в игру, аргументы")}>
          <Icon name="settings" />
        </button>
      }
    >
      <Card>
        <Row>
          <Segmented
            value={preset}
            options={PRESETS.map((x) => ({ value: x.id, label: x.title, title: x.hint }))}
            onChange={(id) => {
              const x = PRESETS.find((q) => q.id === id);
              if (x && id !== "custom") set(x.patch);
            }}
          />
        </Row>
        {flags ? (
          <>
            <Row wrap className="compile-flags">
              {(
                [
                  ["vbsp", "VBSP", t("Геометрия и энтити")],
                  ["vvis", "VVIS", t("Расчёт видимости; без него карта отрисовывается целиком")],
                  ["vrad", "VRAD", t("Расчёт освещения; без него карта будет fullbright")],
                  ["fast", t("Быстрый режим"), t("Ключ -fast для VVIS и VRAD: качество ниже, но сборка в разы быстрее")],
                  ["hdr", "HDR", t("Дополнительно рассчитать освещение для HDR")],
                  ["install", t("Копировать в maps"), t("Скопировать BSP в garrysmod/maps")],
                  ["runGame", t("Запустить игру"), t("Запустить игру после сборки")],
                ] as [keyof CompileOptions, string, string][]
              ).map(([k, label, title]) => (
                <label key={k} className="chk" title={title}>
                  <input type="checkbox" checked={options[k] as boolean} onChange={(e) => set({ [k]: e.target.checked } as Partial<CompileOptions>)} /> {label}
                </label>
              ))}
            </Row>
            <Row wrap>
              <button className={`chip${more ? " on" : ""}`} onClick={() => setMore(!more)} title={t("Дополнительные аргументы инструментов и команды после сборки")}>
                {t("Аргументы и команды")}
              </button>
            </Row>
            {more ? (
              <div className="compile-more">
                <input placeholder={t("Аргументы VBSP")} value={options.vbspArgs} onChange={(e) => set({ vbspArgs: e.target.value })} spellCheck={false} />
                <input placeholder={t("Аргументы VVIS")} value={options.vvisArgs} onChange={(e) => set({ vvisArgs: e.target.value })} spellCheck={false} />
                <input placeholder={t("Аргументы VRAD")} value={options.vradArgs} onChange={(e) => set({ vradArgs: e.target.value })} spellCheck={false} />
                <textarea
                  rows={3}
                  spellCheck={false}
                  placeholder={t("Команды после VBSP/VVIS/VRAD, по одной в строке. Подстановки: $vmf $bsp $name $dir $game $bin")}
                  value={options.extraCommands}
                  onChange={(e) => set({ extraCommands: e.target.value })}
                />
              </div>
            ) : null}
          </>
        ) : null}
        <Row className="compile-run">
          <button className="btn-build big" onClick={p.onRun} disabled={!p.canCompile || state.running} title={t("Сохранить карту и запустить VBSP, VVIS и VRAD (F9)")}>
            <Icon name="build" /> {state.running ? t("Идёт сборка…") : t("Собрать карту")}
          </button>
          <button className="btn-play" onClick={p.onRunGame} disabled={!p.canCompile || state.running} title={t("Запустить Garry's Mod на собранной карте")}>
            <Icon name="play" /> {t("Играть")}
          </button>
          <button className="btn-debug" onClick={p.onRunGameDebug} disabled={!p.canCompile || state.running} title={t("Запустить с отладкой: консоль, сообщения разработчика, sv_cheats 1")}>
            <Icon name="bug" />
          </button>
        </Row>
      </Card>

      {state.lines.length || state.running ? (
        <Card tone={state.running ? undefined : state.ok === false ? "bad" : state.ok ? "ok" : undefined}>
          <div className="compile-status">
            <Status tone={state.running ? "busy" : state.ok === false ? "bad" : state.ok ? "ok" : "muted"}>
              {state.running ? t("Идёт сборка") : state.ok === false ? t("Ошибка сборки") : state.ok ? t("Сборка завершена") : t("Сборка")}
            </Status>
            <span className="list-text grow muted" title={state.result}>
              {state.running ? lastLine.replace(/^\[\w+\]\s*/, "") : state.result}
            </span>
            {p.leakPoints > 0 ? (
              <button className="chip on" onClick={p.onHideLeak} title={t("Скрыть линию утечки в видах")}>
                {t("Утечка (")}
                {p.leakPoints})
              </button>
            ) : null}
            {p.portalCount > 0 ? (
              <button className={`chip${p.portalsShown ? " on" : ""}`} onClick={p.onTogglePortals} title={t("Порталы VVIS: границы кластеров видимости в видах")}>
                {t("Порталы (")}
                {p.portalCount})
              </button>
            ) : null}
            {p.leafCount > 0 ? (
              <button
                className={`chip${p.leavesShown ? " on" : ""}`}
                onClick={p.onToggleLeaves}
                title={t("Визлифы собранной карты в видах: цвет от зелёного до красного по числу кластеров, видимых из лифа. Красные места дороги для VVIS и для игры")}
              >
                {t("Визлифы")}
                {p.leafCount > 0 ? ` (${p.leafCount})` : ""}
              </button>
            ) : null}
          </div>
        </Card>
      ) : null}

      {!state.running && p.autoReport ? (
        <Card
          title={t("Автоанализ")}
          icon="check"
          tone={/Исправлено автоматически/.test(p.autoReport) ? "ok" : "warn"}
          right={
            /Требуется пересборка/.test(p.autoReport) ? (
              <button className="primary" onClick={p.onRun} disabled={!p.canCompile}>
                {t("Пересобрать")}
              </button>
            ) : null
          }
        >
          <div className="small">{p.autoReport}</div>
        </Card>
      ) : null}
      {!state.running && (p.issues.length > 0 || (state.ok === false && state.lines.length > 0)) ? (
        <Card
          title={t("Анализ лога")}
          hint={p.issues.length ? `${p.issues.length} ${p.issues.length === 1 ? t("находка") : p.issues.length < 5 ? t("находки") : t("находок")}` : t("причина не распознана")}
          right={
            <>
              {p.issues.some((i) => i.fix) ? (
                <button onClick={() => p.issues.forEach((i) => i.fix && p.onFixIssue(i))} title={t("Применить все доступные автоматические исправления")}>
                  {t("Исправить известные")}
                </button>
              ) : null}
              <button className="primary" onClick={p.onAskAssistant} title={t("Передать лог ассистенту: он объяснит причину, исправит карту и пересоберёт её")}>
                <Icon name="brush" /> {t("Спросить ассистента")}
              </button>
            </>
          }
        >
          {p.issues.map((i) => (
            <div key={i.id} className={`issue ${i.severity}`}>
              <div className="issue-head">
                <Badge tone={i.severity === "error" ? "bad" : i.severity === "warning" ? "warn" : "muted"}>
                  {i.severity === "error" ? t("Ошибка") : i.severity === "warning" ? t("Предупреждение") : t("Инфо")}
                </Badge>
                <strong className="grow">{i.title}</strong>
                {i.fix ? (
                  <button className="link" onClick={() => p.onFixIssue(i)} title={t("Исправить автоматически")}>
                    {i.fix.label}
                  </button>
                ) : null}
              </div>
              <div className="issue-text">{i.explain}</div>
            </div>
          ))}
          {!p.issues.length ? <div className="muted">{t("Причина не распознана. Передайте лог ассистенту или изучите полный лог ниже.")}</div> : null}
        </Card>
      ) : null}
      <Row wrap className="compile-auto">
        <label className="chk" title={t("После каждой сборки добавлять env_cubemap, заменять отсутствующие материалы и применять автоматические исправления проверки")}>
          <input type="checkbox" checked={p.autoFix} onChange={(e) => p.onAutoFix(e.target.checked)} /> {t("Автоматически исправлять известные ошибки")}
        </label>
        <label className="chk" title={t("При нераспознанных ошибках или неудачной сборке сразу передавать лог ассистенту")}>
          <input type="checkbox" checked={p.autoAsk} onChange={(e) => p.onAutoAsk(e.target.checked)} /> {t("Передавать неизвестные ошибки ассистенту")}
        </label>
      </Row>

      {grouped.build.length || grouped.game.length || grouped.noise ? (
        <Card
          title={t("Находки")}
          right={
            <Segmented<"build" | "game">
              small
              value={findTab}
              onChange={setFindTab}
              options={[
                { value: "build", label: t("Сборка"), count: grouped.build.length },
                { value: "game", label: t("Игра"), count: grouped.game.length },
              ]}
            />
          }
        >
          {list.slice(0, 12).map((f) => (
            <div key={f.text} className={`finding${f.ref ? " clickable" : ""}`} onClick={() => f.ref && p.onGoTo(f.ref)} title={f.ref ? t("Перейти к объекту или месту") : f.text}>
              <Badge tone={f.leak ? "bad" : f.error ? "bad" : "warn"}>{f.leak ? t("Утечка") : f.error ? t("Ошибка") : t("Предупреждение")}</Badge>
              <span className="list-text grow">{f.text}</span>
              {f.count > 1 ? <span className="muted">×{f.count}</span> : null}
            </div>
          ))}
          {list.length > 12 ? (
            <div className="muted">
              {t("…и ещё")} {list.length - 12} {t("в полном логе")}
            </div>
          ) : null}
          {!list.length ? <div className="muted">{findTab === "game" ? t("В консоли игры замечаний нет") : t("Замечаний к сборке нет")}</div> : null}
          {findTab === "game" && grouped.noise ? (
            <label className="chk muted" title={t("Сообщения о шрифтах, частицах и аддонах, не относящиеся к карте")}>
              <input type="checkbox" checked={showNoise} onChange={(e) => setShowNoise(e.target.checked)} /> {t("Показать служебные сообщения игры (")}
              {grouped.noise})
            </label>
          ) : null}
        </Card>
      ) : null}

      <Card title={t("Игра")} hint={gameLabel} icon="play">
        <Row wrap>
          <Status tone={connected ? "ok" : bridge?.running ? "busy" : "muted"}>{connected ? t("Подключено") : bridge?.running ? t("Запуск…") : t("Не запущена")}</Status>
          <span className="grow" />
          {p.onGameView ? (
            <button className="primary" onClick={p.onGameView} title={t("Взгляд из игры: снимки экрана, живой просмотр, цикл пересборки")}>
              <Icon name="camera" /> {t("Взгляд из игры")}
            </button>
          ) : null}
          <button onClick={p.onKillGame} disabled={!bridge?.running} title={t("Закрыть игру, запущенную из редактора")}>
            {t("Закрыть")}
          </button>
        </Row>
        {!connected ? (
          <Row wrap>
            <span className="muted list-text">
              {bridge?.running
                ? t("Аддон связи с игрой подключится через несколько секунд.")
                : t("Кнопка «Играть» запускает игру на этой карте; после подключения здесь станут доступны телепорт, синхронизация камеры и живая связь.")}
            </span>
            <span className="grow" />
            <button className="chip" onClick={p.onCubemaps} disabled={!p.canCompile} title={t("Запустить игру с -buildcubemaps: движок соберёт кубмапы в BSP")}>
              {t("Собрать кубмапы")}
            </button>
          </Row>
        ) : null}
        {connected ? (
          <Row wrap>
            <button className="chip" onClick={p.onTeleport} disabled={!connected} title={t("Перенести игрока к выделенным объектам")}>
              {t("К выделению")}
            </button>
            <button className="chip" onClick={p.onCameraToGame} disabled={!connected} title={t("Переместить игрока в позицию камеры 3D-вида")}>
              {t("Камера → игрок")}
            </button>
            <button className="chip" onClick={p.onGameToCamera} disabled={!connected || !bridge?.pos} title={t("Переместить камеру 3D-вида в позицию игрока")}>
              {t("Игрок → камера")}
            </button>
            <button className="chip" onClick={p.onReloadGame} disabled={!connected} title={t("Выполнить changelevel на эту же карту, чтобы загрузить пересобранный BSP")}>
              {t("Перезагрузить карту")}
            </button>
            <button className="chip" onClick={p.onSyncEntities} disabled={!connected} title={t("Переместить выделенные точечные энтити в игре в их позиции из редактора")}>
              {t("Синхронизировать энтити")}
            </button>
            <button className="chip" onClick={p.onCubemaps} disabled={!p.canCompile} title={t("Запустить игру с -buildcubemaps: движок соберёт кубмапы в BSP")}>
              {t("Собрать кубмапы")}
            </button>
          </Row>
        ) : null}
        {connected ? (
          <Row wrap>
            <label className="chk" title={t("Камера 3D-вида следует за игроком, пока игра подключена")}>
              <input type="checkbox" checked={p.bridgeFollow} onChange={(e) => p.onBridgeFollow(e.target.checked)} /> {t("Камера следует за игроком")}
            </label>
            <label className="chk" title={t("Перемещение, поворот и изменение ключей точечных энтити сразу применяются в игре")}>
              <input type="checkbox" checked={p.bridgeLive} onChange={(e) => p.onBridgeLive(e.target.checked)} /> {t("Живая связь")}
            </label>
          </Row>
        ) : null}
      </Card>

      <Card
        title={t("Контент")}
        icon="import"
        hint={
          p.pack
            ? t("файлов: {0}, собственных: {1}{2}", [p.pack.files.length, custom.length, p.pack.missing.length ? t(", не найдено: {0}", [p.pack.missing.length]) : ""])
            : t("материалы, модели и звуки, которых нет в игре")
        }
        right={
          <>
            <button onClick={p.onAnalyze} disabled={!p.canCompile || p.packBusy} title={t("Проверить материалы, модели, звуки и скайбокс карты и показать, что нужно упаковать")}>
              {t("Проверить")}
            </button>
            <button onClick={p.onPack} disabled={!p.canPack || p.packBusy} title={t("Упаковать собственный контент в BSP (bspzip), чтобы карта работала у других игроков")}>
              {t("Упаковать")}
              {custom.length ? ` (${fmtBytes(p.pack?.customBytes ?? 0)})` : ""}
            </button>
          </>
        }
      >
        <label className="chk" title={t("После успешной сборки найти собственный контент и упаковать его в BSP")}>
          <input type="checkbox" checked={p.packAfterCompile} onChange={(e) => p.onPackAfterCompile(e.target.checked)} /> {t("Упаковывать контент после сборки")}
        </label>
        {p.pack ? (
          <>
            {custom.slice(0, 12).map((f) => (
              <div key={f.path} className="finding" title={t("{0}\nисточник: {1}\nиспользуется: {2}", [f.path, f.source, f.neededBy])}>
                <Badge tone="muted">{f.source}</Badge>
                <span className="list-text grow">{f.path}</span>
                <span className="muted">{fmtBytes(f.size)}</span>
              </div>
            ))}
            {custom.length > 12 ? (
              <div className="muted">
                {t("…и ещё")} {custom.length - 12}
              </div>
            ) : null}
            {p.pack.missing.slice(0, 8).map((m) => (
              <div key={m} className="finding" title={t("Файл упоминается на карте, но его нет ни в проекте, ни в игре")}>
                <Badge tone="bad">{t("Не найден")}</Badge>
                <span className="list-text grow">{m}</span>
              </div>
            ))}
            {!custom.length && !p.pack.missing.length ? <div className="muted">{t("Весь контент карты есть в игре, упаковка не требуется.")}</div> : null}
          </>
        ) : null}
      </Card>

      {state.lines.length ? (
        <Card
          title={t("Полный лог")}
          hint={t("строк: {0}", [state.lines.length])}
          right={
            <>
              {logOpen ? <input className="log-filter" placeholder={t("Фильтр")} value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} /> : null}
              <button className="link" onClick={() => setLogOpen(!logOpen)}>
                {logOpen ? t("Свернуть") : t("Показать")}
              </button>
              <button className="icon-btn" onClick={p.onClear} title={t("Очистить лог")}>
                <Icon name="trash" />
              </button>
            </>
          }
          flush
        >
          {logOpen ? (
            <div className="compile-log">
              {logLines.map((l, i) => {
                const ref = refOf(l);
                return (
                  <div key={i} className={`compile-line${ref ? " clickable" : ""}`} onClick={() => ref && p.onGoTo(ref)}>
                    {l}
                  </div>
                );
              })}
            </div>
          ) : null}
        </Card>
      ) : !state.running ? (
        <Empty icon="build" title={t("Карта ещё не собиралась")} text={t("«Собрать карту» сохраняет карту и запускает VBSP, VVIS и VRAD. Результат, анализ ошибок и замечания появятся здесь.")} />
      ) : null}
    </PanelFrame>
  );
}
