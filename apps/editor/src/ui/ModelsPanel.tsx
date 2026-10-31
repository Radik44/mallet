// Model browser: every .mdl the game and the project expose, filtered by
// path words. Clicking a row makes it the current model for props placed
// with the entity tool; "Поставить" drops a prop_static in front of the
// camera right away.

import { loadRecent, pushRecent, storeRecent } from "../app/recent";
import { loadFavorites, toggleFavorite } from "../app/favorites";
import { classesOf, type PropClass } from "../app/propClass";
import { onBrowse } from "../app/browse";
import { useEffect, useRef, useState } from "react";
import { api, type FolderEntry } from "../tauri";
import { Select } from "./Select";
import { LIST, TILE, useAutoMore, useListZoom } from "./lists";
import { filterInFolder, folderPrefix, parentFolder } from "./folders";
import type { DragAsset } from "./assetDrag";
import { Icon } from "./Icon";
import { ViewSwitch, splitPath, useBrowserView } from "./browserView";
import { Card, Empty, PanelFrame, Row } from "./kit";
import { t as tr } from "../i18n";

interface Props {
  current: string;
  contentReady: boolean;
  /** PNG data URL of the current model, or null while it renders. */
  preview: string | null;
  previewInfo: string;
  onPick(model: string): void;
  onPlace(model: string): void;
  onDragAsset?: DragAsset;
  /** Turns the preview camera by degrees. */
  onRotate?(dYaw: number, dPitch: number): void;
  /** Small rendered pictures by model name, for the icons view. */
  thumbs?: Map<string, string>;
  /** A tile scrolled into view and has no picture yet. */
  onNeedThumb?(name: string): void;
  /** Models of the map's props, for the «@» filter. */
  mapModels?: string[];
  /** Selects the props on the map with the current model (Unreal's Select Actors Using This Asset). */
  onSelectUsers?(): void;
}

const PAGE = 200;
const FAV_KEY = "gme.favModels";
const HINT = () => tr("Щелчок - выбрать: превью модели следует за курсором в 3D-виде. Двойной щелчок ставит модель перед камерой, перетаскивание в вид - в указанную точку");

export function ModelsPanel({ current, contentReady, preview, previewInfo, onPick, onPlace, onDragAsset, onRotate, thumbs, onNeedThumb, mapModels, onSelectUsers }: Props) {
  const [filter, setFilter] = useState("props_c17/");
  /** The last models made current, newest first (Unreal's recent assets). */
  const [recent, setRecent] = useState<string[]>(() => loadRecent("gme.recentModels"));
  useEffect(() => {
    if (!current) return;
    setRecent((list) => {
      const next = pushRecent(list, current);
      storeRecent("gme.recentModels", next);
      return next;
    });
  }, [current]);
  useEffect(() => {
    for (const m of recent) if (!thumbs?.has(m)) onNeedThumb?.(m);
  }, [recent, thumbs, onNeedThumb]);
  /** Starred models (Unreal's favourites); «*» in the filter lists them. */
  const [favs, setFavs] = useState<Set<string>>(() => loadFavorites(FAV_KEY));
  const toggleFav = (name: string) => setFavs(toggleFavorite(FAV_KEY, favs, name));
  // «Find in library» from a selected prop sets the filter to its model.
  useEffect(() => onBrowse("model", (name) => setFilter(name)), []);
  const showFavs = filter.trim() === "*";
  // «@» lists the models already on the map; words after it narrow them down.
  const showUsed = filter.trim().startsWith("@");
  const usedWords = filter.trim().slice(1).toLowerCase().split(/\s+/).filter(Boolean);
  const used = showUsed ? [...new Set(mapModels ?? [])].filter((m) => usedWords.every((w) => m.toLowerCase().includes(w))).sort() : [];
  const [names, setNames] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [sort, setSort] = useState<"path" | "name">("path");
  const [desc, setDesc] = useState(false);
  const request = useRef(0);
  const zoom = useListZoom(LIST.key, LIST.fallback, LIST.min, LIST.max, LIST.step);
  const [view, setView] = useBrowserView("gme.modelView", "icons", ["icons", "list"]);
  // The folder column (Unity's project browser), relative to models/: shown by the stylesheet only when
  // the panel is wide, as in the bottom dock.
  const folder = showFavs || showUsed ? "" : folderPrefix(filter);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  useEffect(() => {
    if (!contentReady) return;
    let live = true;
    void api.modelFolders(folder).then((f) => live && setFolders(f));
    return () => {
      live = false;
    };
  }, [contentReady, folder]);
  const goFolder = (f: string) => {
    setFilter(filterInFolder(filter, f));
    setLimit(PAGE);
  };
  const folderTree = (
    <nav className="folder-tree" aria-label={tr("Папки моделей")}>
      <button
        className="folder-row up"
        onClick={() => goFolder(parentFolder(folder))}
        disabled={!folder}
        title={folder ? tr("Вверх, в {0}", [parentFolder(folder) || tr("корень models/")]) : tr("Корень models/")}
      >
        <Icon name="folder" size={13} />
        <span className="list-text grow">{folder || tr("Все папки")}</span>
      </button>
      {folders.map((f) => (
        <button key={f.name} className="folder-row" onClick={() => goFolder(folder + f.name)} title={tr("models/{0}{1}: {2} моделей", [folder, f.name, f.count])}>
          <span className="folder-indent" />
          <span className="list-text grow">{f.name.slice(0, -1)}</span>
          <span className="muted">{f.count}</span>
        </button>
      ))}
      {folder && !folders.length ? <span className="muted folder-empty">{tr("Вложенных папок нет")}</span> : null}
    </nav>
  );
  const tile = useListZoom(TILE.key, TILE.fallback, TILE.min, TILE.max, TILE.step);
  // Tiles ask for their picture once they are on screen.
  const observer = useRef<IntersectionObserver | null>(null);
  const observe = (el: HTMLElement | null) => {
    if (!el) return;
    observer.current ??= new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const name = (e.target as HTMLElement).dataset.model;
          if (e.isIntersecting && name && !thumbs?.has(name)) onNeedThumb?.(name);
        }
      },
      { rootMargin: "120px" },
    );
    observer.current.observe(el);
  };
  useEffect(() => () => observer.current?.disconnect(), []);
  const [previewH, setPreviewH] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem("gme.previewH"));
      return v >= 120 && v <= 900 ? v : 220;
    } catch {
      return 220;
    }
  });
  const startPreviewResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const start = previewH;
    // The closure's previewH is the value at the start of the drag; keep the latest by hand.
    let last = start;
    const move = (ev: MouseEvent) => {
      last = Math.max(120, Math.min(900, start + (startY - ev.clientY)));
      setPreviewH(last);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      try {
        localStorage.setItem("gme.previewH", String(Math.round(last)));
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const base = (n: string) => n.split("/").pop() ?? n;
  const source = showFavs ? Array.from(favs).sort() : showUsed ? used : names;
  // The next page comes by itself near the end of the list (no «more» to click).
  useAutoMore(
    () => (view === "icons" ? tile.ref.current : zoom.ref.current),
    !showFavs && !showUsed && contentReady && total > names.length,
    () => setLimit((l) => l + PAGE),
    names.length,
  );
  const sorted = sort === "name" ? source.slice().sort((a, b) => base(a).localeCompare(base(b))) : source.slice();
  const shown = desc ? sorted.reverse() : sorted;
  // The class each listed model goes in as: Hammer puts all of them in as prop_static, and some vanish in the compile.
  const [classes, setClasses] = useState<Map<string, PropClass>>(new Map());
  const classKey = shown.slice(0, 2000).join("|") + "|" + current;
  useEffect(() => {
    const want = [...new Set([...shown.slice(0, 2000), ...(current ? [current] : [])])];
    if (!want.length) return;
    let live = true;
    void classesOf(want).then((m) => live && setClasses(m));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey]);
  const badge = (name: string, cls: string) => {
    const c = classes.get(name);
    if (!c || c === "prop_static") return null;
    return (
      <span
        className={`${cls} prop-class-${c === "prop_physics" ? "physics" : "dynamic"}`}
        title={tr("Модель скомпилирована без $staticprop и будет размещена как {0}{1}", [c, c === "prop_physics" ? tr(" (у неё есть физика)") : ""])}
      >
        {c === "prop_physics" ? tr("физ") : tr("дин")}
      </span>
    );
  };

  useEffect(() => {
    if (!contentReady || filter.trim() === "*" || filter.trim().startsWith("@")) return;
    const id = ++request.current;
    const t = setTimeout(() => {
      void api.listModels(filter, limit).then((list) => {
        if (request.current !== id) return;
        setNames(list.names);
        setTotal(list.total);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [contentReady, filter, limit]);

  const rowEvents = (name: string) => ({
    title: `${name}\n${HINT()}`,
    onClick: () => onPick(name),
    onDoubleClick: () => onPlace(name),
    onMouseDown: (e: React.MouseEvent) => onDragAsset?.("model", name, e),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      toggleFav(name);
    },
  });
  const star = (name: string, cls: string) => (
    <span
      className={`${cls}${favs.has(name) ? " on" : ""}`}
      title={favs.has(name) ? tr("Убрать из избранного") : tr("Добавить в избранное (или ПКМ по плитке)")}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        toggleFav(name);
      }}
    >
      ★
    </span>
  );
  const subtitle = !contentReady
    ? tr("загрузка контента…")
    : showFavs
      ? tr("{0} в избранном", [favs.size])
      : showUsed
        ? tr("{0} на карте", [used.length])
        : total > names.length
          ? tr("{0} из {1}", [names.length, total])
          : tr("{0} моделей", [total]);
  const currentName = current ? splitPath(current)[1].replace(/\.mdl$/i, "") : "";

  return (
    <PanelFrame
      title={tr("Модели")}
      subtitle={subtitle}
      className="browser"
      footer={
        <Row>
          <span className="muted">{subtitle}</span>
          <span className="grow" />
          {view === "icons" ? (
            <span className="size-ctl" title={tr("Размер плиток; также Ctrl+колесо над списком")}>
              <button className="icon-btn" onClick={() => tile.set(tile.value - TILE.step)} disabled={tile.value <= TILE.min}>
                −
              </button>
              <span className="muted">{tile.value}</span>
              <button className="icon-btn" onClick={() => tile.set(tile.value + TILE.step)} disabled={tile.value >= TILE.max}>
                +
              </button>
            </span>
          ) : null}
        </Row>
      }
    >
      <Row>
        <input
          className="grow"
          placeholder={tr("Фильтр: props_c17 barrel … (* - избранное, @ - на карте)")}
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setLimit(PAGE);
          }}
          spellCheck={false}
        />
        <button className={`icon-btn${showFavs ? " active" : ""}`} onClick={() => setFilter(showFavs ? "props_c17/" : "*")} title={tr("Избранные модели (звёздочка на плитке); в фильтре это «*»")}>
          ★
        </button>
        <button
          className={`icon-btn${showUsed ? " active" : ""}`}
          onClick={() => setFilter(showUsed ? "props_c17/" : "@")}
          title={tr("Модели этой карты; в фильтре это «@», после него можно дописать часть имени")}
        >
          @
        </button>
        <ViewSwitch value={view} options={["icons", "list"]} onChange={setView} />
        <Select
          prefix={tr("Порядок")}
          value={sort}
          options={[
            { value: "path", label: tr("Папка") },
            { value: "name", label: tr("Имя") },
          ]}
          onChange={(v) => setSort(v as "path" | "name")}
          title={tr("Порядок сортировки списка")}
        />
        <button className="icon-btn" onClick={() => setDesc(!desc)} title={desc ? tr("По убыванию; нажмите для возрастания") : tr("По возрастанию; нажмите для убывания")}>
          {desc ? "↓" : "↑"}
        </button>
      </Row>
      <Card
        title={tr("Текущая")}
        icon="cylinder"
        hint={current ? tr("превью следует за курсором в 3D-виде") : tr("выберите модель в списке")}
        right={
          <>
            {onSelectUsers && (
              <button onClick={onSelectUsers} disabled={!current} title={tr("Выделить на карте все пропы с этой моделью")}>
                {tr("На карте")}
              </button>
            )}
            <button
              className="primary"
              onClick={() => current && onPlace(current)}
              disabled={!current}
              title={tr("Поставить {0} с этой моделью перед камерой", [classes.get(current) ?? "prop_static"])}
            >
              <Icon name="plus" /> {tr("Поставить")}
            </button>
          </>
        }
      >
        <Row title={current}>
          <span className="list-text grow">{currentName || <span className="muted">{tr("не выбрана")}</span>}</span>
          {current ? <span className="muted">{classes.get(current) ?? "prop_static"}</span> : null}
          {current ? <span className="muted list-folder">{splitPath(current.replace(/^models\//, ""))[0]}</span> : null}
        </Row>
      </Card>
      {recent.length > 1 && (
        <div className="recent-row" title={tr("Недавние модели: щелчок делает модель текущей")}>
          {recent.slice(1).map((m) => {
            const png = thumbs?.get(m);
            return (
              <button key={m} className="recent-chip" onClick={() => onPick(m)} title={m}>
                {png ? <img src={png} alt="" /> : <span>{splitPath(m)[1].slice(0, 3)}</span>}
              </button>
            );
          })}
        </div>
      )}
      {!contentReady ? (
        <Empty icon="cylinder" title={tr("Загрузка контента")} text={tr("Список моделей появится после чтения VPK и папок игры.")} />
      ) : view === "icons" ? (
        <div className="browser-split">
          {folderTree}
          <div className="tiles" ref={tile.ref} style={{ "--tile": `${tile.value}px` } as React.CSSProperties}>
            {shown.map((name) => {
              const png = thumbs?.get(name);
              return (
                <div role="button" tabIndex={0} key={name} ref={observe} data-model={name} className={name === current ? "tile active" : "tile"} {...rowEvents(name)}>
                  {png ? <img src={png} alt="" draggable={false} /> : <span className="tile-missing tile-wait" />}
                  <span className="tile-name">{splitPath(name)[1].replace(/\.mdl$/i, "")}</span>
                  {badge(name, "tile-class")}
                  {star(name, "tile-star")}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="browser-split">
          {folderTree}
          <div className="list" ref={zoom.ref} style={{ fontSize: zoom.value }} title={tr("Ctrl+колесо меняет размер строк")}>
            {shown.map((name) => (
              <div key={name} ref={observe} data-model={name} className={name === current ? "list-row current" : "list-row"} {...rowEvents(name)}>
                {thumbs?.get(name) ? <img className="list-thumb" src={thumbs.get(name)} alt="" draggable={false} /> : <span className="list-thumb tile-wait" />}
                <span className="list-text">{splitPath(name)[1]}</span>
                <span className="muted list-folder">{splitPath(name.replace(/^models\//, ""))[0]}</span>
                {badge(name, "list-class")}
                {star(name, "list-star")}
              </div>
            ))}
          </div>
        </div>
      )}
      {current && (
        <Card title={tr("Предпросмотр")} icon="eye" hint={preview ? previewInfo : ""} flush className="model-preview big">
          <div className="panel-splitter preview-splitter" onMouseDown={startPreviewResize} title={tr("Перетащите, чтобы изменить высоту превью")} />
          <div
            className="model-preview-box"
            style={{ height: previewH }}
            title={tr("Перетащите, чтобы повернуть модель")}
            onMouseDown={(e) => {
              if (e.button !== 0 || !onRotate) return;
              e.preventDefault();
              let last = { x: e.clientX, y: e.clientY };
              const move = (ev: MouseEvent) => {
                onRotate((ev.clientX - last.x) * 0.6, (ev.clientY - last.y) * 0.6);
                last = { x: ev.clientX, y: ev.clientY };
              };
              const up = () => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", move);
              window.addEventListener("mouseup", up);
            }}
          >
            {preview ? <img src={preview} alt="" draggable={false} /> : <div className="model-preview-empty muted">{previewInfo || tr("рендеринг…")}</div>}
          </div>
        </Card>
      )}
    </PanelFrame>
  );
}
