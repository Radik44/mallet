// The card that opens after a sound is dropped into the map: volume,
// radius, loop and pitch of the new ambient_generic, with a preview, so the
// sound is tuned where it was placed instead of in the key list.

import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { t, lazy } from "../i18n";

interface Props {
  id: number;
  name: string;
  /** Current keys of the entity. */
  keys: [string, string][];
  soundUrl: string;
  onKeys(changes: [string, string | null][]): void;
  onSelect(): void;
  onClose(): void;
}

const RADII = lazy(() => [
  { v: 512, label: t("Комната") },
  { v: 1250, label: t("Дом") },
  { v: 2500, label: t("Квартал") },
  { v: 5000, label: t("Вся карта") },
]);

const FLAG_EVERYWHERE = 1;
const FLAG_SILENT = 16;
const FLAG_NOT_LOOPED = 32;

export function SoundSetup({ id, name, keys, soundUrl, onKeys, onSelect, onClose }: Props) {
  const get = (k: string, d: string) => keys.find(([kk]) => kk.toLowerCase() === k)?.[1] ?? d;
  const [volume, setVolume] = useState(Number(get("health", "10")) || 10);
  const [radius, setRadius] = useState(Number(get("radius", "1250")) || 1250);
  const [pitch, setPitch] = useState(Number(get("pitch", "100")) || 100);
  const [flags, setFlags] = useState(Number(get("spawnflags", "0")) || 0);
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    return () => {
      audio.current?.pause();
    };
  }, []);

  const apply = (patch: { volume?: number; radius?: number; pitch?: number; flags?: number }) => {
    const changes: [string, string | null][] = [];
    if (patch.volume !== undefined) {
      setVolume(patch.volume);
      changes.push(["health", String(patch.volume)]);
    }
    if (patch.radius !== undefined) {
      setRadius(patch.radius);
      changes.push(["radius", String(patch.radius)]);
    }
    if (patch.pitch !== undefined) {
      setPitch(patch.pitch);
      changes.push(["pitch", String(patch.pitch)], ["pitchstart", String(patch.pitch)]);
    }
    if (patch.flags !== undefined) {
      setFlags(patch.flags);
      changes.push(["spawnflags", String(patch.flags)]);
    }
    if (changes.length) onKeys(changes);
    if (audio.current) {
      audio.current.volume = Math.max(0, Math.min(1, (patch.volume ?? volume) / 10));
      audio.current.loop = !((patch.flags ?? flags) & FLAG_NOT_LOOPED);
      audio.current.playbackRate = Math.max(0.5, Math.min(2, (patch.pitch ?? pitch) / 100));
    }
  };
  const toggle = (bit: number, on: boolean) => apply({ flags: on ? flags | bit : flags & ~bit });

  const preview = () => {
    if (playing) {
      audio.current?.pause();
      setPlaying(false);
      return;
    }
    if (!soundUrl) return;
    const a = new Audio(soundUrl);
    a.volume = volume / 10;
    a.loop = !(flags & FLAG_NOT_LOOPED);
    a.playbackRate = Math.max(0.5, Math.min(2, pitch / 100));
    a.onended = () => setPlaying(false);
    audio.current = a;
    void a.play().catch(() => setPlaying(false));
    setPlaying(true);
  };

  return (
    <div className="sound-setup">
      <div className="sound-setup-head">
        <Icon name="play" />
        <strong className="list-text" title={name}>
          {name.replace(/^sound\//, "")}
        </strong>
        <span className="muted">ambient_generic {id}</span>
        <span className="grow" />
        <button className="icon-btn" onClick={onClose} title={t("Готово")}>
          <Icon name="close" />
        </button>
      </div>
      <div className="sound-setup-row">
        <span>{t("Громкость")}</span>
        <input type="range" min={0} max={10} step={1} value={volume} onChange={(e) => apply({ volume: Number(e.target.value) })} />
        <span className="muted num">{volume}</span>
      </div>
      <div className="sound-setup-row">
        <span>{t("Радиус")}</span>
        <div className="asst-chips">
          {RADII.map((r) => (
            <button key={r.v} className={`chip${radius === r.v ? " on" : ""}`} onClick={() => apply({ radius: r.v })} title={t("{0} юнитов", [r.v])}>
              {r.label}
            </button>
          ))}
          <input type="number" className="num" value={radius} min={64} max={20000} onChange={(e) => apply({ radius: Number(e.target.value) || 1250 })} title={t("Радиус в юнитах")} />
        </div>
      </div>
      <div className="sound-setup-row">
        <span>{t("Высота")}</span>
        <input type="range" min={50} max={200} step={5} value={pitch} onChange={(e) => apply({ pitch: Number(e.target.value) })} title={t("Pitch: 100 - исходная высота")} />
        <span className="muted num">{pitch}%</span>
      </div>
      <div className="sound-setup-row flags">
        <label title={t("Звук воспроизводится циклически (фоновый шум, музыка)")}>
          <input type="checkbox" checked={!(flags & FLAG_NOT_LOOPED)} onChange={(e) => toggle(FLAG_NOT_LOOPED, !e.target.checked)} /> {t("Петля")}
        </label>
        <label title={t("Звук слышен на всей карте, без радиуса (музыка, объявления)")}>
          <input type="checkbox" checked={!!(flags & FLAG_EVERYWHERE)} onChange={(e) => toggle(FLAG_EVERYWHERE, e.target.checked)} /> {t("Везде")}
        </label>
        <label title={t("Звук не воспроизводится до получения входа PlaySound (для триггеров и кнопок)")}>
          <input type="checkbox" checked={!!(flags & FLAG_SILENT)} onChange={(e) => toggle(FLAG_SILENT, e.target.checked)} /> {t("Начать беззвучно")}
        </label>
      </div>
      <div className="sound-setup-actions">
        <button onClick={preview} disabled={!soundUrl} title={t("Прослушать с этой громкостью и высотой")}>
          <Icon name={playing ? "close" : "play"} /> {playing ? t("Стоп") : t("Прослушать")}
        </button>
        <button className="link" onClick={onSelect} title={t("Показать все ключи в инспекторе")}>
          {t("Все ключи")}
        </button>
        <span className="grow" />
        <button className="primary" onClick={onClose}>
          {t("Готово")}
        </button>
      </div>
    </div>
  );
}
