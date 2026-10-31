// WebGPU renderer for the viewer: one indexed brush mesh with one draw per
// material, flat-coloured entity boxes, textures streamed from the shell's
// asset protocol, an id pass for picking, and Hammer-style 2D views with
// grid and wireframe.

import type { MaterialInfo } from "../tauri";
import { api, textureUrl } from "../tauri";
import type { MeshBuffers } from "../map/loader";
import type { FlyCamera } from "./camera";
import type { OrthoCamera } from "./camera2d";
import type { EntityBoxes } from "./entities";
import {
  BRUSH_SHADER,
  ENTITY_SHADER,
  GRID_SHADER,
  ID_SHADER,
  LINES_SHADER,
  MATERIAL_FLAG_ALPHA_TEST,
  MATERIAL_FLAG_MISSING,
  MATERIAL_FLAG_TOOL,
  MATERIAL_FLAG_TRANSLUCENT,
  MATERIAL_FLAG_BLEND,
  ID_MODEL_SHADER,
  MODEL_SHADER,
  NO_PICK,
  SHADOW_MODEL_SHADER,
  SHADOW_SHADER,
} from "./shaders";
import type { ModelData } from "./models";
import { mat4, vec3 } from "wgpu-matrix";
import { effectiveDpr } from "./dpi";
import { t as tr } from "../i18n";

/** Bytes the renderer holds on the GPU, by what holds them. */
export interface RenderMemory {
  geometry: number;
  models: number;
  textures: number;
  textureCount: number;
  modelTriangles: number;
  modelInstances: number;
  uniqueModels: number;
}

/** Clear colours of the views, so a skin can restyle the canvases. */
export interface Palette {
  bg3d: [number, number, number];
  bg2d: [number, number, number];
}

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  entities: number;
  /** Studio models uploaded and the prop instances drawn from them. */
  models: number;
  props: number;
  texturesLoaded: number;
  texturesMissing: number;
  texturesPending: number;
  frameMs: number;
}

type TextureState = "pending" | "loaded" | "missing";

interface MaterialSlot {
  name: string;
  info: MaterialInfo | null;
  uniform: GPUBuffer;
  bindGroup: GPUBindGroup;
  blended: boolean;
  /** Editor icon: unlit, alpha-blended, drawn as a billboard. */
  sprite: boolean;
  state: TextureState;
  texture: GPUTexture | null;
  /** WorldVertexTransition's second texture, once loaded. */
  texture2: GPUTexture | null;
}

interface Mesh {
  /** CPU copies of the index and face-id arrays, for picking out the triangles of given faces. */
  cpuIndices: Uint32Array;
  cpuFaceIds: Uint32Array;
  positions: GPUBuffer;
  normals: GPUBuffer;
  texcoords: GPUBuffer;
  alphas: GPUBuffer;
  luxels: GPUBuffer;
  pickIds: GPUBuffer;
  indices: GPUBuffer;
  edges: GPUBuffer;
  edgeObjects: GPUBuffer;
  edgeColors: GPUBuffer;
  edgeVertexCount: number;
  ranges: Uint32Array;
  slots: MaterialSlot[];
  triangles: number;
  faceCount: number;
  solidCount: number;
}

interface Entities {
  positions: GPUBuffer;
  normals: GPUBuffer;
  colors: GPUBuffer;
  pickIds: GPUBuffer;
  vertexCount: number;
  edges: GPUBuffer;
  edgeObjects: GPUBuffer;
  edgeColors: GPUBuffer;
  edgeVertexCount: number;
  count: number;
}

/** One uploaded studio model and the instances placed from it. */
interface GpuModel {
  positions: GPUBuffer;
  normals: GPUBuffer;
  uvs: GPUBuffer;
  indices: GPUBuffer;
  /** Per material mesh: its slot and index range. */
  ranges: { slot: MaterialSlot; first: number; count: number }[];
  triangles: number;
  instances: GPUBuffer | null;
  instanceCount: number;
  mins: [number, number, number];
  maxs: [number, number, number];
}

/** A prop to draw: which model, where, and the entity's pick id. */
export interface ModelInstance {
  model: string;
  /** Column-major 4×4 placement. */
  matrix: Float32Array;
  pickId: number;
}

/** Bytes per instance: a 4×4 float matrix and a u32 pick id, padded. */
const INSTANCE_BYTES = 80;

/** A line list drawn on top of the scene, in 2D views and/or the 3D view. */
interface Overlay {
  positions: GPUBuffer;
  objects: GPUBuffer;
  colors: GPUBuffer;
  vertexCount: number;
  in2D: boolean;
  in3D: boolean;
}

export type OverlayWhere = "all" | "2d" | "3d";

export interface View2D {
  canvas: HTMLCanvasElement;
  ctx: GPUCanvasContext;
  camera: OrthoCamera;
  gridUniform: GPUBuffer;
  gridBindGroup: GPUBindGroup;
  cameraUniform: GPUBuffer;
}

const CAMERA_BYTES = 192;
/** Shadow map side in texels; 2048 covers a 16k map at 8 units per texel. */
const SHADOW_SIZE = 2048;
const MATERIAL_BYTES = 32;
const GRID_BYTES = 32;

export class Renderer {
  readonly adapterInfo: string;
  readonly hasBc: boolean;
  private depth: GPUTexture | null = null;
  private depthSize = [0, 0];
  private idTexture: GPUTexture | null = null;
  private idSize = [0, 0];
  private mesh: Mesh | null = null;
  /**
   * Faces drawn again with another material while one is dragged over them:
   * a render-side preview that leaves the document alone, so moving the
   * cursor costs one small index upload instead of two edits and a full
   * mesh rebuild.
   */
  private matPreview: { slot: MaterialSlot; indices: GPUBuffer; count: number } | null = null;
  /** One extra instance of a model that follows the cursor while the model is dragged from the browser. */
  private ghost: { key: string; instances: GPUBuffer; count: number; capacity: number } | null = null;
  private opaqueOver!: GPURenderPipeline;
  private entities: Entities | null = null;
  /** Object index per pick id: faces then entities. */
  private pickObject: GPUBuffer;
  /** Lighting preview records; a zero header when the map has no lights. */
  private lightBuffer: GPUBuffer;
  /** The packed light records, kept to aim the sun's shadow camera. */
  private lightsData: Float32Array = new Float32Array(32);
  /** Sun shadow map: the depth texture, its uniform, a dummy for the pass that renders it. */
  private shadowMap!: GPUTexture;
  private shadowDummy!: GPUTexture;
  private shadowUniform!: GPUBuffer;
  private shadowSampler!: GPUSampler;
  private shadowCameraBuffer!: GPUBuffer;
  private sceneBindGroupShadow!: GPUBindGroup;
  private shadowBrushPipeline!: GPURenderPipeline;
  private shadowModelPipeline!: GPURenderPipeline;
  /** World bounds of the brush mesh, for the sun camera. */
  private meshBounds: [[number, number, number], [number, number, number]] | null = null;
  /** Selection bits per object: solids then entities. */
  private objectState: GPUBuffer;
  private objectCount = 0;
  private sceneBindGroup!: GPUBindGroup;
  private readonly cameraBuffer: GPUBuffer;
  private readonly sceneLayout: GPUBindGroupLayout;
  private readonly materialLayout: GPUBindGroupLayout;
  private readonly gridLayout: GPUBindGroupLayout;
  private readonly opaque: GPURenderPipeline;
  private readonly blended: GPURenderPipeline;
  private readonly entityPipeline: GPURenderPipeline;
  private readonly modelPipeline: GPURenderPipeline;
  private readonly modelBlendedPipeline: GPURenderPipeline;
  private readonly idModelPipeline: GPURenderPipeline;
  private readonly idBrushPipeline: GPURenderPipeline;
  private readonly idEntityPipeline: GPURenderPipeline;
  /** Uploaded studio models by name (with skin), shared by their instances. */
  private models = new Map<string, GpuModel>();
  private propCount = 0;
  /** Background colours; a skin changes them. */
  palette: Palette = { bg3d: [0.1, 0.1, 0.1], bg2d: [0.094, 0.094, 0.094] };
  /** The light theme's backgrounds: a pale 3D sky and a paper-white 2D grid. */
  paletteLight: Palette = { bg3d: [0.72, 0.72, 0.72], bg2d: [0.8, 0.8, 0.8] };

  /** The theme the views draw in: the document's `data-theme`, read once per frame. */
  private lightTheme(): boolean {
    return typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
  }
  /** Pick id whose object slot is never selected, for previews and overlays. */
  private sparePick = 0;
  private readonly linesPipeline: GPURenderPipeline;
  /** Lines drawn on top of the 3D scene (pass with depth attachment, no test). */
  private readonly linesOverlayPipeline: GPURenderPipeline;
  private readonly gridPipeline: GPURenderPipeline;
  /** Unreal's game view (G): the 3D view leaves out entity boxes and icons, tool brushes and helper lines, and shows the map as a player will. */
  gameView = false;
  /** Named line overlays: block preview, transform preview, 3D gizmo. */
  private overlays = new Map<string, Overlay>();
  /** Loaded textures by material name, shared across mesh rebuilds. */
  private textureCache = new Map<string, GPUTexture>();
  private readonly sampler: GPUSampler;
  private readonly pendingTexture: GPUTexture;
  private readonly missingTexture: GPUTexture;
  private hoverPick = NO_PICK;
  /** 3D view mode: 0 textured, 1 flat, 2 wireframe. */
  private viewMode = 0;
  /** Column-major 4×4 applied to previewed objects' vertices. */
  private previewMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  private selected: Set<number> = new Set();
  private culled: Set<number> = new Set();
  private previewObjects: Set<number> = new Set();
  private lastFrameMs = 0;
  private disposed = false;
  private pickInFlight: Promise<number | null> | null = null;
  private views: View2D[] = [];

  private constructor(
    private readonly device: GPUDevice,
    private readonly ctx: GPUCanvasContext,
    private readonly canvas: HTMLCanvasElement,
    private readonly format: GPUTextureFormat,
    adapterInfo: string,
    hasBc: boolean,
  ) {
    this.adapterInfo = adapterInfo;
    this.hasBc = hasBc;

    this.sceneLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
      ],
    });
    this.materialLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
      ],
    });
    this.gridLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } }],
    });

    const sceneOnly = device.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] });
    const depthStencil = (write: boolean): GPUDepthStencilState => ({
      format: "depth24plus",
      depthWriteEnabled: write,
      depthCompare: "less",
    });

    const brushModule = device.createShaderModule({ code: BRUSH_SHADER });
    const brushLayout = device.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout, this.materialLayout] });
    const vec3Buf = (loc: number): GPUVertexBufferLayout => ({ arrayStride: 12, attributes: [{ shaderLocation: loc, offset: 0, format: "float32x3" }] });
    const vec2Buf = (loc: number): GPUVertexBufferLayout => ({ arrayStride: 8, attributes: [{ shaderLocation: loc, offset: 0, format: "float32x2" }] });
    const u32Buf = (loc: number): GPUVertexBufferLayout => ({ arrayStride: 4, attributes: [{ shaderLocation: loc, offset: 0, format: "uint32" }] });
    const f32Buf = (loc: number): GPUVertexBufferLayout => ({ arrayStride: 4, attributes: [{ shaderLocation: loc, offset: 0, format: "float32" }] });
    const brushBuffers = [vec3Buf(0), vec3Buf(1), vec2Buf(2), u32Buf(3), f32Buf(4), vec2Buf(5)];
    this.opaque = device.createRenderPipeline({
      layout: brushLayout,
      vertex: { module: brushModule, entryPoint: "vs", buffers: brushBuffers },
      fragment: { module: brushModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: depthStencil(true),
    });
    // Same as `opaque` but passes the depth test on equal depth: the preview
    // faces lie exactly on the faces already drawn.
    this.opaqueOver = device.createRenderPipeline({
      layout: brushLayout,
      vertex: { module: brushModule, entryPoint: "vs", buffers: brushBuffers },
      fragment: { module: brushModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less-equal" },
    });
    this.blended = device.createRenderPipeline({
      layout: brushLayout,
      vertex: { module: brushModule, entryPoint: "vs", buffers: brushBuffers },
      fragment: {
        module: brushModule,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: depthStencil(false),
    });

    const entityModule = device.createShaderModule({ code: ENTITY_SHADER });
    const entityBuffers = [vec3Buf(0), vec3Buf(1), vec3Buf(2), u32Buf(3)];
    this.entityPipeline = device.createRenderPipeline({
      layout: sceneOnly,
      vertex: { module: entityModule, entryPoint: "vs", buffers: entityBuffers },
      fragment: { module: entityModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: depthStencil(true),
    });

    const modelModule = device.createShaderModule({ code: MODEL_SHADER });
    const instanceBuffer: GPUVertexBufferLayout = {
      arrayStride: INSTANCE_BYTES,
      stepMode: "instance",
      attributes: [
        { shaderLocation: 4, offset: 0, format: "float32x4" },
        { shaderLocation: 5, offset: 16, format: "float32x4" },
        { shaderLocation: 6, offset: 32, format: "float32x4" },
        { shaderLocation: 7, offset: 48, format: "float32x4" },
        { shaderLocation: 8, offset: 64, format: "uint32" },
      ],
    };
    const modelBuffers = [vec3Buf(0), vec3Buf(1), vec2Buf(2), instanceBuffer];
    this.modelPipeline = device.createRenderPipeline({
      layout: brushLayout,
      vertex: { module: modelModule, entryPoint: "vs", buffers: modelBuffers },
      fragment: { module: modelModule, entryPoint: "fs", targets: [{ format }] },
      // Studio models wind the other way round from brushes.
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "cw" },
      depthStencil: depthStencil(true),
    });
    this.modelBlendedPipeline = device.createRenderPipeline({
      layout: brushLayout,
      vertex: { module: modelModule, entryPoint: "vs", buffers: modelBuffers },
      fragment: {
        module: modelModule,
        entryPoint: "fs",
        targets: [
          {
            format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: depthStencil(false),
    });
    const idModelModule = device.createShaderModule({ code: ID_MODEL_SHADER });
    this.idModelPipeline = device.createRenderPipeline({
      layout: sceneOnly,
      vertex: { module: idModelModule, entryPoint: "vs", buffers: [vec3Buf(0), instanceBuffer] },
      fragment: { module: idModelModule, entryPoint: "fs", targets: [{ format: "r32uint" }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "cw" },
      depthStencil: depthStencil(true),
    });

    const idModule = device.createShaderModule({ code: ID_SHADER });
    const idPipeline = (buffers: GPUVertexBufferLayout[]) =>
      device.createRenderPipeline({
        layout: sceneOnly,
        vertex: { module: idModule, entryPoint: "vs", buffers },
        fragment: { module: idModule, entryPoint: "fs", targets: [{ format: "r32uint" }] },
        primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
        depthStencil: depthStencil(true),
      });
    this.idBrushPipeline = idPipeline(brushBuffers);
    this.idEntityPipeline = idPipeline(entityBuffers);

    // Depth-only pipelines for the sun's shadow map; both faces, the bias handles acne.
    const shadowDepth: GPUDepthStencilState = { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" };
    this.shadowBrushPipeline = device.createRenderPipeline({
      layout: sceneOnly,
      vertex: { module: device.createShaderModule({ code: SHADOW_SHADER }), entryPoint: "vs", buffers: [vec3Buf(0), u32Buf(3)] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: shadowDepth,
    });
    this.shadowModelPipeline = device.createRenderPipeline({
      layout: sceneOnly,
      vertex: { module: device.createShaderModule({ code: SHADOW_MODEL_SHADER }), entryPoint: "vs", buffers: [vec3Buf(0), instanceBuffer] },
      primitive: { topology: "triangle-list", cullMode: "none" },
      depthStencil: shadowDepth,
    });
    this.shadowMap = device.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: "depth32float", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
    this.shadowDummy = device.createTexture({ size: [1, 1], format: "depth32float", usage: GPUTextureUsage.TEXTURE_BINDING });
    this.shadowUniform = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.shadowSampler = device.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" });
    this.shadowCameraBuffer = device.createBuffer({ size: CAMERA_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

    const linesModule = device.createShaderModule({ code: LINES_SHADER });
    const linesBuffers = [vec3Buf(0), u32Buf(1), vec3Buf(2)];
    this.linesPipeline = device.createRenderPipeline({
      layout: sceneOnly,
      vertex: { module: linesModule, entryPoint: "vs", buffers: linesBuffers },
      fragment: { module: linesModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "line-list" },
    });
    this.linesOverlayPipeline = device.createRenderPipeline({
      layout: sceneOnly,
      vertex: { module: linesModule, entryPoint: "vs", buffers: linesBuffers },
      fragment: { module: linesModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "line-list" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: false, depthCompare: "always" },
    });

    const gridModule = device.createShaderModule({ code: GRID_SHADER });
    this.gridPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.gridLayout] }),
      vertex: { module: gridModule, entryPoint: "vs" },
      fragment: { module: gridModule, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });

    this.cameraBuffer = device.createBuffer({ size: CAMERA_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pickObject = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.lightBuffer = device.createBuffer({ size: 128, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.objectState = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.rebuildSceneBindGroups();
    this.sampler = device.createSampler({
      addressModeU: "repeat",
      addressModeV: "repeat",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      maxAnisotropy: 8,
    });
    this.pendingTexture = this.checker([90, 90, 96], [120, 120, 128]);
    this.missingTexture = this.checker([255, 0, 255], [0, 0, 0]);
  }

  static async create(canvas: HTMLCanvasElement): Promise<Renderer> {
    if (!navigator.gpu) throw new Error(tr("WebGPU недоступен: navigator.gpu не определён"));
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error(tr("WebGPU: requestAdapter вернул null"));
    const hasBc = adapter.features.has("texture-compression-bc");
    const device = await adapter.requestDevice({
      requiredFeatures: hasBc ? ["texture-compression-bc"] : [],
    });
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error(tr("WebGPU: canvas context недоступен"));
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: "opaque" });
    const info = adapter.info;
    const desc = info ? [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" · ") : "unknown";
    device.lost.then((l) => {
      if (l.reason !== "destroyed") console.error("WebGPU device lost:", l.message);
    });
    // Validation errors otherwise vanish in the webview console; mirror them to the shell log.
    device.addEventListener("uncapturederror", (ev) => {
      const message = (ev as GPUUncapturedErrorEvent).error.message;
      console.error("WebGPU:", message);
      void api.log(`webgpu error: ${message.slice(0, 600)}`);
    });
    return new Renderer(device, ctx, canvas, format, desc, hasBc);
  }

  /** Registers a 2D view canvas; it is rendered every frame while it has a size. */
  attach2D(canvas: HTMLCanvasElement, camera: OrthoCamera): View2D {
    const ctx = canvas.getContext("webgpu");
    if (!ctx) throw new Error(tr("WebGPU: 2D canvas context недоступен"));
    ctx.configure({ device: this.device, format: this.format, alphaMode: "opaque" });
    const gridUniform = this.device.createBuffer({ size: GRID_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const cameraUniform = this.device.createBuffer({ size: CAMERA_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const view: View2D = {
      canvas,
      ctx,
      camera,
      gridUniform,
      gridBindGroup: this.device.createBindGroup({ layout: this.gridLayout, entries: [{ binding: 0, resource: { buffer: gridUniform } }] }),
      cameraUniform,
    };
    this.views.push(view);
    return view;
  }

  detach2D(view: View2D) {
    this.views = this.views.filter((v) => v !== view);
    view.ctx.unconfigure();
    view.gridUniform.destroy();
    view.cameraUniform.destroy();
  }

  private checker(a: [number, number, number], b: [number, number, number]): GPUTexture {
    const size = 8;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const c = ((x >> 2) + (y >> 2)) % 2 === 0 ? a : b;
        data.set([c[0], c[1], c[2], 255], (y * size + x) * 4);
      }
    }
    const tex = this.device.createTexture({
      size: [size, size],
      format: "rgba8unorm-srgb",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: size * 4 }, [size, size]);
    return tex;
  }

  private makeSceneBindGroup(cameraBuffer: GPUBuffer, shadowView?: GPUTextureView): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: cameraBuffer } },
        { binding: 1, resource: { buffer: this.pickObject } },
        { binding: 2, resource: { buffer: this.objectState } },
        { binding: 3, resource: { buffer: this.lightBuffer } },
        { binding: 4, resource: { buffer: this.shadowUniform } },
        { binding: 5, resource: shadowView ?? this.shadowMap.createView() },
        { binding: 6, resource: this.shadowSampler },
      ],
    });
  }

  /** The main scene group samples the shadow map; the shadow pass's own group must not. */
  private rebuildSceneBindGroups() {
    this.sceneBindGroup = this.makeSceneBindGroup(this.cameraBuffer);
    this.sceneBindGroupShadow = this.makeSceneBindGroup(this.shadowCameraBuffer, this.shadowDummy.createView());
  }

  /** Replaces the lighting preview records (see lights.ts) and rebinds the scene. */
  setLights(data: Float32Array) {
    this.lightBuffer.destroy();
    this.lightBuffer = this.upload(data.length ? data : new Float32Array(32), GPUBufferUsage.STORAGE);
    this.lightsData = data.length ? data : new Float32Array(32);
    this.rebuildSceneBindGroups();
  }

  private upload(data: Float32Array | Uint32Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buf = this.device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage: usage | GPUBufferUsage.COPY_DST });
    if (data.byteLength > 0) this.device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
    return buf;
  }

  /** Uploads a mesh; material infos may be null while the shell is still mounting content. */
  setMesh(mesh: MeshBuffers, infos: (MaterialInfo | null)[]) {
    // Keep loaded textures across material-list changes (an edit that adds
    // or drops a material must not reload everything).
    this.clearMesh(true);
    const slots: MaterialSlot[] = mesh.materials.map((name, i) => this.createSlot(name, infos[i] ?? null));
    const modelNames = new Set<string>();
    for (const m of this.models.values()) for (const r of m.ranges) modelNames.add(r.slot.name);
    for (const [name, tex] of Array.from(this.textureCache)) {
      const base = name.endsWith("#2") ? name.slice(0, -2) : name;
      if (!slots.some((s) => s.name === base) && !modelNames.has(base)) {
        tex.destroy();
        this.textureCache.delete(name);
      }
    }
    const faceCount = mesh.faceTable.length / 4;
    const edgeColors = new Float32Array(mesh.edges.length).fill(0.82);
    this.meshBounds = Renderer.boundsOf(mesh.positions);
    this.mesh = {
      cpuIndices: mesh.indices,
      cpuFaceIds: mesh.faceIds,
      positions: this.upload(mesh.positions, GPUBufferUsage.VERTEX),
      normals: this.upload(mesh.normals, GPUBufferUsage.VERTEX),
      texcoords: this.upload(mesh.texcoords, GPUBufferUsage.VERTEX),
      alphas: this.upload(mesh.alphas, GPUBufferUsage.VERTEX),
      luxels: this.upload(mesh.luxels, GPUBufferUsage.VERTEX),
      pickIds: this.upload(mesh.faceIds, GPUBufferUsage.VERTEX),
      indices: this.upload(mesh.indices, GPUBufferUsage.INDEX),
      edges: this.upload(mesh.edges, GPUBufferUsage.VERTEX),
      edgeObjects: this.upload(mesh.edgeSolids, GPUBufferUsage.VERTEX),
      edgeColors: this.upload(edgeColors, GPUBufferUsage.VERTEX),
      edgeVertexCount: mesh.edges.length / 3,
      ranges: mesh.ranges,
      slots,
      triangles: mesh.indices.length / 3,
      faceCount,
      solidCount: mesh.solidIds.length,
    };
    this.hoverPick = NO_PICK;
    this.rebuildPickTables(mesh.faceTable, null);
    for (const slot of slots) if (slot.state === "pending") void this.loadTexture(slot);
  }

  /** Uploads point entity boxes (after the mesh, since pick ids follow faces). */
  setEntities(boxes: EntityBoxes | null, faceTable: Uint32Array) {
    this.clearEntities();
    if (boxes && boxes.count > 0) {
      this.entities = {
        positions: this.upload(boxes.positions, GPUBufferUsage.VERTEX),
        normals: this.upload(boxes.normals, GPUBufferUsage.VERTEX),
        colors: this.upload(boxes.colors, GPUBufferUsage.VERTEX),
        pickIds: this.upload(boxes.pickIds, GPUBufferUsage.VERTEX),
        vertexCount: boxes.count * 36,
        edges: this.upload(boxes.edges, GPUBufferUsage.VERTEX),
        edgeObjects: this.upload(boxes.edgeObjects, GPUBufferUsage.VERTEX),
        edgeColors: this.upload(boxes.edgeColors, GPUBufferUsage.VERTEX),
        edgeVertexCount: boxes.count * 24,
        count: boxes.count,
      };
    }
    this.rebuildPickTables(faceTable, this.entities);
  }

  /** Whether a model (by cache key) is uploaded. */
  hasModel(key: string): boolean {
    return this.models.has(key);
  }

  /** Hammer's 3D view modes: textured, flat (one grey per face) or wireframe. */
  setViewMode(mode: "textured" | "flat" | "wireframe" | "lightmap" | "lighting") {
    this.viewMode = mode === "flat" ? 1 : mode === "wireframe" ? 2 : mode === "lightmap" ? 3 : mode === "lighting" ? 4 : 0;
  }

  /** Frees a model's buffers (its instances go with it). */
  removeModel(key: string) {
    if (this.ghost?.key === key) this.setGhostModel(null);
    const m = this.models.get(key);
    if (!m) return;
    m.positions.destroy();
    m.normals.destroy();
    m.uvs.destroy();
    m.indices.destroy();
    m.instances?.destroy();
    this.models.delete(key);
  }

  /** Uploads a studio model once; `infos` are the material infos by name. */
  addModel(key: string, data: ModelData, infos: Map<string, MaterialInfo>) {
    if (this.models.has(key)) return;
    let vertexCount = 0;
    let indexCount = 0;
    for (const m of data.meshes) {
      vertexCount += m.positions.length / 3;
      indexCount += m.indices.length;
    }
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(indexCount);
    const ranges: GpuModel["ranges"] = [];
    let v = 0;
    let i = 0;
    for (const m of data.meshes) {
      positions.set(m.positions, v * 3);
      normals.set(m.normals, v * 3);
      // The model shader samples 0..1; brush-style texel coordinates
      // (instances, overlays) are divided by the material size first.
      const info = infos.get(m.material) ?? null;
      const w = data.texels ? (info && info.width > 0 ? info.width : 64) : 1;
      const h = data.texels ? (info && info.height > 0 ? info.height : 64) : 1;
      for (let k = 0; k < m.uvs.length; k += 2) {
        uvs[v * 2 + k] = m.uvs[k] / w;
        uvs[v * 2 + k + 1] = m.uvs[k + 1] / h;
      }
      for (let k = 0; k < m.indices.length; k++) indices[i + k] = m.indices[k] + v;
      const slot = this.createSlot(m.material, info, !!data.sprite);
      ranges.push({ slot, first: i, count: m.indices.length });
      v += m.positions.length / 3;
      i += m.indices.length;
    }
    const model: GpuModel = {
      positions: this.upload(positions, GPUBufferUsage.VERTEX),
      normals: this.upload(normals, GPUBufferUsage.VERTEX),
      uvs: this.upload(uvs, GPUBufferUsage.VERTEX),
      indices: this.upload(indices, GPUBufferUsage.INDEX),
      ranges,
      triangles: indexCount / 3,
      instances: null,
      instanceCount: 0,
      mins: data.mins,
      maxs: data.maxs,
    };
    this.models.set(key, model);
    for (const r of ranges) if (r.slot.state === "pending") void this.loadTexture(r.slot);
  }

  /** Replaces every prop instance; models without instances stay uploaded. */
  setModelInstances(list: ModelInstance[]) {
    const byModel = new Map<string, ModelInstance[]>();
    for (const inst of list) {
      const arr = byModel.get(inst.model);
      if (arr) arr.push(inst);
      else byModel.set(inst.model, [inst]);
    }
    this.propCount = 0;
    for (const [key, model] of this.models) {
      model.instances?.destroy();
      model.instances = null;
      model.instanceCount = 0;
      const arr = byModel.get(key);
      if (!arr || !arr.length) continue;
      const buf = new ArrayBuffer(arr.length * INSTANCE_BYTES);
      const f = new Float32Array(buf);
      const u = new Uint32Array(buf);
      arr.forEach((inst, n) => {
        f.set(inst.matrix, n * (INSTANCE_BYTES / 4));
        u[n * (INSTANCE_BYTES / 4) + 16] = inst.pickId;
      });
      const gpu = this.device.createBuffer({ size: buf.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(gpu, 0, buf);
      model.instances = gpu;
      model.instanceCount = arr.length;
      this.propCount += arr.length;
    }
  }

  /**
   * Renders an uploaded model alone, from a three-quarter view, into a
   * square PNG data URL for the model browser.
   */
  async renderModelPreview(key: string, size = 192, yaw = 0, pitch = 0): Promise<string | null> {
    const model = this.models.get(key);
    if (!model || this.disposed) return null;
    const lo = model.mins;
    const hi = model.maxs;
    const centre = vec3.create((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    const radius = Math.max(1, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
    // The default eye sits front-left and above; yaw and pitch (degrees) turn it around the model.
    // Far away with a narrow lens, so a barrel stays a barrel instead of a cone.
    const dist = radius * 5.2;
    const az = Math.atan2(-2.0, -1.6) + (yaw * Math.PI) / 180;
    const el = Math.max(-1.4, Math.min(1.4, Math.asin(1.2 / Math.hypot(1.6, 2.0, 1.2)) + (pitch * Math.PI) / 180));
    const eye = vec3.create(centre[0] + dist * Math.cos(el) * Math.cos(az), centre[1] + dist * Math.cos(el) * Math.sin(az), centre[2] + dist * Math.sin(el));
    const view = mat4.lookAt(eye, centre, vec3.create(0, 0, 1));
    const proj = mat4.perspective((24 * Math.PI) / 180, 1, radius * 0.05, radius * 20);
    const viewProj = mat4.multiply(proj, view);
    const camera = this.device.createBuffer({ size: CAMERA_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.writeCamera(camera, viewProj, eye);
    const bindGroup = this.makeSceneBindGroup(camera);
    // One instance at the origin with the spare pick id (never tinted).
    const inst = new ArrayBuffer(INSTANCE_BYTES);
    new Float32Array(inst).set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    new Uint32Array(inst)[16] = this.sparePick;
    const instances = this.device.createBuffer({ size: INSTANCE_BYTES, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(instances, 0, inst);
    const color = this.device.createTexture({ size: [size, size], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const depth = this.device.createTexture({ size: [size, size], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: color.createView(), clearValue: { r: 0.16, g: 0.17, b: 0.2, a: 1 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depth.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    pass.setBindGroup(0, bindGroup);
    for (const mode of ["opaque", "blended"] as const) {
      pass.setPipeline(mode === "opaque" ? this.modelPipeline : this.modelBlendedPipeline);
      pass.setVertexBuffer(0, model.positions);
      pass.setVertexBuffer(1, model.normals);
      pass.setVertexBuffer(2, model.uvs);
      pass.setVertexBuffer(3, instances);
      pass.setIndexBuffer(model.indices, "uint32");
      for (const r of model.ranges) {
        if ((mode === "opaque") === r.slot.blended) continue;
        pass.setBindGroup(1, r.slot.bindGroup);
        pass.drawIndexed(r.count, 1, r.first);
      }
    }
    pass.end();
    const png = await this.readbackPng(color, size, size, encoder);
    depth.destroy();
    instances.destroy();
    camera.destroy();
    return png;
  }

  /** Drops every uploaded model (a new map). */
  clearModels() {
    this.setGhostModel(null);
    for (const m of this.models.values()) {
      for (const b of [m.positions, m.normals, m.uvs, m.indices]) b.destroy();
      m.instances?.destroy();
      for (const r of m.ranges) r.slot.uniform.destroy();
    }
    this.models.clear();
    this.propCount = 0;
  }

  /** Every material slot in use: brushes and models. */
  private allSlots(): MaterialSlot[] {
    const slots = this.mesh ? [...this.mesh.slots] : [];
    if (this.matPreview) slots.push(this.matPreview.slot);
    for (const m of this.models.values()) for (const r of m.ranges) slots.push(r.slot);
    return slots;
  }

  private drawModels(pass: GPURenderPassEncoder, mode: "opaque" | "blended" | "id") {
    for (const [key, model] of this.models) {
      if (!model.instances || !model.instanceCount) continue;
      // Game view: the editor's stand-in models (player starts, nodes…) stay out; real props stay in.
      if (this.gameView && mode !== "id" && key.toLowerCase().includes("models/editor/")) continue;
      this.drawModelInstances(pass, model, model.instances, model.instanceCount, mode);
    }
  }

  private drawModelInstances(pass: GPURenderPassEncoder, model: GpuModel, instances: GPUBuffer, count: number, mode: "opaque" | "blended" | "id") {
    pass.setVertexBuffer(0, model.positions);
    if (mode !== "id") {
      pass.setVertexBuffer(1, model.normals);
      pass.setVertexBuffer(2, model.uvs);
      pass.setVertexBuffer(3, instances);
    } else {
      pass.setVertexBuffer(1, instances);
    }
    pass.setIndexBuffer(model.indices, "uint32");
    for (const r of model.ranges) {
      if (mode === "opaque" && r.slot.blended) continue;
      if (mode === "blended" && !r.slot.blended) continue;
      if (mode !== "id") pass.setBindGroup(1, r.slot.bindGroup);
      pass.drawIndexed(r.count, count, r.first);
    }
  }

  /** The dragged model's ghost, drawn after the placed props of the same kind. */
  private drawGhost(pass: GPURenderPassEncoder, mode: "opaque" | "blended") {
    const g = this.ghost;
    const model = g ? this.models.get(g.key) : null;
    if (!g || !model) return;
    pass.setPipeline(mode === "opaque" ? this.modelPipeline : this.modelBlendedPipeline);
    this.drawModelInstances(pass, model, g.instances, g.count, mode);
  }

  /**
   * Shows one instance of an uploaded model at `matrix` without an entity
   * behind it: the drag preview of a model over the 3D view. Null clears it.
   */
  setGhostModel(key: string | null, matrix?: Float32Array) {
    this.setGhostModels(key, matrix ? [matrix] : []);
  }

  /** Several instances of one model as ghosts: a row being placed. An empty list clears them. */
  setGhostModels(key: string | null, matrices: Float32Array[]) {
    if (!key || !matrices.length || !this.models.has(key)) {
      this.ghost?.instances.destroy();
      this.ghost = null;
      return;
    }
    const n = matrices.length;
    const buf = new ArrayBuffer(INSTANCE_BYTES * n);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    matrices.forEach((m, i) => {
      f.set(m, (i * INSTANCE_BYTES) / 4);
      u[(i * INSTANCE_BYTES) / 4 + 16] = this.sparePick;
    });
    if (!this.ghost || this.ghost.capacity < n) {
      this.ghost?.instances.destroy();
      const capacity = Math.max(n, 8);
      this.ghost = { key, instances: this.device.createBuffer({ size: INSTANCE_BYTES * capacity, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), count: n, capacity };
    }
    this.ghost.key = key;
    this.ghost.count = n;
    this.device.queue.writeBuffer(this.ghost.instances, 0, buf);
  }

  private rebuildPickTables(faceTable: Uint32Array, entities: Entities | null) {
    const faceCount = faceTable.length / 4;
    const solidCount = this.mesh?.solidCount ?? 0;
    const entityCount = entities?.count ?? 0;
    // One spare pick id at the end maps to the spare (always clean) object slot.
    const pickObject = new Uint32Array(faceCount + entityCount + 1);
    for (let f = 0; f < faceCount; f++) pickObject[f] = faceTable[f * 4];
    for (let e = 0; e < entityCount; e++) pickObject[faceCount + e] = solidCount + e;
    this.objectCount = solidCount + entityCount;
    pickObject[faceCount + entityCount] = this.objectCount;
    this.sparePick = faceCount + entityCount;
    if (this.ghost) this.device.queue.writeBuffer(this.ghost.instances, 64, new Uint32Array([this.sparePick]));
    this.pickObject.destroy();
    this.objectState.destroy();
    this.pickObject = this.upload(pickObject, GPUBufferUsage.STORAGE);
    // One extra slot (always zero) for overlay geometry such as the block preview.
    this.objectState = this.upload(new Uint32Array(this.objectCount + 1), GPUBufferUsage.STORAGE);
    this.rebuildSceneBindGroups();
    this.writeObjectState();
    // Overlays point at the spare object slot, which just moved.
    for (const o of this.overlays.values()) {
      o.objects.destroy();
      o.objects = this.upload(new Uint32Array(o.vertexCount).fill(this.objectCount), GPUBufferUsage.VERTEX);
    }
  }

  /** A material rewritten on disk (the painter): drops its texture and reloads every slot using it. */
  forgetTexture(name: string, info: MaterialInfo | null) {
    for (const key of [name, `${name}#2`]) {
      const tex = this.textureCache.get(key);
      if (tex) {
        this.textureCache.delete(key);
        tex.destroy();
      }
    }
    for (const slot of this.allSlots()) {
      if (slot.name !== name) continue;
      if (info) {
        slot.info = info;
        slot.blended = slot.sprite || info.translucent || info.tool || info.additive;
      }
      slot.texture = null;
      slot.texture2 = null;
      slot.state = "pending";
      this.writeMaterialUniform(slot);
      slot.bindGroup = this.bindGroupFor(slot, this.pendingTexture);
      void this.loadTexture(slot);
    }
  }

  /** Applies material infos that arrived after the mesh (content finished mounting). */
  updateMaterials(infos: MaterialInfo[]) {
    const byName = new Map(infos.map((i) => [i.name, i]));
    for (const slot of this.allSlots()) {
      const info = byName.get(slot.name);
      if (!info || slot.state === "loaded") continue;
      slot.info = info;
      slot.blended = slot.sprite || info.translucent || info.tool || info.additive;
      this.writeMaterialUniform(slot);
      slot.state = "pending";
      void this.loadTexture(slot);
    }
  }

  setHover(pickId: number | null) {
    this.hoverPick = pickId ?? NO_PICK;
  }

  /**
   * Shows `faces` (pick ids of brush faces) wearing `name` without touching
   * the document; an empty list clears the preview. The texture comes from
   * the shared cache, so a material seen before shows up on the same frame.
   */
  setMaterialPreview(faces: number[], name: string, info: MaterialInfo | null) {
    const mesh = this.mesh;
    if (!mesh || !faces.length) {
      this.clearMaterialPreview();
      return;
    }
    let slot = this.matPreview?.slot ?? null;
    if (slot && slot.name !== name) {
      slot.uniform.destroy();
      slot = null;
    }
    if (!slot) {
      slot = this.createSlot(name, info);
      if (slot.state === "pending") void this.loadTexture(slot);
    }
    const wanted = new Set(faces);
    const idx = mesh.cpuIndices;
    const ids = mesh.cpuFaceIds;
    const out: number[] = [];
    for (let t = 0; t + 2 < idx.length; t += 3) {
      if (wanted.has(ids[idx[t]])) out.push(idx[t], idx[t + 1], idx[t + 2]);
    }
    this.matPreview?.indices.destroy();
    this.matPreview = { slot, indices: this.upload(new Uint32Array(out), GPUBufferUsage.INDEX), count: out.length };
  }

  clearMaterialPreview() {
    if (!this.matPreview) return;
    this.matPreview.slot.uniform.destroy();
    this.matPreview.indices.destroy();
    this.matPreview = null;
  }

  /** Marks objects (solid indices, then entity indices after them) as selected. */
  setSelection(selected: Iterable<number>) {
    this.selected = new Set(selected);
    this.writeObjectState();
  }

  /**
   * Shows `objects` displaced by `delta` without touching the document,
   * for live feedback while dragging. Pass an empty set to end the preview.
   */
  setPreview(objects: Iterable<number>, delta: [number, number, number]) {
    this.previewObjects = new Set(objects);
    this.previewMatrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, delta[0], delta[1], delta[2], 1]);
    this.writeObjectState();
  }

  /** Shows `objects` under an affine map (row-major 3×3 `m` plus `t`) without touching the document: a rotation or scale being dragged. */
  setPreviewAffine(objects: Iterable<number>, a: { m: ArrayLike<number>; t: ArrayLike<number> }) {
    this.previewObjects = new Set(objects);
    const m = a.m;
    const t = a.t;
    this.previewMatrix = new Float32Array([m[0], m[3], m[6], 0, m[1], m[4], m[7], 0, m[2], m[5], m[8], 0, t[0], t[1], t[2], 1]);
    this.writeObjectState();
  }

  /** Objects outside the cordon: not drawn and not pickable. */
  setCulled(culled: Iterable<number>) {
    this.culled = new Set(culled);
    this.writeObjectState();
  }

  private writeObjectState() {
    const data = new Uint32Array(this.objectCount + 1);
    for (const s of this.selected) if (s >= 0 && s < this.objectCount) data[s] |= 1;
    for (const s of this.previewObjects) if (s >= 0 && s < this.objectCount) data[s] |= 2;
    for (const s of this.culled) if (s >= 0 && s < this.objectCount) data[s] |= 4;
    this.device.queue.writeBuffer(this.objectState, 0, data);
  }

  /** Vertex count of a named overlay, for tests. */
  overlayInfo(name: string): { vertices: number } | null {
    const o = this.overlays.get(name);
    return o ? { vertices: o.vertexCount } : null;
  }

  /** Shows a yellow wireframe box in every view (the block tool), or hides it. */
  setPreviewBox(box: [[number, number, number], [number, number, number]] | null) {
    this.setOverlay("box", box ? boxEdges(box) : null, [1, 0.9, 0.2]);
  }

  /**
   * Replaces (or with `positions` null removes) a named line overlay.
   * `positions` is a line list (xyz per vertex); `color` is one RGB for all
   * vertices or a per-vertex array of the same length as `positions`.
   */
  setOverlay(name: string, positions: Float32Array | null, color: [number, number, number] | Float32Array, where: OverlayWhere = "all") {
    const old = this.overlays.get(name);
    if (old) {
      old.positions.destroy();
      old.objects.destroy();
      old.colors.destroy();
      this.overlays.delete(name);
    }
    if (!positions || positions.length < 6) return;
    const vertexCount = Math.floor(positions.length / 3);
    let colors: Float32Array;
    if (color instanceof Float32Array) colors = color;
    else {
      colors = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i++) colors.set(color, i * 3);
    }
    // Overlay vertices use the spare object slot, which is never selected or previewed.
    const objects = new Uint32Array(vertexCount).fill(this.objectCount);
    this.overlays.set(name, {
      positions: this.upload(positions, GPUBufferUsage.VERTEX),
      objects: this.upload(objects, GPUBufferUsage.VERTEX),
      colors: this.upload(colors, GPUBufferUsage.VERTEX),
      vertexCount,
      in2D: where !== "3d",
      in3D: where !== "2d",
    });
  }

  /** How many vertices the named line overlay has (0 when there is none): for autotests and diagnostics. */
  overlayVertexCount(name: string): number {
    return this.overlays.get(name)?.vertexCount ?? 0;
  }

  private drawOverlays(pass: GPURenderPassEncoder, pipeline: GPURenderPipeline, bindGroup: GPUBindGroup, threeD: boolean) {
    let bound = false;
    for (const o of this.overlays.values()) {
      if (threeD ? !o.in3D : !o.in2D) continue;
      if (!bound) {
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        bound = true;
      }
      pass.setVertexBuffer(0, o.positions);
      pass.setVertexBuffer(1, o.objects);
      pass.setVertexBuffer(2, o.colors);
      pass.draw(o.vertexCount);
    }
  }

  /**
   * Replaces the geometry after an edit. Material slots (and their loaded
   * textures) are kept when the material list is unchanged; otherwise the
   * caller must use `setMesh` again.
   */
  updateGeometry(mesh: MeshBuffers): boolean {
    const old = this.mesh;
    if (!old || old.slots.length !== mesh.materials.length || old.slots.some((s, i) => s.name !== mesh.materials[i])) {
      return false;
    }
    for (const b of [old.positions, old.normals, old.texcoords, old.alphas, old.luxels, old.pickIds, old.indices, old.edges, old.edgeObjects, old.edgeColors]) {
      b.destroy();
    }
    this.clearMaterialPreview();
    this.meshBounds = Renderer.boundsOf(mesh.positions);
    const edgeColors = new Float32Array(mesh.edges.length).fill(0.82);
    old.cpuIndices = mesh.indices;
    old.cpuFaceIds = mesh.faceIds;
    old.positions = this.upload(mesh.positions, GPUBufferUsage.VERTEX);
    old.normals = this.upload(mesh.normals, GPUBufferUsage.VERTEX);
    old.texcoords = this.upload(mesh.texcoords, GPUBufferUsage.VERTEX);
    old.alphas = this.upload(mesh.alphas, GPUBufferUsage.VERTEX);
    old.luxels = this.upload(mesh.luxels, GPUBufferUsage.VERTEX);
    old.pickIds = this.upload(mesh.faceIds, GPUBufferUsage.VERTEX);
    old.indices = this.upload(mesh.indices, GPUBufferUsage.INDEX);
    old.edges = this.upload(mesh.edges, GPUBufferUsage.VERTEX);
    old.edgeObjects = this.upload(mesh.edgeSolids, GPUBufferUsage.VERTEX);
    old.edgeColors = this.upload(edgeColors, GPUBufferUsage.VERTEX);
    old.edgeVertexCount = mesh.edges.length / 3;
    old.ranges = mesh.ranges;
    old.triangles = mesh.indices.length / 3;
    old.faceCount = mesh.faceTable.length / 4;
    old.solidCount = mesh.solidIds.length;
    this.rebuildPickTables(mesh.faceTable, this.entities);
    return true;
  }

  private createSlot(name: string, info: MaterialInfo | null, sprite = false): MaterialSlot {
    const uniform = this.device.createBuffer({ size: MATERIAL_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const slot: MaterialSlot = {
      name,
      info,
      uniform,
      bindGroup: null as unknown as GPUBindGroup,
      blended: sprite || (!!info && (info.translucent || info.tool || info.additive)),
      sprite,
      state: "pending",
      texture: null,
      texture2: null,
    };
    this.writeMaterialUniform(slot);
    const cached = this.textureCache.get(name);
    if (cached && info) {
      slot.texture = cached;
      slot.texture2 = this.textureCache.get(`${name}#2`) ?? null;
      slot.state = "loaded";
      this.writeMaterialUniform(slot);
      slot.bindGroup = this.bindGroupFor(slot, cached);
    } else {
      slot.bindGroup = this.bindGroupFor(slot, this.pendingTexture);
    }
    return slot;
  }

  private bindGroupFor(slot: MaterialSlot, texture: GPUTexture): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.materialLayout,
      entries: [
        { binding: 0, resource: { buffer: slot.uniform } },
        { binding: 1, resource: texture.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: (slot.texture2 ?? texture).createView() },
      ],
    });
  }

  private writeMaterialUniform(slot: MaterialSlot) {
    const info = slot.info;
    const w = info && info.width > 0 ? info.width : 64;
    const h = info && info.height > 0 ? info.height : 64;
    let flags = 0;
    if (info?.translucent) flags |= MATERIAL_FLAG_TRANSLUCENT;
    if (info?.tool) flags |= MATERIAL_FLAG_TOOL;
    if (info?.alphaTest) flags |= MATERIAL_FLAG_ALPHA_TEST;
    if (slot.state === "missing") flags |= MATERIAL_FLAG_MISSING;
    if (slot.texture2) flags |= MATERIAL_FLAG_BLEND;
    const color = info?.color ?? [1, 1, 1];
    const buf = new ArrayBuffer(MATERIAL_BYTES);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    f[0] = w;
    f[1] = h;
    u[2] = flags;
    u[3] = 0;
    f[4] = color[0];
    f[5] = color[1];
    f[6] = color[2];
    f[7] = 1;
    this.device.queue.writeBuffer(slot.uniform, 0, buf);
  }

  private async loadTexture(slot: MaterialSlot) {
    const info = slot.info;
    if (!info) return; // still waiting for content
    if (!info.found || !info.baseTexture) {
      this.markMissing(slot);
      return;
    }
    // Several slots can share a material (models, or a model and a brush);
    // the texture is loaded once and shared through the cache.
    const cached = this.textureCache.get(slot.name);
    if (cached) {
      slot.texture = cached;
      slot.state = "loaded";
      slot.bindGroup = this.bindGroupFor(slot, cached);
      return;
    }
    // Block-compressed textures smaller than a block cannot be created; ask for RGBA.
    const wantRgba = !this.hasBc || info.width < 4 || info.height < 4;
    try {
      const res = await fetch(textureUrl(info.baseTexture, wantRgba));
      if (!res.ok) throw new Error(`${res.status}`);
      let tex = this.uploadContainer(new Uint8Array(await res.arrayBuffer()));
      if (this.disposed || !this.allSlots().includes(slot)) {
        tex.destroy();
        return;
      }
      const raced = this.textureCache.get(slot.name);
      if (raced) {
        // Another slot with the same material finished first; share its texture.
        tex.destroy();
        tex = raced;
      } else {
        this.textureCache.set(slot.name, tex);
      }
      slot.texture = tex;
      slot.state = "loaded";
      slot.bindGroup = this.bindGroupFor(slot, tex);
      if (info.baseTexture2) void this.loadSecondTexture(slot, info.baseTexture2, wantRgba);
    } catch (e) {
      console.warn(`texture ${info.baseTexture} for ${slot.name}:`, e);
      this.markMissing(slot);
    }
  }

  /** WorldVertexTransition: the blend texture, cached under `<material>#2`. */
  private async loadSecondTexture(slot: MaterialSlot, name: string, wantRgba: boolean) {
    const key = `${slot.name}#2`;
    let tex = this.textureCache.get(key) ?? null;
    if (!tex) {
      try {
        const res = await fetch(textureUrl(name, wantRgba));
        if (!res.ok) throw new Error(`${res.status}`);
        tex = this.uploadContainer(new Uint8Array(await res.arrayBuffer()));
      } catch (e) {
        console.warn(`texture ${name} (blend) for ${slot.name}:`, e);
        return;
      }
      if (this.disposed || !this.allSlots().includes(slot) || !slot.texture) {
        tex.destroy();
        return;
      }
      const raced = this.textureCache.get(key);
      if (raced) {
        tex.destroy();
        tex = raced;
      } else this.textureCache.set(key, tex);
    }
    slot.texture2 = tex;
    this.writeMaterialUniform(slot);
    slot.bindGroup = this.bindGroupFor(slot, slot.texture ?? this.pendingTexture);
  }

  private markMissing(slot: MaterialSlot) {
    slot.state = "missing";
    this.writeMaterialUniform(slot);
    slot.bindGroup = this.bindGroupFor(slot, this.missingTexture);
  }

  /** Parses the GMTX container from the shell and creates the GPU texture. */
  private uploadContainer(bytes: Uint8Array<ArrayBuffer>): GPUTexture {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.length < 24 || String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "GMTX") {
      throw new Error("bad texture container");
    }
    const formatId = dv.getUint32(4, true);
    const width = dv.getUint32(8, true);
    const height = dv.getUint32(12, true);
    const mipCount = dv.getUint32(16, true);
    const formats: GPUTextureFormat[] = ["rgba8unorm-srgb", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm-srgb"];
    const format = formats[formatId];
    if (!format) throw new Error(`unknown format ${formatId}`);
    const compressed = formatId !== 0;
    const blockBytes = formatId === 1 ? 8 : 16;

    const tex = this.device.createTexture({
      size: [width, height],
      mipLevelCount: mipCount,
      format,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    let at = 24;
    for (let level = 0; level < mipCount; level++) {
      const len = dv.getUint32(at, true);
      at += 4;
      const data = bytes.subarray(at, at + len);
      at += len;
      const mw = Math.max(1, width >> level);
      const mh = Math.max(1, height >> level);
      if (compressed) {
        const bw = Math.ceil(mw / 4);
        const bh = Math.ceil(mh / 4);
        this.device.queue.writeTexture({ texture: tex, mipLevel: level }, data, { bytesPerRow: bw * blockBytes, rowsPerImage: bh }, [bw * 4, bh * 4]);
      } else {
        this.device.queue.writeTexture({ texture: tex, mipLevel: level }, data, { bytesPerRow: mw * 4, rowsPerImage: mh }, [mw, mh]);
      }
    }
    return tex;
  }

  clearEntities() {
    if (!this.entities) return;
    for (const b of [this.entities.positions, this.entities.normals, this.entities.colors, this.entities.pickIds, this.entities.edges, this.entities.edgeObjects, this.entities.edgeColors]) {
      b.destroy();
    }
    this.entities = null;
  }

  /** Drops the mesh; with `keepTextures` loaded textures stay in the cache for the next mesh. */
  clearMesh(keepTextures = false) {
    this.clearEntities();
    if (!keepTextures) {
      // A new map: models go too, since their slots share the texture cache.
      this.clearModels();
      for (const tex of this.textureCache.values()) tex.destroy();
      this.textureCache.clear();
    }
    if (!this.mesh) return;
    for (const s of this.mesh.slots) {
      if (!keepTextures && s.texture && !this.textureCache.has(s.name)) s.texture.destroy();
      s.uniform.destroy();
    }
    for (const b of [
      this.mesh.positions,
      this.mesh.normals,
      this.mesh.texcoords,
      this.mesh.alphas,
      this.mesh.luxels,
      this.mesh.pickIds,
      this.mesh.indices,
      this.mesh.edges,
      this.mesh.edgeObjects,
      this.mesh.edgeColors,
    ]) {
      b.destroy();
    }
    this.clearMaterialPreview();
    this.mesh = null;
    this.hoverPick = NO_PICK;
  }

  /** True once none of a model's materials is still loading (missing ones count as settled). */
  modelTexturesReady(key: string): boolean {
    const m = this.models.get(key);
    return !m || m.ranges.every((r) => r.slot.state !== "pending");
  }

  /** GPU bytes by holder: map geometry, model meshes, textures (with mip chains). */
  memory(): RenderMemory {
    const bufferBytes = (o: object | null | undefined): number => {
      if (!o) return 0;
      let n = 0;
      for (const v of Object.values(o)) if (v instanceof GPUBuffer) n += v.size;
      return n;
    };
    const geometry = bufferBytes(this.mesh) + bufferBytes(this.entities);
    let models = 0;
    let modelTriangles = 0;
    let modelInstances = 0;
    for (const m of this.models.values()) {
      models += bufferBytes(m);
      modelTriangles += m.triangles * m.instanceCount;
      modelInstances += m.instanceCount;
    }
    const seen = new Set<GPUTexture>();
    let textures = 0;
    for (const slot of this.allSlots()) {
      for (const t of [slot.texture, slot.texture2]) {
        if (!t || seen.has(t)) continue;
        seen.add(t);
        const base = t.width * t.height * 4;
        textures += t.mipLevelCount > 1 ? Math.round(base * 1.34) : base;
      }
    }
    return { geometry, models, textures, textureCount: seen.size, modelTriangles, modelInstances, uniqueModels: this.models.size };
  }

  stats(): RenderStats {
    const slots = this.allSlots();
    let modelDraws = 0;
    let modelTriangles = 0;
    for (const m of this.models.values()) {
      if (!m.instanceCount) continue;
      modelDraws += m.ranges.length;
      modelTriangles += m.triangles * m.instanceCount;
    }
    return {
      drawCalls: (this.mesh ? this.mesh.ranges.length / 3 : 0) + (this.entities ? 1 : 0) + modelDraws,
      triangles: (this.mesh?.triangles ?? 0) + (this.entities ? this.entities.vertexCount / 3 : 0) + modelTriangles,
      entities: this.entities?.count ?? 0,
      models: this.models.size,
      props: this.propCount,
      texturesLoaded: slots.filter((s) => s.state === "loaded").length,
      texturesMissing: slots.filter((s) => s.state === "missing").length,
      texturesPending: slots.filter((s) => s.state === "pending").length,
      frameMs: this.lastFrameMs,
    };
  }

  private static resizeCanvas(canvas: HTMLCanvasElement): [number, number] {
    const dpr = effectiveDpr();
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return [w, h];
  }

  private depthView(w: number, h: number): GPUTextureView {
    if (!this.depth || this.depthSize[0] !== w || this.depthSize[1] !== h) {
      this.depth?.destroy();
      this.depth = this.device.createTexture({ size: [w, h], format: "depth24plus", usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.depthSize = [w, h];
    }
    return this.depth.createView();
  }

  /** `right` and `up` span the view plane: sprites are drawn on it. */
  private writeCamera(buffer: GPUBuffer, viewProj: Float32Array | ArrayLike<number>, eye: ArrayLike<number>, right: ArrayLike<number> = [1, 0, 0], up: ArrayLike<number> = [0, 0, 1]) {
    const buf = new ArrayBuffer(CAMERA_BYTES);
    const f = new Float32Array(buf);
    const u = new Uint32Array(buf);
    f.set(viewProj, 0);
    f.set([eye[0], eye[1], eye[2]], 16);
    u[19] = this.hoverPick;
    u[23] = this.viewMode;
    f.set([right[0], right[1], right[2]], 24);
    f[27] = this.lightTheme() ? 1 : 0;
    f.set([up[0], up[1], up[2]], 28);
    f.set(this.previewMatrix, 32);
    this.device.queue.writeBuffer(buffer, 0, buf);
  }

  /** The fly camera's view-plane axes (right, up) in world space. */
  private static viewAxes3D(camera: FlyCamera): [Float32Array, Float32Array] {
    const r = camera.right();
    const f = camera.forward();
    return [r, vec3.normalize(vec3.cross(r, f))];
  }

  private bindBrushBuffers(pass: GPURenderPassEncoder, mesh: Mesh) {
    pass.setVertexBuffer(0, mesh.positions);
    pass.setVertexBuffer(1, mesh.normals);
    pass.setVertexBuffer(2, mesh.texcoords);
    pass.setVertexBuffer(3, mesh.pickIds);
    pass.setVertexBuffer(4, mesh.alphas);
    pass.setVertexBuffer(5, mesh.luxels);
    pass.setIndexBuffer(mesh.indices, "uint32");
  }

  private bindEntityBuffers(pass: GPURenderPassEncoder, ents: Entities) {
    pass.setVertexBuffer(0, ents.positions);
    pass.setVertexBuffer(1, ents.normals);
    pass.setVertexBuffer(2, ents.colors);
    pass.setVertexBuffer(3, ents.pickIds);
  }

  private static boundsOf(positions: Float32Array): [[number, number, number], [number, number, number]] | null {
    if (positions.length < 3) return null;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < positions.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const v = positions[i + k];
        if (v < lo[k]) lo[k] = v;
        if (v > hi[k]) hi[k] = v;
      }
    }
    return [
      [lo[0], lo[1], lo[2]],
      [hi[0], hi[1], hi[2]],
    ];
  }

  /**
   * The sun's shadow map: an orthographic look along light_environment over
   * the whole map, drawn before the frame in the lighting view mode. Tool
   * textures (sky, nodraw, clips) cast nothing.
   */
  private encodeShadow(encoder: GPUCommandEncoder) {
    const ld = this.lightsData;
    const sun = this.viewMode === 4 && ld.length >= 16 && ld[11] > 0.5 && this.meshBounds !== null && this.mesh !== null;
    if (!sun) {
      this.device.queue.writeBuffer(this.shadowUniform, 64, new Float32Array([0, 0, 0, 0]));
      return;
    }
    const b = this.meshBounds!;
    const dir = vec3.normalize(vec3.create(ld[8], ld[9], ld[10]));
    const center = vec3.create((b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2, (b[0][2] + b[1][2]) / 2);
    const radius = Math.max(64, vec3.distance(vec3.create(b[0][0], b[0][1], b[0][2]), vec3.create(b[1][0], b[1][1], b[1][2])) / 2);
    const eye = vec3.addScaled(center, dir, -radius * 2);
    const up = Math.abs(dir[2]) > 0.99 ? vec3.create(0, 1, 0) : vec3.create(0, 0, 1);
    const view = mat4.lookAt(eye, center, up);
    // Fit the map's corners in light space.
    let l = Infinity;
    let r = -Infinity;
    let bt = Infinity;
    let t = -Infinity;
    let n = Infinity;
    let f = -Infinity;
    for (let i = 0; i < 8; i++) {
      const c = vec3.transformMat4(vec3.create(i & 1 ? b[1][0] : b[0][0], i & 2 ? b[1][1] : b[0][1], i & 4 ? b[1][2] : b[0][2]), view);
      l = Math.min(l, c[0]);
      r = Math.max(r, c[0]);
      bt = Math.min(bt, c[1]);
      t = Math.max(t, c[1]);
      n = Math.min(n, -c[2]);
      f = Math.max(f, -c[2]);
    }
    const proj = mat4.ortho(l, r, bt, t, Math.max(1, n - 16), f + 16);
    const viewProj = mat4.multiply(proj, view);
    this.writeCamera(this.shadowCameraBuffer, viewProj, eye);
    const texel = Math.max(r - l, t - bt) / SHADOW_SIZE;
    const depthRange = f + 16 - Math.max(1, n - 16);
    const uni = new Float32Array(24);
    uni.set(viewProj, 0);
    uni[16] = 1;
    uni[17] = texel;
    uni[18] = (texel * 2) / depthRange;
    this.device.queue.writeBuffer(this.shadowUniform, 0, uni);

    const pass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: { view: this.shadowMap.createView(), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    pass.setBindGroup(0, this.sceneBindGroupShadow);
    const mesh = this.mesh!;
    pass.setPipeline(this.shadowBrushPipeline);
    pass.setVertexBuffer(0, mesh.positions);
    pass.setVertexBuffer(1, mesh.pickIds);
    pass.setIndexBuffer(mesh.indices, "uint32");
    for (let i = 0; i < mesh.ranges.length; i += 3) {
      const slot = mesh.slots[mesh.ranges[i]];
      if (slot.blended || slot.info?.tool) continue;
      pass.drawIndexed(mesh.ranges[i + 2], 1, mesh.ranges[i + 1]);
    }
    if (this.propCount) {
      pass.setPipeline(this.shadowModelPipeline);
      for (const model of this.models.values()) {
        if (!model.instances || !model.instanceCount || model.ranges.some((rg) => rg.slot.sprite)) continue;
        pass.setVertexBuffer(0, model.positions);
        pass.setVertexBuffer(1, model.instances);
        pass.setIndexBuffer(model.indices, "uint32");
        for (const rg of model.ranges) {
          if (rg.slot.blended) continue;
          pass.drawIndexed(rg.count, model.instanceCount, rg.first);
        }
      }
    }
    pass.end();
  }

  private encode3D(encoder: GPUCommandEncoder, colorView: GPUTextureView, depthView: GPUTextureView) {
    const bg = (this.lightTheme() ? this.paletteLight : this.palette).bg3d;
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: bg[0], g: bg[1], b: bg[2], a: 1 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: depthView, depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    pass.setBindGroup(0, this.sceneBindGroup);
    const mesh = this.mesh;
    const wire = this.viewMode === 2;
    if (mesh && wire) {
      // Wireframe: the brush edges only, no faces.
      pass.setPipeline(this.linesOverlayPipeline);
      if (mesh.edgeVertexCount > 0) {
        pass.setVertexBuffer(0, mesh.edges);
        pass.setVertexBuffer(1, mesh.edgeObjects);
        pass.setVertexBuffer(2, mesh.edgeColors);
        pass.draw(mesh.edgeVertexCount);
      }
      if (this.entities && !this.gameView) {
        pass.setVertexBuffer(0, this.entities.edges);
        pass.setVertexBuffer(1, this.entities.edgeObjects);
        pass.setVertexBuffer(2, this.entities.edgeColors);
        pass.draw(this.entities.edgeVertexCount);
      }
    }
    if (mesh && !wire) {
      this.bindBrushBuffers(pass, mesh);
      pass.setPipeline(this.opaque);
      for (let i = 0; i < mesh.ranges.length; i += 3) {
        const slot = mesh.slots[mesh.ranges[i]];
        if (slot.blended) continue;
        pass.setBindGroup(1, slot.bindGroup);
        pass.drawIndexed(mesh.ranges[i + 2], 1, mesh.ranges[i + 1]);
      }
      const pv = this.matPreview;
      if (pv && pv.count) {
        pass.setPipeline(this.opaqueOver);
        pass.setBindGroup(1, pv.slot.bindGroup);
        pass.setIndexBuffer(pv.indices, "uint32");
        pass.drawIndexed(pv.count);
      }
    }
    if (this.propCount) {
      pass.setPipeline(this.modelPipeline);
      this.drawModels(pass, "opaque");
    }
    this.drawGhost(pass, "opaque");
    if (this.entities && !this.gameView) {
      pass.setPipeline(this.entityPipeline);
      this.bindEntityBuffers(pass, this.entities);
      pass.draw(this.entities.vertexCount);
    }
    if (this.propCount) {
      pass.setPipeline(this.modelBlendedPipeline);
      this.drawModels(pass, "blended");
    }
    this.drawGhost(pass, "blended");
    if (mesh && !wire) {
      this.bindBrushBuffers(pass, mesh);
      pass.setPipeline(this.blended);
      for (let i = 0; i < mesh.ranges.length; i += 3) {
        const slot = mesh.slots[mesh.ranges[i]];
        if (!slot.blended) continue;
        // Game view: no tool brushes (trigger, clip, skip…) and no editor icons.
        if (this.gameView && (slot.sprite || slot.info?.tool || slot.name.toLowerCase().startsWith("tools/"))) continue;
        pass.setBindGroup(1, slot.bindGroup);
        pass.drawIndexed(mesh.ranges[i + 2], 1, mesh.ranges[i + 1]);
      }
    }
    if (!this.gameView) this.drawOverlays(pass, this.linesOverlayPipeline, this.sceneBindGroup, true);
    pass.end();
  }

  private encode2D(encoder: GPUCommandEncoder, view: View2D, colorView: GPUTextureView, w: number, h: number) {
    const cam = view.camera;
    const grid = new Float32Array(GRID_BYTES / 4);
    const light = this.lightTheme();
    grid.set([cam.center[0], cam.center[1], w, h, cam.unitsPerPixel, cam.gridSpacing(), light ? 1 : 0]);
    this.device.queue.writeBuffer(view.gridUniform, 0, grid);

    const bg = (light ? this.paletteLight : this.palette).bg2d;
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: colorView, clearValue: { r: bg[0], g: bg[1], b: bg[2], a: 1 }, loadOp: "clear", storeOp: "store" }],
    });
    pass.setPipeline(this.gridPipeline);
    pass.setBindGroup(0, view.gridBindGroup);
    pass.draw(3);

    if (this.mesh || this.entities || this.overlays.size) {
      const [ax, ay] = cam.axes;
      const right2 = [0, 0, 0];
      const up2 = [0, 0, 0];
      right2[ax] = 1;
      up2[ay] = 1;
      this.writeCamera(view.cameraUniform, cam.viewProjection(w, h), [0, 0, 0], right2, up2);
      const bindGroup = this.makeSceneBindGroup(view.cameraUniform);
      pass.setPipeline(this.linesPipeline);
      pass.setBindGroup(0, bindGroup);
      if (this.mesh && this.mesh.edgeVertexCount > 0) {
        pass.setVertexBuffer(0, this.mesh.edges);
        pass.setVertexBuffer(1, this.mesh.edgeObjects);
        pass.setVertexBuffer(2, this.mesh.edgeColors);
        pass.draw(this.mesh.edgeVertexCount);
      }
      if (this.entities) {
        pass.setVertexBuffer(0, this.entities.edges);
        pass.setVertexBuffer(1, this.entities.edgeObjects);
        pass.setVertexBuffer(2, this.entities.edgeColors);
        pass.draw(this.entities.edgeVertexCount);
      }
      this.drawOverlays(pass, this.linesPipeline, bindGroup, false);
    }
    pass.end();
  }

  frame(camera: FlyCamera) {
    if (this.disposed) return;
    const t0 = performance.now();
    const [w, h] = Renderer.resizeCanvas(this.canvas);
    this.writeCamera(this.cameraBuffer, camera.viewProjection(w / h), camera.position, ...Renderer.viewAxes3D(camera));
    const encoder = this.device.createCommandEncoder();
    this.encodeShadow(encoder);
    this.encode3D(encoder, this.ctx.getCurrentTexture().createView(), this.depthView(w, h));
    for (const view of this.views) {
      if (view.canvas.clientWidth === 0 || view.canvas.clientHeight === 0) continue;
      const [vw, vh] = Renderer.resizeCanvas(view.canvas);
      this.encode2D(encoder, view, view.ctx.getCurrentTexture().createView(), vw, vh);
    }
    this.device.queue.submit([encoder.finish()]);
    this.lastFrameMs = performance.now() - t0;
  }

  /**
   * Pick id under a 3D-canvas pixel (CSS coordinates), or null. Renders an
   * id pass on demand; concurrent calls share one in-flight readback.
   */
  pick(camera: FlyCamera, cssX: number, cssY: number): Promise<number | null> {
    if (this.pickInFlight) return this.pickInFlight;
    const p = this.pickOnce(camera, cssX, cssY).finally(() => {
      this.pickInFlight = null;
    });
    this.pickInFlight = p;
    return p;
  }

  private async pickOnce(camera: FlyCamera, cssX: number, cssY: number): Promise<number | null> {
    const mesh = this.mesh;
    if ((!mesh && !this.entities && !this.propCount) || this.disposed) return null;
    const dpr = effectiveDpr();
    const [w, h] = Renderer.resizeCanvas(this.canvas);
    const px = Math.floor(cssX * dpr);
    const py = Math.floor(cssY * dpr);
    if (px < 0 || py < 0 || px >= w || py >= h) return null;

    if (!this.idTexture || this.idSize[0] !== w || this.idSize[1] !== h) {
      this.idTexture?.destroy();
      this.idTexture = this.device.createTexture({ size: [w, h], format: "r32uint", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
      this.idSize = [w, h];
    }
    this.writeCamera(this.cameraBuffer, camera.viewProjection(w / h), camera.position, ...Renderer.viewAxes3D(camera));
    const readback = this.device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: this.idTexture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: "clear", storeOp: "store" }],
      depthStencilAttachment: { view: this.depthView(w, h), depthClearValue: 1, depthLoadOp: "clear", depthStoreOp: "store" },
    });
    pass.setBindGroup(0, this.sceneBindGroup);
    if (mesh) {
      pass.setPipeline(this.idBrushPipeline);
      this.bindBrushBuffers(pass, mesh);
      // Opaque geometry only: tool and translucent surfaces are not pickable through.
      for (let i = 0; i < mesh.ranges.length; i += 3) {
        if (mesh.slots[mesh.ranges[i]].blended) continue;
        pass.drawIndexed(mesh.ranges[i + 2], 1, mesh.ranges[i + 1]);
      }
    }
    if (this.entities) {
      pass.setPipeline(this.idEntityPipeline);
      this.bindEntityBuffers(pass, this.entities);
      pass.draw(this.entities.vertexCount);
    }
    if (this.propCount) {
      pass.setPipeline(this.idModelPipeline);
      this.drawModels(pass, "id");
    }
    pass.end();
    encoder.copyTextureToBuffer({ texture: this.idTexture, origin: [px, py] }, { buffer: readback, bytesPerRow: 256 }, [1, 1]);
    this.device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const value = new Uint32Array(readback.getMappedRange())[0];
    readback.unmap();
    readback.destroy();
    return value === 0 ? null : value - 1;
  }

  private async readbackPng(color: GPUTexture, w: number, h: number, encoder: GPUCommandEncoder): Promise<string> {
    const bytesPerRow = Math.ceil((w * 4) / 256) * 256;
    const readback = this.device.createBuffer({ size: bytesPerRow * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    encoder.copyTextureToBuffer({ texture: color }, { buffer: readback, bytesPerRow }, [w, h]);
    this.device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(readback.getMappedRange());
    const pixels = new Uint8ClampedArray(w * h * 4);
    const bgra = this.format === "bgra8unorm";
    for (let y = 0; y < h; y++) {
      const row = src.subarray(y * bytesPerRow, y * bytesPerRow + w * 4);
      for (let x = 0; x < w; x++) {
        const i = x * 4;
        const o = (y * w + x) * 4;
        pixels[o] = bgra ? row[i + 2] : row[i];
        pixels[o + 1] = row[i + 1];
        pixels[o + 2] = bgra ? row[i] : row[i + 2];
        pixels[o + 3] = 255;
      }
    }
    readback.unmap();
    readback.destroy();
    color.destroy();
    const c2d = document.createElement("canvas");
    c2d.width = w;
    c2d.height = h;
    c2d.getContext("2d")!.putImageData(new ImageData(pixels, w, h), 0, 0);
    return c2d.toDataURL("image/png");
  }

  /** Renders one 3D frame off screen and returns it as a PNG data URL. */
  capture(camera: FlyCamera): Promise<string> {
    const [w, h] = Renderer.resizeCanvas(this.canvas);
    this.writeCamera(this.cameraBuffer, camera.viewProjection(w / h), camera.position, ...Renderer.viewAxes3D(camera));
    const color = this.device.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const encoder = this.device.createCommandEncoder();
    this.encode3D(encoder, color.createView(), this.depthView(w, h));
    return this.readbackPng(color, w, h, encoder);
  }

  /** Captures a 2D view the same way. */
  capture2D(view: View2D): Promise<string> {
    const [w, h] = Renderer.resizeCanvas(view.canvas);
    const color = this.device.createTexture({ size: [w, h], format: this.format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const encoder = this.device.createCommandEncoder();
    this.encode2D(encoder, view, color.createView(), w, h);
    return this.readbackPng(color, w, h, encoder);
  }

  dispose() {
    this.disposed = true;
    this.clearModels();
    for (const name of Array.from(this.overlays.keys())) this.setOverlay(name, null, [0, 0, 0]);
    this.clearMesh();
    for (const v of this.views) {
      v.gridUniform.destroy();
      v.cameraUniform.destroy();
    }
    this.views = [];
    this.depth?.destroy();
    this.idTexture?.destroy();
    this.pickObject.destroy();
    this.objectState.destroy();
    this.device.destroy();
  }
}

/** The twelve edges of an axis-aligned box as a line list. */
export function boxEdges(box: [[number, number, number], [number, number, number]]): Float32Array {
  const [lo, hi] = box;
  const c = (s: number[]) => [s[0] ? hi[0] : lo[0], s[1] ? hi[1] : lo[1], s[2] ? hi[2] : lo[2]];
  const edges = [
    [
      [0, 0, 0],
      [1, 0, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [1, 0, 1],
    ],
    [
      [1, 0, 1],
      [1, 1, 1],
    ],
    [
      [1, 1, 1],
      [0, 1, 1],
    ],
    [
      [0, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 0, 0],
      [0, 0, 1],
    ],
    [
      [1, 0, 0],
      [1, 0, 1],
    ],
    [
      [1, 1, 0],
      [1, 1, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
    ],
  ];
  const positions = new Float32Array(edges.length * 6);
  edges.forEach((e, i) => {
    positions.set(c(e[0]), i * 6);
    positions.set(c(e[1]), i * 6 + 3);
  });
  return positions;
}
