//! Builds kv blocks for objects the editor creates, in the key order and
//! quoting style Hammer uses. New nodes carry no stored formatting, so the kv
//! writer lays them out Hammer-style (tabs, bare block keys, quoted pairs).

use geometry::Vec3;
use kv::{Block, NodeList, Pair};
use vmf::{DispInfo, Editor, Entity, Solid};

use crate::format::{fmt_axis, fmt_bracket_vec3, fmt_g, fmt_plane};

/// An entity block: `id`, `classname`, its key-values in order, the
/// connections (ESC-separated when `esc`, else commas), its brushes, then
/// the editor block. Hammer writes `origin` last, which the caller arranges.
pub fn entity_block(entity: &Entity, esc: bool) -> Block {
    let mut b = Block::new("entity");
    b.push(Pair::new("id", entity.id.to_string()));
    b.push(Pair::new("classname", entity.classname.clone()));
    for (k, v) in &entity.keyvalues {
        b.push(Pair::new(k.clone(), v.clone()));
    }
    if !entity.connections.is_empty() {
        let sep = if esc { '\u{1b}' } else { ',' };
        let mut cb = Block::new("connections");
        for c in &entity.connections {
            let value = format!(
                "{}{sep}{}{sep}{}{sep}{}{sep}{}",
                c.target,
                c.input,
                c.parameter,
                fmt_g(c.delay),
                c.times_to_fire
            );
            cb.push(Pair::new(c.output.clone(), value));
        }
        b.push(cb);
    }
    for solid in &entity.solids {
        b.push(solid_block(solid));
    }
    b.push(editor_block(&entity.editor));
    b
}

fn editor_block(editor: &Editor) -> Block {
    let mut e = Block::new("editor");
    let c = editor.color;
    e.push(Pair::new("color", format!("{} {} {}", c.r, c.g, c.b)));
    for id in &editor.visgroup_ids {
        e.push(Pair::new("visgroupid", id.to_string()));
    }
    e.push(Pair::new(
        "visgroupshown",
        if editor.visgroup_shown { "1" } else { "0" },
    ));
    e.push(Pair::new(
        "visgroupautoshown",
        if editor.visgroup_auto_shown { "1" } else { "0" },
    ));
    if let Some(p) = editor.logical_pos {
        e.push(Pair::new(
            "logicalpos",
            format!("[{} {}]", fmt_g(p[0]), fmt_g(p[1])),
        ));
    }
    e
}

pub fn solid_block(solid: &Solid) -> Block {
    let mut b = Block::new("solid");
    b.push(Pair::new("id", solid.id.to_string()));
    for side in &solid.sides {
        let mut s = Block::new("side");
        s.push(Pair::new("id", side.id.to_string()));
        s.push(Pair::new("plane", fmt_plane(&side.plane_points)));
        s.push(Pair::new("material", side.material.clone()));
        s.push(Pair::new("uaxis", fmt_axis(&side.uaxis)));
        s.push(Pair::new("vaxis", fmt_axis(&side.vaxis)));
        s.push(Pair::new("rotation", fmt_g(side.rotation)));
        s.push(Pair::new("lightmapscale", side.lightmap_scale.to_string()));
        s.push(Pair::new(
            "smoothing_groups",
            side.smoothing_groups.to_string(),
        ));
        if let Some(disp) = &side.dispinfo {
            s.push(dispinfo_block(disp));
        }
        b.push(s);
    }
    b.push(editor_block(&solid.editor));
    b
}

/// Rows of numbers as Hammer writes them: `"row0" "0 0 1 0 0 1 …"`.
fn rows_block(key: &str, rows: &[String]) -> Block {
    let mut b = Block::new(key);
    for (i, row) in rows.iter().enumerate() {
        b.push(Pair::new(format!("row{i}"), row.clone()));
    }
    b
}

pub fn row_f64(row: &[f64]) -> String {
    row.iter().map(|v| fmt_g(*v)).collect::<Vec<_>>().join(" ")
}

pub fn row_vec3(row: &[Vec3]) -> String {
    row.iter()
        .flat_map(|v| [fmt_g(v.x), fmt_g(v.y), fmt_g(v.z)])
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn row_u32(row: &[u32]) -> String {
    row.iter()
        .map(|v| v.to_string())
        .collect::<Vec<_>>()
        .join(" ")
}

/// A `dispinfo` block in Hammer's key order.
pub fn dispinfo_block(disp: &DispInfo) -> Block {
    let mut d = Block::new("dispinfo");
    d.push(Pair::new("power", disp.power.to_string()));
    d.push(Pair::new(
        "startposition",
        fmt_bracket_vec3(disp.start_position),
    ));
    d.push(Pair::new("flags", disp.flags.to_string()));
    d.push(Pair::new("elevation", fmt_g(disp.elevation)));
    d.push(Pair::new("subdiv", if disp.subdiv { "1" } else { "0" }));
    let v3 = |rows: &[Vec<Vec3>]| rows.iter().map(|r| row_vec3(r)).collect::<Vec<_>>();
    let f = |rows: &[Vec<f64>]| rows.iter().map(|r| row_f64(r)).collect::<Vec<_>>();
    d.push(rows_block("normals", &v3(&disp.normals)));
    d.push(rows_block("distances", &f(&disp.distances)));
    d.push(rows_block("offsets", &v3(&disp.offsets)));
    d.push(rows_block("offset_normals", &v3(&disp.offset_normals)));
    d.push(rows_block("alphas", &f(&disp.alphas)));
    d.push(rows_block(
        "triangle_tags",
        &disp
            .triangle_tags
            .iter()
            .map(|r| row_u32(r))
            .collect::<Vec<_>>(),
    ));
    let mut av = Block::new("allowed_verts");
    av.push(Pair::new(
        "10",
        disp.allowed_verts
            .iter()
            .map(|v| v.to_string())
            .collect::<Vec<_>>()
            .join(" "),
    ));
    d.push(av);
    d
}
