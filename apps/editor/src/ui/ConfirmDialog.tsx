// A small modal question with two or three answers, for the moments a
// mistake would cost work: unsaved changes before opening another map or
// closing the window. Esc picks the last (cancel) answer.

import { useEffect, useState } from "react";

export interface DialogButton {
  label: string;
  kind?: "primary" | "danger";
  value: string;
}

export interface DialogSpec {
  title: string;
  text: string;
  buttons: DialogButton[];
  /** A text field; the button with value "=" answers "=" followed by what was typed, Enter does the same. */
  input?: { value: string; placeholder?: string };
}

interface Props {
  spec: DialogSpec;
  onAnswer(value: string): void;
}

export function ConfirmDialog({ spec, onAnswer }: Props) {
  const [text, setText] = useState(spec.input?.value ?? "");
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onAnswer(spec.buttons[spec.buttons.length - 1].value);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [spec, onAnswer]);
  return (
    <div className="palette-backdrop dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true">
        <h2>{spec.title}</h2>
        <p>{spec.text}</p>
        {spec.input && (
          <input
            className="dialog-input"
            autoFocus
            value={text}
            placeholder={spec.input.placeholder}
            spellCheck={false}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") onAnswer(`=${text}`);
            }}
          />
        )}
        <div className="dialog-buttons">
          {spec.buttons.map((b) => (
            <button key={b.value} className={b.kind ?? ""} onClick={() => onAnswer(b.value === "=" ? `=${text}` : b.value)} autoFocus={b.kind === "primary" && !spec.input}>
              {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
