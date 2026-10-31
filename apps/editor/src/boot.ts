// The boot banner from index.html: painted before any script runs, updated
// while the dictionary and the editor load, faded out after the editor's
// first frame. The native window stays hidden until the banner is painted,
// so there is no white flash before it.

import { getCurrentWindow } from "@tauri-apps/api/window";

const inTauri = "__TAURI_INTERNALS__" in window;

/** Shows the (hidden) window once the banner has painted. */
export function revealWindow(): void {
  if (!inTauri) return;
  requestAnimationFrame(() => {
    void getCurrentWindow()
      .show()
      .catch(() => undefined);
  });
}

export function bootStatus(text: string): void {
  const el = document.getElementById("boot-status");
  if (el) el.textContent = text;
}

export function bootTagline(text: string): void {
  const el = document.getElementById("boot-tag");
  if (el) el.textContent = text;
}

export function bootVersion(version: string): void {
  const el = document.getElementById("boot-version");
  if (el) el.textContent = version ? `v${version}` : "";
}

/** Fades the banner out and removes it. */
export function bootDone(): void {
  const el = document.getElementById("boot");
  if (!el) return;
  el.classList.add("gone");
  window.setTimeout(() => el.remove(), 450);
}
