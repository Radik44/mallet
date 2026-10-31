// Entity class field with its own completion list: type part of a class
// name and pick from the matches (class and its FGD description), instead
// of the browser's bare datalist popup.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ClassEntry } from "../tauri";
import { zoomed } from "../viewport/dpi";
import { ruClassDescription } from "./ru";

interface Props {
  value: string;
  onChange(value: string): void;
  classes: ClassEntry[];
  onFocus?(): void;
  title?: string;
  placeholder?: string;
  width?: number;
}

const MAX = 14;

export function ClassPicker({ value, onChange, classes, onFocus, title, placeholder, width = 180 }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 0 });
  const q = (query ?? value).trim().toLowerCase();
  const matches = (q ? classes.filter((c) => c.classname.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)) : classes).slice(0, MAX);

  useLayoutEffect(() => {
    if (!open || !input.current) return;
    const r = input.current.getBoundingClientRect();
    const width = Math.max(zoomed(r.width), 320);
    setPos({ left: Math.max(4, Math.min(zoomed(r.left), zoomed(window.innerWidth) - width - 8)), top: zoomed(r.bottom) + 2, width });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (e.target !== input.current && !(e.target as Element).closest?.(".class-picker-menu")) setOpen(false);
    };
    window.addEventListener("mousedown", away);
    return () => window.removeEventListener("mousedown", away);
  }, [open]);

  const commit = (v: string) => {
    onChange(v);
    setQuery(null);
    setOpen(false);
  };

  return (
    <>
      <input
        ref={input}
        className="class-picker"
        value={query ?? value}
        placeholder={placeholder}
        title={title}
        spellCheck={false}
        style={{ width }}
        onFocus={() => {
          onFocus?.();
          setOpen(true);
          setCursor(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setCursor(0);
        }}
        onBlur={() => {
          if (query !== null && query.trim()) onChange(query.trim());
          setQuery(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setCursor((c) => Math.min(matches.length - 1, c + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(0, c - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && matches[cursor]) commit(matches[cursor].classname);
            else if (query !== null) commit(query.trim());
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setQuery(null);
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <div className="menu-list class-picker-menu" style={{ left: pos.left, top: pos.top, minWidth: pos.width }}>
          {matches.map((c, i) => (
            <button key={c.classname} type="button" className={`menu-item${i === cursor ? " cursor" : ""}`} onMouseEnter={() => setCursor(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(c.classname)}>
              <span className="class-name">{c.classname}</span>
              {c.description && <span className="muted class-desc">{ruClassDescription(c.classname, c.description)}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
