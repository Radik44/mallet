//! Parses the FGD files shipped with Garry's Mod when the game is installed;
//! passes (skips) otherwise.

use std::path::PathBuf;

fn gmod_fgd() -> Option<PathBuf> {
    for root in [
        "C:\\Program Files (x86)\\Steam\\steamapps\\common\\GarrysMod",
        "C:\\Program Files\\Steam\\steamapps\\common\\GarrysMod",
        "D:\\SteamLibrary\\steamapps\\common\\GarrysMod",
    ] {
        let p = PathBuf::from(root).join("bin").join("garrysmod.fgd");
        if p.is_file() {
            return Some(p);
        }
    }
    None
}

#[test]
fn gmod_fgd_parses_with_includes() {
    let Some(path) = gmod_fgd() else {
        eprintln!("GMod not installed, skipping");
        return;
    };
    let fgd = fgd::Fgd::load(&path).unwrap();
    for w in &fgd.warnings {
        eprintln!("warning: {w}");
    }
    // base.fgd + halflife2.fgd + garrysmod.fgd define well over four hundred classes.
    assert!(fgd.classes.len() > 400, "{}", fgd.classes.len());
    assert!(fgd.warnings.len() < 5, "{} warnings", fgd.warnings.len());
    assert_eq!(fgd.map_size, Some((-16384, 16384)));

    let light = fgd.resolve("light_environment").expect("light_environment");
    assert!(light.kind.is_point());
    assert!(light.key("pitch").is_some());
    assert!(light.icon.as_deref().unwrap_or("").contains("light_env"));
    assert!(light
        .inputs
        .iter()
        .any(|i| i.name.eq_ignore_ascii_case("TurnOn")));

    // `light` (point) inherits from `Light` (base): the names differ only in case.
    let light = fgd.resolve("light").expect("light");
    assert_eq!(light.color, [180, 10, 180]);
    assert_eq!(
        light.key("_light").and_then(|k| k.default.as_deref()),
        Some("255 255 255 200")
    );
    assert!(light.key("targetname").is_some());
    assert!(light.key("_distance").is_some());

    let start = fgd.resolve("info_player_start").expect("info_player_start");
    assert_eq!(
        start.model.as_deref(),
        Some("models/editor/playerstart.mdl")
    );
    assert!(start.key("angles").is_some(), "Angles base class inherited");

    let prop = fgd.resolve("prop_physics").expect("prop_physics");
    assert!(prop.key("model").is_some());
    let model_key = prop.key("model").unwrap();
    assert_eq!(model_key.ty, "studio");
    assert!(prop
        .outputs
        .iter()
        .any(|o| o.name.eq_ignore_ascii_case("OnBreak")));
    let flags = prop.key("spawnflags").expect("spawnflags");
    assert!(!flags.flags.is_empty());

    let detail = fgd.resolve("func_detail").expect("func_detail");
    assert_eq!(detail.kind, fgd::ClassKind::Solid);

    // GMod-specific classes come from garrysmod.fgd.
    assert!(fgd.class("lua_run").is_some(), "lua_run");
    assert!(fgd.class("env_skypaint").is_some(), "env_skypaint");

    // Every entity class resolves without panicking and has sane bounds.
    for c in fgd.entity_classes() {
        let r = fgd.resolve(&c.name).unwrap();
        for k in 0..3 {
            assert!(
                r.mins[k] <= r.maxs[k],
                "{}: {:?} {:?}",
                c.name,
                r.mins,
                r.maxs
            );
        }
    }
}
