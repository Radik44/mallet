//! Write-through from typed objects to the kv tree.
//!
//! The tree keeps every byte of the original file; here only the values that
//! an edit touched are replaced, in place, so untouched text survives.

use std::collections::HashMap;

use kv::{Block, Document, Node, NodeList};
use vmf::{Entity, Map, Solid};

use crate::format::{fmt_axis, fmt_bracket_vec3, fmt_plane, fmt_vec3};

/// Index paths from the document root to each object's block.
#[derive(Debug, Default)]
pub struct Paths {
    solids: HashMap<u32, Vec<usize>>,
    entities: HashMap<u32, Vec<usize>>,
    /// Objects whose block sits inside a `hidden` wrapper.
    hidden: std::collections::HashSet<u32>,
}

impl Paths {
    pub fn build(map: &Map) -> Paths {
        let mut paths = Paths::default();
        let doc = map.document();
        for (i, node) in doc.nodes().iter().enumerate() {
            let Node::Block(b) = node else { continue };
            let key = b.key.text().to_ascii_lowercase();
            match key.as_str() {
                "world" => paths.index_solids_in(b, vec![i]),
                "entity" => paths.index_entity(b, vec![i]),
                "hidden" => {
                    for (j, inner) in b.nodes().iter().enumerate() {
                        if let Node::Block(e) = inner {
                            if e.key.text().eq_ignore_ascii_case("entity") {
                                if let Some(id) = block_id(e) {
                                    paths.hidden.insert(id);
                                }
                                paths.index_entity(e, vec![i, j]);
                            }
                        }
                    }
                }
                _ => {}
            }
        }
        paths
    }

    /// True when the object's block is wrapped in `hidden`.
    pub fn is_hidden(&self, id: u32) -> bool {
        self.hidden.contains(&id)
    }

    fn index_entity(&mut self, b: &Block, path: Vec<usize>) {
        if let Some(id) = block_id(b) {
            self.entities.insert(id, path.clone());
        }
        self.index_solids_in(b, path);
    }

    fn index_solids_in(&mut self, b: &Block, path: Vec<usize>) {
        for (j, node) in b.nodes().iter().enumerate() {
            let Node::Block(c) = node else { continue };
            if c.key.text().eq_ignore_ascii_case("solid") {
                if let Some(id) = block_id(c) {
                    let mut p = path.clone();
                    p.push(j);
                    self.solids.insert(id, p);
                }
            } else if c.key.text().eq_ignore_ascii_case("hidden") {
                for (k, inner) in c.nodes().iter().enumerate() {
                    if let Node::Block(s) = inner {
                        if s.key.text().eq_ignore_ascii_case("solid") {
                            if let Some(id) = block_id(s) {
                                let mut p = path.clone();
                                p.push(j);
                                p.push(k);
                                self.solids.insert(id, p);
                                self.hidden.insert(id);
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn solid(&self, id: u32) -> Option<&[usize]> {
        self.solids.get(&id).map(Vec::as_slice)
    }

    pub fn entity(&self, id: u32) -> Option<&[usize]> {
        self.entities.get(&id).map(Vec::as_slice)
    }
}

fn block_id(b: &Block) -> Option<u32> {
    b.value("id").and_then(|v| v.trim().parse().ok())
}

fn block_at_mut<'a>(doc: &'a mut Document, path: &[usize]) -> Option<&'a mut Block> {
    let (first, rest) = path.split_first()?;
    let mut block = match doc.nodes_mut().get_mut(*first)? {
        Node::Block(b) => b,
        Node::Pair(_) => return None,
    };
    for &i in rest {
        block = match block.children.get_mut(i)? {
            Node::Block(b) => b,
            Node::Pair(_) => return None,
        };
    }
    Some(block)
}

/// Wraps the object's block in `hidden { }` or unwraps it, re-indenting the
/// moved subtree so the file looks as if Hammer had written it. Returns the
/// block's new path, or `None` when nothing had to change.
pub fn set_hidden(doc: &mut Document, path: &[usize], hidden: bool) -> Option<Vec<usize>> {
    let (last, parent_path) = path.split_last()?;
    let parent_is_hidden = match block_at_mut(doc, parent_path) {
        Some(b) => b.key.text().eq_ignore_ascii_case("hidden"),
        None => false,
    };
    if hidden == parent_is_hidden {
        return None;
    }
    if hidden {
        let mut node = remove_at(doc, path)?;
        strip_trivia(&mut node);
        let mut wrapper = Block::new("hidden");
        wrapper.children.push(node);
        insert_at(doc, path, Node::Block(wrapper));
        let mut p = path.to_vec();
        p.push(0);
        Some(p)
    } else {
        // path = [.., wrapper, child]
        let (wrapper_index, grand_path) = parent_path.split_last()?;
        let mut node = remove_at(doc, path)?;
        strip_trivia(&mut node);
        let wrapper_empty = match block_at_mut(doc, parent_path) {
            Some(b) => b.children.is_empty(),
            None => false,
        };
        let mut at = *wrapper_index;
        if wrapper_empty {
            remove_at(doc, parent_path);
        } else {
            at += 1;
        }
        let _ = last;
        let mut p = grand_path.to_vec();
        p.push(at);
        insert_at(doc, &p, node);
        Some(p)
    }
}

/// Drops stored whitespace so the writer lays the subtree out afresh at its
/// new depth (Hammer's own style, which is what the trivia was anyway).
fn strip_trivia(node: &mut Node) {
    match node {
        Node::Pair(p) => {
            p.leading = None;
            p.sep = None;
        }
        Node::Block(b) => {
            b.leading = None;
            b.open_ws = None;
            b.close_leading = None;
            for c in &mut b.children {
                strip_trivia(c);
            }
        }
    }
}

/// Makes the object's `editor` block match: visgroup ids, shown flags and
/// group id. Colour and other keys are left alone.
pub fn write_editor(block: &mut Block, editor: &vmf::Editor) {
    if block.block_mut("editor").is_none() {
        let mut e = Block::new("editor");
        let c = editor.color;
        e.push(kv::Pair::new("color", format!("{} {} {}", c.r, c.g, c.b)));
        block.children.push(Node::Block(e));
    }
    let Some(e) = block.block_mut("editor") else {
        return;
    };
    let flag = |v: bool| if v { "1" } else { "0" };
    set_if_differs(e, "visgroupshown", flag(editor.visgroup_shown));
    set_if_differs(e, "visgroupautoshown", flag(editor.visgroup_auto_shown));
    match editor.group_id {
        Some(g) => set_if_differs(e, "groupid", &g.to_string()),
        None => {
            e.remove_all("groupid");
        }
    }
    let current: Vec<u32> = e
        .pairs()
        .filter(|p| p.key.text().eq_ignore_ascii_case("visgroupid"))
        .filter_map(|p| p.value.text().trim().parse().ok())
        .collect();
    if current != editor.visgroup_ids {
        // Hammer writes visgroupid lines right after color.
        let first = e
            .children
            .iter()
            .position(|n| matches!(n, Node::Pair(p) if p.key.text().eq_ignore_ascii_case("visgroupid")))
            .or_else(|| {
                e.children
                    .iter()
                    .position(|n| matches!(n, Node::Pair(p) if p.key.text().eq_ignore_ascii_case("color")))
                    .map(|i| i + 1)
            })
            .unwrap_or(0);
        e.remove_all("visgroupid");
        for (k, id) in editor.visgroup_ids.iter().enumerate() {
            let at = (first + k).min(e.children.len());
            e.children
                .insert(at, Node::Pair(kv::Pair::new("visgroupid", id.to_string())));
        }
    }
}

fn set_if_differs(b: &mut Block, key: &str, value: &str) {
    if b.value(key) != Some(value) {
        b.set_value(key, value);
    }
}

/// Regenerates the top-level `visgroups` block from the typed tree.
pub fn write_visgroups(doc: &mut Document, groups: &[vmf::VisGroup]) {
    fn fill(b: &mut Block, groups: &[vmf::VisGroup]) {
        for g in groups {
            let mut v = Block::new("visgroup");
            v.push(kv::Pair::new("name", g.name.clone()));
            v.push(kv::Pair::new("visgroupid", g.id.to_string()));
            v.push(kv::Pair::new(
                "color",
                format!("{} {} {}", g.color.r, g.color.g, g.color.b),
            ));
            fill(&mut v, &g.children);
            b.push(v);
        }
    }
    let mut fresh = Block::new("visgroups");
    fill(&mut fresh, groups);
    match doc.block_mut("visgroups") {
        Some(b) => b.children = fresh.children,
        None => {
            let at = doc
                .nodes()
                .iter()
                .position(|n| matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("versioninfo")))
                .map(|i| i + 1)
                .unwrap_or(0);
            doc.nodes_mut().insert(at, Node::Block(fresh));
        }
    }
}

/// Regenerates the `group` blocks of `world`, keeping them where the first
/// one was (after the solids, before `editor`).
pub fn write_groups(doc: &mut Document, groups: &[vmf::Group]) {
    let Some(world) = doc.block_mut("world") else {
        return;
    };
    let first = world
        .children
        .iter()
        .position(|n| matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("group")));
    world
        .children
        .retain(|n| !matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("group")));
    let at = first
        .or_else(|| {
            world.children.iter().position(
                |n| matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("editor")),
            )
        })
        .unwrap_or(world.children.len())
        .min(world.children.len());
    for (k, g) in groups.iter().enumerate() {
        let mut b = Block::new("group");
        b.push(kv::Pair::new("id", g.id.to_string()));
        let mut e = Block::new("editor");
        let c = g.editor.color;
        e.push(kv::Pair::new("color", format!("{} {} {}", c.r, c.g, c.b)));
        for id in &g.editor.visgroup_ids {
            e.push(kv::Pair::new("visgroupid", id.to_string()));
        }
        e.push(kv::Pair::new(
            "visgroupshown",
            if g.editor.visgroup_shown { "1" } else { "0" },
        ));
        e.push(kv::Pair::new(
            "visgroupautoshown",
            if g.editor.visgroup_auto_shown {
                "1"
            } else {
                "0"
            },
        ));
        b.push(e);
        world.children.insert(at + k, Node::Block(b));
    }
}

/// Regenerates the `cordons` block (Hammer 2013 format) at the end of the
/// file, replacing a pre-2013 single `cordon` block when there is one.
pub fn write_cordons(doc: &mut Document, cordons: &[vmf::Cordon], active: bool) {
    let mut fresh = Block::new("cordons");
    fresh.push(kv::Pair::new("active", if active { "1" } else { "0" }));
    for c in cordons {
        let mut b = Block::new("cordon");
        b.push(kv::Pair::new("name", c.name.clone()));
        b.push(kv::Pair::new("active", if c.active { "1" } else { "0" }));
        let mut bx = Block::new("box");
        bx.push(kv::Pair::new("mins", format!("({})", fmt_vec3(c.mins))));
        bx.push(kv::Pair::new("maxs", format!("({})", fmt_vec3(c.maxs))));
        b.push(bx);
        fresh.push(b);
    }
    let old_single = doc
        .nodes()
        .iter()
        .position(|n| matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("cordon")));
    if let Some(i) = old_single {
        doc.nodes_mut().remove(i);
    }
    match doc.block_mut("cordons") {
        Some(b) => b.children = fresh.children,
        None => doc.nodes_mut().push(Node::Block(fresh)),
    }
}

/// Replaces plane, texture axes, `vertices_plus` and displacement start
/// position of every side, in order. Side blocks are matched by position,
/// which the parser guarantees. The editor block follows the typed flags.
pub fn write_solid(doc: &mut Document, path: &[usize], solid: &Solid) {
    let Some(block) = block_at_mut(doc, path) else {
        return;
    };
    write_editor(block, &solid.editor);
    let mut side_blocks: Vec<&mut Block> = block
        .children
        .iter_mut()
        .filter_map(|n| match n {
            Node::Block(b) if b.key.text().eq_ignore_ascii_case("side") => Some(b),
            _ => None,
        })
        .collect();
    for (side, sb) in solid.sides.iter().zip(side_blocks.iter_mut()) {
        set_if_present(sb, "plane", &fmt_plane(&side.plane_points));
        set_if_present(sb, "material", &side.material);
        set_if_present(sb, "uaxis", &fmt_axis(&side.uaxis));
        set_if_present(sb, "vaxis", &fmt_axis(&side.vaxis));
        set_if_present(sb, "rotation", &crate::format::fmt_g(side.rotation));
        set_if_present(sb, "lightmapscale", &side.lightmap_scale.to_string());
        set_if_present(sb, "smoothing_groups", &side.smoothing_groups.to_string());
        if let Some(vp) = &side.vertices_plus {
            if let Some(vpb) = sb.block_mut("vertices_plus") {
                let mut i = 0;
                for node in &mut vpb.children {
                    if let Node::Pair(p) = node {
                        if p.key.text().eq_ignore_ascii_case("v") {
                            if let Some(v) = vp.get(i) {
                                p.value.set_text(fmt_vec3(*v));
                            }
                            i += 1;
                        }
                    }
                }
            }
        }
        match (&side.dispinfo, sb.block("dispinfo").is_some()) {
            (Some(disp), true) => write_dispinfo(sb.block_mut("dispinfo").expect("dispinfo"), disp),
            (Some(disp), false) => sb
                .children
                .push(Node::Block(crate::kvgen::dispinfo_block(disp))),
            (None, true) => {
                sb.remove_all("dispinfo");
            }
            (None, false) => {}
        }
    }
}

/// Makes an existing `dispinfo` block match: scalar keys and every row of
/// the grids; missing grids are added, untouched rows keep their bytes.
fn write_dispinfo(db: &mut Block, disp: &vmf::DispInfo) {
    use crate::kvgen::{row_f64, row_u32, row_vec3};
    set_if_present(db, "power", &disp.power.to_string());
    set_if_present(db, "startposition", &fmt_bracket_vec3(disp.start_position));
    set_if_present(db, "flags", &disp.flags.to_string());
    set_if_present(db, "elevation", &crate::format::fmt_g(disp.elevation));
    set_if_present(db, "subdiv", if disp.subdiv { "1" } else { "0" });
    let mut write_rows = |key: &str, rows: Vec<String>| {
        if rows.is_empty() {
            return;
        }
        if db.block(key).is_none() {
            db.children.push(Node::Block(Block::new(key)));
        }
        let Some(rb) = db.block_mut(key) else { return };
        for (i, row) in rows.iter().enumerate() {
            let k = format!("row{i}");
            if rb.value(&k) != Some(row.as_str()) {
                rb.set_value(&k, row.clone());
            }
        }
    };
    write_rows(
        "normals",
        disp.normals.iter().map(|r| row_vec3(r)).collect(),
    );
    write_rows(
        "distances",
        disp.distances.iter().map(|r| row_f64(r)).collect(),
    );
    write_rows(
        "offsets",
        disp.offsets.iter().map(|r| row_vec3(r)).collect(),
    );
    write_rows(
        "offset_normals",
        disp.offset_normals.iter().map(|r| row_vec3(r)).collect(),
    );
    write_rows("alphas", disp.alphas.iter().map(|r| row_f64(r)).collect());
    write_rows(
        "triangle_tags",
        disp.triangle_tags.iter().map(|r| row_u32(r)).collect(),
    );
}

/// Inserts a solid block into `world` right after the last `solid` child
/// (before `group`/`editor`), or at the end. `typed_index` is where the solid
/// sits among the world's solids; the block goes after the solid before it.
/// Returns the path of the inserted block.
pub fn insert_world_solid(doc: &mut Document, block: Block, typed_index: usize) -> Vec<usize> {
    let Some(wi) = doc
        .nodes()
        .iter()
        .position(|n| matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("world")))
    else {
        return Vec::new();
    };
    insert_solid_in(doc, &[wi], block, typed_index)
}

/// Inserts a solid block into the block at `parent_path`, positioned so the
/// kv order matches the typed order: after the `typed_index`-th existing
/// solid child, or before the first non-solid trailing block when it is the
/// last one.
pub fn insert_solid_in(
    doc: &mut Document,
    parent_path: &[usize],
    block: Block,
    typed_index: usize,
) -> Vec<usize> {
    let Some(parent) = block_at_mut(doc, parent_path) else {
        return Vec::new();
    };
    // Child indices of direct `solid` blocks (hidden solids are not counted:
    // they are not in the typed order either, which only matters for maps
    // with hidden brushes, where we append after the last visible one).
    let solid_children: Vec<usize> = parent
        .children
        .iter()
        .enumerate()
        .filter(|(_, n)| matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("solid")))
        .map(|(i, _)| i)
        .collect();
    let at = if typed_index < solid_children.len() {
        solid_children[typed_index]
    } else if let Some(&last) = solid_children.last() {
        last + 1
    } else {
        // No solids yet: before `group`/`editor`/`hidden` trailing blocks, else at the end.
        parent
            .children
            .iter()
            .position(|n| {
                matches!(n, Node::Block(b) if ["editor", "group", "hidden", "connections"]
                    .iter()
                    .any(|k| b.key.text().eq_ignore_ascii_case(k)))
            })
            .unwrap_or(parent.children.len())
    };
    parent.children.insert(at, Node::Block(block));
    let mut path = parent_path.to_vec();
    path.push(at);
    path
}

/// Appends an entity block after the last top-level `entity` (or `hidden`)
/// block, after `world` when there are none, so the file keeps Hammer's
/// order: world, entities, cameras, cordons. Returns the block's path.
pub fn insert_entity(doc: &mut Document, block: Block) -> Vec<usize> {
    let nodes = doc.nodes();
    let key_is = |n: &Node, keys: &[&str]| matches!(n, Node::Block(b) if keys.iter().any(|k| b.key.text().eq_ignore_ascii_case(k)));
    let after_last = nodes
        .iter()
        .rposition(|n| key_is(n, &["entity", "hidden"]))
        .or_else(|| nodes.iter().rposition(|n| key_is(n, &["world"])))
        .map(|i| i + 1)
        .unwrap_or(nodes.len());
    doc.nodes_mut().insert(after_last, Node::Block(block));
    vec![after_last]
}

/// Removes and returns the node at `path`.
pub fn remove_at(doc: &mut Document, path: &[usize]) -> Option<Node> {
    let (last, parent_path) = path.split_last()?;
    if parent_path.is_empty() {
        let nodes = doc.nodes_mut();
        return (*last < nodes.len()).then(|| nodes.remove(*last));
    }
    let parent = block_at_mut(doc, parent_path)?;
    (*last < parent.children.len()).then(|| parent.children.remove(*last))
}

/// Inserts a node at `path` (clamped to the parent's length).
pub fn insert_at(doc: &mut Document, path: &[usize], node: Node) {
    let Some((last, parent_path)) = path.split_last() else {
        return;
    };
    if parent_path.is_empty() {
        let nodes = doc.nodes_mut();
        let i = (*last).min(nodes.len());
        nodes.insert(i, node);
        return;
    }
    if let Some(parent) = block_at_mut(doc, parent_path) {
        let i = (*last).min(parent.children.len());
        parent.children.insert(i, node);
    }
}

fn world_block_mut(doc: &mut Document) -> Option<&mut Block> {
    doc.nodes_mut().iter_mut().find_map(|n| match n {
        Node::Block(b) if b.key.text().eq_ignore_ascii_case("world") => Some(b),
        _ => None,
    })
}

/// The `world` block's pair nodes as they are, for exact undo.
pub fn world_pairs(doc: &Document) -> Vec<Node> {
    doc.nodes()
        .iter()
        .find_map(|n| match n {
            Node::Block(b) if b.key.text().eq_ignore_ascii_case("world") => Some(b),
            _ => None,
        })
        .map(|b| {
            b.children
                .iter()
                .filter(|n| matches!(n, Node::Pair(_)))
                .cloned()
                .collect()
        })
        .unwrap_or_default()
}

/// Puts back the `world` block's pairs (in place of the current ones, before
/// the first child block), leaving the solids and groups alone.
pub fn set_world_pairs(doc: &mut Document, pairs: Vec<Node>) {
    let Some(block) = world_block_mut(doc) else {
        return;
    };
    let first_block = block
        .children
        .iter()
        .position(|n| matches!(n, Node::Block(_)))
        .unwrap_or(block.children.len());
    let mut rest: Vec<Node> = block.children.drain(first_block..).collect();
    block.children.retain(|n| !matches!(n, Node::Pair(_)));
    let mut children = pairs;
    children.append(&mut block.children);
    children.append(&mut rest);
    block.children = children;
}

/// Makes the top-level `world` block's plain pairs match `keyvalues`:
/// changed values in place, new keys after the last pair, removed keys
/// dropped. `id` and `classname` are left as they are.
pub fn write_world_keyvalues(doc: &mut Document, keyvalues: &[(String, String)]) {
    let Some(block) = world_block_mut(doc) else {
        return;
    };
    let keep = |k: &str| k.eq_ignore_ascii_case("id") || k.eq_ignore_ascii_case("classname");
    // Drop pairs the world no longer has.
    block.children.retain(|n| match n {
        Node::Pair(p) => {
            let k = p.key.text();
            keep(k) || keyvalues.iter().any(|(kk, _)| kk.eq_ignore_ascii_case(k))
        }
        _ => true,
    });
    for (k, v) in keyvalues {
        if keep(k) {
            continue;
        }
        if block.value(k) == Some(v.as_str()) {
            continue;
        }
        let exists = block
            .children
            .iter()
            .any(|n| matches!(n, Node::Pair(p) if p.key.text().eq_ignore_ascii_case(k)));
        if exists {
            block.set_value(k, v.clone());
        } else {
            let at = block
                .children
                .iter()
                .rposition(|n| matches!(n, Node::Pair(_)))
                .map(|i| i + 1)
                .unwrap_or(0);
            block
                .children
                .insert(at, Node::Pair(kv::Pair::new(k.clone(), v.clone())));
        }
    }
}

/// Makes the block's plain pairs match the entity: changed values are
/// rewritten in place, new keys go in before `origin` (or before the first
/// child block), keys the entity no longer has are removed.
pub fn write_entity_keyvalues(doc: &mut Document, path: &[usize], entity: &Entity) {
    let Some(block) = block_at_mut(doc, path) else {
        return;
    };
    if block.value("classname") != Some(entity.classname.as_str()) {
        block.set_value("classname", entity.classname.clone());
    }
    write_editor(block, &entity.editor);
    for (k, v) in &entity.keyvalues {
        if block.value(k) == Some(v.as_str()) {
            continue;
        }
        let exists = block
            .children
            .iter()
            .any(|n| matches!(n, Node::Pair(p) if p.key.text().eq_ignore_ascii_case(k)));
        if exists {
            block.set_value(k, v.clone());
        } else {
            let at = insertion_point(block, k);
            block
                .children
                .insert(at, Node::Pair(kv::Pair::new(k.clone(), v.clone())));
        }
    }
    block.children.retain(|n| match n {
        Node::Pair(p) => {
            let key = p.key.text();
            key.eq_ignore_ascii_case("id")
                || key.eq_ignore_ascii_case("classname")
                || entity
                    .keyvalues
                    .iter()
                    .any(|(k, _)| k.eq_ignore_ascii_case(key))
        }
        Node::Block(_) => true,
    });
}

/// Where a new pair goes: `origin` stays last among the pairs, and pairs
/// stay before `connections`, `solid` and `editor` blocks.
fn insertion_point(block: &Block, key: &str) -> usize {
    let first_block = block
        .children
        .iter()
        .position(|n| matches!(n, Node::Block(_)))
        .unwrap_or(block.children.len());
    if key.eq_ignore_ascii_case("origin") {
        return first_block;
    }
    block
        .children
        .iter()
        .position(|n| matches!(n, Node::Pair(p) if p.key.text().eq_ignore_ascii_case("origin")))
        .map(|i| i.min(first_block))
        .unwrap_or(first_block)
}

/// Rewrites the entity's `connections` block from its typed connections,
/// keeping the block where it was (or placing it before `origin`), and
/// removing it when there are none. `esc` picks Hammer 2013's ESC separator
/// over the older comma form.
pub fn write_entity_connections(doc: &mut Document, path: &[usize], entity: &Entity, esc: bool) {
    let Some(block) = block_at_mut(doc, path) else {
        return;
    };
    let existing = block.children.iter().position(
        |n| matches!(n, Node::Block(b) if b.key.text().eq_ignore_ascii_case("connections")),
    );
    if entity.connections.is_empty() {
        if let Some(i) = existing {
            block.children.remove(i);
        }
        return;
    }
    let sep = if esc { '\u{1b}' } else { ',' };
    let mut cb = Block::new("connections");
    for c in &entity.connections {
        let value = format!(
            "{}{sep}{}{sep}{}{sep}{}{sep}{}",
            c.target,
            c.input,
            c.parameter,
            crate::format::fmt_g(c.delay),
            c.times_to_fire
        );
        cb.push(kv::Pair::new(c.output.clone(), value));
    }
    match existing {
        Some(i) => {
            if let Node::Block(old) = &mut block.children[i] {
                old.children = cb.children;
            }
        }
        None => {
            let at = insertion_point(block, "connections");
            block.children.insert(at, Node::Block(cb));
        }
    }
}

/// Sets a value only when the key exists and the text differs, so untouched
/// keys keep their original bytes.
fn set_if_present(b: &mut Block, key: &str, value: &str) {
    let differs = match b.value(key) {
        Some(v) => v != value,
        None => return,
    };
    if differs {
        b.set_value(key, value);
    }
}
