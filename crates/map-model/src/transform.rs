//! Affine transforms of map objects: rotation, scaling and mirroring of
//! brushes and point entities, with Hammer's texture lock semantics.

use geometry::{Plane, TexAxis, Vec3};
use glam::{DAffine3, DMat3};
use vmf::{Entity, Solid};

/// Which texture properties follow a transformed brush, as Hammer's
/// "Texture Lock" (offsets) and "Texture Scale Lock" toggles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct TextureLock {
    /// Texture axes rotate and shifts follow, so the texture stays attached.
    pub offset: bool,
    /// Texture scale stretches with the brush.
    pub scale: bool,
}

impl TextureLock {
    pub const NONE: TextureLock = TextureLock {
        offset: false,
        scale: false,
    };
    pub const OFFSET: TextureLock = TextureLock {
        offset: true,
        scale: false,
    };
    pub const ALL: TextureLock = TextureLock {
        offset: true,
        scale: true,
    };
}

/// Rotation by `degrees` about `axis` through `pivot`.
pub fn rotation_about(pivot: Vec3, axis: Vec3, degrees: f64) -> Option<DAffine3> {
    let axis = axis.try_normalize()?;
    let rot = DMat3::from_axis_angle(axis, degrees.to_radians());
    Some(DAffine3::from_mat3_translation(rot, pivot - rot * pivot))
}

/// Per-axis scaling about `pivot`; negative factors mirror.
pub fn scaling_about(pivot: Vec3, factors: Vec3) -> Option<DAffine3> {
    if factors.abs().min_element() < 1.0e-9 {
        return None;
    }
    let m = DMat3::from_diagonal(factors);
    Some(DAffine3::from_mat3_translation(m, pivot - m * pivot))
}

/// Rounds away floating-point noise so a 90° rotation of integer
/// coordinates gives integers again.
fn tidy(v: Vec3) -> Vec3 {
    (v * 1.0e4).round() / 1.0e4
}

fn tidy_f(v: f64) -> f64 {
    (v * 1.0e4).round() / 1.0e4
}

fn effective_scale(s: f64) -> f64 {
    if s.abs() < 1.0e-12 {
        0.25
    } else {
        s
    }
}

/// Transforms every side of the solid; `mirror` (negative determinant) flips
/// the point order so planes keep facing outward.
pub fn transform_solid(solid: &mut Solid, m: &DAffine3, lock: TextureLock) {
    let linear = m.matrix3;
    let mirror = linear.determinant() < 0.0;
    for side in &mut solid.sides {
        let anchor = side.plane_points[0];
        let mut pts = side.plane_points.map(|p| tidy(m.transform_point3(p)));
        if mirror {
            pts.swap(0, 2);
        }
        side.plane_points = pts;
        side.plane = Plane::from_points(pts[0], pts[1], pts[2]);
        if lock.offset || lock.scale {
            let anchor_new = m.transform_point3(anchor);
            for axis in [&mut side.uaxis, &mut side.vaxis] {
                transform_axis(axis, &linear, anchor, anchor_new, lock);
            }
        }
        if let Some(vp) = &mut side.vertices_plus {
            for v in vp.iter_mut() {
                *v = tidy(m.transform_point3(*v));
            }
            if mirror {
                vp.reverse();
            }
        }
        if let Some(disp) = &mut side.dispinfo {
            disp.start_position = tidy(m.transform_point3(disp.start_position));
        }
    }
}

/// Rotates a texture axis with the brush and re-anchors its shift so the
/// texel at `anchor` stays the same texel at `anchor_new`.
fn transform_axis(
    axis: &mut TexAxis,
    linear: &DMat3,
    anchor: Vec3,
    anchor_new: Vec3,
    lock: TextureLock,
) {
    let before = axis.texel(anchor);
    let moved = *linear * axis.axis;
    let Some(dir) = moved.try_normalize() else {
        return;
    };
    let old_scale = effective_scale(axis.scale);
    if lock.offset {
        axis.axis = tidy(dir);
    }
    if lock.scale {
        axis.scale = tidy_f(old_scale * moved.length());
    }
    if lock.offset {
        let scale = effective_scale(axis.scale);
        axis.shift = tidy_f(before - anchor_new.dot(axis.axis) / scale);
    }
}

/// A door's or button's `movedir` as pitch, yaw, roll; None for Hammer's old
/// "up" and "down" (yaw -1 and -2), which no turn about another axis changes.
fn movedir(entity: &Entity) -> Option<Vec3> {
    let f: Vec<f64> = entity
        .get("movedir")?
        .split_whitespace()
        .filter_map(|v| v.parse().ok())
        .collect();
    if f.len() != 3 || (f[0] == 0.0 && f[2] == 0.0 && (f[1] == -1.0 || f[1] == -2.0)) {
        return None;
    }
    Some(Vec3::new(f[0], f[1], f[2]))
}

/// Angles after a turn or a mirror: a turn turns them; a mirror reflects
/// where they face and flips the local left (Y) axis so they stay a proper
/// rotation, the way Hammer mirrors props. None for a stretch.
fn turned_angles(linear: &DMat3, angles: Vec3) -> Option<Vec3> {
    let a = angle_matrix(angles);
    if is_rotation(linear) {
        return Some(tidy(matrix_angles(&(*linear * a))));
    }
    if is_reflection(linear) {
        let flip_left = DMat3::from_diagonal(glam::DVec3::new(1.0, -1.0, 1.0));
        return Some(tidy(matrix_angles(&(*linear * a * flip_left))));
    }
    None
}

/// A vector key ("x y z") of an entity.
fn vec_key(entity: &Entity, key: &str) -> Option<Vec3> {
    let f: Vec<f64> = entity
        .get(key)?
        .split_whitespace()
        .filter_map(|v| v.parse().ok())
        .collect();
    (f.len() == 3).then(|| Vec3::new(f[0], f[1], f[2]))
}

/// An info_overlay's projection frame goes with it: BasisOrigin moves as a
/// point, BasisNormal, BasisU and BasisV turn as directions (kept unit length).
/// Without this the decal stays behind while its origin moves.
pub fn transform_overlay_basis(entity: &mut Entity, m: &DAffine3) {
    if let Some(o) = vec_key(entity, "BasisOrigin") {
        set_keyvalue(
            entity,
            "BasisOrigin",
            &crate::format::fmt_vec3(tidy(m.transform_point3(o))),
        );
    }
    for key in ["BasisNormal", "BasisU", "BasisV"] {
        if let Some(v) = vec_key(entity, key) {
            if let Some(dir) = (m.matrix3 * v).try_normalize() {
                set_keyvalue(entity, key, &crate::format::fmt_vec3(tidy(dir)));
            }
        }
    }
}

/// Moves the entity's origin and, for turns and mirrors, its `angles` and
/// `movedir` (the way a door or button travels). Returns false when nothing
/// changed: a brush entity with neither origin nor movedir.
pub fn transform_entity(entity: &mut Entity, m: &DAffine3) -> bool {
    let linear = m.matrix3;
    let dir = movedir(entity).and_then(|d| turned_angles(&linear, d));
    if let Some(dir) = dir {
        set_keyvalue(entity, "movedir", &crate::format::fmt_vec3(dir));
    }
    let Some(origin) = entity.origin() else {
        return dir.is_some();
    };
    let origin = tidy(m.transform_point3(origin));
    set_keyvalue(entity, "origin", &crate::format::fmt_vec3(origin));
    transform_overlay_basis(entity, m);
    if is_rotation(&linear) || is_reflection(&linear) {
        if let Some(turned) = entity.angles().and_then(|a| turned_angles(&linear, a)) {
            set_keyvalue(entity, "angles", &crate::format::fmt_vec3(turned));
        }
    } else if entity.get("model").is_some() {
        // A scale goes into `modelscale`. prop_static has no such key in
        // Source, but the compile step turns a scaled one into prop_dynamic,
        // so the editor keeps the class and the scale together.
        // The axis factor farthest from 1: dragging one axis by ×2 means ×2, not ×1.26.
        let s = [linear.x_axis.x, linear.y_axis.y, linear.z_axis.z]
            .into_iter()
            .fold(1.0_f64, |best, f| {
                if (f - 1.0).abs() > (best - 1.0).abs() {
                    f
                } else {
                    best
                }
            })
            .abs();
        if (s - 1.0).abs() > 1.0e-9 {
            let old: f64 = entity
                .get("modelscale")
                .and_then(|v| v.trim().parse().ok())
                .filter(|v: &f64| *v > 0.0)
                .unwrap_or(1.0);
            let next = (old * s * 1000.0).round() / 1000.0;
            set_keyvalue(entity, "modelscale", &next.to_string());
        }
    }
    true
}

/// An orthogonal matrix that flips handedness: a mirror, possibly turned.
fn is_reflection(m: &DMat3) -> bool {
    let i = *m * m.transpose();
    (i - DMat3::IDENTITY)
        .to_cols_array()
        .iter()
        .all(|v| v.abs() < 1.0e-6)
        && m.determinant() < 0.0
}

fn is_rotation(m: &DMat3) -> bool {
    let i = *m * m.transpose();
    (i - DMat3::IDENTITY)
        .to_cols_array()
        .iter()
        .all(|v| v.abs() < 1.0e-6)
        && m.determinant() > 0.0
}

/// Source's `AngleMatrix`: pitch, yaw, roll in degrees to a matrix whose
/// columns are the forward, left and up vectors.
pub fn angle_matrix(angles: Vec3) -> DMat3 {
    let (sp, cp) = angles.x.to_radians().sin_cos();
    let (sy, cy) = angles.y.to_radians().sin_cos();
    let (sr, cr) = angles.z.to_radians().sin_cos();
    let forward = Vec3::new(cp * cy, cp * sy, -sp);
    let left = Vec3::new(sr * sp * cy - cr * sy, sr * sp * sy + cr * cy, sr * cp);
    let up = Vec3::new(cr * sp * cy + sr * sy, cr * sp * sy - sr * cy, cr * cp);
    DMat3::from_cols(forward, left, up)
}

/// Source's `MatrixAngles`: the inverse of [`angle_matrix`], in degrees.
pub fn matrix_angles(m: &DMat3) -> Vec3 {
    let forward = m.x_axis;
    let left = m.y_axis;
    let up = m.z_axis;
    let xy = forward.x.hypot(forward.y);
    let angles = if xy > 0.001 {
        Vec3::new(
            (-forward.z).atan2(xy).to_degrees(),
            forward.y.atan2(forward.x).to_degrees(),
            left.z.atan2(up.z).to_degrees(),
        )
    } else {
        Vec3::new(
            (-forward.z).atan2(xy).to_degrees(),
            (-left.x).atan2(left.y).to_degrees(),
            0.0,
        )
    };
    angles.map(normalize_degrees)
}

/// Wraps an angle into (-180, 180], so noise never yields -180 for 180.
fn normalize_degrees(a: f64) -> f64 {
    let a = a.rem_euclid(360.0);
    if a > 180.0 + 1.0e-9 {
        a - 360.0
    } else {
        a
    }
}

pub fn set_keyvalue(entity: &mut Entity, key: &str, value: &str) {
    match entity
        .keyvalues
        .iter_mut()
        .find(|(k, _)| k.eq_ignore_ascii_case(key))
    {
        Some(kv) => kv.1 = value.to_string(),
        None => entity.keyvalues.push((key.to_string(), value.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: Vec3, b: Vec3) -> bool {
        (a - b).abs().max_element() < 1.0e-6
    }

    #[test]
    fn angles_round_trip_through_matrix() {
        for angles in [
            Vec3::new(0.0, 0.0, 0.0),
            Vec3::new(0.0, 90.0, 0.0),
            Vec3::new(30.0, -45.0, 10.0),
            Vec3::new(-60.0, 170.0, -120.0),
        ] {
            let back = matrix_angles(&angle_matrix(angles));
            assert!(close(back, angles), "{angles} -> {back}");
        }
    }

    #[test]
    fn an_overlay_takes_its_frame_along() {
        let mut overlay = Entity {
            id: 1,
            classname: "info_overlay".into(),
            keyvalues: vec![
                ("origin".into(), "64 0 0".into()),
                ("BasisOrigin".into(), "64 0 0".into()),
                ("BasisNormal".into(), "1 0 0".into()),
                ("BasisU".into(), "0 1 0".into()),
                ("BasisV".into(), "0 0 1".into()),
            ],
            connections: Vec::new(),
            solids: Vec::new(),
            editor: vmf::Editor::default(),
            hidden: false,
        };
        let r = rotation_about(Vec3::ZERO, Vec3::Z, 90.0).unwrap();
        assert!(transform_entity(&mut overlay, &r));
        assert_eq!(overlay.get("origin"), Some("0 64 0"));
        assert_eq!(overlay.get("BasisOrigin"), Some("0 64 0"));
        assert_eq!(overlay.get("BasisNormal"), Some("0 1 0"));
        assert_eq!(overlay.get("BasisU"), Some("-1 0 0"));
        assert_eq!(overlay.get("BasisV"), Some("0 0 1"));
    }

    #[test]
    fn a_mirrored_prop_faces_the_mirrored_way() {
        let mirror_x = DAffine3::from_mat3(DMat3::from_diagonal(glam::DVec3::new(-1.0, 1.0, 1.0)));
        // Facing yaw 30 (forward x+, y+): mirrored across X it faces x-, y+ - yaw 150.
        let a = turned_angles(&mirror_x.matrix3, Vec3::new(0.0, 30.0, 0.0)).unwrap();
        assert!(close(a, Vec3::new(0.0, 150.0, 0.0)), "{a}");
        // A tilted lamp pointing down-forward keeps its pitch, its forward mirrored.
        let b = turned_angles(&mirror_x.matrix3, Vec3::new(45.0, 0.0, 0.0)).unwrap();
        let f = angle_matrix(b) * Vec3::X;
        assert!(
            close(f, Vec3::new(-(0.5f64).sqrt(), 0.0, -(0.5f64).sqrt())),
            "{f}"
        );
        // A stretch is no mirror.
        let stretch = DMat3::from_diagonal(glam::DVec3::new(2.0, 1.0, 1.0));
        assert!(turned_angles(&stretch, Vec3::new(0.0, 30.0, 0.0)).is_none());
    }

    #[test]
    fn a_turned_door_turns_its_travel() {
        let entity = |movedir: &str| Entity {
            id: 1,
            classname: "func_door".into(),
            keyvalues: vec![("movedir".into(), movedir.into())],
            connections: Vec::new(),
            solids: Vec::new(),
            editor: vmf::Editor::default(),
            hidden: false,
        };
        let mut door = entity("0 0 0");
        let r = rotation_about(Vec3::ZERO, Vec3::Z, 90.0).unwrap();
        assert!(
            transform_entity(&mut door, &r),
            "no origin, but movedir turned"
        );
        assert_eq!(door.get("movedir"), Some("0 90 0"));
        // Hammer's "up" stays up.
        let mut lift = entity("0 -1 0");
        assert!(!transform_entity(&mut lift, &r));
        assert_eq!(lift.get("movedir"), Some("0 -1 0"));
    }

    #[test]
    fn yaw_rotation_adds_to_entity_yaw() {
        let r = rotation_about(Vec3::ZERO, Vec3::Z, 90.0).unwrap();
        let a = matrix_angles(&(r.matrix3 * angle_matrix(Vec3::new(0.0, 45.0, 0.0))));
        assert!(close(a, Vec3::new(0.0, 135.0, 0.0)), "{a}");
        // Forward along +X turned by +90° about Z points along +Y.
        let f = r.matrix3 * Vec3::X;
        assert!(close(f, Vec3::Y));
    }

    #[test]
    fn rotation_keeps_pivot_fixed_and_tidies_noise() {
        let r = rotation_about(Vec3::new(64.0, 32.0, 0.0), Vec3::Z, 90.0).unwrap();
        assert!(close(
            r.transform_point3(Vec3::new(64.0, 32.0, 5.0)),
            Vec3::new(64.0, 32.0, 5.0)
        ));
        let p = tidy(r.transform_point3(Vec3::new(128.0, 32.0, 0.0)));
        assert_eq!(p, Vec3::new(64.0, 96.0, 0.0));
    }

    #[test]
    fn mirroring_flips_plane_point_order() {
        let m = scaling_about(Vec3::ZERO, Vec3::new(-1.0, 1.0, 1.0)).unwrap();
        assert!(m.matrix3.determinant() < 0.0);
        let pts = [
            Vec3::new(-64.0, 64.0, 0.0),
            Vec3::new(64.0, 64.0, 0.0),
            Vec3::new(64.0, -64.0, 0.0),
        ];
        let before = Plane::from_points(pts[0], pts[1], pts[2]).unwrap();
        let mut moved = pts.map(|p| m.transform_point3(p));
        moved.swap(0, 2);
        let after = Plane::from_points(moved[0], moved[1], moved[2]).unwrap();
        assert!(close(before.normal, after.normal));
    }
}
