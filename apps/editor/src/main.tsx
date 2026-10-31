import React from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { installCursors } from "./ui/cursors";
import { initLocale, t } from "./i18n";
import { api } from "./tauri";
import { bootStatus, bootTagline, bootVersion, revealWindow } from "./boot";

installCursors();
// An editor window, not a web page: the browser's own context menu (Back, Reload, Print…)
// never shows. Views and panels bring their own menus; text fields keep the native one.
document.addEventListener("contextmenu", (e) => {
  const target = e.target as HTMLElement | null;
  if (target?.closest("input, textarea, [contenteditable='true']")) return;
  e.preventDefault();
});
// The window is hidden until the boot banner (index.html) has painted: no white flash.
revealWindow();
bootVersion(__APP_VERSION__);
// The language first, then the editor: module-scope texts read the dictionary when they are evaluated.
// An installed copy starts in the installer's language until a choice is saved.
void initLocale(() => api.installerLanguage()).then(async () => {
  bootTagline(t("Редактор карт Source для Garry's Mod"));
  bootStatus(t("Подготовка редактора…"));
  const { App } = await import("./App");
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
