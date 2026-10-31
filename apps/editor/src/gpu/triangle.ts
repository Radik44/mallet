// Smallest possible WebGPU proof: a rotating triangle with one uniform buffer.
// Its only job in phase 0 is to confirm the WebView2 + WebGPU path works on
// real machines before any real rendering code is written.

import { t } from "../i18n";

export interface GpuReport {
  ok: boolean;
  message: string;
  adapter?: string;
}

export type Stop = () => void;

const SHADER = /* wgsl */ `
struct Params {
  time: f32,
  aspect: f32,
  _pad: vec2f,
};
@group(0) @binding(0) var<uniform> params: Params;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2f, 3>(
    vec2f(0.0, 0.6),
    vec2f(-0.55, -0.45),
    vec2f(0.55, -0.45),
  );
  var c = array<vec3f, 3>(
    vec3f(1.0, 0.45, 0.2),
    vec3f(0.3, 0.9, 0.5),
    vec3f(0.35, 0.55, 1.0),
  );
  let a = params.time * 0.6;
  let r = mat2x2f(cos(a), sin(a), -sin(a), cos(a));
  var q = r * p[i];
  q.x = q.x / params.aspect;
  var out: VSOut;
  out.pos = vec4f(q, 0.0, 1.0);
  out.color = c[i];
  return out;
}

@fragment
fn fs(@location(0) color: vec3f) -> @location(0) vec4f {
  return vec4f(color, 1.0);
}
`;

function describeAdapter(adapter: GPUAdapter): string {
  const info = adapter.info;
  if (!info) return "adapter info unavailable";
  const parts = [info.vendor, info.architecture, info.device, info.description].filter(Boolean);
  return parts.length ? parts.join(" · ") : "adapter info empty";
}

export async function startTriangle(canvas: HTMLCanvasElement): Promise<{ report: GpuReport; stop: Stop }> {
  const noop = () => {};

  if (!navigator.gpu) {
    return {
      report: {
        ok: false,
        message: t("WebGPU недоступен: navigator.gpu не определён в этом WebView"),
      },
      stop: noop,
    };
  }

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    return {
      report: { ok: false, message: t("WebGPU: requestAdapter вернул null (нет подходящего GPU)") },
      stop: noop,
    };
  }

  const device = await adapter.requestDevice();
  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    return {
      report: { ok: false, message: t("WebGPU: canvas.getContext('webgpu') вернул null") },
      stop: noop,
    };
  }

  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: "opaque" });

  const module = device.createShaderModule({ code: SHADER });
  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: { module, entryPoint: "vs" },
    fragment: { module, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list" },
  });

  const uniform = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniform } }],
  });

  const params = new Float32Array(4);
  const start = performance.now();
  let raf = 0;

  const resize = () => {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const frame = () => {
    resize();
    params[0] = (performance.now() - start) / 1000;
    params[1] = canvas.width / canvas.height;
    device.queue.writeBuffer(uniform, 0, params);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          clearValue: { r: 0.086, g: 0.09, b: 0.106, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  device.lost.then((info) => {
    if (info.reason !== "destroyed") console.error("WebGPU device lost:", info.message);
  });

  return {
    report: { ok: true, message: t("WebGPU работает"), adapter: describeAdapter(adapter) },
    stop: () => {
      cancelAnimationFrame(raf);
      device.destroy();
    },
  };
}
