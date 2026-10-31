// Texture browser: filters the mounted materials by name and shows PNG
// thumbnails served by the shell. Clicking a tile makes it the current
// material for the texture and block tools.

import { onBrowse } from "../app/browse";
import { loadRecent, pushRecent, storeRecent } from "../app/recent";
import { useEffect, useRef, useState } from "react";
import { api, thumbnailUrl, type FolderEntry } from "../tauri";
import { Select } from "./Select";
import { TILE, useAutoMore, useListZoom } from "./lists";
import { filterInFolder, folderPrefix, parentFolder } from "./folders";
import type { DragAsset } from "./assetDrag";
import { Icon } from "./Icon";
import { ViewSwitch, splitPath, useBrowserView } from "./browserView";
import { Card, Empty, Field, PanelFrame, Row } from "./kit";

interface Props {
  current: string;
  onPick(material: string): void;
  /** Applies the current material to every face of the selected brushes. */
  onApplyToSelection(): void;
  selectedCount: number;
  contentReady: boolean;
  /** Face-edit sheet shown above the tiles while faces are selected. */
  children?: React.ReactNode;
  /** Replace Textures: `find` → `replace`, on the selection or the whole map. */
  onReplace(find: string, replace: string, scope: "selection" | "map", substring: boolean): void;
  /** Import PNG/TGA pictures as materials of the map's project (app only). */
  onImport?(): void;
  /** A tile pressed and moved: the app drags it into the views. */
  onDragAsset?: DragAsset;
  /** Double click on a tile: paint with this material by clicking faces. */
  onApplyMode?(material: string): void;
  /** Materials on the map's faces, for the «@» filter (Hammer can only list them in Replace Textures). */
  mapMaterials?: string[];
}

import { loadFavorites, toggleFavorite } from "../app/favorites";
import { t as tr, lazy } from "../i18n";

const FAV_KEY = "gme.favMaterials";

const PAGE = 120;

type Sort = "path" | "name" | "fav";
const SORTS: { value: Sort; label: string; hint: string }[] = lazy(() => [
  { value: "path", label: tr("Папка"), hint: tr("по расположению в папках") },
  { value: "name", label: tr("Имя"), hint: tr("по имени файла без папки") },
  { value: "fav", label: tr("Избранное"), hint: tr("сначала отмеченные звёздочкой") },
]);

/** Shaders a mapper looks for most, as Hammer's texture browser filter. */
const SHADERS: [string, string][] = lazy(() => [
  ["", tr("Любой")],
  ["lightmappedgeneric", tr("LightmappedGeneric: стены и пол")],
  ["worldvertextransition", tr("WorldVertexTransition: смешивание (дисплейсменты)")],
  ["unlitgeneric", tr("UnlitGeneric: без освещения")],
  ["vertexlitgeneric", tr("VertexLitGeneric: модели")],
  ["water", tr("Water: вода")],
  ["refract", tr("Refract: стекло с искажением")],
  ["sprite", tr("Sprite: спрайты")],
  ["tool", tr("Служебные (tools/)")],
]);

const TILE_HINT = () => tr("Щелчок делает материал текущим; перетащите плитку на грань в 3D-виде, чтобы применить; двойной щелчок включает нанесение щелчками");

export function TexturePanel({ current, onPick, onApplyToSelection, selectedCount, contentReady, children, onReplace, onImport, onDragAsset, onApplyMode, mapMaterials }: Props) {
  const [filter, setFilter] = useState("");
  /** The last materials made current, newest first (Unreal's recent assets). */
  const [recent, setRecent] = useState<string[]>(() => loadRecent("gme.recentMaterials"));
  useEffect(() => {
    if (!current) return;
    setRecent((list) => {
      const next = pushRecent(list, current);
      storeRecent("gme.recentMaterials", next);
      return next;
    });
  }, [current]);
  const [favs, setFavs] = useState<Set<string>>(() => loadFavorites(FAV_KEY));
  const toggleFav = (name: string) => setFavs(toggleFavorite(FAV_KEY, favs, name));
  // «Find in library» from a selected brush or face sets the filter to its material.
  useEffect(() => onBrowse("material", (name) => setFilter(name)), []);
  const showFavs = filter.trim() === "*";
  // «@» lists the map's own materials; words after it narrow them down.
  const showUsed = filter.trim().startsWith("@");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [substring, setSubstring] = useState(false);
  const [names, setNames] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [shader, setShader] = useState("");
  const [sort, setSort] = useState<Sort>("path");
  const [desc, setDesc] = useState(false);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  /** Materials without a picture are hidden unless asked for. */
  const [showBroken, setShowBrokenState] = useState(() => {
    try {
      return localStorage.getItem("gme.showBroken") === "1";
    } catch {
      return false;
    }
  });
  const setShowBroken = (v: boolean) => {
    setShowBrokenState(v);
    try {
      localStorage.setItem("gme.showBroken", v ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  };
  const request = useRef(0);
  const tile = useListZoom(TILE.key, TILE.fallback, TILE.min, TILE.max, TILE.step);
  // The next page comes by itself near the end of the list (no «more» to click).
  const pagedMore = !showFavs && !showUsed && contentReady && total > names.length;
  useAutoMore(
    () => tile.ref.current,
    pagedMore,
    () => setLimit((l) => l + PAGE),
    names.length,
  );
  const [view, setView] = useBrowserView("gme.texView", "icons", ["icons", "list"]);
  // The folder column (Unity's project browser): subfolders of the folder the filter is in; shown by
  // the stylesheet only when the panel is wide, as in the bottom dock.
  const folder = showFavs || showUsed ? "" : folderPrefix(filter);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  useEffect(() => {
    if (!contentReady) return;
    let live = true;
    void api.materialFolders(folder).then((f) => live && setFolders(f));
    return () => {
      live = false;
    };
  }, [contentReady, folder]);
  const goFolder = (f: string) => {
    setFilter(filterInFolder(filter, f));
    setLimit(PAGE);
  };
  const folderTree = (
    <nav className="folder-tree" aria-label={tr("Папки материалов")}>
      <button
        className="folder-row up"
        onClick={() => goFolder(parentFolder(folder))}
        disabled={!folder}
        title={folder ? tr("Вверх, в {0}", [parentFolder(folder) || tr("корень")]) : tr("Корень дерева материалов")}
      >
        <Icon name="folder" size={13} />
        <span className="list-text grow">{folder || tr("Все папки")}</span>
      </button>
      {folders.map((f) => (
        <button key={f.name} className="folder-row" onClick={() => goFolder(folder + f.name)} title={tr("{0}{1}: {2} материалов", [folder, f.name, f.count])}>
          <span className="folder-indent" />
          <span className="list-text grow">{f.name.slice(0, -1)}</span>
          <span className="muted">{f.count}</span>
        </button>
      ))}
      {folder && !folders.length ? <span className="muted folder-empty">{tr("Вложенных папок нет")}</span> : null}
    </nav>
  );
  const base = (n: string) => n.split("/").pop() ?? n;
  const usedWords = filter.trim().slice(1).toLowerCase().split(/\s+/).filter(Boolean);
  const used = showUsed ? [...new Set(mapMaterials ?? [])].filter((m) => usedWords.every((w) => m.toLowerCase().includes(w))).sort() : [];
  const shown = (showFavs ? Array.from(favs).sort() : showUsed ? used : names.filter((n) => showBroken || !broken.has(n))).sort((a, b) => {
    if (sort === "fav" && favs.has(a) !== favs.has(b)) return favs.has(a) ? -1 : 1;
    return sort === "name" ? base(a).localeCompare(base(b)) : sort === "fav" ? a.localeCompare(b) : 0;
  });
  if (desc) shown.reverse();

  useEffect(() => {
    if (!contentReady || showUsed) return;
    const id = ++request.current;
    const t = setTimeout(() => {
      void api.listMaterials(filter, limit, shader, showBroken).then((list) => {
        if (request.current !== id) return;
        setNames(list.names);
        setTotal(list.total);
      });
    }, 150);
    return () => clearTimeout(t);
  }, [contentReady, filter, limit, shader, showBroken]);

  const markBroken = (name: string) => setBroken((b) => new Set(b).add(name));
  const tileEvents = (name: string) => ({
    title: `${name}\n${TILE_HINT()}`,
    onClick: () => onPick(name),
    onDoubleClick: () => onApplyMode?.(name),
    onMouseDown: (e: React.MouseEvent) => onDragAsset?.("material", name, e),
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
          : tr("{0} материалов", [total]);

  return (
    <PanelFrame
      title={tr("Текстуры")}
      subtitle={subtitle}
      className="browser"
      footer={
        <Row>
          <span className="muted">{subtitle}</span>
          <span className="grow" />
          <span className="size-ctl" title={tr("Размер плиток; также Ctrl+колесо над списком")}>
            <button className="icon-btn" onClick={() => tile.set(tile.value - TILE.step)} disabled={tile.value <= TILE.min}>
              −
            </button>
            <span className="muted">{tile.value}</span>
            <button className="icon-btn" onClick={() => tile.set(tile.value + TILE.step)} disabled={tile.value >= TILE.max}>
              +
            </button>
          </span>
        </Row>
      }
    >
      <Row>
        <input
          className="grow"
          placeholder={tr("Фильтр: dev/ wall … (* - избранное, @ - на карте)")}
          value={filter}
          spellCheck={false}
          onChange={(e) => {
            setFilter(e.target.value);
            setLimit(PAGE);
          }}
        />
        <button className={`icon-btn${showFavs ? " active" : ""}`} onClick={() => setFilter(showFavs ? "" : "*")} title={tr("Избранные материалы (звёздочка на плитке); в фильтре это «*»")}>
          ★
        </button>
        <button
          className={`icon-btn${showUsed ? " active" : ""}`}
          onClick={() => setFilter(showUsed ? "" : "@")}
          title={tr("Материалы этой карты; в фильтре это «@», после него можно дописать часть имени")}
        >
          @
        </button>
        {onImport && (
          <button className="icon-btn" onClick={onImport} title={tr("Импорт PNG или TGA как материала проекта карты")}>
            <Icon name="import" />
          </button>
        )}
        <ViewSwitch value={view} options={["icons", "list"]} onChange={setView} />
      </Row>
      <Row wrap className="browser-tools">
        <Select
          prefix={tr("Шейдер")}
          value={shader}
          options={SHADERS.map(([v, t]) => ({ value: v, label: t }))}
          title={tr("Только материалы с этим шейдером (при первом выборе читаются все VMT - несколько секунд)")}
          onChange={(v) => {
            setShader(v);
            setLimit(PAGE);
          }}
        />
        <Select prefix={tr("Порядок")} value={sort} options={SORTS} onChange={(v) => setSort(v as Sort)} title={tr("Порядок сортировки плиток")} />
        <button className="icon-btn" onClick={() => setDesc(!desc)} title={desc ? tr("По убыванию; нажмите для возрастания") : tr("По возрастанию; нажмите для убывания")}>
          {desc ? "↓" : "↑"}
        </button>
        <span className="grow" />
        <label className="chk" title={tr("Показывать также материалы без превью: служебные и шейдерные, к брашу их не применить")}>
          <input type="checkbox" checked={showBroken} onChange={(e) => setShowBroken(e.target.checked)} /> {tr("Без превью")}
        </label>
      </Row>
      <Card
        title={tr("Текущая")}
        icon="brush"
        right={
          <>
            <button data-tour="apply-texture" className="primary" onClick={onApplyToSelection} disabled={!selectedCount} title={tr("Применить текущую текстуру ко всем граням выделенных брашей")}>
              <Icon name="check" /> {tr("На выделение")}
            </button>
            <button className={`icon-btn${replaceOpen ? " active" : ""}`} onClick={() => setReplaceOpen((o) => !o)} title={tr("Замена одного материала другим на выделении или по всей карте")}>
              <Icon name="replace" />
            </button>
          </>
        }
      >
        <Row className="current-material" title={current}>
          {thumbnailUrl(current) && <img className="current-thumb" src={thumbnailUrl(current)} alt="" />}
          <span className="list-text grow">{current}</span>
        </Row>
        {replaceOpen && (
          <div className="card-sub">
            <Field label={tr("Найти")}>
              <input className="grow" value={find} onChange={(e) => setFind(e.target.value)} placeholder="dev/dev_measurewall01a" spellCheck={false} />
            </Field>
            <Field label={tr("Заменить на")}>
              <input className="grow" value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)} placeholder={current} spellCheck={false} />
            </Field>
            <Row>
              <label className="chk" title={tr("Искать подстроку и заменять только её; иначе сравнивается имя целиком")}>
                <input type="checkbox" checked={substring} onChange={(e) => setSubstring(e.target.checked)} /> {tr("Подстрока")}
              </label>
              <span className="grow" />
              <button onClick={() => onReplace(find, replaceWith || current, "selection", substring)} disabled={!find || !selectedCount} title={tr("Только на выделенных брашах")}>
                {tr("На выделении")}
              </button>
              <button onClick={() => onReplace(find, replaceWith || current, "map", substring)} disabled={!find} title={tr("На всех брашах карты")}>
                {tr("По всей карте")}
              </button>
            </Row>
          </div>
        )}
      </Card>
      {recent.length > 1 && (
        <div className="recent-row" title={tr("Недавние текстуры: щелчок делает текстуру текущей")}>
          {recent.slice(1).map((m) => (
            <button key={m} className="recent-chip" onClick={() => onPick(m)} title={m}>
              {thumbnailUrl(m) ? <img src={thumbnailUrl(m)} alt="" /> : <span>{m.split("/").pop()?.slice(0, 3)}</span>}
            </button>
          ))}
        </div>
      )}
      {children}
      {!contentReady ? (
        <Empty icon="brush" title={tr("Загрузка контента")} text={tr("Список материалов появится после чтения VPK и папок игры.")} />
      ) : showFavs && !shown.length ? (
        <Empty icon="brush" title={tr("Нет избранных материалов")} text={tr("Чтобы добавить материал, нажмите звёздочку на плитке или щёлкните по ней правой кнопкой.")} />
      ) : view === "icons" ? (
        <div className="browser-split">
          {folderTree}
          <div className="tiles" ref={tile.ref} style={{ "--tile": `${tile.value}px` } as React.CSSProperties}>
            {shown.map((name) => (
              <div role="button" tabIndex={0} key={name} data-material={name} className={name.toLowerCase() === current.toLowerCase() ? "tile active" : "tile"} {...tileEvents(name)}>
                {star(name, "tile-star")}
                {broken.has(name) || !thumbnailUrl(name) ? (
                  <span className="tile-missing" />
                ) : (
                  <img src={thumbnailUrl(name)} alt="" draggable={false} loading="lazy" onError={() => markBroken(name)} />
                )}
                <span className="tile-name">{name.split("/").pop()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="browser-split">
          {folderTree}
          <div className="list" ref={tile.ref}>
            {shown.map((name) => {
              const [folder, file] = splitPath(name);
              const url = thumbnailUrl(name);
              return (
                <div key={name} data-material={name} className={`list-row${name.toLowerCase() === current.toLowerCase() ? " current" : ""}`} {...tileEvents(name)}>
                  {url && !broken.has(name) ? (
                    <img className="list-thumb" src={url} alt="" draggable={false} loading="lazy" onError={() => markBroken(name)} />
                  ) : (
                    <span className="list-thumb tile-missing" />
                  )}
                  <span className="list-text">{file}</span>
                  <span className="muted list-folder">{folder}</span>
                  {star(name, "list-star")}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
