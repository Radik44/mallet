// First run: a few short pages. The first is the language, in every
// language's own name, before a word of anything else; then, once, the
// author's letter; then the welcome page shows whether the game was found and
// lets the person pick a theme; the last asks whether they know Hammer and
// hands over to the fitting lesson. The licence and the optional Claude Code
// are the installer's business (src-tauri/installer). Everything else (scale,
// keys, hints) lives in the settings. Comes back from «Помощь → Первоначальная
// настройка».

import { useEffect, useState } from "react";
import { api, type ContentStatus } from "../tauri";
import { LICENSE_URL, PATREON_URL, SITE_URL } from "../app/links";
import type { Theme } from "./SettingsPanel";
import { Segmented, Status } from "./kit";
import { LANGUAGES, currentLocale, setLocale, t as tr } from "../i18n";

export type Experience = "novice" | "hammer" | "skip";

/** The author's letter is read once; after that the wizard goes straight on. */
const LETTER_SEEN_KEY = "gme.authorLetterSeen";
/** Seconds before the letter's "Next" opens, the first time. */
const LETTER_WAIT = 10;
type PageKind = "language" | "letter" | "welcome" | "experience";

function pagesFor(letter: boolean): PageKind[] {
  return letter ? ["language", "letter", "welcome", "experience"] : ["language", "welcome", "experience"];
}

function seen(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode */
  }
}

interface Props {
  theme: Theme;
  onTheme(t: Theme): void;
  /** Id of the active hotkey preset; "Да, знаю Hammer" switches it to Hammer's keys. */
  keymapPreset: string;
  onKeymapPreset(id: string): void;
  content: ContentStatus | null;
  inTauri: boolean;
  onDone(choice: Experience): void;
}

export function Onboarding(p: Props) {
  const [letter, setLetter] = useState(() => !seen(LETTER_SEEN_KEY));
  // The first reading waits out the countdown; opened again from the welcome page it does not.
  const [mustWait] = useState(letter);
  const kinds = pagesFor(letter);
  const [page, setPage] = useState(0);
  const kind = kinds[Math.min(page, kinds.length - 1)];
  const [wait, setWait] = useState(LETTER_WAIT);
  const waiting = kind === "letter" && mustWait && wait > 0;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setWait((w) => w - 1), 1000);
    return () => clearInterval(t);
  }, [waiting]);
  const next = () => {
    if (kind === "letter") markSeen(LETTER_SEEN_KEY);
    setPage(page + 1);
  };
  const game: { tone: "ok" | "bad" | "busy" | "muted"; text: string } = !p.inTauri
    ? { tone: "muted", text: tr("В браузере контент игры недоступен; приложение загружает текстуры и модели из Garry's Mod.") }
    : !p.content || p.content.state === "loading"
      ? { tone: "busy", text: tr("Поиск Garry's Mod в Steam и загрузка контента…") }
      : p.content.state === "ready"
        ? { tone: "ok", text: tr("Garry's Mod найден, файлов контента: {0}.", [p.content.files]) }
        : {
            tone: "bad",
            text: tr("Garry's Mod не найден{0}. Редактор будет работать без текстур и моделей игры. Установите игру через Steam и перезапустите редактор.", [
              p.content.message ? `: ${p.content.message}` : "",
            ]),
          };
  return (
    <div className="palette-backdrop dialog-backdrop">
      <div className="dialog onboarding" role="dialog" aria-modal="true">
        {kind === "language" ? (
          <>
            <h2>{tr("Выберите язык")}</h2>
            <p className="muted">Language · Sprache · Langue · Idioma · Język · Dil · Мова · 语言 · 言語</p>
            <div className="onboarding-languages">
              {LANGUAGES.map((l) => (
                <button key={l.code} className={`onboarding-lang${currentLocale() === l.code ? " primary" : ""}`} lang={l.code} onClick={() => void setLocale(l.code)}>
                  {l.name}
                </button>
              ))}
            </div>
            <p className="muted small">{tr("Язык можно сменить позже в настройках.")}</p>
          </>
        ) : kind === "letter" ? (
          <>
            <h2>{tr("Обращение автора")}</h2>
            <div className="onboarding-letter">
              <p>
                {tr(
                  "Благодарю вас за то, что установили Mallet. Это редактор карт для Garry's Mod и других игр на движке Source - полностью бесплатный, без подписок и ограничений. Перед вами демонстрационная версия 0.1: она ещё сырая, в ней есть ошибки и недоделки, и выходит она именно для того, чтобы её проверили в деле.",
                )}
              </p>
              <div className="onboarding-links">
                <div className="onboarding-link-row">
                  <span className="onboarding-link-label">Patreon</span>
                  <button className="link" onClick={() => void api.openUrl(PATREON_URL).catch(() => undefined)} title={tr("Открыть в браузере")}>
                    patreon.com/mallet_official
                  </button>
                </div>
                <div className="onboarding-link-row">
                  <span className="onboarding-link-label">{tr("Сайт и загрузка")}</span>
                  {SITE_URL ? (
                    <button className="link" onClick={() => void api.openUrl(SITE_URL).catch(() => undefined)} title={tr("Открыть в браузере")}>
                      {SITE_URL.replace(/^https?:\/\//, "")}
                    </button>
                  ) : (
                    <span className="muted">{tr("скоро")}</span>
                  )}
                </div>
              </div>
              <h4>{tr("Почему Mallet")}</h4>
              <p>
                {tr(
                  "Я много лет работал в Hammer и хорошо знаю, за что его не любят: падения без автосохранения, одна отмена на всё, поиск текстур без предпросмотра, непонятные ошибки сборки, утечки, на которые уходят часы, и интерфейс, не менявшийся с двухтысячных. Mallet - попытка сделать редактор, каким я хотел бы пользоваться сам: тот же VMF и те же компиляторы, но современный интерфейс в духе Unity и Unreal, четыре вида с докингом, инспектор, понятные ошибки с кнопкой «исправить», встроенный ассистент, живая связь с игрой и десять языков.",
                )}
              </p>
              <p>
                {tr(
                  "Разработку я веду один. Я не профессиональный разработчик, и некоторые части проекта сделаны с помощью ИИ-инструментов - поэтому буду особенно признателен за внимательный взгляд со стороны: за найденные ошибки, замечания к удобству и предложения.",
                )}
              </p>
              <h4>{tr("Как помочь")}</h4>
              <p>
                {tr(
                  "Если вы разработчик, любая помощь - код, ревью, идеи - будет принята с благодарностью. Если вы картодел, пожалуйста, испытайте редактор на своих картах и напишите обо всём, что заметите. И если программа вам понравится, расскажите о ней знакомым: для проекта, который делает один человек, это значит очень много.",
                )}
              </p>
              <h4>{tr("Поддержка проекта")}</h4>
              <p>
                {tr(
                  "Проект живёт на поддержке сообщества. Если у вас есть желание и возможность поддержать его, это можно сделать на Patreon - там же выходят ранние сборки и новости разработки. Если вам удобнее поддержать напрямую, напишите мне в личные сообщения: пришлю реквизиты или приму подарок в Steam обменом. Любая сумма и любое доброе слово - это время, которое я смогу посвятить Mallet.",
                )}
              </p>
              <p>{tr("Спасибо, что дочитали, и спасибо, что дали программе шанс. Посмотрим, что из этого выйдет.")}</p>
              <p className="onboarding-sign">{tr("С уважением, Radik")}</p>
            </div>
            {waiting ? <p className="muted small">{tr("Письмо показывается один раз; кнопка «Далее» откроется через несколько секунд.")}</p> : null}
          </>
        ) : kind === "welcome" ? (
          <>
            <h2>{tr("Добро пожаловать в Mallet")}</h2>
            <p>{tr("Редактор карт для Garry's Mod на замену Hammer: тот же формат VMF и те же инструменты сборки, интерфейс - как в современных движках.")}</p>
            <div className="onboarding-game">
              <Status tone={game.tone}>{game.text}</Status>
            </div>
            <div className="onboarding-theme">
              <span className="muted">{tr("Тема")}</span>
              <Segmented<Theme>
                value={p.theme}
                onChange={p.onTheme}
                options={[
                  { value: "dark", label: tr("Тёмная") },
                  { value: "light", label: tr("Светлая") },
                  { value: "system", label: tr("Как в системе") },
                ]}
              />
            </div>
            <p className="muted small">{tr("Масштаб интерфейса, клавиши и подсказки можно изменить позже в настройках (значок шестерёнки внизу слева).")}</p>
            <div className="onboarding-footlinks">
              <button
                className="link onboarding-letter-link"
                onClick={() => {
                  setLetter(true);
                  setPage(1);
                }}
              >
                {tr("Письмо автора")}
              </button>
              <button className="link onboarding-letter-link" onClick={() => void api.openUrl(LICENSE_URL).catch(() => undefined)} title={tr("Открыть в браузере")}>
                {tr("Пользовательское соглашение")}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{tr("Есть ли у вас опыт работы в Hammer?")}</h2>
            <p className="muted">{tr("Для новых пользователей - полное обучение, для пользователей Hammer - обзор отличий и раскладка клавиш Hammer.")}</p>
            <div className="onboarding-choices">
              <button className="primary" onClick={() => p.onDone("novice")}>
                <strong>{tr("Нет, опыта нет")}</strong>
                <span className="small">{tr("Пошаговое обучение: окно, камера, инструменты, сборка и запуск. Около 15 минут.")}</span>
              </button>
              <button
                onClick={() => {
                  p.onKeymapPreset("hammer");
                  p.onDone("hammer");
                }}
              >
                <strong>{tr("Да, есть опыт")}</strong>
                <span className="muted small">{tr("Краткий обзор отличий: клавиши, камера, панели, гизмо, связь с игрой.")}</span>
              </button>
              <button onClick={() => p.onDone("skip")}>
                <strong>{tr("Начать без обучения")}</strong>
                <span className="muted small">{tr("Обучение доступно в меню «Справка».")}</span>
              </button>
            </div>
          </>
        )}
        <div className="dialog-buttons">
          {page > 0 && <button onClick={() => setPage(page - 1)}>{tr("Назад")}</button>}
          <span className="grow" />
          {kind !== "experience" ? (
            <>
              {kind === "welcome" ? (
                <button className="link" onClick={() => p.onDone("skip")} title={tr("Закрыть. Настройки и обучение доступны позже в меню «Справка»")}>
                  {tr("Пропустить")}
                </button>
              ) : null}
              <button className="primary" autoFocus disabled={waiting} onClick={next}>
                {waiting ? tr("Далее ({0})", [wait]) : tr("Далее")}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
