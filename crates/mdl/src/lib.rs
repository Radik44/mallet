//! Source studio models for the viewport: the `.mdl` header (materials,
//! skins, body parts, bounds), the `.vvd` vertices and the `.vtx` triangle
//! strips of the highest detail level, assembled into one indexed mesh per
//! material. Animation, bones and flexes are not needed to draw a prop at
//! rest and are skipped. Model versions 44–49 (every GMod model) are read.

#![forbid(unsafe_code)]

use std::fmt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// Not an `IDST`, `IDSV` or `IDSV`-style file, or a version outside 44–49.
    BadMagic(&'static str, String),
    /// An offset or count points past the end of the file.
    Truncated(&'static str),
    /// The three files do not belong together (checksums differ).
    ChecksumMismatch,
    /// The VTX names a body part, model or mesh the MDL does not have.
    Inconsistent(&'static str),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::BadMagic(what, got) => write!(f, "{what}: unexpected header {got}"),
            Error::Truncated(what) => write!(f, "{what}: file is truncated"),
            Error::ChecksumMismatch => write!(f, "mdl, vvd and vtx checksums differ"),
            Error::Inconsistent(what) => write!(f, "{what}: vtx does not match mdl"),
        }
    }
}

impl std::error::Error for Error {}

type Result<T> = std::result::Result<T, Error>;

/// Little-endian cursor with bounds checks.
struct Reader<'a> {
    data: &'a [u8],
    what: &'static str,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8], what: &'static str) -> Reader<'a> {
        Reader { data, what }
    }

    fn bytes(&self, at: usize, len: usize) -> Result<&'a [u8]> {
        self.data
            .get(at..at.checked_add(len).ok_or(Error::Truncated(self.what))?)
            .ok_or(Error::Truncated(self.what))
    }

    fn u8(&self, at: usize) -> Result<u8> {
        Ok(self.bytes(at, 1)?[0])
    }

    fn u16(&self, at: usize) -> Result<u16> {
        let b = self.bytes(at, 2)?;
        Ok(u16::from_le_bytes([b[0], b[1]]))
    }

    fn i32(&self, at: usize) -> Result<i32> {
        let b = self.bytes(at, 4)?;
        Ok(i32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn u32(&self, at: usize) -> Result<u32> {
        Ok(self.i32(at)? as u32)
    }

    fn f32(&self, at: usize) -> Result<f32> {
        Ok(f32::from_bits(self.u32(at)?))
    }

    fn vec3(&self, at: usize) -> Result<[f32; 3]> {
        Ok([self.f32(at)?, self.f32(at + 4)?, self.f32(at + 8)?])
    }

    /// `base + relative`, rejecting negative or overflowing offsets.
    fn offset(&self, base: usize, relative: i32) -> Result<usize> {
        let o = base as i64 + relative as i64;
        if o < 0 || o as usize > self.data.len() {
            return Err(Error::Truncated(self.what));
        }
        Ok(o as usize)
    }

    /// NUL-terminated string at `at`.
    fn cstr(&self, at: usize) -> Result<String> {
        let rest = self.data.get(at..).ok_or(Error::Truncated(self.what))?;
        let end = rest.iter().position(|&b| b == 0).unwrap_or(rest.len());
        Ok(String::from_utf8_lossy(&rest[..end]).into_owned())
    }
}

/// One mesh of a model: a material slot and its vertex range inside the
/// model's vertices.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MeshInfo {
    /// Index into the skin table (`Mdl::skins[family][material]` gives the texture).
    pub material: usize,
    pub vertex_offset: usize,
    pub vertex_count: usize,
}

/// One body part variant: a named sub-model with meshes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelInfo {
    pub name: String,
    /// First vertex of this model in the VVD's LOD 0 list.
    pub vertex_index: usize,
    pub vertex_count: usize,
    pub meshes: Vec<MeshInfo>,
}

/// A body group: the model variants `bodygroup` chooses from.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BodyPart {
    pub name: String,
    pub base: i32,
    pub models: Vec<ModelInfo>,
}

/// What the `.mdl` header says about a model.
#[derive(Debug, Clone, PartialEq)]
pub struct Mdl {
    pub version: i32,
    pub checksum: i32,
    pub name: String,
    pub flags: i32,
    /// Collision hull, the engine's "bounding box" of a prop.
    pub hull_min: [f32; 3],
    pub hull_max: [f32; 3],
    pub view_min: [f32; 3],
    pub view_max: [f32; 3],
    /// Material names without directory, in texture order.
    pub textures: Vec<String>,
    /// `$cdmaterials` directories, each ending in `/`.
    pub material_dirs: Vec<String>,
    /// `skins[family][slot]` = texture index; family 0 is the default skin.
    pub skins: Vec<Vec<u16>>,
    pub body_parts: Vec<BodyPart>,
    /// `$staticprop`.
    pub static_prop: bool,
}

impl Mdl {
    pub fn parse(data: &[u8]) -> Result<Mdl> {
        let r = Reader::new(data, "mdl");
        let id = r.bytes(0, 4)?;
        let version = r.i32(4)?;
        if id != b"IDST" || !(44..=49).contains(&version) {
            return Err(Error::BadMagic(
                "mdl",
                format!("{} v{version}", String::from_utf8_lossy(id)),
            ));
        }
        let checksum = r.i32(8)?;
        let name = r.cstr(12)?;
        let flags = r.i32(152)?;
        let hull_min = r.vec3(104)?;
        let hull_max = r.vec3(116)?;
        let view_min = r.vec3(128)?;
        let view_max = r.vec3(140)?;

        let numtextures = r.i32(204)?.max(0) as usize;
        let textureindex = r.offset(0, r.i32(208)?)?;
        let mut textures = Vec::with_capacity(numtextures);
        for i in 0..numtextures {
            let at = textureindex + i * 64;
            let name_at = r.offset(at, r.i32(at)?)?;
            textures.push(r.cstr(name_at)?);
        }

        let numcdtextures = r.i32(212)?.max(0) as usize;
        let cdtextureindex = r.offset(0, r.i32(216)?)?;
        let mut material_dirs = Vec::with_capacity(numcdtextures);
        for i in 0..numcdtextures {
            let at = r.offset(0, r.i32(cdtextureindex + i * 4)?)?;
            let mut dir = r.cstr(at)?.replace('\\', "/");
            if !dir.is_empty() && !dir.ends_with('/') {
                dir.push('/');
            }
            material_dirs.push(dir);
        }

        let numskinref = r.i32(220)?.max(0) as usize;
        let numskinfamilies = r.i32(224)?.max(0) as usize;
        let skinindex = r.offset(0, r.i32(228)?)?;
        let mut skins = Vec::with_capacity(numskinfamilies);
        for f in 0..numskinfamilies {
            let mut family = Vec::with_capacity(numskinref);
            for s in 0..numskinref {
                family.push(r.u16(skinindex + (f * numskinref + s) * 2)?);
            }
            skins.push(family);
        }

        let numbodyparts = r.i32(232)?.max(0) as usize;
        let bodypartindex = r.offset(0, r.i32(236)?)?;
        let mut body_parts = Vec::with_capacity(numbodyparts);
        for b in 0..numbodyparts {
            let bp = bodypartindex + b * 16;
            let bp_name = r.cstr(r.offset(bp, r.i32(bp)?)?)?;
            let nummodels = r.i32(bp + 4)?.max(0) as usize;
            let base = r.i32(bp + 8)?;
            let modelindex = r.offset(bp, r.i32(bp + 12)?)?;
            let mut models = Vec::with_capacity(nummodels);
            for m in 0..nummodels {
                let mo = modelindex + m * 148;
                let model_name = r.cstr(mo)?;
                let nummeshes = r.i32(mo + 72)?.max(0) as usize;
                let meshindex = r.offset(mo, r.i32(mo + 76)?)?;
                let numvertices = r.i32(mo + 80)?.max(0) as usize;
                // vertexindex is a byte offset into the VVD vertex block.
                let vertexindex = r.i32(mo + 84)?.max(0) as usize / 48;
                let mut meshes = Vec::with_capacity(nummeshes);
                for k in 0..nummeshes {
                    let me = meshindex + k * 116;
                    meshes.push(MeshInfo {
                        material: r.i32(me)?.max(0) as usize,
                        vertex_count: r.i32(me + 8)?.max(0) as usize,
                        vertex_offset: r.i32(me + 12)?.max(0) as usize,
                    });
                }
                models.push(ModelInfo {
                    name: model_name,
                    vertex_index: vertexindex,
                    vertex_count: numvertices,
                    meshes,
                });
            }
            body_parts.push(BodyPart {
                name: bp_name,
                base,
                models,
            });
        }

        Ok(Mdl {
            version,
            checksum,
            name,
            flags,
            hull_min,
            hull_max,
            view_min,
            view_max,
            textures,
            material_dirs,
            skins,
            body_parts,
            static_prop: flags & 0x10 != 0,
        })
    }

    /// Material name candidates for a texture slot: each `$cdmaterials`
    /// directory joined with the texture name, in order of preference.
    pub fn material_candidates(&self, texture: usize) -> Vec<String> {
        let Some(name) = self.textures.get(texture) else {
            return Vec::new();
        };
        let name = name.replace('\\', "/");
        if self.material_dirs.is_empty() {
            return vec![name];
        }
        self.material_dirs
            .iter()
            .map(|d| format!("{d}{name}"))
            .collect()
    }
}

/// A vertex of the highest detail level.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub uv: [f32; 2],
}

/// The `.vvd` file: vertices of LOD 0, fixups applied.
#[derive(Debug, Clone, PartialEq)]
pub struct Vvd {
    pub checksum: i32,
    pub vertices: Vec<Vertex>,
}

impl Vvd {
    pub fn parse(data: &[u8]) -> Result<Vvd> {
        let r = Reader::new(data, "vvd");
        let id = r.bytes(0, 4)?;
        let version = r.i32(4)?;
        if id != b"IDSV" || version != 4 {
            return Err(Error::BadMagic(
                "vvd",
                format!("{} v{version}", String::from_utf8_lossy(id)),
            ));
        }
        let checksum = r.i32(8)?;
        let num_lods = r.i32(12)?.max(0) as usize;
        let lod0_count = if num_lods > 0 {
            r.i32(16)?.max(0) as usize
        } else {
            0
        };
        let num_fixups = r.i32(48)?.max(0) as usize;
        let fixup_start = r.offset(0, r.i32(52)?)?;
        let vertex_start = r.offset(0, r.i32(56)?)?;

        let read_vertex = |i: usize| -> Result<Vertex> {
            let at = vertex_start + i * 48;
            Ok(Vertex {
                position: r.vec3(at + 16)?,
                normal: r.vec3(at + 28)?,
                uv: [r.f32(at + 40)?, r.f32(at + 44)?],
            })
        };

        let mut vertices = Vec::with_capacity(lod0_count);
        if num_fixups == 0 {
            for i in 0..lod0_count {
                vertices.push(read_vertex(i)?);
            }
        } else {
            // Fixups splice the shared vertex pool into per-LOD lists; LOD 0
            // takes every fixup whose lod is at least 0 (all of them), in order.
            for f in 0..num_fixups {
                let at = fixup_start + f * 12;
                let lod = r.i32(at)?;
                let source = r.i32(at + 4)?.max(0) as usize;
                let count = r.i32(at + 8)?.max(0) as usize;
                if lod < 0 {
                    continue;
                }
                for i in 0..count {
                    vertices.push(read_vertex(source + i)?);
                }
            }
        }
        Ok(Vvd { checksum, vertices })
    }
}

/// Triangle indices of one mesh at LOD 0, into the model's vertex list.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct VtxMesh {
    pub indices: Vec<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VtxModel {
    pub meshes: Vec<VtxMesh>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VtxBodyPart {
    pub models: Vec<VtxModel>,
}

/// The `.vtx` file: LOD 0 triangle lists per body part, model and mesh.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vtx {
    pub checksum: i32,
    pub body_parts: Vec<VtxBodyPart>,
}

impl Vtx {
    /// `mdl_version` decides the strip header layout (49 adds topology fields).
    pub fn parse(data: &[u8], mdl_version: i32) -> Result<Vtx> {
        let r = Reader::new(data, "vtx");
        let version = r.i32(0)?;
        if version != 7 {
            return Err(Error::BadMagic("vtx", format!("v{version}")));
        }
        // version, vertCacheSize, maxBonesPerStrip + maxBonesPerTri, maxBonesPerVert, checksum.
        let checksum = r.i32(16)?;
        let num_body_parts = r.i32(28)?.max(0) as usize;
        let body_part_offset = r.offset(0, r.i32(32)?)?;
        let extended = mdl_version >= 49;
        let strip_group_size = if extended { 33 } else { 25 };
        let strip_size = if extended { 35 } else { 27 };

        let mut body_parts = Vec::with_capacity(num_body_parts);
        for b in 0..num_body_parts {
            let bp = body_part_offset + b * 8;
            let num_models = r.i32(bp)?.max(0) as usize;
            let model_offset = r.offset(bp, r.i32(bp + 4)?)?;
            let mut models = Vec::with_capacity(num_models);
            for m in 0..num_models {
                let mo = model_offset + m * 8;
                let num_lods = r.i32(mo)?.max(0) as usize;
                let lod_offset = r.offset(mo, r.i32(mo + 4)?)?;
                let mut meshes = Vec::new();
                if num_lods > 0 {
                    // LOD 0 only.
                    let lo = lod_offset;
                    let num_meshes = r.i32(lo)?.max(0) as usize;
                    let mesh_offset = r.offset(lo, r.i32(lo + 4)?)?;
                    for k in 0..num_meshes {
                        let me = mesh_offset + k * 9;
                        let num_groups = r.i32(me)?.max(0) as usize;
                        let group_offset = r.offset(me, r.i32(me + 4)?)?;
                        let mut indices = Vec::new();
                        for g in 0..num_groups {
                            let sg = group_offset + g * strip_group_size;
                            let num_verts = r.i32(sg)?.max(0) as usize;
                            let vert_offset = r.offset(sg, r.i32(sg + 4)?)?;
                            let num_indices = r.i32(sg + 8)?.max(0) as usize;
                            let index_offset = r.offset(sg, r.i32(sg + 12)?)?;
                            let num_strips = r.i32(sg + 16)?.max(0) as usize;
                            let strip_offset = r.offset(sg, r.i32(sg + 20)?)?;
                            // Strip-group vertices map to the mesh's vertices.
                            let mut verts = Vec::with_capacity(num_verts);
                            for v in 0..num_verts {
                                verts.push(r.u16(vert_offset + v * 9 + 4)? as u32);
                            }
                            let mut group_indices = Vec::with_capacity(num_indices);
                            for i in 0..num_indices {
                                group_indices.push(r.u16(index_offset + i * 2)? as usize);
                            }
                            for s in 0..num_strips {
                                let st = strip_offset + s * strip_size;
                                let n = r.i32(st)?.max(0) as usize;
                                let first = r.i32(st + 4)?.max(0) as usize;
                                let flags = r.u8(st + 18)?;
                                let list = group_indices
                                    .get(
                                        first
                                            ..first
                                                .checked_add(n)
                                                .ok_or(Error::Truncated("vtx"))?,
                                    )
                                    .ok_or(Error::Truncated("vtx"))?;
                                let vert = |i: usize| -> Result<u32> {
                                    verts.get(i).copied().ok_or(Error::Truncated("vtx"))
                                };
                                if flags & 2 != 0 {
                                    // Triangle strip, alternating winding.
                                    for t in 0..n.saturating_sub(2) {
                                        let (a, b, c) = if t % 2 == 0 {
                                            (list[t], list[t + 1], list[t + 2])
                                        } else {
                                            (list[t + 1], list[t], list[t + 2])
                                        };
                                        if a == b || b == c || a == c {
                                            continue;
                                        }
                                        indices.extend([vert(a)?, vert(b)?, vert(c)?]);
                                    }
                                } else {
                                    for t in list.chunks_exact(3) {
                                        indices.extend([vert(t[0])?, vert(t[1])?, vert(t[2])?]);
                                    }
                                }
                            }
                        }
                        meshes.push(VtxMesh { indices });
                    }
                }
                models.push(VtxModel { meshes });
            }
            body_parts.push(VtxBodyPart { models });
        }
        Ok(Vtx {
            checksum,
            body_parts,
        })
    }
}

/// A drawable mesh: one per material slot, with all body parts' default
/// variant merged.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DrawMesh {
    /// Texture index into `Mdl::textures` after the skin table.
    pub texture: usize,
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub uvs: Vec<f32>,
    pub indices: Vec<u32>,
}

/// The assembled model at LOD 0, default body groups and the given skin.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DrawModel {
    pub meshes: Vec<DrawMesh>,
    pub mins: [f32; 3],
    pub maxs: [f32; 3],
}

impl DrawModel {
    pub fn triangle_count(&self) -> usize {
        self.meshes.iter().map(|m| m.indices.len() / 3).sum()
    }
}

/// Builds the drawable model from the three files. `skin` picks the skin
/// family (0 default); `bodygroups` picks each body part's variant (empty
/// means the first). Triangles wind counter-clockwise seen from outside, as
/// the engine draws them.
pub fn assemble(
    mdl: &Mdl,
    vvd: &Vvd,
    vtx: &Vtx,
    skin: usize,
    bodygroups: &[usize],
) -> Result<DrawModel> {
    if mdl.checksum != vvd.checksum || mdl.checksum != vtx.checksum {
        return Err(Error::ChecksumMismatch);
    }
    if vtx.body_parts.len() != mdl.body_parts.len() {
        return Err(Error::Inconsistent("body parts"));
    }
    let family = mdl
        .skins
        .get(skin)
        .or_else(|| mdl.skins.first())
        .cloned()
        .unwrap_or_default();
    let mut by_texture: Vec<DrawMesh> = Vec::new();
    let mut mins = [f32::INFINITY; 3];
    let mut maxs = [f32::NEG_INFINITY; 3];

    for (b, part) in mdl.body_parts.iter().enumerate() {
        let variant = bodygroups.get(b).copied().unwrap_or(0);
        let Some(model) = part.models.get(variant).or_else(|| part.models.first()) else {
            continue;
        };
        let mi = part
            .models
            .iter()
            .position(|m| std::ptr::eq(m, model))
            .unwrap_or(0);
        let vmodel = vtx.body_parts[b]
            .models
            .get(mi)
            .ok_or(Error::Inconsistent("models"))?;
        if vmodel.meshes.len() != model.meshes.len() {
            return Err(Error::Inconsistent("meshes"));
        }
        for (mesh, vmesh) in model.meshes.iter().zip(&vmodel.meshes) {
            if vmesh.indices.is_empty() {
                continue;
            }
            let texture = family
                .get(mesh.material)
                .map(|&t| t as usize)
                .unwrap_or(mesh.material);
            let slot = match by_texture.iter().position(|d| d.texture == texture) {
                Some(i) => i,
                None => {
                    by_texture.push(DrawMesh {
                        texture,
                        ..DrawMesh::default()
                    });
                    by_texture.len() - 1
                }
            };
            let draw = &mut by_texture[slot];
            let base = (draw.positions.len() / 3) as u32;
            let first = model.vertex_index + mesh.vertex_offset;
            for i in 0..mesh.vertex_count {
                let v = vvd.vertices.get(first + i).ok_or(Error::Truncated("vvd"))?;
                draw.positions.extend_from_slice(&v.position);
                draw.normals.extend_from_slice(&v.normal);
                draw.uvs.extend_from_slice(&v.uv);
                for k in 0..3 {
                    mins[k] = mins[k].min(v.position[k]);
                    maxs[k] = maxs[k].max(v.position[k]);
                }
            }
            for &i in &vmesh.indices {
                if i as usize >= mesh.vertex_count {
                    return Err(Error::Inconsistent("indices"));
                }
                draw.indices.push(base + i);
            }
        }
    }
    if !mins[0].is_finite() {
        mins = mdl.hull_min;
        maxs = mdl.hull_max;
    }
    Ok(DrawModel {
        meshes: by_texture,
        mins,
        maxs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_other_files() {
        assert!(matches!(
            Mdl::parse(b"VBSP....").err(),
            Some(Error::BadMagic(..))
        ));
        assert!(matches!(
            Vvd::parse(b"IDST").err(),
            Some(Error::Truncated(_))
        ));
        assert!(matches!(
            Vtx::parse(&[1, 0, 0, 0], 48).err(),
            Some(Error::BadMagic(..))
        ));
    }
}
