//! Source BSP (VBSP 19–21, Garry's Mod uses 20) reader and a decompiler to
//! VMF text.
//!
//! What comes back: world and entity brushes from the brush lumps (vbsp keeps
//! the original side planes and texture axes), entities from the entity lump
//! with their outputs, displacements from the displacement lumps, static
//! props and cubemaps from the game lump and the cubemap lump. What a compile
//! throws away cannot come back and is listed in the [`Report`]: ids, groups,
//! visgroups, instances, overlays, detail props, the exact plane points and
//! smoothing groups.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

use geometry::{Plane, SolidGeometry, Vec3};

const LUMP_ENTITIES: usize = 0;
const LUMP_PLANES: usize = 1;
const LUMP_TEXDATA: usize = 2;
const LUMP_NODES: usize = 5;
const LUMP_VERTEXES: usize = 3;
const LUMP_TEXINFO: usize = 6;
const LUMP_FACES: usize = 7;
const LUMP_EDGES: usize = 12;
const LUMP_SURFEDGES: usize = 13;
const LUMP_LEAFS: usize = 10;
const LUMP_MODELS: usize = 14;
const LUMP_LEAFBRUSHES: usize = 17;
const LUMP_BRUSHES: usize = 18;
const LUMP_BRUSHSIDES: usize = 19;
const LUMP_DISPINFO: usize = 26;
const LUMP_DISP_VERTS: usize = 33;
const LUMP_GAME: usize = 35;
const LUMP_CUBEMAPS: usize = 42;
const LUMP_TEXDATA_STRING_DATA: usize = 43;
const LUMP_TEXDATA_STRING_TABLE: usize = 44;
const LUMP_OVERLAYS: usize = 45;

const CONTENTS_AREAPORTAL: i32 = 0x8000;
const CONTENTS_PLAYERCLIP: i32 = 0x10000;
const CONTENTS_MONSTERCLIP: i32 = 0x20000;
const CONTENTS_ORIGIN: i32 = 0x1000000;
const CONTENTS_DETAIL: i32 = 0x8000000;

const SURF_SKY2D: i32 = 0x2;
const SURF_SKY: i32 = 0x4;
const SURF_TRIGGER: i32 = 0x40;
const SURF_NODRAW: i32 = 0x80;
const SURF_HINT: i32 = 0x100;
const SURF_SKIP: i32 = 0x200;

const STATIC_PROP_NO_SHADOW: u8 = 0x10;
const GAME_LUMP_STATIC_PROPS: i32 = 0x73707270; // 'sprp'

/// A parsed BSP: the header's lump table over the file's bytes.
pub struct Bsp {
    pub version: i32,
    pub map_revision: i32,
    lumps: Vec<(usize, usize, i32)>,
    data: Vec<u8>,
}

struct Reader<'a> {
    d: &'a [u8],
    p: usize,
}

impl<'a> Reader<'a> {
    fn new(d: &'a [u8]) -> Reader<'a> {
        Reader { d, p: 0 }
    }
    fn left(&self) -> usize {
        self.d.len().saturating_sub(self.p)
    }
    fn u8(&mut self) -> u8 {
        let v = self.d.get(self.p).copied().unwrap_or(0);
        self.p += 1;
        v
    }
    fn u16(&mut self) -> u16 {
        u16::from_le_bytes([self.u8(), self.u8()])
    }
    fn i16(&mut self) -> i16 {
        self.u16() as i16
    }
    fn i32(&mut self) -> i32 {
        i32::from_le_bytes([self.u8(), self.u8(), self.u8(), self.u8()])
    }
    fn u32(&mut self) -> u32 {
        self.i32() as u32
    }
    fn f32(&mut self) -> f32 {
        f32::from_bits(self.u32())
    }
    fn vec3(&mut self) -> Vec3 {
        let x = self.f32() as f64;
        let y = self.f32() as f64;
        let z = self.f32() as f64;
        Vec3::new(x, y, z)
    }
    fn skip(&mut self, n: usize) {
        self.p += n;
    }
    fn seek(&mut self, p: usize) {
        self.p = p;
    }
}

impl Bsp {
    pub fn parse(data: Vec<u8>) -> Result<Bsp, String> {
        if data.len() < 1036 || &data[0..4] != b"VBSP" {
            return Err("это не Source BSP (нет заголовка VBSP)".to_string());
        }
        let mut r = Reader::new(&data);
        r.skip(4);
        let version = r.i32();
        if !(17..=27).contains(&version) {
            return Err(format!("BSP версии {version} не поддерживается"));
        }
        let mut lumps = Vec::with_capacity(64);
        for _ in 0..64 {
            let ofs = r.i32().max(0) as usize;
            let len = r.i32().max(0) as usize;
            let ver = r.i32();
            r.skip(4); // fourCC
            lumps.push((ofs, len, ver));
        }
        let map_revision = r.i32();
        Ok(Bsp {
            version,
            map_revision,
            lumps,
            data,
        })
    }

    fn lump(&self, i: usize) -> &[u8] {
        let (ofs, len, _) = self.lumps[i];
        if ofs.saturating_add(len) > self.data.len() {
            return &[];
        }
        &self.data[ofs..ofs + len]
    }

    fn lump_version(&self, i: usize) -> i32 {
        self.lumps[i].2
    }

    fn planes(&self) -> Vec<Plane> {
        let d = self.lump(LUMP_PLANES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 20);
        while r.left() >= 20 {
            let n = r.vec3();
            let dist = r.f32() as f64;
            r.skip(4);
            out.push(Plane::new(n, dist));
        }
        out
    }

    fn texinfos(&self) -> Vec<TexInfo> {
        let d = self.lump(LUMP_TEXINFO);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 72);
        while r.left() >= 72 {
            let mut u = [0.0f64; 4];
            let mut v = [0.0f64; 4];
            let mut lu = [0.0f64; 4];
            let mut lv = [0.0f64; 4];
            for k in u.iter_mut() {
                *k = r.f32() as f64;
            }
            for k in v.iter_mut() {
                *k = r.f32() as f64;
            }
            for k in lu.iter_mut() {
                *k = r.f32() as f64;
            }
            for k in lv.iter_mut() {
                *k = r.f32() as f64;
            }
            let flags = r.i32();
            let texdata = r.i32();
            out.push(TexInfo {
                u,
                v,
                lu,
                lv,
                flags,
                texdata,
            });
        }
        out
    }

    fn texdata_names(&self) -> Vec<String> {
        let table = self.lump(LUMP_TEXDATA_STRING_TABLE);
        let strings = self.lump(LUMP_TEXDATA_STRING_DATA);
        let name_at = |ofs: usize| -> String {
            let s = &strings[ofs.min(strings.len())..];
            let end = s.iter().position(|&b| b == 0).unwrap_or(s.len());
            String::from_utf8_lossy(&s[..end]).to_string()
        };
        let d = self.lump(LUMP_TEXDATA);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 32);
        while r.left() >= 32 {
            r.skip(12);
            let id = r.i32();
            r.skip(16);
            let ofs = if id >= 0 && (id as usize) * 4 + 4 <= table.len() {
                let i = id as usize * 4;
                i32::from_le_bytes([table[i], table[i + 1], table[i + 2], table[i + 3]]).max(0)
                    as usize
            } else {
                usize::MAX
            };
            out.push(if ofs == usize::MAX {
                String::new()
            } else {
                name_at(ofs)
            });
        }
        out
    }

    fn brushes(&self) -> Vec<Brush> {
        let d = self.lump(LUMP_BRUSHES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 12);
        while r.left() >= 12 {
            out.push(Brush {
                first_side: r.i32(),
                num_sides: r.i32(),
                contents: r.i32(),
            });
        }
        out
    }

    fn brush_sides(&self) -> Vec<BrushSide> {
        let d = self.lump(LUMP_BRUSHSIDES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 8);
        while r.left() >= 8 {
            let plane = r.u16();
            let texinfo = r.i16();
            r.skip(2); // dispinfo: not a usable index in shipped maps
            let bevel = r.i16();
            out.push(BrushSide {
                plane,
                texinfo,
                bevel,
            });
        }
        out
    }

    fn models(&self) -> Vec<Model> {
        let d = self.lump(LUMP_MODELS);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 48);
        while r.left() >= 48 {
            r.skip(24);
            let origin = r.vec3();
            let headnode = r.i32();
            r.skip(8);
            out.push(Model { origin, headnode });
        }
        out
    }

    fn nodes(&self) -> Vec<[i32; 2]> {
        let d = self.lump(LUMP_NODES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 32);
        while r.left() >= 32 {
            r.skip(4);
            let a = r.i32();
            let b = r.i32();
            r.skip(20);
            out.push([a, b]);
        }
        out
    }

    /// `(first leaf brush, count)` per leaf; version 0 leaves carry ambient lighting and are longer.
    fn leaves(&self) -> Vec<(u16, u16)> {
        let d = self.lump(LUMP_LEAFS);
        let stride = if self.lump_version(LUMP_LEAFS) == 0 {
            56
        } else {
            32
        };
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / stride);
        while r.left() >= stride {
            let start = r.p;
            r.skip(4 + 2 + 2 + 12 + 4);
            let first = r.u16();
            let count = r.u16();
            out.push((first, count));
            r.seek(start + stride);
        }
        out
    }

    fn leaf_brushes(&self) -> Vec<u16> {
        let d = self.lump(LUMP_LEAFBRUSHES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 2);
        while r.left() >= 2 {
            out.push(r.u16());
        }
        out
    }

    fn dispinfos(&self) -> Vec<DispInfo> {
        let d = self.lump(LUMP_DISPINFO);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 176);
        while r.left() >= 176 {
            let start = r.p;
            let start_position = r.vec3();
            let vert_start = r.i32();
            r.skip(4);
            let power = r.i32();
            r.skip(4 + 4 + 4); // minTess, smoothingAngle, contents
            let map_face = r.u16();
            // Neighbour tables sit between; the ten allowed-vert words end the record.
            r.seek(start + 136);
            let mut allowed = [0u32; 10];
            for a in allowed.iter_mut() {
                *a = r.u32();
            }
            out.push(DispInfo {
                start_position,
                vert_start,
                power,
                map_face,
                allowed_verts: allowed,
            });
            r.seek(start + 176);
        }
        out
    }

    /// Faces (dface_t, 56 bytes): the fields the decompiler needs.
    fn faces(&self) -> Vec<Face> {
        let d = self.lump(LUMP_FACES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 56);
        while r.left() >= 56 {
            let start = r.p;
            let planenum = r.u16();
            let side = r.u8();
            r.skip(1);
            let firstedge = r.i32();
            let numedges = r.i16();
            let texinfo = r.i16();
            out.push(Face {
                planenum,
                side,
                firstedge,
                numedges,
                texinfo,
            });
            r.seek(start + 56);
        }
        out
    }

    fn edges(&self) -> Vec<[u16; 2]> {
        let d = self.lump(LUMP_EDGES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 4);
        while r.left() >= 4 {
            out.push([r.u16(), r.u16()]);
        }
        out
    }

    fn surfedges(&self) -> Vec<i32> {
        let d = self.lump(LUMP_SURFEDGES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 4);
        while r.left() >= 4 {
            out.push(r.i32());
        }
        out
    }

    fn vertices(&self) -> Vec<Vec3> {
        let d = self.lump(LUMP_VERTEXES);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 12);
        while r.left() >= 12 {
            out.push(r.vec3());
        }
        out
    }

    fn disp_verts(&self) -> Vec<(Vec3, f64, f64)> {
        let d = self.lump(LUMP_DISP_VERTS);
        let mut r = Reader::new(d);
        let mut out = Vec::with_capacity(d.len() / 20);
        while r.left() >= 20 {
            let v = r.vec3();
            let dist = r.f32() as f64;
            let alpha = r.f32() as f64;
            out.push((v, dist, alpha));
        }
        out
    }

    fn cubemaps(&self) -> Vec<([i32; 3], i32)> {
        let d = self.lump(LUMP_CUBEMAPS);
        let mut r = Reader::new(d);
        let mut out = Vec::new();
        while r.left() >= 16 {
            let o = [r.i32(), r.i32(), r.i32()];
            out.push((o, r.i32()));
        }
        out
    }

    fn overlay_count(&self) -> usize {
        self.lump(LUMP_OVERLAYS).len() / 352
    }

    fn entities_text(&self) -> String {
        let d = self.lump(LUMP_ENTITIES);
        let end = d.iter().position(|&b| b == 0).unwrap_or(d.len());
        String::from_utf8_lossy(&d[..end]).to_string()
    }

    fn static_props(&self) -> Vec<StaticProp> {
        let d = self.lump(LUMP_GAME);
        let (lump_ofs, _, _) = self.lumps[LUMP_GAME];
        let mut r = Reader::new(d);
        if r.left() < 4 {
            return Vec::new();
        }
        let count = r.i32().max(0) as usize;
        let mut out = Vec::new();
        for _ in 0..count.min(64) {
            if r.left() < 16 {
                break;
            }
            let id = r.i32();
            r.skip(2);
            let version = r.u16();
            let ofs = r.i32().max(0) as usize;
            let len = r.i32().max(0) as usize;
            if id != GAME_LUMP_STATIC_PROPS {
                continue;
            }
            // Game lump offsets are absolute in the file (relative only in console builds).
            let abs = if ofs >= lump_ofs && ofs + len <= self.data.len() {
                ofs
            } else {
                lump_ofs + ofs
            };
            if abs + len > self.data.len() {
                continue;
            }
            let mut s = Reader::new(&self.data[abs..abs + len]);
            let dict = s.i32().max(0) as usize;
            let mut names = Vec::with_capacity(dict);
            for _ in 0..dict {
                if s.left() < 128 {
                    break;
                }
                let bytes = &s.d[s.p..s.p + 128];
                let end = bytes.iter().position(|&b| b == 0).unwrap_or(128);
                names.push(String::from_utf8_lossy(&bytes[..end]).to_string());
                s.skip(128);
            }
            let leaf_count = s.i32().max(0) as usize;
            s.skip(leaf_count * 2);
            let prop_count = s.i32().max(0) as usize;
            if prop_count == 0 {
                continue;
            }
            let stride = s.left() / prop_count;
            if stride < 56 {
                continue;
            }
            for _ in 0..prop_count {
                let start = s.p;
                let origin = s.vec3();
                let angles = s.vec3();
                let prop_type = s.u16() as usize;
                s.skip(4);
                let solid = s.u8();
                let flags = s.u8();
                let skin = s.i32();
                let fade_min = s.f32() as f64;
                let fade_max = s.f32() as f64;
                s.seek(start + stride);
                out.push(StaticProp {
                    model: names.get(prop_type).cloned().unwrap_or_default(),
                    origin,
                    angles,
                    solid,
                    flags,
                    skin,
                    fade_min,
                    fade_max,
                    version,
                });
            }
        }
        out
    }
}

struct TexInfo {
    u: [f64; 4],
    v: [f64; 4],
    lu: [f64; 4],
    #[allow(dead_code)]
    lv: [f64; 4],
    flags: i32,
    texdata: i32,
}

struct Brush {
    first_side: i32,
    num_sides: i32,
    contents: i32,
}

struct BrushSide {
    plane: u16,
    texinfo: i16,
    bevel: i16,
}

struct Model {
    #[allow(dead_code)]
    origin: Vec3,
    headnode: i32,
}

struct Face {
    planenum: u16,
    /// Non-zero when the face looks against its plane's normal.
    side: u8,
    firstedge: i32,
    numedges: i16,
    texinfo: i16,
}

/// How thick a rebuilt displacement brush is: vbsp drops the brush and keeps only the face.
const DISP_THICKNESS: f64 = 16.0;

struct DispInfo {
    start_position: Vec3,
    vert_start: i32,
    power: i32,
    /// The face carrying this displacement; its plane finds the brush side.
    map_face: u16,
    allowed_verts: [u32; 10],
}

struct StaticProp {
    model: String,
    origin: Vec3,
    angles: Vec3,
    solid: u8,
    flags: u8,
    skin: i32,
    fade_min: f64,
    fade_max: f64,
    #[allow(dead_code)]
    version: u16,
}

/// What the decompiler produced and what it could not bring back.
#[derive(Debug, Default, Clone)]
pub struct Report {
    pub world_brushes: usize,
    pub detail_brushes: usize,
    pub entity_brushes: usize,
    pub sides: usize,
    pub entities: usize,
    pub static_props: usize,
    pub displacements: usize,
    pub cubemaps: usize,
    pub skipped_brushes: usize,
    /// Things a compile threw away, one line each.
    pub lost: Vec<String>,
}

pub struct Decompiled {
    pub vmf: String,
    pub report: Report,
}

fn fmt_num(v: f64) -> String {
    if !v.is_finite() {
        return "0".to_string();
    }
    let r = (v * 10000.0).round() / 10000.0;
    if (r - r.round()).abs() < 1e-9 {
        format!("{}", r.round() as i64)
    } else {
        let s = format!("{r:.4}");
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

fn fmt_vec(v: Vec3) -> String {
    format!("{} {} {}", fmt_num(v.x), fmt_num(v.y), fmt_num(v.z))
}

/// Three points on `plane` in Hammer's order; from the face polygon when
/// there is one, else any three around the plane's foot point.
fn plane_points(plane: &Plane, face: Option<&geometry::Polygon>) -> [Vec3; 3] {
    let mut pts = match face {
        Some(f) if f.vertices.len() >= 3 => {
            let n = f.vertices.len();
            // Spread the three points over the polygon so they are far from collinear.
            [f.vertices[0], f.vertices[n / 3], f.vertices[(2 * n) / 3]]
        }
        _ => {
            let n = plane.normal;
            let foot = n * plane.dist;
            let seed = if n.x.abs() < 0.9 { Vec3::X } else { Vec3::Y };
            let u = n.cross(seed).normalize();
            let v = n.cross(u);
            [foot, foot + u * 64.0, foot + v * 64.0]
        }
    };
    if let Some(p) = Plane::from_points(pts[0], pts[1], pts[2]) {
        if p.normal.dot(plane.normal) < 0.0 {
            pts.swap(1, 2);
        }
    }
    pts
}

/// `[nx ny nz offset] scale` from a vbsp texture vector, or Hammer's
/// world-aligned default when the vector is degenerate.
fn texture_axis(vec: [f64; 4], fallback: Vec3) -> String {
    let v = Vec3::new(vec[0], vec[1], vec[2]);
    let len = v.length();
    if len < 1e-9 {
        return format!("[{} 0] 0.25", fmt_vec(fallback));
    }
    let n = v / len;
    format!(
        "[{} {}] {}",
        fmt_vec(n),
        fmt_num(vec[3]),
        fmt_num(1.0 / len)
    )
}

/// Hammer's world-aligned axes for a plane normal.
fn world_axes(n: Vec3) -> (Vec3, Vec3) {
    let (u, v) = geometry::world_aligned_axes(n);
    (u, v)
}

/// vbsp's cubemap patching renames a material to `maps/<map>/<material>_<x>_<y>_<z>`;
/// the original name is what the mapper used.
fn unpatch_material(name: &str) -> &str {
    let lower = name.to_ascii_lowercase();
    if !lower.starts_with("maps/") {
        return name;
    }
    let Some(rest_start) = name[5..].find('/') else {
        return name;
    };
    let rest = &name[5 + rest_start + 1..];
    // Strip the trailing `_x_y_z` of signed integers.
    let mut end = rest.len();
    let mut cut = rest;
    for _ in 0..3 {
        let Some(u) = cut.rfind('_') else { return name };
        let num = &cut[u + 1..];
        if num.is_empty()
            || !num
                .trim_start_matches('-')
                .chars()
                .all(|c| c.is_ascii_digit())
        {
            return name;
        }
        end = u;
        cut = &cut[..u];
    }
    &rest[..end]
}

fn material_for(name: &str, flags: i32, contents: i32) -> String {
    let upper = unpatch_material(name).to_ascii_uppercase();
    if upper.starts_with("TOOLS/") {
        return upper;
    }
    if contents & CONTENTS_ORIGIN != 0 {
        return "TOOLS/TOOLSORIGIN".into();
    }
    if contents & CONTENTS_AREAPORTAL != 0 {
        return "TOOLS/TOOLSAREAPORTAL".into();
    }
    let clips = contents & (CONTENTS_PLAYERCLIP | CONTENTS_MONSTERCLIP);
    if clips == CONTENTS_PLAYERCLIP | CONTENTS_MONSTERCLIP {
        return "TOOLS/TOOLSCLIP".into();
    }
    if clips == CONTENTS_PLAYERCLIP {
        return "TOOLS/TOOLSPLAYERCLIP".into();
    }
    if clips == CONTENTS_MONSTERCLIP {
        return "TOOLS/TOOLSNPCCLIP".into();
    }
    if flags & SURF_SKY2D != 0 {
        return "TOOLS/TOOLSSKYBOX2D".into();
    }
    if flags & SURF_SKY != 0 {
        return "TOOLS/TOOLSSKYBOX".into();
    }
    if flags & SURF_HINT != 0 {
        return "TOOLS/TOOLSHINT".into();
    }
    if flags & SURF_SKIP != 0 {
        return "TOOLS/TOOLSSKIP".into();
    }
    if flags & SURF_TRIGGER != 0 {
        return "TOOLS/TOOLSTRIGGER".into();
    }
    if flags & SURF_NODRAW != 0 && !upper.is_empty() {
        return "TOOLS/TOOLSNODRAW".into();
    }
    if upper.is_empty() {
        return "TOOLS/TOOLSNODRAW".into();
    }
    upper
}

/// Key-value blocks of the entity lump: `{ "key" "value" ... }` repeated.
fn parse_entities(text: &str) -> Vec<Vec<(String, String)>> {
    let mut out = Vec::new();
    let mut cur: Option<Vec<(String, String)>> = None;
    let mut chars = text.chars().peekable();
    let read_quoted = |chars: &mut std::iter::Peekable<std::str::Chars>| -> String {
        let mut s = String::new();
        for c in chars.by_ref() {
            if c == '"' {
                break;
            }
            s.push(c);
        }
        s
    };
    while let Some(c) = chars.next() {
        match c {
            '{' => cur = Some(Vec::new()),
            '}' => {
                if let Some(e) = cur.take() {
                    out.push(e);
                }
            }
            '"' => {
                let key = read_quoted(&mut chars);
                // Skip to the value's opening quote.
                while let Some(&n) = chars.peek() {
                    if n == '"' {
                        break;
                    }
                    if n == '}' || n == '{' {
                        break;
                    }
                    chars.next();
                }
                if chars.peek() == Some(&'"') {
                    chars.next();
                    let value = read_quoted(&mut chars);
                    if let Some(e) = cur.as_mut() {
                        e.push((key, value));
                    }
                }
            }
            _ => {}
        }
    }
    out
}

fn is_connection(key: &str, value: &str) -> bool {
    value.contains('\u{1b}')
        || (key.len() > 2 && key.starts_with("On") && value.matches(',').count() >= 4)
}

struct Writer {
    out: String,
    next_id: u32,
}

impl Writer {
    fn id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }
    fn kv(&mut self, depth: usize, key: &str, value: &str) {
        for _ in 0..depth {
            self.out.push('\t');
        }
        let _ = writeln!(self.out, "\"{key}\" \"{}\"", value.replace('"', "'"));
    }
    fn open(&mut self, depth: usize, key: &str) {
        for _ in 0..depth {
            self.out.push('\t');
        }
        self.out.push_str(key);
        self.out.push('\n');
        for _ in 0..depth {
            self.out.push('\t');
        }
        self.out.push_str("{\n");
    }
    fn close(&mut self, depth: usize) {
        for _ in 0..depth {
            self.out.push('\t');
        }
        self.out.push_str("}\n");
    }
}

struct Side<'a> {
    plane: Plane,
    texinfo: Option<&'a TexInfo>,
}

/// Decompiles the map to VMF text.
pub fn decompile(bsp: &Bsp) -> Result<Decompiled, String> {
    let planes = bsp.planes();
    let texinfos = bsp.texinfos();
    let texnames = bsp.texdata_names();
    let brushes = bsp.brushes();
    let sides = bsp.brush_sides();
    let models = bsp.models();
    let nodes = bsp.nodes();
    let leaves = bsp.leaves();
    let leaf_brushes = bsp.leaf_brushes();
    let dispinfos = bsp.dispinfos();
    let disp_verts = bsp.disp_verts();
    // Displacement brushes are gone from the brush lump; vbsp keeps only their faces, so
    // they are rebuilt from the face polygon (see below).
    let faces = bsp.faces();
    let edges = bsp.edges();
    let surfedges = bsp.surfedges();
    let vertices = bsp.vertices();
    if planes.is_empty() || brushes.is_empty() {
        return Err("в BSP нет брашей: это не карта или она собрана без геометрии".to_string());
    }

    // Brushes of a model: every leaf under its head node.
    let brushes_of = |headnode: i32| -> BTreeSet<usize> {
        let mut out = BTreeSet::new();
        let mut stack = vec![headnode];
        let mut seen = 0usize;
        while let Some(n) = stack.pop() {
            seen += 1;
            if seen > nodes.len() + leaves.len() + 1 {
                break;
            }
            if n < 0 {
                let leaf = (-1 - n) as usize;
                if let Some(&(first, count)) = leaves.get(leaf) {
                    for k in first as usize..(first as usize + count as usize) {
                        if let Some(&b) = leaf_brushes.get(k) {
                            out.insert(b as usize);
                        }
                    }
                }
            } else if let Some(ch) = nodes.get(n as usize) {
                stack.push(ch[0]);
                stack.push(ch[1]);
            }
        }
        out
    };

    let mut report = Report::default();
    let mut w = Writer {
        out: String::with_capacity(bsp.data.len() / 2),
        next_id: 2,
    };

    // One convex volume as a `solid` block; `disp` puts a displacement on one side.
    // Returns false when nothing could be written.
    let write_solid = |w: &mut Writer,
                       depth: usize,
                       list: &[Side],
                       contents: i32,
                       disp: Option<(usize, &DispInfo)>,
                       report: &mut Report|
     -> bool {
        if list.len() < 4 {
            report.skipped_brushes += 1;
            return false;
        }
        let geom =
            SolidGeometry::from_planes(&list.iter().map(|s| Some(s.plane)).collect::<Vec<_>>());
        if !geom.is_valid() {
            report.skipped_brushes += 1;
            return false;
        }
        let solid_id = w.id();
        w.open(depth, "solid");
        w.kv(depth + 1, "id", &solid_id.to_string());
        for (i, s) in list.iter().enumerate() {
            let face = geom.faces.get(i).and_then(|f| f.as_ref());
            let pts = plane_points(&s.plane, face);
            let side_id = w.id();
            w.open(depth + 1, "side");
            w.kv(depth + 2, "id", &side_id.to_string());
            w.kv(
                depth + 2,
                "plane",
                &format!(
                    "({}) ({}) ({})",
                    fmt_vec(pts[0]),
                    fmt_vec(pts[1]),
                    fmt_vec(pts[2])
                ),
            );
            let (name, flags) = match s.texinfo {
                Some(t) => (
                    texnames
                        .get(t.texdata.max(0) as usize)
                        .map(String::as_str)
                        .unwrap_or(""),
                    t.flags,
                ),
                None => ("", 0),
            };
            w.kv(depth + 2, "material", &material_for(name, flags, contents));
            let (wu, wv) = world_axes(s.plane.normal);
            let (uaxis, vaxis, lightmap) = match s.texinfo {
                Some(t) => {
                    let lm = Vec3::new(t.lu[0], t.lu[1], t.lu[2]).length();
                    (
                        texture_axis(t.u, wu),
                        texture_axis(t.v, wv),
                        if lm > 1e-9 {
                            (1.0 / lm).round().clamp(1.0, 1024.0) as u32
                        } else {
                            16
                        },
                    )
                }
                None => (
                    format!("[{} 0] 0.25", fmt_vec(wu)),
                    format!("[{} 0] 0.25", fmt_vec(wv)),
                    16,
                ),
            };
            w.kv(depth + 2, "uaxis", &uaxis);
            w.kv(depth + 2, "vaxis", &vaxis);
            w.kv(depth + 2, "rotation", "0");
            w.kv(depth + 2, "lightmapscale", &lightmap.to_string());
            w.kv(depth + 2, "smoothing_groups", "0");
            if let Some((k, d)) = disp {
                if k == i {
                    write_dispinfo(w, depth + 2, d, &disp_verts);
                }
            }
            w.close(depth + 1);
            report.sides += 1;
        }
        w.open(depth + 1, "editor");
        w.kv(depth + 2, "color", "0 180 0");
        w.kv(depth + 2, "visgroupshown", "1");
        w.kv(depth + 2, "visgroupautoshown", "1");
        w.close(depth + 1);
        w.close(depth);
        true
    };
    // A brush from the brush lump: its non-bevel sides with their planes and texture info.
    let write_brush = |w: &mut Writer, depth: usize, b: &Brush, report: &mut Report| -> bool {
        let first = b.first_side.max(0) as usize;
        let count = b.num_sides.max(0) as usize;
        let mut list: Vec<Side> = Vec::with_capacity(count);
        for s in sides
            .iter()
            .take((first + count).min(sides.len()))
            .skip(first)
        {
            if s.bevel != 0 {
                continue;
            }
            let Some(plane) = planes.get(s.plane as usize) else {
                continue;
            };
            list.push(Side {
                plane: *plane,
                texinfo: if s.texinfo >= 0 {
                    texinfos.get(s.texinfo as usize)
                } else {
                    None
                },
            });
        }
        write_solid(w, depth, &list, b.contents, None, report)
    };
    // The polygon of a face from the edge lumps.
    let face_polygon = |f: &Face| -> Vec<Vec3> {
        (0..f.numedges.max(0) as usize)
            .filter_map(|k| {
                let se = *surfedges.get(f.firstedge.max(0) as usize + k)?;
                let e = edges.get(se.unsigned_abs() as usize)?;
                vertices
                    .get(if se >= 0 { e[0] } else { e[1] } as usize)
                    .copied()
            })
            .collect()
    };

    let entities = parse_entities(&bsp.entities_text());
    let worldspawn = entities
        .iter()
        .find(|e| e.iter().any(|(k, v)| k == "classname" && v == "worldspawn"));

    w.out.push_str(
        "versioninfo\n{\n\t\"editorversion\" \"400\"\n\t\"editorbuild\" \"8864\"\n\t\"mapversion\" \"1\"\n\t\"formatversion\" \"100\"\n\t\"prefab\" \"0\"\n}\nvisgroups\n{\n}\nviewsettings\n{\n\t\"bSnapToGrid\" \"1\"\n\t\"bShowGrid\" \"1\"\n\t\"bShowLogicalGrid\" \"0\"\n\t\"nGridSpacing\" \"64\"\n\t\"bShow3DGrid\" \"0\"\n}\n",
    );
    w.open(0, "world");
    w.kv(1, "id", "1");
    w.kv(1, "mapversion", "1");
    w.kv(1, "classname", "worldspawn");
    let skip_world = [
        "classname",
        "world_mins",
        "world_maxs",
        "hammerid",
        "mapversion",
        "model",
    ];
    let mut has_sky = false;
    if let Some(ws) = worldspawn {
        for (k, v) in ws {
            if skip_world.contains(&k.as_str()) {
                continue;
            }
            if k == "skyname" {
                has_sky = true;
            }
            w.kv(1, k, v);
        }
    }
    if !has_sky {
        w.kv(1, "skyname", "sky_day01_01");
    }
    // World brushes: model 0. Detail brushes come back as func_detail entities below.
    let world_set: BTreeSet<usize> = models
        .first()
        .map(|m| brushes_of(m.headnode))
        .unwrap_or_default();
    let mut detail: Vec<usize> = Vec::new();
    for &bi in &world_set {
        let Some(b) = brushes.get(bi) else { continue };
        if b.contents & CONTENTS_DETAIL != 0 {
            detail.push(bi);
            continue;
        }
        if write_brush(&mut w, 1, b, &mut report) {
            report.world_brushes += 1;
        }
    }
    // Displacements: a brush per displacement face, the face on top with the
    // displacement, nodraw walls down its edges and a nodraw bottom.
    for d in &dispinfos {
        let Some(f) = faces.get(d.map_face as usize) else {
            report.skipped_brushes += 1;
            continue;
        };
        let mut pts = face_polygon(f);
        let Some(base) = planes.get(f.planenum as usize) else {
            continue;
        };
        if pts.len() < 3 {
            report.skipped_brushes += 1;
            continue;
        }
        let n = if f.side != 0 {
            -base.normal
        } else {
            base.normal
        };
        if geometry::Polygon::new(pts.clone()).normal().dot(n) < 0.0 {
            pts.reverse();
        }
        let top = Plane::new(n, n.dot(pts[0]));
        let mut list = vec![Side {
            plane: top,
            texinfo: if f.texinfo >= 0 {
                texinfos.get(f.texinfo as usize)
            } else {
                None
            },
        }];
        let m = pts.len();
        for k in 0..m {
            let a = pts[k];
            let b = pts[(k + 1) % m];
            let sn = (b - a).cross(n);
            if sn.length() < 1e-9 {
                continue;
            }
            let sn = sn.normalize();
            list.push(Side {
                plane: Plane::new(sn, sn.dot(a)),
                texinfo: None,
            });
        }
        list.push(Side {
            plane: Plane::new(-n, -(n.dot(pts[0]) - DISP_THICKNESS)),
            texinfo: None,
        });
        if write_solid(&mut w, 1, &list, 0, Some((0, d)), &mut report) {
            report.displacements += 1;
            report.world_brushes += 1;
        }
    }
    w.close(0);

    // func_detail: each detail brush its own entity (groups are gone).
    for bi in detail {
        let b = &brushes[bi];
        // The brush is written to the side first: a brush vbsp mangled must not leave an empty entity.
        let mut tmp = Writer {
            out: String::new(),
            next_id: w.next_id,
        };
        if !write_brush(&mut tmp, 1, b, &mut report) {
            continue;
        }
        w.next_id = tmp.next_id;
        let id = w.id();
        w.open(0, "entity");
        w.kv(1, "id", &id.to_string());
        w.kv(1, "classname", "func_detail");
        w.out.push_str(&tmp.out);
        w.open(1, "editor");
        w.kv(2, "color", "0 180 0");
        w.kv(2, "visgroupshown", "1");
        w.kv(2, "visgroupautoshown", "1");
        w.close(1);
        w.close(0);
        report.detail_brushes += 1;
        report.entities += 1;
    }

    // Point and brush entities from the entity lump.
    let skip_entity = ["hammerid"];
    for e in &entities {
        let class = e
            .iter()
            .find(|(k, _)| k == "classname")
            .map(|(_, v)| v.as_str())
            .unwrap_or("");
        if class.is_empty() || class == "worldspawn" {
            continue;
        }
        let model_index = e
            .iter()
            .find(|(k, _)| k == "model")
            .and_then(|(_, v)| v.strip_prefix('*'))
            .and_then(|n| n.parse::<usize>().ok());
        let id = w.id();
        w.open(0, "entity");
        w.kv(1, "id", &id.to_string());
        let mut connections: Vec<(&str, &str)> = Vec::new();
        for (k, v) in e {
            if skip_entity.contains(&k.as_str()) {
                continue;
            }
            if k == "model" && model_index.is_some() {
                continue;
            }
            if is_connection(k, v) {
                connections.push((k, v));
                continue;
            }
            w.kv(1, k, v);
        }
        if !connections.is_empty() {
            w.open(1, "connections");
            for (k, v) in connections {
                w.kv(2, k, v);
            }
            w.close(1);
        }
        if let Some(mi) = model_index {
            if let Some(m) = models.get(mi) {
                for bi in brushes_of(m.headnode) {
                    if let Some(b) = brushes.get(bi) {
                        if write_brush(&mut w, 1, b, &mut report) {
                            report.entity_brushes += 1;
                        }
                    }
                }
            }
        }
        w.open(1, "editor");
        w.kv(2, "color", "220 30 220");
        w.kv(2, "visgroupshown", "1");
        w.kv(2, "visgroupautoshown", "1");
        w.kv(2, "logicalpos", "[0 0]");
        w.close(1);
        w.close(0);
        report.entities += 1;
    }

    // Static props from the game lump.
    for p in bsp.static_props() {
        if p.model.is_empty() {
            continue;
        }
        let id = w.id();
        w.open(0, "entity");
        w.kv(1, "id", &id.to_string());
        w.kv(1, "classname", "prop_static");
        w.kv(1, "model", &p.model);
        w.kv(1, "origin", &fmt_vec(p.origin));
        w.kv(1, "angles", &fmt_vec(p.angles));
        w.kv(1, "skin", &p.skin.to_string());
        w.kv(1, "solid", &p.solid.to_string());
        w.kv(1, "fademindist", &fmt_num(p.fade_min));
        w.kv(1, "fademaxdist", &fmt_num(p.fade_max));
        w.kv(
            1,
            "disableshadows",
            if p.flags & STATIC_PROP_NO_SHADOW != 0 {
                "1"
            } else {
                "0"
            },
        );
        w.open(1, "editor");
        w.kv(2, "color", "255 255 0");
        w.kv(2, "visgroupshown", "1");
        w.kv(2, "visgroupautoshown", "1");
        w.kv(2, "logicalpos", "[0 0]");
        w.close(1);
        w.close(0);
        report.static_props += 1;
        report.entities += 1;
    }

    // Cubemaps.
    for (o, size) in bsp.cubemaps() {
        let id = w.id();
        w.open(0, "entity");
        w.kv(1, "id", &id.to_string());
        w.kv(1, "classname", "env_cubemap");
        w.kv(1, "cubemapsize", &size.to_string());
        w.kv(1, "origin", &format!("{} {} {}", o[0], o[1], o[2]));
        w.open(1, "editor");
        w.kv(2, "color", "220 30 220");
        w.kv(2, "visgroupshown", "1");
        w.kv(2, "visgroupautoshown", "1");
        w.kv(2, "logicalpos", "[0 0]");
        w.close(1);
        w.close(0);
        report.cubemaps += 1;
        report.entities += 1;
    }

    w.out.push_str("cameras\n{\n\t\"activecamera\" \"-1\"\n}\ncordon\n{\n\t\"mins\" \"(-1024 -1024 -1024)\"\n\t\"maxs\" \"(1024 1024 1024)\"\n\t\"active\" \"0\"\n}\n");

    report.lost.push(
        "Идентификаторы, группы, visgroups и скрытые объекты: заменены новыми id, всё видимо"
            .into(),
    );
    report.lost.push(
        "func_detail: каждый детальный браш стал отдельной энтити, исходные группы неизвестны"
            .into(),
    );
    report.lost.push(
        "Точки плоскостей: взяты из пересечения плоскостей, координаты округлены до 0.0001".into(),
    );
    report.lost.push(
        "Группы сглаживания и поворот текстур: нули, оси текстур восстановлены как мировые".into(),
    );
    report
        .lost
        .push("func_instance: развёрнуты в карту ещё при сборке".into());
    let overlays = bsp.overlay_count();
    if overlays > 0 {
        report.lost.push(format!(
            "{overlays} info_overlay не восстановлены (лист оверлеев пока не читается)"
        ));
    }
    if report.skipped_brushes > 0 {
        report.lost.push(format!(
            "{} брашей пропущены: невыпуклые или без четырёх плоскостей после сборки",
            report.skipped_brushes
        ));
    }
    Ok(Decompiled { vmf: w.out, report })
}

fn write_dispinfo(w: &mut Writer, depth: usize, d: &DispInfo, verts: &[(Vec3, f64, f64)]) {
    let power = d.power.clamp(2, 4);
    let size = (1usize << power) + 1;
    let start = d.vert_start.max(0) as usize;
    let total = size * size;
    if start + total > verts.len() {
        return;
    }
    w.open(depth, "dispinfo");
    w.kv(depth + 1, "power", &power.to_string());
    w.kv(
        depth + 1,
        "startposition",
        &format!("[{}]", fmt_vec(d.start_position)),
    );
    w.kv(depth + 1, "flags", "0");
    w.kv(depth + 1, "elevation", "0");
    w.kv(depth + 1, "subdiv", "0");
    let row = |r: usize, f: &dyn Fn(&(Vec3, f64, f64)) -> String| -> String {
        (0..size)
            .map(|c| f(&verts[start + r * size + c]))
            .collect::<Vec<_>>()
            .join(" ")
    };
    type Cell = dyn Fn(&(Vec3, f64, f64)) -> String;
    let sections: [(&str, Box<Cell>); 5] = [
        ("normals", Box::new(|v| fmt_vec(v.0))),
        ("distances", Box::new(|v| fmt_num(v.1))),
        ("offsets", Box::new(|_| "0 0 0".to_string())),
        ("offset_normals", Box::new(|_| "0 0 1".to_string())),
        ("alphas", Box::new(|v| fmt_num(v.2))),
    ];
    for (name, f) in &sections {
        w.open(depth + 1, name);
        for r in 0..size {
            w.kv(depth + 2, &format!("row{r}"), &row(r, f.as_ref()));
        }
        w.close(depth + 1);
    }
    w.open(depth + 1, "triangle_tags");
    for r in 0..size - 1 {
        w.kv(
            depth + 2,
            &format!("row{r}"),
            &vec!["0"; 2 * (size - 1)].join(" "),
        );
    }
    w.close(depth + 1);
    w.open(depth + 1, "allowed_verts");
    w.kv(
        depth + 2,
        "10",
        &d.allowed_verts
            .iter()
            .map(|v| (*v as i32).to_string())
            .collect::<Vec<_>>()
            .join(" "),
    );
    w.close(depth + 1);
    w.close(depth);
}

/// Decompiled entities keyed by class, for a quick look at what came back.
pub fn class_counts(vmf: &str) -> BTreeMap<String, usize> {
    let mut out = BTreeMap::new();
    for line in vmf.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("\"classname\" \"") {
            if let Some(name) = rest.strip_suffix('"') {
                *out.entry(name.to_string()).or_default() += 1;
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_lump_parses_blocks_and_pairs() {
        let e = parse_entities("{\n\"classname\" \"worldspawn\"\n\"skyname\" \"sky_day01_01\"\n}\n{\n\"classname\" \"info_player_start\"\n\"origin\" \"0 0 0\"\n}\n");
        assert_eq!(e.len(), 2);
        assert_eq!(e[0][1], ("skyname".to_string(), "sky_day01_01".to_string()));
        assert_eq!(e[1][0].1, "info_player_start");
    }

    #[test]
    fn connections_are_recognised() {
        assert!(is_connection(
            "OnPressed",
            "door_1\u{1b}Open\u{1b}\u{1b}0\u{1b}-1"
        ));
        assert!(is_connection("OnPressed", "door_1,Open,,0,-1"));
        assert!(!is_connection("origin", "0 0 0"));
        assert!(!is_connection("OnPressed", "1,2"));
    }

    #[test]
    fn material_rules_follow_flags_and_contents() {
        assert_eq!(
            material_for("dev/dev_measuregeneric01b", 0, 0),
            "DEV/DEV_MEASUREGENERIC01B"
        );
        assert_eq!(material_for("tools/toolsnodraw", 0, 0), "TOOLS/TOOLSNODRAW");
        assert_eq!(material_for("brick/x", SURF_SKY, 0), "TOOLS/TOOLSSKYBOX");
        assert_eq!(
            material_for("brick/x", 0, CONTENTS_PLAYERCLIP | CONTENTS_MONSTERCLIP),
            "TOOLS/TOOLSCLIP"
        );
        assert_eq!(material_for("", 0, 0), "TOOLS/TOOLSNODRAW");
        assert_eq!(
            material_for(
                "maps/gm_construct/concrete/concretefloor028a_832_384_-96",
                0,
                0
            ),
            "CONCRETE/CONCRETEFLOOR028A"
        );
        assert_eq!(
            unpatch_material("maps/x/plaster/wall_1"),
            "maps/x/plaster/wall_1"
        );
    }

    #[test]
    fn plane_points_reproduce_the_plane() {
        let p = Plane::new(Vec3::new(0.0, 0.0, 1.0), 64.0);
        let pts = plane_points(&p, None);
        let back = Plane::from_points(pts[0], pts[1], pts[2]).unwrap();
        assert!(back.normal.dot(p.normal) > 0.999);
        assert!((back.dist - 64.0).abs() < 1e-6);
    }

    #[test]
    fn texture_axis_formats_scale_and_offset() {
        assert_eq!(
            texture_axis([4.0, 0.0, 0.0, 32.0], Vec3::X),
            "[1 0 0 32] 0.25"
        );
        assert_eq!(
            texture_axis([0.0, 0.0, 0.0, 0.0], Vec3::Y),
            "[0 1 0 0] 0.25"
        );
    }
}

const LUMP_VISIBILITY: usize = 4;

/// A visleaf of the compiled map: its box, its visibility cluster and how many clusters that
/// cluster sees (the cost VVIS assigned to standing there).
#[derive(Clone, Debug, PartialEq)]
pub struct VisLeaf {
    pub mins: [i32; 3],
    pub maxs: [i32; 3],
    pub cluster: i32,
    pub visible: u32,
}

/// The visleaves worth drawing (those with a cluster), with the cluster count and the busiest cluster.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct VisReport {
    pub leaves: Vec<VisLeaf>,
    pub clusters: u32,
    pub max_visible: u32,
}

/// Set bits of one run-length-compressed PVS row, counted up to `nclusters` bits.
pub fn pvs_count(data: &[u8], offset: usize, nclusters: usize) -> u32 {
    let mut count = 0u32;
    let mut bits = 0usize;
    let mut p = offset;
    while bits < nclusters && p < data.len() {
        let b = data[p];
        p += 1;
        if b == 0 {
            let run = data.get(p).copied().unwrap_or(1).max(1) as usize;
            p += 1;
            bits += 8 * run;
            continue;
        }
        for i in 0..8 {
            if bits + i < nclusters && b & (1 << i) != 0 {
                count += 1;
            }
        }
        bits += 8;
    }
    count
}

impl Bsp {
    /// Visible-cluster count per cluster from the visibility lump; empty when VVIS did not run.
    pub fn pvs_counts(&self) -> Vec<u32> {
        let d = self.lump(LUMP_VISIBILITY);
        if d.len() < 4 {
            return Vec::new();
        }
        let mut r = Reader::new(d);
        let n = r.i32().max(0) as usize;
        if d.len() < 4 + n * 8 {
            return Vec::new();
        }
        (0..n)
            .map(|i| {
                r.seek(4 + i * 8);
                let ofs = r.i32();
                if ofs < 0 {
                    0
                } else {
                    pvs_count(d, ofs as usize, n)
                }
            })
            .collect()
    }

    /// The leaves with a cluster, their boxes and the number of clusters each one sees.
    pub fn visleaves(&self) -> VisReport {
        let d = self.lump(LUMP_LEAFS);
        let stride = if self.lump_version(LUMP_LEAFS) == 0 {
            56
        } else {
            32
        };
        let counts = self.pvs_counts();
        let mut r = Reader::new(d);
        let mut leaves = Vec::with_capacity(d.len() / stride);
        while r.left() >= stride {
            let start = r.p;
            let _contents = r.i32();
            let cluster = r.i16() as i32;
            let _area_flags = r.u16();
            let mins = [r.i16() as i32, r.i16() as i32, r.i16() as i32];
            let maxs = [r.i16() as i32, r.i16() as i32, r.i16() as i32];
            r.seek(start + stride);
            if cluster < 0 {
                continue;
            }
            let visible = counts.get(cluster as usize).copied().unwrap_or(0);
            leaves.push(VisLeaf {
                mins,
                maxs,
                cluster,
                visible,
            });
        }
        let max_visible = leaves.iter().map(|l| l.visible).max().unwrap_or(0);
        VisReport {
            leaves,
            clusters: counts.len() as u32,
            max_visible,
        }
    }
}

#[cfg(test)]
mod visleaf_tests {
    use super::pvs_count;

    #[test]
    fn counts_run_length_pvs_rows() {
        // 0b00000101 (clusters 0 and 2), then a run of two zero bytes, then 0b10000000 (cluster 31).
        let row = [0b0000_0101u8, 0, 2, 0b1000_0000];
        assert_eq!(pvs_count(&row, 0, 32), 3);
        // Bits past the cluster count do not count.
        assert_eq!(pvs_count(&row, 0, 2), 1);
        // Rows start at an offset; a truncated row stops quietly.
        assert_eq!(pvs_count(&[0xFF, 0b0000_0101], 1, 8), 2);
        assert_eq!(pvs_count(&[0], 0, 64), 0);
    }
}
