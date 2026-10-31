//! Brush primitives: the shapes Hammer's block tool offers besides the box.
//!
//! Each primitive is built as a list of solids, each a list of faces, each a
//! convex polygon whose vertices run counter-clockwise seen from outside.
//! Shapes are drawn in a 2D view, so they take the extrusion `axis` (the
//! axis that view cannot see): a cylinder drawn in the Top view stands on Z,
//! one drawn in the Front view lies along Y.

use geometry::Vec3;

/// Which shape to build inside a bounding box.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Primitive {
    Block,
    /// A right-triangular prism: half of the box, cut diagonally.
    Wedge,
    /// An `sides`-gon inscribed in the box, extruded along the axis.
    Cylinder {
        sides: u32,
    },
    /// A spheroid inscribed in the box as a single brush with `sides`
    /// segments around and `sides / 2` bands from pole to pole.
    Sphere {
        sides: u32,
    },
    /// `sides` brushes following an elliptical ring of thickness `wall`
    /// over `arc` degrees from `start`, each raised by `add_height` over the
    /// previous one (Hammer's spiral stairs).
    Arch {
        sides: u32,
        wall: f64,
        arc: f64,
        start: f64,
        add_height: f64,
    },
}

impl Primitive {
    pub fn label(&self) -> &'static str {
        match self {
            Primitive::Block => "Создать браш",
            Primitive::Wedge => "Создать клин",
            Primitive::Cylinder { .. } => "Создать цилиндр",
            Primitive::Sphere { .. } => "Создать сферу",
            Primitive::Arch { .. } => "Создать арку",
        }
    }

    /// Parses the frontend's shape name; `params` are
    /// `[sides, wall, arc, start, add_height]`, missing ones defaulted.
    pub fn parse(name: &str, params: &[f64]) -> Option<Primitive> {
        let p = |i: usize, d: f64| {
            params
                .get(i)
                .copied()
                .filter(|v| v.is_finite())
                .unwrap_or(d)
        };
        let sides = p(0, 8.0).round().clamp(3.0, 128.0) as u32;
        Some(match name.to_ascii_lowercase().as_str() {
            "block" => Primitive::Block,
            "wedge" => Primitive::Wedge,
            "cylinder" => Primitive::Cylinder { sides },
            "sphere" => Primitive::Sphere { sides },
            "arch" => Primitive::Arch {
                sides,
                wall: p(1, 32.0),
                arc: p(2, 180.0),
                start: p(3, 0.0),
                add_height: p(4, 0.0),
            },
            _ => return None,
        })
    }
}

/// A point from 2D coordinates `(u, v)` in the view plane and `w` along the
/// extrusion axis.
fn place(axis: usize, u: f64, v: f64, w: f64) -> Vec3 {
    match axis {
        0 => Vec3::new(w, u, v),
        1 => Vec3::new(u, w, v),
        _ => Vec3::new(u, v, w),
    }
}

fn component(p: Vec3, i: usize) -> f64 {
    match i {
        0 => p.x,
        1 => p.y,
        _ => p.z,
    }
}

/// Rounds away floating-point noise; Hammer keeps a few decimals too.
fn tidy(v: Vec3) -> Vec3 {
    (v * 1.0e4).round() / 1.0e4
}

/// The faces of every solid of the primitive inside `[lo, hi]`.
pub fn build(shape: Primitive, lo: Vec3, hi: Vec3, axis: usize) -> Vec<Vec<Vec<Vec3>>> {
    let axis = axis.min(2);
    let (ua, va) = match axis {
        0 => (1, 2),
        1 => (0, 2),
        _ => (0, 1),
    };
    let (u0, u1) = (component(lo, ua), component(hi, ua));
    let (v0, v1) = (component(lo, va), component(hi, va));
    let (w0, w1) = (component(lo, axis), component(hi, axis));
    let centre = ((u0 + u1) / 2.0, (v0 + v1) / 2.0);
    let radii = ((u1 - u0) / 2.0, (v1 - v0) / 2.0);
    let ellipse = |ru: f64, rv: f64, deg: f64| {
        let a = deg.to_radians();
        (centre.0 + ru * a.cos(), centre.1 + rv * a.sin())
    };

    let mut solids: Vec<Vec<Vec<Vec3>>> = match shape {
        Primitive::Block => vec![prism(
            &[(u0, v0), (u1, v0), (u1, v1), (u0, v1)],
            w0,
            w1,
            axis,
        )],
        Primitive::Wedge => vec![prism(&[(u0, v0), (u1, v0), (u0, v1)], w0, w1, axis)],
        Primitive::Cylinder { sides } => {
            let n = sides.max(3) as usize;
            let ring: Vec<(f64, f64)> = (0..n)
                .map(|i| ellipse(radii.0, radii.1, 360.0 * i as f64 / n as f64))
                .collect();
            vec![prism(&ring, w0, w1, axis)]
        }
        Primitive::Arch {
            sides,
            wall,
            arc,
            start,
            add_height,
        } => {
            let n = sides.max(1) as usize;
            let wall = wall.abs();
            if wall < 0.5 || wall >= radii.0.min(radii.1) || arc.abs() < 1.0e-6 {
                return Vec::new();
            }
            let inner = (radii.0 - wall, radii.1 - wall);
            (0..n)
                .map(|i| {
                    let a0 = start + arc * i as f64 / n as f64;
                    let a1 = start + arc * (i + 1) as f64 / n as f64;
                    let quad = [
                        ellipse(radii.0, radii.1, a0),
                        ellipse(radii.0, radii.1, a1),
                        ellipse(inner.0, inner.1, a1),
                        ellipse(inner.0, inner.1, a0),
                    ];
                    let dz = add_height * i as f64;
                    prism(&quad, w0 + dz, w1 + dz, axis)
                })
                .collect()
        }
        Primitive::Sphere { sides } => {
            let n = sides.max(3) as usize;
            let bands = (n / 2).max(2);
            let rw = (w1 - w0) / 2.0;
            let cw = (w0 + w1) / 2.0;
            let point = |band: usize, seg: usize| {
                let phi = std::f64::consts::PI * band as f64 / bands as f64;
                let (u, v) = ellipse(
                    radii.0 * phi.sin(),
                    radii.1 * phi.sin(),
                    360.0 * seg as f64 / n as f64,
                );
                place(axis, u, v, cw + rw * phi.cos())
            };
            let mut faces = Vec::new();
            for band in 0..bands {
                for seg in 0..n {
                    let mut quad = vec![
                        point(band, seg),
                        point(band + 1, seg),
                        point(band + 1, seg + 1),
                        point(band, seg + 1),
                    ];
                    // The poles collapse a side of the quad into a point.
                    quad.dedup_by(|a, b| a.distance(*b) < 1.0e-6);
                    if quad.len() > 2 && quad[0].distance(quad[quad.len() - 1]) < 1.0e-6 {
                        quad.pop();
                    }
                    if quad.len() >= 3 {
                        faces.push(quad);
                    }
                }
            }
            vec![faces]
        }
    };
    for faces in &mut solids {
        orient_outward(faces);
        for face in faces.iter_mut() {
            for p in face.iter_mut() {
                *p = tidy(*p);
            }
        }
    }
    solids
}

/// Extrudes a 2D polygon from `w0` to `w1` along the axis: two caps and one
/// quad per edge.
fn prism(poly: &[(f64, f64)], w0: f64, w1: f64, axis: usize) -> Vec<Vec<Vec3>> {
    let n = poly.len();
    let at = |i: usize, w: f64| place(axis, poly[i % n].0, poly[i % n].1, w);
    let mut faces = Vec::with_capacity(n + 2);
    faces.push((0..n).map(|i| at(i, w1)).collect());
    faces.push((0..n).rev().map(|i| at(i, w0)).collect());
    for i in 0..n {
        faces.push(vec![at(i, w0), at(i + 1, w0), at(i + 1, w1), at(i, w1)]);
    }
    faces
}

/// Flips faces whose winding points into the solid, so every face reads
/// counter-clockwise from outside whatever the axis mapping did.
fn orient_outward(faces: &mut [Vec<Vec3>]) {
    let mut centre = Vec3::ZERO;
    let mut count = 0.0;
    for f in faces.iter() {
        for &p in f {
            centre += p;
            count += 1.0;
        }
    }
    if count == 0.0 {
        return;
    }
    centre /= count;
    for f in faces.iter_mut() {
        let normal = geometry::Polygon::new(f.clone()).normal();
        let face_centre = f.iter().copied().sum::<Vec3>() / f.len() as f64;
        if normal.dot(face_centre - centre) < 0.0 {
            f.reverse();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use geometry::{Plane, SolidGeometry};

    fn geometry_of(faces: &[Vec<Vec3>]) -> SolidGeometry {
        let planes: Vec<Option<Plane>> = faces
            .iter()
            .map(|f| Plane::from_points(f[0], f[2], f[1]))
            .collect();
        SolidGeometry::from_planes(&planes)
    }

    #[test]
    fn cylinder_is_a_valid_prism_on_any_axis() {
        for axis in 0..3 {
            let solids = build(
                Primitive::Cylinder { sides: 8 },
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(128.0, 64.0, 32.0),
                axis,
            );
            assert_eq!(solids.len(), 1);
            assert_eq!(solids[0].len(), 10);
            let g = geometry_of(&solids[0]);
            assert!(g.is_valid(), "axis {axis}: {:?}", g.problems);
            let (lo, hi) = g.bounds().unwrap();
            assert!((lo - Vec3::ZERO).length() < 1.0e-3, "{lo}");
            assert!(
                (hi - Vec3::new(128.0, 64.0, 32.0)).length() < 1.0e-3,
                "{hi}"
            );
            // An octagon fills 2·√2 ≈ 2.83 of the ellipse's π·ab area.
            let expected = 2.0 * 2.0f64.sqrt() * 64.0 * 32.0 * 32.0 / (128.0 * 64.0 * 32.0);
            let full = 128.0 * 64.0 * 32.0;
            assert!((g.volume() / full - expected).abs() < 1.0e-6);
        }
    }

    #[test]
    fn wedge_is_half_the_box_and_sphere_is_one_convex_brush() {
        let lo = Vec3::new(-64.0, -64.0, -64.0);
        let hi = Vec3::new(64.0, 64.0, 64.0);
        let wedge = build(Primitive::Wedge, lo, hi, 2);
        let g = geometry_of(&wedge[0]);
        assert!(g.is_valid(), "{:?}", g.problems);
        assert!((g.volume() - 128.0f64.powi(3) / 2.0).abs() < 1.0e-6);

        let sphere = build(Primitive::Sphere { sides: 8 }, lo, hi, 2);
        assert_eq!(sphere.len(), 1);
        assert_eq!(sphere[0].len(), 32, "8 segments × 4 bands");
        let g = geometry_of(&sphere[0]);
        assert!(g.is_valid(), "{:?}", g.problems);
        let ball = 4.0 / 3.0 * std::f64::consts::PI * 64.0f64.powi(3);
        assert!(
            g.volume() > 0.6 * ball && g.volume() < ball,
            "{}",
            g.volume()
        );
    }

    #[test]
    fn arch_segments_are_valid_and_add_height_climbs() {
        let solids = build(
            Primitive::Arch {
                sides: 6,
                wall: 32.0,
                arc: 180.0,
                start: 0.0,
                add_height: 16.0,
            },
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(256.0, 256.0, 64.0),
            2,
        );
        assert_eq!(solids.len(), 6);
        let mut z_min = Vec::new();
        for faces in &solids {
            let g = geometry_of(faces);
            assert!(g.is_valid(), "{:?}", g.problems);
            z_min.push(g.bounds().unwrap().0.z);
        }
        assert_eq!(z_min, vec![0.0, 16.0, 32.0, 48.0, 64.0, 80.0]);
        // Too thick a wall gives nothing rather than inside-out brushes.
        assert!(build(
            Primitive::Arch {
                sides: 4,
                wall: 500.0,
                arc: 90.0,
                start: 0.0,
                add_height: 0.0
            },
            Vec3::ZERO,
            Vec3::new(64.0, 64.0, 64.0),
            2
        )
        .is_empty());
    }
}
