// Publish to the Steam Workshop: title, description and tags of the item,
// an icon from the 3D view, the readiness checks, then "Собрать аддон"
// (gmad) and "Опубликовать" (gmpublish). The Workshop id lives in the
// project's mallet.json, so the next publish updates the same item.

import { useEffect, useState } from "react";
import { api, type WorkshopPackResult } from "../tauri";
import type { JourneyStage, ProjectMeta } from "../app/journey";
import { Icon } from "./Icon";
import { Card, Empty, Field, PanelFrame, Row, Status } from "./kit";
import { t as tr, tb } from "../i18n";

interface Props {
  inApp: boolean;
  mapName: string;
  /** Folder of the map's VMF; the addon folder and the icon go to `<dir>/workshop`. */
  projectDir: string | null;
  /** The last compiled BSP, or null. */
  bsp: string | null;
  meta: ProjectMeta;
  onMeta(patch: Partial<ProjectMeta>): void;
  journey: JourneyStage[];
  /** PNG of the 3D view, base64. */
  screenshot(): Promise<{ data: string; mediaType: string }>;
  onStatus(text: string): void;
  /** Opens the item's page in the browser. */
  onOpen(url: string): void;
}

export const WORKSHOP_TAGS: { id: string; title: string }[] = [
  { id: "fun", title: "Fun" },
  { id: "roleplay", title: "Roleplay" },
  { id: "build", title: "Build" },
  { id: "scenic", title: "Scenic" },
  { id: "realism", title: "Realism" },
  { id: "cartoon", title: "Cartoon" },
  { id: "water", title: "Water" },
  { id: "comic", title: "Comic" },
  { id: "movie", title: "Movie" },
];

const fmtBytes = (n: number) => (n >= 1 << 20 ? tr("{0} МБ", [(n / (1 << 20)).toFixed(1)]) : tr("{0} КБ", [Math.round(n / 1024)]));

/** A 512×512 baseline JPEG from a PNG data URL: the centre square, scaled. */
async function iconJpeg(pngBase64: string): Promise<Uint8Array> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error(tr("не удалось прочитать снимок")));
    img.src = `data:image/png;base64,${pngBase64}`;
  });
  const side = Math.min(img.width, img.height);
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 512, 512);
  let quality = 0.9;
  let bytes: Uint8Array;
  do {
    const url = c.toDataURL("image/jpeg", quality);
    bytes = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (ch) => ch.charCodeAt(0));
    quality -= 0.1;
  } while (bytes.length > 1_000_000 && quality > 0.3);
  return bytes;
}

export function WorkshopPanel(p: Props) {
  const plainName = p.mapName.replace(/\.vmf$/i, "");
  const [title, setTitle] = useState(p.meta.title || plainName);
  const [description, setDescription] = useState(p.meta.description);
  const [tags, setTags] = useState<string[]>(p.meta.tags.slice(0, 2));
  const [changes, setChanges] = useState("");
  const [icon, setIcon] = useState<{ path: string; url: string } | null>(null);
  const [packed, setPacked] = useState<WorkshopPackResult | null>(null);
  const [busy, setBusy] = useState<"" | "icon" | "pack" | "publish">("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    setTitle(p.meta.title || plainName);
    setDescription(p.meta.description);
    setTags(p.meta.tags.slice(0, 2));
    setPacked(null);
    setIcon(null);
  }, [p.mapName]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMeta = () => p.onMeta({ title: title.trim(), description, tags });
  const toggleTag = (id: string) => setTags((t) => (t.includes(id) ? t.filter((x) => x !== id) : t.length >= 2 ? [t[1], id] : [...t, id]));
  const mapSafe = p.mapName
    .replace(/\.vmf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_");
  const workshopDir = p.projectDir ? `${p.projectDir}/workshop` : null;

  const makeIcon = async () => {
    if (!workshopDir) return;
    setBusy("icon");
    setError("");
    try {
      const shot = await p.screenshot();
      const bytes = await iconJpeg(shot.data);
      const path = `${workshopDir}/${mapSafe}_icon.jpg`;
      await api.writeFileBytes(path, bytes);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "image/jpeg" }));
      setIcon({ path, url });
      p.onStatus(tr("иконка снята из 3D-вида: {0}", [fmtBytes(bytes.length)]));
    } catch (e) {
      setError(tb(String(e)));
    } finally {
      setBusy("");
    }
  };
  const pack = async () => {
    if (!workshopDir || !p.bsp) return;
    saveMeta();
    setBusy("pack");
    setError("");
    try {
      const r = await api.workshopPack({ bsp: p.bsp, map: mapSafe, title: title.trim(), tags, outDir: workshopDir });
      setPacked(r);
      setLog(r.log);
      p.onStatus(tr("аддон собран: {0}, {1} файлов", [fmtBytes(r.bytes), r.files.length]));
    } catch (e) {
      setError(tb(String(e)));
      setPacked(null);
    } finally {
      setBusy("");
    }
  };
  const publish = async () => {
    if (!packed) return;
    setBusy("publish");
    setError("");
    try {
      const r = await api.workshopPublish({ gma: packed.gma, icon: icon?.path ?? null, id: p.meta.workshopId, changes: changes.trim() || null });
      setLog(r.log);
      p.onMeta({ workshopId: r.id ?? p.meta.workshopId, publishedStamp: p.meta.compiledStamp });
      setChanges("");
      p.onStatus(r.id ? tr("опубликовано: Workshop id {0}", [r.id]) : tr("опубликовано"));
      if (r.url) p.onOpen(r.url);
    } catch (e) {
      setError(tb(String(e)));
    } finally {
      setBusy("");
    }
  };

  const blockers = p.journey.filter((s) => s.id !== "publish" && s.status !== "done" && s.reasons.length);
  const ready = !!p.bsp && blockers.length === 0;
  const first = !p.meta.workshopId;

  if (!p.inApp) {
    return (
      <PanelFrame title={tr("Публикация")}>
        <Empty icon="external" title={tr("Публикация доступна в приложении")} text={tr("Для публикации в Steam Workshop используются gmad и gmpublish из папки Garry's Mod.")} />
      </PanelFrame>
    );
  }
  if (!p.mapName) {
    return (
      <PanelFrame title={tr("Публикация")}>
        <Empty icon="external" title={tr("Откройте карту")} text={tr("Сохранённую и собранную карту можно опубликовать в Steam Workshop в два шага.")} />
      </PanelFrame>
    );
  }

  return (
    <PanelFrame
      title={tr("Публикация")}
      subtitle={p.meta.workshopId ? tr("в Workshop, id {0}", [p.meta.workshopId]) : tr("Steam Workshop, не опубликована")}
      actions={
        p.meta.workshopId ? (
          <button className="icon-btn" onClick={() => p.onOpen(`https://steamcommunity.com/sharedfiles/filedetails/?id=${p.meta.workshopId}`)} title={tr("Открыть страницу в Workshop")}>
            <Icon name="external" />
          </button>
        ) : null
      }
      footer={
        <Row>
          {packed ? (
            <span className="muted list-text" title={packed.gma}>
              {fmtBytes(packed.bytes)} · {packed.files.length} {tr("файлов")}
            </span>
          ) : (
            <span className="muted list-text">{p.bsp ? tr("сначала нажмите «Собрать аддон»") : tr("сначала соберите карту (F9)")}</span>
          )}
          <span className="grow" />
          <button onClick={() => void pack()} disabled={!p.bsp || !workshopDir || !!busy} title={tr("Собрать папку аддона с BSP и addon.json и упаковать её gmad в GMA")}>
            <Icon name="build" /> {busy === "pack" ? tr("Сборка…") : tr("Собрать аддон")}
          </button>
          <button
            className="primary"
            onClick={() => void publish()}
            disabled={!packed || !!busy || (first && !icon)}
            title={first ? tr("gmpublish create: требуются запущенный Steam и иконка") : tr("gmpublish update: заменить файл в Workshop")}
          >
            <Icon name="external" /> {busy === "publish" ? tr("Отправка…") : first ? tr("Опубликовать") : tr("Обновить в Workshop")}
          </button>
        </Row>
      }
    >
      <Card title={tr("Описание")} icon="edit" hint={tr("отображается в Workshop")}>
        <Field label={tr("Название")}>
          <input className="grow" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveMeta} spellCheck={false} placeholder={plainName} />
        </Field>
        <Field label={tr("Описание")} wide>
          <textarea
            className="grow workshop-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveMeta}
            placeholder={tr("Краткое описание: тип карты, игровой режим, чем на ней заняться")}
          />
        </Field>
        <Field label={tr("Теги")} hint={tr("До двух тегов Workshop")}>
          <Row wrap>
            {WORKSHOP_TAGS.map((t) => (
              <button key={t.id} className={`chip${tags.includes(t.id) ? " on" : ""}`} onClick={() => toggleTag(t.id)}>
                {t.title}
              </button>
            ))}
          </Row>
        </Field>
      </Card>
      <Card
        title={tr("Иконка")}
        icon="camera"
        hint="512×512, JPEG"
        right={
          <button onClick={() => void makeIcon()} disabled={!workshopDir || !!busy} title={tr("Снимок 3D-вида, обрезанный до квадрата")}>
            <Icon name="camera" /> {busy === "icon" ? tr("Съёмка…") : tr("Снять из 3D-вида")}
          </button>
        }
      >
        {icon ? (
          <img className="workshop-icon" src={icon.url} alt="" />
        ) : (
          <div className="muted small">
            {first ? tr("Для первой публикации требуется иконка: выберите удачный ракурс в 3D-виде и сделайте снимок.") : tr("Если не задать новую иконку, в Workshop сохранится прежняя.")}
          </div>
        )}
      </Card>
      <Card title={tr("Готовность")} icon="check" tone={ready ? "ok" : "warn"} hint={ready ? tr("готово к публикации") : tr("есть незавершённые пункты")}>
        {!p.bsp ? <Status tone="warn">{tr("карта не собрана: нажмите F9")}</Status> : <Status tone="ok">{tr("карта собрана")}</Status>}
        {blockers.map((s) => (
          <Status key={s.id} tone="warn" title={s.reasons.join("; ")}>
            {s.title}: {s.reasons[0]}
          </Status>
        ))}
        {ready ? <Status tone="ok">{tr("проверки пройдены")}</Status> : null}
      </Card>
      {!first ? (
        <Card title={tr("Что нового")} icon="edit" hint={tr("заметка к обновлению")}>
          <textarea className="grow workshop-desc" rows={2} value={changes} onChange={(e) => setChanges(e.target.value)} placeholder={tr("Исправлена утечка у ворот, добавлен свет на складе")} />
        </Card>
      ) : null}
      {error ? <div className="bad small">{error}</div> : null}
      {log.length ? (
        <Card title={tr("Лог")} icon="list" collapsible defaultOpen={false} id="workshop-log">
          <pre className="workshop-log">{log.join("\n")}</pre>
        </Card>
      ) : null}
    </PanelFrame>
  );
}
