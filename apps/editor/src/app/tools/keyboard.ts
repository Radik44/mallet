// Keyboard: tools, undo/redo, save, grid, nudge, delete, block confirm.
// Moved out of App.tsx whole; returns the listener's cleanup.

import { SAT_ANY } from "../../ui/satellite";
import { comboFromEvent, effectiveHotkey } from "../../ui/hotkeys";
import { type ClipKeep } from "../../viewport/clipper";
import type { EditorApi } from "../editorApi";
import { t } from "../../i18n";

/** Codes of the keys held down right now, for letter modifiers such as V (vertex snapping) during a drag. */
export const heldKeys = new Set<string>();

export function installKeyboard(
  e: Pick<
    EditorApi,
    | "session"
    | "selection"
    | "activeView"
    | "toolRef"
    | "pendingBox"
    | "faceSel"
    | "clipLineRef"
    | "measureRef"
    | "setMeasure"
    | "clipKeepRef"
    | "setStatusText"
    | "setPaletteOpen"
    | "keymapRef"
    | "pickTargetRef"
    | "setPickingTarget"
    | "pickModelRef"
    | "setPickingModel"
    | "clearFaces"
    | "selectIds"
    | "setPendingBox"
    | "setClipKeep"
    | "setClipLine"
    | "commitTranslate"
    | "applyClip"
    | "createPendingBlock"
    | "redo"
    | "commandsRef"
  >,
): void | (() => void) {
  const {
    session,
    selection,
    activeView,
    toolRef,
    pendingBox,
    faceSel,
    clipLineRef,
    measureRef,
    setMeasure,
    clipKeepRef,
    setStatusText,
    setPaletteOpen,
    keymapRef,
    pickTargetRef,
    setPickingTarget,
    pickModelRef,
    setPickingModel,
    clearFaces,
    selectIds,
    setPendingBox,
    setClipKeep,
    setClipLine,
    commitTranslate,
    applyClip,
    createPendingBlock,
    redo,
    commandsRef,
  } = e;
  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || SAT_ANY) return;
    // Flying (middle button held): WASD with Shift for speed must not fire Shift+S and friends.
    if (session.current?.camera.isLooking()) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const combo = comboFromEvent(e);
    // Commands come first, with the person's own keys (see the settings panel).
    const clipKey = effectiveHotkey(keymapRef.current, "t-clip", "5");
    if (combo && combo === clipKey && toolRef.current === "clip" && clipLineRef.current) {
      // Hammer: the clipper's key cycles the kept side once a line exists.
      e.preventDefault();
      setClipKeep(((clipKeepRef.current + 1) % 3) as ClipKeep);
      return;
    }
    const command = combo ? commandsRef.current.find((c) => c.hotkey && c.hotkey === combo) : undefined;
    if (command) {
      e.preventDefault();
      if (!command.disabled) command.run();
      return;
    }
    if ((ctrl && e.code === "KeyP") || e.code === "F1") {
      e.preventDefault();
      setPaletteOpen((o) => !o);
    } else if (ctrl && e.code === "KeyZ" && e.shiftKey) {
      e.preventDefault();
      void redo();
    } else if (e.code === "Enter" && clipLineRef.current) {
      e.preventDefault();
      void applyClip();
    } else if (e.code === "Enter" && pendingBox.current) {
      e.preventDefault();
      void createPendingBlock();
    } else if (e.code === "Escape") {
      if (pickTargetRef.current) {
        pickTargetRef.current = null;
        setPickingTarget(null);
      } else if (pickModelRef.current) {
        pickModelRef.current = null;
        setPickingModel(null);
        setStatusText(t("выбор модели отменён"));
      } else if (pendingBox.current) setPendingBox(null);
      else if (measureRef.current) setMeasure(null);
      else if (clipLineRef.current) setClipLine(null);
      else if (faceSel.current.size) clearFaces();
      else if (selection.current.size) selectIds([]);
    } else if (e.code.startsWith("Arrow") && selection.current.size) {
      const view = activeView.current;
      if (!view) return;
      e.preventDefault();
      const g = view.gridSize;
      const d: [number, number] = e.code === "ArrowLeft" ? [-g, 0] : e.code === "ArrowRight" ? [g, 0] : e.code === "ArrowUp" ? [0, g] : [0, -g];
      void commitTranslate(selection.current, view.toWorld3(d));
    }
  };
  const onDown = (ev: KeyboardEvent) => heldKeys.add(ev.code);
  const onUp = (ev: KeyboardEvent) => heldKeys.delete(ev.code);
  const onBlur = () => heldKeys.clear();
  window.addEventListener("keydown", onKey);
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keydown", onDown);
    window.removeEventListener("keyup", onUp);
    window.removeEventListener("blur", onBlur);
    heldKeys.clear();
  };
}
