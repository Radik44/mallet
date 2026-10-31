//! vmf-stats: load every VMF under a directory through the typed `vmf` layer,
//! rebuild brush geometry with the `geometry` crate and report what the real
//! world looks like: counts, warnings, invalid solids, and, for maps saved by
//! Hammer++, whether our face vertices match the `vertices_plus` it stored.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Parser;
use geometry::{SolidProblem, Vec3};
use serde::Serialize;
use walkdir::WalkDir;

/// Our vertices versus Hammer++'s must agree to this many units.
const VERTEX_TOLERANCE: f64 = 0.1;

#[derive(Parser, Debug)]
#[command(
    name = "vmf-stats",
    about = "Typed-parse and rebuild geometry for every VMF in a corpus"
)]
struct Args {
    #[arg(default_value = "testdata/corpus")]
    paths: Vec<PathBuf>,

    #[arg(long)]
    json: Option<PathBuf>,

    /// Print a line for every file, not only files with problems.
    #[arg(short, long)]
    verbose: bool,

    /// How many warnings / mismatches to print in detail.
    #[arg(long, default_value_t = 15)]
    details: usize,

    /// Dump one solid (by id) of the given file(s): planes, our polygons and
    /// Hammer++ vertices_plus, then exit.
    #[arg(long)]
    dump_solid: Option<u32>,

    /// Fail when more than this percentage of solids is invalid.
    #[arg(long)]
    max_invalid_percent: Option<f64>,

    /// Fail when more than this percentage of Hammer++ `vertices_plus` sides
    /// disagrees with our geometry.
    #[arg(long)]
    max_mismatch_percent: Option<f64>,

    /// Fail on any typed-layer warning.
    #[arg(long)]
    no_warnings: bool,
}

#[derive(Serialize, Debug, Default, Clone)]
struct FileStats {
    path: String,
    size: u64,
    parse_ms: f64,
    geometry_ms: f64,
    editor_build: u32,
    solids: usize,
    sides: usize,
    displacement_sides: usize,
    point_entities: usize,
    brush_entities: usize,
    connections: usize,
    warnings: usize,
    invalid_solids: usize,
    problems: BTreeMap<String, usize>,
    vertices_plus_sides: usize,
    vertices_plus_mismatches: usize,
    /// Sides whose stored vertices were rejected as hints (off plane, outside
    /// the brush, non-convex), so the plane arithmetic was used instead.
    vertices_plus_rejected: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize, Debug, Default)]
struct Totals {
    files: usize,
    failed_files: usize,
    solids: usize,
    sides: usize,
    displacement_sides: usize,
    point_entities: usize,
    brush_entities: usize,
    connections: usize,
    warnings: usize,
    invalid_solids: usize,
    problems: BTreeMap<String, usize>,
    vertices_plus_sides: usize,
    vertices_plus_mismatches: usize,
    vertices_plus_rejected: usize,
    /// Mismatches where we produced no face at all for a side Hammer++ has vertices for.
    vertices_plus_missing_face: usize,
    /// Mismatches bucketed by the farthest Hammer++ vertex from any of ours:
    /// up to 0.5, 2, 10 units, and beyond.
    vertices_plus_by_distance: [usize; 4],
    vertices_plus_max_distance: f64,
    parse_ms: f64,
    geometry_ms: f64,
}

struct Detail {
    file: String,
    text: String,
}

struct Mismatch {
    detail: Detail,
    /// `None` when we had no face; otherwise the farthest missing vertex.
    distance: Option<f64>,
}

fn main() {
    let args = Args::parse();
    let files = collect_files(&args.paths);
    if files.is_empty() {
        eprintln!("no .vmf files under {:?}", args.paths);
        std::process::exit(2);
    }

    if let Some(id) = args.dump_solid {
        for path in &files {
            dump_solid(path, id);
        }
        return;
    }

    let mut reports = Vec::with_capacity(files.len());
    let mut totals = Totals::default();
    let mut warning_details: Vec<Detail> = Vec::new();
    let mut mismatch_details: Vec<Mismatch> = Vec::new();
    let mut rejected_details: Vec<Detail> = Vec::new();

    for path in &files {
        let (stats, warns, mismatches, rejected) = analyze(path);
        rejected_details.extend(rejected);
        totals.files += 1;
        if stats.error.is_some() {
            totals.failed_files += 1;
        }
        totals.solids += stats.solids;
        totals.sides += stats.sides;
        totals.displacement_sides += stats.displacement_sides;
        totals.point_entities += stats.point_entities;
        totals.brush_entities += stats.brush_entities;
        totals.connections += stats.connections;
        totals.warnings += stats.warnings;
        totals.invalid_solids += stats.invalid_solids;
        totals.vertices_plus_sides += stats.vertices_plus_sides;
        totals.vertices_plus_mismatches += stats.vertices_plus_mismatches;
        totals.vertices_plus_rejected += stats.vertices_plus_rejected;
        totals.parse_ms += stats.parse_ms;
        totals.geometry_ms += stats.geometry_ms;
        for (k, v) in &stats.problems {
            *totals.problems.entry(k.clone()).or_default() += v;
        }

        let noisy = stats.error.is_some()
            || stats.warnings > 0
            || stats.invalid_solids > 0
            || stats.vertices_plus_mismatches > 0;
        if args.verbose || noisy {
            match &stats.error {
                Some(e) => println!("ERROR  {}: {e}", stats.path),
                None => println!(
                    "{:>6} solids {:>7} sides {:>5} ents  invalid {:>4}  warnings {:>3}  v+ {}/{}  build {}  {}",
                    stats.solids,
                    stats.sides,
                    stats.point_entities + stats.brush_entities,
                    stats.invalid_solids,
                    stats.warnings,
                    stats.vertices_plus_sides - stats.vertices_plus_mismatches,
                    stats.vertices_plus_sides,
                    stats.editor_build,
                    stats.path
                ),
            }
        }
        warning_details.extend(warns);
        for m in &mismatches {
            match m.distance {
                None => totals.vertices_plus_missing_face += 1,
                Some(d) => {
                    let bucket = if d <= 0.5 {
                        0
                    } else if d <= 2.0 {
                        1
                    } else if d <= 10.0 {
                        2
                    } else {
                        3
                    };
                    totals.vertices_plus_by_distance[bucket] += 1;
                    totals.vertices_plus_max_distance = totals.vertices_plus_max_distance.max(d);
                }
            }
        }
        mismatch_details.extend(mismatches);
        reports.push(stats);
    }
    // Worst mismatches first, so the details show what matters.
    mismatch_details.sort_by(|a, b| {
        b.distance
            .unwrap_or(f64::INFINITY)
            .partial_cmp(&a.distance.unwrap_or(f64::INFINITY))
            .unwrap()
    });

    if !warning_details.is_empty() {
        let mut kinds: BTreeMap<String, usize> = BTreeMap::new();
        for d in &warning_details {
            *kinds.entry(warning_kind(&d.text)).or_default() += 1;
        }
        println!("\nwarnings by kind:");
        for (k, n) in &kinds {
            println!("  {n:>6}  {k}");
        }
        println!(
            "warnings ({} total, first {}):",
            warning_details.len(),
            args.details.min(warning_details.len())
        );
        for d in warning_details.iter().take(args.details) {
            println!("  {}: {}", d.file, d.text);
        }
    }
    if !mismatch_details.is_empty() {
        println!(
            "\nvertices_plus mismatches ({} total, first {}):",
            mismatch_details.len(),
            args.details.min(mismatch_details.len())
        );
        for m in mismatch_details.iter().take(args.details) {
            println!("  {}: {}", m.detail.file, m.detail.text);
        }
    }

    println!();
    println!(
        "files {} (failed {})  solids {}  sides {} (displacements {})  entities {} point + {} brush  connections {}",
        totals.files,
        totals.failed_files,
        totals.solids,
        totals.sides,
        totals.displacement_sides,
        totals.point_entities,
        totals.brush_entities,
        totals.connections
    );
    println!(
        "warnings {}  invalid solids {} ({:.3}%)  problems: {}",
        totals.warnings,
        totals.invalid_solids,
        if totals.solids > 0 {
            totals.invalid_solids as f64 * 100.0 / totals.solids as f64
        } else {
            0.0
        },
        totals
            .problems
            .iter()
            .map(|(k, v)| format!("{k} {v}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    println!(
        "vertices_plus: {} sides checked, plane arithmetic mismatched {}: no face {}, farthest vertex <=0.5: {}, <=2: {}, <=10: {}, >10: {} (max {:.2} units); shown geometry rejected {} stored sides",
        totals.vertices_plus_sides,
        totals.vertices_plus_mismatches,
        totals.vertices_plus_missing_face,
        totals.vertices_plus_by_distance[0],
        totals.vertices_plus_by_distance[1],
        totals.vertices_plus_by_distance[2],
        totals.vertices_plus_by_distance[3],
        totals.vertices_plus_max_distance,
        totals.vertices_plus_rejected
    );
    if !rejected_details.is_empty() && args.details > 0 {
        println!(
            "
stored vertices not shown as stored ({} total, first {}):",
            rejected_details.len(),
            args.details.min(rejected_details.len())
        );
        for d in rejected_details.iter().take(args.details) {
            println!("  {}: {}", d.file, d.text);
        }
    }
    println!(
        "typed parse {:.0} ms, geometry {:.0} ms",
        totals.parse_ms, totals.geometry_ms
    );

    if let Some(json) = &args.json {
        #[derive(Serialize)]
        struct Out<'a> {
            totals: &'a Totals,
            files: &'a [FileStats],
        }
        let text = serde_json::to_string_pretty(&Out {
            totals: &totals,
            files: &reports,
        })
        .expect("serialize");
        std::fs::write(json, text).unwrap_or_else(|e| {
            eprintln!("cannot write {}: {e}", json.display());
            std::process::exit(2);
        });
    }

    let mut failed = totals.failed_files > 0;
    let pct = |part: usize, whole: usize| {
        if whole == 0 {
            0.0
        } else {
            part as f64 * 100.0 / whole as f64
        }
    };
    if let Some(max) = args.max_invalid_percent {
        let p = pct(totals.invalid_solids, totals.solids);
        if p > max {
            println!("FAIL: {p:.3}% invalid solids exceeds {max}%");
            failed = true;
        }
    }
    if let Some(max) = args.max_mismatch_percent {
        let p = pct(totals.vertices_plus_mismatches, totals.vertices_plus_sides);
        if p > max {
            println!("FAIL: {p:.3}% vertices_plus mismatches exceeds {max}%");
            failed = true;
        }
    }
    if args.no_warnings && totals.warnings > 0 {
        println!("FAIL: {} warnings", totals.warnings);
        failed = true;
    }
    std::process::exit(if failed { 1 } else { 0 });
}

fn collect_files(paths: &[PathBuf]) -> Vec<PathBuf> {
    let mut files = Vec::new();
    for p in paths {
        if p.is_file() {
            files.push(p.clone());
            continue;
        }
        for e in WalkDir::new(p).into_iter().filter_map(Result::ok) {
            if e.file_type().is_file()
                && e.path()
                    .extension()
                    .and_then(|x| x.to_str())
                    .is_some_and(|x| x.eq_ignore_ascii_case("vmf"))
            {
                files.push(e.into_path());
            }
        }
    }
    files.sort();
    files
}

fn analyze(path: &Path) -> (FileStats, Vec<Detail>, Vec<Mismatch>, Vec<Detail>) {
    let display = path.display().to_string().replace('\\', "/");
    let mut stats = FileStats {
        path: display.clone(),
        ..FileStats::default()
    };
    let mut warns = Vec::new();
    let mut mismatches = Vec::new();
    let mut rejected = Vec::new();

    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            stats.error = Some(e.to_string());
            return (stats, warns, mismatches, rejected);
        }
    };
    stats.size = bytes.len() as u64;
    let text = match std::str::from_utf8(&bytes) {
        Ok(s) => s.to_string(),
        Err(_) => bytes.iter().map(|&b| b as char).collect(),
    };

    let started = Instant::now();
    let map = match vmf::Map::parse(&text) {
        Ok(m) => m,
        Err(e) => {
            stats.error = Some(e.to_string());
            return (stats, warns, mismatches, rejected);
        }
    };
    stats.parse_ms = started.elapsed().as_secs_f64() * 1000.0;

    stats.editor_build = map.versioninfo.editor_build;
    stats.warnings = map.warnings.len();
    for w in &map.warnings {
        warns.push(Detail {
            file: display.clone(),
            text: w.to_string(),
        });
    }
    for e in &map.entities {
        if e.is_brush_entity() {
            stats.brush_entities += 1;
        } else {
            stats.point_entities += 1;
        }
        stats.connections += e.connections.len();
    }

    let started = Instant::now();
    for solid in map.solids() {
        stats.solids += 1;
        stats.sides += solid.sides.len();
        stats.displacement_sides += solid.sides.iter().filter(|s| s.dispinfo.is_some()).count();

        // The mismatch metric measures the plane arithmetic alone; the hinted
        // geometry (what the editor shows) is checked separately for rejected hints.
        let g = solid.geometry_from_planes();
        if !g.is_valid() {
            stats.invalid_solids += 1;
            for p in &g.problems {
                *stats.problems.entry(problem_kind(p)).or_default() += 1;
            }
        }
        let hinted = solid.geometry();

        for (i, side) in solid.sides.iter().enumerate() {
            let Some(expected) = &side.vertices_plus else {
                continue;
            };
            stats.vertices_plus_sides += 1;
            let shown = hinted.faces.get(i).and_then(|f| f.as_ref());
            if let Some((text, _)) =
                compare_vertices(expected, shown.map(|f| f.vertices.as_slice()))
            {
                stats.vertices_plus_rejected += 1;
                rejected.push(Detail {
                    file: display.clone(),
                    text: format!("solid {} side {}: {text}", solid.id, side.id),
                });
            }
            let ours = g.faces.get(i).and_then(|f| f.as_ref());
            if let Some((text, distance)) =
                compare_vertices(expected, ours.map(|f| f.vertices.as_slice()))
            {
                stats.vertices_plus_mismatches += 1;
                mismatches.push(Mismatch {
                    detail: Detail {
                        file: display.clone(),
                        text: format!("solid {} side {}: {text}", solid.id, side.id),
                    },
                    distance,
                });
            }
        }
    }
    stats.geometry_ms = started.elapsed().as_secs_f64() * 1000.0;

    (stats, warns, mismatches, rejected)
}

/// The message without the object id prefix and without the quoted value.
fn warning_kind(text: &str) -> String {
    let text = match text.find("] ") {
        Some(i) if text.starts_with('[') => &text[i + 2..],
        _ => text,
    };
    text.split(" \"").next().unwrap_or(text).to_string()
}

fn dump_solid(path: &Path, id: u32) {
    let Ok(text) = std::fs::read_to_string(path) else {
        return;
    };
    let Ok(map) = vmf::Map::parse(&text) else {
        return;
    };
    let Some(solid) = map.solids().find(|s| s.id == id) else {
        return;
    };
    println!(
        "{}: solid {id}, {} sides, hidden {}",
        path.display(),
        solid.sides.len(),
        solid.hidden
    );
    let g = solid.geometry();
    println!("  problems: {:?}", g.problems);
    for (i, side) in solid.sides.iter().enumerate() {
        println!(
            "  side {} ({}) plane {:?} {:?} {:?}",
            side.id,
            side.material,
            side.plane_points[0],
            side.plane_points[1],
            side.plane_points[2]
        );
        match &side.plane {
            Some(p) => println!(
                "    normal {:.6} {:.6} {:.6} dist {:.4}",
                p.normal.x, p.normal.y, p.normal.z, p.dist
            ),
            None => println!("    no plane"),
        }
        match g.faces.get(i).and_then(|f| f.as_ref()) {
            Some(f) => {
                println!("    ours ({}):", f.len());
                for v in &f.vertices {
                    println!("      {:.4} {:.4} {:.4}", v.x, v.y, v.z);
                }
            }
            None => println!("    ours: no face"),
        }
        if let Some(vp) = &side.vertices_plus {
            println!("    vertices_plus ({}):", vp.len());
            for v in vp {
                let off = side.plane.map(|p| p.distance(*v)).unwrap_or(f64::NAN);
                println!(
                    "      {:.4} {:.4} {:.4}   off plane {:+.4}",
                    v.x, v.y, v.z, off
                );
            }
        }
    }
}

fn problem_kind(p: &SolidProblem) -> String {
    match p {
        SolidProblem::TooFewSides(_) => "too_few_sides",
        SolidProblem::InvalidPlane { .. } => "invalid_plane",
        SolidProblem::FaceDoesNotContribute { .. } => "face_does_not_contribute",
        SolidProblem::DuplicatePlane { .. } => "duplicate_plane",
        SolidProblem::Unbounded => "unbounded",
    }
    .to_string()
}

/// `None` when every Hammer++ vertex has a counterpart within tolerance and
/// the counts match; otherwise a description and the farthest missing
/// vertex's distance (`None` when we have no face at all).
fn compare_vertices(expected: &[Vec3], ours: Option<&[Vec3]>) -> Option<(String, Option<f64>)> {
    let Some(ours) = ours else {
        return Some((
            format!("Hammer++ has {} vertices, we have no face", expected.len()),
            None,
        ));
    };
    let missing: Vec<&Vec3> = expected
        .iter()
        .filter(|e| !ours.iter().any(|o| o.distance(**e) <= VERTEX_TOLERANCE))
        .collect();
    // A vertex of ours on an edge of the stored polygon (a T-junction fix)
    // does not change the face's shape and is not an extra.
    let extra = ours
        .iter()
        .filter(|o| !expected.iter().any(|e| e.distance(**o) <= VERTEX_TOLERANCE))
        .filter(|o| !on_polygon_edge(**o, expected))
        .count();
    if missing.is_empty() && extra == 0 {
        return None;
    }
    let worst = missing
        .iter()
        .map(|e| {
            ours.iter()
                .map(|o| o.distance(**e))
                .fold(f64::INFINITY, f64::min)
        })
        .fold(0.0, f64::max);
    Some((
        format!(
            "Hammer++ {} vertices, ours {}, {} missing (farthest {:.3} units), {} extra",
            expected.len(),
            ours.len(),
            missing.len(),
            worst,
            extra
        ),
        Some(worst),
    ))
}

/// Whether `p` lies on one of the polygon's edges within [`VERTEX_TOLERANCE`].
fn on_polygon_edge(p: Vec3, polygon: &[Vec3]) -> bool {
    let n = polygon.len();
    if n < 2 {
        return false;
    }
    (0..n).any(|i| {
        let a = polygon[i];
        let b = polygon[(i + 1) % n];
        let ab = b - a;
        let len2 = ab.length_squared();
        if len2 < 1.0e-12 {
            return a.distance(p) <= VERTEX_TOLERANCE;
        }
        let t = ((p - a).dot(ab) / len2).clamp(0.0, 1.0);
        (a + ab * t).distance(p) <= VERTEX_TOLERANCE
    })
}
