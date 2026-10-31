//! Property tests: random convex brushes always produce faces whose vertices
//! satisfy every plane, face the right way and close up.

use geometry::{Plane, SolidGeometry, SolidProblem, Vec3, WELD_EPSILON};
use proptest::prelude::*;

fn vec3(range: f64) -> impl Strategy<Value = Vec3> {
    (-range..range, -range..range, -range..range).prop_map(|(x, y, z)| Vec3::new(x, y, z))
}

/// Planes tangent to a sphere of radius `r` at random directions, plus the six
/// box planes at distance `r` so the volume is always bounded.
///
/// Two tangent planes less than three degrees apart would leave a sliver face
/// thinner than the welding tolerance; such brushes are degenerate (Hammer
/// flags them too) and are covered by unit tests, so they are filtered out.
fn tangent_brush() -> impl Strategy<Value = Vec<Option<Plane>>> {
    (prop::collection::vec(vec3(1.0), 0..8), 32.0..512.0f64).prop_map(|(dirs, r)| {
        let mut planes: Vec<Option<Plane>> = Vec::new();
        for n in [Vec3::X, Vec3::Y, Vec3::Z, -Vec3::X, -Vec3::Y, -Vec3::Z] {
            planes.push(Some(Plane::new(n, r)));
        }
        let min_cos = (3.0f64).to_radians().cos();
        let mut normals: Vec<Vec3> = Vec::new();
        for d in dirs {
            if d.length() < 1e-3 {
                continue;
            }
            let n = d.normalize();
            if normals.iter().any(|m| m.dot(n) > min_cos) {
                continue;
            }
            normals.push(n);
            // Tangent to a slightly smaller sphere so it never coincides with a box plane.
            planes.push(Some(Plane::new(n, r * 0.9)));
        }
        planes
    })
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(300))]

    #[test]
    fn faces_satisfy_all_planes_and_close(planes in tangent_brush()) {
        let g = SolidGeometry::from_planes(&planes);
        // A tangent plane that is almost axis-aligned legitimately cuts off a
        // box face, so "face does not contribute" is allowed. Anything else
        // (invalid plane, duplicate, open edges) is a bug.
        for p in &g.problems {
            prop_assert!(matches!(p, SolidProblem::FaceDoesNotContribute { .. }), "{:?}", g.problems);
        }
        prop_assert_eq!(g.faces.len(), planes.len());
        prop_assert!(g.faces.iter().flatten().count() >= 4);
        for (i, face) in g.faces.iter().enumerate() {
            let Some(face) = face.as_ref() else { continue };
            let plane = planes[i].unwrap();
            prop_assert!(face.normal().dot(plane.normal) > 0.999, "face {} winding", i);
            for p in &face.vertices {
                // Welding may move a vertex onto a neighbour's copy, up to WELD_EPSILON away.
                prop_assert!(plane.distance(*p).abs() <= WELD_EPSILON + 1e-9, "vertex off its own plane");
                for q in planes.iter().flatten() {
                    prop_assert!(q.distance(*p) <= WELD_EPSILON + 1e-9, "vertex outside brush");
                }
            }
        }
        prop_assert!(g.volume() > 0.0);
        // Centroid of all vertices is strictly inside.
        let verts = &g.vertices;
        let c = verts.iter().copied().sum::<Vec3>() / verts.len() as f64;
        for q in planes.iter().flatten() {
            prop_assert!(q.distance(c) < 0.0);
        }
    }

    #[test]
    fn random_point_triples_never_panic(a in vec3(16384.0), b in vec3(16384.0), c in vec3(16384.0)) {
        if let Some(p) = Plane::from_points(a, b, c) {
            prop_assert!((p.normal.length() - 1.0).abs() < 1e-9);
            for q in [a, b, c] {
                prop_assert!(p.distance(q).abs() < 1e-3);
            }
        }
    }
}
