import { describe, expect, it } from "vitest";
import { encodeWav, normalizeGain, parseWavInfo, renderClip, wavSize } from "./wav";

const tone = (n: number, f = 440, rate = 44100) => Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * f * i) / rate) * 0.5);

describe("wav", () => {
  it("round-trips the header, with and without a loop cue", () => {
    const left = tone(1000);
    const plain = parseWavInfo(encodeWav([left], 44100))!;
    expect(plain).toEqual({ sampleRate: 44100, channels: 1, bits: 16, frames: 1000, cue: null });
    const looped = parseWavInfo(encodeWav([left, left], 22050, 120))!;
    expect(looped.channels).toBe(2);
    expect(looped.frames).toBe(1000);
    expect(looped.cue).toBe(120);
    expect(wavSize(1000, 1)).toBe(2044);
    expect(encodeWav([left], 44100).length).toBe(2044);
  });

  it("writes 16-bit samples the way the engine reads them", () => {
    const bytes = encodeWav([Float32Array.from([0, 0.5, -0.5, 1, -1])], 8000);
    const v = new DataView(bytes.buffer);
    const data = 44;
    expect(v.getInt16(data, true)).toBe(0);
    expect(v.getInt16(data + 2, true)).toBe(16383);
    expect(v.getInt16(data + 4, true)).toBe(-16384);
    expect(v.getInt16(data + 6, true)).toBe(32767);
    expect(v.getInt16(data + 8, true)).toBe(-32768);
  });

  it("trims, fades and crossfades a clip", () => {
    const src = Float32Array.from({ length: 100 }, () => 1);
    const out = renderClip([src], 1000, { start: 10, end: 60, gain: 0.5, fadeIn: 10, fadeOut: 10, crossfade: 0 })[0];
    expect(out.length).toBe(50);
    expect(out[0]).toBe(0);
    expect(out[25]).toBeCloseTo(0.5);
    expect(out[49]).toBeCloseTo(0.05);
    const looped = renderClip([src], 1000, { start: 0, end: 100, gain: 1, fadeIn: 0, fadeOut: 0, crossfade: 20 })[0];
    expect(looped.length).toBe(80);
    expect(looped[0]).toBeCloseTo(1);
    expect(normalizeGain([Float32Array.from([0.25, -0.5])])).toBeCloseTo(1.9);
    expect(parseWavInfo(new Uint8Array(4))).toBeNull();
  });
});
