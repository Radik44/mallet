//! Import of the `.map` text format (Quake / Worldcraft / Hammer "export
//! to .map"): entities with key-values and brushes written as three plane
//! points per face. Both face flavours are read: the Valve 220 one with
//! explicit texture axes, and the classic one with offsets, rotation and
//! scale only. The result is VMF text for the normal open path.

use geometry::{Plane, Vec3};

use crate::format::fmt_vec3;

#[derive(Debug)]
pub struct Face {
    pub points: [Vec3; 3],
    pub material: String,
    pub uaxis: (Vec3, f64, f64),
    pub vaxis: (Vec3, f64, f64),
    pub rotation: f64,
}

#[derive(Debug, Default)]
pub struct Entity {
    pub keyvalues: Vec<(String, String)>,
    pub brushes: Vec<Vec<Face>>,
}

#[derive(Debug)]
pub enum Error {
    Syntax { line: usize, message: String },
    NoWorld,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Error::Syntax { line, message } => write!(f, "Строка {line}: {message}"),
            Error::NoWorld => write!(f, "В файле нет worldspawn"),
        }
    }
}

impl std::error::Error for Error {}

fn err(line: usize, message: impl Into<String>) -> Error {
    Error::Syntax {
        line,
        message: message.into(),
    }
}

/// Splits one face line into tokens: parentheses and brackets stand alone,
/// quoted texture names stay whole.
fn tokens(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for c in line.chars() {
        if quoted {
            if c == '"' {
                quoted = false;
                out.push(std::mem::take(&mut cur));
            } else {
                cur.push(c);
            }
            continue;
        }
        match c {
            '"' => quoted = true,
            '(' | ')' | '[' | ']' => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
                out.push(c.to_string());
            }
            c if c.is_whitespace() => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn num(t: Option<&String>, line: usize) -> Result<f64, Error> {
    t.and_then(|s| s.parse::<f64>().ok())
        .ok_or_else(|| err(line, "ожидалось число"))
}

/// Parses one face line: `( p ) ( p ) ( p ) TEX ...`.
fn parse_face(line_no: usize, line: &str) -> Result<Face, Error> {
    let t = tokens(line);
    let mut i = 0;
    let mut points = [Vec3::ZERO; 3];
    for p in &mut points {
        if t.get(i).map(String::as_str) != Some("(") {
            return Err(err(line_no, "ожидалась точка плоскости в круглых скобках"));
        }
        let x = num(t.get(i + 1), line_no)?;
        let y = num(t.get(i + 2), line_no)?;
        let z = num(t.get(i + 3), line_no)?;
        if t.get(i + 4).map(String::as_str) != Some(")") {
            return Err(err(line_no, "не закрыта скобка точки плоскости"));
        }
        *p = Vec3::new(x, y, z);
        i += 5;
    }
    let material = t
        .get(i)
        .cloned()
        .ok_or_else(|| err(line_no, "не указано имя текстуры"))?;
    i += 1;
    if t.get(i).map(String::as_str) == Some("[") {
        // Valve 220: [ ux uy uz uoff ] [ vx vy vz voff ] rot sx sy
        let mut axes = [(Vec3::ZERO, 0.0); 2];
        for a in &mut axes {
            if t.get(i).map(String::as_str) != Some("[") {
                return Err(err(line_no, "ожидалась ось текстуры в квадратных скобках"));
            }
            let x = num(t.get(i + 1), line_no)?;
            let y = num(t.get(i + 2), line_no)?;
            let z = num(t.get(i + 3), line_no)?;
            let off = num(t.get(i + 4), line_no)?;
            if t.get(i + 5).map(String::as_str) != Some("]") {
                return Err(err(line_no, "не закрыта скобка оси текстуры"));
            }
            *a = (Vec3::new(x, y, z), off);
            i += 6;
        }
        let rotation = num(t.get(i), line_no).unwrap_or(0.0);
        let sx = num(t.get(i + 1), line_no).unwrap_or(0.25);
        let sy = num(t.get(i + 2), line_no).unwrap_or(0.25);
        Ok(Face {
            points,
            material,
            uaxis: (axes[0].0, axes[0].1, nonzero(sx)),
            vaxis: (axes[1].0, axes[1].1, nonzero(sy)),
            rotation,
        })
    } else {
        // Classic: xoff yoff rot sx sy; the axes follow the plane's main axis.
        let xoff = num(t.get(i), line_no).unwrap_or(0.0);
        let yoff = num(t.get(i + 1), line_no).unwrap_or(0.0);
        let rotation = num(t.get(i + 2), line_no).unwrap_or(0.0);
        let sx = num(t.get(i + 3), line_no).unwrap_or(1.0);
        let sy = num(t.get(i + 4), line_no).unwrap_or(1.0);
        let normal = Plane::from_points(points[0], points[1], points[2])
            .map(|p| p.normal)
            .unwrap_or(Vec3::Z);
        let (u, v) = geometry::world_aligned_axes(normal);
        let (u, v) = rotate_axes(u, v, normal, rotation);
        Ok(Face {
            points,
            material,
            uaxis: (u, xoff, nonzero(sx)),
            vaxis: (v, yoff, nonzero(sy)),
            rotation,
        })
    }
}

fn nonzero(s: f64) -> f64 {
    if s.abs() < 1.0e-9 {
        0.25
    } else {
        s
    }
}

/// Rotates the texture axes about the face normal (Rodrigues).
fn rotate_axes(u: Vec3, v: Vec3, n: Vec3, degrees: f64) -> (Vec3, Vec3) {
    if degrees.abs() < 1.0e-9 {
        return (u, v);
    }
    let (s, c) = degrees.to_radians().sin_cos();
    let rot = |a: Vec3| a * c + n.cross(a) * s + n * n.dot(a) * (1.0 - c);
    (rot(u), rot(v))
}

/// Parses `.map` text into entities (the first with `classname worldspawn` is the world).
pub fn parse(text: &str) -> Result<Vec<Entity>, Error> {
    let mut entities = Vec::new();
    let mut entity: Option<Entity> = None;
    let mut brush: Option<Vec<Face>> = None;
    for (n, raw) in text.lines().enumerate() {
        let line_no = n + 1;
        let line = raw.trim();
        if line.is_empty() || line.starts_with("//") {
            continue;
        }
        match line {
            "{" => {
                if entity.is_none() {
                    entity = Some(Entity::default());
                } else if brush.is_none() {
                    brush = Some(Vec::new());
                } else {
                    return Err(err(line_no, "лишняя открывающая скобка"));
                }
            }
            "}" => {
                if let Some(b) = brush.take() {
                    if let Some(e) = entity.as_mut() {
                        e.brushes.push(b);
                    }
                } else if let Some(e) = entity.take() {
                    entities.push(e);
                } else {
                    return Err(err(line_no, "лишняя закрывающая скобка"));
                }
            }
            _ if brush.is_some() => {
                let face = parse_face(line_no, line)?;
                if let Some(b) = brush.as_mut() {
                    b.push(face);
                }
            }
            _ if line.starts_with('"') => {
                let parts: Vec<&str> = line.splitn(4, '"').collect();
                // "key" "value" → ["", key, " ", value"]
                let key = parts.get(1).copied().unwrap_or("").to_string();
                let value = parts
                    .get(3)
                    .map(|v| v.trim_end_matches('"').to_string())
                    .unwrap_or_default();
                match entity.as_mut() {
                    Some(e) => e.keyvalues.push((key, value)),
                    None => return Err(err(line_no, "ключ вне энтити")),
                }
            }
            _ => return Err(err(line_no, format!("нераспознанная строка: {line}"))),
        }
    }
    if entity.is_some() || brush.is_some() {
        return Err(err(text.lines().count(), "неожиданный конец файла"));
    }
    Ok(entities)
}

fn esc(s: &str) -> String {
    s.replace('"', "'")
}

fn write_solid(out: &mut String, next_id: &mut u32, faces: &[Face], indent: &str) {
    let id = *next_id;
    *next_id += 1;
    out.push_str(&format!(
        "{indent}solid\n{indent}{{\n{indent}\t\"id\" \"{id}\"\n"
    ));
    for f in faces {
        let sid = *next_id;
        *next_id += 1;
        let material = f.material.trim_start_matches('/').to_uppercase();
        out.push_str(&format!(
            "{indent}\tside\n{indent}\t{{\n{indent}\t\t\"id\" \"{sid}\"\n{indent}\t\t\"plane\" \"({}) ({}) ({})\"\n{indent}\t\t\"material\" \"{}\"\n{indent}\t\t\"uaxis\" \"[{} {}] {}\"\n{indent}\t\t\"vaxis\" \"[{} {}] {}\"\n{indent}\t\t\"rotation\" \"{}\"\n{indent}\t\t\"lightmapscale\" \"16\"\n{indent}\t\t\"smoothing_groups\" \"0\"\n{indent}\t}}\n",
            fmt_vec3(f.points[0]),
            fmt_vec3(f.points[1]),
            fmt_vec3(f.points[2]),
            esc(&material),
            fmt_vec3(f.uaxis.0),
            crate::format::fmt_g(f.uaxis.1),
            crate::format::fmt_g(f.uaxis.2),
            fmt_vec3(f.vaxis.0),
            crate::format::fmt_g(f.vaxis.1),
            crate::format::fmt_g(f.vaxis.2),
            crate::format::fmt_g(f.rotation),
        ));
    }
    out.push_str(&format!(
        "{indent}\teditor\n{indent}\t{{\n{indent}\t\t\"color\" \"0 180 0\"\n{indent}\t\t\"visgroupshown\" \"1\"\n{indent}\t\t\"visgroupautoshown\" \"1\"\n{indent}\t}}\n{indent}}}\n"
    ));
}

/// Converts `.map` text to VMF text; `skyname` fills in when the world has none.
pub fn to_vmf(text: &str) -> Result<String, Error> {
    let entities = parse(text)?;
    let world_at = entities
        .iter()
        .position(|e| {
            e.keyvalues.iter().any(|(k, v)| {
                k.eq_ignore_ascii_case("classname") && v.eq_ignore_ascii_case("worldspawn")
            })
        })
        .ok_or(Error::NoWorld)?;
    let mut next_id = 2u32;
    let mut out = String::new();
    out.push_str(
        "versioninfo\n{\n\t\"editorversion\" \"400\"\n\t\"editorbuild\" \"8864\"\n\t\"mapversion\" \"1\"\n\t\"formatversion\" \"100\"\n\t\"prefab\" \"0\"\n}\nvisgroups\n{\n}\nviewsettings\n{\n\t\"bSnapToGrid\" \"1\"\n\t\"bShowGrid\" \"1\"\n\t\"bShowLogicalGrid\" \"0\"\n\t\"nGridSpacing\" \"64\"\n\t\"bShow3DGrid\" \"0\"\n}\n",
    );
    let world = &entities[world_at];
    out.push_str(
        "world\n{\n\t\"id\" \"1\"\n\t\"mapversion\" \"1\"\n\t\"classname\" \"worldspawn\"\n",
    );
    let mut has_sky = false;
    for (k, v) in &world.keyvalues {
        if k.eq_ignore_ascii_case("classname") || k.eq_ignore_ascii_case("mapversion") {
            continue;
        }
        if k.eq_ignore_ascii_case("skyname") {
            has_sky = true;
        }
        out.push_str(&format!("\t\"{}\" \"{}\"\n", esc(k), esc(v)));
    }
    if !has_sky {
        out.push_str("\t\"skyname\" \"sky_day01_01\"\n");
    }
    for b in &world.brushes {
        write_solid(&mut out, &mut next_id, b, "\t");
    }
    out.push_str("}\n");
    for (i, e) in entities.iter().enumerate() {
        if i == world_at {
            continue;
        }
        let id = next_id;
        next_id += 1;
        out.push_str(&format!("entity\n{{\n\t\"id\" \"{id}\"\n"));
        for (k, v) in &e.keyvalues {
            out.push_str(&format!("\t\"{}\" \"{}\"\n", esc(k), esc(v)));
        }
        for b in &e.brushes {
            write_solid(&mut out, &mut next_id, b, "\t");
        }
        out.push_str("\teditor\n\t{\n\t\t\"color\" \"220 30 220\"\n\t\t\"visgroupshown\" \"1\"\n\t\t\"visgroupautoshown\" \"1\"\n\t}\n}\n");
    }
    out.push_str("cameras\n{\n\t\"activecamera\" \"-1\"\n}\ncordons\n{\n\t\"active\" \"0\"\n}\n");
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const CUBE_220: &str = r#"// Game: Half-Life 2
// Format: Valve
{
"classname" "worldspawn"
"skyname" "sky_day01_01"
{
( -64 64 64 ) ( 64 64 64 ) ( 64 -64 64 ) dev/dev_measurewall01a [ 1 0 0 0 ] [ 0 -1 0 0 ] 0 0.25 0.25
( -64 -64 -64 ) ( 64 -64 -64 ) ( 64 64 -64 ) dev/dev_measurewall01a [ 1 0 0 0 ] [ 0 -1 0 0 ] 0 0.25 0.25
( -64 64 64 ) ( -64 -64 64 ) ( -64 -64 -64 ) dev/dev_measurewall01a [ 0 1 0 0 ] [ 0 0 -1 0 ] 0 0.25 0.25
( 64 64 -64 ) ( 64 -64 -64 ) ( 64 -64 64 ) dev/dev_measurewall01a [ 0 1 0 0 ] [ 0 0 -1 0 ] 0 0.25 0.25
( 64 64 64 ) ( -64 64 64 ) ( -64 64 -64 ) dev/dev_measurewall01a [ 1 0 0 0 ] [ 0 0 -1 0 ] 0 0.25 0.25
( 64 -64 -64 ) ( -64 -64 -64 ) ( -64 -64 64 ) dev/dev_measurewall01a [ 1 0 0 0 ] [ 0 0 -1 0 ] 0 0.25 0.25
}
}
{
"classname" "info_player_start"
"origin" "0 0 128"
}
"#;

    const CUBE_QUAKE: &str = r#"{
"classname" "worldspawn"
{
( -64 64 64 ) ( 64 64 64 ) ( 64 -64 64 ) WALL1 0 0 0 1 1
( -64 -64 -64 ) ( 64 -64 -64 ) ( 64 64 -64 ) WALL1 0 0 0 1 1
( -64 64 64 ) ( -64 -64 64 ) ( -64 -64 -64 ) WALL1 0 0 0 1 1
( 64 64 -64 ) ( 64 -64 -64 ) ( 64 -64 64 ) WALL1 0 0 0 1 1
( 64 64 64 ) ( -64 64 64 ) ( -64 64 -64 ) WALL1 0 0 90 1 1
( 64 -64 -64 ) ( -64 -64 -64 ) ( -64 -64 64 ) WALL1 0 0 0 1 1
}
}
{
"classname" "func_detail"
{
( 100 10 10 ) ( 110 10 10 ) ( 110 0 10 ) WALL2 0 0 0 1 1
( 100 0 0 ) ( 110 0 0 ) ( 110 10 0 ) WALL2 0 0 0 1 1
( 100 10 10 ) ( 100 0 10 ) ( 100 0 0 ) WALL2 0 0 0 1 1
( 110 10 0 ) ( 110 0 0 ) ( 110 0 10 ) WALL2 0 0 0 1 1
( 110 10 10 ) ( 100 10 10 ) ( 100 10 0 ) WALL2 0 0 0 1 1
( 110 0 0 ) ( 100 0 0 ) ( 100 0 10 ) WALL2 0 0 0 1 1
}
}
"#;

    #[test]
    fn valve_220_map_becomes_a_valid_document() {
        let vmf = to_vmf(CUBE_220).unwrap();
        let doc = crate::Document::open(&vmf).unwrap();
        assert_eq!(doc.map().world.solids.len(), 1);
        let solid = &doc.map().world.solids[0];
        let g = solid.geometry();
        assert!(g.is_valid(), "{:?}", g.problems);
        assert_eq!(
            g.bounds().unwrap(),
            (Vec3::new(-64.0, -64.0, -64.0), Vec3::new(64.0, 64.0, 64.0))
        );
        assert_eq!(solid.sides[0].material, "DEV/DEV_MEASUREWALL01A");
        assert_eq!(solid.sides[0].uaxis.scale, 0.25);
        assert_eq!(doc.map().entities.len(), 1);
        assert_eq!(doc.map().entities[0].classname, "info_player_start");
        assert_eq!(doc.map().entities[0].get("origin"), Some("0 0 128"));
        assert_eq!(doc.map().world.get("skyname"), Some("sky_day01_01"));
    }

    #[test]
    fn quake_style_faces_get_world_aligned_axes_and_brush_entities_keep_their_brushes() {
        let vmf = to_vmf(CUBE_QUAKE).unwrap();
        let doc = crate::Document::open(&vmf).unwrap();
        assert_eq!(doc.map().world.solids.len(), 1);
        let top = &doc.map().world.solids[0].sides[0];
        assert_eq!(top.uaxis.axis, Vec3::X);
        assert_eq!(top.vaxis.axis, -Vec3::Y);
        assert_eq!(top.uaxis.scale, 1.0);
        // The rotated face turned its axes by 90° about its normal.
        let front = &doc.map().world.solids[0].sides[4];
        assert_eq!(front.rotation, 90.0);
        assert!((front.uaxis.axis.length() - 1.0).abs() < 1e-9);
        assert!(
            front.uaxis.axis.dot(Vec3::X).abs() < 1e-9,
            "{:?}",
            front.uaxis.axis
        );
        let detail = &doc.map().entities[0];
        assert_eq!(detail.classname, "func_detail");
        assert_eq!(detail.solids.len(), 1);
        assert!(detail.solids[0].geometry().is_valid());
        assert!(doc
            .problems()
            .iter()
            .all(|p| p.kind != crate::ProblemKind::InvalidSolid));
        // Ids are unique across solids, sides and entities.
        let mut ids: Vec<u32> = doc
            .map()
            .world
            .solids
            .iter()
            .flat_map(|s| s.sides.iter().map(|x| x.id).chain([s.id]))
            .collect();
        ids.push(detail.id);
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), 1 + 6 + 1);
    }

    #[test]
    fn broken_map_reports_the_line() {
        let e = to_vmf("{\n\"classname\" \"worldspawn\"\n{\n( 0 0 0 ) ( 1 0 0 ) oops\n}\n}\n")
            .unwrap_err();
        assert!(matches!(e, Error::Syntax { line: 4, .. }), "{e}");
        assert!(matches!(
            to_vmf("{\n\"classname\" \"light\"\n}\n").unwrap_err(),
            Error::NoWorld
        ));
    }
}
