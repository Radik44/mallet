//! Lifting the kv tree into the typed structures of this crate.

use geometry::{Plane, TexAxis, Vec3};
use kv::{Block, Document, Node, NodeList};

use crate::{
    Camera, Connection, Cordon, DispInfo, Editor, Entity, Error, Group, Map, Rgb, Side, Solid,
    VersionInfo, ViewSettings, VisGroup, Warning, World,
};

/// Hammer's defaults for a side missing its texture axes.
const DEFAULT_SCALE: f64 = 0.25;

struct Ctx {
    warnings: Vec<Warning>,
}

impl Ctx {
    fn warn(&mut self, object_id: Option<u32>, message: impl Into<String>) {
        self.warnings.push(Warning {
            object_id,
            message: message.into(),
        });
    }
}

pub(crate) fn map_from_document(doc: Document) -> Result<Map, Error> {
    let mut ctx = Ctx {
        warnings: Vec::new(),
    };

    let versioninfo = doc
        .block("versioninfo")
        .map(|b| VersionInfo {
            editor_version: int(b, "editorversion", 0, &mut ctx, None),
            editor_build: int(b, "editorbuild", 0, &mut ctx, None),
            map_version: int(b, "mapversion", 0, &mut ctx, None),
            format_version: int(b, "formatversion", 100, &mut ctx, None),
            prefab: boolean(b, "prefab", false),
        })
        .unwrap_or_default();

    let visgroups = doc
        .block("visgroups")
        .map(|b| visgroups(b, &mut ctx))
        .unwrap_or_default();

    let viewsettings = doc
        .block("viewsettings")
        .map(|b| ViewSettings {
            snap_to_grid: boolean(b, "bSnapToGrid", true),
            show_grid: boolean(b, "bShowGrid", true),
            show_logical_grid: boolean(b, "bShowLogicalGrid", false),
            grid_spacing: int(b, "nGridSpacing", 64, &mut ctx, None),
            show_3d_grid: boolean(b, "bShow3DGrid", false),
        })
        .unwrap_or_default();

    let world_block = doc.block("world").ok_or(Error::NoWorld)?;
    let world = world(world_block, &mut ctx);

    let mut entities = Vec::new();
    for node in doc.nodes() {
        match node {
            Node::Block(b) if b.key.text().eq_ignore_ascii_case("entity") => {
                entities.push(entity(b, false, &mut ctx));
            }
            Node::Block(b) if b.key.text().eq_ignore_ascii_case("hidden") => {
                for e in b.blocks("entity") {
                    entities.push(entity(e, true, &mut ctx));
                }
            }
            _ => {}
        }
    }

    let (cameras, active_camera) = match doc.block("cameras") {
        Some(b) => {
            let cams: Vec<Camera> = b
                .blocks("camera")
                .map(|c| Camera {
                    position: vec3_key(c, "position", &mut ctx, None),
                    look: vec3_key(c, "look", &mut ctx, None),
                })
                .collect();
            let active = b
                .value("activecamera")
                .and_then(|v| v.trim().parse::<i64>().ok())
                .filter(|&i| i >= 0 && (i as usize) < cams.len())
                .map(|i| i as usize);
            (cams, active)
        }
        None => (Vec::new(), None),
    };

    let mut cordons = Vec::new();
    let mut cordons_active = false;
    if let Some(b) = doc.block("cordons") {
        cordons_active = boolean(b, "active", false);
        for c in b.blocks("cordon") {
            let (mins, maxs) = match c.block("box") {
                Some(bx) => (
                    vec3_key(bx, "mins", &mut ctx, None),
                    vec3_key(bx, "maxs", &mut ctx, None),
                ),
                None => (Vec3::ZERO, Vec3::ZERO),
            };
            cordons.push(Cordon {
                name: c.value("name").unwrap_or("cordon").to_string(),
                active: boolean(c, "active", false),
                mins,
                maxs,
            });
        }
    } else if let Some(c) = doc.block("cordon") {
        // Pre-2013 single-cordon format.
        let active = boolean(c, "active", false);
        cordons_active = active;
        cordons.push(Cordon {
            name: "cordon".to_string(),
            active,
            mins: vec3_key(c, "mins", &mut ctx, None),
            maxs: vec3_key(c, "maxs", &mut ctx, None),
        });
    }

    Ok(Map {
        doc,
        versioninfo,
        visgroups,
        viewsettings,
        world,
        entities,
        cameras,
        active_camera,
        cordons,
        cordons_active,
        warnings: ctx.warnings,
    })
}

fn visgroups(b: &Block, ctx: &mut Ctx) -> Vec<VisGroup> {
    b.blocks("visgroup")
        .map(|v| VisGroup {
            id: int(v, "visgroupid", 0, ctx, None),
            name: v.value("name").unwrap_or_default().to_string(),
            color: color(v, "color", ctx, None),
            children: visgroups(v, ctx),
        })
        .collect()
}

fn world(b: &Block, ctx: &mut Ctx) -> World {
    let id = int(b, "id", 1, ctx, None);
    let mut w = World {
        id,
        ..World::default()
    };
    for node in b.nodes() {
        match node {
            Node::Pair(p) => {
                if !p.key.text().eq_ignore_ascii_case("id") {
                    w.keyvalues
                        .push((p.key.text().to_string(), p.value.text().to_string()));
                }
            }
            Node::Block(c) => match c.key.text().to_ascii_lowercase().as_str() {
                "solid" => w.solids.push(solid(c, false, ctx)),
                "hidden" => {
                    for s in c.blocks("solid") {
                        w.solids.push(solid(s, true, ctx));
                    }
                }
                "group" => w.groups.push(Group {
                    id: int(c, "id", 0, ctx, None),
                    editor: c
                        .block("editor")
                        .map(|e| editor(e, ctx))
                        .unwrap_or_default(),
                }),
                "editor" => w.editor = editor(c, ctx),
                _ => {}
            },
        }
    }
    w
}

fn entity(b: &Block, hidden: bool, ctx: &mut Ctx) -> Entity {
    let id = int(b, "id", 0, ctx, None);
    let mut e = Entity {
        id,
        classname: String::new(),
        keyvalues: Vec::new(),
        connections: Vec::new(),
        solids: Vec::new(),
        editor: Editor::default(),
        hidden,
    };
    for node in b.nodes() {
        match node {
            Node::Pair(p) => {
                let key = p.key.text();
                if key.eq_ignore_ascii_case("id") {
                    continue;
                }
                if key.eq_ignore_ascii_case("classname") {
                    e.classname = p.value.text().to_string();
                    continue;
                }
                e.keyvalues
                    .push((key.to_string(), p.value.text().to_string()));
            }
            Node::Block(c) => match c.key.text().to_ascii_lowercase().as_str() {
                "solid" => e.solids.push(solid(c, false, ctx)),
                "hidden" => {
                    for s in c.blocks("solid") {
                        e.solids.push(solid(s, true, ctx));
                    }
                }
                "connections" => {
                    for p in c.pairs() {
                        match connection(p.key.text(), p.value.text()) {
                            Some(conn) => e.connections.push(conn),
                            None => ctx.warn(
                                Some(id),
                                format!(
                                    "unparseable connection {:?} {:?}",
                                    p.key.text(),
                                    p.value.text()
                                ),
                            ),
                        }
                    }
                }
                "editor" => e.editor = editor(c, ctx),
                _ => {}
            },
        }
    }
    if e.classname.is_empty() {
        ctx.warn(Some(id), "entity without classname");
    }
    e
}

fn solid(b: &Block, hidden: bool, ctx: &mut Ctx) -> Solid {
    let id = int(b, "id", 0, ctx, None);
    let sides = b.blocks("side").map(|s| side(s, ctx)).collect();
    Solid {
        id,
        sides,
        editor: b
            .block("editor")
            .map(|e| editor(e, ctx))
            .unwrap_or_default(),
        hidden,
    }
}

fn side(b: &Block, ctx: &mut Ctx) -> Side {
    let id = int(b, "id", 0, ctx, None);
    let plane_points = match b.value("plane").and_then(plane_points) {
        Some(p) => p,
        None => {
            ctx.warn(
                Some(id),
                format!("bad plane {:?}", b.value("plane").unwrap_or("")),
            );
            [Vec3::ZERO; 3]
        }
    };
    let plane = Plane::from_points(plane_points[0], plane_points[1], plane_points[2]);
    if plane.is_none() {
        ctx.warn(Some(id), "plane points are collinear");
    }

    let axis = |key: &str, default: Vec3, ctx: &mut Ctx| match b.value(key) {
        Some(v) => match tex_axis(v) {
            Some(a) => a,
            None => {
                ctx.warn(Some(id), format!("bad {key} {v:?}"));
                TexAxis::new(default, 0.0, DEFAULT_SCALE)
            }
        },
        None => TexAxis::new(default, 0.0, DEFAULT_SCALE),
    };
    let (du, dv) = plane
        .map(|p| geometry::world_aligned_axes(p.normal))
        .unwrap_or((Vec3::X, -Vec3::Y));

    Side {
        id,
        plane_points,
        plane,
        material: b.value("material").unwrap_or("").to_string(),
        uaxis: axis("uaxis", du, ctx),
        vaxis: axis("vaxis", dv, ctx),
        rotation: float(b, "rotation", 0.0, ctx, Some(id)),
        lightmap_scale: int(b, "lightmapscale", 16, ctx, Some(id)),
        smoothing_groups: int(b, "smoothing_groups", 0, ctx, Some(id)),
        dispinfo: b.block("dispinfo").map(|d| dispinfo(d, id, ctx)),
        vertices_plus: b.block("vertices_plus").map(|vp| {
            vp.pairs()
                .filter(|p| p.key.text().eq_ignore_ascii_case("v"))
                .filter_map(|p| vec3(p.value.text()))
                .collect()
        }),
    }
}

fn dispinfo(b: &Block, side_id: u32, ctx: &mut Ctx) -> DispInfo {
    let power = int::<u8>(b, "power", 2, ctx, Some(side_id)).clamp(2, 4);
    let n = (1usize << power) + 1;

    let rows_f64 = |key: &str, ctx: &mut Ctx| -> Vec<Vec<f64>> {
        let Some(blk) = b.block(key) else {
            return Vec::new();
        };
        (0..n)
            .map(|r| {
                blk.value(&format!("row{r}"))
                    .map(floats)
                    .unwrap_or_else(|| {
                        ctx.warn(Some(side_id), format!("dispinfo {key} missing row{r}"));
                        Vec::new()
                    })
            })
            .collect()
    };
    let rows_vec3 = |key: &str, ctx: &mut Ctx| -> Vec<Vec<Vec3>> {
        let Some(blk) = b.block(key) else {
            return Vec::new();
        };
        (0..n)
            .map(|r| {
                let f = blk
                    .value(&format!("row{r}"))
                    .map(floats)
                    .unwrap_or_default();
                if f.len() != n * 3 && !f.is_empty() {
                    ctx.warn(
                        Some(side_id),
                        format!(
                            "dispinfo {key} row{r} has {} numbers, expected {}",
                            f.len(),
                            n * 3
                        ),
                    );
                }
                f.chunks_exact(3)
                    .map(|c| Vec3::new(c[0], c[1], c[2]))
                    .collect()
            })
            .collect()
    };

    DispInfo {
        power,
        start_position: b
            .value("startposition")
            .and_then(bracket_vec3)
            .unwrap_or_else(|| {
                ctx.warn(Some(side_id), "dispinfo without startposition");
                Vec3::ZERO
            }),
        flags: int(b, "flags", 0, ctx, Some(side_id)),
        elevation: float(b, "elevation", 0.0, ctx, Some(side_id)),
        subdiv: boolean(b, "subdiv", false),
        normals: rows_vec3("normals", ctx),
        distances: rows_f64("distances", ctx),
        offsets: rows_vec3("offsets", ctx),
        offset_normals: rows_vec3("offset_normals", ctx),
        alphas: rows_f64("alphas", ctx),
        triangle_tags: b
            .block("triangle_tags")
            .map(|t| {
                (0..n.saturating_sub(1))
                    .map(|r| {
                        t.value(&format!("row{r}"))
                            .map(|v| {
                                v.split_whitespace()
                                    .filter_map(|x| x.parse().ok())
                                    .collect()
                            })
                            .unwrap_or_default()
                    })
                    .collect()
            })
            .unwrap_or_default(),
        allowed_verts: b
            .block("allowed_verts")
            .and_then(|a| a.value("10"))
            .map(|v| {
                v.split_whitespace()
                    .filter_map(|x| x.parse().ok())
                    .collect()
            })
            .unwrap_or_default(),
    }
}

fn editor(b: &Block, ctx: &mut Ctx) -> Editor {
    Editor {
        color: color(b, "color", ctx, None),
        visgroup_ids: b
            .pairs()
            .filter(|p| p.key.text().eq_ignore_ascii_case("visgroupid"))
            .filter_map(|p| p.value.text().trim().parse().ok())
            .collect(),
        visgroup_shown: boolean(b, "visgroupshown", true),
        visgroup_auto_shown: boolean(b, "visgroupautoshown", true),
        group_id: b.value("groupid").and_then(|v| v.trim().parse().ok()),
        comments: b.value("comments").map(str::to_string),
        logical_pos: b.value("logicalpos").and_then(|v| {
            let f = floats(v.trim().trim_start_matches('[').trim_end_matches(']'));
            (f.len() == 2).then(|| [f[0], f[1]])
        }),
    }
}

/// `"target,input,parameter,delay,times"`; Hammer 2013+ may separate with
/// ESC (0x1B) instead of commas. Fields beyond the first two are optional.
pub(crate) fn connection(output: &str, value: &str) -> Option<Connection> {
    let esc = value.contains('\u{1b}');
    let sep = if esc { '\u{1b}' } else { ',' };
    let mut parts = value.split(sep);
    let target = parts.next()?.to_string();
    let input = parts.next()?.to_string();
    let parameter = parts.next().unwrap_or("").to_string();
    // Some tools append a stale comma-separated tail to ESC-separated lines
    // ("...\x1b-1,,,0,-1"); in ESC mode a numeric field ends at the first comma.
    let numeric = |s: &str| -> String {
        let s = s.trim();
        if esc {
            s.split(',').next().unwrap_or("").trim().to_string()
        } else {
            s.to_string()
        }
    };
    let delay = match parts.next().map(numeric) {
        None => 0.0,
        Some(s) if s.is_empty() => 0.0,
        Some(s) => s.parse().ok()?,
    };
    let times_to_fire = match parts.next().map(numeric) {
        None => -1,
        Some(s) if s.is_empty() => -1,
        Some(s) => s.parse().ok()?,
    };
    Some(Connection {
        output: output.to_string(),
        target,
        input,
        parameter,
        delay,
        times_to_fire,
    })
}

// ---------------------------------------------------------------------------
// Value parsers
// ---------------------------------------------------------------------------

/// `"x y z"`.
pub(crate) fn vec3(s: &str) -> Option<Vec3> {
    let f = floats(s);
    (f.len() == 3).then(|| Vec3::new(f[0], f[1], f[2]))
}

/// `"[x y z]"` or `"(x y z)"`: displacement start positions and logical
/// positions use brackets, cordon bounds use parentheses.
fn bracket_vec3(s: &str) -> Option<Vec3> {
    vec3(
        s.trim()
            .trim_start_matches(['[', '('])
            .trim_end_matches([']', ')']),
    )
}

/// `"(x y z) (x y z) (x y z)"`.
fn plane_points(s: &str) -> Option<[Vec3; 3]> {
    let cleaned: String = s
        .chars()
        .map(|c| if c == '(' || c == ')' { ' ' } else { c })
        .collect();
    let f = floats(&cleaned);
    (f.len() == 9).then(|| {
        [
            Vec3::new(f[0], f[1], f[2]),
            Vec3::new(f[3], f[4], f[5]),
            Vec3::new(f[6], f[7], f[8]),
        ]
    })
}

/// `"[x y z shift] scale"`.
fn tex_axis(s: &str) -> Option<TexAxis> {
    let close = s.find(']')?;
    let inner = &s[s.find('[')? + 1..close];
    let f = floats(inner);
    if f.len() != 4 {
        return None;
    }
    let scale = s[close + 1..].trim().parse::<f64>().ok()?;
    Some(TexAxis::new(Vec3::new(f[0], f[1], f[2]), f[3], scale))
}

fn floats(s: &str) -> Vec<f64> {
    s.split_whitespace().filter_map(parse_f64).collect()
}

/// Accepts what Hammer writes, including the occasional `1.#INF`-style
/// garbage, which becomes `NaN`-free `0.0` rather than a parse failure.
fn parse_f64(s: &str) -> Option<f64> {
    match s.parse::<f64>() {
        Ok(v) if v.is_finite() => Some(v),
        Ok(_) => Some(0.0),
        Err(_) if s.contains("#INF") || s.contains("#IND") || s.contains("#QNAN") => Some(0.0),
        Err(_) => None,
    }
}

fn int<T: std::str::FromStr + Copy>(
    b: &Block,
    key: &str,
    default: T,
    ctx: &mut Ctx,
    object_id: Option<u32>,
) -> T {
    match b.value(key) {
        None => default,
        Some(v) => {
            let t = v.trim();
            // Hammer sometimes writes integers as "16.0".
            t.parse::<T>()
                .ok()
                .or_else(|| {
                    t.parse::<f64>()
                        .ok()
                        .and_then(|f| format!("{}", f as i64).parse().ok())
                })
                .unwrap_or_else(|| {
                    ctx.warn(object_id, format!("bad integer {key} {v:?}"));
                    default
                })
        }
    }
}

fn float(b: &Block, key: &str, default: f64, ctx: &mut Ctx, object_id: Option<u32>) -> f64 {
    match b.value(key) {
        None => default,
        Some(v) => parse_f64(v.trim()).unwrap_or_else(|| {
            ctx.warn(object_id, format!("bad number {key} {v:?}"));
            default
        }),
    }
}

fn boolean(b: &Block, key: &str, default: bool) -> bool {
    match b.value(key).map(str::trim) {
        None => default,
        Some("1") | Some("true") => true,
        Some("0") | Some("false") => false,
        Some(other) => other.parse::<f64>().map(|f| f != 0.0).unwrap_or(default),
    }
}

fn color(b: &Block, key: &str, ctx: &mut Ctx, object_id: Option<u32>) -> Rgb {
    match b.value(key) {
        None => Rgb::default(),
        Some(v) => {
            let f = floats(v);
            if f.len() >= 3 {
                Rgb {
                    r: f[0].clamp(0.0, 255.0) as u8,
                    g: f[1].clamp(0.0, 255.0) as u8,
                    b: f[2].clamp(0.0, 255.0) as u8,
                }
            } else {
                ctx.warn(object_id, format!("bad color {key} {v:?}"));
                Rgb::default()
            }
        }
    }
}

fn vec3_key(b: &Block, key: &str, ctx: &mut Ctx, object_id: Option<u32>) -> Vec3 {
    match b.value(key) {
        None => Vec3::ZERO,
        Some(v) => bracket_vec3(v).or_else(|| vec3(v)).unwrap_or_else(|| {
            ctx.warn(object_id, format!("bad vector {key} {v:?}"));
            Vec3::ZERO
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn value_parsers() {
        assert_eq!(vec3("1 2.5 -3"), Some(Vec3::new(1.0, 2.5, -3.0)));
        assert_eq!(vec3("1 2"), None);
        assert_eq!(
            bracket_vec3("[-64 -64 0]"),
            Some(Vec3::new(-64.0, -64.0, 0.0))
        );
        assert_eq!(
            bracket_vec3("(-1024 -1024 -1024)"),
            Some(Vec3::splat(-1024.0))
        );
        let p = plane_points("(-512 512 -64) (512 512 -64) (512 -512 -64)").unwrap();
        assert_eq!(p[2], Vec3::new(512.0, -512.0, -64.0));
        assert!(plane_points("(1 2 3) (4 5 6)").is_none());
        let a = tex_axis("[0 -1 0 32.5] 0.25").unwrap();
        assert_eq!(a.axis, -Vec3::Y);
        assert_eq!(a.shift, 32.5);
        assert_eq!(a.scale, 0.25);
        assert!(tex_axis("[0 -1 0] 0.25").is_none());
        assert_eq!(parse_f64("1.#INF"), Some(0.0));
        assert_eq!(parse_f64("abc"), None);
    }

    #[test]
    fn connections_with_commas_and_esc() {
        let c = connection("OnPressed", "door_1,Open,,0.5,-1").unwrap();
        assert_eq!(c.target, "door_1");
        assert_eq!(c.input, "Open");
        assert_eq!(c.parameter, "");
        assert_eq!(c.delay, 0.5);
        assert_eq!(c.times_to_fire, -1);

        let c = connection("OnTrigger", "relay\u{1b}Trigger\u{1b}a,b\u{1b}2\u{1b}1").unwrap();
        assert_eq!(c.target, "relay");
        assert_eq!(c.parameter, "a,b");
        assert_eq!(c.delay, 2.0);
        assert_eq!(c.times_to_fire, 1);

        // ESC-separated with a stale comma tail, seen in the corpus.
        let c = connection(
            "OnMapSpawn",
            "tonemap\u{1b}SetBloomScale\u{1b}.7\u{1b}0\u{1b}-1,,,0,-1",
        )
        .unwrap();
        assert_eq!(c.parameter, ".7");
        assert_eq!(c.delay, 0.0);
        assert_eq!(c.times_to_fire, -1);

        // Short forms Hammer never writes but other tools do.
        let c = connection("OnTrigger", "door,Open").unwrap();
        assert_eq!(c.delay, 0.0);
        assert_eq!(c.times_to_fire, -1);
        assert!(connection("OnTrigger", "door").is_none());
        assert!(connection("OnTrigger", "door,Open,,x,-1").is_none());
    }
}
