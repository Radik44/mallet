//! Reads models from a real Garry's Mod installation when one is present;
//! passes (skips) otherwise.

use content::{search_paths, GameInstall, SearchPathOptions, Vfs};

fn vfs() -> Option<Vfs> {
    let install = GameInstall::detect()?;
    let opts = SearchPathOptions {
        skip_workshop: true,
        skip_addons: true,
        ..SearchPathOptions::default()
    };
    let mut vfs = Vfs::new(None);
    vfs.mount_all(&search_paths(&install, &opts), |_| {});
    Some(vfs)
}

fn load(vfs: &Vfs, name: &str) -> mdl::DrawModel {
    let base = name.trim_end_matches(".mdl");
    let mdl_bytes = vfs.read(&format!("{base}.mdl")).expect("mdl");
    let m = mdl::Mdl::parse(&mdl_bytes).expect("parse mdl");
    let vvd = mdl::Vvd::parse(&vfs.read(&format!("{base}.vvd")).expect("vvd")).expect("parse vvd");
    let vtx = mdl::Vtx::parse(
        &vfs.read(&format!("{base}.dx90.vtx")).expect("vtx"),
        m.version,
    )
    .expect("parse vtx");
    let draw = mdl::assemble(&m, &vvd, &vtx, 0, &[]).expect("assemble");
    eprintln!(
        "{name}: v{} {} textures {:?} dirs {:?} skins {} parts {} tris {} bounds {:?}..{:?}",
        m.version,
        m.name,
        m.textures,
        m.material_dirs,
        m.skins.len(),
        m.body_parts.len(),
        draw.triangle_count(),
        draw.mins,
        draw.maxs
    );
    draw
}

#[test]
fn hl2_props_assemble_into_triangles() {
    let Some(vfs) = vfs() else {
        eprintln!("GMod not installed, skipping");
        return;
    };
    let drum = load(&vfs, "models/props_c17/oildrum001.mdl");
    assert!(drum.triangle_count() > 100, "{}", drum.triangle_count());
    assert!(
        drum.maxs[2] - drum.mins[2] > 40.0,
        "a drum is taller than 40 units"
    );
    let m = mdl::Mdl::parse(&vfs.read("models/props_c17/oildrum001.mdl").unwrap()).unwrap();
    let candidates = m.material_candidates(drum.meshes[0].texture);
    assert!(
        candidates
            .iter()
            .any(|c| vfs.exists(&content::vfs_material_path(c))),
        "{candidates:?}"
    );

    // A model with several meshes and body parts.
    let chair = load(&vfs, "models/props_c17/furniturechair001a.mdl");
    assert!(chair.triangle_count() > 50);
    for mesh in &chair.meshes {
        assert_eq!(mesh.positions.len(), mesh.normals.len());
        assert_eq!(mesh.positions.len() / 3 * 2, mesh.uvs.len());
        assert!(mesh
            .indices
            .iter()
            .all(|&i| (i as usize) < mesh.positions.len() / 3));
    }
}

#[test]
fn every_prop_in_a_folder_parses() {
    let Some(vfs) = vfs() else {
        return;
    };
    let names: Vec<String> = vfs
        .paths_under("models/props_junk/")
        .filter(|p| p.ends_with(".mdl"))
        .map(|p| p.to_string())
        .collect();
    assert!(names.len() > 20, "{}", names.len());
    let mut failures = Vec::new();
    for name in &names {
        let base = name.trim_end_matches(".mdl");
        let (Some(m), Some(v), Some(x)) = (
            vfs.read(name),
            vfs.read(&format!("{base}.vvd")),
            vfs.read(&format!("{base}.dx90.vtx")),
        ) else {
            continue;
        };
        let result = mdl::Mdl::parse(&m).and_then(|m| {
            let vvd = mdl::Vvd::parse(&v)?;
            let vtx = mdl::Vtx::parse(&x, m.version)?;
            mdl::assemble(&m, &vvd, &vtx, 0, &[])
        });
        match result {
            Ok(d) if d.triangle_count() > 0 => {}
            Ok(_) => failures.push(format!("{name}: no triangles")),
            Err(e) => failures.push(format!("{name}: {e}")),
        }
    }
    assert!(failures.is_empty(), "{failures:#?}");
}
