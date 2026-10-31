// WAV for Source: 16-bit PCM, and a `cue ` chunk when the sound should loop
// (the engine loops a WAV from its first cue point to the end).

import { t as tr } from "../i18n";

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bits: number;
  /** Frames (samples per channel). */
  frames: number;
  /** Sample of the first cue point, or null without one. */
  cue: number | null;
}

const ascii = (view: DataView, at: number, text: string) => {
  for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
};

/**
 * Encodes channels of -1..1 samples as 16-bit PCM. `loopStart` (a frame)
 * adds a cue point there, which makes the engine loop the sound.
 */
export function encodeWav(channels: Float32Array[], sampleRate: number, loopStart: number | null = null): Uint8Array {
  const nch = Math.max(1, channels.length);
  const frames = channels[0]?.length ?? 0;
  const dataBytes = frames * nch * 2;
  const cueBytes = loopStart !== null ? 8 + 4 + 24 : 0;
  const total = 12 + 24 + 8 + dataBytes + (dataBytes & 1) + cueBytes;
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);
  let p = 0;
  ascii(v, 0, "RIFF");
  v.setUint32(4, total - 8, true);
  ascii(v, 8, "WAVE");
  p = 12;
  ascii(v, p, "fmt ");
  v.setUint32(p + 4, 16, true);
  v.setUint16(p + 8, 1, true);
  v.setUint16(p + 10, nch, true);
  v.setUint32(p + 12, sampleRate, true);
  v.setUint32(p + 16, sampleRate * nch * 2, true);
  v.setUint16(p + 20, nch * 2, true);
  v.setUint16(p + 22, 16, true);
  p += 24;
  if (loopStart !== null) {
    ascii(v, p, "cue ");
    v.setUint32(p + 4, 4 + 24, true);
    v.setUint32(p + 8, 1, true);
    const c = p + 12;
    v.setUint32(c, 1, true); // id
    v.setUint32(c + 4, loopStart, true); // play order position
    ascii(v, c + 8, "data");
    v.setUint32(c + 12, 0, true); // chunk start
    v.setUint32(c + 16, 0, true); // block start
    v.setUint32(c + 20, loopStart, true); // sample offset
    p += cueBytes;
  }
  ascii(v, p, "data");
  v.setUint32(p + 4, dataBytes, true);
  p += 8;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] ?? 0));
      v.setInt16(p, s < 0 ? s * 32768 : s * 32767, true);
      p += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Reads the header of a WAV: format, length and the first cue point. */
export function parseWavInfo(bytes: Uint8Array): WavInfo | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number) => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));
  if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let p = 12;
  let sampleRate = 0;
  let channels = 0;
  let bits = 0;
  let dataBytes = 0;
  let cue: number | null = null;
  while (p + 8 <= bytes.length) {
    const id = tag(p);
    const size = v.getUint32(p + 4, true);
    const body = p + 8;
    if (id === "fmt " && size >= 16) {
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === "data") {
      dataBytes = size;
    } else if (id === "cue " && size >= 4) {
      const n = v.getUint32(body, true);
      if (n > 0 && size >= 4 + 24) cue = v.getUint32(body + 4 + 20, true);
    }
    p = body + size + (size & 1);
  }
  if (!sampleRate || !channels || !bits) return null;
  return { sampleRate, channels, bits, frames: dataBytes / (channels * (bits / 8)), cue };
}

/** Trims, fades and loops a buffer's channels into new channels, ready to encode. */
export function renderClip(channels: Float32Array[], sampleRate: number, o: { start: number; end: number; gain: number; fadeIn: number; fadeOut: number; crossfade: number }): Float32Array[] {
  const start = Math.max(0, Math.min(channels[0].length, Math.floor(o.start)));
  const end = Math.max(start, Math.min(channels[0].length, Math.floor(o.end)));
  const n = end - start;
  const fi = Math.min(n, Math.floor((o.fadeIn / 1000) * sampleRate));
  const fo = Math.min(n, Math.floor((o.fadeOut / 1000) * sampleRate));
  const xf = Math.min(Math.floor(n / 2), Math.floor((o.crossfade / 1000) * sampleRate));
  return channels.map((ch) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = ch[start + i] * o.gain;
      if (fi > 0 && i < fi) s *= i / fi;
      if (fo > 0 && i >= n - fo) s *= (n - i) / fo;
      out[i] = s;
    }
    // A seamless loop: the tail blends into the head over `crossfade`.
    if (xf > 0) {
      for (let i = 0; i < xf; i++) {
        const t = i / xf;
        const head = out[i];
        const tail = out[n - xf + i];
        out[i] = head * t + tail * (1 - t);
      }
      return out.subarray(0, n - xf).slice();
    }
    return out;
  });
}

/** Peak-normalises to `peak` (0..1); returns the gain applied. */
export function normalizeGain(channels: Float32Array[], peak = 0.95): number {
  let max = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]));
  return max > 1e-6 ? peak / max : 1;
}

/** Size on disk of the clip as 16-bit PCM, in bytes. */
export function wavSize(frames: number, channels: number): number {
  return 44 + frames * channels * 2;
}

export function formatBytes(n: number): string {
  return n >= 1 << 20 ? tr("{0} МБ", [(n / (1 << 20)).toFixed(2)]) : n >= 1024 ? tr("{0} КБ", [Math.round(n / 1024)]) : tr("{0} Б", [n]);
}
