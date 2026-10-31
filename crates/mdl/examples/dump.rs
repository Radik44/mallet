//! Prints what a model's files hold, or with `--all` parses every model of
//! the installation and reports the failures. Format debugging aid.

use content::{search_paths, GameInstall, SearchPathOptions, Vfs};

fn main() {
    let arg = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "models/props_c17/oildrum001".into());
    let install = GameInstall::detect().expect("Garry's Mod not found");
    let opts = SearchPathOptions {
        skip_workshop: true,
        skip_addons: true,
        ..Default::default()
    };
    let mut vfs = Vfs::new(None);
    vfs.mount_all(&search_paths(&install, &opts), |_| {});

    if arg == "--bodygroups" {
        // Models with a choice of body groups, for testing the `body` key.
        let mut found = 0;
        for name in vfs.paths_with_ext("mdl").map(|p| p.to_string()) {
            let Some(bytes) = vfs.read(&name) else {
                continue;
            };
            let Ok(m) = mdl::Mdl::parse(&bytes) else {
                continue;
            };
            if m.body_parts.iter().any(|p| p.models.len() > 1) {
                let parts: Vec<String> = m
                    .body_parts
                    .iter()
                    .map(|p| format!("{}×{} base {}", p.name, p.models.len(), p.base))
                    .collect();
                println!("{name}: {}", parts.join(", "));
                found += 1;
                if found >= 25 {
                    break;
                }
            }
        }
        return;
    }

    if arg == "--all" {
        let names: Vec<String> = vfs.paths_with_ext("mdl").map(|p| p.to_string()).collect();
        let (mut ok, mut missing, mut failed) = (0usize, 0usize, Vec::new());
        let started = std::time::Instant::now();
        for name in &names {
            let base = name.trim_end_matches(".mdl");
            let (Some(m), Some(v), Some(x)) = (
                vfs.read(name),
                vfs.read(&format!("{base}.vvd")),
                vfs.read(&format!("{base}.dx90.vtx")),
            ) else {
                missing += 1;
                continue;
            };
            match mdl::Mdl::parse(&m).and_then(|m| {
                let vvd = mdl::Vvd::parse(&v)?;
                let vtx = mdl::Vtx::parse(&x, m.version)?;
                mdl::assemble(&m, &vvd, &vtx, 0, &[])
            }) {
                Ok(d) if d.triangle_count() > 0 => ok += 1,
                Ok(_) => failed.push(format!("{name}: no triangles")),
                Err(e) => failed.push(format!("{name}: {e}")),
            }
        }
        println!(
            "{} models: {ok} ok, {missing} without vvd/vtx, {} failed in {:.1} s",
            names.len(),
            failed.len(),
            started.elapsed().as_secs_f64()
        );
        for f in failed.iter().take(40) {
            println!("  {f}");
        }
        return;
    }

    let read = |ext: &str| vfs.read(&format!("{arg}.{ext}")).expect(ext);
    let m = mdl::Mdl::parse(&read("mdl")).expect("mdl");
    let vvd = mdl::Vvd::parse(&read("vvd")).expect("vvd");
    let vtx = mdl::Vtx::parse(&read("dx90.vtx"), m.version).expect("vtx");
    println!("{m:#?}");
    let draw = mdl::assemble(&m, &vvd, &vtx, 0, &[]).expect("assemble");
    println!(
        "vertices {} triangles {} bounds {:?}..{:?}",
        vvd.vertices.len(),
        draw.triangle_count(),
        draw.mins,
        draw.maxs
    );
    for d in &draw.meshes {
        println!(
            "  texture {} ({:?}): {} tris",
            d.texture,
            m.material_candidates(d.texture),
            d.indices.len() / 3
        );
    }
}
