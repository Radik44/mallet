//! Displacement surfaces: creating a flat `dispinfo` over a quad face,
//! laying its vertex grid out the way the engine does, and sculpting it.

use geometry::Vec3;
use vmf::DispInfo;

/// The vertex grid of a displacement, `(2^power + 1)^2` points in row-major
/// order, row 0 starting at the corner nearest `startposition`.
pub fn grid_positions(disp: &DispInfo, quad: &[Vec3], face_normal: Vec3) -> Vec<Vec3> {
    let n = disp.verts_per_edge();
    let c = ordered_corners(quad, disp.start_position);
    let has_normals = disp.normals.len() == n && disp.normals.iter().all(|r| r.len() == n);
    let has_offsets = disp.offsets.len() == n && disp.offsets.iter().all(|r| r.len() == n);
    let has_dist = disp.distances.len() == n && disp.distances.iter().all(|r| r.len() == n);
    let mut grid = Vec::with_capacity(n * n);
    for row in 0..n {
        let t = row as f64 / (n - 1) as f64;
        let row_start = c[0].lerp(c[3], t);
        let row_end = c[1].lerp(c[2], t);
        for col in 0..n {
            let s = col as f64 / (n - 1) as f64;
            let mut p = row_start.lerp(row_end, s);
            if has_dist {
                let dir = if has_normals {
                    disp.normals[row][col]
                } else {
                    face_normal
                };
                p += dir * disp.distances[row][col];
            }
            if has_offsets {
                p += disp.offsets[row][col];
            }
            p += face_normal * disp.elevation;
            grid.push(p);
        }
    }
    grid
}

/// The quad rotated so corner 0 is the one nearest `start`.
pub fn ordered_corners(quad: &[Vec3], start: Vec3) -> [Vec3; 4] {
    let first = (0..4)
        .min_by(|&a, &b| {
            quad[a]
                .distance(start)
                .partial_cmp(&quad[b].distance(start))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap_or(0);
    [
        quad[first],
        quad[(first + 1) % 4],
        quad[(first + 2) % 4],
        quad[(first + 3) % 4],
    ]
}

/// A flat displacement over the quad, as Hammer's "Create" makes it: zero
/// distances along zero normals, offset normals along the face, walkable
/// triangles, every vertex allowed. The start corner is the lowest one
/// (smallest x, then y, then z), which keeps files deterministic.
pub fn new_dispinfo(power: u8, quad: &[Vec3], face_normal: Vec3) -> DispInfo {
    let power = power.clamp(2, 4);
    let n = (1usize << power) + 1;
    let start = quad
        .iter()
        .copied()
        .min_by(|a, b| {
            (a.x, a.y, a.z)
                .partial_cmp(&(b.x, b.y, b.z))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap_or(Vec3::ZERO);
    DispInfo {
        power,
        start_position: start,
        flags: 0,
        elevation: 0.0,
        subdiv: false,
        normals: vec![vec![Vec3::ZERO; n]; n],
        distances: vec![vec![0.0; n]; n],
        offsets: vec![vec![Vec3::ZERO; n]; n],
        offset_normals: vec![vec![face_normal; n]; n],
        alphas: vec![vec![0.0; n]; n],
        triangle_tags: vec![vec![9; 2 * (n - 1)]; n - 1],
        allowed_verts: vec![-1; 10],
    }
}

/// Which way a sculpt stroke pushes vertices.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PaintAxis {
    /// Along the face's normal (Hammer's default).
    FaceNormal,
    /// Straight up.
    Up,
    Custom(Vec3),
    /// Hammer's Smooth: each vertex moves towards the average of its
    /// neighbours; `amount` (units) sets the strength, 32 is a full blend.
    Smooth,
}

/// Hammer's "Paint Geometry" with a soft brush: vertices whose base grid
/// point lies within `radius` of `centre` (measured in the face's plane, so
/// the brush footprint does not change with height) move by up to `amount`
/// along `axis`, fading to the rim. Returns false when no vertex was in reach.
pub fn paint(
    disp: &mut DispInfo,
    quad: &[Vec3],
    face_normal: Vec3,
    centre: Vec3,
    radius: f64,
    amount: f64,
    axis: PaintAxis,
) -> bool {
    let n = disp.verts_per_edge();
    if radius <= 0.0 || amount == 0.0 {
        return false;
    }
    let dir = match axis {
        PaintAxis::FaceNormal | PaintAxis::Smooth => face_normal,
        PaintAxis::Up => Vec3::Z,
        PaintAxis::Custom(v) => v.try_normalize().unwrap_or(face_normal),
    };
    ensure_rows(disp, face_normal);
    // Displacement vectors before the stroke, for the smoothing average.
    let vectors: Vec<Vec<Vec3>> = (0..n)
        .map(|r| {
            (0..n)
                .map(|c| disp.normals[r][c] * disp.distances[r][c])
                .collect()
        })
        .collect();
    let flat = DispInfo {
        distances: Vec::new(),
        offsets: Vec::new(),
        elevation: 0.0,
        ..disp.clone()
    };
    let base = grid_positions(&flat, quad, face_normal);
    let centre = centre - face_normal * (centre - quad[0]).dot(face_normal);
    let mut touched = false;
    for row in 0..n {
        for col in 0..n {
            let d = base[row * n + col].distance(centre);
            if d > radius {
                continue;
            }
            // Smooth falloff: full strength at the centre, zero at the rim.
            let t = d / radius;
            let w = (1.0 - t * t).powi(2);
            let current = vectors[row][col];
            let next = if axis == PaintAxis::Smooth {
                let mut sum = Vec3::ZERO;
                let mut k = 0.0;
                for (dr, dc) in [(-1i64, 0i64), (1, 0), (0, -1), (0, 1)] {
                    let (r, c) = (row as i64 + dr, col as i64 + dc);
                    if r >= 0 && c >= 0 && (r as usize) < n && (c as usize) < n {
                        sum += vectors[r as usize][c as usize];
                        k += 1.0;
                    }
                }
                let strength = (amount.abs() / 32.0).clamp(0.0, 1.0) * w;
                current.lerp(sum / k, strength)
            } else {
                current + dir * (amount * w)
            };
            let len = next.length();
            if len < 1.0e-6 {
                disp.normals[row][col] = Vec3::ZERO;
                disp.distances[row][col] = 0.0;
            } else {
                disp.normals[row][col] = tidy(next / len);
                disp.distances[row][col] = tidy_f(len);
            }
            touched = true;
        }
    }
    touched
}

/// Hammer's "Paint Alpha": blends vertices within `radius` of `centre`
/// (in the face's plane) towards `amount` (0..255 is the WorldVertexTransition
/// mix) with the same soft falloff as `paint`. Returns false when nothing
/// was in reach.
pub fn paint_alpha(
    disp: &mut DispInfo,
    quad: &[Vec3],
    face_normal: Vec3,
    centre: Vec3,
    radius: f64,
    amount: f64,
) -> bool {
    let n = disp.verts_per_edge();
    if radius <= 0.0 {
        return false;
    }
    if disp.alphas.len() != n || disp.alphas.iter().any(|r| r.len() != n) {
        disp.alphas = vec![vec![0.0; n]; n];
    }
    let flat = DispInfo {
        distances: Vec::new(),
        offsets: Vec::new(),
        elevation: 0.0,
        ..disp.clone()
    };
    let base = grid_positions(&flat, quad, face_normal);
    let centre = centre - face_normal * (centre - quad[0]).dot(face_normal);
    let mut touched = false;
    for row in 0..n {
        for col in 0..n {
            let d = base[row * n + col].distance(centre);
            if d > radius {
                continue;
            }
            let t = d / radius;
            let w = (1.0 - t * t).powi(2);
            let current = disp.alphas[row][col];
            let next = (current + (amount - current) * w).clamp(0.0, 255.0);
            disp.alphas[row][col] = tidy_f(next);
            touched = true;
        }
    }
    touched
}

/// Grid cells along edge `edge` of the ordered quad (corner `edge` to
/// corner `edge + 1`), in that direction.
pub fn edge_cells(n: usize, edge: usize) -> Vec<(usize, usize)> {
    match edge % 4 {
        0 => (0..n).map(|c| (0, c)).collect(),
        1 => (0..n).map(|r| (r, n - 1)).collect(),
        2 => (0..n).rev().map(|c| (n - 1, c)).collect(),
        _ => (0..n).rev().map(|r| (r, 0)).collect(),
    }
}

/// Moves vertex `(row, col)` so it lands on `target` in world space, by
/// re-deriving its normal and distance from the flat grid point.
pub fn set_vertex_world(
    disp: &mut DispInfo,
    quad: &[Vec3],
    face_normal: Vec3,
    row: usize,
    col: usize,
    target: Vec3,
) {
    ensure_rows(disp, face_normal);
    let n = disp.verts_per_edge();
    let flat = DispInfo {
        distances: Vec::new(),
        offsets: Vec::new(),
        elevation: 0.0,
        ..disp.clone()
    };
    let base = grid_positions(&flat, quad, face_normal)[row * n + col];
    let has_offsets = disp.offsets.len() == n && disp.offsets.iter().all(|r| r.len() == n);
    let offset = if has_offsets {
        disp.offsets[row][col]
    } else {
        Vec3::ZERO
    };
    let v = target - base - offset - face_normal * disp.elevation;
    let len = v.length();
    if len < 1.0e-6 {
        disp.normals[row][col] = Vec3::ZERO;
        disp.distances[row][col] = 0.0;
    } else {
        disp.normals[row][col] = tidy(v / len);
        disp.distances[row][col] = tidy_f(len);
    }
}

/// One displacement face ready for sewing: its data, outline and normal.
pub struct SewFace<'a> {
    pub disp: &'a mut DispInfo,
    pub quad: Vec<Vec3>,
    pub normal: Vec3,
}

/// Hammer's Sew: where two displacements share a base edge (both corners
/// coincide), the vertices along it are made to coincide. The coarser side's
/// samples take the average of both surfaces; the finer side's vertices in
/// between are placed on the straight line between those samples. Returns
/// how many edges were sewn.
pub fn sew(faces: &mut [SewFace<'_>]) -> usize {
    const EPS: f64 = 0.5;
    let mut sewn = 0;
    for a in 0..faces.len() {
        for b in (a + 1)..faces.len() {
            let (first, rest) = faces.split_at_mut(b);
            let fa = &mut first[a];
            let fb = &mut rest[0];
            let ca = ordered_corners(&fa.quad, fa.disp.start_position);
            let cb = ordered_corners(&fb.quad, fb.disp.start_position);
            for ea in 0..4 {
                let (a0, a1) = (ca[ea], ca[(ea + 1) % 4]);
                for eb in 0..4 {
                    let (b0, b1) = (cb[eb], cb[(eb + 1) % 4]);
                    // Shared edges run opposite ways on neighbouring faces,
                    // but accept either direction.
                    let reversed = a0.distance(b1) < EPS && a1.distance(b0) < EPS;
                    let same = a0.distance(b0) < EPS && a1.distance(b1) < EPS;
                    if !reversed && !same {
                        continue;
                    }
                    let na = fa.disp.verts_per_edge();
                    let nb = fb.disp.verts_per_edge();
                    let cells_a = edge_cells(na, ea);
                    let mut cells_b = edge_cells(nb, eb);
                    if reversed {
                        cells_b.reverse();
                    }
                    let pa = grid_positions(fa.disp, &fa.quad, fa.normal);
                    let pb = grid_positions(fb.disp, &fb.quad, fb.normal);
                    // Sample both edges at the coarser resolution.
                    let coarse = na.min(nb);
                    let step_a = (na - 1) / (coarse - 1);
                    let step_b = (nb - 1) / (coarse - 1);
                    let mut targets = Vec::with_capacity(coarse);
                    for k in 0..coarse {
                        let (ra, cola) = cells_a[k * step_a];
                        let (rb, colb) = cells_b[k * step_b];
                        targets.push((pa[ra * na + cola] + pb[rb * nb + colb]) * 0.5);
                    }
                    // Place every edge vertex: coarse samples exactly, the
                    // rest on the line between them.
                    for (cells, face, step) in
                        [(&cells_a, &mut *fa, step_a), (&cells_b, &mut *fb, step_b)]
                    {
                        for (i, &(r, c)) in cells.iter().enumerate() {
                            let k = i / step;
                            let frac = (i % step) as f64 / step as f64;
                            let target = if frac == 0.0 || k + 1 >= targets.len() {
                                targets[k.min(targets.len() - 1)]
                            } else {
                                targets[k].lerp(targets[k + 1], frac)
                            };
                            set_vertex_world(face.disp, &face.quad, face.normal, r, c, target);
                        }
                    }
                    sewn += 1;
                }
            }
        }
    }
    sewn
}

/// Hammer's Invert: every vertex goes to the other side of the face (hills
/// become pits). Returns false for a flat displacement.
pub fn invert(disp: &mut DispInfo, face_normal: Vec3) -> bool {
    ensure_rows(disp, face_normal);
    let mut touched = false;
    for row in disp.distances.iter_mut() {
        for d in row.iter_mut() {
            if *d != 0.0 {
                *d = -*d;
                touched = true;
            }
        }
    }
    disp.elevation = -disp.elevation;
    touched || disp.elevation != 0.0
}

/// Raises the power by one (finer grid, same shape): displacement vectors,
/// offsets and alphas are interpolated bilinearly onto the new grid.
/// Returns false at the engine's limit of power 4.
pub fn subdivide(disp: &mut DispInfo, face_normal: Vec3) -> bool {
    if disp.power >= 4 {
        return false;
    }
    ensure_rows(disp, face_normal);
    let n = disp.verts_per_edge();
    let m = 2 * (n - 1) + 1;
    let full_vec = |rows: &Vec<Vec<Vec3>>| rows.len() == n && rows.iter().all(|r| r.len() == n);
    let full_f = |rows: &Vec<Vec<f64>>| rows.len() == n && rows.iter().all(|r| r.len() == n);
    let vectors: Vec<Vec<Vec3>> = (0..n)
        .map(|r| {
            (0..n)
                .map(|c| disp.normals[r][c] * disp.distances[r][c])
                .collect()
        })
        .collect();
    let sample_v = |g: &Vec<Vec<Vec3>>, r: usize, c: usize| {
        let (r0, c0) = (r / 2, c / 2);
        let (r1, c1) = (r.div_ceil(2), c.div_ceil(2));
        (g[r0][c0] + g[r0][c1] + g[r1][c0] + g[r1][c1]) / 4.0
    };
    let sample_f = |g: &Vec<Vec<f64>>, r: usize, c: usize| {
        let (r0, c0) = (r / 2, c / 2);
        let (r1, c1) = (r.div_ceil(2), c.div_ceil(2));
        (g[r0][c0] + g[r0][c1] + g[r1][c0] + g[r1][c1]) / 4.0
    };
    let mut normals = vec![vec![Vec3::ZERO; m]; m];
    let mut distances = vec![vec![0.0; m]; m];
    for r in 0..m {
        for c in 0..m {
            let v = sample_v(&vectors, r, c);
            let len = v.length();
            if len > 1.0e-6 {
                normals[r][c] = tidy(v / len);
                distances[r][c] = tidy_f(len);
            }
        }
    }
    let offsets = if full_vec(&disp.offsets) {
        (0..m)
            .map(|r| {
                (0..m)
                    .map(|c| tidy(sample_v(&disp.offsets, r, c)))
                    .collect()
            })
            .collect()
    } else {
        vec![vec![Vec3::ZERO; m]; m]
    };
    let offset_normals = vec![vec![face_normal; m]; m];
    let alphas = if full_f(&disp.alphas) {
        (0..m)
            .map(|r| {
                (0..m)
                    .map(|c| tidy_f(sample_f(&disp.alphas, r, c)))
                    .collect()
            })
            .collect()
    } else {
        vec![vec![0.0; m]; m]
    };
    disp.power += 1;
    disp.normals = normals;
    disp.distances = distances;
    disp.offsets = offsets;
    disp.offset_normals = offset_normals;
    disp.alphas = alphas;
    disp.triangle_tags = vec![vec![9; 2 * (m - 1)]; m - 1];
    true
}

/// Gives a displacement complete `normals` and `distances` rows when the
/// file left them out, so a sculpt has something to write. Other grids stay
/// as they are: the writer leaves absent blocks absent.
/// What a landscape brush does to the vertices in reach.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Sculpt {
    /// Push along `axis` by up to `amount` (negative lowers).
    Raise(PaintAxis),
    /// Towards the neighbours' average; `amount` 32 is a full blend.
    Smooth,
    /// Towards the world height `height`; `amount` 32 moves a vertex all the way.
    Flatten { height: f64 },
    /// Value noise along `axis`, up to `amount` either way; `scale` is the
    /// bump size in units.
    Noise {
        axis: PaintAxis,
        seed: u32,
        scale: f64,
    },
}

/// The landscape brush: `paint` for raising and smoothing, plus flattening
/// and noise. The footprint is measured in the face's plane like `paint`.
pub fn sculpt(
    disp: &mut DispInfo,
    quad: &[Vec3],
    face_normal: Vec3,
    centre: Vec3,
    radius: f64,
    amount: f64,
    mode: Sculpt,
) -> bool {
    match mode {
        Sculpt::Raise(axis) => return paint(disp, quad, face_normal, centre, radius, amount, axis),
        Sculpt::Smooth => {
            return paint(
                disp,
                quad,
                face_normal,
                centre,
                radius,
                amount,
                PaintAxis::Smooth,
            )
        }
        _ => {}
    }
    if radius <= 0.0 || amount == 0.0 {
        return false;
    }
    ensure_rows(disp, face_normal);
    let n = disp.verts_per_edge();
    let flat = DispInfo {
        distances: Vec::new(),
        offsets: Vec::new(),
        elevation: 0.0,
        ..disp.clone()
    };
    let base = grid_positions(&flat, quad, face_normal);
    let world = grid_positions(disp, quad, face_normal);
    let centre = centre - face_normal * (centre - quad[0]).dot(face_normal);
    let mut touched = false;
    for row in 0..n {
        for col in 0..n {
            let i = row * n + col;
            let d = base[i].distance(centre);
            if d > radius {
                continue;
            }
            let t = d / radius;
            let w = (1.0 - t * t).powi(2);
            let p = world[i];
            let target = match mode {
                Sculpt::Flatten { height } => {
                    let strength = (amount.abs() / 32.0).clamp(0.0, 1.0) * w;
                    Vec3::new(p.x, p.y, p.z + (height - p.z) * strength)
                }
                Sculpt::Noise { axis, seed, scale } => {
                    let dir = match axis {
                        PaintAxis::Up => Vec3::Z,
                        PaintAxis::Custom(v) => v.try_normalize().unwrap_or(face_normal),
                        _ => face_normal,
                    };
                    let s = scale.max(1.0);
                    let k = value_noise(p.x / s, p.y / s, seed);
                    p + dir * (amount * w * k)
                }
                _ => p,
            };
            if target.distance(p) < 1.0e-6 {
                continue;
            }
            set_vertex_world(disp, quad, face_normal, row, col, target);
            touched = true;
        }
    }
    touched
}

/// Smooth value noise in -1..1 on a unit lattice, deterministic per seed.
pub fn value_noise(x: f64, y: f64, seed: u32) -> f64 {
    fn hash(ix: i64, iy: i64, seed: u32) -> f64 {
        let mut h = (ix as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
            ^ (iy as u64).wrapping_mul(0xC2B2_AE3D_27D4_EB4F)
            ^ (seed as u64).wrapping_mul(0x1656_67B1_9E37_79F9);
        h ^= h >> 31;
        h = h.wrapping_mul(0x7FB5_D329_728E_A185);
        h ^= h >> 27;
        (h >> 11) as f64 / (1u64 << 53) as f64 * 2.0 - 1.0
    }
    let x0 = x.floor();
    let y0 = y.floor();
    let fx = x - x0;
    let fy = y - y0;
    let sx = fx * fx * (3.0 - 2.0 * fx);
    let sy = fy * fy * (3.0 - 2.0 * fy);
    let (ix, iy) = (x0 as i64, y0 as i64);
    let a = hash(ix, iy, seed);
    let b = hash(ix + 1, iy, seed);
    let c = hash(ix, iy + 1, seed);
    let d = hash(ix + 1, iy + 1, seed);
    let top = a + (b - a) * sx;
    let bottom = c + (d - c) * sx;
    top + (bottom - top) * sy
}

fn ensure_rows(disp: &mut DispInfo, face_normal: Vec3) {
    let n = disp.verts_per_edge();
    let full_vec = |rows: &Vec<Vec<Vec3>>| rows.len() == n && rows.iter().all(|r| r.len() == n);
    let full_f = |rows: &Vec<Vec<f64>>| rows.len() == n && rows.iter().all(|r| r.len() == n);
    if !full_f(&disp.distances) {
        disp.distances = vec![vec![0.0; n]; n];
    }
    if !full_vec(&disp.normals) {
        disp.normals = vec![vec![face_normal; n]; n];
    }
}

fn tidy(v: Vec3) -> Vec3 {
    (v * 1.0e4).round() / 1.0e4
}

fn tidy_f(v: f64) -> f64 {
    (v * 1.0e4).round() / 1.0e4
}

#[cfg(test)]
mod ops_tests {
    use super::*;

    fn quad() -> Vec<Vec3> {
        vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(256.0, 0.0, 0.0),
            Vec3::new(256.0, 256.0, 0.0),
            Vec3::new(0.0, 256.0, 0.0),
        ]
    }

    #[test]
    fn smooth_lowers_a_spike_and_invert_and_subdivide_keep_the_shape() {
        let q = quad();
        let mut d = new_dispinfo(2, &q, Vec3::Z);
        // A single raised vertex in the middle (row 2, col 2 of a 5×5 grid).
        assert!(paint(
            &mut d,
            &q,
            Vec3::Z,
            Vec3::new(128.0, 128.0, 0.0),
            10.0,
            64.0,
            PaintAxis::FaceNormal
        ));
        let peak = d.distances[2][2];
        assert!(peak > 60.0, "{peak}");
        assert!(paint(
            &mut d,
            &q,
            Vec3::Z,
            Vec3::new(128.0, 128.0, 0.0),
            10.0,
            32.0,
            PaintAxis::Smooth
        ));
        assert!(
            d.distances[2][2] < 1.0,
            "fully blended to the flat neighbours: {}",
            d.distances[2][2]
        );

        let mut h = new_dispinfo(2, &q, Vec3::Z);
        paint(
            &mut h,
            &q,
            Vec3::Z,
            Vec3::new(128.0, 128.0, 0.0),
            200.0,
            40.0,
            PaintAxis::FaceNormal,
        );
        let top = grid_positions(&h, &q, Vec3::Z)[12].z;
        assert!(invert(&mut h, Vec3::Z));
        assert!((grid_positions(&h, &q, Vec3::Z)[12].z + top).abs() < 1e-3);
        invert(&mut h, Vec3::Z);

        let coarse = grid_positions(&h, &q, Vec3::Z);
        assert!(subdivide(&mut h, Vec3::Z));
        assert_eq!(h.power, 3);
        assert_eq!(h.verts_per_edge(), 9);
        let fine = grid_positions(&h, &q, Vec3::Z);
        // Every old vertex is still where it was (even rows and columns of the new grid).
        for r in 0..5 {
            for c in 0..5 {
                let a = coarse[r * 5 + c];
                let b = fine[(r * 2) * 9 + c * 2];
                assert!(a.distance(b) < 1e-3, "{a:?} vs {b:?}");
            }
        }
        assert_eq!(h.triangle_tags.len(), 8);
        h.power = 4;
        assert!(!subdivide(&mut h, Vec3::Z), "power 4 is the limit");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn quad() -> Vec<Vec3> {
        vec![
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(128.0, 0.0, 0.0),
            Vec3::new(128.0, 128.0, 0.0),
            Vec3::new(0.0, 128.0, 0.0),
        ]
    }

    #[test]
    fn a_new_displacement_is_flat_and_starts_at_the_lowest_corner() {
        let d = new_dispinfo(3, &quad(), Vec3::Z);
        assert_eq!(d.verts_per_edge(), 9);
        assert_eq!(d.start_position, Vec3::ZERO);
        assert_eq!(d.triangle_tags.len(), 8);
        assert_eq!(d.triangle_tags[0].len(), 16);
        assert_eq!(d.allowed_verts, vec![-1; 10]);
        let grid = grid_positions(&d, &quad(), Vec3::Z);
        assert_eq!(grid.len(), 81);
        assert_eq!(grid[0], Vec3::ZERO);
        assert_eq!(
            grid[8],
            Vec3::new(128.0, 0.0, 0.0),
            "row 0 runs along corner 0 → 1"
        );
        assert_eq!(
            grid[72],
            Vec3::new(0.0, 128.0, 0.0),
            "rows advance along corner 0 → 3"
        );
        assert_eq!(grid[40], Vec3::new(64.0, 64.0, 0.0));
    }

    #[test]
    fn alpha_paint_blends_towards_the_target_and_clamps() {
        let mut d = new_dispinfo(2, &quad(), Vec3::Z);
        let centre = Vec3::new(64.0, 64.0, 0.0);
        assert!(paint_alpha(&mut d, &quad(), Vec3::Z, centre, 48.0, 255.0));
        assert_eq!(d.alphas[2][2], 255.0, "full strength at the centre");
        assert!(d.alphas[2][1] > 0.0 && d.alphas[2][1] < 255.0);
        assert_eq!(d.alphas[0][0], 0.0);
        assert!(paint_alpha(&mut d, &quad(), Vec3::Z, centre, 48.0, 0.0));
        assert_eq!(d.alphas[2][2], 0.0);
        assert!(!paint_alpha(
            &mut d,
            &quad(),
            Vec3::Z,
            Vec3::new(900.0, 0.0, 0.0),
            8.0,
            255.0
        ));
    }

    #[test]
    fn sewing_joins_the_shared_edge_of_two_displacements() {
        // Two 128-unit squares side by side along X, power 2 and power 3.
        let left = quad();
        let right = vec![
            Vec3::new(128.0, 0.0, 0.0),
            Vec3::new(256.0, 0.0, 0.0),
            Vec3::new(256.0, 128.0, 0.0),
            Vec3::new(128.0, 128.0, 0.0),
        ];
        let mut a = new_dispinfo(2, &left, Vec3::Z);
        let mut b = new_dispinfo(3, &right, Vec3::Z);
        // Raise the whole left face by 32: its right edge floats above the right face's left edge.
        let flat = grid_positions(&new_dispinfo(2, &left, Vec3::Z), &left, Vec3::Z);
        for r in 0..5 {
            for c in 0..5 {
                set_vertex_world(
                    &mut a,
                    &left,
                    Vec3::Z,
                    r,
                    c,
                    flat[r * 5 + c] + Vec3::new(0.0, 0.0, 32.0),
                );
            }
        }
        let mut faces = vec![
            SewFace {
                disp: &mut a,
                quad: left.clone(),
                normal: Vec3::Z,
            },
            SewFace {
                disp: &mut b,
                quad: right.clone(),
                normal: Vec3::Z,
            },
        ];
        assert_eq!(sew(&mut faces), 1);
        let pa = grid_positions(&a, &left, Vec3::Z);
        let pb = grid_positions(&b, &right, Vec3::Z);
        // Along x = 128 both surfaces meet at z = 16 (the average), for every y.
        for &(r, c) in &edge_cells(5, 1) {
            let p = pa[r * 5 + c];
            assert!(
                (p.x - 128.0).abs() < 1e-6 && (p.z - 16.0).abs() < 1e-6,
                "{p}"
            );
        }
        for &(r, c) in &edge_cells(9, 3) {
            let p = pb[r * 9 + c];
            assert!(
                (p.x - 128.0).abs() < 1e-6 && (p.z - 16.0).abs() < 1e-6,
                "{p}"
            );
        }
        // The far edges are untouched: left still at 32, right still at 0.
        assert!((pa[0].z - 32.0).abs() < 1e-6);
        assert!(pb[8].z.abs() < 1e-6);
    }

    #[test]
    fn painting_raises_the_middle_and_fades_to_the_rim() {
        let mut d = new_dispinfo(2, &quad(), Vec3::Z);
        let centre = Vec3::new(64.0, 64.0, 0.0);
        assert!(paint(
            &mut d,
            &quad(),
            Vec3::Z,
            centre,
            48.0,
            16.0,
            PaintAxis::FaceNormal
        ));
        assert_eq!(
            d.distances[2][2], 16.0,
            "the centre vertex gets the full amount"
        );
        assert_eq!(d.normals[2][2], Vec3::Z);
        assert!(d.distances[2][1] > 0.0 && d.distances[2][1] < 16.0);
        assert_eq!(d.distances[0][0], 0.0, "corners are outside the radius");
        let grid = grid_positions(&d, &quad(), Vec3::Z);
        assert_eq!(grid[12].z, 16.0);
        // Lowering by the same amount flattens it again.
        assert!(paint(
            &mut d,
            &quad(),
            Vec3::Z,
            centre,
            48.0,
            -16.0,
            PaintAxis::FaceNormal
        ));
        assert_eq!(d.distances[2][2], 0.0);
        assert!(!paint(
            &mut d,
            &quad(),
            Vec3::Z,
            Vec3::new(1000.0, 0.0, 0.0),
            8.0,
            4.0,
            PaintAxis::Up
        ));
    }
}
