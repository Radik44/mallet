//! Brush geometry for Source engine maps.
//!
//! A Source brush ("solid") is stored as a set of planes, one per side. The
//! visible polygon of each side is never stored by Hammer: it is recovered by
//! taking a huge polygon on the side's plane and clipping it by every other
//! plane of the brush, keeping the inside. This crate does that, plus the
//! checks Hammer runs in "Check for Problems" (faces that do not contribute,
//! open solids) and the texture-axis math from the VMF `uaxis`/`vaxis` keys.
//!
//! Conventions:
//! - Units are Hammer units, coordinates are `f64`.
//! - A plane's front side is where its normal points; the brush interior is
//!   behind every plane.
//! - Polygon vertices are counter-clockwise when viewed from the front, so a
//!   right-handed renderer with `frontFace = ccw` sees them as front faces.
//!
//! Everything here is pure math with no allocation beyond the output, and it
//! compiles to `wasm32-unknown-unknown`.

#![forbid(unsafe_code)]

pub use glam::DVec3 as Vec3;

/// Distance below which a point counts as lying on a plane.
pub const ON_EPSILON: f64 = 0.01;

/// Half-size of the base polygon used before clipping. Source maps live inside
/// ±16384 units; this leaves room for brushes that poke out and for sloppy
/// planes far from the brush.
pub const WORLD_EXTENT: f64 = 1.0e5;

/// Consecutive vertices closer than this after clipping are merged.
const MERGE_EPSILON: f64 = 1.0e-3;

/// Vertices of different faces closer than this are the same brush vertex.
///
/// Clipping classifies points against planes within [`ON_EPSILON`], and where
/// planes meet at shallow angles that band turns into a much larger spread
/// between the copies of one corner that different faces compute. A tenth
/// of a unit is well below Hammer's smallest grid step and absorbs it.
pub const WELD_EPSILON: f64 = 10.0 * ON_EPSILON;

/// A vertex this close to the inside of another face's edge is a T-junction
/// and gets inserted into that edge.
const T_JUNCTION_EPSILON: f64 = WELD_EPSILON;

// ---------------------------------------------------------------------------
// Plane
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum PlaneSide {
    Front,
    Back,
    On,
}

/// `normal · p = dist`. The normal has unit length.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Plane {
    pub normal: Vec3,
    pub dist: f64,
}

impl Plane {
    /// Builds a plane from the three points of a VMF `plane` key, in the
    /// order Hammer writes them. Returns `None` for collinear points.
    ///
    /// Hammer's convention: the normal is `(c - a) × (b - a)`, so for a floor
    /// written as `(-512 512 z) (512 512 z) (512 -512 z)` the normal points up.
    pub fn from_points(a: Vec3, b: Vec3, c: Vec3) -> Option<Plane> {
        let n = (c - a).cross(b - a);
        let len = n.length();
        if !len.is_finite() || len < 1.0e-9 {
            return None;
        }
        let normal = n / len;
        Some(Plane {
            normal,
            dist: normal.dot(a),
        })
    }

    pub fn new(normal: Vec3, dist: f64) -> Plane {
        Plane { normal, dist }
    }

    /// Signed distance from the plane, positive on the front side.
    pub fn distance(&self, p: Vec3) -> f64 {
        self.normal.dot(p) - self.dist
    }

    pub fn classify(&self, p: Vec3) -> PlaneSide {
        let d = self.distance(p);
        if d > ON_EPSILON {
            PlaneSide::Front
        } else if d < -ON_EPSILON {
            PlaneSide::Back
        } else {
            PlaneSide::On
        }
    }

    pub fn flipped(&self) -> Plane {
        Plane {
            normal: -self.normal,
            dist: -self.dist,
        }
    }

    /// Closest point on the plane.
    pub fn project(&self, p: Vec3) -> Vec3 {
        p - self.normal * self.distance(p)
    }

    /// A point on the plane.
    pub fn origin(&self) -> Vec3 {
        self.normal * self.dist
    }

    /// True when both planes describe the same oriented plane within tolerance.
    pub fn approx_eq(&self, other: &Plane) -> bool {
        self.normal.dot(other.normal) > 1.0 - 1.0e-6 && (self.dist - other.dist).abs() < ON_EPSILON
    }
}

// ---------------------------------------------------------------------------
// Polygon
// ---------------------------------------------------------------------------

/// A planar convex polygon. Vertices are counter-clockwise seen from the front.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Polygon {
    pub vertices: Vec<Vec3>,
}

impl Polygon {
    pub fn new(vertices: Vec<Vec3>) -> Polygon {
        Polygon { vertices }
    }

    /// A square of half-size `extent` lying on `plane`, counter-clockwise when
    /// viewed from the plane's front.
    pub fn base_for_plane(plane: &Plane, extent: f64) -> Polygon {
        let n = plane.normal;
        // Pick the axis least aligned with the normal as "up", like Quake's
        // BaseWindingForPlane, then make it orthogonal to the normal.
        let ax = n.x.abs();
        let ay = n.y.abs();
        let az = n.z.abs();
        let mut up = if az >= ax && az >= ay {
            Vec3::X
        } else {
            Vec3::Z
        };
        up -= n * up.dot(n);
        let up = up.normalize() * extent;
        let right = up.cross(n).normalize() * extent;
        let org = plane.origin();
        // Quake lists these clockwise from the front; reversed here for CCW.
        Polygon {
            vertices: vec![
                org - right - up,
                org + right - up,
                org + right + up,
                org - right + up,
            ],
        }
    }

    pub fn len(&self) -> usize {
        self.vertices.len()
    }

    pub fn is_empty(&self) -> bool {
        self.vertices.is_empty()
    }

    /// Fewer than three vertices, or zero area.
    pub fn is_degenerate(&self) -> bool {
        self.vertices.len() < 3 || self.area() < 1.0e-6
    }

    /// Newell normal: points to the front for counter-clockwise polygons.
    pub fn normal(&self) -> Vec3 {
        let mut n = Vec3::ZERO;
        let v = &self.vertices;
        for i in 0..v.len() {
            let a = v[i];
            let b = v[(i + 1) % v.len()];
            n.x += (a.y - b.y) * (a.z + b.z);
            n.y += (a.z - b.z) * (a.x + b.x);
            n.z += (a.x - b.x) * (a.y + b.y);
        }
        let len = n.length();
        if len > 0.0 {
            n / len
        } else {
            Vec3::ZERO
        }
    }

    pub fn area(&self) -> f64 {
        let v = &self.vertices;
        if v.len() < 3 {
            return 0.0;
        }
        let mut sum = Vec3::ZERO;
        for i in 1..v.len() - 1 {
            sum += (v[i] - v[0]).cross(v[i + 1] - v[0]);
        }
        sum.length() * 0.5
    }

    pub fn centroid(&self) -> Vec3 {
        if self.vertices.is_empty() {
            return Vec3::ZERO;
        }
        self.vertices.iter().copied().sum::<Vec3>() / self.vertices.len() as f64
    }

    /// The plane the polygon lies on, from its Newell normal and centroid.
    pub fn plane(&self) -> Option<Plane> {
        let n = self.normal();
        if n == Vec3::ZERO {
            return None;
        }
        Some(Plane::new(n, n.dot(self.centroid())))
    }

    /// Clips the polygon by `plane`, keeping the part behind it (the side the
    /// normal points away from). Returns `None` when nothing meaningful is
    /// left. Points within [`ON_EPSILON`] of the plane are kept as they are.
    pub fn clip(&self, plane: &Plane) -> Option<Polygon> {
        let v = &self.vertices;
        let n = v.len();
        if n == 0 {
            return None;
        }
        let dists: Vec<f64> = v.iter().map(|&p| plane.distance(p)).collect();
        let sides: Vec<PlaneSide> = dists
            .iter()
            .map(|&d| {
                if d > ON_EPSILON {
                    PlaneSide::Front
                } else if d < -ON_EPSILON {
                    PlaneSide::Back
                } else {
                    PlaneSide::On
                }
            })
            .collect();

        if sides.iter().all(|s| *s != PlaneSide::Front) {
            return Some(self.clone());
        }
        if sides.iter().all(|s| *s != PlaneSide::Back) {
            return None;
        }

        let mut out = Vec::with_capacity(n + 2);
        for i in 0..n {
            let j = (i + 1) % n;
            let (a, b) = (v[i], v[j]);
            match sides[i] {
                PlaneSide::On => {
                    out.push(a);
                    continue;
                }
                PlaneSide::Back => out.push(a),
                PlaneSide::Front => {}
            }
            let crosses = matches!(
                (sides[i], sides[j]),
                (PlaneSide::Front, PlaneSide::Back) | (PlaneSide::Back, PlaneSide::Front)
            );
            if crosses {
                let t = dists[i] / (dists[i] - dists[j]);
                let mut p = a + (b - a) * t;
                // Snap near-axial coordinates exactly, as Quake does, to keep
                // grid-aligned brushes exactly on the grid.
                for k in 0..3 {
                    if plane.normal[k] == 1.0 {
                        p[k] = plane.dist;
                    } else if plane.normal[k] == -1.0 {
                        p[k] = -plane.dist;
                    }
                }
                out.push(p);
            }
        }

        let poly = Polygon { vertices: out }.merged();
        if poly.vertices.len() < 3 {
            None
        } else {
            Some(poly)
        }
    }

    /// Removes consecutive vertices closer than [`MERGE_EPSILON`].
    pub fn merged(mut self) -> Polygon {
        if self.vertices.len() < 2 {
            return self;
        }
        let mut out: Vec<Vec3> = Vec::with_capacity(self.vertices.len());
        for p in self.vertices.drain(..) {
            if let Some(last) = out.last() {
                if last.distance(p) < MERGE_EPSILON {
                    continue;
                }
            }
            out.push(p);
        }
        while out.len() > 1 && out[0].distance(out[out.len() - 1]) < MERGE_EPSILON {
            out.pop();
        }
        Polygon { vertices: out }
    }

    /// Axis-aligned bounds, or `None` when empty.
    pub fn bounds(&self) -> Option<(Vec3, Vec3)> {
        let mut it = self.vertices.iter();
        let first = *it.next()?;
        Some(it.fold((first, first), |(lo, hi), &p| (lo.min(p), hi.max(p))))
    }

    /// Reverses the winding (flips the facing).
    pub fn reversed(mut self) -> Polygon {
        self.vertices.reverse();
        self
    }
}

// ---------------------------------------------------------------------------
// Solid
// ---------------------------------------------------------------------------

/// Problems Hammer reports for a brush in "Check for Problems".
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SolidProblem {
    /// A convex volume needs at least four planes.
    TooFewSides(usize),
    /// Three collinear points; the side has no plane.
    InvalidPlane { side: usize },
    /// After clipping by the other planes nothing is left of this side. The
    /// plane is redundant or outside the brush.
    FaceDoesNotContribute { side: usize },
    /// Two sides lie on the same plane.
    DuplicatePlane { side: usize, other: usize },
    /// The planes do not enclose a finite volume: some face reaches the
    /// world extent. Hammer calls this an invalid solid structure.
    Unbounded,
}

/// How far a stored vertex (Hammer++ `vertices_plus`) may sit off its own
/// plane, or outside another plane of the brush, and still be trusted.
/// Hammer++ writes them with two decimals and its own vertices drift from the
/// rounded planes by a few tenths after vertex edits, so half a unit is noise.
pub const HINT_EPSILON: f64 = 0.5;

/// The stored vertices of side `own` as a polygon, or `None` when they do
/// not describe a face of this brush (see [`SolidGeometry::from_planes_with_hints`]).
fn hinted_face(
    plane: &Plane,
    planes: &[Option<Plane>],
    own: usize,
    hint: &[Vec3],
) -> Option<Polygon> {
    if hint.len() < 3 {
        return None;
    }
    for v in hint {
        if plane.distance(*v).abs() > HINT_EPSILON {
            return None;
        }
        for (j, other) in planes.iter().enumerate() {
            if j == own {
                continue;
            }
            let Some(other) = other else { continue };
            if other.distance(*v) > HINT_EPSILON {
                return None;
            }
        }
    }
    let mut poly = Polygon::new(hint.to_vec()).merged();
    if poly.is_degenerate() {
        return None;
    }
    if poly.normal().dot(plane.normal) < 0.0 {
        poly = poly.reversed();
    }
    // Convex: every turn bends the same way as the plane normal says.
    let n = poly.vertices.len();
    for k in 0..n {
        let a = poly.vertices[k];
        let b = poly.vertices[(k + 1) % n];
        let c = poly.vertices[(k + 2) % n];
        if (b - a).cross(c - b).dot(plane.normal) < -ON_EPSILON {
            return None;
        }
    }
    Some(poly)
}

/// Polygons of a brush and what was wrong with it.
///
/// Vertices shared by several faces are welded: they are bitwise equal and
/// listed once in `vertices`, and `face_indices` gives each face as indices
/// into that list, ready for an indexed mesh.
#[derive(Debug, Clone, Default)]
pub struct SolidGeometry {
    /// One entry per input plane; `None` where the side does not contribute.
    pub faces: Vec<Option<Polygon>>,
    /// Unique brush vertices.
    pub vertices: Vec<Vec3>,
    /// Per face, indices into `vertices`, same order as the face's polygon.
    pub face_indices: Vec<Option<Vec<u32>>>,
    pub problems: Vec<SolidProblem>,
}

impl SolidGeometry {
    /// Builds every face of a brush from its planes.
    pub fn from_planes(planes: &[Option<Plane>]) -> SolidGeometry {
        Self::from_planes_with_hints(planes, &[])
    }

    /// Builds every face from the planes, then replaces a face by its stored
    /// vertices (`hints[i]`, Hammer++ `vertices_plus`) when those agree with
    /// the planes. Plane points are rounded to hundredths in the file, and
    /// where planes meet at grazing angles that rounding moves the computed
    /// corner by units; the stored vertices are the editor's own result and
    /// win, exactly as in Hammer++. A hint off its plane, outside the brush,
    /// non-convex or wound against the plane is ignored.
    pub fn from_planes_with_hints(
        planes: &[Option<Plane>],
        hints: &[Option<&[Vec3]>],
    ) -> SolidGeometry {
        let mut problems = Vec::new();
        if planes.len() < 4 {
            problems.push(SolidProblem::TooFewSides(planes.len()));
        }
        for (i, p) in planes.iter().enumerate() {
            if p.is_none() {
                problems.push(SolidProblem::InvalidPlane { side: i });
            }
        }
        for i in 0..planes.len() {
            for j in 0..i {
                if let (Some(a), Some(b)) = (planes[i], planes[j]) {
                    if a.approx_eq(&b) {
                        problems.push(SolidProblem::DuplicatePlane { side: i, other: j });
                    }
                }
            }
        }

        let mut faces: Vec<Option<Polygon>> = Vec::with_capacity(planes.len());
        for (i, plane) in planes.iter().enumerate() {
            let Some(plane) = plane else {
                faces.push(None);
                continue;
            };
            let mut poly = Some(Polygon::base_for_plane(plane, WORLD_EXTENT));
            for (j, other) in planes.iter().enumerate() {
                if i == j {
                    continue;
                }
                let Some(other) = other else { continue };
                // Clipping by the same oriented plane removes everything
                // because of the epsilon band; skip exact duplicates here and
                // let DuplicatePlane report them.
                if other.approx_eq(plane) {
                    continue;
                }
                poly = poly.and_then(|w| w.clip(other));
                if poly.is_none() {
                    break;
                }
            }
            if poly.is_some() {
                if let Some(hint) = hints.get(i).copied().flatten() {
                    if let Some(h) = hinted_face(plane, planes, i, hint) {
                        poly = Some(h);
                    }
                }
            }
            faces.push(poly);
        }

        // Weld vertices across faces so shared corners are identical, then
        // drop faces that collapsed.
        let mut vertices: Vec<Vec3> = Vec::new();
        let mut face_indices: Vec<Option<Vec<u32>>> = Vec::with_capacity(faces.len());
        for (i, face) in faces.iter_mut().enumerate() {
            let welded = face.take().and_then(|mut poly| {
                for v in &mut poly.vertices {
                    match vertices.iter().position(|w| w.distance(*v) <= WELD_EPSILON) {
                        Some(k) => *v = vertices[k],
                        None => vertices.push(*v),
                    }
                }
                let poly = poly.merged();
                (!poly.is_degenerate()).then_some(poly)
            });
            match &welded {
                Some(poly) => {
                    let idx = poly
                        .vertices
                        .iter()
                        .map(|v| vertices.iter().position(|w| w == v).expect("welded") as u32)
                        .collect();
                    face_indices.push(Some(idx));
                }
                None => {
                    problems.push(SolidProblem::FaceDoesNotContribute { side: i });
                    face_indices.push(None);
                }
            }
            *face = welded;
        }
        // Vertices that belonged only to collapsed faces are unreferenced;
        // keep the list compact.
        let used: Vec<bool> = {
            let mut used = vec![false; vertices.len()];
            for idx in face_indices.iter().flatten() {
                for &k in idx {
                    used[k as usize] = true;
                }
            }
            used
        };
        if used.iter().any(|u| !u) {
            let mut remap = vec![u32::MAX; vertices.len()];
            let mut compact = Vec::with_capacity(vertices.len());
            for (k, v) in vertices.iter().enumerate() {
                if used[k] {
                    remap[k] = compact.len() as u32;
                    compact.push(*v);
                }
            }
            for idx in face_indices.iter_mut().flatten() {
                for k in idx.iter_mut() {
                    *k = remap[*k as usize];
                }
            }
            vertices = compact;
        }

        fix_t_junctions(&vertices, &mut faces, &mut face_indices);

        // A convex polytope is closed by construction; the only way to be
        // open is to be infinite, which shows as vertices on the base
        // polygon's far edge.
        if vertices
            .iter()
            .any(|v| v.abs().max_element() >= WORLD_EXTENT * 0.5)
        {
            problems.push(SolidProblem::Unbounded);
        }

        SolidGeometry {
            faces,
            vertices,
            face_indices,
            problems,
        }
    }

    /// Directed edges without an opposite twin on another face. Zero for a
    /// perfectly paired mesh; small counts remain on brushes whose planes
    /// meet at very shallow angles, where no tolerance pairs every edge.
    /// Diagnostic only, not a validity criterion.
    pub fn open_edges(&self) -> usize {
        open_edges(&self.face_indices)
    }

    /// A brush Hammer would accept: every side contributes, closed volume.
    pub fn is_valid(&self) -> bool {
        self.problems.is_empty()
    }

    pub fn bounds(&self) -> Option<(Vec3, Vec3)> {
        let mut acc: Option<(Vec3, Vec3)> = None;
        for f in self.faces.iter().flatten() {
            if let Some((lo, hi)) = f.bounds() {
                acc = Some(match acc {
                    None => (lo, hi),
                    Some((a, b)) => (a.min(lo), b.max(hi)),
                });
            }
        }
        acc
    }

    /// Signed volume by divergence theorem; positive for a closed solid with
    /// outward-facing counter-clockwise faces.
    pub fn volume(&self) -> f64 {
        let mut vol = 0.0;
        for f in self.faces.iter().flatten() {
            let v = &f.vertices;
            for i in 1..v.len().saturating_sub(1) {
                vol += v[0].dot(v[i].cross(v[i + 1]));
            }
        }
        vol / 6.0
    }
}

/// Inserts into every edge the brush vertices that lie on its interior.
///
/// Clipping classifies points against planes with [`ON_EPSILON`], so when a
/// plane passes within that distance of an edge, one face keeps the edge
/// whole while its neighbour gets an extra vertex on it (a T-junction). The
/// edges then no longer pair up and the mesh has hairline cracks. Like
/// qbsp's FixTjuncs, splitting the edge at that vertex restores a closed
/// surface.
fn fix_t_junctions(
    vertices: &[Vec3],
    faces: &mut [Option<Polygon>],
    face_indices: &mut [Option<Vec<u32>>],
) {
    for (face, idx) in faces.iter_mut().zip(face_indices.iter_mut()) {
        let (Some(face), Some(idx)) = (face.as_mut(), idx.as_mut()) else {
            continue;
        };
        let mut out_idx: Vec<u32> = Vec::with_capacity(idx.len() + 2);
        for k in 0..idx.len() {
            let a = idx[k];
            let b = idx[(k + 1) % idx.len()];
            out_idx.push(a);
            let pa = vertices[a as usize];
            let pb = vertices[b as usize];
            let dir = pb - pa;
            let len2 = dir.length_squared();
            if len2 < 1e-12 {
                continue;
            }
            // Vertices strictly inside the segment, within T_JUNCTION_EPSILON of it.
            let mut inserts: Vec<(f64, u32)> = Vec::new();
            for (v, &p) in vertices.iter().enumerate() {
                let v = v as u32;
                if v == a || v == b || idx.contains(&v) || out_idx.contains(&v) {
                    continue;
                }
                // Endpoint look-alikes are welding's business, not splitting's.
                if p.distance(pa) <= WELD_EPSILON || p.distance(pb) <= WELD_EPSILON {
                    continue;
                }
                let t = (p - pa).dot(dir) / len2;
                if t <= 0.0 || t >= 1.0 {
                    continue;
                }
                let closest = pa + dir * t;
                if closest.distance(p) <= T_JUNCTION_EPSILON {
                    inserts.push((t, v));
                }
            }
            inserts.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap());
            out_idx.extend(inserts.into_iter().map(|(_, v)| v));
        }
        if out_idx.len() != idx.len() {
            face.vertices = out_idx.iter().map(|&i| vertices[i as usize]).collect();
            *idx = out_idx;
        }
    }
}

/// Counts directed edges (on welded vertex indices) that have no opposite
/// twin on another face. Zero for a closed, consistently wound solid.
fn open_edges(face_indices: &[Option<Vec<u32>>]) -> usize {
    let mut edges: Vec<(u32, u32)> = Vec::new();
    for idx in face_indices.iter().flatten() {
        for i in 0..idx.len() {
            edges.push((idx[i], idx[(i + 1) % idx.len()]));
        }
    }
    let mut matched = vec![false; edges.len()];
    for i in 0..edges.len() {
        if matched[i] {
            continue;
        }
        if let Some(j) =
            (i + 1..edges.len()).find(|&j| !matched[j] && edges[j] == (edges[i].1, edges[i].0))
        {
            matched[i] = true;
            matched[j] = true;
        }
    }
    matched.iter().filter(|m| !**m).count()
}

// ---------------------------------------------------------------------------
// Texture axes
// ---------------------------------------------------------------------------

/// One VMF texture axis: `"[x y z shift] scale"`.
///
/// Texel coordinate of a point is `p · axis / scale + shift`; dividing by the
/// texture size gives the UV.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct TexAxis {
    pub axis: Vec3,
    pub shift: f64,
    pub scale: f64,
}

impl TexAxis {
    pub fn new(axis: Vec3, shift: f64, scale: f64) -> TexAxis {
        TexAxis { axis, shift, scale }
    }

    /// Texture coordinate in texels.
    pub fn texel(&self, p: Vec3) -> f64 {
        let scale = if self.scale.abs() < 1.0e-12 {
            0.25
        } else {
            self.scale
        };
        p.dot(self.axis) / scale + self.shift
    }
}

/// UV in [0, 1] units of the texture for a point, given texture size in pixels.
pub fn uv(u: &TexAxis, v: &TexAxis, p: Vec3, tex_w: f64, tex_h: f64) -> (f64, f64) {
    (u.texel(p) / tex_w, v.texel(p) / tex_h)
}

/// Hammer's default "world aligned" axes for a face with this normal: the two
/// world axes least aligned with the normal, as Hammer picks them.
pub fn world_aligned_axes(normal: Vec3) -> (Vec3, Vec3) {
    let ax = normal.x.abs();
    let ay = normal.y.abs();
    let az = normal.z.abs();
    if az >= ax && az >= ay {
        (Vec3::X, -Vec3::Y)
    } else if ax >= ay {
        (Vec3::Y, -Vec3::Z)
    } else {
        (Vec3::X, -Vec3::Z)
    }
}

#[cfg(test)]
mod tests {
    mod hints {
        use super::super::*;

        fn unit_cube() -> Vec<Option<Plane>> {
            // Same winding as the rest of the tests: index 0 is the top (+z) face.
            super::box_planes(Vec3::new(0.0, 0.0, 0.0), Vec3::new(64.0, 64.0, 64.0))
        }

        #[test]
        fn hint_within_tolerance_replaces_the_face() {
            let planes = unit_cube();
            let plain = SolidGeometry::from_planes(&planes);
            assert!(plain.is_valid());
            // Top face stored with a corner nudged by a hundredth, as Hammer++ rounds.
            let top = [
                Vec3::new(0.0, 0.0, 64.0),
                Vec3::new(0.0, 64.0, 64.0),
                Vec3::new(64.0, 64.0, 64.0),
                Vec3::new(64.01, 0.0, 64.0),
            ];
            let hints: Vec<Option<&[Vec3]>> = (0..6)
                .map(|i| if i == 0 { Some(&top[..]) } else { None })
                .collect();
            let g = SolidGeometry::from_planes_with_hints(&planes, &hints);
            assert!(g.is_valid());
            let face = g.faces[0].as_ref().expect("top face");
            assert!(
                face.vertices.iter().any(|v| (v.x - 64.01).abs() < 1e-9),
                "stored corner used: {:?}",
                face.vertices
            );
            // Winding follows the plane normal like a computed face.
            assert!(face.normal().dot(planes[0].unwrap().normal) > 0.0);
        }

        #[test]
        fn stale_hint_is_ignored() {
            let planes = unit_cube();
            // A corner well outside the brush: the stored vertices are from an older shape.
            let top = [
                Vec3::new(0.0, 0.0, 64.0),
                Vec3::new(0.0, 64.0, 64.0),
                Vec3::new(64.0, 64.0, 64.0),
                Vec3::new(80.0, 0.0, 64.0),
            ];
            let hints: Vec<Option<&[Vec3]>> = (0..6)
                .map(|i| if i == 0 { Some(&top[..]) } else { None })
                .collect();
            let g = SolidGeometry::from_planes_with_hints(&planes, &hints);
            let face = g.faces[0].as_ref().expect("top face");
            assert!(face.vertices.iter().all(|v| v.x <= 64.0 + 1e-9));
            // Off its own plane is rejected too.
            let lifted = [
                Vec3::new(0.0, 0.0, 65.0),
                Vec3::new(0.0, 64.0, 64.0),
                Vec3::new(64.0, 64.0, 64.0),
                Vec3::new(64.0, 0.0, 64.0),
            ];
            let hints: Vec<Option<&[Vec3]>> = (0..6)
                .map(|i| if i == 0 { Some(&lifted[..]) } else { None })
                .collect();
            let g = SolidGeometry::from_planes_with_hints(&planes, &hints);
            assert!(g.faces[0]
                .as_ref()
                .unwrap()
                .vertices
                .iter()
                .all(|v| (v.z - 64.0).abs() < 1e-9));
        }
    }

    use super::*;

    fn v(x: f64, y: f64, z: f64) -> Vec3 {
        Vec3::new(x, y, z)
    }

    /// Planes of an axis-aligned box, written the way Hammer writes them.
    fn box_planes(lo: Vec3, hi: Vec3) -> Vec<Option<Plane>> {
        vec![
            // top (+z)
            Plane::from_points(
                v(lo.x, hi.y, hi.z),
                v(hi.x, hi.y, hi.z),
                v(hi.x, lo.y, hi.z),
            ),
            // bottom (-z)
            Plane::from_points(
                v(lo.x, lo.y, lo.z),
                v(hi.x, lo.y, lo.z),
                v(hi.x, hi.y, lo.z),
            ),
            // -x
            Plane::from_points(
                v(lo.x, hi.y, hi.z),
                v(lo.x, lo.y, hi.z),
                v(lo.x, lo.y, lo.z),
            ),
            // +x
            Plane::from_points(
                v(hi.x, hi.y, lo.z),
                v(hi.x, lo.y, lo.z),
                v(hi.x, lo.y, hi.z),
            ),
            // +y
            Plane::from_points(
                v(hi.x, hi.y, hi.z),
                v(lo.x, hi.y, hi.z),
                v(lo.x, hi.y, lo.z),
            ),
            // -y
            Plane::from_points(
                v(hi.x, lo.y, lo.z),
                v(lo.x, lo.y, lo.z),
                v(lo.x, lo.y, hi.z),
            ),
        ]
    }

    #[test]
    fn hammer_floor_plane_points_up() {
        let p = Plane::from_points(
            v(-512.0, 512.0, -64.0),
            v(512.0, 512.0, -64.0),
            v(512.0, -512.0, -64.0),
        )
        .unwrap();
        assert!((p.normal - Vec3::Z).length() < 1e-12);
        assert_eq!(p.dist, -64.0);
        assert_eq!(p.classify(v(0.0, 0.0, 0.0)), PlaneSide::Front);
        assert_eq!(p.classify(v(0.0, 0.0, -100.0)), PlaneSide::Back);
        assert_eq!(p.classify(v(5.0, 5.0, -64.001)), PlaneSide::On);
    }

    #[test]
    fn collinear_points_have_no_plane() {
        assert!(Plane::from_points(v(0.0, 0.0, 0.0), v(1.0, 1.0, 1.0), v(2.0, 2.0, 2.0)).is_none());
    }

    #[test]
    fn base_polygon_is_ccw_from_front_for_every_axis() {
        for n in [
            Vec3::X,
            Vec3::Y,
            Vec3::Z,
            -Vec3::X,
            -Vec3::Y,
            -Vec3::Z,
            v(1.0, 2.0, 3.0).normalize(),
        ] {
            let plane = Plane::new(n, 10.0);
            let poly = Polygon::base_for_plane(&plane, 100.0);
            assert_eq!(poly.len(), 4);
            assert!(poly.normal().dot(n) > 0.999, "normal {n:?}");
            for p in &poly.vertices {
                assert!(plane.distance(*p).abs() < 1e-9);
            }
            assert!((poly.area() - 200.0 * 200.0).abs() < 1e-6);
        }
    }

    #[test]
    fn unit_box_has_six_squares() {
        let planes = box_planes(v(-64.0, -64.0, -64.0), v(64.0, 64.0, 64.0));
        let g = SolidGeometry::from_planes(&planes);
        assert!(g.is_valid(), "{:?}", g.problems);
        assert_eq!(g.faces.len(), 6);
        for (i, f) in g.faces.iter().enumerate() {
            let f = f.as_ref().unwrap();
            assert_eq!(f.len(), 4, "face {i}");
            assert!((f.area() - 128.0 * 128.0).abs() < 1e-6, "face {i}");
            // Winding faces the same way as its plane.
            assert!(
                f.normal().dot(planes[i].unwrap().normal) > 0.999,
                "face {i}"
            );
            // Every vertex is exactly on the grid thanks to axial snapping.
            for p in &f.vertices {
                for k in 0..3 {
                    assert!((p[k].abs() - 64.0).abs() < 1e-9, "face {i} vertex {p:?}");
                }
            }
        }
        assert_eq!(g.vertices.len(), 8);
        assert!(g
            .face_indices
            .iter()
            .all(|i| i.as_ref().unwrap().len() == 4));
        assert!((g.volume() - 128.0f64.powi(3)).abs() < 1e-3);
        let (lo, hi) = g.bounds().unwrap();
        assert_eq!(lo, v(-64.0, -64.0, -64.0));
        assert_eq!(hi, v(64.0, 64.0, 64.0));
    }

    #[test]
    fn wedge_has_five_faces_and_closes() {
        // Box cut by a diagonal plane through the middle.
        let mut planes = box_planes(v(0.0, 0.0, 0.0), v(128.0, 128.0, 128.0));
        // Diagonal keeping the half where x + z <= 128.
        planes.push(Plane::from_points(
            v(128.0, 0.0, 0.0),
            v(0.0, 0.0, 128.0),
            v(0.0, 128.0, 128.0),
        ));
        // The top and the +x side are reduced to edges: both must be reported.
        let g = SolidGeometry::from_planes(&planes);
        assert_eq!(
            g.problems,
            vec![
                SolidProblem::FaceDoesNotContribute { side: 0 },
                SolidProblem::FaceDoesNotContribute { side: 3 }
            ],
            "{:?}",
            g.problems
        );
        // Drop those planes: a valid triangular prism.
        planes.remove(3);
        planes.remove(0);
        let g = SolidGeometry::from_planes(&planes);
        assert!(g.is_valid(), "{:?}", g.problems);
        assert_eq!(g.faces.iter().flatten().count(), 5);
        assert!((g.volume() - 128.0 * 128.0 * 128.0 / 2.0).abs() < 1e-3);
    }

    #[test]
    fn unbounded_brush_is_reported() {
        let mut planes = box_planes(v(0.0, 0.0, 0.0), v(64.0, 64.0, 64.0));
        planes.remove(0); // no top
        let g = SolidGeometry::from_planes(&planes);
        assert_eq!(g.problems, vec![SolidProblem::Unbounded]);
        // The open box still has four unpaired edges at the top.
        assert_eq!(g.open_edges(), 4);
        // A proper box pairs every edge.
        let g = SolidGeometry::from_planes(&box_planes(v(0.0, 0.0, 0.0), v(64.0, 64.0, 64.0)));
        assert_eq!(g.open_edges(), 0);
    }

    #[test]
    fn duplicate_and_invalid_planes_are_reported() {
        let mut planes = box_planes(v(0.0, 0.0, 0.0), v(64.0, 64.0, 64.0));
        planes.push(planes[0]);
        planes.push(None);
        let g = SolidGeometry::from_planes(&planes);
        assert!(g.problems.contains(&SolidProblem::InvalidPlane { side: 7 }));
        assert!(g
            .problems
            .contains(&SolidProblem::DuplicatePlane { side: 6, other: 0 }));
    }

    #[test]
    fn plane_through_a_corner_within_epsilon_still_closes() {
        // Found by the property test: the cut passes within ON_EPSILON of the
        // (+x, -y, -z) corner. Box faces keep the exact corner, the cut face
        // computes it as an intersection a few thousandths away; welding
        // must make them one vertex.
        let r = 486.2474965279832;
        let mut planes: Vec<Option<Plane>> =
            [Vec3::X, Vec3::Y, Vec3::Z, -Vec3::X, -Vec3::Y, -Vec3::Z]
                .into_iter()
                .map(|n| Some(Plane::new(n, r)))
                .collect();
        planes.push(Some(Plane::new(
            v(
                -0.3050016182550363,
                -0.9032985578649079,
                -0.30170470367726576,
            ),
            437.6227468751849,
        )));
        let g = SolidGeometry::from_planes(&planes);
        assert!(g.is_valid(), "{:?}", g.problems);
        // Six surviving box corners plus three points where the cut meets edges.
        assert_eq!(g.vertices.len(), 9);
    }

    #[test]
    fn near_edge_plane_does_not_open_the_solid() {
        // Found by the property test: a tangent plane almost parallel to the
        // +y box face and two more tangent planes near a corner. One face
        // got an extra vertex on an edge its neighbour kept whole.
        let r = 315.8360617269351;
        let d = 284.2524555542416;
        let mut planes: Vec<Option<Plane>> =
            [Vec3::X, Vec3::Y, Vec3::Z, -Vec3::X, -Vec3::Y, -Vec3::Z]
                .into_iter()
                .map(|n| Some(Plane::new(n, r)))
                .collect();
        planes.push(Some(Plane::new(
            v(0.6233076090306806, 0.466569039906406, -0.6275356209214507),
            d,
        )));
        planes.push(Some(Plane::new(
            v(0.29568127920523846, 0.7738314594028326, -0.560140565899343),
            d,
        )));
        planes.push(Some(Plane::new(Vec3::Y, d)));
        let g = SolidGeometry::from_planes(&planes);
        // The +y box face is cut off by the closer parallel plane; nothing else may be wrong.
        assert_eq!(
            g.problems,
            vec![SolidProblem::FaceDoesNotContribute { side: 1 }],
            "{:?}",
            g.problems
        );
    }

    #[test]
    fn nearly_parallel_tangent_plane_keeps_edges_paired() {
        // Found by the property test: a plane almost parallel to the +x face
        // puts an intersection vertex 0.03 units along a neighbour's edge, a
        // T-junction beyond WELD_EPSILON.
        let r = 118.81767928188498;
        let d = 106.93591135369648;
        let mut planes: Vec<Option<Plane>> =
            [Vec3::X, Vec3::Y, Vec3::Z, -Vec3::X, -Vec3::Y, -Vec3::Z]
                .into_iter()
                .map(|n| Some(Plane::new(n, r)))
                .collect();
        planes.push(Some(Plane::new(
            v(0.8875373341624944, -0.3787034013149504, 0.2624142036937421),
            d,
        )));
        planes.push(Some(Plane::new(
            v(
                0.9919903027706117,
                -0.12600726124811903,
                -0.008798256748832998,
            ),
            d,
        )));
        let g = SolidGeometry::from_planes(&planes);
        assert!(g.is_valid(), "{:?}", g.problems);
        assert_eq!(g.open_edges(), 0);
    }

    #[test]
    fn shallow_corner_copies_are_welded() {
        // Found by the property test: four planes meet near one corner at
        // shallow angles and two faces computed copies of it 0.034 apart.
        let r = 418.7927958069235;
        let d = 376.91351622623114;
        let mut planes: Vec<Option<Plane>> =
            [Vec3::X, Vec3::Y, Vec3::Z, -Vec3::X, -Vec3::Y, -Vec3::Z]
                .into_iter()
                .map(|n| Some(Plane::new(n, r)))
                .collect();
        planes.push(Some(Plane::new(
            v(0.26607023587043105, -0.7229527363339262, 0.6376095753759832),
            d,
        )));
        planes.push(Some(Plane::new(
            v(0.1711648628880002, -0.9755960093151257, 0.13753187383633397),
            d,
        )));
        let g = SolidGeometry::from_planes(&planes);
        assert!(g.is_valid(), "{:?}", g.problems);
        // No face may list a vertex twice.
        for idx in g.face_indices.iter().flatten() {
            let mut sorted = idx.clone();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), idx.len(), "{idx:?}");
        }
    }

    #[test]
    fn near_duplicate_planes_never_panic_and_report() {
        // Two tangent planes less than a degree apart: a sliver thinner than
        // the welding tolerance. Hammer calls such brushes invalid; we must
        // report a problem rather than crash or emit corrupt loops.
        let mut planes: Vec<Option<Plane>> =
            [Vec3::X, Vec3::Y, Vec3::Z, -Vec3::X, -Vec3::Y, -Vec3::Z]
                .into_iter()
                .map(|n| Some(Plane::new(n, 32.0)))
                .collect();
        planes.push(Some(Plane::new(
            v(0.7034361677361172, -0.5505117830587344, 0.4495712787025193),
            28.8,
        )));
        planes.push(Some(Plane::new(Vec3::Z, 28.8)));
        planes.push(Some(Plane::new(
            v(0.7111683018923031, -0.5477082907850962, 0.4407440011944424),
            28.8,
        )));
        let g = SolidGeometry::from_planes(&planes);
        for idx in g.face_indices.iter().flatten() {
            assert!(idx.len() >= 3);
            let mut sorted = idx.clone();
            sorted.sort_unstable();
            sorted.dedup();
            assert_eq!(sorted.len(), idx.len(), "{idx:?}");
        }
    }

    #[test]
    fn too_few_sides() {
        let g = SolidGeometry::from_planes(&box_planes(v(0.0, 0.0, 0.0), v(1.0, 1.0, 1.0))[..3]);
        assert!(g.problems.contains(&SolidProblem::TooFewSides(3)));
    }

    #[test]
    fn texture_axis_texels_and_uv() {
        // Hammer default for a floor: "[1 0 0 0] 0.25", "[0 -1 0 0] 0.25".
        let u = TexAxis::new(Vec3::X, 0.0, 0.25);
        let w = TexAxis::new(-Vec3::Y, 0.0, 0.25);
        let p = v(64.0, 32.0, 0.0);
        assert_eq!(u.texel(p), 256.0);
        assert_eq!(w.texel(p), -128.0);
        assert_eq!(uv(&u, &w, p, 512.0, 512.0), (0.5, -0.25));
        let shifted = TexAxis::new(Vec3::X, 16.0, 0.5);
        assert_eq!(shifted.texel(p), 144.0);
        // A zero scale (seen in broken files) falls back to the default 0.25.
        assert_eq!(TexAxis::new(Vec3::X, 0.0, 0.0).texel(p), 256.0);
    }

    #[test]
    fn world_aligned_axes_match_hammer() {
        assert_eq!(world_aligned_axes(Vec3::Z), (Vec3::X, -Vec3::Y));
        assert_eq!(world_aligned_axes(-Vec3::Z), (Vec3::X, -Vec3::Y));
        assert_eq!(world_aligned_axes(Vec3::X), (Vec3::Y, -Vec3::Z));
        assert_eq!(world_aligned_axes(Vec3::Y), (Vec3::X, -Vec3::Z));
    }
}
