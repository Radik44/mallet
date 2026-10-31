// WGSL for the viewport passes.

export const MATERIAL_FLAG_TRANSLUCENT = 1;
export const MATERIAL_FLAG_TOOL = 2;
export const MATERIAL_FLAG_ALPHA_TEST = 4;
export const MATERIAL_FLAG_MISSING = 8;
/** The material has a second texture to blend by displacement alpha. */
export const MATERIAL_FLAG_BLEND = 16;

/** `hoverPick` value meaning "nothing hovered". */
export const NO_PICK = 0xffffffff;

const SCENE_BINDINGS = /* wgsl */ `
struct Camera {
  viewProj: mat4x4f,
  eye: vec3f,
  hoverPick: u32,
  // Applied to objects with the preview bit while a drag is in progress.
  previewDelta: vec3f,
  // 3D view mode: 0 textured, 1 flat shaded, 2 wireframe (brushes not drawn).
  mode: u32,
  // View-plane axes for billboard sprites.
  right: vec3f,
  // 1 in the light theme: lines are drawn darker, the 3D background is light.
  theme: f32,
  up: vec3f,
  _pad3: f32,
  // Applied to objects with the preview bit: a translation, rotation or scale being dragged.
  previewMatrix: mat4x4f,
};

@group(0) @binding(0) var<uniform> camera: Camera;
// Object index (solid or entity) per pick id.
@group(0) @binding(1) var<storage, read> pickObject: array<u32>;
// Bit 0: selected. Bit 1: moved by previewDelta. Bit 2: culled (outside the cordon).
@group(0) @binding(2) var<storage, read> objectState: array<u32>;
// Lighting preview records (see lights.ts): header of four vec4s, then four per light.
@group(0) @binding(3) var<storage, read> lights: array<vec4f>;
// The sun's shadow map: its view-projection, whether it is in use, one texel in
// world units (for the normal offset) and the depth bias.
struct Shadow {
  viewProj: mat4x4f,
  enabled: f32,
  texel: f32,
  bias: f32,
  _pad: f32,
};
@group(0) @binding(4) var<uniform> shadow: Shadow;
@group(0) @binding(5) var shadowMap: texture_depth_2d;
@group(0) @binding(6) var shadowSampler: sampler_comparison;

// How much of the sun reaches the point (0 in shadow, 1 lit): a 3×3 comparison
// around the point, pushed off its surface by a texel so flat faces do not
// shadow themselves.
fn sunShadow(p: vec3f, n: vec3f) -> f32 {
  if (shadow.enabled < 0.5) {
    return 1.0;
  }
  let lp = shadow.viewProj * vec4f(p + n * shadow.texel * 1.5, 1.0);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || lp.z < 0.0 || lp.z > 1.0) {
    return 1.0;
  }
  let depth = lp.z - shadow.bias;
  let step = 1.0 / vec2f(textureDimensions(shadowMap));
  var sum = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      sum += textureSampleCompareLevel(shadowMap, shadowSampler, uv + vec2f(f32(x), f32(y)) * step, depth);
    }
  }
  return sum / 9.0;
}

// Light arriving at a surface point from every light entity: ambient, the
// sun (shadowed by the shadow map), and point or spot lights with Source's
// falloff and no shadows.
fn lit(p: vec3f, normal: vec3f) -> vec3f {
  let n = normalize(normal);
  var sum = lights[1].xyz;
  if (lights[2].w > 0.5) {
    sum += lights[3].xyz * max(dot(n, -normalize(lights[2].xyz)), 0.0) * sunShadow(p, n);
  }
  let count = u32(lights[0].x);
  for (var i = 0u; i < count; i++) {
    let base = 4u + i * 4u;
    let pos = lights[base].xyz;
    let to = pos - p;
    let d = max(length(to), 1.0);
    let l = to / d;
    let lambert = max(dot(n, l), 0.0);
    if (lambert <= 0.0) {
      continue;
    }
    let attn = lights[base + 2u];
    var falloff = 10000.0 / max(attn.x + attn.y * d + attn.z * d * d, 1.0);
    if (lights[base].w > 0.5) {
      // Spot: fades between the inner and outer cone.
      let cosang = dot(-l, normalize(lights[base + 3u].xyz));
      falloff *= smoothstep(lights[base + 3u].w, attn.w, cosang);
    }
    sum += lights[base + 1u].xyz * lambert * falloff;
  }
  return sum;
}

fn previewPoint(p: vec3f, object: u32) -> vec3f {
  return select(p, (camera.previewMatrix * vec4f(p, 1.0)).xyz, (objectState[object] & 2u) != 0u);
}

// Clip-space position, or a point outside the depth range for culled
// objects so the primitive is clipped away (also from the id pass).
fn clipPosition(object: u32, p: vec3f) -> vec4f {
  if ((objectState[object] & 4u) != 0u) {
    return vec4f(0.0, 0.0, 2.0, 1.0);
  }
  return camera.viewProj * vec4f(p, 1.0);
}

fn shade(normal: vec3f, base: vec3f) -> vec3f {
  let n = normalize(normal);
  // Fixed key light from above and a soft fill, enough to read shapes
  // before real lighting exists.
  let key = max(dot(n, normalize(vec3f(0.35, 0.2, 0.9))), 0.0);
  let fill = max(dot(n, normalize(vec3f(-0.5, -0.6, 0.3))), 0.0) * 0.25;
  return base * (0.42 + key * 0.55 + fill);
}

fn highlight(rgb: vec3f, pickId: u32) -> vec3f {
  var out = rgb;
  // Selection tint like Hammer's red, hover as a warm highlight.
  if ((objectState[pickObject[pickId]] & 1u) != 0u) {
    out = mix(out, vec3f(1.0, 0.25, 0.2), 0.45);
  }
  if (pickId == camera.hoverPick) {
    out = mix(out, vec3f(1.0, 0.9, 0.35), 0.3);
  }
  return out;
}
`;

export const BRUSH_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct Material {
  texSize: vec2f,
  flags: u32,
  _pad: u32,
  color: vec4f,
};

@group(1) @binding(0) var<uniform> material: Material;
@group(1) @binding(1) var tex: texture_2d<f32>;
@group(1) @binding(2) var samp: sampler;
// WorldVertexTransition's second texture (the first again for other materials).
@group(1) @binding(3) var tex2: texture_2d<f32>;

struct VSIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) texel: vec2f,
  @location(3) pickId: u32,
  @location(4) alpha: f32,
  @location(5) luxel: vec2f,
};

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) pickId: u32,
  @location(3) alpha: f32,
  @location(4) luxel: vec2f,
  @location(5) world: vec3f,
};

@vertex
fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  let p = previewPoint(in.position, pickObject[in.pickId]);
  out.world = p;
  out.clip = clipPosition(pickObject[in.pickId], p);
  out.normal = in.normal;
  out.uv = in.texel / material.texSize;
  out.pickId = in.pickId;
  out.alpha = in.alpha;
  out.luxel = in.luxel;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  var base = textureSample(tex, samp, in.uv);
  if ((material.flags & 16u) != 0u) {
    // Displacement alpha blends towards the second texture.
    base = mix(base, textureSample(tex2, samp, in.uv), in.alpha);
  }
  base = base * material.color;
  if ((material.flags & 4u) != 0u && base.a < 0.5) {
    discard;
  }
  if (camera.mode == 1u) {
    // Flat: one light grey for every face, shape by shading only.
    base = vec4f(0.62, 0.62, 0.62, base.a);
  } else if (camera.mode == 3u) {
    // Lightmap grid: one cell per luxel, lines where the cell changes.
    let w = fwidth(in.luxel);
    let f = abs(fract(in.luxel) - 0.5);
    let line = min(f.x / max(w.x, 1e-4), f.y / max(w.y, 1e-4));
    let edge = clamp(0.5 - line, 0.0, 1.0);
    base = vec4f(mix(vec3f(0.7, 0.7, 0.72), vec3f(0.12, 0.12, 0.15), edge), base.a);
  }
  var rgb = shade(in.normal, base.rgb);
  if (camera.mode == 4u) {
    rgb = base.rgb * lit(in.world, in.normal);
  }
  // Textures are sRGB-decoded on sampling; the swap chain is not sRGB.
  rgb = pow(rgb, vec3f(1.0 / 2.2));
  rgb = highlight(rgb, in.pickId);

  var a = 1.0;
  if ((material.flags & 2u) != 0u) {
    // Tool textures: see-through like Hammer's 3D view.
    a = 0.4;
  } else if ((material.flags & 1u) != 0u) {
    a = base.a;
  }
  return vec4f(rgb, a);
}
`;

/**
 * Instanced studio models: a 4×4 placement per instance (four column
 * attributes) and the entity's pick id. Texture coordinates come from the
 * model directly, so they are scaled by the material size to go through
 * the brush fragment shader unchanged.
 */
export const MODEL_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct Material {
  texSize: vec2f,
  flags: u32,
  _pad: u32,
  color: vec4f,
};

@group(1) @binding(0) var<uniform> material: Material;
@group(1) @binding(1) var tex: texture_2d<f32>;
@group(1) @binding(2) var samp: sampler;
@group(1) @binding(3) var tex2: texture_2d<f32>;

struct VSIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(4) c0: vec4f,
  @location(5) c1: vec4f,
  @location(6) c2: vec4f,
  @location(7) c3: vec4f,
  @location(8) pickId: u32,
};

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) uv: vec2f,
  @location(2) @interpolate(flat) pickId: u32,
  @location(3) @interpolate(flat) sprite: u32,
  @location(4) world: vec3f,
};

// A sprite instance stores 1 in c0.w (never used by an affine matrix):
// the quad's x/y then follow the view plane, so it always faces the camera.
@vertex
fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  let object = pickObject[in.pickId];
  if (in.c0.w > 0.5) {
    let world = previewPoint(in.c3.xyz, object) + camera.right * in.position.x + camera.up * in.position.y;
    out.clip = clipPosition(object, world);
    out.normal = cross(camera.right, camera.up);
    out.sprite = 1u;
    out.world = world;
  } else {
    let m = mat4x4f(in.c0, in.c1, in.c2, in.c3);
    let world = previewPoint((m * vec4f(in.position, 1.0)).xyz, object);
    out.clip = clipPosition(object, world);
    out.normal = (m * vec4f(in.normal, 0.0)).xyz;
    out.sprite = 0u;
    out.world = world;
  }
  out.uv = in.uv;
  out.pickId = in.pickId;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  var base = textureSample(tex, samp, in.uv) * material.color;
  if ((material.flags & 4u) != 0u && base.a < 0.5) {
    discard;
  }
  if (in.sprite != 0u) {
    // Editor icons are unlit and keep their alpha.
    if (base.a < 0.02) {
      discard;
    }
    return vec4f(highlight(pow(base.rgb, vec3f(1.0 / 2.2)), in.pickId), base.a);
  }
  var rgb = shade(in.normal, base.rgb);
  if (camera.mode == 4u) {
    rgb = base.rgb * lit(in.world, in.normal);
  }
  rgb = pow(rgb, vec3f(1.0 / 2.2));
  rgb = highlight(rgb, in.pickId);
  var a = 1.0;
  if ((material.flags & 1u) != 0u) {
    a = base.a;
  }
  return vec4f(rgb, a);
}
`;

/** Pick ids of instanced models. */
export const ID_MODEL_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct VSIn {
  @location(0) position: vec3f,
  @location(4) c0: vec4f,
  @location(5) c1: vec4f,
  @location(6) c2: vec4f,
  @location(7) c3: vec4f,
  @location(8) pickId: u32,
};

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) @interpolate(flat) pickId: u32,
};

@vertex
fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  let object = pickObject[in.pickId];
  var world: vec3f;
  if (in.c0.w > 0.5) {
    world = previewPoint(in.c3.xyz, object) + camera.right * in.position.x + camera.up * in.position.y;
  } else {
    let m = mat4x4f(in.c0, in.c1, in.c2, in.c3);
    world = previewPoint((m * vec4f(in.position, 1.0)).xyz, object);
  }
  out.clip = clipPosition(object, world);
  out.pickId = in.pickId;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) u32 {
  return in.pickId + 1u;
}
`;

/** Flat-coloured point entity boxes. */
export const ENTITY_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct VSIn {
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) color: vec3f,
  @location(3) pickId: u32,
};

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) normal: vec3f,
  @location(1) color: vec3f,
  @location(2) @interpolate(flat) pickId: u32,
};

@vertex
fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  let p = previewPoint(in.position, pickObject[in.pickId]);
  out.clip = clipPosition(pickObject[in.pickId], p);
  out.normal = in.normal;
  out.color = in.color;
  out.pickId = in.pickId;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  var rgb = shade(in.normal, in.color);
  rgb = highlight(rgb, in.pickId);
  return vec4f(rgb, 1.0);
}
`;

/** Writes pick id + 1 into an r32uint target for picking. */
export const ID_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct VSIn {
  @location(0) position: vec3f,
  @location(3) pickId: u32,
};

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) @interpolate(flat) pickId: u32,
};

@vertex
fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  let p = previewPoint(in.position, pickObject[in.pickId]);
  out.clip = clipPosition(pickObject[in.pickId], p);
  out.pickId = in.pickId;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) u32 {
  return in.pickId + 1u;
}
`;

/** Wireframe edges with a colour per vertex; selected objects in red. */
export const LINES_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct VSIn {
  @location(0) position: vec3f,
  @location(1) object: u32,
  @location(2) color: vec3f,
};

struct VSOut {
  @builtin(position) clip: vec4f,
  @location(0) color: vec3f,
};

@vertex
fn vs(in: VSIn) -> VSOut {
  var out: VSOut;
  let p = previewPoint(in.position, in.object);
  out.clip = clipPosition(in.object, p);
  let selected = (objectState[in.object] & 1u) != 0u;
  let c = select(in.color, vec3f(1.0, 0.3, 0.3), selected);
  // The light theme draws on a light grid: every line goes darker, saturated ones keep their hue.
  out.color = select(c, c * 0.5, camera.theme > 0.5);
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(in.color, 1.0);
}
`;

/** Hammer-style 2D grid drawn as a fullscreen triangle in world units. */
export const GRID_SHADER = /* wgsl */ `
struct Grid {
  // World coordinate at the viewport centre, in the view's two axes.
  center: vec2f,
  // Viewport size in device pixels.
  size: vec2f,
  // World units per pixel.
  unitsPerPixel: f32,
  // Minor grid spacing in world units.
  spacing: f32,
  // 1 in the light theme: a light paper grid instead of the dark one.
  theme: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> grid: Grid;

struct VSOut {
  @builtin(position) clip: vec4f,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var out: VSOut;
  out.clip = vec4f(p[i], 0.0, 1.0);
  return out;
}

fn lineAlpha(coord: f32, spacing: f32) -> f32 {
  let c = coord / spacing;
  let d = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-6);
  return 1.0 - min(d, 1.0);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  // Pixel to world: y grows downwards on screen, upwards in the view.
  let px = in.clip.xy - grid.size * 0.5;
  let world = grid.center + vec2f(px.x, -px.y) * grid.unitsPerPixel;

  let light = grid.theme > 0.5;
  var color = select(vec3f(0.094, 0.094, 0.094), vec3f(0.8, 0.8, 0.8), light);
  let minor = max(lineAlpha(world.x, grid.spacing), lineAlpha(world.y, grid.spacing));
  color = mix(color, select(vec3f(0.14, 0.14, 0.14), vec3f(0.74, 0.74, 0.74), light), minor);
  let major = max(lineAlpha(world.x, grid.spacing * 8.0), lineAlpha(world.y, grid.spacing * 8.0));
  color = mix(color, select(vec3f(0.22, 0.22, 0.22), vec3f(0.66, 0.66, 0.66), light), major);
  let big = max(lineAlpha(world.x, 1024.0), lineAlpha(world.y, 1024.0));
  color = mix(color, select(vec3f(0.31, 0.31, 0.31), vec3f(0.56, 0.56, 0.56), light), big * step(grid.spacing, 1024.0));
  // World axes, measured directly in pixels (a huge spacing in lineAlpha
  // loses all precision in f32 and smears into wide bands).
  let axisPx = min(abs(world.x), abs(world.y)) / grid.unitsPerPixel;
  let axis = 1.0 - min(axisPx, 1.0);
  color = mix(color, select(vec3f(0.45, 0.45, 0.45), vec3f(0.45, 0.45, 0.45), light), axis);
  return vec4f(color, 1.0);
}
`;

/** Depth-only pass from the sun for brushes: positions and pick ids (for the preview and the cordon). */
export const SHADOW_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct VSIn {
  @location(0) position: vec3f,
  @location(3) pickId: u32,
};

@vertex
fn vs(in: VSIn) -> @builtin(position) vec4f {
  let object = pickObject[in.pickId];
  return clipPosition(object, previewPoint(in.position, object));
}
`;

/** Depth-only pass from the sun for prop instances. */
export const SHADOW_MODEL_SHADER = /* wgsl */ `
${SCENE_BINDINGS}

struct VSIn {
  @location(0) position: vec3f,
  @location(4) c0: vec4f,
  @location(5) c1: vec4f,
  @location(6) c2: vec4f,
  @location(7) c3: vec4f,
  @location(8) pickId: u32,
};

@vertex
fn vs(in: VSIn) -> @builtin(position) vec4f {
  let object = pickObject[in.pickId];
  let m = mat4x4f(in.c0, in.c1, in.c2, in.c3);
  return clipPosition(object, previewPoint((m * vec4f(in.position, 1.0)).xyz, object));
}
`;
