// What the player sees: screenshots from the running game, on demand or
// as a live view, with the test cycle (save, compile, reload or launch,
// shoot from the editor camera) and the player's controls.

import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import type { BridgeStatus } from "../tauri";
import { Card, Empty, PanelFrame, Row, Status } from "./kit";
import { t, tb } from "../i18n";

export interface GameShot {
  url: string;
  at: number;
  pos: [number, number, number, number, number] | null;
  bytes: number;
}

interface Props {
  inApp: boolean;
  bridge: BridgeStatus | null;
  shot: GameShot | null;
  live: boolean;
  busy: string;
  canCompile: boolean;
  onShot(): void;
  onLive(v: boolean): void;
  onTestCycle(): void;
  onRunGame(): void;
  onKillGame(): void;
  onCameraToGame(): void;
  onGameToCamera(): void;
  onTeleport(): void;
  onNoclip(on: boolean): void;
  onHud(on: boolean): void;
  onAsk(): void;
  onShotFromCamera(): void;
  onConsole(cmd: string): Promise<string[]>;
  onRunClean(): void;
}

export function GameViewPanel(p: Props) {
  const connected = !!p.bridge?.connected;
  const running = !!p.bridge?.running;
  const [cmd, setCmd] = useState("");
  const [consoleOut, setConsoleOut] = useState<string[]>([]);

  useEffect(() => {
    return () => p.onLive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runCmd = async () => {
    const c = cmd.trim();
    if (!c) return;
    setCmd("");
    try {
      const lines = await p.onConsole(c);
      setConsoleOut([`> ${c}`, ...(lines.length ? lines.slice(0, 20) : [t("(консоль не вернула вывод)")])]);
    } catch (err) {
      setConsoleOut([`> ${c}`, tb(String(err))]);
    }
  };

  const age = p.shot ? Math.round((Date.now() - p.shot.at) / 1000) : null;
  const state = !p.inApp
    ? t("только в приложении")
    : connected
      ? t("подключено: {0}", [p.bridge?.map ?? "?"])
      : running
        ? t("игра запущена, ожидание аддона…")
        : p.bridge?.exitHint
          ? p.bridge.exitHint
          : t("игра не запущена");

  return (
    <PanelFrame
      title={t("Игра")}
      subtitle={state}
      className="gameview"
      actions={
        <button
          className="btn-build"
          onClick={p.onTestCycle}
          disabled={!p.inApp || !p.canCompile || !!p.busy}
          title={t("Сохранить, собрать, перезагрузить карту в игре и снять кадр из камеры редактора")}
        >
          <Icon name="refresh" /> {p.busy || t("Пересобрать и показать")}
        </button>
      }
    >
      <div className="gameview-stage">
        {p.shot ? (
          <img src={p.shot.url} alt={t("Снимок из игры")} className="gameview-img" />
        ) : (
          <Empty
            icon="camera"
            title={connected ? t("Игра подключена") : running ? t("Игра загружается") : t("Игра не запущена")}
            text={
              connected
                ? t("Снимок показывает вид игрока; в режиме «Живой вид» он обновляется раз в секунду.")
                : running
                  ? t("После загрузки карты здесь появится её вид.")
                  : t("Запустите игру на собранной карте: редактор будет показывать вид игрока и сможет пересобирать карту для повторной проверки.")
            }
          />
        )}
        {p.live ? <span className="gameview-live">{t("● Живой вид")}</span> : null}
      </div>
      <Row wrap className="gameview-bar">
        <button className="primary" onClick={p.onShot} disabled={!connected || !!p.busy} title={t("Снимок вида игрока")}>
          <Icon name="camera" /> {t("Снимок")}
        </button>
        <button onClick={p.onShotFromCamera} disabled={!connected || !!p.busy} title={t("Снимок с позиции и направления камеры 3D-вида; игрок остаётся на месте")}>
          {t("Из камеры редактора")}
        </button>
        <label className="chk" title={t("Обновлять снимок раз в секунду")}>
          <input type="checkbox" checked={p.live} disabled={!connected} onChange={(e) => p.onLive(e.target.checked)} /> {t("Живой вид")}
        </label>
        <span className="grow" />
        <button className="link" onClick={p.onAsk} disabled={!p.shot} title={t("Отправить снимок ассистенту для анализа")}>
          {t("Спросить ассистента")}
        </button>
      </Row>
      {p.shot ? (
        <div className="muted gameview-meta">
          {Math.round(p.shot.bytes / 1024)} {t("КБ")}
          {age !== null && age > 2 ? t(", {0} с назад", [age]) : ""}
          {p.shot.pos
            ? t(" · игрок {0}", [
                p.shot.pos
                  .slice(0, 3)
                  .map((v) => Math.round(v))
                  .join(" "),
              ])
            : ""}
        </div>
      ) : null}
      {connected ? (
        <Card
          title={t("Игрок")}
          icon="move"
          hint={
            p.bridge?.pos
              ? p.bridge.pos
                  .slice(0, 3)
                  .map((v) => Math.round(v))
                  .join(" ")
              : undefined
          }
        >
          <Row wrap>
            <button className="chip" onClick={p.onCameraToGame} disabled={!connected} title={t("Переместить игрока в позицию камеры 3D-вида")}>
              {t("Камера → игрок")}
            </button>
            <button className="chip" onClick={p.onGameToCamera} disabled={!connected || !p.bridge?.pos} title={t("Переместить камеру 3D-вида в позицию игрока")}>
              {t("Игрок → камера")}
            </button>
            <button className="chip" onClick={p.onTeleport} disabled={!connected} title={t("Переместить игрока к выделенным объектам")}>
              {t("К выделению")}
            </button>
            <span className="grow" />
            <button className="chip" onClick={() => p.onNoclip(true)} disabled={!connected} title={t("Полёт сквозь стены")}>
              noclip
            </button>
            <button className="chip" onClick={() => p.onNoclip(false)} disabled={!connected} title={t("Обычная ходьба")}>
              {t("Ходьба")}
            </button>
            <button className="chip" onClick={() => p.onHud(false)} disabled={!connected} title={t("Скрыть HUD")}>
              {t("Без HUD")}
            </button>
            <button className="chip" onClick={() => p.onHud(true)} disabled={!connected} title={t("Показать HUD")}>
              HUD
            </button>
          </Row>
        </Card>
      ) : null}
      {connected ? (
        <Card title={t("Консоль")} icon="menu">
          <Row>
            <input
              className="grow mono"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              placeholder="noclip, mat_fullbright 1, ent_fire door1 open…"
              disabled={!connected}
              spellCheck={false}
              onKeyDown={(e) => e.key === "Enter" && void runCmd()}
            />
            <button onClick={() => void runCmd()} disabled={!connected || !cmd.trim()}>
              {t("Выполнить")}
            </button>
          </Row>
          {consoleOut.length ? <pre className="gameview-console-out">{consoleOut.join("\n")}</pre> : null}
        </Card>
      ) : null}
      <Row wrap className="gameview-foot">
        <Status tone={connected ? "ok" : running ? "busy" : "muted"}>{connected ? t("подключено") : running ? t("запуск…") : t("не запущена")}</Status>
        <span className="grow" />
        <button className="btn-play" onClick={p.onRunGame} disabled={!p.inApp || !p.canCompile || running} title={t("Запустить Garry's Mod на собранной карте")}>
          <Icon name="play" /> {t("Запустить")}
        </button>
        <button onClick={p.onRunClean} disabled={!p.inApp || !p.canCompile || running} title={t("Запустить без аддонов Мастерской (-noworkshop)")}>
          {t("Без аддонов")}
        </button>
        <button onClick={p.onKillGame} disabled={!running} title={t("Закрыть игру")}>
          {t("Закрыть")}
        </button>
      </Row>
    </PanelFrame>
  );
}
