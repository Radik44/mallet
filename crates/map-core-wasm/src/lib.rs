//! WebAssembly surface of the map core.
//!
//! The frontend creates a [`MapDoc`] from VMF text, pulls typed arrays out
//! of it for the GPU, applies edits through it and gets the VMF text back
//! to save. Buffers are returned as copies into JS memory (the maps are
//! small; a 40 MB VMF gives a few tens of MB of vertex data), which keeps
//! the API simple until the editing layer needs incremental updates.

#![forbid(unsafe_code)]

pub mod mesh;

use std::collections::HashMap;

use geometry::Vec3;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
pub struct Stats {
    pub solids: usize,
    pub invalid_solids: usize,
    pub faces: usize,
    pub displacement_faces: usize,
    pub vertices: usize,
    pub triangles: usize,
    pub materials: usize,
    pub entities: usize,
    pub warnings: Vec<String>,
    pub bounds: Option<[[f64; 3]; 2]>,
    pub editor_build: u32,
    pub skyname: Option<String>,
}

#[derive(Serialize)]
pub struct EntityInfo {
    pub id: u32,
    pub classname: String,
    pub targetname: Option<String>,
    pub origin: Option<[f64; 3]>,
    pub angles: Option<[f64; 3]>,
    pub brush: bool,
    pub hidden: bool,
    /// The `model` key (props), when set.
    pub model: Option<String>,
    /// The `skin` key, 0 when absent.
    pub skin: u32,
    /// The `body` key (packed body group choice), 0 when absent.
    pub body: u32,
    /// The `modelscale` key, 1 when absent or invalid.
    pub scale: f64,
    /// `file` of a func_instance, forward slashes, lower-case.
    pub instance_file: Option<String>,
}

#[derive(Serialize)]
pub struct VisGroupInfo {
    pub id: u32,
    pub name: String,
    pub color: [u8; 3],
    pub children: Vec<VisGroupInfo>,
    /// Objects in this visgroup and how many of them are visible.
    pub members: usize,
    pub visible: usize,
}

#[derive(Serialize)]
pub struct CordonInfo {
    pub active: bool,
    pub mins: [f64; 3],
    pub maxs: [f64; 3],
}

#[derive(Serialize)]
pub struct AutoVisGroup {
    pub name: String,
    pub ids: Vec<u32>,
    pub visible: usize,
}

#[derive(Serialize, Deserialize)]
pub struct ConnectionDto {
    pub output: String,
    pub target: String,
    pub input: String,
    pub parameter: String,
    pub delay: f64,
    pub times_to_fire: i32,
}

impl From<&vmf::Connection> for ConnectionDto {
    fn from(c: &vmf::Connection) -> Self {
        ConnectionDto {
            output: c.output.clone(),
            target: c.target.clone(),
            input: c.input.clone(),
            parameter: c.parameter.clone(),
            delay: c.delay,
            times_to_fire: c.times_to_fire,
        }
    }
}

impl From<ConnectionDto> for vmf::Connection {
    fn from(c: ConnectionDto) -> Self {
        vmf::Connection {
            output: c.output,
            target: c.target,
            input: c.input,
            parameter: c.parameter,
            delay: c.delay,
            times_to_fire: c.times_to_fire,
        }
    }
}

#[derive(Serialize)]
pub struct EntityDetails {
    pub id: u32,
    pub classname: String,
    pub keyvalues: Vec<(String, String)>,
    pub connections: Vec<ConnectionDto>,
    pub brush: bool,
}

/// What an edit, undo or redo changed.
#[derive(Serialize)]
pub struct EditResult {
    pub version: u64,
    pub label: String,
    pub changed_ids: Vec<u32>,
    /// Objects were added or removed, so object indices shifted.
    pub structural: bool,
}

#[derive(Serialize)]
pub struct FaceInfoDto {
    pub material: String,
    /// `[x, y, z, shift, scale]`.
    pub uaxis: [f64; 5],
    pub vaxis: [f64; 5],
    pub rotation: f64,
    pub lightmap_scale: u32,
    pub smoothing_groups: u32,
    pub normal: [f64; 3],
    /// Displacement power, 0 for a plain face.
    pub disp_power: u32,
    /// Whether the face is a quad, so a displacement could be created.
    pub quad: bool,
}

/// One face-edit operation; absent fields leave the property alone.
#[derive(Deserialize, Default)]
#[serde(default)]
pub struct FaceEditDto {
    pub material: Option<String>,
    /// `"world"` or `"face"`.
    pub align: Option<String>,
    pub rotation: Option<f64>,
    pub scale_x: Option<f64>,
    pub scale_y: Option<f64>,
    pub shift_x: Option<f64>,
    pub shift_y: Option<f64>,
    pub lightmap_scale: Option<u32>,
    pub smoothing_groups: Option<u32>,
    /// `left`, `right`, `top`, `bottom`, `center` or `fit`.
    pub justify: Option<String>,
    pub tex_w: Option<f64>,
    pub tex_h: Option<f64>,
    /// Justify and fit against all the faces together.
    #[serde(default)]
    pub treat_as_one: Option<bool>,
}

#[derive(Serialize)]
pub struct ProblemDto {
    pub kind: String,
    pub object: u32,
    pub message: String,
}

#[derive(Serialize)]
pub struct HistoryState {
    pub version: u64,
    pub dirty: bool,
    pub undo: Option<String>,
    pub redo: Option<String>,
    /// Every undo step, oldest first, and every redo step, next first: the history panel's list.
    pub undo_labels: Vec<String>,
    pub redo_labels: Vec<String>,
}

#[wasm_bindgen]
pub struct MapDoc {
    doc: map_model::Document,
    mesh: mesh::Mesh,
}

fn to_js<T: Serialize>(v: &T) -> Result<JsValue, JsError> {
    serde_wasm_bindgen::to_value(v).map_err(|e| JsError::new(&e.to_string()))
}

#[wasm_bindgen]
impl MapDoc {
    /// The VMF text of an empty map with this sky, for "New map".
    pub fn empty_map_text(skyname: &str) -> String {
        map_model::Document::empty_map_text(skyname)
    }

    /// Converts `.map` text (Quake / Valve 220) to VMF text; throws with the line on bad input.
    pub fn import_map_text(text: &str) -> Result<String, JsError> {
        map_model::mapfmt::to_vmf(text).map_err(|e| JsError::new(&e.to_string()))
    }

    /// Parses VMF text and builds the render mesh. Throws on invalid files.
    #[wasm_bindgen(constructor)]
    pub fn new(text: &str) -> Result<MapDoc, JsError> {
        console_error_panic_hook::set_once();
        let doc = map_model::Document::open(text).map_err(|e| JsError::new(&e.to_string()))?;
        let mesh = mesh::build(doc.map());
        Ok(MapDoc { doc, mesh })
    }

    fn rebuild(&mut self) {
        self.mesh = mesh::build(self.doc.map());
    }

    pub fn stats(&self) -> Result<JsValue, JsError> {
        let map = self.doc.map();
        let s = Stats {
            solids: self.mesh.solids,
            invalid_solids: self.mesh.invalid_solids,
            faces: self.mesh.faces,
            displacement_faces: self.mesh.displacement_faces,
            vertices: self.mesh.positions.len() / 3,
            triangles: self.mesh.indices.len() / 3,
            materials: self.mesh.materials.len(),
            entities: map.entities.len(),
            warnings: map.warnings.iter().map(|w| w.to_string()).collect(),
            bounds: self
                .mesh
                .bounds
                .map(|(lo, hi)| [lo.to_array(), hi.to_array()]),
            editor_build: map.versioninfo.editor_build,
            skyname: map.world.skyname().map(str::to_string),
        };
        to_js(&s)
    }

    /// Material names in draw-range order.
    pub fn materials(&self) -> Vec<String> {
        self.mesh.materials.clone()
    }

    pub fn positions(&self) -> Vec<f32> {
        self.mesh.positions.clone()
    }

    pub fn normals(&self) -> Vec<f32> {
        self.mesh.normals.clone()
    }

    pub fn texcoords(&self) -> Vec<f32> {
        self.mesh.texcoords.clone()
    }

    /// WorldVertexTransition blend per vertex, 0..1.
    pub fn alphas(&self) -> Vec<f32> {
        self.mesh.alphas.clone()
    }

    /// Luxel (lightmap cell) coordinates per vertex, two per vertex.
    pub fn luxels(&self) -> Vec<f32> {
        self.mesh.luxels.clone()
    }

    pub fn indices(&self) -> Vec<u32> {
        self.mesh.indices.clone()
    }

    /// Flat `[material, first_index, count, ...]` triples.
    pub fn ranges(&self) -> Vec<u32> {
        self.mesh
            .ranges
            .iter()
            .flat_map(|&(m, f, c)| [m, f, c])
            .collect()
    }

    /// Face id per vertex, indexing the face table.
    pub fn face_ids(&self) -> Vec<u32> {
        self.mesh.face_ids.clone()
    }

    /// Flat `[solid_index, solid_id, side_id, material, ...]` per face.
    pub fn face_table(&self) -> Vec<u32> {
        self.mesh
            .face_table
            .iter()
            .flat_map(|r| [r.solid_index, r.solid_id, r.side_id, r.material])
            .collect()
    }

    /// VMF id of each emitted solid, by solid index.
    pub fn solid_ids(&self) -> Vec<u32> {
        self.mesh.solid_ids.clone()
    }

    /// Wireframe edges as a line list: xyz, xyz per edge.
    pub fn edges(&self) -> Vec<f32> {
        self.mesh.edges.clone()
    }

    /// Solid index per edge vertex.
    pub fn edge_solids(&self) -> Vec<u32> {
        self.mesh.edge_solids.clone()
    }

    /// Axis-aligned bounds per solid index: `[minx miny minz maxx maxy maxz, ...]`.
    pub fn solid_bounds(&self) -> Vec<f32> {
        let n = self.mesh.solid_ids.len();
        let mut out = vec![0f32; n * 6];
        let mut seen = vec![false; n];
        let p = &self.mesh.positions;
        for (v, &face) in self.mesh.face_ids.iter().enumerate() {
            let s = self.mesh.face_table[face as usize].solid_index as usize;
            let (x, y, z) = (p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
            let b = &mut out[s * 6..s * 6 + 6];
            if !seen[s] {
                seen[s] = true;
                b.copy_from_slice(&[x, y, z, x, y, z]);
            } else {
                b[0] = b[0].min(x);
                b[1] = b[1].min(y);
                b[2] = b[2].min(z);
                b[3] = b[3].max(x);
                b[4] = b[4].max(y);
                b[5] = b[5].max(z);
            }
        }
        out
    }

    pub fn entities(&self) -> Result<JsValue, JsError> {
        let list: Vec<EntityInfo> = self
            .doc
            .map()
            .entities
            .iter()
            .map(|e| EntityInfo {
                id: e.id,
                classname: e.classname.clone(),
                targetname: e.targetname().map(str::to_string),
                origin: e.origin().map(|v| v.to_array()),
                angles: e.angles().map(|v| v.to_array()),
                brush: e.is_brush_entity(),
                hidden: e.hidden,
                model: e
                    .get("model")
                    .map(|m| m.trim().replace('\\', "/").to_ascii_lowercase())
                    .filter(|m| m.ends_with(".mdl")),
                skin: e
                    .get("skin")
                    .and_then(|v| v.trim().parse().ok())
                    .unwrap_or(0),
                body: e
                    .get("body")
                    .and_then(|v| v.trim().parse().ok())
                    .unwrap_or(0),
                scale: e
                    .get("modelscale")
                    .and_then(|v| v.trim().parse().ok())
                    .filter(|s: &f64| *s > 0.0)
                    .unwrap_or(1.0),
                instance_file: if e.classname.eq_ignore_ascii_case("func_instance") {
                    e.get("file")
                        .map(|f| f.trim().replace('\\', "/").to_ascii_lowercase())
                        .filter(|f| !f.is_empty())
                } else {
                    None
                },
            })
            .collect();
        to_js(&list)
    }

    /// The map written back as VMF text, byte-identical to the input when
    /// nothing was edited.
    pub fn to_vmf(&self) -> String {
        self.doc.to_vmf()
    }

    // -----------------------------------------------------------------------
    // Editing
    // -----------------------------------------------------------------------

    /// Moves objects (VMF ids of solids or point entities) by a delta.
    /// Returns the edit result, or `undefined` when nothing changed.
    pub fn translate(
        &mut self,
        ids: Vec<u32>,
        dx: f64,
        dy: f64,
        dz: f64,
        texture_lock: bool,
    ) -> Result<JsValue, JsError> {
        edit_result(self.apply_translate(&ids, Vec3::new(dx, dy, dz), texture_lock))
    }

    /// Moves each object by its own delta: `ids[i]` by `deltas[3i..3i+3]`, one undo step.
    pub fn translate_each(
        &mut self,
        ids: Vec<u32>,
        deltas: Vec<f64>,
        texture_lock: bool,
    ) -> Result<JsValue, JsError> {
        let moves: Vec<(u32, Vec3)> = ids
            .iter()
            .enumerate()
            .filter_map(|(i, &id)| {
                deltas
                    .get(i * 3..i * 3 + 3)
                    .map(|d| (id, Vec3::new(d[0], d[1], d[2])))
            })
            .collect();
        let a = self.doc.translate_each(&moves, texture_lock);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Rotates objects by `degrees` about `axis` (xyz) through `pivot` (xyz).
    /// With `texture_lock`, texture axes turn with the brushes.
    pub fn rotate(
        &mut self,
        ids: Vec<u32>,
        pivot: Vec<f64>,
        axis: Vec<f64>,
        degrees: f64,
        texture_lock: bool,
    ) -> Result<JsValue, JsError> {
        let (pivot, axis) = (vec3_arg(&pivot, "pivot")?, vec3_arg(&axis, "axis")?);
        let lock = if texture_lock {
            map_model::TextureLock::OFFSET
        } else {
            map_model::TextureLock::NONE
        };
        let a = self.doc.rotate(&ids, pivot, axis, degrees, lock);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Scales objects about `pivot` by per-axis `factors`; negative factors
    /// mirror. `texture_lock` keeps textures attached, `scale_lock` also
    /// stretches them with the brush.
    pub fn scale(
        &mut self,
        ids: Vec<u32>,
        pivot: Vec<f64>,
        factors: Vec<f64>,
        texture_lock: bool,
        scale_lock: bool,
    ) -> Result<JsValue, JsError> {
        let (pivot, factors) = (vec3_arg(&pivot, "pivot")?, vec3_arg(&factors, "factors")?);
        let lock = map_model::TextureLock {
            offset: texture_lock,
            scale: scale_lock,
        };
        let a = self.doc.scale(&ids, pivot, factors, lock);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Sets the material of faces given as flat `[solid_id, side_id, ...]` pairs.
    pub fn set_material(&mut self, faces: Vec<u32>, material: &str) -> Result<JsValue, JsError> {
        let pairs: Vec<(u32, u32)> = faces.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        let a = self.doc.set_material(&pairs, material);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Creates a point entity at `origin` (xyz) with the given key-values
    /// (an array of `[key, value]` pairs, class defaults) and editor colour
    /// (`[r, g, b]`). The new entity's id is the first entry of `changed_ids`.
    pub fn create_entity(
        &mut self,
        classname: &str,
        origin: Vec<f64>,
        keyvalues: JsValue,
        color: Vec<u8>,
    ) -> Result<JsValue, JsError> {
        let origin = vec3_arg(&origin, "origin")?;
        let kvs: Vec<(String, String)> =
            serde_wasm_bindgen::from_value(keyvalues).map_err(|e| JsError::new(&e.to_string()))?;
        let a = self
            .doc
            .create_entity(classname, origin, &kvs, rgb_arg(&color));
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    // -----------------------------------------------------------------------
    // Cordon and clipping
    // -----------------------------------------------------------------------

    /// `{ active, mins, maxs }` of the editor cordon, or `undefined`.
    pub fn cordon(&self) -> Result<JsValue, JsError> {
        match self.doc.cordon() {
            Some((c, active)) => to_js(&CordonInfo {
                active,
                mins: c.mins.to_array(),
                maxs: c.maxs.to_array(),
            }),
            None => Ok(JsValue::UNDEFINED),
        }
    }

    /// Sets the cordon box `[minx, miny, minz, maxx, maxy, maxz]` (an empty
    /// array removes the cordon) and whether it is active.
    pub fn set_cordon(&mut self, bounds: Vec<f64>, active: bool) -> Result<JsValue, JsError> {
        let b = if bounds.is_empty() {
            None
        } else if bounds.len() == 6 {
            Some((
                Vec3::new(bounds[0], bounds[1], bounds[2]),
                Vec3::new(bounds[3], bounds[4], bounds[5]),
            ))
        } else {
            return Err(JsError::new("bounds must have six numbers or none"));
        };
        edit_result(self.doc.set_cordon(b, active))
    }

    /// Splits brushes by the plane `[nx, ny, nz, dist]`; `keep` is 0 for
    /// both halves, 1 for the front, 2 for the back. New ids follow the
    /// modified originals in `changed_ids`.
    pub fn clip(
        &mut self,
        ids: Vec<u32>,
        plane: Vec<f64>,
        keep: u32,
        material: &str,
    ) -> Result<JsValue, JsError> {
        if plane.len() != 4 {
            return Err(JsError::new("plane must have four numbers"));
        }
        let n = Vec3::new(plane[0], plane[1], plane[2]);
        let Some(n) = n.try_normalize() else {
            return Err(JsError::new("plane normal is zero"));
        };
        let keep = match keep {
            1 => map_model::ClipKeep::Front,
            2 => map_model::ClipKeep::Back,
            _ => map_model::ClipKeep::Both,
        };
        let material = if material.is_empty() {
            map_model::DEFAULT_MATERIAL
        } else {
            material
        };
        let a = self
            .doc
            .clip(&ids, geometry::Plane::new(n, plane[3]), keep, material);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Moves vertices of the given brushes: `moves` is flat
    /// `[fromX, fromY, fromZ, toX, toY, toZ, ...]`. Throws with a message
    /// when the result would not be a valid brush.
    pub fn move_vertices(&mut self, ids: Vec<u32>, moves: Vec<f64>) -> Result<JsValue, JsError> {
        let pairs: Vec<(Vec3, Vec3)> = moves
            .chunks_exact(6)
            .map(|c| (Vec3::new(c[0], c[1], c[2]), Vec3::new(c[3], c[4], c[5])))
            .collect();
        match self.doc.move_vertices(&ids, &pairs) {
            Ok(a) => {
                self.rebuild();
                edit_result(Some(a))
            }
            Err(e) => Err(JsError::new(&e)),
        }
    }

    /// Distinct corner positions of a brush, flat xyz.
    pub fn solid_vertices(&self, id: u32) -> Vec<f32> {
        self.doc
            .solid(id)
            .map(|s| {
                s.geometry()
                    .vertices
                    .iter()
                    .flat_map(|v| [v.x as f32, v.y as f32, v.z as f32])
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Carves every world brush the given brushes overlap (the carvers stay).
    pub fn carve(&mut self, carver_ids: Vec<u32>) -> Result<JsValue, JsError> {
        let a = self.doc.carve(&carver_ids);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Hollows brushes into walls `thickness` units thick (negative: outward).
    pub fn hollow(&mut self, ids: Vec<u32>, thickness: f64) -> Result<JsValue, JsError> {
        let a = self.doc.hollow(&ids, thickness);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    // -----------------------------------------------------------------------
    // Visibility, visgroups, groups
    // -----------------------------------------------------------------------

    /// Hides or shows objects; `via_auto` marks the change as an auto-visgroup one.
    pub fn set_hidden(
        &mut self,
        ids: Vec<u32>,
        hidden: bool,
        via_auto: bool,
    ) -> Result<JsValue, JsError> {
        let a = self.doc.set_hidden(&ids, hidden, via_auto);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    pub fn show_all(&mut self) -> Result<JsValue, JsError> {
        let a = self.doc.show_all();
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Ids of hidden objects (world solids and entities).
    pub fn hidden_ids(&self) -> Vec<u32> {
        let map = self.doc.map();
        map.world
            .solids
            .iter()
            .filter(|s| s.hidden)
            .map(|s| s.id)
            .chain(map.entities.iter().filter(|e| e.hidden).map(|e| e.id))
            .collect()
    }

    /// The user visgroup tree with member counts.
    pub fn visgroups(&self) -> Result<JsValue, JsError> {
        let map = self.doc.map();
        let mut membership: HashMap<u32, (usize, usize)> = HashMap::new();
        let mut count = |ids: &[u32], hidden: bool| {
            for &v in ids {
                let e = membership.entry(v).or_default();
                e.0 += 1;
                if !hidden {
                    e.1 += 1;
                }
            }
        };
        for s in &map.world.solids {
            count(&s.editor.visgroup_ids, s.hidden);
        }
        for e in &map.entities {
            count(&e.editor.visgroup_ids, e.hidden);
            for s in &e.solids {
                count(&s.editor.visgroup_ids, e.hidden);
            }
        }
        fn convert(
            groups: &[vmf::VisGroup],
            m: &HashMap<u32, (usize, usize)>,
        ) -> Vec<VisGroupInfo> {
            groups
                .iter()
                .map(|g| {
                    let (members, visible) = m.get(&g.id).copied().unwrap_or((0, 0));
                    VisGroupInfo {
                        id: g.id,
                        name: g.name.clone(),
                        color: [g.color.r, g.color.g, g.color.b],
                        children: convert(&g.children, m),
                        members,
                        visible,
                    }
                })
                .collect()
        }
        to_js(&convert(&map.visgroups, &membership))
    }

    /// Members of a user visgroup (solids and entities).
    pub fn visgroup_members(&self, visgroup: u32) -> Vec<u32> {
        let map = self.doc.map();
        let mut out: Vec<u32> = map
            .world
            .solids
            .iter()
            .filter(|s| s.editor.visgroup_ids.contains(&visgroup))
            .map(|s| s.id)
            .collect();
        for e in &map.entities {
            if e.editor.visgroup_ids.contains(&visgroup) {
                out.push(e.id);
            }
            out.extend(
                e.solids
                    .iter()
                    .filter(|s| s.editor.visgroup_ids.contains(&visgroup))
                    .map(|s| s.id),
            );
        }
        out
    }

    /// Hammer's automatic visgroups, computed from the map.
    pub fn auto_visgroups(&self) -> Result<JsValue, JsError> {
        let map = self.doc.map();
        let mut groups: Vec<(&str, Vec<u32>, usize)> = [
            "Мировая геометрия",
            "Дисплейсменты",
            "Инструментальные браши",
            "Скайбокс",
            "Точечные энтити",
            "Брашевые энтити",
            "Триггеры",
            "Источники света",
            "Пропы",
        ]
        .into_iter()
        .map(|n| (n, Vec::new(), 0))
        .collect();
        let mut add = |g: usize, id: u32, hidden: bool| {
            groups[g].1.push(id);
            if !hidden {
                groups[g].2 += 1;
            }
        };
        let is_tool = |m: &str| m.to_ascii_lowercase().starts_with("tools/");
        for s in &map.world.solids {
            let all_tools = !s.sides.is_empty() && s.sides.iter().all(|f| is_tool(&f.material));
            let disp = s.sides.iter().any(|f| f.dispinfo.is_some());
            let sky = s
                .sides
                .iter()
                .any(|f| f.material.to_ascii_lowercase().contains("toolsskybox"));
            if disp {
                add(1, s.id, s.hidden);
            } else if sky {
                add(3, s.id, s.hidden);
            } else if all_tools {
                add(2, s.id, s.hidden);
            } else {
                add(0, s.id, s.hidden);
            }
        }
        for e in &map.entities {
            let c = e.classname.to_ascii_lowercase();
            if e.is_brush_entity() {
                add(5, e.id, e.hidden);
                if c.starts_with("trigger_") {
                    add(6, e.id, e.hidden);
                }
            } else {
                add(4, e.id, e.hidden);
                if c.starts_with("light") {
                    add(7, e.id, e.hidden);
                } else if c.starts_with("prop_") {
                    add(8, e.id, e.hidden);
                }
            }
        }
        let list: Vec<AutoVisGroup> = groups
            .into_iter()
            .filter(|(_, ids, _)| !ids.is_empty())
            .map(|(name, ids, visible)| AutoVisGroup {
                name: name.to_string(),
                ids,
                visible,
            })
            .collect();
        to_js(&list)
    }

    /// Creates a visgroup holding `members`; the new id is `changed_ids[0]`.
    pub fn create_visgroup(
        &mut self,
        name: &str,
        color: Vec<u8>,
        members: Vec<u32>,
    ) -> Result<JsValue, JsError> {
        let rgb = match color.as_slice() {
            [r, g, b] => vmf::Rgb {
                r: *r,
                g: *g,
                b: *b,
            },
            _ => vmf::Rgb {
                r: 160,
                g: 160,
                b: 255,
            },
        };
        edit_result(self.doc.create_visgroup(name, rgb, &members))
    }

    pub fn delete_visgroup(&mut self, id: u32) -> Result<JsValue, JsError> {
        edit_result(self.doc.delete_visgroup(id))
    }

    pub fn rename_visgroup(&mut self, id: u32, name: &str) -> Result<JsValue, JsError> {
        edit_result(self.doc.rename_visgroup(id, name))
    }

    pub fn set_visgroup_membership(
        &mut self,
        ids: Vec<u32>,
        visgroup: u32,
        member: bool,
    ) -> Result<JsValue, JsError> {
        edit_result(self.doc.set_visgroup_membership(&ids, visgroup, member))
    }

    /// Groups objects; the group id is `changed_ids[0]`.
    pub fn group_objects(&mut self, ids: Vec<u32>) -> Result<JsValue, JsError> {
        edit_result(self.doc.group_objects(&ids))
    }

    pub fn ungroup_objects(&mut self, ids: Vec<u32>) -> Result<JsValue, JsError> {
        edit_result(self.doc.ungroup_objects(&ids))
    }

    /// Group of an object, or 0.
    pub fn group_of(&self, id: u32) -> u32 {
        self.doc.group_of(id).unwrap_or(0)
    }

    pub fn group_members(&self, group: u32) -> Vec<u32> {
        self.doc.group_members(group)
    }

    /// Everything the properties panel shows for one entity, or `undefined`.
    pub fn entity_details(&self, id: u32) -> Result<JsValue, JsError> {
        let Some(e) = self.doc.entity(id) else {
            return Ok(JsValue::UNDEFINED);
        };
        to_js(&EntityDetails {
            id: e.id,
            classname: e.classname.clone(),
            keyvalues: e.keyvalues.clone(),
            connections: e.connections.iter().map(ConnectionDto::from).collect(),
            brush: e.is_brush_entity(),
        })
    }

    /// Sets (`[key, value]`) or removes (`[key, null]`) entity keys; the
    /// key `classname` renames the class.
    pub fn set_entity_keyvalues(&mut self, id: u32, changes: JsValue) -> Result<JsValue, JsError> {
        let changes: Vec<(String, Option<String>)> =
            serde_wasm_bindgen::from_value(changes).map_err(|e| JsError::new(&e.to_string()))?;
        let a = self.doc.set_entity_keyvalues(id, &changes);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Replaces the entity's output connections.
    pub fn set_entity_connections(
        &mut self,
        id: u32,
        connections: JsValue,
    ) -> Result<JsValue, JsError> {
        let list: Vec<ConnectionDto> = serde_wasm_bindgen::from_value(connections)
            .map_err(|e| JsError::new(&e.to_string()))?;
        let a = self
            .doc
            .set_entity_connections(id, list.into_iter().map(Into::into).collect());
        edit_result(a)
    }

    /// Distinct `targetname` values, sorted, for I/O target suggestions.
    pub fn targetnames(&self) -> Vec<String> {
        let mut names: Vec<String> = self
            .doc
            .map()
            .entities
            .iter()
            .filter_map(|e| e.targetname())
            .filter(|n| !n.is_empty())
            .map(str::to_string)
            .collect();
        names.sort();
        names.dedup();
        names
    }

    /// Classname of the first entity with this targetname, for input suggestions.
    pub fn class_of_target(&self, targetname: &str) -> String {
        self.doc
            .map()
            .entities
            .iter()
            .find(|e| {
                e.targetname()
                    .is_some_and(|n| n.eq_ignore_ascii_case(targetname))
            })
            .map(|e| e.classname.clone())
            .unwrap_or_default()
    }

    /// Plane of a brush face as `[nx, ny, nz, dist]` (normal · p = dist), or
    /// an empty array when unknown.
    pub fn face_plane(&self, solid_id: u32, side_id: u32) -> Vec<f64> {
        self.doc
            .solid(solid_id)
            .and_then(|s| s.sides.iter().find(|side| side.id == side_id))
            .and_then(|side| side.plane)
            .map(|p| vec![p.normal.x, p.normal.y, p.normal.z, p.dist])
            .unwrap_or_default()
    }

    /// Material of a brush face, or an empty string.
    pub fn face_material(&self, solid_id: u32, side_id: u32) -> String {
        self.doc
            .solid(solid_id)
            .and_then(|s| s.sides.iter().find(|side| side.id == side_id))
            .map(|side| side.material.clone())
            .unwrap_or_default()
    }

    /// Side ids of a solid, in order.
    pub fn solid_sides(&self, solid_id: u32) -> Vec<u32> {
        self.doc
            .solid(solid_id)
            .map(|s| s.sides.iter().map(|side| side.id).collect())
            .unwrap_or_default()
    }

    /// Creates an axis-aligned world brush from `[minx, miny, minz, maxx,
    /// maxy, maxz]`. The new solid's id is the first entry of `changed_ids`.
    pub fn create_block(&mut self, bounds: Vec<f64>, material: &str) -> Result<JsValue, JsError> {
        if bounds.len() != 6 {
            return Err(JsError::new("bounds must have six numbers"));
        }
        let material = if material.is_empty() {
            map_model::DEFAULT_MATERIAL
        } else {
            material
        };
        let a = self.doc.create_block(
            Vec3::new(bounds[0], bounds[1], bounds[2]),
            Vec3::new(bounds[3], bounds[4], bounds[5]),
            material,
        );
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Creates a block-tool primitive (`block`, `wedge`, `cylinder`,
    /// `sphere`, `arch`) inside `bounds`, extruded along `axis` (0 X, 1 Y,
    /// 2 Z). `params` are `[sides, wall, arc, start, add_height]`; missing
    /// ones take Hammer's defaults. New solid ids are in `changed_ids`.
    pub fn create_primitive(
        &mut self,
        shape: &str,
        bounds: Vec<f64>,
        axis: u32,
        params: Vec<f64>,
        material: &str,
    ) -> Result<JsValue, JsError> {
        if bounds.len() != 6 {
            return Err(JsError::new("bounds must have six numbers"));
        }
        let shape = map_model::Primitive::parse(shape, &params)
            .ok_or_else(|| JsError::new(&format!("unknown primitive {shape}")))?;
        let material = if material.is_empty() {
            map_model::DEFAULT_MATERIAL
        } else {
            material
        };
        let a = self.doc.create_primitive(
            shape,
            Vec3::new(bounds[0], bounds[1], bounds[2]),
            Vec3::new(bounds[3], bounds[4], bounds[5]),
            axis as usize,
            material,
        );
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Ties the selected brushes to a brush entity (joining the one selected
    /// brush entity, or making a new `classname` with these `keyvalues`).
    /// The entity's id leads `changed_ids`.
    pub fn tie_to_entity(
        &mut self,
        ids: Vec<u32>,
        classname: &str,
        keyvalues: JsValue,
        color: Vec<u8>,
    ) -> Result<JsValue, JsError> {
        let kvs: Vec<(String, String)> =
            serde_wasm_bindgen::from_value(keyvalues).map_err(|e| JsError::new(&e.to_string()))?;
        let a = self
            .doc
            .tie_to_entity(&ids, classname, &kvs, rgb_arg(&color));
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Turns the selected brush entities back into world brushes.
    /// `changed_ids` lists the removed entities, then the brushes.
    pub fn move_to_world(&mut self, ids: Vec<u32>) -> Result<JsValue, JsError> {
        let a = self.doc.move_to_world(&ids);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Texture placement of a face, or `undefined`.
    pub fn face_info(&self, solid_id: u32, side_id: u32) -> Result<JsValue, JsError> {
        match self.doc.face_info(solid_id, side_id) {
            Some(f) => to_js(&FaceInfoDto {
                material: f.material,
                uaxis: [
                    f.uaxis.axis.x,
                    f.uaxis.axis.y,
                    f.uaxis.axis.z,
                    f.uaxis.shift,
                    f.uaxis.scale,
                ],
                vaxis: [
                    f.vaxis.axis.x,
                    f.vaxis.axis.y,
                    f.vaxis.axis.z,
                    f.vaxis.shift,
                    f.vaxis.scale,
                ],
                rotation: f.rotation,
                lightmap_scale: f.lightmap_scale,
                smoothing_groups: f.smoothing_groups,
                normal: [f.normal.x, f.normal.y, f.normal.z],
                disp_power: f.disp_power,
                quad: self.face_polygon(solid_id, side_id).len() == 12,
            }),
            None => Ok(JsValue::UNDEFINED),
        }
    }

    /// Outline of a face as `xyz` triples, counter-clockwise from outside;
    /// empty when the face does not exist or does not contribute.
    pub fn face_polygon(&self, solid_id: u32, side_id: u32) -> Vec<f32> {
        let Some(solid) = self.doc.solid(solid_id) else {
            return Vec::new();
        };
        let Some(i) = solid.sides.iter().position(|s| s.id == side_id) else {
            return Vec::new();
        };
        solid
            .geometry()
            .faces
            .get(i)
            .cloned()
            .flatten()
            .map(|poly| {
                poly.vertices
                    .iter()
                    .flat_map(|v| [v.x as f32, v.y as f32, v.z as f32])
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Face-edit sheet: applies `edit` (a `FaceEditDto`) to the
    /// `[solidId, sideId, ...]` faces.
    pub fn edit_faces(&mut self, faces: Vec<u32>, edit: JsValue) -> Result<JsValue, JsError> {
        let dto: FaceEditDto =
            serde_wasm_bindgen::from_value(edit).map_err(|e| JsError::new(&e.to_string()))?;
        let pairs: Vec<(u32, u32)> = faces.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        let align = match dto.align.as_deref() {
            Some("world") => Some(map_model::Align::World),
            Some("face") => Some(map_model::Align::Face),
            _ => None,
        };
        let justify = match dto.justify.as_deref() {
            Some("left") => Some(map_model::Justify::Left),
            Some("right") => Some(map_model::Justify::Right),
            Some("top") => Some(map_model::Justify::Top),
            Some("bottom") => Some(map_model::Justify::Bottom),
            Some("center") => Some(map_model::Justify::Center),
            Some("fit") => Some(map_model::Justify::Fit),
            _ => None,
        };
        let edit = map_model::FaceEdit {
            material: dto.material,
            align,
            rotation: dto.rotation,
            scale: [dto.scale_x, dto.scale_y],
            shift: [dto.shift_x, dto.shift_y],
            lightmap_scale: dto.lightmap_scale,
            smoothing_groups: dto.smoothing_groups,
            justify,
            tex_size: [dto.tex_w.unwrap_or(512.0), dto.tex_h.unwrap_or(512.0)],
            treat_as_one: dto.treat_as_one.unwrap_or(false),
        };
        let a = self.doc.edit_faces(&pairs, &edit);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Hammer's "Check for Problems": `{ kind, object, message }` entries.
    pub fn problems(&self) -> Result<JsValue, JsError> {
        let list: Vec<ProblemDto> = self
            .doc
            .problems()
            .into_iter()
            .map(|p| ProblemDto {
                kind: p.kind.name().to_string(),
                object: p.object,
                message: p.message,
            })
            .collect();
        to_js(&list)
    }

    /// Id of the brush entity owning a solid, or 0 for world brushes.
    pub fn entity_of_solid(&self, solid_id: u32) -> u32 {
        match self.doc.location(solid_id) {
            Some(map_model::Location::EntitySolid { entity, .. }) => self
                .doc
                .map()
                .entities
                .get(entity)
                .map(|e| e.id)
                .unwrap_or(0),
            _ => 0,
        }
    }

    /// Solid ids of a brush entity (empty for point entities).
    pub fn entity_solids(&self, id: u32) -> Vec<u32> {
        self.doc
            .entity(id)
            .map(|e| e.solids.iter().map(|s| s.id).collect())
            .unwrap_or_default()
    }

    /// The objects as a VMF snippet for the clipboard.
    pub fn export_objects(&self, ids: Vec<u32>) -> String {
        self.doc.export_objects(&ids)
    }

    /// Pastes a VMF snippet shifted by `delta`; new ids in `changed_ids`.
    pub fn paste_vmf(&mut self, text: &str, delta: Vec<f64>) -> Result<JsValue, JsError> {
        let delta = vec3_arg(&delta, "delta")?;
        let a = self.doc.paste_vmf(text, delta);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Fixes one problem from `problems()` (`kind` as reported there);
    /// `material` fills faces that have none. Null when nothing can be done.
    pub fn fix_problem(
        &mut self,
        kind: &str,
        object: u32,
        material: &str,
    ) -> Result<JsValue, JsError> {
        let Some(kind) = map_model::ProblemKind::from_name(kind) else {
            return Ok(JsValue::NULL);
        };
        let a = self.doc.fix_problem(kind, object, material);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Collapses a func_instance into the map: `text` is its VMF, `prefix`
    /// the name fixup, `replacements` `[["$var", "value"], ...]`.
    pub fn collapse_instance(
        &mut self,
        id: u32,
        text: &str,
        prefix: &str,
        replacements: JsValue,
    ) -> Result<JsValue, JsError> {
        let reps: Vec<(String, String)> = serde_wasm_bindgen::from_value(replacements)
            .map_err(|e| JsError::new(&e.to_string()))?;
        let a = self.doc.collapse_instance(id, text, prefix, &reps);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Duplicates the objects shifted by `delta`; new ids in `changed_ids`.
    pub fn clone_objects(&mut self, ids: Vec<u32>, delta: Vec<f64>) -> Result<JsValue, JsError> {
        let delta = vec3_arg(&delta, "delta")?;
        let a = self.doc.clone_objects(&ids, delta);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Turns quad faces (`[solidId, sideId, ...]`) into flat displacements.
    pub fn create_displacements(
        &mut self,
        faces: Vec<u32>,
        power: u32,
    ) -> Result<JsValue, JsError> {
        let pairs: Vec<(u32, u32)> = faces.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        let a = self
            .doc
            .create_displacements(&pairs, power.clamp(2, 4) as u8);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Removes displacements from the faces.
    /// Hammer's Invert on the displacements of `[solid, side, ...]` faces.
    pub fn invert_displacements(&mut self, faces: Vec<u32>) -> Result<JsValue, JsError> {
        let pairs: Vec<(u32, u32)> = faces.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        let a = self.doc.invert_displacements(&pairs);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// One power up on the displacements of `[solid, side, ...]` faces.
    pub fn subdivide_displacements(&mut self, faces: Vec<u32>) -> Result<JsValue, JsError> {
        let pairs: Vec<(u32, u32)> = faces.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        let a = self.doc.subdivide_displacements(&pairs);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    pub fn remove_displacements(&mut self, faces: Vec<u32>) -> Result<JsValue, JsError> {
        let pairs: Vec<(u32, u32)> = faces.chunks_exact(2).map(|c| (c[0], c[1])).collect();
        let a = self.doc.remove_displacements(&pairs);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Sculpts a displacement around `centre`; `axis` 0 is the face normal,
    /// 1 straight up. `merge` joins the stroke to the previous paint step.
    #[allow(clippy::too_many_arguments)]
    pub fn paint_displacement(
        &mut self,
        solid_id: u32,
        side_id: u32,
        centre: Vec<f64>,
        radius: f64,
        amount: f64,
        axis: u32,
        merge: bool,
    ) -> Result<JsValue, JsError> {
        let centre = vec3_arg(&centre, "centre")?;
        let axis = match axis {
            1 => map_model::PaintAxis::Up,
            2 => map_model::PaintAxis::Smooth,
            _ => map_model::PaintAxis::FaceNormal,
        };
        let a = self
            .doc
            .paint_displacement(solid_id, side_id, centre, radius, amount, axis, merge);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Paints displacement alpha (0..255) around `centre`.
    pub fn paint_alpha(
        &mut self,
        solid_id: u32,
        side_id: u32,
        centre: Vec<f64>,
        radius: f64,
        amount: f64,
        merge: bool,
    ) -> Result<JsValue, JsError> {
        let centre = vec3_arg(&centre, "centre")?;
        let a = self
            .doc
            .paint_alpha(solid_id, side_id, centre, radius, amount, merge);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// The displacement's alpha per grid vertex.
    pub fn displacement_alphas(&self, solid_id: u32, side_id: u32) -> Vec<f64> {
        self.doc.displacement_alphas(solid_id, side_id)
    }

    /// Sews the displacement faces of the given brushes along shared edges.
    /// The landscape brush over every displacement in reach: `mode` is
    /// `raise`, `smooth`, `flatten` (with `height`) or `noise` (with `seed`
    /// and `scale`); `axis` 0 face normal, 1 up.
    #[allow(clippy::too_many_arguments)]
    pub fn sculpt_displacements(
        &mut self,
        centre: Vec<f64>,
        radius: f64,
        amount: f64,
        mode: &str,
        axis: u32,
        height: f64,
        seed: u32,
        scale: f64,
        merge: bool,
    ) -> Result<JsValue, JsError> {
        let centre = vec3_arg(&centre, "centre")?;
        let axis = if axis == 1 {
            map_model::PaintAxis::Up
        } else {
            map_model::PaintAxis::FaceNormal
        };
        let mode = match mode {
            "smooth" => map_model::Sculpt::Smooth,
            "flatten" => map_model::Sculpt::Flatten { height },
            "noise" => map_model::Sculpt::Noise { axis, seed, scale },
            _ => map_model::Sculpt::Raise(axis),
        };
        let a = self
            .doc
            .sculpt_displacements(centre, radius, amount, mode, merge);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// The landscape wizard: `nx` by `ny` floor blocks with displacements of
    /// `power` on top; `origin` is the lowest corner, `size` is width, length
    /// and thickness. New solid ids are in `changed_ids`.
    pub fn create_landscape(
        &mut self,
        origin: Vec<f64>,
        size: Vec<f64>,
        nx: u32,
        ny: u32,
        power: u8,
        material: &str,
    ) -> Result<JsValue, JsError> {
        let origin = vec3_arg(&origin, "origin")?;
        let size = vec3_arg(&size, "size")?;
        let material = if material.is_empty() {
            map_model::DEFAULT_MATERIAL
        } else {
            material
        };
        let a = self
            .doc
            .create_landscape(origin, size, (nx, ny), power.clamp(2, 4), material);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    pub fn sew_displacements(&mut self, ids: Vec<u32>) -> Result<JsValue, JsError> {
        let a = self.doc.sew_displacements(&ids);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// The displacement's vertex grid as `xyz` triples (empty without one).
    pub fn displacement_grid(&self, solid_id: u32, side_id: u32) -> Vec<f32> {
        self.doc
            .displacement_grid(solid_id, side_id)
            .iter()
            .flat_map(|v| [v.x as f32, v.y as f32, v.z as f32])
            .collect()
    }

    /// The worldspawn's keys as `[key, value]` pairs (Map Properties).
    pub fn world_keyvalues(&self) -> Result<JsValue, JsError> {
        to_js(&self.doc.world_keyvalues().to_vec())
    }

    /// Sets (`[key, value]`) or removes (`[key, null]`) worldspawn keys.
    pub fn set_world_keyvalues(&mut self, changes: JsValue) -> Result<JsValue, JsError> {
        let changes: Vec<(String, Option<String>)> =
            serde_wasm_bindgen::from_value(changes).map_err(|e| JsError::new(&e.to_string()))?;
        edit_result(self.doc.set_world_keyvalues(&changes))
    }

    /// Replace Textures over the given brushes (empty for the whole map).
    pub fn replace_material(
        &mut self,
        find: &str,
        replace: &str,
        ids: Vec<u32>,
        substring: bool,
    ) -> Result<JsValue, JsError> {
        let a = self.doc.replace_material(find, replace, &ids, substring);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    /// Whether the id is a solid, an entity or unknown: `"solid"`, `"entity"`, `""`.
    pub fn kind_of(&self, id: u32) -> String {
        if self.doc.solid(id).is_some() {
            "solid".to_string()
        } else if self.doc.entity(id).is_some() {
            "entity".to_string()
        } else {
            String::new()
        }
    }

    /// Removes solids and point entities by VMF id.
    pub fn delete_objects(&mut self, ids: Vec<u32>) -> Result<JsValue, JsError> {
        let a = self.doc.delete(&ids);
        if a.is_some() {
            self.rebuild();
        }
        edit_result(a)
    }

    pub fn undo(&mut self) -> Result<JsValue, JsError> {
        edit_result(self.apply_undo())
    }

    pub fn redo(&mut self) -> Result<JsValue, JsError> {
        edit_result(self.apply_redo())
    }

    /// Folds the last `count` undo steps into one labelled step (a brush
    /// stroke, a row of props), so Ctrl+Z takes them back together.
    pub fn merge_undo(&mut self, count: u32, label: &str) -> bool {
        self.doc.merge_undo(count as usize, label)
    }

    /// Marks the steps that follow (the assistant's edits); an empty or absent prefix ends it.
    pub fn set_label_prefix(&mut self, prefix: Option<String>) {
        self.doc.set_label_prefix(prefix)
    }

    pub fn history(&self) -> Result<JsValue, JsError> {
        to_js(&HistoryState {
            version: self.doc.version(),
            dirty: self.doc.is_dirty(),
            undo: self.doc.undo_label().map(str::to_string),
            redo: self.doc.redo_label().map(str::to_string),
            undo_labels: self
                .doc
                .undo_labels()
                .into_iter()
                .map(str::to_string)
                .collect(),
            redo_labels: self
                .doc
                .redo_labels()
                .into_iter()
                .map(str::to_string)
                .collect(),
        })
    }

    pub fn mark_saved(&mut self) {
        self.doc.mark_saved();
    }
}

/// Plain-Rust editing entry points, usable from native tests; the
/// wasm-bindgen methods above wrap them.
impl MapDoc {
    pub fn apply_translate(
        &mut self,
        ids: &[u32],
        delta: Vec3,
        texture_lock: bool,
    ) -> Option<map_model::Applied> {
        let a = self.doc.translate(ids, delta, texture_lock)?;
        self.rebuild();
        Some(a)
    }

    pub fn apply_undo(&mut self) -> Option<map_model::Applied> {
        let a = self.doc.undo()?;
        self.rebuild();
        Some(a)
    }

    pub fn apply_redo(&mut self) -> Option<map_model::Applied> {
        let a = self.doc.redo()?;
        self.rebuild();
        Some(a)
    }
}

/// An `[r, g, b]` colour, Hammer's entity purple when malformed.
fn rgb_arg(color: &[u8]) -> vmf::Rgb {
    match color {
        [r, g, b] => vmf::Rgb {
            r: *r,
            g: *g,
            b: *b,
        },
        _ => vmf::Rgb {
            r: 220,
            g: 30,
            b: 220,
        },
    }
}

fn vec3_arg(v: &[f64], name: &str) -> Result<Vec3, JsError> {
    if v.len() != 3 {
        return Err(JsError::new(&format!("{name} must have three numbers")));
    }
    Ok(Vec3::new(v[0], v[1], v[2]))
}

fn edit_result(applied: Option<map_model::Applied>) -> Result<JsValue, JsError> {
    match applied {
        Some(a) => to_js(&EditResult {
            version: a.version,
            label: a.label,
            changed_ids: a.changed_ids,
            structural: a.structural,
        }),
        None => Ok(JsValue::UNDEFINED),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doc_round_trips_edits_and_reports_stats_natively() {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../kv/tests/fixtures/hammer_room.vmf"
        );
        let src = std::fs::read_to_string(path).unwrap();
        let mut doc = MapDoc::new(&src).unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert_eq!(doc.materials().len(), 4);
        assert_eq!(doc.ranges().len(), 12);
        assert_eq!(doc.solid_bounds().len(), 3 * 6);
        let b = doc.solid_bounds();
        assert_eq!(&b[0..6], &[-512.0, -512.0, -128.0, 512.0, 512.0, -64.0]);

        let before = doc.positions();
        doc.apply_translate(&[2], Vec3::new(0.0, 0.0, 10.0), false)
            .unwrap();
        let after = doc.positions();
        assert_ne!(before, after);
        assert_eq!(
            &doc.solid_bounds()[0..6],
            &[-512.0, -512.0, -118.0, 512.0, 512.0, -54.0]
        );
        doc.apply_undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert_eq!(doc.positions(), before);

        // Rotating the floor by 90° about Z keeps its square footprint.
        doc.doc
            .rotate(
                &[2],
                Vec3::ZERO,
                Vec3::Z,
                90.0,
                map_model::TextureLock::OFFSET,
            )
            .unwrap();
        doc.rebuild();
        assert_eq!(
            &doc.solid_bounds()[0..6],
            &[-512.0, -512.0, -128.0, 512.0, 512.0, -64.0]
        );
        doc.apply_undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }
}
