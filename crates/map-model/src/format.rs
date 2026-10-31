//! Number formatting that matches what Hammer writes.

use geometry::{TexAxis, Vec3};

/// C's `%g` with six significant digits: `64`, `0.25`, `1065.02`, `-47.5`.
/// Hammer prints every coordinate this way, so re-saved files diff cleanly.
pub fn fmt_g(v: f64) -> String {
    if v == 0.0 || !v.is_finite() {
        return "0".to_string();
    }
    if v.fract() == 0.0 && v.abs() < 1e15 {
        return format!("{}", v as i64);
    }
    let exp = v.abs().log10().floor() as i32;
    let decimals = (5 - exp).clamp(0, 12) as usize;
    let s = format!("{v:.decimals$}");
    let s = s.trim_end_matches('0').trim_end_matches('.');
    if s == "-0" {
        "0".to_string()
    } else {
        s.to_string()
    }
}

pub fn fmt_vec3(v: Vec3) -> String {
    format!("{} {} {}", fmt_g(v.x), fmt_g(v.y), fmt_g(v.z))
}

/// `(x y z) (x y z) (x y z)`
pub fn fmt_plane(points: &[Vec3; 3]) -> String {
    format!(
        "({}) ({}) ({})",
        fmt_vec3(points[0]),
        fmt_vec3(points[1]),
        fmt_vec3(points[2])
    )
}

/// `[x y z shift] scale`
pub fn fmt_axis(a: &TexAxis) -> String {
    format!(
        "[{} {} {} {}] {}",
        fmt_g(a.axis.x),
        fmt_g(a.axis.y),
        fmt_g(a.axis.z),
        fmt_g(a.shift),
        fmt_g(a.scale)
    )
}

/// `[x y z]`
pub fn fmt_bracket_vec3(v: Vec3) -> String {
    format!("[{}]", fmt_vec3(v))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_hammer_output() {
        assert_eq!(fmt_g(64.0), "64");
        assert_eq!(fmt_g(-512.0), "-512");
        assert_eq!(fmt_g(0.25), "0.25");
        assert_eq!(fmt_g(4.5), "4.5");
        assert_eq!(fmt_g(1065.02), "1065.02");
        assert_eq!(fmt_g(193.301), "193.301");
        assert_eq!(fmt_g(1065.0234567), "1065.02");
        assert_eq!(fmt_g(0.123456789), "0.123457");
        assert_eq!(fmt_g(-47.5), "-47.5");
        assert_eq!(fmt_g(0.0), "0");
        assert_eq!(fmt_g(-0.0), "0");
        assert_eq!(fmt_g(123456.0), "123456");
        assert_eq!(
            fmt_plane(&[Vec3::new(-512.0, 512.0, -64.0), Vec3::X, Vec3::ZERO]),
            "(-512 512 -64) (1 0 0) (0 0 0)"
        );
        assert_eq!(
            fmt_axis(&TexAxis::new(Vec3::new(0.0, -1.0, 0.0), 32.5, 0.25)),
            "[0 -1 0 32.5] 0.25"
        );
    }
}
