//! The editable map document.
//!
//! [`Document`] owns a [`vmf::Map`] and is the only place where map state
//! changes. Every edit is a [`Transaction`] made of per-object changes, so
//! undo and redo are exact, and every edit is written through to the kv
//! tree the map was parsed from, so saving yields the original file with
//! only the touched values changed. Numbers are written the way Hammer
//! writes them (`%g`, six significant digits), which keeps diffs minimal.

#![forbid(unsafe_code)]

mod displacement;
mod format;
mod kvgen;
pub mod mapfmt;
mod primitives;
mod sync;
mod transform;

use std::collections::HashMap;

use geometry::{Plane, TexAxis, Vec3};
use kv::NodeList;
use vmf::{Editor, Entity, Map, Rgb, Side, Solid};

pub use displacement::{PaintAxis, Sculpt};
pub use format::fmt_g;
pub use glam::DAffine3 as Affine3;
pub use primitives::Primitive;
use transform::set_keyvalue;
pub use transform::{angle_matrix, matrix_angles, rotation_about, scaling_about, TextureLock};

/// Hammer's default texture for new brushes.
pub const DEFAULT_MATERIAL: &str = "DEV/DEV_MEASUREGENERIC01B";

/// Where an object lives inside the typed map.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Location {
    WorldSolid(usize),
    EntitySolid { entity: usize, solid: usize },
    Entity(usize),
}

#[derive(Debug, Clone)]
enum Snapshot {
    Solid(Solid),
    Entity(Entity),
}

#[derive(Debug, Clone)]
enum Change {
    /// Values of an existing object changed.
    Modify {
        id: u32,
        before: Snapshot,
        after: Snapshot,
    },
    /// The edit created this object; undo removes it (located by id).
    Insert {
        id: u32,
        loc: Location,
        object: Snapshot,
    },
    /// The edit removed this object; undo puts it back where it was.
    Remove {
        id: u32,
        loc: Location,
        object: Snapshot,
        kv_node: kv::Node,
        kv_path: Vec<usize>,
    },
    /// The visgroup tree changed; `id` is the visgroup the edit was about.
    VisGroups {
        id: u32,
        before: Vec<vmf::VisGroup>,
        after: Vec<vmf::VisGroup>,
    },
    /// The world's group list changed; `id` is the group the edit was about.
    Groups {
        id: u32,
        before: Vec<vmf::Group>,
        after: Vec<vmf::Group>,
    },
    /// The cordon list or its active flag changed.
    Cordons {
        before: (Vec<vmf::Cordon>, bool),
        after: (Vec<vmf::Cordon>, bool),
    },
    /// The object is affected by the step (its brush list changed) but the
    /// data lives in the step's other changes; undo and redo skip it.
    Touch { id: u32 },
    /// The worldspawn key-values changed (Map Properties). `before_pairs`
    /// are the block's original pair nodes, so undo restores every byte.
    World {
        before: Vec<(String, String)>,
        before_pairs: Vec<kv::Node>,
        after: Vec<(String, String)>,
    },
}

impl Change {
    fn id(&self) -> u32 {
        match self {
            Change::Modify { id, .. }
            | Change::Insert { id, .. }
            | Change::Remove { id, .. }
            | Change::VisGroups { id, .. }
            | Change::Groups { id, .. }
            | Change::Touch { id } => *id,
            Change::Cordons { .. } | Change::World { .. } => 0,
        }
    }
}

/// One undoable step.
#[derive(Debug, Clone)]
pub struct Transaction {
    pub label: String,
    changes: Vec<Change>,
}

impl Transaction {
    /// Ids of the objects the step touched, in order, each once.
    pub fn changed_ids(&self) -> Vec<u32> {
        let mut ids: Vec<u32> = Vec::with_capacity(self.changes.len());
        for id in self.changes.iter().map(Change::id) {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
        ids
    }
}

/// Result of applying, undoing or redoing a transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Applied {
    pub version: u64,
    pub label: String,
    pub changed_ids: Vec<u32>,
    /// Objects added or removed, so callers know indices shifted.
    pub structural: bool,
}

#[derive(Debug)]
pub struct Document {
    map: Map,
    locations: HashMap<u32, Location>,
    paths: sync::Paths,
    undo: Vec<Transaction>,
    redo: Vec<Transaction>,
    version: u64,
    next_id: u32,
    /// Undo-stack depth at the last save; `usize::MAX` once that state is
    /// unreachable (an edit was made after undoing past it).
    saved_depth: usize,
    /// Put before every step's label while set (the assistant's edits, for the history list).
    label_prefix: Option<String>,
    /// Connections are written with Hammer 2013's ESC separator unless the
    /// file already uses commas.
    esc_connections: bool,
}

impl Document {
    /// The VMF text of an empty map as Hammer 2013 writes it: version info,
    /// view settings, a worldspawn with `skyname`, no brushes, no entities.
    pub fn empty_map_text(skyname: &str) -> String {
        let sky = skyname.trim();
        let sky = if sky.is_empty() { "sky_day01_01" } else { sky };
        format!(
            "versioninfo\n{{\n\t\"editorversion\" \"400\"\n\t\"editorbuild\" \"8864\"\n\t\"mapversion\" \"1\"\n\t\"formatversion\" \"100\"\n\t\"prefab\" \"0\"\n}}\n\
visgroups\n{{\n}}\n\
viewsettings\n{{\n\t\"bSnapToGrid\" \"1\"\n\t\"bShowGrid\" \"1\"\n\t\"bShowLogicalGrid\" \"0\"\n\t\"nGridSpacing\" \"64\"\n\t\"bShow3DGrid\" \"0\"\n}}\n\
world\n{{\n\t\"id\" \"1\"\n\t\"mapversion\" \"1\"\n\t\"classname\" \"worldspawn\"\n\t\"detailmaterial\" \"detail/detailsprites\"\n\t\"detailvbsp\" \"detail.vbsp\"\n\t\"maxpropscreenwidth\" \"-1\"\n\t\"skyname\" \"{sky}\"\n}}\n\
cameras\n{{\n\t\"activecamera\" \"-1\"\n}}\n\
cordons\n{{\n\t\"active\" \"0\"\n}}\n"
        )
    }

    pub fn open(text: &str) -> Result<Document, vmf::Error> {
        let map = Map::parse(text)?;
        Ok(Document::from_map(map))
    }

    pub fn from_map(map: Map) -> Document {
        let paths = sync::Paths::build(&map);
        let next_id = map.max_id() + 1;
        let esc_connections = !uses_comma_connections(&map);
        let mut doc = Document {
            map,
            locations: HashMap::new(),
            paths,
            undo: Vec::new(),
            redo: Vec::new(),
            version: 0,
            next_id,
            saved_depth: 0,
            label_prefix: None,
            esc_connections,
        };
        doc.reindex();
        doc
    }

    /// Rebuilds the id and kv-path indexes after a structural change.
    fn reindex(&mut self) {
        self.locations.clear();
        for (i, s) in self.map.world.solids.iter().enumerate() {
            self.locations.insert(s.id, Location::WorldSolid(i));
        }
        for (ei, e) in self.map.entities.iter().enumerate() {
            self.locations.insert(e.id, Location::Entity(ei));
            for (si, s) in e.solids.iter().enumerate() {
                self.locations.insert(
                    s.id,
                    Location::EntitySolid {
                        entity: ei,
                        solid: si,
                    },
                );
            }
        }
        self.paths = sync::Paths::build(&self.map);
    }

    pub fn map(&self) -> &Map {
        &self.map
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    /// True when the document differs from the last saved (or opened) state.
    /// Undoing back to that state makes it clean again.
    pub fn is_dirty(&self) -> bool {
        self.undo.len() != self.saved_depth
    }

    pub fn mark_saved(&mut self) {
        self.saved_depth = self.undo.len();
    }

    /// Every step committed from now on carries this before its label (none to stop).
    pub fn set_label_prefix(&mut self, prefix: Option<String>) {
        self.label_prefix = prefix.filter(|p| !p.is_empty());
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    pub fn undo_label(&self) -> Option<&str> {
        self.undo.last().map(|t| t.label.as_str())
    }

    pub fn redo_label(&self) -> Option<&str> {
        self.redo.last().map(|t| t.label.as_str())
    }

    /// Labels of every undo step, oldest first; the last one is what Ctrl+Z takes back.
    pub fn undo_labels(&self) -> Vec<&str> {
        self.undo.iter().map(|t| t.label.as_str()).collect()
    }

    /// Labels of the redo steps, the next one first.
    pub fn redo_labels(&self) -> Vec<&str> {
        self.redo.iter().rev().map(|t| t.label.as_str()).collect()
    }

    pub fn location(&self, id: u32) -> Option<Location> {
        self.locations.get(&id).copied()
    }

    pub fn solid(&self, id: u32) -> Option<&Solid> {
        match self.location(id)? {
            Location::WorldSolid(i) => self.map.world.solids.get(i),
            Location::EntitySolid { entity, solid } => {
                self.map.entities.get(entity)?.solids.get(solid)
            }
            Location::Entity(_) => None,
        }
    }

    pub fn entity(&self, id: u32) -> Option<&Entity> {
        match self.location(id)? {
            Location::Entity(i) => self.map.entities.get(i),
            _ => None,
        }
    }

    /// The map as VMF text: the original file with only edited values changed.
    pub fn to_vmf(&self) -> String {
        self.map.to_string()
    }

    fn alloc_id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    // -----------------------------------------------------------------------
    // Edits
    // -----------------------------------------------------------------------

    /// Moves solids and point entities by `delta`. With `texture_lock`, the
    /// texture shifts follow the brush so textures stay put on it, as in
    /// Hammer with Texture Lock on.
    pub fn translate(&mut self, ids: &[u32], delta: Vec3, texture_lock: bool) -> Option<Applied> {
        if delta == Vec3::ZERO {
            return None;
        }
        self.modify_objects(
            ids,
            ("Переместить объект", "Переместить объекты ({})"),
            |solid| translate_solid(solid, delta, texture_lock),
            |entity| match entity.origin() {
                Some(origin) => {
                    set_keyvalue(entity, "origin", &format::fmt_vec3(origin + delta));
                    // An overlay's projection frame moves with it.
                    transform::transform_overlay_basis(
                        entity,
                        &glam::DAffine3::from_translation(delta),
                    );
                    true
                }
                None => false,
            },
            false,
        )
    }

    /// Applies an affine transform to solids and point entities. Brushes
    /// that would become invalid (collapsed by scaling) abort the whole edit.
    pub fn transform(
        &mut self,
        ids: &[u32],
        m: &Affine3,
        lock: TextureLock,
        labels: (&str, &str),
    ) -> Option<Applied> {
        if m.abs_diff_eq(Affine3::IDENTITY, 1.0e-12) {
            return None;
        }
        self.modify_objects(
            ids,
            labels,
            |solid| transform::transform_solid(solid, m, lock),
            |entity| transform::transform_entity(entity, m),
            true,
        )
    }

    /// Rotates about `axis` through `pivot` by `degrees`.
    pub fn rotate(
        &mut self,
        ids: &[u32],
        pivot: Vec3,
        axis: Vec3,
        degrees: f64,
        lock: TextureLock,
    ) -> Option<Applied> {
        let m = rotation_about(pivot, axis, degrees)?;
        self.transform(
            ids,
            &m,
            lock,
            ("Повернуть объект", "Повернуть объекты ({})"),
        )
    }

    /// Scales about `pivot` by per-axis `factors`; negative factors mirror.
    pub fn scale(
        &mut self,
        ids: &[u32],
        pivot: Vec3,
        factors: Vec3,
        lock: TextureLock,
    ) -> Option<Applied> {
        let m = scaling_about(pivot, factors)?;
        let labels = if factors.min_element() < 0.0 {
            ("Отразить объект", "Отразить объекты ({})")
        } else {
            ("Масштабировать объект", "Масштабировать объекты ({})")
        };
        self.transform(ids, &m, lock, labels)
    }

    /// Shared body of the value-changing edits: snapshots each object,
    /// applies the closures, validates and writes through.
    fn modify_objects(
        &mut self,
        ids: &[u32],
        labels: (&str, &str),
        mut on_solid: impl FnMut(&mut Solid),
        mut on_entity: impl FnMut(&mut Entity) -> bool,
        validate: bool,
    ) -> Option<Applied> {
        let mut changes = Vec::new();
        for &id in ids {
            let Some(loc) = self.location(id) else {
                continue;
            };
            match loc {
                Location::WorldSolid(_) | Location::EntitySolid { .. } => {
                    let Some(solid) = self.solid_mut(loc) else {
                        continue;
                    };
                    let before = solid.clone();
                    on_solid(solid);
                    if validate && !solid.geometry().is_valid() {
                        // Roll back everything touched so far.
                        *solid = before;
                        for c in changes {
                            if let Change::Modify { id, before, .. } = c {
                                self.restore_snapshot(id, &before);
                            }
                        }
                        return None;
                    }
                    let after = solid.clone();
                    changes.push(Change::Modify {
                        id,
                        before: Snapshot::Solid(before),
                        after: Snapshot::Solid(after),
                    });
                }
                Location::Entity(i) => {
                    let Some(entity) = self.map.entities.get_mut(i) else {
                        continue;
                    };
                    let before = entity.clone();
                    if !on_entity(entity) {
                        continue;
                    }
                    let after = entity.clone();
                    changes.push(Change::Modify {
                        id,
                        before: Snapshot::Entity(before),
                        after: Snapshot::Entity(after),
                    });
                }
            }
        }
        // A brush entity moved whole carries its origin (a door's hinge, a rotor's axis) and
        // angles along, as in Hammer; one with only some of its brushes moved keeps them.
        // Its change comes after its brushes', so undo puts the keys back first.
        let picked: std::collections::HashSet<u32> = ids.iter().copied().collect();
        let mut owners: Vec<usize> = Vec::new();
        for &id in ids {
            if let Some(Location::EntitySolid { entity, .. }) = self.location(id) {
                if !owners.contains(&entity) {
                    owners.push(entity);
                }
            }
        }
        for i in owners {
            let entity = &mut self.map.entities[i];
            if picked.contains(&entity.id) || !entity.solids.iter().all(|s| picked.contains(&s.id))
            {
                continue;
            }
            let before = entity.clone();
            if !on_entity(entity) {
                continue;
            }
            let after = entity.clone();
            changes.push(Change::Modify {
                id: after.id,
                before: Snapshot::Entity(before),
                after: Snapshot::Entity(after),
            });
        }
        if changes.is_empty() {
            return None;
        }
        let label = if changes.len() == 1 {
            labels.0.to_string()
        } else {
            labels.1.replace("{}", &changes.len().to_string())
        };
        for c in &changes {
            self.write_through(c.id());
        }
        Some(self.commit(Transaction { label, changes }, false))
    }

    /// Puts a snapshot back into the typed map without touching the kv tree.
    fn restore_snapshot(&mut self, id: u32, snapshot: &Snapshot) {
        let Some(loc) = self.location(id) else { return };
        match (snapshot, loc) {
            (Snapshot::Solid(s), Location::WorldSolid(i)) => self.map.world.solids[i] = s.clone(),
            (Snapshot::Solid(s), Location::EntitySolid { entity, solid }) => {
                self.map.entities[entity].solids[solid] = s.clone()
            }
            (Snapshot::Entity(e), Location::Entity(i)) => self.map.entities[i] = e.clone(),
            _ => {}
        }
    }

    /// Creates an axis-aligned world brush with Hammer's default texture
    /// alignment. Returns the new solid's id in `changed_ids`.
    pub fn create_block(&mut self, mins: Vec3, maxs: Vec3, material: &str) -> Option<Applied> {
        let lo = mins.min(maxs);
        let hi = mins.max(maxs);
        if (hi - lo).min_element() < 1.0 {
            return None;
        }
        let id = self.alloc_id();
        let side_ids: Vec<u32> = (0..6).map(|_| self.alloc_id()).collect();
        let solid = make_block(id, &side_ids, lo, hi, material);
        let loc = Location::WorldSolid(self.map.world.solids.len());
        self.insert_solid(loc, solid.clone());
        let tx = Transaction {
            label: "Создать браш".to_string(),
            changes: vec![Change::Insert {
                id,
                loc,
                object: Snapshot::Solid(solid),
            }],
        };
        Some(self.commit(tx, true))
    }

    /// Creates one of the block tool's primitives inside `[mins, maxs]`,
    /// extruded along `axis` (the axis the 2D view it was drawn in cannot
    /// see). Returns every new solid's id in `changed_ids`, the first one
    /// first. `None` when the box is too small or the shape degenerates.
    pub fn create_primitive(
        &mut self,
        shape: Primitive,
        mins: Vec3,
        maxs: Vec3,
        axis: usize,
        material: &str,
    ) -> Option<Applied> {
        let lo = mins.min(maxs);
        let hi = mins.max(maxs);
        if (hi - lo).min_element() < 1.0 {
            return None;
        }
        if shape == Primitive::Block {
            return self.create_block(lo, hi, material);
        }
        let mut changes = Vec::new();
        for faces in primitives::build(shape, lo, hi, axis) {
            let id = self.alloc_id();
            let sides: Vec<Side> = faces
                .iter()
                .map(|f| {
                    let sid = self.alloc_id();
                    side_from_polygon(sid, f, material)
                })
                .collect();
            let solid = Solid {
                id,
                sides,
                editor: Editor {
                    color: brush_color(id),
                    visgroup_ids: Vec::new(),
                    visgroup_shown: true,
                    visgroup_auto_shown: true,
                    group_id: None,
                    comments: None,
                    logical_pos: None,
                },
                hidden: false,
            };
            if !solid.geometry().is_valid() {
                continue;
            }
            let loc = Location::WorldSolid(self.map.world.solids.len());
            self.insert_solid(loc, solid.clone());
            changes.push(Change::Insert {
                id,
                loc,
                object: Snapshot::Solid(solid),
            });
        }
        if changes.is_empty() {
            return None;
        }
        let tx = Transaction {
            label: shape.label().to_string(),
            changes,
        };
        Some(self.commit(tx, true))
    }

    /// Hammer's "Tie to Entity": moves the selected world brushes into a
    /// brush entity. When the selection holds exactly one brush entity, the
    /// world brushes join it; otherwise a new entity of `classname` is made
    /// from every selected brush (brush entities in the selection are
    /// dissolved into it). `keyvalues` are the class defaults for a new
    /// entity. The entity's id comes first in `changed_ids`.
    pub fn tie_to_entity(
        &mut self,
        ids: &[u32],
        classname: &str,
        keyvalues: &[(String, String)],
        color: Rgb,
    ) -> Option<Applied> {
        let classname = classname.trim();
        let mut world_solids: Vec<u32> = Vec::new();
        let mut brush_entities: Vec<u32> = Vec::new();
        for &id in ids {
            match self.location(id) {
                Some(Location::WorldSolid(_)) => world_solids.push(id),
                Some(Location::Entity(i)) if self.map.entities[i].is_brush_entity() => {
                    brush_entities.push(id)
                }
                Some(Location::EntitySolid { entity, .. }) => {
                    let eid = self.map.entities[entity].id;
                    if !brush_entities.contains(&eid) {
                        brush_entities.push(eid);
                    }
                }
                _ => {}
            }
        }
        if world_solids.is_empty() && brush_entities.len() < 2 {
            return None;
        }
        let mut changes = Vec::new();
        let mut solids: Vec<Solid> = Vec::new();
        // Detach the world brushes.
        for &id in &world_solids {
            let loc = self.location(id)?;
            let (object, kv_node, kv_path) = self.remove_object(id, loc)?;
            if let Snapshot::Solid(s) = &object {
                let mut s = s.clone();
                s.hidden = false;
                solids.push(s);
            }
            changes.push(Change::Remove {
                id,
                loc,
                object,
                kv_node,
                kv_path,
            });
        }
        let joined_before = (brush_entities.len() == 1 && !world_solids.is_empty())
            .then(|| self.entity(brush_entities[0]).cloned())
            .flatten();
        let (entity_id, entity_index) = if let Some(before) = &joined_before {
            let Some(Location::Entity(i)) = self.location(before.id) else {
                return None;
            };
            (before.id, i)
        } else {
            if classname.is_empty() {
                return None;
            }
            // Dissolve the selected brush entities into the new one.
            for &eid in &brush_entities {
                let loc = self.location(eid)?;
                let (object, kv_node, kv_path) = self.remove_object(eid, loc)?;
                if let Snapshot::Entity(e) = &object {
                    solids.extend(e.solids.iter().cloned());
                }
                changes.push(Change::Remove {
                    id: eid,
                    loc,
                    object,
                    kv_node,
                    kv_path,
                });
            }
            let id = self.alloc_id();
            let mut kvs: Vec<(String, String)> = keyvalues
                .iter()
                .filter(|(k, _)| {
                    !k.eq_ignore_ascii_case("origin")
                        && !k.eq_ignore_ascii_case("id")
                        && !k.eq_ignore_ascii_case("classname")
                })
                .cloned()
                .collect();
            if let Some(centre) = solids_centre(&solids) {
                kvs.push(("origin".to_string(), format::fmt_vec3(centre)));
            }
            let entity = Entity {
                id,
                classname: classname.to_string(),
                keyvalues: kvs,
                connections: Vec::new(),
                solids: Vec::new(),
                editor: Editor {
                    color,
                    visgroup_ids: Vec::new(),
                    visgroup_shown: true,
                    visgroup_auto_shown: true,
                    group_id: None,
                    comments: None,
                    logical_pos: Some([0.0, 0.0]),
                },
                hidden: false,
            };
            let loc = Location::Entity(self.map.entities.len());
            self.insert_entity(loc, entity.clone());
            changes.push(Change::Insert {
                id,
                loc,
                object: Snapshot::Entity(entity),
            });
            (id, self.map.entities.len() - 1)
        };
        for solid in solids {
            let at = Location::EntitySolid {
                entity: entity_index,
                solid: self.map.entities[entity_index].solids.len(),
            };
            self.insert_solid(at, solid.clone());
            changes.push(Change::Insert {
                id: solid.id,
                loc: at,
                object: Snapshot::Solid(solid),
            });
        }
        if joined_before.is_some() {
            changes.push(Change::Touch { id: entity_id });
        }
        // The entity leads `changed_ids`. Moving its change first is safe:
        // the entity is inserted empty, before any brush joins it.
        let lead = changes
            .iter()
            .position(|c| c.id() == entity_id)
            .unwrap_or(0);
        let entity_change = changes.remove(lead);
        changes.insert(0, entity_change);
        let label = format!("Привязать к {}", self.map.entities[entity_index].classname);
        Some(self.commit(Transaction { label, changes }, true))
    }

    /// Hammer's "Move to World": the brushes of the selected brush entities
    /// (or the entities of selected entity brushes) become world brushes and
    /// the entities disappear. `changed_ids` lists the entities, then the brushes.
    pub fn move_to_world(&mut self, ids: &[u32]) -> Option<Applied> {
        let mut entities: Vec<u32> = Vec::new();
        for &id in ids {
            let eid = match self.location(id) {
                Some(Location::Entity(i)) if self.map.entities[i].is_brush_entity() => id,
                Some(Location::EntitySolid { entity, .. }) => self.map.entities[entity].id,
                _ => continue,
            };
            if !entities.contains(&eid) {
                entities.push(eid);
            }
        }
        if entities.is_empty() {
            return None;
        }
        let mut changes = Vec::new();
        let mut inserted = Vec::new();
        for eid in entities {
            let loc = self.location(eid)?;
            let (object, kv_node, kv_path) = self.remove_object(eid, loc)?;
            let solids = match &object {
                Snapshot::Entity(e) => e.solids.clone(),
                Snapshot::Solid(_) => Vec::new(),
            };
            changes.push(Change::Remove {
                id: eid,
                loc,
                object,
                kv_node,
                kv_path,
            });
            for mut solid in solids {
                solid.hidden = false;
                let at = Location::WorldSolid(self.map.world.solids.len());
                self.insert_solid(at, solid.clone());
                inserted.push(Change::Insert {
                    id: solid.id,
                    loc: at,
                    object: Snapshot::Solid(solid),
                });
            }
        }
        let n = inserted.len();
        // Removals stay ahead of the insertions: undoing in reverse then
        // never has a brush in the world and in the entity at once.
        changes.append(&mut inserted);
        let label = if n == 1 {
            "В мир".to_string()
        } else {
            format!("В мир: {n} брашей")
        };
        Some(self.commit(Transaction { label, changes }, true))
    }

    /// The objects as a VMF snippet: a `world` holding the brushes, then the
    /// entities. `paste_vmf` reads it back, also in another editor instance
    /// through the system clipboard. Brush entities are copied whole when
    /// all their brushes are selected, otherwise just the brushes.
    pub fn export_objects(&self, ids: &[u32]) -> String {
        let (solids, entities) = self.collect_objects(ids);
        let mut doc = kv::Document::new();
        let mut world = kv::Block::new("world");
        world.push(kv::Pair::new("id", "1"));
        world.push(kv::Pair::new("classname", "worldspawn"));
        for s in &solids {
            world.push(kvgen::solid_block(s));
        }
        doc.nodes.push(kv::Node::Block(world));
        for e in &entities {
            doc.nodes
                .push(kv::Node::Block(kvgen::entity_block(e, true)));
        }
        doc.to_string()
    }

    /// Pastes a snippet from `export_objects` (or any VMF) shifted by
    /// `delta`, with fresh ids. The new ids are in `changed_ids`.
    pub fn paste_vmf(&mut self, text: &str, delta: Vec3) -> Option<Applied> {
        let map = vmf::Map::parse(text).ok()?;
        let m = Affine3::from_translation(delta);
        self.insert_copies(map.world.solids, map.entities, &m, "Вставить", Vec::new())
    }

    /// Duplicates the objects shifted by `delta` (Hammer's Shift+drag).
    pub fn clone_objects(&mut self, ids: &[u32], delta: Vec3) -> Option<Applied> {
        let (solids, entities) = self.collect_objects(ids);
        let m = Affine3::from_translation(delta);
        self.insert_copies(solids, entities, &m, "Клонировать", Vec::new())
    }

    /// Hammer's Collapse Instance: the func_instance `id` is replaced by the
    /// contents of its VMF (`text`), placed at the instance's origin and
    /// angles. Entity names get `fixup_prefix` in front (empty for none) and
    /// `$variables` in key-values are substituted from `replacements`.
    pub fn collapse_instance(
        &mut self,
        id: u32,
        text: &str,
        fixup_prefix: &str,
        replacements: &[(String, String)],
    ) -> Option<Applied> {
        let entity = self.entity(id)?.clone();
        if !entity.classname.eq_ignore_ascii_case("func_instance") {
            return None;
        }
        let origin = entity.origin()?;
        let angles = entity.angles().unwrap_or(Vec3::ZERO);
        let m = Affine3::from_mat3_translation(angle_matrix(angles), origin);
        let mut map = vmf::Map::parse(text).ok()?;
        for e in &mut map.entities {
            for (k, v) in &mut e.keyvalues {
                for (name, value) in replacements {
                    let var = name.trim();
                    if !var.is_empty() {
                        *v = v.replace(var, value.trim());
                    }
                }
                if !fixup_prefix.is_empty()
                    && !v.trim().is_empty()
                    && ["targetname", "parentname", "target"]
                        .iter()
                        .any(|n| k.eq_ignore_ascii_case(n))
                    && !v.starts_with('!')
                    && !v.contains('*')
                {
                    *v = format!("{fixup_prefix}{v}");
                }
            }
            if !fixup_prefix.is_empty() {
                for c in &mut e.connections {
                    if !c.target.starts_with('!') && !c.target.contains('*') {
                        c.target = format!("{fixup_prefix}{}", c.target);
                    }
                }
            }
        }
        let loc = self.location(id)?;
        let (object, kv_node, kv_path) = self.remove_object(id, loc)?;
        let removal = Change::Remove {
            id,
            loc,
            object,
            kv_node,
            kv_path,
        };
        self.insert_copies(
            map.world.solids,
            map.entities,
            &m,
            "Collapse instance",
            vec![removal],
        )
    }

    fn collect_objects(&self, ids: &[u32]) -> (Vec<Solid>, Vec<Entity>) {
        let mut solids = Vec::new();
        let mut entities = Vec::new();
        let mut taken: Vec<usize> = Vec::new();
        for &id in ids {
            match self.location(id) {
                Some(Location::WorldSolid(i)) => solids.push(self.map.world.solids[i].clone()),
                Some(Location::Entity(i)) => {
                    if !taken.contains(&i) {
                        taken.push(i);
                        entities.push(self.map.entities[i].clone());
                    }
                }
                Some(Location::EntitySolid { entity, solid }) => {
                    if taken.contains(&entity) {
                        continue;
                    }
                    let e = &self.map.entities[entity];
                    if e.solids.iter().all(|s| ids.contains(&s.id)) {
                        taken.push(entity);
                        entities.push(e.clone());
                    } else {
                        solids.push(e.solids[solid].clone());
                    }
                }
                None => {}
            }
        }
        (solids, entities)
    }

    /// Inserts copies of the objects transformed by `m`; `leading` changes
    /// (removals done by the caller) go first in the transaction.
    fn insert_copies(
        &mut self,
        solids: Vec<Solid>,
        entities: Vec<Entity>,
        m: &Affine3,
        verb: &str,
        leading: Vec<Change>,
    ) -> Option<Applied> {
        if solids.is_empty() && entities.is_empty() {
            // Undo what the caller removed, so the document stays consistent.
            for c in leading.into_iter().rev() {
                if let Change::Remove {
                    loc,
                    object,
                    kv_node,
                    kv_path,
                    ..
                } = c
                {
                    self.reinsert_object(loc, object, kv_node, &kv_path);
                }
            }
            return None;
        }
        let count = solids.len() + entities.len();
        let mut changes = leading;
        for mut s in solids {
            self.prepare_copy(&mut s, m);
            let loc = Location::WorldSolid(self.map.world.solids.len());
            self.insert_solid(loc, s.clone());
            changes.push(Change::Insert {
                id: s.id,
                loc,
                object: Snapshot::Solid(s),
            });
        }
        for mut e in entities {
            e.id = self.alloc_id();
            e.hidden = false;
            self.prepare_editor(&mut e.editor);
            for s in &mut e.solids {
                self.prepare_copy(s, m);
            }
            if !m.abs_diff_eq(Affine3::IDENTITY, 1.0e-12) {
                transform::transform_entity(&mut e, m);
            }
            let loc = Location::Entity(self.map.entities.len());
            self.insert_entity(loc, e.clone());
            changes.push(Change::Insert {
                id: e.id,
                loc,
                object: Snapshot::Entity(e),
            });
        }
        let label = if verb.starts_with("Collapse") {
            verb.to_string()
        } else if count == 1 {
            format!("{verb} объект")
        } else {
            format!("{verb} объекты ({count})")
        };
        Some(self.commit(Transaction { label, changes }, true))
    }

    /// Fresh ids, no group, visible, transformed: a solid ready to be inserted as a copy.
    fn prepare_copy(&mut self, s: &mut Solid, m: &Affine3) {
        s.id = self.alloc_id();
        for side in &mut s.sides {
            side.id = self.alloc_id();
        }
        s.hidden = false;
        self.prepare_editor(&mut s.editor);
        if !m.abs_diff_eq(Affine3::IDENTITY, 1.0e-12) {
            transform::transform_solid(s, m, TextureLock::OFFSET);
        }
    }

    fn prepare_editor(&self, editor: &mut Editor) {
        editor.group_id = None;
        editor.visgroup_shown = true;
        editor.visgroup_auto_shown = true;
        // Visgroups of another map do not exist here.
        let groups = &self.map.visgroups;
        editor
            .visgroup_ids
            .retain(|id| find_visgroup(groups, *id).is_some());
    }

    /// Turns quad faces into flat displacements of the given power (2–4);
    /// faces that are not quads or already have one are skipped.
    pub fn create_displacements(&mut self, faces: &[(u32, u32)], power: u8) -> Option<Applied> {
        self.edit_sides(
            faces,
            "Создать дисплейсмент",
            |side, polygon| {
                let Some(poly) = polygon else { return false };
                if side.dispinfo.is_some() || poly.vertices.len() != 4 {
                    return false;
                }
                let normal = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);
                side.dispinfo = Some(displacement::new_dispinfo(power, &poly.vertices, normal));
                true
            },
        )
    }

    /// Hammer's "Destroy": the faces become plain brush faces again.
    pub fn remove_displacements(&mut self, faces: &[(u32, u32)]) -> Option<Applied> {
        self.edit_sides(
            faces,
            "Удалить дисплейсмент",
            |side, _| {
                if side.dispinfo.is_none() {
                    return false;
                }
                side.dispinfo = None;
                true
            },
        )
    }

    /// Hammer's Invert on the displacements of the given faces.
    pub fn invert_displacements(&mut self, faces: &[(u32, u32)]) -> Option<Applied> {
        self.edit_sides(
            faces,
            "Инвертировать дисплейсмент",
            |side, _| {
                let normal = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);
                match side.dispinfo.as_mut() {
                    Some(d) => displacement::invert(d, normal),
                    None => false,
                }
            },
        )
    }

    /// Subdivide: one power up on each displacement, keeping its shape.
    pub fn subdivide_displacements(&mut self, faces: &[(u32, u32)]) -> Option<Applied> {
        self.edit_sides(
            faces,
            "Подразделить дисплейсмент",
            |side, _| {
                let normal = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);
                match side.dispinfo.as_mut() {
                    Some(d) => displacement::subdivide(d, normal),
                    None => false,
                }
            },
        )
    }

    /// Sculpts one displacement: vertices within `radius` of `centre` move
    /// by up to `amount` along `axis`. With `merge`, the stroke joins the
    /// previous paint step on the same face as one undo entry.
    #[allow(clippy::too_many_arguments)]
    pub fn paint_displacement(
        &mut self,
        solid_id: u32,
        side_id: u32,
        centre: Vec3,
        radius: f64,
        amount: f64,
        axis: PaintAxis,
        merge: bool,
    ) -> Option<Applied> {
        let loc = self.location(solid_id)?;
        let before = self.solid(solid_id)?.clone();
        let geometry = before.geometry();
        let mut after = before.clone();
        let i = after.sides.iter().position(|s| s.id == side_id)?;
        let poly = geometry.faces.get(i).cloned().flatten()?;
        let normal = after.sides[i].plane.map(|p| p.normal).unwrap_or(Vec3::Z);
        let disp = after.sides[i].dispinfo.as_mut()?;
        if !displacement::paint(disp, &poly.vertices, normal, centre, radius, amount, axis) {
            return None;
        }
        if let Some(s) = self.solid_mut(loc) {
            *s = after.clone();
        }
        self.write_through(solid_id);
        let label = "Изменить рельеф дисплейсмента".to_string();
        // A stroke is many small paints; they share one undo step.
        if merge {
            if let Some(tx) = self.undo.last_mut() {
                if tx.label == label && tx.changes.len() == 1 {
                    if let Change::Modify {
                        id,
                        after: tx_after,
                        ..
                    } = &mut tx.changes[0]
                    {
                        if *id == solid_id {
                            *tx_after = Snapshot::Solid(after);
                            self.version += 1;
                            self.redo.clear();
                            return Some(Applied {
                                version: self.version,
                                label,
                                changed_ids: vec![solid_id],
                                structural: false,
                            });
                        }
                    }
                }
            }
        }
        Some(self.commit(
            Transaction {
                label,
                changes: vec![Change::Modify {
                    id: solid_id,
                    before: Snapshot::Solid(before),
                    after: Snapshot::Solid(after),
                }],
            },
            false,
        ))
    }

    /// Paints the WorldVertexTransition alpha of a displacement around
    /// `centre`; `merge` joins the previous alpha stroke on the same face.
    pub fn paint_alpha(
        &mut self,
        solid_id: u32,
        side_id: u32,
        centre: Vec3,
        radius: f64,
        amount: f64,
        merge: bool,
    ) -> Option<Applied> {
        let loc = self.location(solid_id)?;
        let before = self.solid(solid_id)?.clone();
        let geometry = before.geometry();
        let mut after = before.clone();
        let i = after.sides.iter().position(|s| s.id == side_id)?;
        let poly = geometry.faces.get(i).cloned().flatten()?;
        let normal = after.sides[i].plane.map(|p| p.normal).unwrap_or(Vec3::Z);
        let disp = after.sides[i].dispinfo.as_mut()?;
        if !displacement::paint_alpha(disp, &poly.vertices, normal, centre, radius, amount) {
            return None;
        }
        if let Some(s) = self.solid_mut(loc) {
            *s = after.clone();
        }
        self.write_through(solid_id);
        let label = "Изменить альфу дисплейсмента".to_string();
        if merge {
            if let Some(tx) = self.undo.last_mut() {
                if tx.label == label && tx.changes.len() == 1 {
                    if let Change::Modify {
                        id,
                        after: tx_after,
                        ..
                    } = &mut tx.changes[0]
                    {
                        if *id == solid_id {
                            *tx_after = Snapshot::Solid(after);
                            self.version += 1;
                            self.redo.clear();
                            return Some(Applied {
                                version: self.version,
                                label,
                                changed_ids: vec![solid_id],
                                structural: false,
                            });
                        }
                    }
                }
            }
        }
        Some(self.commit(
            Transaction {
                label,
                changes: vec![Change::Modify {
                    id: solid_id,
                    before: Snapshot::Solid(before),
                    after: Snapshot::Solid(after),
                }],
            },
            false,
        ))
    }

    /// The displacement's alpha per grid vertex (empty without one).
    pub fn displacement_alphas(&self, solid_id: u32, side_id: u32) -> Vec<f64> {
        let Some(solid) = self.solid(solid_id) else {
            return Vec::new();
        };
        solid
            .sides
            .iter()
            .find(|s| s.id == side_id)
            .and_then(|s| s.dispinfo.as_ref())
            .map(|d| {
                let n = d.verts_per_edge();
                if d.alphas.len() == n && d.alphas.iter().all(|r| r.len() == n) {
                    d.alphas.iter().flatten().copied().collect()
                } else {
                    vec![0.0; n * n]
                }
            })
            .unwrap_or_default()
    }

    /// Hammer's Sew over the displacement faces of the given brushes: shared
    /// edges are made to coincide. `None` when fewer than two displacement
    /// faces are involved or no edge is shared.
    pub fn sew_displacements(&mut self, ids: &[u32]) -> Option<Applied> {
        // Every displacement face of the selection: (side index, outline, normal).
        let mut work: Vec<SewWork> = Vec::new();
        for &id in ids {
            let Some(loc) = self.location(id) else {
                continue;
            };
            let Some(solid) = self.solid(id).cloned() else {
                continue;
            };
            let g = solid.geometry();
            let faces: Vec<(usize, Vec<Vec3>, Vec3)> = solid
                .sides
                .iter()
                .enumerate()
                .filter(|(_, s)| s.dispinfo.is_some())
                .filter_map(|(i, s)| {
                    let poly = g.faces.get(i).cloned().flatten()?;
                    if poly.vertices.len() != 4 {
                        return None;
                    }
                    Some((
                        i,
                        poly.vertices,
                        s.plane.map(|p| p.normal).unwrap_or(Vec3::Z),
                    ))
                })
                .collect();
            if !faces.is_empty() {
                work.push((id, loc, solid, faces));
            }
        }
        let total: usize = work.iter().map(|w| w.3.len()).sum();
        if total < 2 {
            return None;
        }
        let mut after: Vec<Solid> = work.iter().map(|w| w.2.clone()).collect();
        let sewn = {
            let mut faces: Vec<displacement::SewFace<'_>> = Vec::new();
            for (w, solid) in work.iter().zip(after.iter_mut()) {
                // Split the sides so several of one solid can be borrowed at once.
                let mut sides: Vec<Option<&mut Side>> = solid.sides.iter_mut().map(Some).collect();
                for (i, quad, normal) in &w.3 {
                    if let Some(side) = sides[*i].take() {
                        if let Some(disp) = side.dispinfo.as_mut() {
                            faces.push(displacement::SewFace {
                                disp,
                                quad: quad.clone(),
                                normal: *normal,
                            });
                        }
                    }
                }
            }
            displacement::sew(&mut faces)
        };
        if sewn == 0 {
            return None;
        }
        let mut changes = Vec::new();
        for ((id, loc, before, _), after) in work.into_iter().zip(after) {
            if after == before {
                continue;
            }
            if let Some(s) = self.solid_mut(loc) {
                *s = after.clone();
            }
            self.write_through(id);
            changes.push(Change::Modify {
                id,
                before: Snapshot::Solid(before),
                after: Snapshot::Solid(after),
            });
        }
        if changes.is_empty() {
            return None;
        }
        Some(self.commit(
            Transaction {
                label: format!("Сшить дисплейсменты (рёбер: {sewn})"),
                changes,
            },
            false,
        ))
    }

    /// The landscape brush over every displacement in reach of `centre`:
    /// each displacement face with a grid vertex within `radius` is sculpted
    /// (see `displacement::sculpt`), then the touched faces are sewn so the
    /// seams between them stay closed. One dab is one transaction; `merge`
    /// joins it to the previous dab of the same stroke.
    pub fn sculpt_displacements(
        &mut self,
        centre: Vec3,
        radius: f64,
        amount: f64,
        mode: Sculpt,
        merge: bool,
    ) -> Option<Applied> {
        // Candidates: every solid with a displacement face whose flat grid comes within reach.
        let mut work: Vec<SewWork> = Vec::new();
        let mut ids: Vec<u32> = self
            .locations
            .iter()
            .filter(|(_, l)| !matches!(l, Location::Entity(_)))
            .map(|(id, _)| *id)
            .collect();
        ids.sort_unstable();
        for id in ids {
            let Some(solid) = self.solid(id) else {
                continue;
            };
            if solid.sides.iter().all(|s| s.dispinfo.is_none()) {
                continue;
            }
            let solid = solid.clone();
            let loc = self.location(id)?;
            let g = solid.geometry();
            let mut faces: Vec<(usize, Vec<Vec3>, Vec3)> = Vec::new();
            for (i, side) in solid.sides.iter().enumerate() {
                let Some(disp) = side.dispinfo.as_ref() else {
                    continue;
                };
                let Some(poly) = g.faces.get(i).cloned().flatten() else {
                    continue;
                };
                if poly.vertices.len() != 4 {
                    continue;
                }
                let normal = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);
                let flat = vmf::DispInfo {
                    distances: Vec::new(),
                    offsets: Vec::new(),
                    elevation: 0.0,
                    ..disp.clone()
                };
                let c = centre - normal * (centre - poly.vertices[0]).dot(normal);
                let near = displacement::grid_positions(&flat, &poly.vertices, normal)
                    .iter()
                    .any(|p| p.distance(c) <= radius);
                if near {
                    faces.push((i, poly.vertices, normal));
                }
            }
            if !faces.is_empty() {
                work.push((id, loc, solid, faces));
            }
        }
        if work.is_empty() {
            return None;
        }
        let mut after: Vec<Solid> = work.iter().map(|w| w.2.clone()).collect();
        let mut touched = false;
        for (w, solid) in work.iter().zip(after.iter_mut()) {
            for (i, quad, normal) in &w.3 {
                if let Some(disp) = solid.sides[*i].dispinfo.as_mut() {
                    touched |=
                        displacement::sculpt(disp, quad, *normal, centre, radius, amount, mode);
                }
            }
        }
        if !touched {
            return None;
        }
        // Seams: the touched faces are sewn among themselves.
        {
            let mut faces: Vec<displacement::SewFace<'_>> = Vec::new();
            for (w, solid) in work.iter().zip(after.iter_mut()) {
                let mut sides: Vec<Option<&mut Side>> = solid.sides.iter_mut().map(Some).collect();
                for (i, quad, normal) in &w.3 {
                    if let Some(side) = sides[*i].take() {
                        if let Some(disp) = side.dispinfo.as_mut() {
                            faces.push(displacement::SewFace {
                                disp,
                                quad: quad.clone(),
                                normal: *normal,
                            });
                        }
                    }
                }
            }
            if faces.len() >= 2 {
                displacement::sew(&mut faces);
            }
        }
        let label = "Изменить рельеф ландшафта".to_string();
        let mut fresh: Vec<(u32, Location, Solid, Solid)> = Vec::new();
        for ((id, loc, before, _), after) in work.into_iter().zip(after) {
            if after == before {
                continue;
            }
            if let Some(s) = self.solid_mut(loc) {
                *s = after.clone();
            }
            self.write_through(id);
            fresh.push((id, loc, before, after));
        }
        if fresh.is_empty() {
            return None;
        }
        if merge {
            if let Some(tx) = self.undo.last_mut() {
                if tx.label == label {
                    for (id, _, before, after) in fresh.iter() {
                        let found = tx.changes.iter_mut().find_map(|c| match c {
                            Change::Modify {
                                id: cid,
                                after: tx_after,
                                ..
                            } if cid == id => Some(tx_after),
                            _ => None,
                        });
                        match found {
                            Some(slot) => *slot = Snapshot::Solid(after.clone()),
                            None => tx.changes.push(Change::Modify {
                                id: *id,
                                before: Snapshot::Solid(before.clone()),
                                after: Snapshot::Solid(after.clone()),
                            }),
                        }
                    }
                    self.version += 1;
                    self.redo.clear();
                    return Some(Applied {
                        version: self.version,
                        label,
                        changed_ids: fresh.iter().map(|f| f.0).collect(),
                        structural: false,
                    });
                }
            }
        }
        let changes = fresh
            .into_iter()
            .map(|(id, _, before, after)| Change::Modify {
                id,
                before: Snapshot::Solid(before),
                after: Snapshot::Solid(after),
            })
            .collect();
        Some(self.commit(Transaction { label, changes }, false))
    }

    /// The landscape wizard: a grid of `cells` flat floor blocks, each
    /// `size.z` thick, with a displacement of `power` on top, laid out from
    /// `origin` (the lowest corner) over `size.x` by `size.y`. The blocks
    /// share edges exactly, so their displacements start sewn.
    pub fn create_landscape(
        &mut self,
        origin: Vec3,
        size: Vec3,
        cells: (u32, u32),
        power: u8,
        material: &str,
    ) -> Option<Applied> {
        let (nx, ny) = (cells.0.clamp(1, 64), cells.1.clamp(1, 64));
        if size.x < nx as f64 || size.y < ny as f64 || size.z < 1.0 {
            return None;
        }
        let cw = size.x / nx as f64;
        let cl = size.y / ny as f64;
        let mut changes = Vec::new();
        let mut ids = Vec::new();
        for iy in 0..ny {
            for ix in 0..nx {
                let lo = Vec3::new(
                    origin.x + cw * ix as f64,
                    origin.y + cl * iy as f64,
                    origin.z - size.z,
                );
                let hi = Vec3::new(lo.x + cw, lo.y + cl, origin.z);
                let id = self.alloc_id();
                let side_ids: Vec<u32> = (0..6).map(|_| self.alloc_id()).collect();
                let mut solid = make_block(id, &side_ids, lo, hi, material);
                let g = solid.geometry();
                for (i, side) in solid.sides.iter_mut().enumerate() {
                    let Some(plane) = side.plane else { continue };
                    if plane.normal.z < 0.99 {
                        continue;
                    }
                    if let Some(poly) = g.faces.get(i).cloned().flatten() {
                        if poly.vertices.len() == 4 {
                            side.dispinfo = Some(displacement::new_dispinfo(
                                power,
                                &poly.vertices,
                                plane.normal,
                            ));
                        }
                    }
                }
                let loc = Location::WorldSolid(self.map.world.solids.len());
                self.insert_solid(loc, solid.clone());
                ids.push(id);
                changes.push(Change::Insert {
                    id,
                    loc,
                    object: Snapshot::Solid(solid),
                });
            }
        }
        Some(self.commit(
            Transaction {
                label: format!("Создать ландшафт {nx}×{ny}"),
                changes,
            },
            true,
        ))
    }

    /// The displacement grid of a face in world space (empty without one).
    pub fn displacement_grid(&self, solid_id: u32, side_id: u32) -> Vec<Vec3> {
        let Some(solid) = self.solid(solid_id) else {
            return Vec::new();
        };
        let Some(i) = solid.sides.iter().position(|s| s.id == side_id) else {
            return Vec::new();
        };
        let side = &solid.sides[i];
        let (Some(disp), Some(poly)) = (
            &side.dispinfo,
            solid.geometry().faces.get(i).cloned().flatten(),
        ) else {
            return Vec::new();
        };
        if poly.vertices.len() != 4 {
            return Vec::new();
        }
        let normal = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);
        displacement::grid_positions(disp, &poly.vertices, normal)
    }

    /// Applies `edit` to the named sides of each solid; a Modify per solid
    /// whose sides changed. `edit` gets the face outline and returns whether
    /// it changed the side.
    fn edit_sides(
        &mut self,
        faces: &[(u32, u32)],
        label: &str,
        mut edit: impl FnMut(&mut Side, Option<&geometry::Polygon>) -> bool,
    ) -> Option<Applied> {
        let mut by_solid: Vec<(u32, Vec<u32>)> = Vec::new();
        for &(solid, side) in faces {
            match by_solid.iter_mut().find(|(s, _)| *s == solid) {
                Some((_, v)) => v.push(side),
                None => by_solid.push((solid, vec![side])),
            }
        }
        let mut changes = Vec::new();
        for (solid_id, side_ids) in by_solid {
            let Some(loc) = self.location(solid_id) else {
                continue;
            };
            let Some(solid) = self.solid(solid_id).cloned() else {
                continue;
            };
            let mut after = solid.clone();
            let geometry = after.geometry();
            let mut touched = false;
            for (i, side) in after.sides.iter_mut().enumerate() {
                if !side_ids.contains(&side.id) {
                    continue;
                }
                let polygon = geometry.faces.get(i).cloned().flatten();
                touched |= edit(side, polygon.as_ref());
            }
            if !touched || after == solid {
                continue;
            }
            if let Some(s) = self.solid_mut(loc) {
                *s = after.clone();
            }
            self.write_through(solid_id);
            changes.push(Change::Modify {
                id: solid_id,
                before: Snapshot::Solid(solid),
                after: Snapshot::Solid(after),
            });
        }
        if changes.is_empty() {
            return None;
        }
        Some(self.commit(
            Transaction {
                label: label.to_string(),
                changes,
            },
            false,
        ))
    }

    /// Texture properties of one face, for the face-edit sheet.
    pub fn face_info(&self, solid_id: u32, side_id: u32) -> Option<FaceInfo> {
        let solid = self.solid(solid_id)?;
        let side = solid.sides.iter().find(|s| s.id == side_id)?;
        Some(FaceInfo {
            material: side.material.clone(),
            uaxis: side.uaxis,
            vaxis: side.vaxis,
            rotation: side.rotation,
            lightmap_scale: side.lightmap_scale,
            smoothing_groups: side.smoothing_groups,
            normal: side.plane.map(|p| p.normal).unwrap_or(Vec3::Z),
            disp_power: side.dispinfo.as_ref().map(|d| d.power as u32).unwrap_or(0),
        })
    }

    /// Edits texture placement of faces (`(solid id, side id)` pairs) the way
    /// Hammer's face-edit sheet does. Only the fields set in `edit` change.
    pub fn edit_faces(&mut self, faces: &[(u32, u32)], edit: &FaceEdit) -> Option<Applied> {
        let mut by_solid: Vec<(u32, Vec<u32>)> = Vec::new();
        for &(solid, side) in faces {
            match by_solid.iter_mut().find(|(s, _)| *s == solid) {
                Some((_, v)) => v.push(side),
                None => by_solid.push((solid, vec![side])),
            }
        }
        // Treat as one: every face is justified against the joint outline.
        let joint = if edit.treat_as_one && edit.justify.is_some() {
            let mut all = Vec::new();
            for (solid_id, side_ids) in &by_solid {
                let Some(solid) = self.solid(*solid_id) else {
                    continue;
                };
                let geometry = solid.geometry();
                for (i, side) in solid.sides.iter().enumerate() {
                    if side_ids.contains(&side.id) {
                        if let Some(Some(p)) = geometry.faces.get(i) {
                            all.extend_from_slice(&p.vertices);
                        }
                    }
                }
            }
            (!all.is_empty()).then(|| geometry::Polygon::new(all))
        } else {
            None
        };
        let mut changes = Vec::new();
        for (solid_id, side_ids) in by_solid {
            let Some(loc) = self.location(solid_id) else {
                continue;
            };
            let Some(solid) = self.solid(solid_id).cloned() else {
                continue;
            };
            let mut after = solid.clone();
            let geometry = after.geometry();
            for (i, side) in after.sides.iter_mut().enumerate() {
                if !side_ids.contains(&side.id) {
                    continue;
                }
                let polygon = match &joint {
                    Some(j) => Some(j.clone()),
                    None => geometry.faces.get(i).cloned().flatten(),
                };
                apply_face_edit(side, edit, polygon.as_ref());
            }
            if after == solid {
                continue;
            }
            if let Some(s) = self.solid_mut(loc) {
                *s = after.clone();
            }
            self.write_through(solid_id);
            changes.push(Change::Modify {
                id: solid_id,
                before: Snapshot::Solid(solid),
                after: Snapshot::Solid(after),
            });
        }
        if changes.is_empty() {
            return None;
        }
        Some(self.commit(
            Transaction {
                label: "Изменить текстуру грани".to_string(),
                changes,
            },
            false,
        ))
    }

    /// Hammer's "Check for Problems": what the compiler or the game would
    /// trip over. Class-level checks (unknown classes, point classes with
    /// brushes) need the FGD and live in the frontend.
    pub fn problems(&self) -> Vec<Problem> {
        let mut out = Vec::new();
        let mut seen_ids: HashMap<u32, usize> = HashMap::new();
        let check_solid =
            |solid: &Solid, out: &mut Vec<Problem>, seen_ids: &mut HashMap<u32, usize>| {
                let g = solid.geometry();
                if !g.is_valid() {
                    out.push(Problem {
                        kind: ProblemKind::InvalidSolid,
                        object: solid.id,
                        message: format!(
                            "Браш {}: некорректная геометрия ({})",
                            solid.id,
                            describe_problems(&g.problems)
                        ),
                    });
                } else if let Some((lo, hi)) = g.bounds() {
                    let e = MAP_EXTENT;
                    if lo.min_element() < -e || hi.max_element() > e {
                        out.push(Problem {
                            kind: ProblemKind::OutsideWorld,
                            object: solid.id,
                            message: format!("Браш {} выходит за границы мира (±{e})", solid.id),
                        });
                    }
                }
                if solid.sides.len() > 128 {
                    out.push(Problem {
                        kind: ProblemKind::TooManySides,
                        object: solid.id,
                        message: format!(
                            "Браш {}: граней - {}, предел VBSP - 128",
                            solid.id,
                            solid.sides.len()
                        ),
                    });
                }
                for side in &solid.sides {
                    if side.material.trim().is_empty() {
                        out.push(Problem {
                            kind: ProblemKind::EmptyMaterial,
                            object: solid.id,
                            message: format!("Браш {}: грань {} без материала", solid.id, side.id),
                        });
                    }
                    if side.uaxis.scale.abs() < 1.0e-9 || side.vaxis.scale.abs() < 1.0e-9 {
                        out.push(Problem {
                            kind: ProblemKind::ZeroTextureScale,
                            object: solid.id,
                            message: format!(
                                "Браш {}: грань {} с нулевым масштабом текстуры",
                                solid.id, side.id
                            ),
                        });
                    }
                }
                // Hammer shares one id counter between everything, but only
                // solids and entities are looked up by id, so sides are not counted.
                *seen_ids.entry(solid.id).or_insert(0) += 1;
            };
        for solid in &self.map.world.solids {
            check_solid(solid, &mut out, &mut seen_ids);
        }
        let names: std::collections::HashSet<&str> = self
            .map
            .entities
            .iter()
            .filter_map(|e| e.targetname())
            .collect();
        for e in &self.map.entities {
            *seen_ids.entry(e.id).or_insert(0) += 1;
            for solid in &e.solids {
                check_solid(solid, &mut out, &mut seen_ids);
            }
            if e.classname.trim().is_empty() {
                out.push(Problem {
                    kind: ProblemKind::EmptyClass,
                    object: e.id,
                    message: format!("Энтити {}: не задан classname", e.id),
                });
            }
            if !e.is_brush_entity() && e.origin().is_none() {
                out.push(Problem {
                    kind: ProblemKind::NoOrigin,
                    object: e.id,
                    message: format!("{} {}: не задан origin", e.classname, e.id),
                });
            }
            for c in &e.connections {
                let t = c.target.trim();
                let special = t.starts_with('!') || t.contains('*') || t.is_empty();
                if !special && !names.contains(t) {
                    out.push(Problem {
                        kind: ProblemKind::BadTarget,
                        object: e.id,
                        message: format!(
                            "{} {}: цель выхода {} «{}» не найдена",
                            e.classname, e.id, c.output, c.target
                        ),
                    });
                }
            }
        }
        let mut dups: Vec<u32> = seen_ids
            .iter()
            .filter(|(_, &n)| n > 1)
            .map(|(&id, _)| id)
            .collect();
        dups.sort_unstable();
        for id in dups {
            out.push(Problem {
                kind: ProblemKind::DuplicateId,
                object: id,
                message: format!("ID {id} используется несколькими объектами"),
            });
        }
        out
    }

    /// Moves each object by its own delta in one transaction (Align Objects,
    /// snap to grid): `moves` pairs an id with the translation it gets.
    pub fn translate_each(&mut self, moves: &[(u32, Vec3)], texture_lock: bool) -> Option<Applied> {
        let by_id: HashMap<u32, Vec3> = moves
            .iter()
            .filter(|(_, d)| *d != Vec3::ZERO)
            .map(|(id, d)| (*id, *d))
            .collect();
        if by_id.is_empty() {
            return None;
        }
        let ids: Vec<u32> = by_id.keys().copied().collect();
        self.modify_objects(
            &ids,
            ("Выровнять объект", "Выровнять объекты ({})"),
            |solid| {
                if let Some(d) = by_id.get(&solid.id) {
                    translate_solid(solid, *d, texture_lock);
                }
            },
            |entity| {
                // A brush entity whose brushes all moved by the same delta carries its origin along.
                let own = by_id.get(&entity.id).copied().or_else(|| {
                    let first = by_id.get(&entity.solids.first()?.id)?;
                    entity
                        .solids
                        .iter()
                        .all(|s| by_id.get(&s.id) == Some(first))
                        .then_some(*first)
                });
                match (entity.origin(), own) {
                    (Some(origin), Some(d)) => {
                        set_keyvalue(entity, "origin", &format::fmt_vec3(origin + d));
                        transform::transform_overlay_basis(
                            entity,
                            &glam::DAffine3::from_translation(d),
                        );
                        true
                    }
                    _ => false,
                }
            },
            true,
        )
    }

    /// Fixes one finding of [`Document::problems`] the way Hammer's
    /// "Fix" does: invalid, out-of-world brushes and class-less entities are
    /// deleted, faces without a material get `material`, zero texture scales
    /// become 0.25, a missing origin becomes `0 0 0`, connections to unknown
    /// targets are dropped, and objects sharing an id are renumbered.
    /// `None` when the kind has no automatic fix or nothing changed.
    pub fn fix_problem(
        &mut self,
        kind: ProblemKind,
        object: u32,
        material: &str,
    ) -> Option<Applied> {
        match kind {
            ProblemKind::InvalidSolid | ProblemKind::OutsideWorld | ProblemKind::EmptyClass => {
                self.delete(&[object])
            }
            ProblemKind::TooManySides => None,
            ProblemKind::EmptyMaterial => {
                let faces: Vec<(u32, u32)> = self
                    .solid(object)?
                    .sides
                    .iter()
                    .filter(|side| side.material.trim().is_empty())
                    .map(|side| (object, side.id))
                    .collect();
                let material = if material.trim().is_empty() {
                    "TOOLS/TOOLSNODRAW"
                } else {
                    material
                };
                self.set_material(&faces, material)
            }
            ProblemKind::ZeroTextureScale => {
                let faces: Vec<(u32, u32)> = self
                    .solid(object)?
                    .sides
                    .iter()
                    .filter(|side| {
                        side.uaxis.scale.abs() < 1.0e-9 || side.vaxis.scale.abs() < 1.0e-9
                    })
                    .map(|side| (object, side.id))
                    .collect();
                let edit = FaceEdit {
                    scale: [Some(0.25), Some(0.25)],
                    ..FaceEdit::default()
                };
                self.edit_faces(&faces, &edit)
            }
            ProblemKind::NoOrigin => self
                .set_entity_keyvalues(object, &[("origin".to_string(), Some("0 0 0".to_string()))]),
            ProblemKind::BadTarget => {
                let names: std::collections::HashSet<String> = self
                    .map
                    .entities
                    .iter()
                    .filter_map(|e| e.targetname().map(str::to_string))
                    .collect();
                let kept: Vec<vmf::Connection> = self
                    .entity(object)?
                    .connections
                    .iter()
                    .filter(|c| {
                        let t = c.target.trim();
                        t.starts_with('!') || t.contains('*') || t.is_empty() || names.contains(t)
                    })
                    .cloned()
                    .collect();
                self.set_entity_connections(object, kept)
            }
            ProblemKind::DuplicateId => {
                // Every object after the first with this id is re-created
                // with fresh ids; the index always points at one of them.
                let mut solids = Vec::new();
                let mut entities = Vec::new();
                let mut leading = Vec::new();
                while self.count_id(object) > 1 {
                    let loc = self.location(object)?;
                    let (snapshot, kv_node, kv_path) = self.remove_object(object, loc)?;
                    match &snapshot {
                        Snapshot::Solid(s) => solids.push(s.clone()),
                        Snapshot::Entity(e) => entities.push(e.clone()),
                    }
                    leading.push(Change::Remove {
                        id: object,
                        loc,
                        object: snapshot,
                        kv_node,
                        kv_path,
                    });
                }
                if leading.is_empty() {
                    return None;
                }
                self.insert_copies(
                    solids,
                    entities,
                    &Affine3::IDENTITY,
                    "Перенумеровать",
                    leading,
                )
            }
        }
    }

    /// How many solids and entities carry `id`.
    fn count_id(&self, id: u32) -> usize {
        let world = self.map.world.solids.iter().filter(|s| s.id == id).count();
        let ents = self
            .map
            .entities
            .iter()
            .map(|e| usize::from(e.id == id) + e.solids.iter().filter(|s| s.id == id).count())
            .sum::<usize>();
        world + ents
    }

    /// Creates a point entity. `keyvalues` are written in order (class
    /// defaults from the FGD); `origin` is appended last as Hammer does.
    /// Returns the new entity's id in `changed_ids`.
    pub fn create_entity(
        &mut self,
        classname: &str,
        origin: Vec3,
        keyvalues: &[(String, String)],
        color: Rgb,
    ) -> Option<Applied> {
        let classname = classname.trim();
        if classname.is_empty() {
            return None;
        }
        let id = self.alloc_id();
        let mut kvs: Vec<(String, String)> = keyvalues
            .iter()
            .filter(|(k, _)| {
                !k.eq_ignore_ascii_case("origin")
                    && !k.eq_ignore_ascii_case("id")
                    && !k.eq_ignore_ascii_case("classname")
            })
            .cloned()
            .collect();
        kvs.push(("origin".to_string(), format::fmt_vec3(origin)));
        let entity = Entity {
            id,
            classname: classname.to_string(),
            keyvalues: kvs,
            connections: Vec::new(),
            solids: Vec::new(),
            editor: Editor {
                color,
                visgroup_ids: Vec::new(),
                visgroup_shown: true,
                visgroup_auto_shown: true,
                group_id: None,
                comments: None,
                logical_pos: Some([0.0, 0.0]),
            },
            hidden: false,
        };
        let loc = Location::Entity(self.map.entities.len());
        self.insert_entity(loc, entity.clone());
        let tx = Transaction {
            label: format!("Создать {classname}"),
            changes: vec![Change::Insert {
                id,
                loc,
                object: Snapshot::Entity(entity),
            }],
        };
        Some(self.commit(tx, true))
    }

    /// Changes an entity's plain keys: `Some(value)` sets or adds a key,
    /// `None` removes it; the key `classname` renames the class. Keys keep
    /// their order, new ones go before `origin`.
    pub fn set_entity_keyvalues(
        &mut self,
        id: u32,
        changes: &[(String, Option<String>)],
    ) -> Option<Applied> {
        let Some(Location::Entity(i)) = self.location(id) else {
            return None;
        };
        let entity = self.map.entities.get_mut(i)?;
        let before = entity.clone();
        for (key, value) in changes {
            let key = key.trim();
            if key.is_empty() || key.eq_ignore_ascii_case("id") {
                continue;
            }
            if key.eq_ignore_ascii_case("classname") {
                if let Some(v) = value {
                    let v = v.trim();
                    if !v.is_empty() {
                        entity.classname = v.to_string();
                    }
                }
                continue;
            }
            match value {
                Some(v) => match entity
                    .keyvalues
                    .iter_mut()
                    .find(|(k, _)| k.eq_ignore_ascii_case(key))
                {
                    Some(kv) => kv.1 = v.clone(),
                    None => {
                        let at = entity
                            .keyvalues
                            .iter()
                            .position(|(k, _)| k.eq_ignore_ascii_case("origin"))
                            .unwrap_or(entity.keyvalues.len());
                        entity.keyvalues.insert(at, (key.to_string(), v.clone()));
                    }
                },
                None => entity
                    .keyvalues
                    .retain(|(k, _)| !k.eq_ignore_ascii_case(key)),
            }
        }
        if *entity == before {
            return None;
        }
        let after = entity.clone();
        let label = if changes.len() == 1 {
            format!("Изменить {}", changes[0].0)
        } else {
            format!("Изменить ключи ({})", changes.len())
        };
        self.write_through(id);
        Some(self.commit(
            Transaction {
                label,
                changes: vec![Change::Modify {
                    id,
                    before: Snapshot::Entity(before),
                    after: Snapshot::Entity(after),
                }],
            },
            false,
        ))
    }

    /// Replaces an entity's output connections.
    pub fn set_entity_connections(
        &mut self,
        id: u32,
        connections: Vec<vmf::Connection>,
    ) -> Option<Applied> {
        let Some(Location::Entity(i)) = self.location(id) else {
            return None;
        };
        let entity = self.map.entities.get_mut(i)?;
        if entity.connections == connections {
            return None;
        }
        let before = entity.clone();
        entity.connections = connections;
        let after = entity.clone();
        self.write_through(id);
        Some(self.commit(
            Transaction {
                label: "Изменить выходы".to_string(),
                changes: vec![Change::Modify {
                    id,
                    before: Snapshot::Entity(before),
                    after: Snapshot::Entity(after),
                }],
            },
            false,
        ))
    }

    /// Sets the material of the given `(solid id, side id)` faces.
    pub fn set_material(&mut self, faces: &[(u32, u32)], material: &str) -> Option<Applied> {
        let material = material.trim();
        if material.is_empty() {
            return None;
        }
        // Group by solid so each solid yields one change.
        let mut by_solid: Vec<(u32, Vec<u32>)> = Vec::new();
        for &(solid, side) in faces {
            match by_solid.iter_mut().find(|(s, _)| *s == solid) {
                Some((_, sides)) => sides.push(side),
                None => by_solid.push((solid, vec![side])),
            }
        }
        let mut changes = Vec::new();
        let mut count = 0usize;
        for (solid_id, sides) in by_solid {
            let Some(loc) = self.location(solid_id) else {
                continue;
            };
            let Some(solid) = self.solid_mut(loc) else {
                continue;
            };
            let before = solid.clone();
            let mut touched = 0;
            for side in solid.sides.iter_mut() {
                if sides.contains(&side.id) && side.material != material {
                    side.material = material.to_string();
                    touched += 1;
                }
            }
            if touched == 0 {
                continue;
            }
            count += touched;
            let after = solid.clone();
            changes.push(Change::Modify {
                id: solid_id,
                before: Snapshot::Solid(before),
                after: Snapshot::Solid(after),
            });
        }
        if changes.is_empty() {
            return None;
        }
        let label = if count == 1 {
            "Применить текстуру".to_string()
        } else {
            format!("Применить текстуру к граням ({count})")
        };
        for c in &changes {
            self.write_through(c.id());
        }
        Some(self.commit(Transaction { label, changes }, false))
    }

    /// Removes solids and point entities.
    pub fn delete(&mut self, ids: &[u32]) -> Option<Applied> {
        let mut changes = Vec::new();
        for &id in ids {
            let Some(loc) = self.location(id) else {
                continue;
            };
            let Some((object, kv_node, kv_path)) = self.remove_object(id, loc) else {
                continue;
            };
            changes.push(Change::Remove {
                id,
                loc,
                object,
                kv_node,
                kv_path,
            });
        }
        if changes.is_empty() {
            return None;
        }
        let label = if changes.len() == 1 {
            "Удалить объект".to_string()
        } else {
            format!("Удалить объекты ({})", changes.len())
        };
        Some(self.commit(Transaction { label, changes }, true))
    }

    pub fn undo(&mut self) -> Option<Applied> {
        let tx = self.undo.pop()?;
        let mut structural = false;
        for c in tx.changes.iter().rev() {
            match c {
                Change::Modify { id, before, .. } => self.restore(*id, before),
                Change::Insert { id, loc, .. } => {
                    self.remove_object(*id, *loc);
                    structural = true;
                }
                Change::Remove {
                    loc,
                    object,
                    kv_node,
                    kv_path,
                    ..
                } => {
                    self.reinsert_object(*loc, object.clone(), kv_node.clone(), kv_path);
                    structural = true;
                }
                Change::VisGroups { before, .. } => self.apply_visgroups(before.clone()),
                Change::Groups { before, .. } => self.apply_groups(before.clone()),
                Change::Cordons { before, .. } => self.apply_cordons(before.0.clone(), before.1),
                Change::World {
                    before,
                    before_pairs,
                    ..
                } => {
                    self.map.world.keyvalues = before.clone();
                    sync::set_world_pairs(self.map.document_mut(), before_pairs.clone());
                    self.reindex();
                }
                Change::Touch { .. } => {}
            }
        }
        self.version += 1;
        let applied = Applied {
            version: self.version,
            label: tx.label.clone(),
            changed_ids: tx.changed_ids(),
            structural,
        };
        self.redo.push(tx);
        Some(applied)
    }

    /// Folds the last `count` undo steps into one step with `label`: a brush
    /// stroke or a row of props comes back with one Ctrl+Z. Nothing changes in
    /// the map. Returns false when there are fewer steps than asked.
    pub fn merge_undo(&mut self, count: usize, label: &str) -> bool {
        if count < 2 || self.undo.len() < count {
            return false;
        }
        let start = self.undo.len() - count;
        if self.saved_depth > start && self.saved_depth != usize::MAX {
            // The saved state sat inside the merged span: it can no longer be reached by undo alone.
            self.saved_depth = usize::MAX;
        }
        let mut changes = Vec::new();
        for tx in self.undo.drain(start..) {
            changes.extend(tx.changes);
        }
        self.undo.push(Transaction {
            label: label.to_string(),
            changes,
        });
        true
    }

    pub fn redo(&mut self) -> Option<Applied> {
        let tx = self.redo.pop()?;
        let mut structural = false;
        for c in &tx.changes {
            match c {
                Change::Modify { id, after, .. } => self.restore(*id, after),
                Change::Insert { loc, object, .. } => {
                    match object {
                        Snapshot::Solid(s) => self.insert_solid(*loc, s.clone()),
                        Snapshot::Entity(e) => self.insert_entity(*loc, e.clone()),
                    }
                    structural = true;
                }
                Change::Remove { id, loc, .. } => {
                    self.remove_object(*id, *loc);
                    structural = true;
                }
                Change::VisGroups { after, .. } => self.apply_visgroups(after.clone()),
                Change::Groups { after, .. } => self.apply_groups(after.clone()),
                Change::Cordons { after, .. } => self.apply_cordons(after.0.clone(), after.1),
                Change::World { after, .. } => self.apply_world_keyvalues(after.clone()),
                Change::Touch { .. } => {}
            }
        }
        self.version += 1;
        let applied = Applied {
            version: self.version,
            label: tx.label.clone(),
            changed_ids: tx.changed_ids(),
            structural,
        };
        self.undo.push(tx);
        Some(applied)
    }

    fn apply_world_keyvalues(&mut self, keyvalues: Vec<(String, String)>) {
        self.map.world.keyvalues = keyvalues.clone();
        sync::write_world_keyvalues(self.map.document_mut(), &keyvalues);
        // Added or removed pairs shift every child index of the world block.
        self.reindex();
    }

    /// The worldspawn's plain keys (`skyname`, `detailmaterial`, …), in file order.
    pub fn world_keyvalues(&self) -> &[(String, String)] {
        &self.map.world.keyvalues
    }

    /// Hammer's Map Properties: `Some(value)` sets or adds a world key,
    /// `None` removes it. `id` and `classname` cannot change.
    pub fn set_world_keyvalues(&mut self, changes: &[(String, Option<String>)]) -> Option<Applied> {
        let before = self.map.world.keyvalues.clone();
        let before_pairs = sync::world_pairs(self.map.document());
        let mut after = before.clone();
        for (key, value) in changes {
            let key = key.trim();
            if key.is_empty()
                || key.eq_ignore_ascii_case("id")
                || key.eq_ignore_ascii_case("classname")
            {
                continue;
            }
            match value {
                Some(v) => match after.iter_mut().find(|(k, _)| k.eq_ignore_ascii_case(key)) {
                    Some(kv) => kv.1 = v.clone(),
                    None => after.push((key.to_string(), v.clone())),
                },
                None => after.retain(|(k, _)| !k.eq_ignore_ascii_case(key)),
            }
        }
        if after == before {
            return None;
        }
        self.apply_world_keyvalues(after.clone());
        let label = if changes.len() == 1 {
            format!("Изменить свойство карты: {}", changes[0].0)
        } else {
            "Изменить свойства карты".to_string()
        };
        Some(self.commit(
            Transaction {
                label,
                changes: vec![Change::World {
                    before,
                    before_pairs,
                    after,
                }],
            },
            false,
        ))
    }

    /// Hammer's Replace Textures: every face whose material equals `find`
    /// (case-insensitive; with `substring`, contains it) gets `replace`
    /// (with `substring`, the matched part is substituted). `ids` limits it
    /// to those brushes; empty means the whole map. Returns `None` when no
    /// face matched.
    pub fn replace_material(
        &mut self,
        find: &str,
        replace: &str,
        ids: &[u32],
        substring: bool,
    ) -> Option<Applied> {
        let find_l = find.trim().to_ascii_lowercase();
        if find_l.is_empty() {
            return None;
        }
        let targets: Vec<u32> = if ids.is_empty() {
            self.all_solid_ids()
        } else {
            ids.to_vec()
        };
        let mut faces: Vec<(u32, u32, String)> = Vec::new();
        for id in targets {
            let Some(solid) = self.solid(id) else {
                continue;
            };
            for side in &solid.sides {
                let m = side.material.to_ascii_lowercase();
                let new = if substring {
                    m.find(&find_l).map(|at| {
                        format!(
                            "{}{}{}",
                            &side.material[..at],
                            replace.trim(),
                            &side.material[at + find_l.len()..]
                        )
                    })
                } else if m == find_l {
                    Some(replace.trim().to_string())
                } else {
                    None
                };
                if let Some(new) = new {
                    if !new.is_empty() && new != side.material {
                        faces.push((id, side.id, new));
                    }
                }
            }
        }
        if faces.is_empty() {
            return None;
        }
        let count = faces.len();
        let mut changes = Vec::new();
        let mut by_solid: Vec<(u32, Vec<(u32, String)>)> = Vec::new();
        for (solid, side, new) in faces {
            match by_solid.iter_mut().find(|(s, _)| *s == solid) {
                Some((_, v)) => v.push((side, new)),
                None => by_solid.push((solid, vec![(side, new)])),
            }
        }
        for (solid_id, sides) in by_solid {
            let Some(loc) = self.location(solid_id) else {
                continue;
            };
            let Some(before) = self.solid(solid_id).cloned() else {
                continue;
            };
            let mut after = before.clone();
            for side in after.sides.iter_mut() {
                if let Some((_, new)) = sides.iter().find(|(id, _)| *id == side.id) {
                    side.material = new.clone();
                }
            }
            if let Some(s) = self.solid_mut(loc) {
                *s = after.clone();
            }
            self.write_through(solid_id);
            changes.push(Change::Modify {
                id: solid_id,
                before: Snapshot::Solid(before),
                after: Snapshot::Solid(after),
            });
        }
        Some(self.commit(
            Transaction {
                label: format!("Заменить текстуру на гранях ({count})"),
                changes,
            },
            false,
        ))
    }

    fn all_solid_ids(&self) -> Vec<u32> {
        let mut ids: Vec<u32> = self.map.world.solids.iter().map(|s| s.id).collect();
        for e in &self.map.entities {
            ids.extend(e.solids.iter().map(|s| s.id));
        }
        ids
    }

    fn apply_cordons(&mut self, cordons: Vec<vmf::Cordon>, active: bool) {
        sync::write_cordons(self.map.document_mut(), &cordons, active);
        self.map.cordons = cordons;
        self.map.cordons_active = active;
        // Removing an old `cordon` block shifts the top-level indices.
        self.reindex();
    }

    // -----------------------------------------------------------------------
    // Cordon and clipping
    // -----------------------------------------------------------------------

    /// The cordon the editor works with: the active one, else the first.
    pub fn cordon(&self) -> Option<(&vmf::Cordon, bool)> {
        let c = self
            .map
            .cordons
            .iter()
            .find(|c| c.active)
            .or(self.map.cordons.first())?;
        Some((c, self.map.cordons_active && c.active))
    }

    /// Sets the single editor cordon box and whether cordoning is on;
    /// `None` removes all cordons.
    pub fn set_cordon(&mut self, bounds: Option<(Vec3, Vec3)>, active: bool) -> Option<Applied> {
        let before = (self.map.cordons.clone(), self.map.cordons_active);
        let after = match bounds {
            Some((a, b)) => {
                let (lo, hi) = (a.min(b), a.max(b));
                if (hi - lo).min_element() < 1.0 {
                    return None;
                }
                let name = self
                    .map
                    .cordons
                    .first()
                    .map(|c| c.name.clone())
                    .unwrap_or_else(|| "cordon".to_string());
                (
                    vec![vmf::Cordon {
                        name,
                        active: true,
                        mins: lo,
                        maxs: hi,
                    }],
                    active,
                )
            }
            None => (Vec::new(), false),
        };
        if after == before {
            return None;
        }
        self.apply_cordons(after.0.clone(), after.1);
        let label = match (&after.0.is_empty(), active) {
            (true, _) => "Удалить кордон",
            (false, true) => "Задать кордон",
            (false, false) => "Отключить кордон",
        };
        Some(self.commit(
            Transaction {
                label: label.to_string(),
                changes: vec![Change::Cordons { before, after }],
            },
            false,
        ))
    }

    /// Splits brushes by a plane. `keep` says which side survives: the part
    /// in front of the plane, behind it, or both (the back part becomes a new
    /// brush placed right after the original). Brushes the plane misses are
    /// left alone. The cut faces get `material` with world-aligned axes.
    pub fn clip(
        &mut self,
        ids: &[u32],
        plane: Plane,
        keep: ClipKeep,
        material: &str,
    ) -> Option<Applied> {
        let mut changes = Vec::new();
        let mut inserts: Vec<(Location, Solid)> = Vec::new();
        for &id in ids {
            let Some(loc) = self.location(id) else {
                continue;
            };
            if matches!(loc, Location::Entity(_)) {
                continue;
            }
            let Some(solid) = self.solid(id).cloned() else {
                continue;
            };
            let (front_sides, back_sides) = split_sides(&solid, &plane);
            let (Some(front_sides), Some(back_sides)) = (front_sides, back_sides) else {
                continue; // The plane does not pass through the brush.
            };
            let mut front = solid.clone();
            front.sides = front_sides;
            let mut back = solid.clone();
            back.sides = back_sides;
            let (keep_in_place, extra) = match keep {
                ClipKeep::Front => (front, None),
                ClipKeep::Back => (back, None),
                ClipKeep::Both => (front, Some(back)),
            };
            let mut kept = keep_in_place;
            self.finish_cut_sides(&mut kept, &solid, Some(material), true);
            let before = solid.clone();
            if let Some(s) = self.solid_mut(loc) {
                *s = kept.clone();
            }
            self.write_through(id);
            changes.push(Change::Modify {
                id,
                before: Snapshot::Solid(before),
                after: Snapshot::Solid(kept),
            });
            if let Some(mut other) = extra {
                other.id = self.alloc_id();
                self.finish_cut_sides(&mut other, &solid, Some(material), false);
                let next = match loc {
                    Location::WorldSolid(i) => Location::WorldSolid(i + 1),
                    Location::EntitySolid { entity, solid } => Location::EntitySolid {
                        entity,
                        solid: solid + 1,
                    },
                    Location::Entity(_) => unreachable!(),
                };
                inserts.push((next, other));
            }
        }
        if changes.is_empty() {
            return None;
        }
        // Insert the new halves last (positions shift as they go in), from the end.
        inserts.sort_by_key(|(loc, _)| match loc {
            Location::WorldSolid(i) => (0usize, 0usize, *i),
            Location::EntitySolid { entity, solid } => (1, *entity, *solid),
            Location::Entity(i) => (2, *i, 0),
        });
        for (loc, solid) in inserts.into_iter().rev() {
            self.insert_solid(loc, solid.clone());
            changes.push(Change::Insert {
                id: solid.id,
                loc,
                object: Snapshot::Solid(solid),
            });
        }
        let structural = changes.iter().any(|c| matches!(c, Change::Insert { .. }));
        let n = changes
            .iter()
            .filter(|c| matches!(c, Change::Modify { .. }))
            .count();
        let label = if n == 1 {
            "Разрезать браш".to_string()
        } else {
            format!("Разрезать браши ({n})")
        };
        Some(self.commit(Transaction { label, changes }, structural))
    }

    /// Carves every world brush the selected brushes overlap, as Hammer's
    /// Carve does: the carvers stay, the others are split into the convex
    /// pieces outside them (or vanish when swallowed whole).
    pub fn carve(&mut self, carver_ids: &[u32]) -> Option<Applied> {
        let carvers: Vec<Solid> = carver_ids
            .iter()
            .filter_map(|&id| self.solid(id).cloned())
            .filter(|s| s.geometry().is_valid())
            .collect();
        if carvers.is_empty() {
            return None;
        }
        let carver_bounds: Vec<(Vec3, Vec3)> = carvers
            .iter()
            .filter_map(|s| s.geometry().bounds())
            .collect();
        let carver_set: std::collections::HashSet<u32> = carvers.iter().map(|s| s.id).collect();
        let overlaps = |(lo, hi): (Vec3, Vec3)| {
            carver_bounds
                .iter()
                .any(|(clo, chi)| lo.cmple(*chi).all() && hi.cmpge(*clo).all())
        };
        // Targets by descending world index so edits do not shift the rest.
        let targets: Vec<usize> = (0..self.map.world.solids.len())
            .rev()
            .filter(|&i| {
                let s = &self.map.world.solids[i];
                !carver_set.contains(&s.id)
                    && !s.hidden
                    && s.sides.iter().all(|f| f.dispinfo.is_none())
                    && s.geometry().bounds().is_some_and(overlaps)
            })
            .collect();
        let mut changes = Vec::new();
        let mut carved = 0usize;
        for i in targets {
            let original = self.map.world.solids[i].clone();
            let mut pieces: Vec<Vec<Side>> = vec![original.sides.clone()];
            let mut touched = false;
            for b in &carvers {
                let mut next = Vec::new();
                for piece in pieces {
                    match carve_sides(&piece, b) {
                        Some(parts) => {
                            touched = true;
                            next.extend(parts);
                        }
                        None => next.push(piece),
                    }
                }
                pieces = next;
            }
            if !touched {
                continue;
            }
            carved += 1;
            self.replace_solid_with_pieces(
                original.id,
                Location::WorldSolid(i),
                &original,
                pieces,
                &mut changes,
            );
        }
        if changes.is_empty() {
            return None;
        }
        let label = if carved == 1 {
            "Вырезать выделением".to_string()
        } else {
            format!("Вырезать выделением ({carved})")
        };
        Some(self.commit(Transaction { label, changes }, true))
    }

    /// Hollows brushes into walls of `thickness` units (negative grows the
    /// walls outward), as Hammer's Make Hollow.
    pub fn hollow(&mut self, ids: &[u32], thickness: f64) -> Option<Applied> {
        if thickness.abs() < 1.0 {
            return None;
        }
        let mut changes = Vec::new();
        let mut done = 0usize;
        // Descending by location so inserts do not shift pending targets.
        let mut targets: Vec<(u32, Location)> = ids
            .iter()
            .filter_map(|&id| Some((id, self.location(id)?)))
            .filter(|(_, loc)| !matches!(loc, Location::Entity(_)))
            .collect();
        targets.sort_by_key(|(_, loc)| match loc {
            Location::WorldSolid(i) => (0usize, 0usize, *i),
            Location::EntitySolid { entity, solid } => (1, *entity, *solid),
            Location::Entity(i) => (2, *i, 0),
        });
        for (id, loc) in targets.into_iter().rev() {
            let Some(original) = self.solid(id).cloned() else {
                continue;
            };
            if !original.geometry().is_valid()
                || original.sides.iter().any(|s| s.dispinfo.is_some())
            {
                continue;
            }
            let pieces = if thickness > 0.0 {
                let Some(inner) = offset_solid(&original, thickness) else {
                    continue;
                };
                carve_sides(&original.sides, &inner)
            } else {
                let Some(outer) = offset_solid(&original, thickness) else {
                    continue;
                };
                carve_sides(&outer.sides, &original)
            };
            let Some(pieces) = pieces else { continue };
            if pieces.is_empty() {
                continue;
            }
            done += 1;
            self.replace_solid_with_pieces(id, loc, &original, pieces, &mut changes);
        }
        if changes.is_empty() {
            return None;
        }
        let label = if done == 1 {
            "Сделать полым".to_string()
        } else {
            format!("Сделать полыми браши ({done})")
        };
        Some(self.commit(Transaction { label, changes }, true))
    }

    /// Moves brush vertices, as Hammer's vertex tool: every face vertex
    /// within a tenth of a unit of a `from` position goes to the matching
    /// `to`. Faces are re-planed from their moved loops. A face whose loop
    /// stops being planar, or a brush that stops being convex, makes the
    /// whole edit fail with a message; faces that collapse are dropped.
    pub fn move_vertices(
        &mut self,
        ids: &[u32],
        moves: &[(Vec3, Vec3)],
    ) -> Result<Applied, String> {
        if moves.is_empty() {
            return Err("Нет вершин для перемещения".into());
        }
        let mut changes = Vec::new();
        for &id in ids {
            let Some(loc) = self.location(id) else {
                continue;
            };
            if matches!(loc, Location::Entity(_)) {
                continue;
            }
            let Some(solid) = self.solid(id).cloned() else {
                continue;
            };
            let moved = move_solid_vertices(&solid, moves)?;
            let Some(moved) = moved else { continue };
            if let Some(s) = self.solid_mut(loc) {
                *s = moved.clone();
            }
            self.write_through(id);
            changes.push(Change::Modify {
                id,
                before: Snapshot::Solid(solid),
                after: Snapshot::Solid(moved),
            });
        }
        if changes.is_empty() {
            return Err("Вершины не принадлежат выделенным брашам".into());
        }
        let label = if changes.len() == 1 {
            "Переместить вершины".to_string()
        } else {
            format!("Переместить вершины брашей ({})", changes.len())
        };
        Ok(self.commit(Transaction { label, changes }, false))
    }

    /// Replaces a brush by convex pieces: the first keeps the brush's id and
    /// side ids, the others are inserted right after it with fresh ids, and
    /// an empty list removes the brush.
    fn replace_solid_with_pieces(
        &mut self,
        id: u32,
        loc: Location,
        original: &Solid,
        pieces: Vec<Vec<Side>>,
        changes: &mut Vec<Change>,
    ) {
        let mut pieces = pieces.into_iter();
        let Some(first) = pieces.next() else {
            if let Some((object, kv_node, kv_path)) = self.remove_object(id, loc) {
                changes.push(Change::Remove {
                    id,
                    loc,
                    object,
                    kv_node,
                    kv_path,
                });
            }
            return;
        };
        let mut kept = original.clone();
        kept.sides = first;
        self.finish_cut_sides(&mut kept, original, None, true);
        if let Some(s) = self.solid_mut(loc) {
            *s = kept.clone();
        }
        self.write_through(id);
        changes.push(Change::Modify {
            id,
            before: Snapshot::Solid(original.clone()),
            after: Snapshot::Solid(kept),
        });
        for (k, sides) in pieces.enumerate() {
            let mut other = original.clone();
            other.id = self.alloc_id();
            other.sides = sides;
            self.finish_cut_sides(&mut other, original, None, false);
            let at = match loc {
                Location::WorldSolid(i) => Location::WorldSolid(i + 1 + k),
                Location::EntitySolid { entity, solid } => Location::EntitySolid {
                    entity,
                    solid: solid + 1 + k,
                },
                Location::Entity(_) => return,
            };
            self.insert_solid(at, other.clone());
            changes.push(Change::Insert {
                id: other.id,
                loc: at,
                object: Snapshot::Solid(other),
            });
        }
    }

    /// Gives the cut face its id, material and texture axes (when `material`
    /// is given; otherwise the face keeps what it was built with), drops
    /// sides the cut made redundant, and (for a new brush) renumbers every side.
    fn finish_cut_sides(
        &mut self,
        piece: &mut Solid,
        original: &Solid,
        material: Option<&str>,
        keep_ids: bool,
    ) {
        let g = piece.geometry();
        let mut drop: Vec<usize> = g
            .problems
            .iter()
            .filter_map(|p| match p {
                geometry::SolidProblem::FaceDoesNotContribute { side } => Some(*side),
                geometry::SolidProblem::DuplicatePlane { side, .. } => Some(*side),
                _ => None,
            })
            .collect();
        drop.sort_unstable();
        drop.dedup();
        for i in drop.into_iter().rev() {
            if i < piece.sides.len() {
                piece.sides.remove(i);
            }
        }
        for side in piece.sides.iter_mut() {
            let is_new = side.id == 0;
            if let (true, Some(material)) = (is_new, material) {
                side.material = material.to_string();
                let n = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);
                let (u, v) = geometry::world_aligned_axes(n);
                side.uaxis = TexAxis::new(u, 0.0, 0.25);
                side.vaxis = TexAxis::new(v, 0.0, 0.25);
                side.rotation = 0.0;
                side.lightmap_scale = original
                    .sides
                    .first()
                    .map(|s| s.lightmap_scale)
                    .unwrap_or(16);
                side.smoothing_groups = 0;
            }
            if is_new || !keep_ids {
                side.id = self.alloc_id();
            }
        }
    }

    fn apply_visgroups(&mut self, groups: Vec<vmf::VisGroup>) {
        sync::write_visgroups(self.map.document_mut(), &groups);
        self.map.visgroups = groups;
        // A first `visgroups` block is inserted near the top: paths shift.
        self.reindex();
    }

    fn apply_groups(&mut self, groups: Vec<vmf::Group>) {
        sync::write_groups(self.map.document_mut(), &groups);
        self.map.world.groups = groups;
        self.reindex();
    }

    // -----------------------------------------------------------------------
    // Visibility, visgroups and groups
    // -----------------------------------------------------------------------

    /// The id to hide for an object: a brush entity's solids hide with the
    /// entity, as Hammer wraps the whole entity.
    fn hide_target(&self, id: u32) -> Option<u32> {
        match self.location(id)? {
            Location::EntitySolid { entity, .. } => Some(self.map.entities[entity].id),
            _ => Some(id),
        }
    }

    /// Hides or shows objects. `via_auto` records the change in the auto
    /// visgroup flag instead of the user one, as Hammer does.
    pub fn set_hidden(&mut self, ids: &[u32], hidden: bool, via_auto: bool) -> Option<Applied> {
        let mut targets: Vec<u32> = ids.iter().filter_map(|&i| self.hide_target(i)).collect();
        targets.sort_unstable();
        targets.dedup();
        let apply_flags = |editor: &mut Editor| {
            if via_auto {
                editor.visgroup_auto_shown = !hidden;
            } else {
                editor.visgroup_shown = !hidden;
            }
        };
        let labels = if hidden {
            ("Скрыть объект", "Скрыть объекты ({})")
        } else {
            ("Показать объект", "Показать объекты ({})")
        };
        self.modify_objects(
            &targets,
            labels,
            |solid| {
                if solid.hidden != hidden {
                    solid.hidden = hidden;
                    apply_flags(&mut solid.editor);
                }
            },
            |entity| {
                if entity.hidden == hidden {
                    return false;
                }
                entity.hidden = hidden;
                apply_flags(&mut entity.editor);
                true
            },
            false,
        )
    }

    /// Shows every hidden object.
    pub fn show_all(&mut self) -> Option<Applied> {
        let ids: Vec<u32> = self
            .map
            .world
            .solids
            .iter()
            .filter(|s| s.hidden)
            .map(|s| s.id)
            .chain(self.map.entities.iter().filter(|e| e.hidden).map(|e| e.id))
            .collect();
        self.set_hidden(&ids, false, false)
    }

    /// Ids of every object (world solids, entity solids, entities).
    fn all_object_ids(&self) -> Vec<u32> {
        self.locations.keys().copied().collect()
    }

    /// Creates a visgroup and puts `members` in it. The new visgroup's id is
    /// the first entry of `changed_ids`.
    pub fn create_visgroup(&mut self, name: &str, color: Rgb, members: &[u32]) -> Option<Applied> {
        let name = name.trim();
        if name.is_empty() {
            return None;
        }
        fn max_id(groups: &[vmf::VisGroup]) -> u32 {
            groups
                .iter()
                .map(|g| g.id.max(max_id(&g.children)))
                .max()
                .unwrap_or(0)
        }
        let id = max_id(&self.map.visgroups) + 1;
        let before = self.map.visgroups.clone();
        let mut after = before.clone();
        after.push(vmf::VisGroup {
            id,
            name: name.to_string(),
            color,
            children: Vec::new(),
        });
        self.apply_visgroups(after.clone());
        let mut changes = vec![Change::VisGroups { id, before, after }];
        changes.extend(self.membership_changes(members, id, true));
        for c in &changes {
            if matches!(c, Change::Modify { .. }) {
                self.write_through(c.id());
            }
        }
        Some(self.commit(
            Transaction {
                label: format!("Создать визгруппу «{name}»"),
                changes,
            },
            false,
        ))
    }

    /// Removes a visgroup (and its children) and the membership of every object.
    pub fn delete_visgroup(&mut self, id: u32) -> Option<Applied> {
        fn remove(groups: &mut Vec<vmf::VisGroup>, id: u32) -> Vec<u32> {
            let mut removed = Vec::new();
            groups.retain(|g| {
                if g.id == id {
                    collect_ids(g, &mut removed);
                    false
                } else {
                    true
                }
            });
            for g in groups.iter_mut() {
                removed.extend(remove(&mut g.children, id));
            }
            removed
        }
        fn collect_ids(g: &vmf::VisGroup, out: &mut Vec<u32>) {
            out.push(g.id);
            for c in &g.children {
                collect_ids(c, out);
            }
        }
        let before = self.map.visgroups.clone();
        let mut after = before.clone();
        let removed = remove(&mut after, id);
        if removed.is_empty() {
            return None;
        }
        let name = find_visgroup(&before, id)
            .map(|g| g.name.clone())
            .unwrap_or_default();
        self.apply_visgroups(after.clone());
        let mut changes = vec![Change::VisGroups { id, before, after }];
        let all = self.all_object_ids();
        for vg in removed {
            changes.extend(self.membership_changes(&all, vg, false));
        }
        for c in &changes {
            if matches!(c, Change::Modify { .. }) {
                self.write_through(c.id());
            }
        }
        Some(self.commit(
            Transaction {
                label: format!("Удалить визгруппу «{name}»"),
                changes,
            },
            false,
        ))
    }

    pub fn rename_visgroup(&mut self, id: u32, name: &str) -> Option<Applied> {
        let name = name.trim();
        if name.is_empty() {
            return None;
        }
        let before = self.map.visgroups.clone();
        let mut after = before.clone();
        let g = find_visgroup_mut(&mut after, id)?;
        if g.name == name {
            return None;
        }
        g.name = name.to_string();
        self.apply_visgroups(after.clone());
        Some(self.commit(
            Transaction {
                label: "Переименовать визгруппу".to_string(),
                changes: vec![Change::VisGroups { id, before, after }],
            },
            false,
        ))
    }

    /// Adds objects to or removes them from a visgroup.
    pub fn set_visgroup_membership(
        &mut self,
        ids: &[u32],
        visgroup: u32,
        member: bool,
    ) -> Option<Applied> {
        let changes = self.membership_changes(ids, visgroup, member);
        if changes.is_empty() {
            return None;
        }
        for c in &changes {
            self.write_through(c.id());
        }
        let label = if member {
            format!("Добавить в визгруппу ({})", changes.len())
        } else {
            format!("Исключить из визгруппы ({})", changes.len())
        };
        Some(self.commit(Transaction { label, changes }, false))
    }

    /// Modify changes that toggle membership, applied to the typed objects
    /// but not yet written through.
    fn membership_changes(&mut self, ids: &[u32], visgroup: u32, member: bool) -> Vec<Change> {
        let mut changes = Vec::new();
        let toggle = |editor: &mut Editor| -> bool {
            let has = editor.visgroup_ids.contains(&visgroup);
            if member && !has {
                editor.visgroup_ids.push(visgroup);
                true
            } else if !member && has {
                editor.visgroup_ids.retain(|&v| v != visgroup);
                true
            } else {
                false
            }
        };
        for &id in ids {
            let Some(loc) = self.location(id) else {
                continue;
            };
            match loc {
                Location::Entity(i) => {
                    let e = &mut self.map.entities[i];
                    let before = e.clone();
                    if toggle(&mut e.editor) {
                        changes.push(Change::Modify {
                            id,
                            before: Snapshot::Entity(before),
                            after: Snapshot::Entity(e.clone()),
                        });
                    }
                }
                _ => {
                    let Some(s) = self.solid_mut(loc) else {
                        continue;
                    };
                    let before = s.clone();
                    if toggle(&mut s.editor) {
                        changes.push(Change::Modify {
                            id,
                            before: Snapshot::Solid(before),
                            after: Snapshot::Solid(s.clone()),
                        });
                    }
                }
            }
        }
        changes
    }

    /// Groups objects; the new group's id is the first entry of `changed_ids`.
    pub fn group_objects(&mut self, ids: &[u32]) -> Option<Applied> {
        let valid: Vec<u32> = ids
            .iter()
            .copied()
            .filter(|&i| self.location(i).is_some())
            .collect();
        if valid.len() < 2 {
            return None;
        }
        let gid = self.alloc_id();
        let before = self.map.world.groups.clone();
        let mut after = before.clone();
        after.push(vmf::Group {
            id: gid,
            editor: Editor {
                color: Rgb {
                    r: 220,
                    g: 220,
                    b: 220,
                },
                visgroup_ids: Vec::new(),
                visgroup_shown: true,
                visgroup_auto_shown: true,
                group_id: None,
                comments: None,
                logical_pos: None,
            },
        });
        self.apply_groups(after.clone());
        let mut changes = vec![Change::Groups {
            id: gid,
            before,
            after,
        }];
        changes.extend(self.group_id_changes(&valid, Some(gid)));
        for c in &changes {
            if matches!(c, Change::Modify { .. }) {
                self.write_through(c.id());
            }
        }
        let mut applied = self.commit(
            Transaction {
                label: format!("Сгруппировать объекты ({})", valid.len()),
                changes,
            },
            false,
        );
        applied.changed_ids.retain(|&i| i != gid);
        applied.changed_ids.insert(0, gid);
        Some(applied)
    }

    /// Removes the objects from their groups; groups left empty are deleted.
    pub fn ungroup_objects(&mut self, ids: &[u32]) -> Option<Applied> {
        let left: std::collections::HashSet<u32> =
            ids.iter().filter_map(|&i| self.group_of(i)).collect();
        let mut changes = self.group_id_changes(ids, None);
        if changes.is_empty() {
            return None;
        }
        for c in &changes {
            self.write_through(c.id());
        }
        // Only the groups these objects left are candidates for removal;
        // groups the file already had without members stay untouched.
        let used: std::collections::HashSet<u32> = self
            .all_object_ids()
            .into_iter()
            .filter_map(|i| self.group_of(i))
            .collect();
        let before = self.map.world.groups.clone();
        let after: Vec<vmf::Group> = before
            .iter()
            .filter(|g| !left.contains(&g.id) || used.contains(&g.id))
            .cloned()
            .collect();
        if after.len() != before.len() {
            self.apply_groups(after.clone());
            changes.push(Change::Groups {
                id: 0,
                before,
                after,
            });
        }
        Some(self.commit(
            Transaction {
                label: "Разгруппировать".to_string(),
                changes,
            },
            false,
        ))
    }

    fn group_id_changes(&mut self, ids: &[u32], group: Option<u32>) -> Vec<Change> {
        let mut changes = Vec::new();
        for &id in ids {
            let Some(loc) = self.location(id) else {
                continue;
            };
            match loc {
                Location::Entity(i) => {
                    let e = &mut self.map.entities[i];
                    if e.editor.group_id == group {
                        continue;
                    }
                    let before = e.clone();
                    e.editor.group_id = group;
                    changes.push(Change::Modify {
                        id,
                        before: Snapshot::Entity(before),
                        after: Snapshot::Entity(e.clone()),
                    });
                }
                _ => {
                    let Some(s) = self.solid_mut(loc) else {
                        continue;
                    };
                    if s.editor.group_id == group {
                        continue;
                    }
                    let before = s.clone();
                    s.editor.group_id = group;
                    changes.push(Change::Modify {
                        id,
                        before: Snapshot::Solid(before),
                        after: Snapshot::Solid(s.clone()),
                    });
                }
            }
        }
        changes
    }

    /// Group an object belongs to, if any.
    pub fn group_of(&self, id: u32) -> Option<u32> {
        match self.location(id)? {
            Location::Entity(i) => self.map.entities[i].editor.group_id,
            Location::WorldSolid(i) => self.map.world.solids[i].editor.group_id,
            Location::EntitySolid { entity, solid } => {
                self.map.entities[entity].solids[solid].editor.group_id
            }
        }
    }

    /// Objects in a group.
    pub fn group_members(&self, group: u32) -> Vec<u32> {
        let mut out: Vec<u32> = self
            .all_object_ids()
            .into_iter()
            .filter(|&i| self.group_of(i) == Some(group))
            .collect();
        out.sort_unstable();
        out
    }

    /// Whether an object is hidden.
    pub fn is_hidden(&self, id: u32) -> bool {
        match self.location(id) {
            Some(Location::Entity(i)) => self.map.entities[i].hidden,
            Some(Location::WorldSolid(i)) => self.map.world.solids[i].hidden,
            Some(Location::EntitySolid { entity, .. }) => self.map.entities[entity].hidden,
            None => false,
        }
    }

    /// Visgroup ids an object belongs to.
    pub fn visgroups_of(&self, id: u32) -> &[u32] {
        match self.location(id) {
            Some(Location::Entity(i)) => &self.map.entities[i].editor.visgroup_ids,
            Some(Location::WorldSolid(i)) => &self.map.world.solids[i].editor.visgroup_ids,
            Some(Location::EntitySolid { entity, solid }) => {
                &self.map.entities[entity].solids[solid].editor.visgroup_ids
            }
            None => &[],
        }
    }

    fn commit(&mut self, mut tx: Transaction, structural: bool) -> Applied {
        if let Some(p) = &self.label_prefix {
            tx.label = format!("{p}{}", tx.label);
        }
        self.version += 1;
        if self.undo.len() < self.saved_depth {
            // The saved state was undone past; it can no longer be reached.
            self.saved_depth = usize::MAX;
        }
        self.redo.clear();
        let applied = Applied {
            version: self.version,
            label: tx.label.clone(),
            changed_ids: tx.changed_ids(),
            structural,
        };
        self.undo.push(tx);
        applied
    }

    fn restore(&mut self, id: u32, snapshot: &Snapshot) {
        if self.location(id).is_some() {
            self.restore_snapshot(id, snapshot);
            self.write_through(id);
        }
    }

    fn solid_mut(&mut self, loc: Location) -> Option<&mut Solid> {
        match loc {
            Location::WorldSolid(i) => self.map.world.solids.get_mut(i),
            Location::EntitySolid { entity, solid } => {
                self.map.entities.get_mut(entity)?.solids.get_mut(solid)
            }
            Location::Entity(_) => None,
        }
    }

    /// Appends an entity to the typed map and a matching block to the kv tree.
    fn insert_entity(&mut self, loc: Location, entity: Entity) {
        let Location::Entity(i) = loc else { return };
        let block = kvgen::entity_block(&entity, self.esc_connections);
        let i = i.min(self.map.entities.len());
        self.map.entities.insert(i, entity);
        sync::insert_entity(self.map.document_mut(), block);
        self.reindex();
    }

    /// Inserts a solid into the typed map at `loc` and a matching block into
    /// the kv tree.
    fn insert_solid(&mut self, loc: Location, solid: Solid) {
        let block = kvgen::solid_block(&solid);
        match loc {
            Location::WorldSolid(i) => {
                let i = i.min(self.map.world.solids.len());
                self.map.world.solids.insert(i, solid);
                sync::insert_world_solid(self.map.document_mut(), block, i);
            }
            Location::EntitySolid { entity, solid: si } => {
                let ent_path = self
                    .paths
                    .entity(self.map.entities[entity].id)
                    .map(|p| p.to_vec());
                let si = si.min(self.map.entities[entity].solids.len());
                self.map.entities[entity].solids.insert(si, solid);
                if let Some(p) = ent_path {
                    sync::insert_solid_in(self.map.document_mut(), &p, block, si);
                }
            }
            Location::Entity(_) => {}
        }
        self.reindex();
    }

    /// Removes an object from the typed map and the kv tree.
    fn remove_object(
        &mut self,
        id: u32,
        loc: Location,
    ) -> Option<(Snapshot, kv::Node, Vec<usize>)> {
        let kv_path = match loc {
            Location::Entity(_) => self.paths.entity(id)?.to_vec(),
            _ => self.paths.solid(id)?.to_vec(),
        };
        let kv_node = sync::remove_at(self.map.document_mut(), &kv_path)?;
        let object = match loc {
            Location::WorldSolid(i) => Snapshot::Solid(self.map.world.solids.remove(i)),
            Location::EntitySolid { entity, solid } => {
                Snapshot::Solid(self.map.entities[entity].solids.remove(solid))
            }
            Location::Entity(i) => Snapshot::Entity(self.map.entities.remove(i)),
        };
        self.reindex();
        Some((object, kv_node, kv_path))
    }

    /// Puts a removed object back exactly where it was.
    fn reinsert_object(
        &mut self,
        loc: Location,
        object: Snapshot,
        kv_node: kv::Node,
        kv_path: &[usize],
    ) {
        match (object, loc) {
            (Snapshot::Solid(s), Location::WorldSolid(i)) => {
                let i = i.min(self.map.world.solids.len());
                self.map.world.solids.insert(i, s);
            }
            (Snapshot::Solid(s), Location::EntitySolid { entity, solid }) => {
                if let Some(e) = self.map.entities.get_mut(entity) {
                    let si = solid.min(e.solids.len());
                    e.solids.insert(si, s);
                }
            }
            (Snapshot::Entity(e), Location::Entity(i)) => {
                let i = i.min(self.map.entities.len());
                self.map.entities.insert(i, e);
            }
            _ => return,
        }
        sync::insert_at(self.map.document_mut(), kv_path, kv_node);
        self.reindex();
    }

    /// Writes the typed object back into the kv tree.
    fn write_through(&mut self, id: u32) {
        let Some(loc) = self.location(id) else { return };
        match loc {
            Location::WorldSolid(_) | Location::EntitySolid { .. } => {
                let solid = match loc {
                    Location::WorldSolid(i) => self.map.world.solids[i].clone(),
                    Location::EntitySolid { entity, solid } => {
                        self.map.entities[entity].solids[solid].clone()
                    }
                    Location::Entity(_) => unreachable!(),
                };
                // Solids inside entities hide with the entity, never alone.
                let hidden = matches!(loc, Location::WorldSolid(_)) && solid.hidden;
                self.sync_hidden(id, hidden);
                if let Some(path) = self.paths.solid(id) {
                    sync::write_solid(self.map.document_mut(), path, &solid);
                }
            }
            Location::Entity(i) => {
                let entity = self.map.entities[i].clone();
                self.sync_hidden(id, entity.hidden);
                if let Some(path) = self.paths.entity(id).map(|p| p.to_vec()) {
                    sync::write_entity_keyvalues(self.map.document_mut(), &path, &entity);
                    sync::write_entity_connections(
                        self.map.document_mut(),
                        &path,
                        &entity,
                        self.esc_connections,
                    );
                }
            }
        }
    }
}

fn translate_solid(solid: &mut Solid, delta: Vec3, texture_lock: bool) {
    for side in &mut solid.sides {
        for p in &mut side.plane_points {
            *p += delta;
        }
        side.plane = Plane::from_points(
            side.plane_points[0],
            side.plane_points[1],
            side.plane_points[2],
        );
        if texture_lock {
            for axis in [&mut side.uaxis, &mut side.vaxis] {
                let scale = if axis.scale.abs() < 1e-12 {
                    0.25
                } else {
                    axis.scale
                };
                axis.shift -= delta.dot(axis.axis) / scale;
            }
        }
        if let Some(vp) = &mut side.vertices_plus {
            for v in vp.iter_mut() {
                *v += delta;
            }
        }
        if let Some(disp) = &mut side.dispinfo {
            disp.start_position += delta;
        }
    }
}

/// An axis-aligned box brush with the six sides in Hammer's order (top,
/// bottom, -x, +x, +y, -y) and world-aligned texture axes.
/// Which part of a clipped brush survives.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClipKeep {
    Front,
    Back,
    Both,
}

/// Side lists of the two halves of `solid` cut by `plane`, each with the
/// cut face appended (id 0, filled in later), or `None` for a half the
/// plane leaves empty (the plane misses or merely touches the brush).
fn split_sides(solid: &Solid, plane: &Plane) -> (Option<Vec<Side>>, Option<Vec<Side>>) {
    let g = solid.geometry();
    if !g.is_valid() || g.vertices.is_empty() {
        return (None, None);
    }
    let (mut front, mut back) = (false, false);
    for &v in &g.vertices {
        let d = plane.distance(v);
        if d > geometry::ON_EPSILON {
            front = true;
        } else if d < -geometry::ON_EPSILON {
            back = true;
        }
    }
    if !(front && back) {
        return (None, None);
    }
    // The front half keeps everything in front of the plane: its new face
    // points backwards (outward normal = -plane normal).
    let front_face = side_on_plane(&solid.sides, &plane.flipped(), None);
    let back_face = side_on_plane(&solid.sides, plane, None);
    let with = |face: Option<Side>| {
        face.map(|f| {
            let mut sides = solid.sides.clone();
            sides.push(f);
            sides
        })
    };
    (with(front_face), with(back_face))
}

fn tidy(v: Vec3) -> Vec3 {
    (v * 1.0e4).round() / 1.0e4
}

/// Three points on `plane` inside the polygon the `sides` cut out of it.
/// Hammer writes plane points clockwise seen from the front, so a CCW
/// polygon (from the geometry) is listed as v0, v2, v1. `None` when the
/// plane does not cross the volume.
fn plane_points_within(sides: &[Side], plane: &Plane) -> Option<[Vec3; 3]> {
    let mut poly = Some(geometry::Polygon::base_for_plane(
        plane,
        geometry::WORLD_EXTENT,
    ));
    for s in sides {
        let sp = s.plane?;
        poly = poly?.clip(&sp);
    }
    let poly = poly?;
    if poly.len() < 3 || poly.area() < 1.0e-3 {
        return None;
    }
    let v = &poly.vertices;
    // Pick three well-spread vertices for numerical stability.
    let a = v[0];
    let b = v[v.len() / 3];
    let c = v[(2 * v.len()) / 3];
    Plane::from_points(a, c, b)?;
    Some([tidy(a), tidy(c), tidy(b)])
}

/// A new side (id 0) lying on `plane` and bounded by `sides`. With a
/// `template` the face takes its material and texture axes (carving keeps
/// the carver's textures); otherwise they are filled in later.
fn side_on_plane(sides: &[Side], plane: &Plane, template: Option<&Side>) -> Option<Side> {
    let pts = plane_points_within(sides, plane)?;
    let mut side = match template {
        Some(t) => t.clone(),
        None => Side {
            id: 0,
            plane_points: pts,
            plane: None,
            material: String::new(),
            uaxis: TexAxis::new(Vec3::X, 0.0, 0.25),
            vaxis: TexAxis::new(-Vec3::Y, 0.0, 0.25),
            rotation: 0.0,
            lightmap_scale: 16,
            smoothing_groups: 0,
            dispinfo: None,
            vertices_plus: None,
        },
    };
    side.id = 0;
    side.plane_points = pts;
    side.plane = Plane::from_points(pts[0], pts[1], pts[2]);
    side.dispinfo = None;
    side.vertices_plus = None;
    Some(side)
}

/// Where the volume bounded by `sides` lies relative to `plane`.
fn classify_sides(sides: &[Side], plane: &Plane) -> (bool, bool) {
    let planes: Vec<Option<Plane>> = sides.iter().map(|s| s.plane).collect();
    let g = geometry::SolidGeometry::from_planes(&planes);
    let (mut front, mut back) = (false, false);
    for &v in &g.vertices {
        let d = plane.distance(v);
        if d > geometry::ON_EPSILON {
            front = true;
        } else if d < -geometry::ON_EPSILON {
            back = true;
        }
    }
    (front, back)
}

/// True when the sides bound a real volume (faces that do not contribute
/// are tolerated; they are pruned later).
fn piece_has_volume(sides: &[Side]) -> bool {
    let planes: Vec<Option<Plane>> = sides.iter().map(|s| s.plane).collect();
    let g = geometry::SolidGeometry::from_planes(&planes);
    let fatal = g.problems.iter().any(|p| {
        !matches!(
            p,
            geometry::SolidProblem::FaceDoesNotContribute { .. }
                | geometry::SolidProblem::DuplicatePlane { .. }
        )
    });
    !fatal && g.volume() > 1.0e-3
}

/// CSG subtraction: the parts of the volume `a` outside brush `b`, one
/// convex piece per plane of `b` that cuts it. `None` when `b` does not
/// overlap `a`, so the caller leaves `a` alone. New faces copy the
/// textures of the carver's faces, as Hammer's Carve does.
fn carve_sides(a: &[Side], b: &Solid) -> Option<Vec<Vec<Side>>> {
    let mut remaining: Vec<Side> = a.to_vec();
    let mut pieces = Vec::new();
    for bs in &b.sides {
        let Some(p) = bs.plane else { continue };
        let (front, back) = classify_sides(&remaining, &p);
        if front && !back {
            return None; // Entirely outside this face of b: no overlap.
        }
        if !front {
            continue; // Entirely inside this face of b.
        }
        if let Some(face) = side_on_plane(&remaining, &p.flipped(), Some(bs)) {
            let mut piece = remaining.clone();
            piece.push(face);
            if piece_has_volume(&piece) {
                pieces.push(piece);
            }
        }
        remaining.push(side_on_plane(&remaining, &p, Some(bs))?);
        if !piece_has_volume(&remaining) {
            return None;
        }
    }
    Some(pieces)
}

/// How far a moved face's vertices may stray from one plane before the
/// move is refused (Hammer's "non-planar face" check).
const PLANAR_EPSILON: f64 = 0.5;

/// The solid with vertices moved, `Ok(None)` when none of its vertices
/// matched, `Err` when the result would not be a valid brush.
fn move_solid_vertices(solid: &Solid, moves: &[(Vec3, Vec3)]) -> Result<Option<Solid>, String> {
    let g = solid.geometry();
    if !g.is_valid() {
        return Err(format!("Браш {} имеет некорректную геометрию", solid.id));
    }
    let remap = |v: Vec3| -> (Vec3, bool) {
        for (from, to) in moves {
            if (v - *from).length() <= geometry::WELD_EPSILON {
                return (*to, true);
            }
        }
        (v, false)
    };
    let mut any = false;
    let mut out = solid.clone();
    let mut keep = Vec::with_capacity(solid.sides.len());
    for (i, side) in out.sides.iter_mut().enumerate() {
        let Some(poly) = g.faces.get(i).and_then(|f| f.as_ref()) else {
            keep.push(false);
            continue;
        };
        let mut loop_: Vec<Vec3> = Vec::with_capacity(poly.len());
        let mut face_hit = false;
        for &v in &poly.vertices {
            let (p, hit) = remap(v);
            face_hit |= hit;
            let repeats = loop_
                .last()
                .is_some_and(|l| (*l - p).length() <= geometry::WELD_EPSILON);
            if !repeats {
                loop_.push(p);
            }
        }
        any |= face_hit;
        if !face_hit {
            keep.push(true); // Untouched face: its plane text stays byte-identical.
            continue;
        }
        while loop_.len() > 1
            && (loop_[0] - *loop_.last().unwrap()).length() <= geometry::WELD_EPSILON
        {
            loop_.pop();
        }
        if loop_.len() < 3 {
            keep.push(false); // The face collapsed to an edge or point.
            continue;
        }
        // Newell's normal and the centroid give the best-fit plane.
        let mut n = Vec3::ZERO;
        let mut c = Vec3::ZERO;
        for k in 0..loop_.len() {
            let a = loop_[k];
            let b = loop_[(k + 1) % loop_.len()];
            n += Vec3::new(
                (a.y - b.y) * (a.z + b.z),
                (a.z - b.z) * (a.x + b.x),
                (a.x - b.x) * (a.y + b.y),
            );
            c += a;
        }
        let Some(n) = n.try_normalize() else {
            keep.push(false);
            continue;
        };
        let plane = Plane::new(n, n.dot(c / loop_.len() as f64));
        if loop_
            .iter()
            .any(|&v| plane.distance(v).abs() > PLANAR_EPSILON)
        {
            return Err(format!(
                "Грань {} браша {} станет неплоской",
                side.id, solid.id
            ));
        }
        let (a, b, cc) = (
            loop_[0],
            loop_[loop_.len() / 3],
            loop_[(2 * loop_.len()) / 3],
        );
        let pts = [tidy(a), tidy(cc), tidy(b)];
        let Some(p) = Plane::from_points(pts[0], pts[1], pts[2]) else {
            keep.push(false);
            continue;
        };
        side.plane_points = pts;
        side.plane = Some(p);
        if side.vertices_plus.is_some() {
            side.vertices_plus = Some(loop_.iter().map(|&v| tidy(v)).collect());
        }
        keep.push(true);
    }
    if !any {
        return Ok(None);
    }
    let mut k = keep.iter();
    out.sides.retain(|_| *k.next().unwrap_or(&true));
    let ng = out.geometry();
    if !ng.is_valid() {
        return Err(format!("Браш {} станет невыпуклым", solid.id));
    }
    // Every intended vertex must still be a corner of the brush, or a
    // moved vertex ended up inside it (the brush would silently change shape).
    for (i, face) in ng.faces.iter().enumerate() {
        let Some(face) = face else { continue };
        let side = &out.sides[i];
        if let Some(vp) = &side.vertices_plus {
            for v in vp {
                if !face
                    .vertices
                    .iter()
                    .any(|f| (*f - *v).length() <= PLANAR_EPSILON)
                {
                    return Err(format!("Браш {} станет невыпуклым", solid.id));
                }
            }
        }
    }
    Ok(Some(out))
}

/// A copy of the solid with every face moved along its normal by
/// `-distance` (positive shrinks, negative grows). `None` when the result
/// is no longer a valid brush.
fn offset_solid(solid: &Solid, distance: f64) -> Option<Solid> {
    let mut out = solid.clone();
    for side in out.sides.iter_mut() {
        let n = side.plane?.normal;
        for p in side.plane_points.iter_mut() {
            *p = tidy(*p - n * distance);
        }
        side.plane = Plane::from_points(
            side.plane_points[0],
            side.plane_points[1],
            side.plane_points[2],
        );
        side.dispinfo = None;
        side.vertices_plus = None;
    }
    let g = out.geometry();
    (g.is_valid() && g.volume() > 1.0e-3).then_some(out)
}

impl Document {
    /// Wraps or unwraps the object's kv block to match its typed `hidden`
    /// flag; paths are rebuilt when the tree changes shape.
    fn sync_hidden(&mut self, id: u32, hidden: bool) {
        if self.paths.is_hidden(id) == hidden {
            return;
        }
        let path = match self.location(id) {
            Some(Location::Entity(_)) => self.paths.entity(id).map(|p| p.to_vec()),
            Some(_) => self.paths.solid(id).map(|p| p.to_vec()),
            None => None,
        };
        if let Some(path) = path {
            if sync::set_hidden(self.map.document_mut(), &path, hidden).is_some() {
                self.paths = sync::Paths::build(&self.map);
            }
        }
    }
}

fn find_visgroup(groups: &[vmf::VisGroup], id: u32) -> Option<&vmf::VisGroup> {
    groups.iter().find_map(|g| {
        if g.id == id {
            Some(g)
        } else {
            find_visgroup(&g.children, id)
        }
    })
}

fn find_visgroup_mut(groups: &mut [vmf::VisGroup], id: u32) -> Option<&mut vmf::VisGroup> {
    for g in groups.iter_mut() {
        if g.id == id {
            return Some(g);
        }
        if let Some(c) = find_visgroup_mut(&mut g.children, id) {
            return Some(c);
        }
    }
    None
}

/// True when some connection in the file is written with commas rather
/// than ESC, in which case new ones keep that style.
fn uses_comma_connections(map: &Map) -> bool {
    map.document().blocks("entity").any(|e| {
        e.block("connections")
            .map(|c| c.pairs().any(|p| !p.value.text().contains('\u{1b}')))
            .unwrap_or(false)
    })
}

/// A brush being sewn: id, location, snapshot and its displacement faces
/// as (side index, outline, normal).
type SewWork = (u32, Location, Solid, Vec<(usize, Vec<Vec3>, Vec3)>);

/// Hammer's map extent: brushes beyond ±16384 cannot be compiled.
pub const MAP_EXTENT: f64 = 16384.0;

/// Texture placement of one face, as the face-edit sheet shows it.
#[derive(Debug, Clone, PartialEq)]
pub struct FaceInfo {
    pub material: String,
    pub uaxis: TexAxis,
    pub vaxis: TexAxis,
    pub rotation: f64,
    pub lightmap_scale: u32,
    pub smoothing_groups: u32,
    pub normal: Vec3,
    /// Displacement power, 0 for a plain face.
    pub disp_power: u32,
}

/// How texture axes are re-derived by the face-edit sheet.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Align {
    /// Axes along the world axes least aligned with the normal (Hammer's default).
    World,
    /// Axes in the plane of the face.
    Face,
}

/// Hammer's justify buttons: which face edge the texture's edge snaps to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Justify {
    Left,
    Right,
    Top,
    Bottom,
    Center,
    /// Scale and shift so one texture tile covers the face exactly.
    Fit,
}

/// One face-edit operation; `None` fields leave the property alone. The
/// steps apply in the order of the fields: material, alignment, rotation,
/// scale, shift, justify.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct FaceEdit {
    pub material: Option<String>,
    pub align: Option<Align>,
    /// Absolute rotation in degrees; the axes turn by the difference.
    pub rotation: Option<f64>,
    pub scale: [Option<f64>; 2],
    pub shift: [Option<f64>; 2],
    pub lightmap_scale: Option<u32>,
    pub smoothing_groups: Option<u32>,
    pub justify: Option<Justify>,
    /// Texture size in pixels, used by justify and fit.
    pub tex_size: [f64; 2],
    /// Hammer's "Treat as one": justify and fit use the outline of all the
    /// edited faces together, so one texture runs across them seamlessly.
    pub treat_as_one: bool,
}

/// One finding of "Check for Problems".
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Problem {
    pub kind: ProblemKind,
    /// The solid or entity the problem is about (an id for duplicates).
    pub object: u32,
    pub message: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProblemKind {
    InvalidSolid,
    OutsideWorld,
    TooManySides,
    EmptyMaterial,
    ZeroTextureScale,
    EmptyClass,
    NoOrigin,
    BadTarget,
    DuplicateId,
}

impl ProblemKind {
    /// The kind named by [`ProblemKind::name`].
    pub fn from_name(name: &str) -> Option<ProblemKind> {
        [
            ProblemKind::InvalidSolid,
            ProblemKind::OutsideWorld,
            ProblemKind::TooManySides,
            ProblemKind::EmptyMaterial,
            ProblemKind::ZeroTextureScale,
            ProblemKind::EmptyClass,
            ProblemKind::NoOrigin,
            ProblemKind::BadTarget,
            ProblemKind::DuplicateId,
        ]
        .into_iter()
        .find(|k| k.name() == name)
    }

    /// Stable name for the frontend.
    pub fn name(&self) -> &'static str {
        match self {
            ProblemKind::InvalidSolid => "invalid_solid",
            ProblemKind::OutsideWorld => "outside_world",
            ProblemKind::TooManySides => "too_many_sides",
            ProblemKind::EmptyMaterial => "empty_material",
            ProblemKind::ZeroTextureScale => "zero_texture_scale",
            ProblemKind::EmptyClass => "empty_class",
            ProblemKind::NoOrigin => "no_origin",
            ProblemKind::BadTarget => "bad_target",
            ProblemKind::DuplicateId => "duplicate_id",
        }
    }
}

fn describe_problems(problems: &[geometry::SolidProblem]) -> String {
    use geometry::SolidProblem as P;
    let parts: Vec<String> = problems
        .iter()
        .map(|p| match p {
            P::TooFewSides(n) => format!("граней: {n}, нужно не меньше 4"),
            P::InvalidPlane { side } => format!("у грани #{} не задана плоскость", side + 1),
            P::FaceDoesNotContribute { side } => {
                format!("грань #{} не входит в поверхность браша", side + 1)
            }
            P::DuplicatePlane { side, other } => {
                format!(
                    "грани #{} и #{} лежат в одной плоскости",
                    side + 1,
                    other + 1
                )
            }
            P::Unbounded => "объём не замкнут".to_string(),
        })
        .collect();
    parts.join(", ")
}

/// A side with Hammer's default texture alignment over a convex polygon
/// whose vertices run counter-clockwise seen from outside.
fn side_from_polygon(id: u32, verts: &[Vec3], material: &str) -> Side {
    // Hammer lists plane points clockwise seen from the front.
    let pts = [verts[0], verts[2], verts[1]];
    let plane = Plane::from_points(pts[0], pts[1], pts[2]);
    let (u, v) = geometry::world_aligned_axes(plane.map(|p| p.normal).unwrap_or(Vec3::Z));
    Side {
        id,
        plane_points: pts,
        plane,
        material: material.to_string(),
        uaxis: TexAxis::new(u, 0.0, 0.25),
        vaxis: TexAxis::new(v, 0.0, 0.25),
        rotation: 0.0,
        lightmap_scale: 16,
        smoothing_groups: 0,
        dispinfo: None,
        vertices_plus: None,
    }
}

/// Centre of the common bounding box of the solids, as Hammer writes a brush
/// entity's `origin`.
fn solids_centre(solids: &[Solid]) -> Option<Vec3> {
    let mut acc: Option<(Vec3, Vec3)> = None;
    for s in solids {
        if let Some((lo, hi)) = s.geometry().bounds() {
            acc = Some(match acc {
                None => (lo, hi),
                Some((a, b)) => (a.min(lo), b.max(hi)),
            });
        }
    }
    acc.map(|(lo, hi)| tidy((lo + hi) / 2.0))
}

/// Axes in the plane of the face, oriented like the world-aligned ones.
fn face_aligned_axes(normal: Vec3) -> (Vec3, Vec3) {
    let (wu, wv) = geometry::world_aligned_axes(normal);
    let mut u = wu - normal * wu.dot(normal);
    if u.length() < 1.0e-6 {
        u = wv - normal * wv.dot(normal);
    }
    let u = u.normalize();
    let mut v = normal.cross(u);
    if v.dot(wv) < 0.0 {
        v = -v;
    }
    (tidy(u), tidy(v))
}

fn rotate_about(v: Vec3, axis: Vec3, degrees: f64) -> Vec3 {
    let Some(axis) = axis.try_normalize() else {
        return v;
    };
    let (s, c) = degrees.to_radians().sin_cos();
    tidy(v * c + axis.cross(v) * s + axis * axis.dot(v) * (1.0 - c))
}

fn effective_scale(s: f64) -> f64 {
    if s.abs() < 1.0e-12 {
        0.25
    } else {
        s
    }
}

/// Applies a face edit to one side; `polygon` is the face's outline (needed
/// for justify and fit).
fn apply_face_edit(side: &mut Side, edit: &FaceEdit, polygon: Option<&geometry::Polygon>) {
    let normal = side.plane.map(|p| p.normal).unwrap_or(Vec3::Z);
    if let Some(m) = &edit.material {
        if !m.trim().is_empty() {
            side.material = m.trim().to_string();
        }
    }
    if let Some(align) = edit.align {
        let (u, v) = match align {
            Align::World => geometry::world_aligned_axes(normal),
            Align::Face => face_aligned_axes(normal),
        };
        side.uaxis = TexAxis::new(u, 0.0, side.uaxis.scale);
        side.vaxis = TexAxis::new(v, 0.0, side.vaxis.scale);
        side.rotation = 0.0;
    }
    if let Some(r) = edit.rotation {
        let delta = r - side.rotation;
        if delta.abs() > 1.0e-9 {
            side.uaxis.axis = rotate_about(side.uaxis.axis, normal, delta);
            side.vaxis.axis = rotate_about(side.vaxis.axis, normal, delta);
        }
        side.rotation = r;
    }
    if let Some(s) = edit.scale[0] {
        if s.abs() > 1.0e-9 {
            side.uaxis.scale = s;
        }
    }
    if let Some(s) = edit.scale[1] {
        if s.abs() > 1.0e-9 {
            side.vaxis.scale = s;
        }
    }
    if let Some(s) = edit.shift[0] {
        side.uaxis.shift = s;
    }
    if let Some(s) = edit.shift[1] {
        side.vaxis.shift = s;
    }
    if let Some(l) = edit.lightmap_scale {
        side.lightmap_scale = l.max(1);
    }
    if let Some(g) = edit.smoothing_groups {
        side.smoothing_groups = g;
    }
    if let (Some(j), Some(poly)) = (edit.justify, polygon) {
        let tex = [
            if edit.tex_size[0] > 0.0 {
                edit.tex_size[0]
            } else {
                512.0
            },
            if edit.tex_size[1] > 0.0 {
                edit.tex_size[1]
            } else {
                512.0
            },
        ];
        // World-unit extents of the face along each texture axis.
        let extent = |axis: Vec3| {
            let mut lo = f64::INFINITY;
            let mut hi = f64::NEG_INFINITY;
            for &p in &poly.vertices {
                let d = p.dot(axis);
                lo = lo.min(d);
                hi = hi.max(d);
            }
            (lo, hi)
        };
        let (ulo, uhi) = extent(side.uaxis.axis);
        let (vlo, vhi) = extent(side.vaxis.axis);
        if j == Justify::Fit {
            if uhi - ulo > 1.0e-6 {
                side.uaxis.scale = (uhi - ulo) / tex[0];
            }
            if vhi - vlo > 1.0e-6 {
                side.vaxis.scale = (vhi - vlo) / tex[1];
            }
        }
        let su = effective_scale(side.uaxis.scale);
        let sv = effective_scale(side.vaxis.scale);
        // Texel extents with zero shift; the shift moves them where asked.
        let (tu0, tu1) = (ulo / su, uhi / su);
        let (tv0, tv1) = (vlo / sv, vhi / sv);
        match j {
            Justify::Left | Justify::Fit => side.uaxis.shift = -tu0.min(tu1),
            Justify::Right => side.uaxis.shift = tex[0] - tu0.max(tu1),
            Justify::Top => side.vaxis.shift = -tv0.min(tv1),
            Justify::Bottom => side.vaxis.shift = tex[1] - tv0.max(tv1),
            Justify::Center => {
                side.uaxis.shift = tex[0] / 2.0 - (tu0 + tu1) / 2.0;
                side.vaxis.shift = tex[1] / 2.0 - (tv0 + tv1) / 2.0;
            }
        }
        if j == Justify::Fit {
            side.vaxis.shift = -tv0.min(tv1);
        }
        // Hammer keeps shifts within one tile.
        side.uaxis.shift = wrap_shift(side.uaxis.shift, tex[0]);
        side.vaxis.shift = wrap_shift(side.vaxis.shift, tex[1]);
    }
    side.uaxis.shift = tidy_f(side.uaxis.shift);
    side.vaxis.shift = tidy_f(side.vaxis.shift);
    side.uaxis.scale = tidy_f(side.uaxis.scale);
    side.vaxis.scale = tidy_f(side.vaxis.scale);
}

fn wrap_shift(shift: f64, tex: f64) -> f64 {
    if tex <= 0.0 {
        return shift;
    }
    let s = shift % tex;
    if s < 0.0 {
        s + tex
    } else {
        s
    }
}

fn tidy_f(v: f64) -> f64 {
    (v * 1.0e4).round() / 1.0e4
}

fn make_block(id: u32, side_ids: &[u32], lo: Vec3, hi: Vec3, material: &str) -> Solid {
    let v = |x: f64, y: f64, z: f64| Vec3::new(x, y, z);
    let points: [[Vec3; 3]; 6] = [
        [
            v(lo.x, hi.y, hi.z),
            v(hi.x, hi.y, hi.z),
            v(hi.x, lo.y, hi.z),
        ],
        [
            v(lo.x, lo.y, lo.z),
            v(hi.x, lo.y, lo.z),
            v(hi.x, hi.y, lo.z),
        ],
        [
            v(lo.x, hi.y, hi.z),
            v(lo.x, lo.y, hi.z),
            v(lo.x, lo.y, lo.z),
        ],
        [
            v(hi.x, hi.y, lo.z),
            v(hi.x, lo.y, lo.z),
            v(hi.x, lo.y, hi.z),
        ],
        [
            v(hi.x, hi.y, hi.z),
            v(lo.x, hi.y, hi.z),
            v(lo.x, hi.y, lo.z),
        ],
        [
            v(hi.x, lo.y, lo.z),
            v(lo.x, lo.y, lo.z),
            v(lo.x, lo.y, hi.z),
        ],
    ];
    let sides = points
        .iter()
        .zip(side_ids)
        .map(|(pts, &sid)| {
            let plane = Plane::from_points(pts[0], pts[1], pts[2]);
            let (u, w) = geometry::world_aligned_axes(plane.map(|p| p.normal).unwrap_or(Vec3::Z));
            Side {
                id: sid,
                plane_points: *pts,
                plane,
                material: material.to_string(),
                uaxis: TexAxis::new(u, 0.0, 0.25),
                vaxis: TexAxis::new(w, 0.0, 0.25),
                rotation: 0.0,
                lightmap_scale: 16,
                smoothing_groups: 0,
                dispinfo: None,
                vertices_plus: None,
            }
        })
        .collect();
    Solid {
        id,
        sides,
        editor: Editor {
            color: brush_color(id),
            visgroup_ids: Vec::new(),
            visgroup_shown: true,
            visgroup_auto_shown: true,
            group_id: None,
            comments: None,
            logical_pos: None,
        },
        hidden: false,
    }
}

/// Hammer gives each new brush a colour; a stable palette keyed by id keeps
/// files deterministic.
fn brush_color(id: u32) -> Rgb {
    const PALETTE: [[u8; 3]; 8] = [
        [0, 180, 0],
        [0, 200, 200],
        [200, 200, 0],
        [220, 120, 0],
        [120, 220, 120],
        [0, 120, 220],
        [200, 0, 200],
        [220, 60, 60],
    ];
    let c = PALETTE[(id as usize) % PALETTE.len()];
    Rgb {
        r: c[0],
        g: c[1],
        b: c[2],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture() -> String {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../kv/tests/fixtures/hammer_room.vmf"
        );
        std::fs::read_to_string(path).unwrap()
    }

    fn diff_lines<'a>(a: &'a str, b: &'a str) -> Vec<(&'a str, &'a str)> {
        a.lines().zip(b.lines()).filter(|(x, y)| x != y).collect()
    }

    #[test]
    fn merged_steps_undo_together() {
        let mut doc = Document::open(&Document::empty_map_text("sky_day01_01")).unwrap();
        for i in 0..3 {
            doc.create_entity(
                "prop_static",
                Vec3::new(i as f64 * 64.0, 0.0, 0.0),
                &[("model".to_string(), "models/a.mdl".to_string())],
                Rgb::default(),
            )
            .unwrap();
        }
        assert_eq!(doc.map().entities.len(), 3);
        assert!(!doc.merge_undo(1, "x"), "one step is nothing to merge");
        assert!(!doc.merge_undo(4, "x"), "more steps than there are");
        assert!(doc.merge_undo(3, "Кисть: 3 пропа"));
        assert_eq!(doc.undo_label(), Some("Кисть: 3 пропа"));
        assert!(doc.is_dirty());
        let a = doc.undo().unwrap();
        assert_eq!(a.changed_ids.len(), 3);
        assert!(doc.map().entities.is_empty());
        assert!(!doc.is_dirty(), "back at the opened state");
        doc.redo().unwrap();
        assert_eq!(doc.map().entities.len(), 3);
    }

    #[test]
    fn an_empty_map_opens_round_trips_and_takes_a_first_room() {
        let text = Document::empty_map_text("sky_night_01");
        let mut doc = Document::open(&text).unwrap();
        assert_eq!(doc.to_vmf(), text);
        assert_eq!(doc.map().world.skyname(), Some("sky_night_01"));
        assert!(doc.map().world.solids.is_empty());
        let a = doc
            .create_block(
                Vec3::splat(-512.0),
                Vec3::new(512.0, 512.0, 256.0),
                DEFAULT_MATERIAL,
            )
            .unwrap();
        assert_eq!(a.changed_ids[0], 2, "ids start after the world's 1");
        doc.hollow(&[2], 16.0).unwrap();
        assert_eq!(doc.map().world.solids.len(), 6);
        doc.create_entity(
            "info_player_start",
            Vec3::new(0.0, 0.0, -495.0),
            &[],
            Rgb::default(),
        )
        .unwrap();
        let out = doc.to_vmf();
        let map = vmf::Map::parse(&out).unwrap();
        assert_eq!(map.entities.len(), 1);
        assert!(map.world.solids.iter().all(|s| s.geometry().is_valid()));
        assert!(
            out.ends_with("cordons\n{\n\t\"active\" \"0\"\n}\n"),
            "{out}"
        );
        assert!(
            out.contains("\t\"skyname\" \"sky_night_01\"\n\tsolid\n"),
            "brushes go after the world keys"
        );
    }

    #[test]
    fn open_is_lossless() {
        let src = fixture();
        let doc = Document::open(&src).unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(!doc.is_dirty());
        assert_eq!(doc.location(2), Some(Location::WorldSolid(0)));
        assert_eq!(
            doc.location(61),
            Some(Location::EntitySolid {
                entity: 1,
                solid: 0
            })
        );
        assert_eq!(doc.location(50), Some(Location::Entity(0)));
    }

    #[test]
    fn translating_a_solid_changes_only_its_planes_and_undo_restores_bytes() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let applied = doc
            .translate(&[2], Vec3::new(64.0, 0.0, 16.0), false)
            .unwrap();
        assert_eq!(applied.changed_ids, vec![2]);
        assert!(!applied.structural);
        assert!(doc.is_dirty());

        let out = doc.to_vmf();
        let diff = diff_lines(&src, &out);
        // Six sides, one plane line each; texture lock off so axes are untouched.
        assert_eq!(diff.len(), 6, "{diff:#?}");
        assert!(diff.iter().all(|(a, _)| a.contains("\"plane\"")));
        assert_eq!(
            diff[0].1,
            "\t\t\t\"plane\" \"(-448 512 -48) (576 512 -48) (576 -512 -48)\""
        );
        assert_eq!(src.lines().count(), out.lines().count());

        let planes_moved = doc.solid(2).unwrap().sides[0].plane.unwrap();
        assert_eq!(planes_moved.dist, -48.0);

        let undone = doc.undo().unwrap();
        assert_eq!(undone.changed_ids, vec![2]);
        assert_eq!(doc.to_vmf(), src);
        assert!(!doc.is_dirty());
        assert!(doc.can_redo());
        doc.redo().unwrap();
        assert_eq!(doc.to_vmf(), out);
    }

    #[test]
    fn texture_lock_moves_shifts_with_the_brush() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        doc.translate(&[2], Vec3::new(64.0, -32.0, 0.0), true)
            .unwrap();
        let top = &doc.solid(2).unwrap().sides[0];
        // uaxis [1 0 0] scale 0.25: shift -= 64 / 0.25 = -256; vaxis [0 -1 0]: shift -= (32) / 0.25 = -128.
        assert_eq!(top.uaxis.shift, -256.0);
        assert_eq!(top.vaxis.shift, -128.0);
        let out = doc.to_vmf();
        assert!(out.contains("\"uaxis\" \"[1 0 0 -256] 0.25\""), "{out}");
        assert!(out.contains("\"vaxis\" \"[0 -1 0 -128] 0.25\""));
    }

    #[test]
    fn translating_a_point_entity_rewrites_origin_only() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        doc.translate(&[50], Vec3::new(0.0, 0.0, 8.5), false)
            .unwrap();
        let out = doc.to_vmf();
        let diff = diff_lines(&src, &out);
        assert_eq!(
            diff,
            vec![("\t\"origin\" \"0 0 -56\"", "\t\"origin\" \"0 0 -47.5\"")]
        );
        assert_eq!(
            doc.entity(50).unwrap().origin(),
            Some(Vec3::new(0.0, 0.0, -47.5))
        );
    }

    #[test]
    fn displacement_start_position_follows_the_brush() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        doc.translate(&[20], Vec3::new(10.0, 20.0, 30.0), false)
            .unwrap();
        let out = doc.to_vmf();
        assert!(out.contains("\"startposition\" \"[-54 -44 30]\""), "{out}");
    }

    #[test]
    fn several_edits_undo_in_order() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        doc.translate(&[2, 50], Vec3::new(1.0, 0.0, 0.0), false)
            .unwrap();
        doc.translate(&[61], Vec3::new(0.0, 1.0, 0.0), false)
            .unwrap();
        assert_eq!(doc.undo_label(), Some("Переместить объект"));
        doc.undo().unwrap();
        assert_eq!(doc.undo_label(), Some("Переместить объекты (2)"));
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(!doc.can_undo());
        // A new edit clears redo.
        doc.redo().unwrap();
        doc.translate(&[2], Vec3::new(0.0, 0.0, 1.0), false)
            .unwrap();
        assert!(!doc.can_redo());
    }

    #[test]
    fn dirty_tracks_the_saved_state() {
        let mut doc = Document::open(&fixture()).unwrap();
        doc.translate(&[2], Vec3::X, false).unwrap();
        doc.translate(&[2], Vec3::X, false).unwrap();
        doc.mark_saved();
        assert!(!doc.is_dirty());
        doc.undo().unwrap();
        assert!(doc.is_dirty());
        doc.redo().unwrap();
        assert!(!doc.is_dirty());
        // Undo past the save point and edit: the saved state is gone for good.
        doc.undo().unwrap();
        doc.translate(&[2], Vec3::Y, false).unwrap();
        assert!(doc.is_dirty());
        doc.undo().unwrap();
        assert!(doc.is_dirty());
    }

    #[test]
    fn unknown_ids_and_zero_delta_are_no_ops() {
        let mut doc = Document::open(&fixture()).unwrap();
        assert!(doc.translate(&[999], Vec3::X, false).is_none());
        assert!(doc.translate(&[2], Vec3::ZERO, false).is_none());
        assert_eq!(doc.version(), 0);
    }

    #[test]
    fn create_block_writes_a_hammer_style_solid_and_undo_removes_it() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let applied = doc
            .create_block(
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(128.0, 64.0, 32.0),
                DEFAULT_MATERIAL,
            )
            .unwrap();
        assert!(applied.structural);
        let id = applied.changed_ids[0];
        assert_eq!(id, 71, "ids continue after the file's maximum");
        let solid = doc.solid(id).unwrap();
        assert_eq!(solid.sides.len(), 6);
        assert_eq!(solid.sides[0].id, 72);
        let g = solid.geometry();
        assert!(g.is_valid(), "{:?}", g.problems);
        assert_eq!(
            g.bounds().unwrap(),
            (Vec3::ZERO, Vec3::new(128.0, 64.0, 32.0))
        );
        // Top face: world-aligned axes like Hammer.
        assert_eq!(solid.sides[0].uaxis.axis, Vec3::X);
        assert_eq!(solid.sides[0].vaxis.axis, -Vec3::Y);
        // Side face (-x): axes Y and -Z.
        assert_eq!(solid.sides[2].uaxis.axis, Vec3::Y);
        assert_eq!(solid.sides[2].vaxis.axis, -Vec3::Z);

        let out = doc.to_vmf();
        assert!(
            out.starts_with(&src[..src.find("\tgroup\n").unwrap()]),
            "text before the insert is untouched"
        );
        let expected_block = "\tsolid\n\t{\n\t\t\"id\" \"71\"\n\t\tside\n\t\t{\n\t\t\t\"id\" \"72\"\n\t\t\t\"plane\" \"(0 64 32) (128 64 32) (128 0 32)\"\n\t\t\t\"material\" \"DEV/DEV_MEASUREGENERIC01B\"\n\t\t\t\"uaxis\" \"[1 0 0 0] 0.25\"\n\t\t\t\"vaxis\" \"[0 -1 0 0] 0.25\"\n\t\t\t\"rotation\" \"0\"\n\t\t\t\"lightmapscale\" \"16\"\n\t\t\t\"smoothing_groups\" \"0\"\n\t\t}\n";
        assert!(out.contains(expected_block), "{out}");
        assert!(out.contains("\t\teditor\n\t\t{\n\t\t\t\"color\" \"220 60 60\"\n\t\t\t\"visgroupshown\" \"1\"\n\t\t\t\"visgroupautoshown\" \"1\"\n\t\t}\n\t}\n\tgroup\n"), "inserted after the last world solid, before group: {out}");
        // The new file still parses and the brush is in it.
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert_eq!(reparsed.world.solids.len(), 3);

        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(doc.solid(id).is_none());
        doc.redo().unwrap();
        assert_eq!(doc.to_vmf(), out);
        // The new brush can be moved like any other.
        doc.translate(&[id], Vec3::new(0.0, 0.0, 100.0), true)
            .unwrap();
        assert_eq!(
            doc.solid(id).unwrap().geometry().bounds().unwrap().0.z,
            100.0
        );
    }

    #[test]
    fn delete_removes_blocks_and_undo_puts_them_back_in_place() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // A world solid, an entity solid and a point entity at once.
        let applied = doc.delete(&[2, 61, 50]).unwrap();
        assert_eq!(applied.changed_ids, vec![2, 61, 50]);
        assert!(doc.solid(2).is_none() && doc.solid(61).is_none() && doc.entity(50).is_none());
        let out = doc.to_vmf();
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert_eq!(reparsed.world.solids.len(), 1);
        assert_eq!(reparsed.entities.len(), 2);
        assert!(
            reparsed.entities[0].solids.is_empty(),
            "func_button lost its brush"
        );
        assert!(out.lines().count() < src.lines().count());

        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src, "exact bytes back after undoing a delete");
        assert_eq!(doc.location(2), Some(Location::WorldSolid(0)));
        doc.redo().unwrap();
        assert_eq!(doc.to_vmf(), out);
    }

    #[test]
    fn deleting_a_hidden_entity_works_too() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        doc.delete(&[70]).unwrap();
        let out = doc.to_vmf();
        assert!(!out.contains("\"classname\" \"light\""));
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn create_then_delete_then_undo_both() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let id = doc
            .create_block(Vec3::ZERO, Vec3::splat(16.0), DEFAULT_MATERIAL)
            .unwrap()
            .changed_ids[0];
        doc.delete(&[id]).unwrap();
        assert_eq!(doc.to_vmf(), src);
        doc.undo().unwrap();
        assert!(doc.solid(id).is_some());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(doc
            .create_block(Vec3::ZERO, Vec3::ZERO, DEFAULT_MATERIAL)
            .is_none());
    }
    #[test]
    fn create_entity_appends_after_the_last_entity_and_undo_restores_bytes() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let kvs = vec![
            ("angles".to_string(), "0 0 0".to_string()),
            ("_light".to_string(), "255 255 255 200".to_string()),
            ("origin".to_string(), "ignored".to_string()),
        ];
        let applied = doc
            .create_entity(
                "light",
                Vec3::new(64.0, -32.0, 48.0),
                &kvs,
                Rgb {
                    r: 220,
                    g: 30,
                    b: 220,
                },
            )
            .unwrap();
        assert!(applied.structural);
        assert_eq!(applied.label, "Создать light");
        let id = applied.changed_ids[0];
        let e = doc.entity(id).unwrap();
        assert_eq!(e.classname, "light");
        assert_eq!(e.origin(), Some(Vec3::new(64.0, -32.0, 48.0)));
        assert_eq!(e.keyvalues.last().unwrap().0, "origin");
        assert_eq!(e.keyvalues.len(), 3);

        let out = doc.to_vmf();
        let added: Vec<&str> = out
            .lines()
            .skip_while(|l| !l.contains(&format!("\"id\" \"{id}\"")))
            .take(12)
            .collect();
        assert_eq!(added[1], "\t\"classname\" \"light\"");
        assert_eq!(added[2], "\t\"angles\" \"0 0 0\"");
        assert_eq!(added[4], "\t\"origin\" \"64 -32 48\"");
        assert!(added.iter().any(|l| l.contains("\"logicalpos\" \"[0 0]\"")));
        // The block sits between the hidden entity and `cameras`.
        let pos_new = out.find(&format!("\"id\" \"{id}\"")).unwrap();
        assert!(pos_new > out.find("\"id\" \"70\"").unwrap());
        assert!(pos_new < out.find("cameras").unwrap());
        // entity { id classname angles _light origin editor { 4 keys } } = 15 lines.
        assert_eq!(out.lines().count(), src.lines().count() + 15);

        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(doc.entity(id).is_none());
        doc.redo().unwrap();
        assert_eq!(doc.to_vmf(), out);
        assert!(doc.entity(id).is_some());
    }

    #[test]
    fn entity_keyvalues_set_add_remove_and_rename_class() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let changes = vec![
            ("angles".to_string(), Some("0 180 0".to_string())),
            ("targetname".to_string(), Some("spawn_1".to_string())),
            (
                "classname".to_string(),
                Some("info_player_terrorist".to_string()),
            ),
        ];
        let applied = doc.set_entity_keyvalues(50, &changes).unwrap();
        assert_eq!(applied.label, "Изменить ключи (3)");
        let e = doc.entity(50).unwrap();
        assert_eq!(e.classname, "info_player_terrorist");
        assert_eq!(e.get("targetname"), Some("spawn_1"));
        assert_eq!(e.keyvalues.last().unwrap().0, "origin");
        let out = doc.to_vmf();
        let diff = diff_lines(&src, &out);
        // classname and angles rewritten in place; targetname inserted before origin.
        assert_eq!(out.lines().count(), src.lines().count() + 1);
        assert_eq!(diff[0].1, "\t\"classname\" \"info_player_terrorist\"");
        assert_eq!(diff[1].1, "\t\"angles\" \"0 180 0\"");
        assert!(out.contains(
            "\t\"angles\" \"0 180 0\"\n\t\"targetname\" \"spawn_1\"\n\t\"origin\" \"0 0 -56\""
        ));

        doc.set_entity_keyvalues(50, &[("angles".to_string(), None)])
            .unwrap();
        assert!(doc.entity(50).unwrap().get("angles").is_none());
        assert!(!doc.to_vmf().contains("\"angles\" \"0 180 0\""));
        // No-op changes do not create history.
        assert!(doc
            .set_entity_keyvalues(50, &[("nothing".to_string(), None)])
            .is_none());
        doc.undo().unwrap();
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn connections_are_rewritten_in_the_file_style_and_removed_when_empty() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // The fixture uses comma separators, so new connections do too.
        let mut conns = doc.entity(60).unwrap().connections.clone();
        assert_eq!(conns.len(), 2);
        conns.push(vmf::Connection {
            output: "OnPressed".into(),
            target: "light_1".into(),
            input: "Toggle".into(),
            parameter: "".into(),
            delay: 1.5,
            times_to_fire: 1,
        });
        doc.set_entity_connections(60, conns).unwrap();
        let out = doc.to_vmf();
        assert_eq!(out.lines().count(), src.lines().count() + 1);
        assert!(
            out.contains("\t\t\"OnPressed\" \"light_1,Toggle,,1.5,1\"\n\t}\n\tsolid"),
            "{out}"
        );
        // The original two connections are untouched.
        assert!(out.contains("\"OnPressed\" \"door_1,Open,,0,-1\"\n\t\t\"OnPressed\" \"sound_1,PlaySound,,0.5,-1\"\n\t\t\"OnPressed\" \"light_1"));

        doc.set_entity_connections(60, Vec::new()).unwrap();
        let out = doc.to_vmf();
        assert!(!out.contains("connections\n"));
        assert_eq!(out.lines().count(), src.lines().count() - 5);
        doc.undo().unwrap();
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // A point entity without connections gets a block before `origin`.
        let c = vec![vmf::Connection {
            output: "OnUser1".into(),
            target: "button_1".into(),
            input: "Press".into(),
            parameter: "".into(),
            delay: 0.0,
            times_to_fire: -1,
        }];
        doc.set_entity_connections(50, c).unwrap();
        let out = doc.to_vmf();
        assert!(out.contains("\tconnections\n\t{\n\t\t\"OnUser1\" \"button_1,Press,,0,-1\"\n\t}\n\t\"origin\" \"0 0 -56\""), "{out}");
    }

    #[test]
    fn new_maps_write_esc_connections() {
        let src = "versioninfo\n{\n}\nworld\n{\n\t\"id\" \"1\"\n}\nentity\n{\n\t\"id\" \"5\"\n\t\"classname\" \"logic_relay\"\n\t\"origin\" \"0 0 0\"\n}\n";
        let mut doc = Document::open(src).unwrap();
        doc.set_entity_connections(
            5,
            vec![vmf::Connection {
                output: "OnTrigger".into(),
                target: "a".into(),
                input: "Kill".into(),
                parameter: "".into(),
                delay: 0.0,
                times_to_fire: -1,
            }],
        )
        .unwrap();
        assert!(doc
            .to_vmf()
            .contains("\"OnTrigger\" \"a\u{1b}Kill\u{1b}\u{1b}0\u{1b}-1\""));
        // Reading it back gives the same connection.
        let again = Document::open(&doc.to_vmf()).unwrap();
        assert_eq!(again.entity(5).unwrap().connections[0].input, "Kill");
    }

    #[test]
    fn hiding_wraps_in_hidden_block_and_undo_restores_bytes() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let applied = doc.set_hidden(&[2, 50], true, false).unwrap();
        assert_eq!(applied.label, "Скрыть объекты (2)");
        assert!(doc.is_hidden(2) && doc.is_hidden(50));
        let out = doc.to_vmf();
        // Solid 2 is the first world solid: now wrapped, re-indented, flagged.
        assert!(
            out.contains("world\n{\n\t\"id\" \"1\"\n\t\"mapversion\""),
            "{out}"
        );
        assert!(out.contains("\thidden\n\t{\n\t\tsolid\n\t\t{\n\t\t\t\"id\" \"2\"\n\t\t\tside\n\t\t\t{\n\t\t\t\t\"id\" \"1\""), "{out}");
        assert!(out.contains("\t\t\t\t\"visgroupshown\" \"0\""));
        assert!(
            out.contains("hidden\n{\n\tentity\n\t{\n\t\t\"id\" \"50\""),
            "{out}"
        );
        // Each wrapper adds `hidden`, `{` and `}`.
        assert_eq!(out.lines().count(), src.lines().count() + 6);
        // Re-parsing agrees.
        let again = Document::open(&out).unwrap();
        assert!(again.is_hidden(2) && again.is_hidden(50));
        assert!(!again.solid(2).unwrap().editor.visgroup_shown);

        doc.set_hidden(&[2], false, false).unwrap();
        assert!(!doc.is_hidden(2));
        doc.undo().unwrap();
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(!doc.is_hidden(2));
    }

    #[test]
    fn show_all_unwraps_the_hidden_entity_and_brush_entity_solids_hide_with_the_entity() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        assert!(doc.is_hidden(70));
        doc.show_all().unwrap();
        assert!(!doc.is_hidden(70));
        let out = doc.to_vmf();
        assert!(!out.contains("hidden"));
        assert!(
            out.contains("entity\n{\n\t\"id\" \"70\"\n\t\"classname\" \"light\""),
            "{out}"
        );
        assert_eq!(out.lines().count(), src.lines().count() - 3);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // Hiding solid 61 (inside func_button 60) hides the entity.
        doc.set_hidden(&[61], true, true).unwrap();
        assert!(doc.is_hidden(60) && doc.is_hidden(61));
        let out = doc.to_vmf();
        assert!(
            out.contains("hidden\n{\n\tentity\n\t{\n\t\t\"id\" \"60\""),
            "{out}"
        );
        assert!(out.contains("\"visgroupautoshown\" \"0\""));
        assert!(!doc.solid(61).unwrap().hidden);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn visgroups_create_assign_and_delete() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let applied = doc
            .create_visgroup(
                "Floors",
                Rgb {
                    r: 10,
                    g: 200,
                    b: 30,
                },
                &[2, 50],
            )
            .unwrap();
        let vg = applied.changed_ids[0];
        assert_eq!(vg, 2, "fixture has visgroup 1");
        assert_eq!(doc.visgroups_of(2), &[2]);
        assert_eq!(doc.visgroups_of(50), &[2]);
        let out = doc.to_vmf();
        assert!(out.contains("visgroups\n{\n\tvisgroup\n\t{\n\t\t\"name\" \"Detail\"\n\t\t\"visgroupid\" \"1\"\n\t\t\"color\" \"162 79 240\"\n\t}\n\tvisgroup\n\t{\n\t\t\"name\" \"Floors\"\n\t\t\"visgroupid\" \"2\"\n\t\t\"color\" \"10 200 30\"\n\t}\n}"), "{out}");
        // visgroupid goes right after color in the editor block.
        assert!(
            out.contains(
                "\t\t\"color\" \"0 255 0\"\n\t\t\"visgroupid\" \"2\"\n\t\t\"visgroupshown\""
            ),
            "{out}"
        );
        assert_eq!(out.lines().count(), src.lines().count() + 6 + 2);

        doc.set_visgroup_membership(&[50], vg, false).unwrap();
        assert!(doc.visgroups_of(50).is_empty());
        doc.rename_visgroup(vg, "Ground").unwrap();
        assert!(doc.to_vmf().contains("\"name\" \"Ground\""));
        doc.delete_visgroup(vg).unwrap();
        assert!(doc.visgroups_of(2).is_empty());
        assert!(!doc.to_vmf().contains("Ground"));
        for _ in 0..4 {
            doc.undo().unwrap();
        }
        assert_eq!(doc.to_vmf(), src);
        doc.redo().unwrap();
        assert_eq!(doc.visgroups_of(2), &[2]);
    }

    #[test]
    fn group_and_ungroup() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        assert!(
            doc.group_objects(&[2]).is_none(),
            "one object is not a group"
        );
        let applied = doc.group_objects(&[2, 20, 50]).unwrap();
        let gid = applied.changed_ids[0];
        assert_eq!(doc.group_of(2), Some(gid));
        assert_eq!(doc.group_of(50), Some(gid));
        assert_eq!(doc.group_members(gid), vec![2, 20, 50]);
        let out = doc.to_vmf();
        // The fixture already has group 40; the new one follows it.
        assert!(out.contains(&format!("\t\t\t\"visgroupautoshown\" \"1\"\n\t\t}}\n\t}}\n\tgroup\n\t{{\n\t\t\"id\" \"{gid}\"\n\t\teditor\n\t\t{{\n\t\t\t\"color\" \"220 220 220\"\n\t\t\t\"visgroupshown\" \"1\"\n\t\t\t\"visgroupautoshown\" \"1\"\n\t\t}}\n\t}}\n}}\nentity")), "{out}");
        assert!(out.contains(&format!("\"groupid\" \"{gid}\"")));
        let again = Document::open(&out).unwrap();
        assert_eq!(again.group_of(20), Some(gid));

        doc.ungroup_objects(&[2]).unwrap();
        assert_eq!(doc.group_of(2), None);
        assert_eq!(doc.group_members(gid), vec![20, 50]);
        doc.ungroup_objects(&[20, 50]).unwrap();
        let out = doc.to_vmf();
        assert!(
            !out.contains(&format!("\"id\" \"{gid}\"")),
            "empty group removed"
        );
        assert!(out.contains("\"id\" \"40\""), "other groups stay");
        doc.undo().unwrap();
        doc.undo().unwrap();
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn cordon_is_written_in_the_2013_format_and_replaces_the_old_block() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        assert!(doc.cordon().is_none());
        let a = doc
            .set_cordon(
                Some((Vec3::new(64.0, -32.0, 0.0), Vec3::new(-64.0, 32.0, 128.0))),
                true,
            )
            .unwrap();
        assert_eq!(a.label, "Задать кордон");
        let (c, active) = doc.cordon().unwrap();
        assert!(active);
        assert_eq!(c.mins, Vec3::new(-64.0, -32.0, 0.0));
        let out = doc.to_vmf();
        assert!(out.ends_with("cordons\n{\n\t\"active\" \"1\"\n\tcordon\n\t{\n\t\t\"name\" \"cordon\"\n\t\t\"active\" \"1\"\n\t\tbox\n\t\t{\n\t\t\t\"mins\" \"(-64 -32 0)\"\n\t\t\t\"maxs\" \"(64 32 128)\"\n\t\t}\n\t}\n}\n"), "{out}");
        assert_eq!(
            Document::open(&out).unwrap().cordon().unwrap().0.maxs,
            Vec3::new(64.0, 32.0, 128.0)
        );
        doc.set_cordon(Some((c.mins, c.maxs)), false).unwrap();
        assert!(!doc.cordon().unwrap().1);
        doc.set_cordon(None, false).unwrap();
        assert!(doc.cordon().is_none());
        doc.undo().unwrap();
        doc.undo().unwrap();
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // Pre-2013 single cordon block gets replaced.
        let old = "versioninfo\n{\n}\nworld\n{\n\t\"id\" \"1\"\n}\ncordon\n{\n\t\"mins\" \"(-1 -1 -1)\"\n\t\"maxs\" \"(1 1 1)\"\n\t\"active\" \"1\"\n}\n";
        let mut doc = Document::open(old).unwrap();
        assert!(doc.cordon().unwrap().1);
        doc.set_cordon(Some((Vec3::ZERO, Vec3::splat(16.0))), true)
            .unwrap();
        let out = doc.to_vmf();
        assert!(!out.contains("\ncordon\n"), "{out}");
        assert!(out.contains("\ncordons\n{\n\t\"active\" \"1\""), "{out}");
    }

    #[test]
    fn clipping_splits_a_box_into_two_valid_halves() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // Floor solid 2: x -512..512, y -512..512, z -128..-64. Cut at x = 0.
        let plane = Plane::new(Vec3::X, 0.0);
        let a = doc
            .clip(&[2], plane, ClipKeep::Both, "DEV/DEV_MEASUREWALL01A")
            .unwrap();
        assert!(a.structural);
        assert_eq!(a.label, "Разрезать браш");
        let front = doc.solid(2).unwrap();
        let fg = front.geometry();
        assert!(fg.is_valid(), "{:?}", fg.problems);
        assert_eq!(fg.bounds().unwrap().0, Vec3::new(0.0, -512.0, -128.0));
        assert_eq!(fg.bounds().unwrap().1, Vec3::new(512.0, 512.0, -64.0));
        assert_eq!(
            front.sides.len(),
            6,
            "the old -x side was dropped, the cut face added"
        );
        let cut = front.sides.last().unwrap();
        assert_eq!(cut.material, "DEV/DEV_MEASUREWALL01A");
        assert_eq!(cut.plane.unwrap().normal, -Vec3::X);
        assert!(cut.id > 70, "fresh side id");
        // The other half sits right after the original, with new ids.
        let new_id = a.changed_ids[1];
        assert_eq!(doc.location(new_id), Some(Location::WorldSolid(1)));
        let back = doc.solid(new_id).unwrap();
        let bg = back.geometry();
        assert!(bg.is_valid(), "{:?}", bg.problems);
        assert_eq!(bg.bounds().unwrap().0, Vec3::new(-512.0, -512.0, -128.0));
        assert_eq!(bg.bounds().unwrap().1, Vec3::new(0.0, 512.0, -64.0));
        assert!(back.sides.iter().all(|s| s.id > 70));
        assert_eq!(back.editor.color, front.editor.color);
        // File re-parses with both halves in order.
        let out = doc.to_vmf();
        let again = Document::open(&out).unwrap();
        assert_eq!(again.map().world.solids[1].id, new_id);
        assert!(again.solid(new_id).unwrap().geometry().is_valid());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // Keeping only the back half modifies in place.
        doc.clip(&[2], plane, ClipKeep::Back, DEFAULT_MATERIAL)
            .unwrap();
        let g = doc.solid(2).unwrap().geometry();
        assert_eq!(g.bounds().unwrap().1.x, 0.0);
        assert_eq!(doc.map().world.solids.len(), 2, "no brush added");
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // A plane that misses the brush does nothing.
        assert!(doc
            .clip(
                &[2],
                Plane::new(Vec3::X, 1000.0),
                ClipKeep::Both,
                DEFAULT_MATERIAL
            )
            .is_none());
    }

    #[test]
    fn hollow_turns_a_box_into_six_walls() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // Floor solid 2: 1024 x 1024 x 64.
        let a = doc.hollow(&[2], 16.0).unwrap();
        assert_eq!(a.label, "Сделать полым");
        assert!(a.structural);
        let ids: Vec<u32> = a.changed_ids.clone();
        assert_eq!(ids.len(), 6, "{ids:?}");
        assert_eq!(ids[0], 2, "the first wall keeps the id");
        let mut total = 0.0;
        for &id in &ids {
            let g = doc.solid(id).unwrap().geometry();
            assert!(g.is_valid(), "{id}: {:?}", g.problems);
            total += g.volume();
        }
        // Outer volume minus the inner 992 x 992 x 32 cavity.
        let expected = 1024.0 * 1024.0 * 64.0 - 992.0 * 992.0 * 32.0;
        assert!((total - expected).abs() < 1.0, "{total} vs {expected}");
        // The walls follow the original in the file.
        let world = &doc.map().world.solids;
        assert_eq!(world[0].id, 2);
        assert_eq!(world[1].id, ids[1]);
        assert_eq!(world[5].id, ids[5]);
        assert_eq!(world[6].id, 20);
        // Side ids are unique across the map.
        let mut side_ids: Vec<u32> = doc
            .map()
            .solids()
            .flat_map(|s| s.sides.iter().map(|f| f.id))
            .collect();
        let n = side_ids.len();
        side_ids.sort_unstable();
        side_ids.dedup();
        assert_eq!(side_ids.len(), n);
        let again = Document::open(&doc.to_vmf()).unwrap();
        // Two world solids before, the floor became six walls.
        assert_eq!(again.map().world.solids.len(), 7);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        // Walls thicker than the brush cannot be made.
        assert!(doc.hollow(&[2], 40.0).is_none());
    }

    #[test]
    fn carve_cuts_a_hole_and_swallows_a_contained_brush() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // A carver through the floor (solid 2, z -128..-64): 64 x 64 column.
        let carver = doc
            .create_block(
                Vec3::new(-32.0, -32.0, -256.0),
                Vec3::new(32.0, 32.0, 0.0),
                DEFAULT_MATERIAL,
            )
            .unwrap()
            .changed_ids[0];
        let a = doc.carve(&[carver]).unwrap();
        assert_eq!(a.label, "Вырезать выделением");
        assert!(doc.solid(carver).is_some(), "the carver stays");
        let world = &doc.map().world.solids;
        // Four pieces around the hole: the first keeps id 2.
        let pieces: Vec<&Solid> = world
            .iter()
            .filter(|s| s.id == 2 || a.changed_ids.contains(&s.id))
            .collect();
        let around: Vec<&Solid> = pieces.into_iter().filter(|s| s.id != carver).collect();
        assert_eq!(around.len(), 4, "{:?}", a.changed_ids);
        let mut total = 0.0;
        for s in &around {
            let g = s.geometry();
            assert!(g.is_valid(), "{}: {:?}", s.id, g.problems);
            total += g.volume();
            // Cut faces take the carver's material.
            assert!(s.sides.iter().any(|f| f.material == DEFAULT_MATERIAL));
        }
        let expected = 1024.0 * 1024.0 * 64.0 - 64.0 * 64.0 * 64.0;
        assert!((total - expected).abs() < 1.0, "{total} vs {expected}");
        doc.undo().unwrap();
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // A carver that swallows the floor removes it.
        let big = doc
            .create_block(
                Vec3::splat(-2000.0),
                Vec3::new(2000.0, 2000.0, -50.0),
                DEFAULT_MATERIAL,
            )
            .unwrap()
            .changed_ids[0];
        doc.carve(&[big]).unwrap();
        assert!(doc.solid(2).is_none());
        assert!(doc.solid(big).is_some());
        doc.undo().unwrap();
        assert!(doc.solid(2).is_some());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn moving_vertices_reshapes_a_box_and_refuses_bent_faces() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // Floor solid 2: raise the whole +x top edge by 32: a wedge-topped slab.
        let moves = vec![
            (
                Vec3::new(512.0, 512.0, -64.0),
                Vec3::new(512.0, 512.0, -32.0),
            ),
            (
                Vec3::new(512.0, -512.0, -64.0),
                Vec3::new(512.0, -512.0, -32.0),
            ),
        ];
        let a = doc.move_vertices(&[2], &moves).unwrap();
        assert_eq!(a.label, "Переместить вершины");
        let s = doc.solid(2).unwrap();
        let g = s.geometry();
        assert!(g.is_valid(), "{:?}", g.problems);
        assert_eq!(s.sides.len(), 6);
        let (lo, hi) = g.bounds().unwrap();
        assert!((hi.z + 32.0).abs() < 1.0e-6, "{hi}");
        assert!(
            (lo - Vec3::new(-512.0, -512.0, -128.0)).length() < 1.0e-6,
            "{lo}"
        );
        // The top face is now tilted.
        let top = s.sides[0].plane.unwrap();
        assert!(top.normal.x < -0.01 && top.normal.z > 0.9, "{top:?}");
        assert!(doc.to_vmf().contains("\"plane\" \"("));
        let again = Document::open(&doc.to_vmf()).unwrap();
        assert!(again.solid(2).unwrap().geometry().is_valid());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // Moving one corner of the top face up bends it: refused, untouched.
        let bent = vec![(Vec3::new(512.0, 512.0, -64.0), Vec3::new(512.0, 512.0, 0.0))];
        let err = doc.move_vertices(&[2], &bent).unwrap_err();
        assert!(err.contains("плоской"), "{err}");
        assert_eq!(doc.to_vmf(), src);
        assert!(!doc.can_undo());

        // Collapsing the top edge of a side turns the box into a wedge.
        let collapse = vec![
            (
                Vec3::new(512.0, 512.0, -64.0),
                Vec3::new(512.0, 512.0, -128.0),
            ),
            (
                Vec3::new(512.0, -512.0, -64.0),
                Vec3::new(512.0, -512.0, -128.0),
            ),
        ];
        doc.move_vertices(&[2], &collapse).unwrap();
        let s = doc.solid(2).unwrap();
        assert_eq!(s.sides.len(), 5, "the +x side collapsed away");
        assert!(s.geometry().is_valid());
        let vol = s.geometry().volume();
        assert!((vol - 1024.0 * 1024.0 * 64.0 / 2.0).abs() < 1.0, "{vol}");
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn primitives_create_valid_brushes_and_undo_removes_them() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let a = doc
            .create_primitive(
                Primitive::Cylinder { sides: 8 },
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(128.0, 128.0, 64.0),
                2,
                DEFAULT_MATERIAL,
            )
            .unwrap();
        assert_eq!(a.label, "Создать цилиндр");
        assert_eq!(a.changed_ids.len(), 1);
        let cyl = doc.solid(a.changed_ids[0]).unwrap();
        assert_eq!(cyl.sides.len(), 10);
        assert!(cyl.geometry().is_valid());
        assert!(cyl
            .sides
            .iter()
            .all(|s| s.uaxis.scale == 0.25 && s.lightmap_scale == 16));

        let a = doc
            .create_primitive(
                Primitive::Arch {
                    sides: 4,
                    wall: 16.0,
                    arc: 180.0,
                    start: 0.0,
                    add_height: 0.0,
                },
                Vec3::new(-256.0, -256.0, 0.0),
                Vec3::new(0.0, 0.0, 32.0),
                2,
                "TOOLS/TOOLSNODRAW",
            )
            .unwrap();
        assert_eq!(a.changed_ids.len(), 4, "one brush per arch segment");
        for id in &a.changed_ids {
            let s = doc.solid(*id).unwrap();
            assert_eq!(s.sides.len(), 6);
            assert!(s.geometry().is_valid(), "{:?}", s.geometry().problems);
            assert_eq!(s.sides[0].material, "TOOLS/TOOLSNODRAW");
        }
        let out = doc.to_vmf();
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert_eq!(reparsed.world.solids.len(), 2 + 1 + 4);
        assert_eq!(
            reparsed
                .solids()
                .filter(|s| !s.geometry().is_valid())
                .count(),
            0
        );

        // A sphere on the Y axis and a wedge in the Side view are fine too.
        assert!(doc
            .create_primitive(
                Primitive::Sphere { sides: 6 },
                Vec3::ZERO,
                Vec3::splat(64.0),
                1,
                DEFAULT_MATERIAL
            )
            .is_some());
        assert!(doc
            .create_primitive(
                Primitive::Wedge,
                Vec3::ZERO,
                Vec3::new(32.0, 64.0, 96.0),
                0,
                DEFAULT_MATERIAL
            )
            .is_some());
        // Too thin a box or an impossible arch creates nothing.
        assert!(doc
            .create_primitive(
                Primitive::Cylinder { sides: 8 },
                Vec3::ZERO,
                Vec3::new(64.0, 64.0, 0.5),
                2,
                DEFAULT_MATERIAL
            )
            .is_none());

        for _ in 0..4 {
            doc.undo().unwrap();
        }
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn tie_to_entity_makes_a_brush_entity_and_move_to_world_undoes_it() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let defaults = vec![("rendermode".to_string(), "0".to_string())];
        let a = doc
            .tie_to_entity(
                &[2, 20],
                "func_detail",
                &defaults,
                Rgb {
                    r: 220,
                    g: 30,
                    b: 220,
                },
            )
            .unwrap();
        assert_eq!(a.label, "Привязать к func_detail");
        let eid = a.changed_ids[0];
        assert_eq!(eid, 71);
        assert_eq!(&a.changed_ids[1..], &[2, 20]);
        let e = doc.entity(eid).unwrap();
        assert_eq!(e.classname, "func_detail");
        assert_eq!(
            e.solids.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![2, 20]
        );
        assert_eq!(e.get("rendermode"), Some("0"));
        assert_eq!(
            e.get("origin"),
            Some("0 0 -64"),
            "centre of the common bounds"
        );
        assert_eq!(doc.map().world.solids.len(), 0);
        assert_eq!(
            doc.location(2),
            Some(Location::EntitySolid {
                entity: 3,
                solid: 0
            })
        );
        let tied = doc.to_vmf();
        let reparsed = vmf::Map::parse(&tied).unwrap();
        assert_eq!(reparsed.world.solids.len(), 0);
        let e = reparsed.entity_by_id(71).unwrap();
        assert_eq!(e.solids.len(), 2);
        assert!(e.solids.iter().all(|s| s.geometry().is_valid()));
        // The new entity sits after the last entity block, before `cameras`.
        assert!(tied.contains("\t\t\t\"logicalpos\" \"[0 1500]\"\n\t\t}\n\t}\n}\nentity\n{\n\t\"id\" \"71\"\n\t\"classname\" \"func_detail\"\n\t\"rendermode\" \"0\"\n\t\"origin\" \"0 0 -64\"\n\tsolid\n\t{\n\t\t\"id\" \"2\"\n"), "{tied}");

        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert_eq!(doc.location(2), Some(Location::WorldSolid(0)));
        doc.redo().unwrap();
        assert_eq!(doc.to_vmf(), tied);

        let a = doc.move_to_world(&[20]).unwrap();
        assert_eq!(a.label, "В мир: 2 брашей");
        assert_eq!(a.changed_ids, vec![71, 2, 20]);
        assert!(doc.entity(71).is_none());
        assert_eq!(doc.map().world.solids.len(), 2);
        let out = doc.to_vmf();
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert_eq!(reparsed.world.solids.len(), 2);
        assert_eq!(reparsed.entities.len(), 3);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), tied);
    }

    #[test]
    fn moving_each_brush_by_the_same_step_carries_the_origin() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let eid = doc
            .tie_to_entity(&[2, 20], "func_rotating", &[], Rgb::default())
            .unwrap()
            .changed_ids[0];
        let origin = |doc: &Document| doc.entity(eid).unwrap().get("origin").map(str::to_string);
        let step = Vec3::new(0.0, 8.0, 0.0);
        doc.translate_each(&[(2, step), (20, step)], false).unwrap();
        assert_eq!(origin(&doc).as_deref(), Some("0 8 -64"));
        // Brushes snapped by different steps: the origin stays.
        doc.translate_each(&[(2, step), (20, Vec3::new(4.0, 0.0, 0.0))], false)
            .unwrap();
        assert_eq!(origin(&doc).as_deref(), Some("0 8 -64"));
    }

    #[test]
    fn moving_a_whole_brush_entity_carries_its_origin() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let eid = doc
            .tie_to_entity(&[2, 20], "func_rotating", &[], Rgb::default())
            .unwrap()
            .changed_ids[0];
        let origin = |doc: &Document| doc.entity(eid).unwrap().get("origin").map(str::to_string);
        assert_eq!(origin(&doc).as_deref(), Some("0 0 -64"));
        // Both brushes: the axis goes along, in the same undo step.
        doc.translate(&[2, 20], Vec3::new(16.0, 0.0, 0.0), false)
            .unwrap();
        assert_eq!(origin(&doc).as_deref(), Some("16 0 -64"));
        // One brush of two: the axis stays.
        doc.translate(&[2], Vec3::new(0.0, 32.0, 0.0), false)
            .unwrap();
        assert_eq!(origin(&doc).as_deref(), Some("16 0 -64"));
        // A turn about another point turns the axis with the brushes.
        doc.rotate(
            &[2, 20],
            Vec3::new(16.0, 32.0, -64.0),
            Vec3::Z,
            90.0,
            TextureLock::default(),
        )
        .unwrap();
        assert_eq!(origin(&doc).as_deref(), Some("48 32 -64"));
        for _ in 0..3 {
            doc.undo().unwrap();
        }
        assert_eq!(origin(&doc).as_deref(), Some("0 0 -64"));
    }

    #[test]
    fn tie_to_entity_joins_the_selected_brush_entity() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let a = doc
            .tie_to_entity(&[2, 60], "func_detail", &[], Rgb::default())
            .unwrap();
        assert_eq!(a.label, "Привязать к func_button");
        assert_eq!(a.changed_ids, vec![60, 2]);
        let e = doc.entity(60).unwrap();
        assert_eq!(
            e.solids.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![61, 2]
        );
        assert_eq!(e.connections.len(), 2, "the entity keeps its outputs");
        let out = doc.to_vmf();
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert_eq!(reparsed.entity_by_id(60).unwrap().solids.len(), 2);
        assert_eq!(reparsed.entity_by_id(60).unwrap().connections.len(), 2);
        // Nothing to tie: a lone point entity or an empty selection.
        assert!(doc
            .tie_to_entity(&[50], "func_detail", &[], Rgb::default())
            .is_none());
        assert!(doc.move_to_world(&[50]).is_none());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        doc.redo().unwrap();
        assert_eq!(doc.to_vmf(), out);
        assert_eq!(doc.entity(60).unwrap().solids.len(), 2);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn face_edits_change_only_the_touched_keys() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // Floor of solid 2: side 1, 1024 × 1024 at z = -64.
        let info = doc.face_info(2, 1).unwrap();
        assert_eq!(info.uaxis.axis, Vec3::X);
        assert_eq!(info.rotation, 0.0);
        let fit = FaceEdit {
            justify: Some(Justify::Fit),
            tex_size: [512.0, 256.0],
            ..FaceEdit::default()
        };
        let a = doc.edit_faces(&[(2, 1)], &fit).unwrap();
        assert_eq!(a.label, "Изменить текстуру грани");
        let info = doc.face_info(2, 1).unwrap();
        assert_eq!(info.uaxis.scale, 2.0, "1024 units over 512 texels");
        assert_eq!(info.vaxis.scale, 4.0);
        // Texel 0 lands on the face's min corner along each axis.
        assert_eq!(info.uaxis.texel(Vec3::new(-512.0, 512.0, -64.0)), 0.0);
        assert_eq!(info.vaxis.texel(Vec3::new(-512.0, 512.0, -64.0)), 0.0);
        let out = doc.to_vmf();
        let diff = diff_lines(&src, &out);
        assert_eq!(diff.len(), 2, "{diff:?}");
        assert!(diff.iter().all(|(a, _)| a.contains("axis")));

        let rotate = FaceEdit {
            rotation: Some(90.0),
            lightmap_scale: Some(32),
            smoothing_groups: Some(3),
            ..FaceEdit::default()
        };
        doc.edit_faces(&[(2, 1)], &rotate).unwrap();
        let info = doc.face_info(2, 1).unwrap();
        assert_eq!(info.uaxis.axis, Vec3::Y);
        assert_eq!(info.vaxis.axis, Vec3::X);
        assert_eq!(info.rotation, 90.0);
        assert_eq!(info.lightmap_scale, 32);
        let out = doc.to_vmf();
        assert!(out.contains("\t\t\t\"rotation\" \"90\"\n\t\t\t\"lightmapscale\" \"32\"\n\t\t\t\"smoothing_groups\" \"3\"\n"));
        assert_eq!(diff_lines(&src, &out).len(), 5);

        // Justify right puts the texture's right edge on the face's max edge.
        let right = FaceEdit {
            justify: Some(Justify::Right),
            tex_size: [1024.0, 1024.0],
            ..FaceEdit::default()
        };
        doc.edit_faces(&[(2, 1)], &right).unwrap();
        let info = doc.face_info(2, 1).unwrap();
        let max_u = [
            Vec3::new(-512.0, -512.0, -64.0),
            Vec3::new(512.0, 512.0, -64.0),
        ]
        .iter()
        .map(|p| info.uaxis.texel(*p))
        .fold(f64::MIN, f64::max);
        assert!((max_u - 1024.0).abs() < 1.0e-6, "{max_u}");
        doc.edit_faces(
            &[(2, 1)],
            &FaceEdit {
                align: Some(Align::World),
                ..FaceEdit::default()
            },
        )
        .unwrap();
        let info = doc.face_info(2, 1).unwrap();
        assert_eq!((info.uaxis.axis, info.vaxis.axis), (Vec3::X, -Vec3::Y));
        assert_eq!(info.uaxis.shift, 0.0);

        // No-op edits do not make history.
        assert!(doc.edit_faces(&[(2, 1)], &FaceEdit::default()).is_none());
        assert!(doc.edit_faces(&[(999, 1)], &rotate).is_none());
        for _ in 0..4 {
            doc.undo().unwrap();
        }
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn check_for_problems_reports_bad_targets_and_duplicate_ids() {
        let src = fixture();
        let doc = Document::open(&src).unwrap();
        let problems = doc.problems();
        let kinds: Vec<ProblemKind> = problems.iter().map(|p| p.kind).collect();
        assert_eq!(
            kinds,
            vec![ProblemKind::BadTarget, ProblemKind::BadTarget],
            "{problems:?}"
        );
        assert!(problems[0].message.contains("door_1"));
        assert_eq!(problems[0].object, 60);

        let broken = src.replacen("\"id\" \"20\"", "\"id\" \"2\"", 1);
        let doc = Document::open(&broken).unwrap();
        let problems = doc.problems();
        assert!(
            problems
                .iter()
                .any(|p| p.kind == ProblemKind::DuplicateId && p.object == 2),
            "{problems:?}"
        );

        // A brush pushed past the map extent is reported too.
        let mut doc = Document::open(&src).unwrap();
        doc.translate(&[20], Vec3::new(20000.0, 0.0, 0.0), false)
            .unwrap();
        assert!(doc
            .problems()
            .iter()
            .any(|p| p.kind == ProblemKind::OutsideWorld && p.object == 20));
    }

    #[test]
    fn fix_problem_repairs_each_kind_and_undoes() {
        let src = fixture();
        // Bad targets: the button's connections to door_1 and sound_1 are dropped.
        let mut doc = Document::open(&src).unwrap();
        let a = doc.fix_problem(ProblemKind::BadTarget, 60, "").unwrap();
        assert!(a.changed_ids.contains(&60));
        assert!(doc.entity(60).unwrap().connections.is_empty());
        assert!(doc.problems().is_empty(), "{:?}", doc.problems());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // Duplicate ids: the second object with id 2 gets a fresh id.
        let broken = src.replacen("\"id\" \"20\"", "\"id\" \"2\"", 1);
        let mut doc = Document::open(&broken).unwrap();
        let before = doc.map().world.solids.len();
        let a = doc.fix_problem(ProblemKind::DuplicateId, 2, "").unwrap();
        assert_eq!(a.label, "Перенумеровать объект");
        assert_eq!(doc.map().world.solids.len(), before);
        assert!(!doc
            .problems()
            .iter()
            .any(|p| p.kind == ProblemKind::DuplicateId));
        let ids: Vec<u32> = doc.map().world.solids.iter().map(|s| s.id).collect();
        assert_eq!(ids.iter().filter(|&&i| i == 2).count(), 1);
        assert!(vmf::Map::parse(&doc.to_vmf()).is_ok());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), broken);

        // Empty material and zero scale on a face of brush 20.
        let broken = src.replacen(
            "\"material\" \"DEV/DEV_MEASUREWALL01A\"",
            "\"material\" \"\"",
            1,
        );
        let mut doc = Document::open(&broken).unwrap();
        assert!(doc
            .problems()
            .iter()
            .any(|p| p.kind == ProblemKind::EmptyMaterial && p.object == 20));
        doc.fix_problem(ProblemKind::EmptyMaterial, 20, "DEV/DEV_MEASUREGENERIC01B")
            .unwrap();
        assert_eq!(
            doc.solid(20).unwrap().sides[0].material,
            "DEV/DEV_MEASUREGENERIC01B"
        );
        assert!(!doc
            .problems()
            .iter()
            .any(|p| p.kind == ProblemKind::EmptyMaterial));
        let zero = broken.replacen(
            "\"uaxis\" \"[1 0 0 0] 0.25\"",
            "\"uaxis\" \"[1 0 0 0] 0\"",
            1,
        );
        let mut doc = Document::open(&zero).unwrap();
        assert!(doc
            .problems()
            .iter()
            .any(|p| p.kind == ProblemKind::ZeroTextureScale));
        doc.fix_problem(ProblemKind::ZeroTextureScale, 2, "")
            .unwrap();
        assert_eq!(doc.solid(2).unwrap().sides[0].uaxis.scale, 0.25);
        assert!(!doc
            .problems()
            .iter()
            .any(|p| p.kind == ProblemKind::ZeroTextureScale));

        // Missing origin and an invalid brush.
        let mut doc = Document::open(&src).unwrap();
        doc.set_entity_keyvalues(50, &[("origin".to_string(), None)])
            .unwrap();
        assert!(doc
            .problems()
            .iter()
            .any(|p| p.kind == ProblemKind::NoOrigin && p.object == 50));
        doc.fix_problem(ProblemKind::NoOrigin, 50, "").unwrap();
        assert_eq!(doc.entity(50).unwrap().get("origin"), Some("0 0 0"));
        assert!(doc.fix_problem(ProblemKind::InvalidSolid, 20, "").is_some());
        assert!(doc.solid(20).is_none());
        assert!(doc.fix_problem(ProblemKind::TooManySides, 2, "").is_none());
        assert_eq!(
            ProblemKind::from_name("bad_target"),
            Some(ProblemKind::BadTarget)
        );
    }

    #[test]
    fn treat_as_one_fits_one_texture_across_several_faces() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // Floor top (x -512..512) and the small block's top (x -64..64), both world-aligned.
        let fit = FaceEdit {
            justify: Some(Justify::Fit),
            tex_size: [1024.0, 1024.0],
            treat_as_one: true,
            ..FaceEdit::default()
        };
        doc.edit_faces(&[(2, 1), (20, 21)], &fit).unwrap();
        let small = doc.face_info(20, 21).unwrap();
        assert!(
            (small.uaxis.scale - 1.0).abs() < 1e-9,
            "{}",
            small.uaxis.scale
        );
        // Texel 0 sits on the floor's left edge for both faces: the texture is continuous.
        let floor = doc.face_info(2, 1).unwrap();
        let p = Vec3::new(-512.0, 0.0, 0.0);
        assert!(small.uaxis.texel(p).rem_euclid(1024.0).abs() < 1e-6);
        assert!(floor.uaxis.texel(p).rem_euclid(1024.0).abs() < 1e-6);
        // Without it, the small face gets its own fit.
        doc.undo().unwrap();
        doc.edit_faces(
            &[(2, 1), (20, 21)],
            &FaceEdit {
                treat_as_one: false,
                ..fit
            },
        )
        .unwrap();
        assert!((doc.face_info(20, 21).unwrap().uaxis.scale - 0.125).abs() < 1e-9);
    }

    #[test]
    fn clone_copies_objects_with_fresh_ids_and_paste_round_trips_through_text() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let a = doc
            .clone_objects(&[2, 50], Vec3::new(0.0, 0.0, 256.0))
            .unwrap();
        assert_eq!(a.label, "Клонировать объекты (2)");
        assert_eq!(a.changed_ids.len(), 2);
        let (s, e) = (a.changed_ids[0], a.changed_ids[1]);
        assert_eq!(
            s, 71,
            "the solid takes the next id, its sides the ones after"
        );
        let solid = doc.solid(s).unwrap();
        assert_eq!(solid.sides[0].id, 72);
        assert_eq!(solid.geometry().bounds().unwrap().1.z, -64.0 + 256.0);
        assert_eq!(solid.sides[0].material, "DEV/DEV_MEASUREGENERIC01B");
        let ent = doc.entity(e).unwrap();
        assert_eq!(ent.classname, "info_player_start");
        assert_eq!(ent.get("origin"), Some("0 0 200"));
        assert_eq!(ent.get("angles"), Some("0 90 0"));
        let out = doc.to_vmf();
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert_eq!(reparsed.world.solids.len(), 3);
        assert_eq!(reparsed.entities.len(), 4);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);

        // Copying a brush entity by its brush takes the whole entity, outputs included.
        let text = doc.export_objects(&[20, 61]);
        let snippet = vmf::Map::parse(&text).unwrap();
        assert_eq!(snippet.world.solids.len(), 1);
        assert_eq!(snippet.entities.len(), 1);
        assert_eq!(snippet.entities[0].classname, "func_button");
        assert_eq!(snippet.entities[0].connections.len(), 2);
        assert_eq!(snippet.entities[0].solids.len(), 1);

        let a = doc.paste_vmf(&text, Vec3::new(64.0, 0.0, 0.0)).unwrap();
        assert_eq!(a.label, "Вставить объекты (2)");
        let pasted = doc.entity(a.changed_ids[1]).unwrap();
        assert_eq!(pasted.connections.len(), 2);
        assert_eq!(pasted.solids.len(), 1);
        assert_ne!(pasted.solids[0].id, 61);
        assert_eq!(
            pasted.solids[0].geometry().bounds().unwrap().0.x,
            96.0 + 64.0
        );
        // The pasted brush keeps visgroup 1 ("Detail"), which exists here.
        assert_eq!(
            doc.solid(a.changed_ids[0]).unwrap().editor.visgroup_ids,
            vec![1]
        );
        let out = doc.to_vmf();
        // The fixture uses comma connections, so the copy does too.
        assert_eq!(
            out.matches(
                "		\"OnPressed\" \"door_1,Open,,0,-1\"
"
            )
            .count(),
            2,
            "{out}"
        );
        assert_eq!(vmf::Map::parse(&out).unwrap().entities.len(), 4);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(doc.paste_vmf("not a vmf", Vec3::ZERO).is_none());
        assert!(doc.clone_objects(&[999], Vec3::ZERO).is_none());
    }

    #[test]
    fn displacements_are_created_painted_written_and_destroyed() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // The floor top (solid 2, side 1) and the button top (61, 62) become
        // power-2 displacements; the already displaced side 21 is skipped.
        let a = doc
            .create_displacements(&[(2, 1), (61, 62), (20, 21)], 2)
            .unwrap();
        assert_eq!(a.label, "Создать дисплейсмент");
        assert_eq!(a.changed_ids, vec![2, 61]);
        let disp = doc.solid(2).unwrap().sides[0].dispinfo.clone().unwrap();
        assert_eq!(disp.power, 2);
        assert_eq!(disp.start_position, Vec3::new(-512.0, -512.0, -64.0));
        assert_eq!(disp.distances, vec![vec![0.0; 5]; 5]);
        let out = doc.to_vmf();
        let block = "\t\t\t\"smoothing_groups\" \"0\"\n\t\t\tdispinfo\n\t\t\t{\n\t\t\t\t\"power\" \"2\"\n\t\t\t\t\"startposition\" \"[-512 -512 -64]\"\n\t\t\t\t\"flags\" \"0\"\n\t\t\t\t\"elevation\" \"0\"\n\t\t\t\t\"subdiv\" \"0\"\n\t\t\t\tnormals\n\t\t\t\t{\n\t\t\t\t\t\"row0\" \"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\"\n";
        assert!(out.contains(block), "{out}");
        assert!(
            out.contains(
                "\t\t\t\ttriangle_tags\n\t\t\t\t{\n\t\t\t\t\t\"row0\" \"9 9 9 9 9 9 9 9\"\n"
            ),
            "{out}"
        );
        assert!(out.contains("\t\t\t\tallowed_verts\n\t\t\t\t{\n\t\t\t\t\t\"10\" \"-1 -1 -1 -1 -1 -1 -1 -1 -1 -1\"\n"), "{out}");
        let reparsed = vmf::Map::parse(&out).unwrap();
        let side = &reparsed.world.solids[0].sides[0];
        assert_eq!(
            side.dispinfo.as_ref().unwrap().offset_normals[0][0],
            Vec3::Z
        );
        assert_eq!(
            reparsed
                .solids()
                .flat_map(|s| &s.sides)
                .filter(|s| s.dispinfo.is_some())
                .count(),
            3
        );

        // Sculpt the floor's middle up by 32 in two strokes that merge into one undo step.
        let centre = Vec3::new(0.0, 0.0, -64.0);
        doc.paint_displacement(2, 1, centre, 300.0, 24.0, PaintAxis::FaceNormal, false)
            .unwrap();
        let a = doc
            .paint_displacement(2, 1, centre, 300.0, 8.0, PaintAxis::FaceNormal, true)
            .unwrap();
        assert_eq!(a.label, "Изменить рельеф дисплейсмента");
        let grid = doc.displacement_grid(2, 1);
        assert_eq!(grid.len(), 25);
        assert_eq!(grid[12], Vec3::new(0.0, 0.0, -32.0));
        assert_eq!(grid[0].z, -64.0);
        let out = doc.to_vmf();
        let reparsed = vmf::Map::parse(&out).unwrap();
        let d = reparsed.world.solids[0].sides[0].dispinfo.as_ref().unwrap();
        assert_eq!(d.distances[2][2], 32.0);
        assert_eq!(d.normals[2][2], Vec3::Z);
        assert_eq!(d.distances[0][0], 0.0);

        doc.undo().unwrap();
        assert_eq!(
            doc.displacement_grid(2, 1)[12].z,
            -64.0,
            "both strokes undone together"
        );
        assert_eq!(doc.undo_label(), Some("Создать дисплейсмент"));
        doc.redo().unwrap();
        assert_eq!(doc.displacement_grid(2, 1)[12].z, -32.0);

        // Destroy on one face; the other keeps its displacement. Then undo everything.
        let a = doc.remove_displacements(&[(2, 1)]).unwrap();
        assert_eq!(a.label, "Удалить дисплейсмент");
        assert!(doc.solid(2).unwrap().sides[0].dispinfo.is_none());
        assert!(doc.displacement_grid(2, 1).is_empty());
        let out = doc.to_vmf();
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert!(reparsed.world.solids[0].sides[0].dispinfo.is_none());
        assert!(reparsed.entities[1].solids[0].sides[0].dispinfo.is_some());
        for _ in 0..3 {
            doc.undo().unwrap();
        }
        assert_eq!(doc.to_vmf(), src);
        assert!(doc.remove_displacements(&[(2, 1)]).is_none());
        assert!(doc
            .paint_displacement(2, 1, Vec3::ZERO, 10.0, 1.0, PaintAxis::Up, false)
            .is_none());
    }

    #[test]
    fn alpha_strokes_merge_and_write_the_alphas_rows() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let centre = Vec3::new(0.0, 0.0, 16.0);
        doc.paint_alpha(20, 21, centre, 40.0, 255.0, false).unwrap();
        let a = doc.paint_alpha(20, 21, centre, 40.0, 100.0, true).unwrap();
        assert_eq!(a.label, "Изменить альфу дисплейсмента");
        let alphas = doc.displacement_alphas(20, 21);
        assert_eq!(alphas.len(), 25);
        assert_eq!(alphas[12], 100.0);
        let out = doc.to_vmf();
        let diff = diff_lines(&src, &out);
        assert!(diff.iter().all(|(a, _)| a.contains("\"row")), "{diff:?}");
        assert!(
            out.contains("\t\t\t\t\t\"row2\" \"0 128 100 128 0\"\n")
                || out.contains("\"row2\" \"0 "),
            "{out}"
        );
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src, "both strokes undo together");
    }

    #[test]
    fn sewing_two_brush_displacements_joins_their_shared_edge() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // A second block right of solid 20 (x -64..64, z -16..0), top at z = 0.
        let a = doc
            .create_block(
                Vec3::new(64.0, -64.0, -16.0),
                Vec3::new(192.0, 64.0, 0.0),
                DEFAULT_MATERIAL,
            )
            .unwrap();
        let id = a.changed_ids[0];
        let top = doc.solid(id).unwrap().sides[0].id;
        doc.create_displacements(&[(id, top)], 3).unwrap();
        // Lift the new face's left edge so the two surfaces disagree along x = 64.
        let centre = Vec3::new(64.0, 0.0, 0.0);
        doc.paint_displacement(id, top, centre, 80.0, 40.0, PaintAxis::Up, false)
            .unwrap();
        let before_a = doc.displacement_grid(20, 21);
        let before_b = doc.displacement_grid(id, top);
        assert!(before_b
            .iter()
            .any(|p| (p.x - 64.0).abs() < 1e-6 && p.z > 1.0));
        let applied = doc.sew_displacements(&[20, id]).unwrap();
        assert_eq!(applied.label, "Сшить дисплейсменты (рёбер: 1)");
        let ga = doc.displacement_grid(20, 21);
        let gb = doc.displacement_grid(id, top);
        for pa in ga.iter().filter(|p| (p.x - 64.0).abs() < 1e-6) {
            let pb = gb
                .iter()
                .find(|p| (p.x - 64.0).abs() < 1e-6 && (p.y - pa.y).abs() < 1e-6)
                .expect("matching vertex on the other side");
            assert!((pa.z - pb.z).abs() < 1e-6, "{pa} vs {pb}");
        }
        assert_ne!(ga, before_a);
        assert_ne!(gb, before_b);
        assert!(vmf::Map::parse(&doc.to_vmf()).is_ok());
        doc.undo().unwrap();
        assert_eq!(doc.displacement_grid(20, 21), before_a);
        assert!(
            doc.sew_displacements(&[20]).is_none(),
            "one face has nothing to sew to"
        );
    }

    #[test]
    fn landscape_wizard_lays_out_sewn_displacement_floors() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let a = doc
            .create_landscape(
                Vec3::new(1000.0, 1000.0, 0.0),
                Vec3::new(512.0, 256.0, 16.0),
                (2, 1),
                3,
                DEFAULT_MATERIAL,
            )
            .unwrap();
        assert_eq!(a.changed_ids.len(), 2);
        assert_eq!(a.label, "Создать ландшафт 2×1");
        let tops: Vec<(u32, u32)> = a
            .changed_ids
            .iter()
            .map(|&id| {
                let s = doc.solid(id).unwrap();
                let top = s
                    .sides
                    .iter()
                    .find(|s| s.dispinfo.is_some())
                    .expect("a displacement on top");
                assert!(
                    top.plane.unwrap().normal.z > 0.99,
                    "the displacement sits on the top face"
                );
                assert_eq!(top.dispinfo.as_ref().unwrap().power, 3);
                (id, top.id)
            })
            .collect();
        let ga = doc.displacement_grid(tops[0].0, tops[0].1);
        let gb = doc.displacement_grid(tops[1].0, tops[1].1);
        assert_eq!(ga.len(), 81);
        // The shared edge x = 1256 has the same nine vertices on both sides.
        let shared_a: Vec<_> = ga.iter().filter(|p| (p.x - 1256.0).abs() < 1e-6).collect();
        assert_eq!(shared_a.len(), 9);
        for pa in shared_a {
            assert!(
                gb.iter().any(|pb| pb.distance(*pa) < 1e-6),
                "{pa} missing on the other side"
            );
        }
        assert!(vmf::Map::parse(&doc.to_vmf()).is_ok());
        doc.undo().unwrap();
        assert!(doc.solid(tops[0].0).is_none());
    }

    #[test]
    fn landscape_brush_crosses_the_seam_and_keeps_it_closed() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let a = doc
            .create_landscape(
                Vec3::new(1000.0, 1000.0, 0.0),
                Vec3::new(512.0, 256.0, 16.0),
                (2, 1),
                3,
                DEFAULT_MATERIAL,
            )
            .unwrap();
        let tops: Vec<(u32, u32)> = a
            .changed_ids
            .iter()
            .map(|&id| {
                let s = doc.solid(id).unwrap();
                (
                    id,
                    s.sides.iter().find(|s| s.dispinfo.is_some()).unwrap().id,
                )
            })
            .collect();
        // One dab centred on the seam, raising straight up.
        let centre = Vec3::new(1256.0, 1128.0, 0.0);
        let r = doc
            .sculpt_displacements(centre, 160.0, 48.0, Sculpt::Raise(PaintAxis::Up), false)
            .unwrap();
        assert_eq!(r.label, "Изменить рельеф ландшафта");
        assert_eq!(r.changed_ids.len(), 2, "both floors were in reach");
        let ga = doc.displacement_grid(tops[0].0, tops[0].1);
        let gb = doc.displacement_grid(tops[1].0, tops[1].1);
        let peak = ga
            .iter()
            .chain(gb.iter())
            .map(|p| p.z)
            .fold(f64::MIN, f64::max);
        assert!(
            (peak - 48.0).abs() < 1e-6,
            "the centre vertex rose by the full amount: {peak}"
        );
        for pa in ga.iter().filter(|p| (p.x - 1256.0).abs() < 1e-6) {
            let pb = gb
                .iter()
                .find(|p| (p.x - 1256.0).abs() < 1e-6 && (p.y - pa.y).abs() < 1e-6)
                .expect("matching vertex on the other side");
            assert!((pa.z - pb.z).abs() < 1e-6, "seam opened: {pa} vs {pb}");
        }
        // A second dab of the same stroke merges into the same undo step.
        let r2 = doc
            .sculpt_displacements(
                centre + Vec3::new(40.0, 0.0, 0.0),
                160.0,
                48.0,
                Sculpt::Raise(PaintAxis::Up),
                true,
            )
            .unwrap();
        assert_eq!(r2.label, "Изменить рельеф ландшафта");
        let undo_before = doc.undo.len();
        doc.undo().unwrap();
        assert_eq!(doc.undo.len(), undo_before - 1);
        let flat = doc.displacement_grid(tops[0].0, tops[0].1);
        assert!(
            flat.iter().all(|p| p.z.abs() < 1e-6),
            "one undo removed the whole stroke"
        );
        // Flatten towards 32 pulls a raised surface down; noise is deterministic and bounded.
        doc.sculpt_displacements(centre, 160.0, 48.0, Sculpt::Raise(PaintAxis::Up), false)
            .unwrap();
        doc.sculpt_displacements(centre, 400.0, 32.0, Sculpt::Flatten { height: 32.0 }, false)
            .unwrap();
        let g = doc.displacement_grid(tops[0].0, tops[0].1);
        let centre_v = g
            .iter()
            .min_by(|a, b| a.distance(centre).partial_cmp(&b.distance(centre)).unwrap())
            .unwrap();
        assert!(
            (centre_v.z - 32.0).abs() < 1e-6,
            "full-strength flatten lands on the height: {centre_v}"
        );
        let n1 = doc
            .sculpt_displacements(
                centre,
                400.0,
                8.0,
                Sculpt::Noise {
                    axis: PaintAxis::Up,
                    seed: 7,
                    scale: 64.0,
                },
                false,
            )
            .unwrap();
        let g1 = doc.displacement_grid(tops[0].0, tops[0].1);
        doc.undo().unwrap();
        let n2 = doc
            .sculpt_displacements(
                centre,
                400.0,
                8.0,
                Sculpt::Noise {
                    axis: PaintAxis::Up,
                    seed: 7,
                    scale: 64.0,
                },
                false,
            )
            .unwrap();
        assert_eq!(n1.changed_ids, n2.changed_ids);
        assert_eq!(
            doc.displacement_grid(tops[0].0, tops[0].1),
            g1,
            "the same seed gives the same bumps"
        );
        assert!(g1
            .iter()
            .all(|p| (p.z - 32.0).abs() <= 8.0 + 1e-6 || p.z.abs() < 48.0 + 8.0));
        assert!(
            doc.sculpt_displacements(
                Vec3::new(-9000.0, -9000.0, 0.0),
                32.0,
                8.0,
                Sculpt::Smooth,
                false
            )
            .is_none(),
            "nothing in reach"
        );
        assert!(vmf::Map::parse(&doc.to_vmf()).is_ok());
    }

    #[test]
    fn painting_the_fixture_displacement_updates_only_its_row() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // The fixture's displacement sits on solid 20, side 21.
        let grid = doc.displacement_grid(20, 21);
        assert_eq!(grid.len(), 25);
        assert_eq!(grid[12].z, 16.0);
        doc.paint_displacement(20, 21, grid[12], 3.0, 4.0, PaintAxis::Up, false)
            .unwrap();
        let out = doc.to_vmf();
        let diff = diff_lines(&src, &out);
        assert_eq!(diff.len(), 1, "{diff:?}");
        assert!(diff[0].0.contains("\"row2\" \"0 8 16 8 0\""));
        assert!(diff[0].1.contains("\"row2\" \"0 8 20 8 0\""));
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        // A clone keeps the displacement, moved along with the brush.
        let a = doc.clone_objects(&[20], Vec3::new(0.0, 0.0, 64.0)).unwrap();
        let d = doc.solid(a.changed_ids[0]).unwrap().sides[0]
            .dispinfo
            .clone()
            .unwrap();
        assert_eq!(d.distances[2][2], 16.0);
        assert_eq!(d.start_position, Vec3::new(-64.0, -64.0, 64.0));
        assert_eq!(doc.to_vmf().matches("\t\t\t\tdistances\n").count(), 2);
    }

    #[test]
    fn map_properties_edit_world_keys_in_place() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        assert_eq!(
            doc.world_keyvalues()
                .iter()
                .find(|(k, _)| k == "skyname")
                .map(|(_, v)| v.as_str()),
            Some("sky_day01_01")
        );
        let a = doc
            .set_world_keyvalues(&[
                ("skyname".to_string(), Some("sky_night_01".to_string())),
                ("maxpropscreenwidth".to_string(), None),
                ("comment".to_string(), Some("test".to_string())),
                ("classname".to_string(), Some("nope".to_string())),
            ])
            .unwrap();
        assert_eq!(a.label, "Изменить свойства карты");
        let out = doc.to_vmf();
        assert!(out.contains("\t\"skyname\" \"sky_night_01\"\n"), "{out}");
        assert!(!out.contains("maxpropscreenwidth"), "{out}");
        assert!(out.contains("\t\"classname\" \"worldspawn\"\n"), "{out}");
        assert!(out.contains("\t\"comment\" \"test\"\n"), "{out}");
        let reparsed = vmf::Map::parse(&out).unwrap();
        assert_eq!(reparsed.world.skyname(), Some("sky_night_01"));
        assert_eq!(reparsed.world.solids.len(), 2);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        doc.redo().unwrap();
        assert_eq!(doc.to_vmf(), out);
        assert!(doc
            .set_world_keyvalues(&[("skyname".to_string(), Some("sky_night_01".to_string()))])
            .is_none());
        // A new world key shifts the block's children: brush edits must still land on their own block.
        doc.translate(&[20], Vec3::new(0.0, 0.0, 8.0), false)
            .unwrap();
        let reparsed = vmf::Map::parse(&doc.to_vmf()).unwrap();
        assert_eq!(
            reparsed.world.solids[1].geometry().bounds().unwrap().1.z,
            8.0
        );
        assert_eq!(
            reparsed.world.solids[0].geometry().bounds().unwrap().1.z,
            -64.0,
            "the floor is untouched"
        );
        doc.undo().unwrap();
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        doc.translate(&[20], Vec3::new(0.0, 0.0, 8.0), false)
            .unwrap();
        let reparsed = vmf::Map::parse(&doc.to_vmf()).unwrap();
        assert_eq!(
            reparsed.world.solids[1].geometry().bounds().unwrap().1.z,
            8.0
        );
    }

    #[test]
    fn edits_after_inserting_top_level_blocks_still_hit_their_own_blocks() {
        // A map without visgroups or cordons: creating them inserts blocks
        // above or below the entities, which must not strand the paths.
        let src = fixture()
            .replace(
                "visgroups
{
	visgroup
	{
		\"name\" \"Detail\"
		\"visgroupid\" \"1\"
		\"color\" \"162 79 240\"
	}
}
",
                "",
            )
            .replace(
                "			\"visgroupid\" \"1\"
",
                "",
            );
        let mut doc = Document::open(&src).unwrap();
        doc.create_visgroup("New", Rgb::default(), &[2]).unwrap();
        doc.set_cordon(Some((Vec3::ZERO, Vec3::splat(64.0))), true)
            .unwrap();
        doc.translate(&[50], Vec3::new(0.0, 0.0, 10.0), false)
            .unwrap();
        doc.translate(&[20], Vec3::new(0.0, 0.0, 8.0), false)
            .unwrap();
        let reparsed = vmf::Map::parse(&doc.to_vmf()).unwrap();
        assert_eq!(
            reparsed.entity_by_id(50).unwrap().origin().unwrap().z,
            -46.0
        );
        assert_eq!(
            reparsed.world.solids[1].geometry().bounds().unwrap().1.z,
            8.0
        );
        assert_eq!(
            reparsed.world.solids[0].geometry().bounds().unwrap().1.z,
            -64.0
        );
        assert_eq!(reparsed.visgroups.len(), 1);
        for _ in 0..4 {
            doc.undo().unwrap();
        }
        // Undo leaves the (empty) visgroups block Hammer writes anyway.
        assert_eq!(
            doc.to_vmf().replace(
                "visgroups
{
}
",
                ""
            ),
            src
        );
    }

    #[test]
    fn replace_textures_exact_substring_and_selection() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let a = doc
            .replace_material("tools/toolsnodraw", "DEV/DEV_MEASUREWALL01A", &[], false)
            .unwrap();
        assert!(
            a.label.starts_with("Заменить текстуру на гранях ("),
            "{}",
            a.label
        );
        assert!(!doc.to_vmf().contains("TOOLS/TOOLSNODRAW"));
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        // Substring on one brush only: the floor keeps its texture.
        let a = doc
            .replace_material("measure", "MEASURE2", &[20], true)
            .unwrap();
        assert_eq!(a.changed_ids, vec![20]);
        let out = doc.to_vmf();
        assert!(out.contains("DEV/DEV_MEASURE2WALL01A"), "{out}");
        assert!(out.contains("DEV/DEV_MEASUREGENERIC01B"), "{out}");
        assert!(doc
            .replace_material("nothing_here", "x", &[], false)
            .is_none());
    }

    #[test]
    fn collapsing_an_instance_places_its_contents_with_fixed_up_names() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // The fixture itself serves as the instance: a block and a button named button_1.
        let a = doc
            .create_entity(
                "func_instance",
                Vec3::new(1000.0, 0.0, 0.0),
                &[
                    ("angles".to_string(), "0 90 0".to_string()),
                    ("file".to_string(), "instances/room.vmf".to_string()),
                    ("targetname".to_string(), "room1".to_string()),
                ],
                Rgb::default(),
            )
            .unwrap();
        let inst = a.changed_ids[0];
        let before_solids = doc.map().world.solids.len();
        let before_entities = doc.map().entities.len();
        let applied = doc
            .collapse_instance(
                inst,
                &src,
                "room1-",
                &[("$speed".to_string(), "9".to_string())],
            )
            .unwrap();
        assert_eq!(applied.label, "Collapse instance");
        assert!(doc.entity(inst).is_none(), "the instance entity is gone");
        assert_eq!(doc.map().world.solids.len(), before_solids + 2);
        assert_eq!(doc.map().entities.len(), before_entities - 1 + 3);
        // The floor (x -512..512, y -512..512) rotated 90° about Z and moved to x = 1000.
        let placed = doc.map().world.solids[before_solids]
            .geometry()
            .bounds()
            .unwrap();
        assert_eq!(placed.0, Vec3::new(488.0, -512.0, -128.0));
        assert_eq!(placed.1, Vec3::new(1512.0, 512.0, -64.0));
        let button = doc
            .map()
            .entities
            .iter()
            .find(|e| e.classname == "func_button" && e.get("targetname") == Some("room1-button_1"))
            .expect("fixed-up name");
        assert_eq!(button.connections[0].target, "room1-door_1");
        let spawn = doc
            .map()
            .entities
            .iter()
            .find(|e| e.classname == "info_player_start" && e.id > inst)
            .unwrap();
        assert_eq!(spawn.get("origin"), Some("1000 0 -56"));
        assert_eq!(
            spawn.get("angles"),
            Some("0 180 0"),
            "yaw turns with the instance"
        );
        assert!(vmf::Map::parse(&doc.to_vmf()).is_ok());
        doc.undo().unwrap();
        assert!(doc.entity(inst).is_some());
        assert_eq!(doc.map().world.solids.len(), before_solids);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
        assert!(
            doc.collapse_instance(50, &src, "", &[]).is_none(),
            "not an instance"
        );
    }

    #[test]
    fn set_material_rewrites_only_those_faces() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let top = doc.solid(2).unwrap().sides[0].id;
        let bottom = doc.solid(2).unwrap().sides[1].id;
        let applied = doc
            .set_material(
                &[(2, top), (2, bottom), (2, 9999)],
                "DEV/DEV_MEASUREWALL01A",
            )
            .unwrap();
        assert_eq!(applied.label, "Применить текстуру к граням (2)");
        assert_eq!(applied.changed_ids, vec![2]);
        let out = doc.to_vmf();
        let diff = diff_lines(&src, &out);
        assert_eq!(diff.len(), 2, "{diff:#?}");
        assert!(diff
            .iter()
            .all(|(_, b)| b.contains("\"material\" \"DEV/DEV_MEASUREWALL01A\"")));
        // Same material again is a no-op.
        assert!(doc
            .set_material(&[(2, top)], "DEV/DEV_MEASUREWALL01A")
            .is_none());
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn rotating_a_box_by_90_degrees_gives_integer_planes() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        // Solid 2 is the floor: x -512..512, y -512..512, z -128..-64.
        let applied = doc
            .rotate(
                &[2],
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::Z,
                90.0,
                TextureLock::OFFSET,
            )
            .unwrap();
        assert_eq!(applied.label, "Повернуть объект");
        let solid = doc.solid(2).unwrap();
        assert!(solid.geometry().is_valid());
        let (lo, hi) = solid.geometry().bounds().unwrap();
        assert_eq!(lo, Vec3::new(-512.0, -512.0, -128.0));
        assert_eq!(hi, Vec3::new(512.0, 512.0, -64.0));
        let out = doc.to_vmf();
        // Every coordinate is an integer: no "e-" noise and no fractions.
        for (_, line) in diff_lines(&src, &out) {
            assert!(
                !line.contains("e-") && !line.contains('.') || line.contains("0.25"),
                "{line}"
            );
        }
        // Texture lock turned the world-aligned top axes with the brush.
        let top = &solid.sides[0];
        assert_eq!(top.uaxis.axis, Vec3::new(0.0, 1.0, 0.0));
        assert_eq!(top.vaxis.axis, Vec3::new(1.0, 0.0, 0.0));
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn rotation_turns_entity_angles_and_origin() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let origin = doc.entity(50).unwrap().origin().unwrap();
        doc.rotate(&[50], Vec3::ZERO, Vec3::Z, 90.0, TextureLock::NONE)
            .unwrap();
        let e = doc.entity(50).unwrap();
        let o = e.origin().unwrap();
        assert_eq!(o, Vec3::new(-origin.y, origin.x, origin.z));
        // "0 90 0" turned by +90° about Z.
        assert_eq!(e.angles().unwrap(), Vec3::new(0.0, 180.0, 0.0));
        assert!(doc.to_vmf().contains("\"angles\" \"0 180 0\""));
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn scaling_stretches_a_box_about_the_pivot() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let before = doc.solid(2).unwrap().sides[0].uaxis;
        doc.scale(
            &[2],
            Vec3::new(-512.0, -512.0, -128.0),
            Vec3::new(2.0, 1.0, 1.0),
            TextureLock::ALL,
        )
        .unwrap();
        let solid = doc.solid(2).unwrap();
        let (lo, hi) = solid.geometry().bounds().unwrap();
        assert_eq!(lo, Vec3::new(-512.0, -512.0, -128.0));
        assert_eq!(hi, Vec3::new(1536.0, 512.0, -64.0));
        // Top face u axis is +X: scale lock doubled its texel size.
        let top = &solid.sides[0];
        assert_eq!(top.uaxis.scale, before.scale * 2.0);
        assert_eq!(top.vaxis.scale, 0.25);
        doc.undo().unwrap();
        assert_eq!(doc.to_vmf(), src);
    }

    #[test]
    fn mirroring_keeps_the_brush_valid() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let applied = doc
            .scale(
                &[2],
                Vec3::ZERO,
                Vec3::new(-1.0, 1.0, 1.0),
                TextureLock::NONE,
            )
            .unwrap();
        assert_eq!(applied.label, "Отразить объект");
        let g = doc.solid(2).unwrap().geometry();
        assert!(g.is_valid(), "{:?}", g.problems);
        assert!(g.volume() > 0.0);
    }

    #[test]
    fn collapsing_scale_is_rejected_and_leaves_the_document_clean() {
        let src = fixture();
        let mut doc = Document::open(&src).unwrap();
        let r = doc.scale(
            &[2, 3],
            Vec3::ZERO,
            Vec3::new(1.0, 1.0, 1.0e-6),
            TextureLock::NONE,
        );
        assert!(r.is_none());
        assert_eq!(doc.to_vmf(), src);
        assert!(!doc.is_dirty());
        assert!(!doc.can_undo());
    }
}
