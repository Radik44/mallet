// Sounds: the game's sound files with playback, and a small editor for the
// map's own sounds: a waveform with trim markers, loop with a seamless
// crossfade, gain and fades, recording from the microphone, export as a
// 16-bit WAV into the map project, and an ambient_generic placed with it.

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Card, Empty, Field, PanelFrame, Row } from "./kit";
import { useAutoMore } from "./lists";
import type { DragAsset } from "./assetDrag";
import { encodeWav, formatBytes, normalizeGain, renderClip, wavSize } from "./wav";
import { t as tr, tb } from "../i18n";

export interface SoundList {
  names: string[];
  total: number;
}

export interface WrittenSound {
  name: string;
  path: string;
  bytes: number;
}

/** A decoded sound in the editor: channels of -1..1 samples. */
interface Clip {
  channels: Float32Array[];
  rate: number;
  /** Where it came from: a game sound, a file or the microphone. */
  source: string;
}

interface Props {
  contentReady: boolean;
  /** The map's VMF path; exports need a saved map. */
  mapPath: string | null;
  list(filter: string, limit: number): Promise<SoundList>;
  /** URL of a game sound (`sound/...` path without the prefix) for playback. */
  soundUrl(name: string): string;
  pickFile(): Promise<string | null>;
  readFileBytes(path: string): Promise<Uint8Array>;
  writeSound(name: string, bytes: Uint8Array): Promise<WrittenSound>;
  /** Puts an ambient_generic with this sound in front of the camera. */
  onPlace(name: string, loop: boolean): void;
  onDragAsset?: DragAsset;
  /** Remembered between tab switches: the last export. */
  exported: { name: string; loop: boolean; bytes: number } | null;
  onExported(e: { name: string; loop: boolean; bytes: number } | null): void;
}

const PAGE = 200;
let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

/** The clip survives tab switches. */
let keptClip: Clip | null = null;

export function SoundPanel(p: Props) {
  const [filter, setFilter] = useState("ambient/");
  const [names, setNames] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const [clip, setClipState] = useState<Clip | null>(keptClip);
  const setClip = (c: Clip | null) => {
    keptClip = c;
    setClipState(c);
    if (c) {
      setTrim([0, c.channels[0].length]);
      setGain(1);
    }
  };
  const [trim, setTrim] = useState<[number, number]>([0, clip?.channels[0].length ?? 0]);
  const [loop, setLoop] = useState(false);
  const [crossfade, setCrossfade] = useState(50);
  const [gain, setGain] = useState(1);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [mono, setMono] = useState(true);
  const [name, setName] = useState("sound1");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const previewNode = useRef<AudioBufferSourceNode | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const dragMarker = useRef<0 | 1 | null>(null);

  const request = useRef(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!p.contentReady) return;
    const id = ++request.current;
    void p.list(filter, limit).then((r) => {
      if (id !== request.current) return;
      setNames(r.names);
      setTotal(r.total);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, limit, p.contentReady]);
  // The next page comes by itself near the end of the list (no «more» to click).
  useAutoMore(
    () => listRef.current,
    p.contentReady && names.length < total,
    () => setLimit((l) => l + PAGE),
    names.length,
  );

  const stopPlayback = () => {
    audioEl.current?.pause();
    setPlaying(null);
  };
  const play = (n: string) => {
    if (playing === n) {
      stopPlayback();
      return;
    }
    if (!audioEl.current) audioEl.current = new Audio();
    const el = audioEl.current;
    el.src = p.soundUrl(n.replace(/^sound\//, ""));
    el.onended = () => setPlaying(null);
    void el.play().catch((e) => setError(tr("ошибка воспроизведения: {0}", [tb(String(e))])));
    setPlaying(n);
  };

  const decode = async (bytes: ArrayBuffer, source: string) => {
    setBusy(tr("декодирование…"));
    try {
      const buf = await audio().decodeAudioData(bytes.slice(0));
      const channels: Float32Array[] = [];
      for (let c = 0; c < buf.numberOfChannels; c++) channels.push(buf.getChannelData(c).slice());
      setClip({ channels, rate: buf.sampleRate, source });
      setName(
        source
          .replace(/^.*[\\/]/, "")
          .replace(/\.[^.]+$/, "")
          .replace(/[^a-z0-9_-]/gi, "_")
          .toLowerCase() || "sound1",
      );
      setError("");
    } catch (e) {
      setError(tr("не удалось декодировать {0}: {1}", [source, tb(String(e))]));
    } finally {
      setBusy("");
    }
  };
  const openGameSound = async (n: string) => {
    const res = await fetch(p.soundUrl(n.replace(/^sound\//, "")));
    await decode(await res.arrayBuffer(), n);
  };
  const importFile = async () => {
    const path = await p.pickFile();
    if (!path) return;
    const bytes = await p.readFileBytes(path);
    await decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, path);
  };
  const record = async () => {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const parts: BlobPart[] = [];
      rec.ondataavailable = (e) => parts.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(parts, { type: rec.mimeType });
        await decode(await blob.arrayBuffer(), tr("микрофон"));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setError("");
    } catch (e) {
      setError(tr("микрофон недоступен: {0}", [tb(String(e))]));
    }
  };

  // The clip as it would be exported, for the preview and the size.
  const rendered = useMemo(() => {
    if (!clip) return null;
    const chans = mono && clip.channels.length > 1 ? [mixDown(clip.channels)] : clip.channels;
    return renderClip(chans, clip.rate, { start: trim[0], end: trim[1], gain, fadeIn, fadeOut, crossfade: loop ? crossfade : 0 });
  }, [clip, trim, gain, fadeIn, fadeOut, loop, crossfade, mono]);
  const frames = rendered?.[0]?.length ?? 0;
  const outRate = 44100;
  const outFrames = clip ? Math.round((frames * outRate) / clip.rate) : 0;
  const size = rendered ? wavSize(outFrames, rendered.length) : 0;

  const stopPreview = () => {
    try {
      previewNode.current?.stop();
    } catch {
      /* already stopped */
    }
    previewNode.current = null;
    setPreviewing(false);
  };
  const preview = () => {
    if (previewing) {
      stopPreview();
      return;
    }
    if (!rendered || !clip || !frames) return;
    const a = audio();
    const buf = a.createBuffer(rendered.length, frames, clip.rate);
    rendered.forEach((ch, i) => buf.copyToChannel(Float32Array.from(ch), i));
    const node = a.createBufferSource();
    node.buffer = buf;
    node.loop = loop;
    node.connect(a.destination);
    node.onended = () => {
      if (previewNode.current === node) {
        previewNode.current = null;
        setPreviewing(false);
      }
    };
    node.start();
    previewNode.current = node;
    setPreviewing(true);
  };
  useEffect(() => () => stopPreview(), []);

  const exportWav = async () => {
    if (!rendered || !clip || !frames) return;
    setBusy(tr("запись…"));
    try {
      // Resample to 44.1 kHz through an offline context, as the engine expects.
      let chans = rendered;
      if (clip.rate !== outRate) {
        const off = new OfflineAudioContext(rendered.length, outFrames, outRate);
        const buf = off.createBuffer(rendered.length, frames, clip.rate);
        rendered.forEach((ch, i) => buf.copyToChannel(Float32Array.from(ch), i));
        const src = off.createBufferSource();
        src.buffer = buf;
        src.connect(off.destination);
        src.start();
        const out = await off.startRendering();
        chans = [];
        for (let c = 0; c < out.numberOfChannels; c++) chans.push(out.getChannelData(c).slice());
      }
      const bytes = encodeWav(chans, outRate, loop ? 0 : null);
      const res = await p.writeSound(name, bytes);
      p.onExported({ name: res.name, loop, bytes: res.bytes });
      setError("");
    } catch (e) {
      setError(tr("ошибка экспорта: {0}", [tb(String(e))]));
    } finally {
      setBusy("");
    }
  };

  // Waveform drawing.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const w = c.clientWidth || 300;
    const h = 72;
    c.width = Math.round(w * devicePixelRatio);
    c.height = Math.round(h * devicePixelRatio);
    const g = c.getContext("2d");
    if (!g) return;
    g.scale(devicePixelRatio, devicePixelRatio);
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(127,127,127,0.12)";
    g.fillRect(0, 0, w, h);
    if (!clip) {
      g.fillStyle = "rgba(127,127,127,0.8)";
      g.font = "11px sans-serif";
      g.fillText(tr("Откройте звук игры или файл либо запишите звук с микрофона"), 8, h / 2 + 4);
      return;
    }
    const ch = clip.channels[0];
    const n = ch.length;
    const per = n / w;
    g.strokeStyle = "rgba(46,164,179,0.9)";
    g.beginPath();
    for (let x = 0; x < w; x++) {
      const a = Math.floor(x * per);
      const b = Math.min(n, Math.floor((x + 1) * per) + 1);
      let lo = 1;
      let hi = -1;
      for (let i = a; i < b; i++) {
        const s = ch[i] * gain;
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
      g.moveTo(x + 0.5, h / 2 - hi * (h / 2 - 2));
      g.lineTo(x + 0.5, h / 2 - lo * (h / 2 - 2));
    }
    g.stroke();
    // Trimmed-away parts are dimmed; the markers are drawn on top.
    const x0 = (trim[0] / n) * w;
    const x1 = (trim[1] / n) * w;
    g.fillStyle = "rgba(0,0,0,0.45)";
    g.fillRect(0, 0, x0, h);
    g.fillRect(x1, 0, w - x1, h);
    g.fillStyle = "#ffd43b";
    g.fillRect(x0 - 1, 0, 2, h);
    g.fillRect(x1 - 1, 0, 2, h);
  }, [clip, trim, gain]);

  const markerDrag = (e: React.MouseEvent) => {
    const c = canvas.current;
    if (!c || !clip) return;
    const n = clip.channels[0].length;
    const toFrame = (ev: MouseEvent | React.MouseEvent) => {
      const r = c.getBoundingClientRect();
      return Math.max(0, Math.min(n, Math.round(((ev.clientX - r.left) / r.width) * n)));
    };
    const f = toFrame(e);
    dragMarker.current = Math.abs(f - trim[0]) <= Math.abs(f - trim[1]) ? 0 : 1;
    const move = (ev: MouseEvent) => {
      const v = toFrame(ev);
      setTrim((t) => (dragMarker.current === 0 ? [Math.min(v, t[1] - 1), t[1]] : [t[0], Math.max(v, t[0] + 1)]));
    };
    const up = () => {
      dragMarker.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    move(e.nativeEvent);
  };

  const seconds = (f: number) => (clip ? (f / clip.rate).toFixed(2) : "0");
  const clipInfo = clip
    ? tr("{0} · {1} · {2} Гц · {3} с", [clip.source.replace(/^.*[\/]/, ""), clip.channels.length === 1 ? tr("моно") : tr("стерео"), clip.rate, seconds(clip.channels[0].length)])
    : "";
  return (
    <PanelFrame title={tr("Звуки")} subtitle={p.contentReady ? tr("{0} в игре и проекте", [total]) : tr("загрузка контента…")} className="browser sound-panel">
      <Row>
        <input className="grow" placeholder={tr("Поиск: ambient/ door …")} value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
        <button onClick={() => void importFile()} title={tr("Открыть WAV, MP3 или OGG с диска в редакторе")}>
          <Icon name="folder" /> {tr("Файл…")}
        </button>
        <button className={recording ? "active bad" : ""} onClick={() => void record()} title={recording ? tr("Остановить запись") : tr("Записать с микрофона")}>
          <Icon name="bulb" /> {recording ? tr("Стоп") : tr("Записать")}
        </button>
      </Row>
      {!p.contentReady ? (
        <Empty icon="bulb" title={tr("Загрузка контента")} text={tr("Звуки игры появятся после чтения VPK и папок игры.")} />
      ) : !names.length ? (
        <Empty icon="search" title={tr("Ничего не найдено")} text={tr("Поиск по пути файла: ambient/, door, water …")} />
      ) : (
        <div className="list sound-list" ref={listRef}>
          {names.map((n) => (
            <div
              key={n}
              className={`list-row sound-row${playing === n ? " active" : ""}`}
              title={tr("{0}\nПеретащите в любой вид, чтобы создать ambient_generic с этим звуком и открыть его настройки", [n])}
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) return;
                p.onDragAsset?.("sound", n, e);
              }}
            >
              <button className="icon-btn" onClick={() => play(n)} title={playing === n ? tr("Остановить") : tr("Прослушать")}>
                <Icon name={playing === n ? "close" : "play"} size={14} />
              </button>
              <span className="list-text grow">{n.replace(/^sound\//, "")}</span>
              <button className="icon-btn" onClick={() => void openGameSound(n)} title={tr("Открыть в редакторе звука: обрезка, зацикливание, сохранение в карту")}>
                <Icon name="edit" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      <Card title={tr("Редактор")} icon="edit" hint={busy || clipInfo || tr("Откройте файл, запишите звук или нажмите значок карандаша у звука")} className="sound-editor">
        {clip ? (
          <>
            <canvas ref={canvas} className="sound-wave" onMouseDown={markerDrag} title={tr("Перетаскивайте жёлтые маркеры начала и конца")} />
            <Field label={tr("Обрезка, с")}>
              <input
                type="number"
                step={0.05}
                min={0}
                value={seconds(trim[0])}
                onChange={(e) => clip && setTrim([Math.max(0, Math.min(trim[1] - 1, Math.round(Number(e.target.value) * clip.rate))), trim[1]])}
              />
              <input
                type="number"
                step={0.05}
                min={0}
                value={seconds(trim[1])}
                onChange={(e) => clip && setTrim([trim[0], Math.max(trim[0] + 1, Math.min(clip.channels[0].length, Math.round(Number(e.target.value) * clip.rate)))])}
              />
            </Field>
            <Field label={tr("Громкость")} hint={tr("«Нормализовать» поднимает пик до 95 %")}>
              <input type="range" className="grow" min={0} max={2} step={0.05} value={gain} onChange={(e) => setGain(Number(e.target.value))} />
              <span className="muted num">{Math.round(gain * 100)}%</span>
              <button onClick={() => clip && setGain(normalizeGain(clip.channels))}>{tr("Нормализовать")}</button>
            </Field>
            <Field label={tr("Fade in / out, мс")}>
              <input type="number" min={0} step={10} value={fadeIn} onChange={(e) => setFadeIn(Math.max(0, Number(e.target.value) || 0))} />
              <input type="number" min={0} step={10} value={fadeOut} onChange={(e) => setFadeOut(Math.max(0, Number(e.target.value) || 0))} />
            </Field>
            <Field label={tr("Зациклить")} hint={tr("В WAV записывается cue-метка, и движок воспроизводит звук циклически; кроссфейд сглаживает переход от конца к началу")}>
              <label className="chk">
                <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> {tr("Петля")}
              </label>
              <span className="muted">{tr("Кроссфейд")}</span>
              <input type="number" min={0} max={2000} step={10} value={crossfade} disabled={!loop} onChange={(e) => setCrossfade(Math.max(0, Number(e.target.value) || 0))} />
              <span className="muted">{tr("мс")}</span>
            </Field>
            <Field label={tr("Экспорт")}>
              <label className="chk" title={tr("Один канал: файл вдвое меньше; Source всё равно воспроизводит ambient_generic в моно")}>
                <input type="checkbox" checked={mono} onChange={(e) => setMono(e.target.checked)} /> {tr("Моно")}
              </label>
              <span className="muted list-text">{tr("{0}, {1} с, 44,1 кГц 16 бит", [formatBytes(size), (outFrames / outRate).toFixed(2)])}</span>
            </Field>
            <Field label={tr("Имя файла")}>
              <input className="grow" value={name} spellCheck={false} onChange={(e) => setName(e.target.value)} />
              <span className="muted">.wav</span>
            </Field>
            <Row>
              <button onClick={preview} disabled={!frames} title={tr("Прослушать результат (с петлёй, если включена)")}>
                <Icon name={previewing ? "close" : "play"} /> {previewing ? tr("Стоп") : tr("Прослушать")}
              </button>
              <span className="grow" />
              <button
                className="primary"
                onClick={() => void exportWav()}
                disabled={!frames || !p.mapPath || !!busy}
                title={p.mapPath ? tr("Записать WAV в папку проекта карты sound/<карта>/ и добавить в контент") : tr("Сначала сохраните карту")}
              >
                <Icon name="save" /> {tr("Сохранить в карту")}
              </button>
            </Row>
          </>
        ) : (
          <Empty
            icon="edit"
            title={tr("Звук не открыт")}
            text={tr("Откройте файл с диска, запишите звук с микрофона или нажмите значок карандаша у звука игры, чтобы обрезать, зациклить и сохранить его в карту.")}
          />
        )}
        {p.exported && (
          <Row className="sound-exported">
            <span className="asset-chip" title={tr("Перетащите в вид, чтобы создать ambient_generic с этим звуком")} onMouseDown={(e) => p.onDragAsset?.("sound", p.exported!.name, e)}>
              <Icon name="bulb" size={12} /> {p.exported.name}
            </span>
            <span className="muted">
              {formatBytes(p.exported.bytes)}
              {p.exported.loop ? tr(", петля") : ""}
            </span>
            <span className="grow" />
            <button onClick={() => p.onPlace(p.exported!.name, p.exported!.loop)} title={tr("Поставить ambient_generic с этим звуком перед камерой (громкость 10, радиус 1250)")}>
              {tr("Разместить")}
            </button>
          </Row>
        )}
        {error && <div className="bad">{error}</div>}
      </Card>
    </PanelFrame>
  );
}

function mixDown(channels: Float32Array[]): Float32Array {
  const n = channels[0].length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}
