//! Typed view of a VMF (Valve Map Format) file.
//!
//! [`Map::parse`] reads a VMF through the lossless [`kv`] crate and lifts the
//! parts the editor needs into typed structures: version info, visgroups,
//! view settings, the world with its solids and groups, entities with their
//! solids and I/O connections, cameras and cordons. Everything the typed layer
//! does not understand stays in the underlying [`kv::Document`], which the
//! map keeps and writes back unchanged, so `Map::parse(src).to_string() == src`.
//!
//! Parsing is tolerant the way Hammer is: a malformed value becomes a
//! [`Warning`] and a default, never a hard error. Only a missing `world` block
//! is fatal.
//!
//! Numbers are converted to `f64`; the exact text of untouched values lives in
//! the kv document, which is what gets written. Editing through this layer is
//! the job of the future `map-model` crate.

#![forbid(unsafe_code)]

mod parse;

use std::fmt;

pub use geometry::{Plane, TexAxis, Vec3};
pub use kv::Document;

/// A non-fatal problem found while lifting the kv tree into typed data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Warning {
    /// `id` of the solid, side or entity involved, when known.
    pub object_id: Option<u32>,
    pub message: String,
}

impl fmt::Display for Warning {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self.object_id {
            Some(id) => write!(f, "[id {id}] {}", self.message),
            None => f.write_str(&self.message),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The file is not valid KeyValues.
    Syntax(kv::Error),
    /// No `world` block.
    NoWorld,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Syntax(e) => write!(f, "syntax error: {e}"),
            Error::NoWorld => f.write_str("no `world` block in map"),
        }
    }
}

impl std::error::Error for Error {}

impl From<kv::Error> for Error {
    fn from(e: kv::Error) -> Error {
        Error::Syntax(e)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct VersionInfo {
    pub editor_version: u32,
    pub editor_build: u32,
    pub map_version: u32,
    pub format_version: u32,
    pub prefab: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct VisGroup {
    pub id: u32,
    pub name: String,
    pub color: Rgb,
    pub children: Vec<VisGroup>,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ViewSettings {
    pub snap_to_grid: bool,
    pub show_grid: bool,
    pub show_logical_grid: bool,
    pub grid_spacing: u32,
    pub show_3d_grid: bool,
}

/// The `editor` block Hammer attaches to solids, entities and groups.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Editor {
    pub color: Rgb,
    pub visgroup_ids: Vec<u32>,
    pub visgroup_shown: bool,
    pub visgroup_auto_shown: bool,
    pub group_id: Option<u32>,
    pub comments: Option<String>,
    /// Position in Hammer's logical (I/O) view.
    pub logical_pos: Option<[f64; 2]>,
}

/// Displacement data of a side (`dispinfo`). Rows are indexed `[row][col]`
/// with `2^power + 1` entries each.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct DispInfo {
    pub power: u8,
    pub start_position: Vec3,
    pub flags: u32,
    pub elevation: f64,
    pub subdiv: bool,
    pub normals: Vec<Vec<Vec3>>,
    pub distances: Vec<Vec<f64>>,
    pub offsets: Vec<Vec<Vec3>>,
    pub offset_normals: Vec<Vec<Vec3>>,
    pub alphas: Vec<Vec<f64>>,
    pub triangle_tags: Vec<Vec<u32>>,
    pub allowed_verts: Vec<i64>,
}

impl DispInfo {
    /// Number of vertices along one edge: `2^power + 1`.
    pub fn verts_per_edge(&self) -> usize {
        (1usize << self.power) + 1
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Side {
    pub id: u32,
    /// The three points of the `plane` key, in file order.
    pub plane_points: [Vec3; 3],
    /// Plane derived from the points; `None` when they are collinear.
    pub plane: Option<Plane>,
    pub material: String,
    pub uaxis: TexAxis,
    pub vaxis: TexAxis,
    pub rotation: f64,
    pub lightmap_scale: u32,
    pub smoothing_groups: u32,
    pub dispinfo: Option<DispInfo>,
    /// Explicit vertices Hammer++ stores in `vertices_plus`, when present.
    pub vertices_plus: Option<Vec<Vec3>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Solid {
    pub id: u32,
    pub sides: Vec<Side>,
    pub editor: Editor,
    /// Wrapped in a `hidden` block in the file.
    pub hidden: bool,
}

impl Solid {
    /// Planes of all sides, in side order, ready for [`geometry::SolidGeometry`].
    pub fn planes(&self) -> Vec<Option<Plane>> {
        self.sides.iter().map(|s| s.plane).collect()
    }

    /// Faces of the brush: from the planes, corrected by the stored
    /// `vertices_plus` where Hammer++ wrote them and they agree with the planes.
    pub fn geometry(&self) -> geometry::SolidGeometry {
        let hints: Vec<Option<&[Vec3]>> = self
            .sides
            .iter()
            .map(|s| s.vertices_plus.as_deref())
            .collect();
        geometry::SolidGeometry::from_planes_with_hints(&self.planes(), &hints)
    }

    /// Faces from the planes alone, ignoring stored vertices: the pure plane
    /// arithmetic, for measuring it against Hammer++.
    pub fn geometry_from_planes(&self) -> geometry::SolidGeometry {
        geometry::SolidGeometry::from_planes(&self.planes())
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Group {
    pub id: u32,
    pub editor: Editor,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct World {
    pub id: u32,
    /// All plain key-values of `world` (`classname`, `skyname`, ...), in file order.
    pub keyvalues: Vec<(String, String)>,
    pub solids: Vec<Solid>,
    pub groups: Vec<Group>,
    pub editor: Editor,
}

impl World {
    pub fn get(&self, key: &str) -> Option<&str> {
        get_kv(&self.keyvalues, key)
    }

    pub fn skyname(&self) -> Option<&str> {
        self.get("skyname")
    }
}

/// One line of an entity's `connections` block:
/// `"OnPressed" "door_1,Open,,0,-1"`. Hammer 2013+ may use the ESC character
/// (0x1B) instead of commas; both are accepted.
#[derive(Debug, Clone, PartialEq)]
pub struct Connection {
    pub output: String,
    pub target: String,
    pub input: String,
    pub parameter: String,
    pub delay: f64,
    /// `-1` means fire every time.
    pub times_to_fire: i32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Entity {
    pub id: u32,
    pub classname: String,
    /// All plain key-values except `id` and `classname`, in file order.
    pub keyvalues: Vec<(String, String)>,
    pub connections: Vec<Connection>,
    pub solids: Vec<Solid>,
    pub editor: Editor,
    pub hidden: bool,
}

impl Entity {
    pub fn get(&self, key: &str) -> Option<&str> {
        get_kv(&self.keyvalues, key)
    }

    pub fn targetname(&self) -> Option<&str> {
        self.get("targetname")
    }

    /// `origin` as a vector; point entities always have one, brush entities
    /// usually do not.
    pub fn origin(&self) -> Option<Vec3> {
        parse::vec3(self.get("origin")?)
    }

    /// `angles` as pitch, yaw, roll in degrees.
    pub fn angles(&self) -> Option<Vec3> {
        parse::vec3(self.get("angles")?)
    }

    pub fn is_brush_entity(&self) -> bool {
        !self.solids.is_empty()
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Camera {
    pub position: Vec3,
    pub look: Vec3,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Cordon {
    pub name: String,
    pub active: bool,
    pub mins: Vec3,
    pub maxs: Vec3,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Map {
    doc: Document,
    pub versioninfo: VersionInfo,
    pub visgroups: Vec<VisGroup>,
    pub viewsettings: ViewSettings,
    pub world: World,
    pub entities: Vec<Entity>,
    pub cameras: Vec<Camera>,
    /// Index into `cameras`, or `None` for no active camera.
    pub active_camera: Option<usize>,
    pub cordons: Vec<Cordon>,
    /// True when the top-level `cordons` block has `"active" "1"`.
    pub cordons_active: bool,
    pub warnings: Vec<Warning>,
}

impl Map {
    /// Parses VMF text. Fails only on invalid KeyValues or a missing world.
    pub fn parse(src: &str) -> Result<Map, Error> {
        let doc = Document::parse(src)?;
        Map::from_document(doc)
    }

    pub fn from_document(doc: Document) -> Result<Map, Error> {
        parse::map_from_document(doc)
    }

    /// The underlying lossless KeyValues tree.
    pub fn document(&self) -> &Document {
        &self.doc
    }

    pub fn document_mut(&mut self) -> &mut Document {
        &mut self.doc
    }

    pub fn into_document(self) -> Document {
        self.doc
    }

    /// All solids of the map: world brushes, then brush entities' solids.
    pub fn solids(&self) -> impl Iterator<Item = &Solid> {
        self.world
            .solids
            .iter()
            .chain(self.entities.iter().flat_map(|e| e.solids.iter()))
    }

    pub fn entities_of_class<'a>(
        &'a self,
        classname: &'a str,
    ) -> impl Iterator<Item = &'a Entity> + 'a {
        self.entities
            .iter()
            .filter(move |e| e.classname.eq_ignore_ascii_case(classname))
    }

    pub fn entity_by_id(&self, id: u32) -> Option<&Entity> {
        self.entities.iter().find(|e| e.id == id)
    }

    /// Largest object id in the file; new objects get `max_id() + 1`.
    pub fn max_id(&self) -> u32 {
        let mut m = self.world.id;
        for s in self.solids() {
            m = m.max(s.id);
            for side in &s.sides {
                m = m.max(side.id);
            }
        }
        for e in &self.entities {
            m = m.max(e.id);
        }
        for g in &self.world.groups {
            m = m.max(g.id);
        }
        m
    }
}

impl fmt::Display for Map {
    /// Writes the map back as VMF text; byte-identical to the input when
    /// nothing was changed through the document.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.doc, f)
    }
}

fn get_kv<'a>(kvs: &'a [(String, String)], key: &str) -> Option<&'a str> {
    kvs.iter()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
        .map(|(_, v)| v.as_str())
}
