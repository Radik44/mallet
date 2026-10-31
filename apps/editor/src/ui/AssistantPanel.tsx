// The assistant's panel: a view over `assistantStore`. The conversation,
// the step cards and a running turn live in the store, so this can mount
// and unmount freely. Replies render as Markdown; every tool call is a card
// with a live status; questions from tools are cards with Yes and No.

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./Icon";
import { Markdown } from "./markdown";
import { MODELS } from "../app/assistant";
import { TOOL_TITLES, assistantStore, describeInput, useAssistant, viaOf, type ChatItem, type ToolStep } from "../app/assistantStore";
import { api } from "../tauri";
import { t as tr, tb, lazy } from "../i18n";

interface Props {
  onSetKey(key: string): Promise<void>;
  onClearKey(): Promise<void>;
}

const CAT_ICONS: Record<string, IconName> = { read: "eye", edit: "edit", build: "build", game: "play", file: "file", ui: "menu" };

const SUGGESTIONS = lazy(() => [
  { title: tr("Комната со светом"), text: tr("Сделай комнату 512 на 768 с высотой 192, dev-текстуры, лампа под потолком и старт игрока.") },
  { title: tr("Дверь по кнопке"), text: tr("Привяжи выделенный браш к func_door, поставь рядом func_button и сделай, чтобы кнопка открывала дверь.") },
  { title: tr("Проверить и собрать"), text: tr("Проверь карту на проблемы, исправь их, собери и расскажи, что было в логе.") },
  { title: tr("Lua: свет по кнопке"), text: tr("Напиши Lua для карты: при нажатии кнопки с targetname light_btn включить все лампы с targetname room_light.") },
]);

export function AssistantPanel(p: Props) {
  const s = useAssistant();
  const [draft, setDraft] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [settings, setSettings] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [, tick] = useState(0);
  const logEl = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const via = viaOf(s);
  const hasKey = !!s.keyStatus?.present;
  const hasCli = !!s.keyStatus?.cli;

  // Follow the log while the user has not scrolled up.
  useEffect(() => {
    const el = logEl.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  });
  // The status row's timer.
  useEffect(() => {
    if (!s.busy) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [s.busy]);

  const send = () => {
    const t = draft;
    setDraft("");
    void assistantStore.send(t);
  };
  const saveKey = async () => {
    const k = keyDraft.trim();
    if (!k) return;
    try {
      await p.onSetKey(k);
      setKeyDraft("");
      assistantStore.note(tr("Ключ сохранён в хранилище учётных данных Windows и не передаётся в окно редактора."));
    } catch (err) {
      assistantStore.note(tb(String(err)));
    }
  };

  const viaTitle = via === "cli" ? tr("Claude Code · подписка") : via === "api" ? tr("API · ключ") : tr("демо-режим без модели");
  /** Anthropic's native installer, run by the shell: no Node.js, no terminal. */
  const installCli = async () => {
    setInstalling(true);
    assistantStore.note(tr("Устанавливается Claude Code (официальный установщик, около минуты)…"));
    try {
      const status = await api.assistantInstallCli();
      assistantStore.setKeyStatus(status);
      assistantStore.note(
        status.cli ? tr("Claude Code установлен: {0}. Теперь войдите в аккаунт кнопкой «Войти».", [status.cli]) : tr("Claude Code установлен, но не найден; перезапустите редактор."),
      );
    } catch (err) {
      assistantStore.note(tr("Не удалось установить Claude Code: {0}", [tb(String(err))]));
    } finally {
      setInstalling(false);
    }
  };
  const loginCli = async () => {
    try {
      await api.assistantLoginCli();
      assistantStore.note(tr("Открылось окно Claude Code: войдите в аккаунт Claude там, после этого ассистент заработает по подписке."));
    } catch (err) {
      assistantStore.note(tb(String(err)));
    }
  };
  const modelTitle = MODELS.find((m) => m.id === s.model)?.title.split(" - ")[0] ?? s.model;
  const elapsed = Math.round((Date.now() - s.phaseSince) / 1000);

  return (
    <aside className="panel asst">
      <header className="asst-head">
        <div className="asst-avatar" aria-hidden>
          ✦
        </div>
        <div className="asst-head-text">
          <strong>{tr("Ассистент")}</strong>
          <span
            className="asst-sub"
            title={
              via === "cli"
                ? `Claude Code: ${s.keyStatus?.cli}`
                : via === "api"
                  ? tr("Messages API по ключу из хранилища")
                  : tr("Ключ и Claude Code не найдены: встроенный демо-режим строит тестовую комнату")
            }
          >
            {viaTitle} · {modelTitle}
            {s.tokens.input + s.tokens.output ? tr(" · {0} токенов", [fmtTokens(s.tokens.input + s.tokens.output)]) : ""}
            {s.cost > 0 ? ` · ≈ $${s.cost < 0.01 ? "0.01" : s.cost.toFixed(2)}` : ""}
          </span>
        </div>
        <button
          className="icon-btn"
          onClick={() => void assistantStore.undoTurn()}
          disabled={s.busy || !s.lastEdits}
          title={s.lastEdits ? tr("Отменить правки последнего ответа ({0})", [s.lastEdits]) : tr("Нет правок для отмены")}
        >
          <Icon name="undo" />
        </button>
        <button className="icon-btn" onClick={() => assistantStore.clear()} disabled={s.busy || !s.items.length} title={tr("Начать новый диалог")}>
          <Icon name="trash" />
        </button>
        <button className={`icon-btn${settings ? " active" : ""}`} onClick={() => setSettings(!settings)} title={tr("Подключение: ключ, Claude Code, модель")}>
          <Icon name="settings" />
        </button>
      </header>
      {!settings && via === "demo" && s.items.length === 0 ? (
        <div className="asst-demo-bar">
          <span className="muted">{tr("Демо-режим: Claude Code и API-ключ не найдены.")}</span>
          <button className="link" onClick={() => setSettings(true)}>
            {tr("Подключить")}
          </button>
        </div>
      ) : null}
      {settings ? (
        <div className="asst-settings">
          <div className="asst-row">
            <span className="asst-label">{tr("Подключение")}</span>
            <div className="asst-chips">
              <button
                className={`chip${via === "cli" ? " on" : ""}`}
                disabled={!hasCli}
                onClick={() => assistantStore.setBackend("cli")}
                title={hasCli ? tr("Claude Code найден: {0}", [s.keyStatus?.cli]) : tr("Claude Code не найден: установите его кнопкой ниже - без Node.js, в одно нажатие")}
              >
                Claude Code {hasCli ? "✓" : "-"}
              </button>
              <button
                className={`chip${via === "api" ? " on" : ""}`}
                disabled={!hasKey}
                onClick={() => assistantStore.setBackend("api")}
                title={hasKey ? tr("Ключ …{0}", [s.keyStatus?.hint]) : tr("Ключ не задан: введите его ниже")}
              >
                API {hasKey ? "✓" : "-"}
              </button>
              <button className={`chip${s.backend === "auto" ? " on" : ""}`} onClick={() => assistantStore.setBackend("auto")} title={tr("Сначала Claude Code, при его отсутствии - API-ключ")}>
                {tr("Авто")}
              </button>
            </div>
          </div>
          <div className="asst-row">
            <span className="asst-label">Claude Code</span>
            {hasCli ? (
              <>
                <span className="muted grow">{s.keyStatus?.cli}</span>
                <button onClick={() => void loginCli()} title={tr("Откроется окно Claude Code для входа в аккаунт Claude")}>
                  {tr("Войти")}
                </button>
              </>
            ) : (
              <>
                <span className="muted grow">{tr("Не установлен")}</span>
                <button className="primary" onClick={() => void installCli()} disabled={!s.inApp || installing} title={tr("Официальный установщик Anthropic: без Node.js и терминала, около минуты")}>
                  {installing ? tr("Установка…") : tr("Установить Claude Code (для ассистента)")}
                </button>
              </>
            )}
          </div>
          <div className="asst-row">
            <span className="asst-label">{tr("Ключ")}</span>
            {hasKey ? (
              <>
                <span className="muted grow">
                  …{s.keyStatus?.hint} ({s.keyStatus?.source === "env" ? "ANTHROPIC_API_KEY" : tr("в хранилище Windows")})
                </span>
                {s.keyStatus?.source === "store" ? (
                  <button className="link" onClick={() => void p.onClearKey()}>
                    {tr("Удалить")}
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <input
                  className="grow"
                  type="password"
                  placeholder={s.inApp ? "sk-ant-… (console.anthropic.com)" : tr("ключ задаётся только в приложении")}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  disabled={!s.inApp}
                  spellCheck={false}
                  onKeyDown={(e) => e.key === "Enter" && void saveKey()}
                />
                <button onClick={() => void saveKey()} disabled={!s.inApp || !keyDraft.trim()}>
                  {tr("Сохранить")}
                </button>
              </>
            )}
          </div>
          <div className="asst-row">
            <span className="asst-label">{tr("Модель")}</span>
            <div className="asst-chips">
              {MODELS.map((m) => (
                <button key={m.id} className={`chip${s.model === m.id ? " on" : ""}`} onClick={() => assistantStore.setModel(m.id)} disabled={s.busy} title={m.title}>
                  {m.title.split(" - ")[0]}
                </button>
              ))}
            </div>
          </div>
          <div className="asst-row">
            <label className="muted" title={tr("Запрашивать подтверждение перед записью файлов, сборкой и запуском игры; если выключено, ассистент выполняет эти действия без подтверждения")}>
              <input type="checkbox" checked={s.ask} onChange={(e) => assistantStore.setAsk(e.target.checked)} /> {tr("Подтверждать запись, сборку и запуск")}
            </label>
          </div>
          {via === "demo" ? (
            <div className="asst-demo-note">
              {tr(
                "Без Claude Code и API-ключа работает демо-режим: он строит комнату с лампой и точкой старта, чтобы показать, как выглядит ход ассистента. Для работы по подписке Claude нужна программа Claude Code: её ставит установщик Mallet (галочка «Ассистент: Claude Code») или кнопка ниже; затем нажмите «Войти».",
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        className="asst-log"
        ref={logEl}
        onScroll={(e) => {
          const el = e.currentTarget;
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {s.items.length === 0 ? (
          <div className="asst-welcome">
            <div className="asst-welcome-title">{tr("Что сделать с картой?")}</div>
            <div className="asst-welcome-text">
              {tr(
                "Ассистент видит карту, сборку, проблемы, консоль игры и файлы проекта. Он правит карту инструментами редактора шаг за шагом - каждый шаг виден карточкой, и к состоянию до любого шага можно вернуться. Ваши панели и камеру он не трогает; запись файлов, сборка и запуск требуют подтверждения.",
              )}
            </div>
            <div className="asst-suggest">
              {SUGGESTIONS.map((x) => (
                <button key={x.title} className="asst-suggest-btn" onClick={() => void assistantStore.send(x.text)} disabled={!s.mapOpen || s.busy} title={x.text}>
                  {x.title}
                </button>
              ))}
            </div>
            {!s.mapOpen ? <div className="muted">{tr("Сначала откройте или создайте карту.")}</div> : null}
          </div>
        ) : null}
        {s.items.map((it) => (
          <Item key={it.id} item={it} />
        ))}
        {s.question ? (
          <div className="asst-question">
            <div className="asst-question-title">
              <Icon name="bug" /> {s.question.title}
            </div>
            <pre className="asst-diff">{renderDiff(s.question.body)}</pre>
            <div className="asst-question-actions">
              <button className="primary" onClick={() => assistantStore.answer(true)}>
                {tr("Да, выполнить")}
              </button>
              <button onClick={() => assistantStore.answer(false)}>{tr("Нет")}</button>
            </div>
          </div>
        ) : null}
        {s.busy && !s.question ? (
          <div className="asst-status">
            <span className="asst-pulse" />
            {s.phase === "tool" && s.currentTool ? `${TOOL_TITLES[s.currentTool]?.title ?? s.currentTool}…` : s.phase === "typing" ? tr("печатает…") : tr("обработка запроса…")}
            {elapsed >= 3 ? (
              <span className="muted">
                {" "}
                {elapsed} {tr("с")}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <footer className="asst-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={s.mapOpen ? tr("Опишите задачу: комната, дверь по кнопке, Lua… Enter - отправить") : tr("Откройте карту, чтобы начать")}
          rows={2}
          disabled={!s.mapOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
            e.stopPropagation();
          }}
          onKeyUp={(e) => e.stopPropagation()}
        />
        {s.busy ? (
          <>
            <button className="asst-send" onClick={send} disabled={!draft.trim()} title={tr("Поставить в очередь: пойдёт после текущего ответа (Enter)")}>
              <Icon name="play" />
            </button>
            <button className="asst-send stop" onClick={() => assistantStore.stop()} title={tr("Остановить после текущего шага")}>
              <Icon name="close" /> {tr("Стоп")}
            </button>
          </>
        ) : (
          <button className="asst-send" onClick={send} disabled={!draft.trim() || !s.mapOpen} title={tr("Отправить (Enter)")}>
            <Icon name="play" />
          </button>
        )}
      </footer>
    </aside>
  );
}

function Item({ item }: { item: ChatItem }) {
  if (item.kind === "user") return <div className="asst-msg user">{item.text}</div>;
  if (item.kind === "assistant")
    return (
      <div className={`asst-msg assistant${item.live ? " live" : ""}`}>
        <Markdown text={item.text} />
        {item.live ? <span className="asst-caret" /> : null}
      </div>
    );
  if (item.kind === "note") return <div className="asst-note">{item.text}</div>;
  if (item.kind === "error") return <div className="asst-error">{item.text}</div>;
  return (
    <div className="asst-steps">
      {item.steps.map((st) => (
        <Step key={st.id} step={st} />
      ))}
    </div>
  );
}

function Step({ step }: { step: ToolStep }) {
  const [open, setOpen] = useState(false);
  const meta = TOOL_TITLES[step.name] ?? { title: step.name, cat: "read" as const };
  const detail = step.status === "pending" ? "" : describeInput(step.name, step.input);
  const busy = step.status === "pending" || step.status === "running";
  const canShow = !busy && !!step.ids?.length;
  const canRevert = step.status === "ok" && step.edited && step.depth !== undefined;
  const outcome = step.status === "ok" ? outcomeOf(step) : "";
  return (
    <div className={`asst-step ${step.status}`}>
      <div className="asst-step-row">
        <button className="asst-step-head" onClick={() => setOpen(!open)} disabled={busy} title={busy ? "" : open ? tr("Свернуть результат") : tr("Показать результат")}>
          <span className={`asst-step-icon ${meta.cat}`}>{busy ? <span className="asst-spinner" /> : <Icon name={step.status === "error" ? "bug" : CAT_ICONS[meta.cat]} size={12} />}</span>
          <span className="asst-step-title">
            {meta.title}
            {step.status === "pending" ? "…" : ""}
          </span>
          {detail ? <span className="asst-step-detail">{detail}</span> : null}
          {outcome ? (
            <span className="asst-step-out" title={step.result}>
              {outcome}
            </span>
          ) : null}
          <span className="asst-step-meta">
            {step.edited ? <span className="asst-badge">{tr("правка")}</span> : null}
            {!busy && step.ms >= 1500 ? tr("{0} с", [(step.ms / 1000).toFixed(step.ms >= 10000 ? 0 : 1)]) : ""}
          </span>
        </button>
        {canShow || canRevert ? (
          <span className="asst-step-actions">
            {canShow ? (
              <button className="icon-btn" onClick={() => assistantStore.show(step)} title={tr("Показать объекты этого шага в видах")}>
                <Icon name="focus" size={12} />
              </button>
            ) : null}
            {canRevert ? (
              <button className="icon-btn" onClick={() => void assistantStore.revertTo(step)} title={tr("Вернуть карту к состоянию до этого шага (как история в графическом редакторе)")}>
                <Icon name="undo" size={12} />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
      {open && !busy ? <pre className="asst-step-result">{step.result || tr("(пусто)")}</pre> : null}
    </div>
  );
}

/** What a finished step shows on its card: the ids it touched, else the first line of its result. */
function outcomeOf(step: ToolStep): string {
  if (step.ids?.length) return `id ${step.ids.slice(0, 4).join(", ")}${step.ids.length > 4 ? "…" : ""}`;
  const line = step.result.split("\n")[0].trim();
  return line.length > 44 ? `${line.slice(0, 43)}…` : line;
}

/** A diff with coloured lines for a confirmation card. */
function renderDiff(text: string) {
  return text.split("\n").map((l, i) => (
    <span key={i} className={l.startsWith("+") ? "diff-add" : l.startsWith("-") ? "diff-del" : l === "…" ? "diff-skip" : ""}>
      {l}
      {"\n"}
    </span>
  ));
}

function fmtTokens(n: number): string {
  return n >= 1000 ? tr("{0}к", [(n / 1000).toFixed(1)]) : String(n);
}
