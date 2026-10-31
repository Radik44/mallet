//! Smoke test against a real Garry's Mod installation. Skips (passes) when
//! the game is not installed, so CI stays green; on a developer machine it
//! checks the mount list, the index and material loading end to end.

use content::{search_paths, GameInstall, SearchPathOptions, Vfs};

#[test]
fn mounts_base_content_and_resolves_dev_textures() {
    let Some(install) = GameInstall::detect() else {
        eprintln!("Garry's Mod not installed, skipping");
        return;
    };
    let options = SearchPathOptions {
        skip_workshop: true,
        skip_addons: true,
        skip_mount_cfg: true,
    };
    let mounts = search_paths(&install, &options);
    assert!(
        mounts.iter().any(|m| m.label == "hl2_textures"),
        "{mounts:?}"
    );
    assert!(mounts.iter().any(|m| m.label == "hl2_misc"), "{mounts:?}");

    let mut vfs = Vfs::new(None);
    vfs.mount_all(&mounts, |_| {});
    for m in vfs.mounts() {
        assert!(m.error.is_none(), "{}: {:?}", m.label, m.error);
    }
    // HL2 alone ships well over ten thousand files.
    assert!(vfs.len() > 10_000, "{}", vfs.len());

    // Dev textures live in hl2_misc (vmt) and hl2_textures (vtf).
    let m = vfs
        .material("DEV/DEV_MEASUREGENERIC01B")
        .expect("dev material");
    assert!(m.shader_is("LightmappedGeneric"), "{}", m.shader);
    let tex = m.base_texture().expect("base texture");
    let v = vfs.texture(&tex).expect("dev texture");
    assert_eq!((v.width, v.height), (128, 128));
    assert!(v.format.is_compressed());
    let rgba = v.decode_rgba8(0, 0, 0).unwrap();
    assert_eq!(rgba.data.len(), 128 * 128 * 4);
    // The measure pattern has lines on a flat background: more than one colour.
    let first = &rgba.data[0..3];
    assert!(rgba.data.chunks(4).any(|px| &px[0..3] != first));

    // Tool textures carry %compile flags.
    let nodraw = vfs.material("tools/toolsnodraw").expect("toolsnodraw");
    assert!(nodraw.is_tool_texture());
    assert!(nodraw.compile_flag("nodraw"));

    // A patch material resolves through its include.
    let patched: Vec<String> = vfs
        .paths_with_ext("vmt")
        .filter(|p| p.starts_with("materials/"))
        .filter_map(|p| {
            let text = String::from_utf8_lossy(&vfs.read(p)?).to_string();
            vmt::Material::parse(&text)
                .ok()
                .filter(|m| m.is_patch())
                .map(|_| p.to_string())
        })
        .take(1)
        .collect();
    if let Some(p) = patched.first() {
        let m = vfs.material(p).unwrap_or_else(|e| panic!("{p}: {e}"));
        assert!(!m.is_patch(), "patch {p} was not resolved: {m:?}");
    }
}
