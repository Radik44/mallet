//! content-probe: mount a real Garry's Mod installation the way the game does
//! and report what is visible. With `--vmf`, resolve every material a map
//! uses down to its VTF, which is exactly what the viewport will have to do.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::time::Instant;

use clap::Parser;
use content::{search_paths, GameInstall, MountKind, SearchPathOptions, Vfs};
use walkdir::WalkDir;

#[derive(Parser, Debug)]
#[command(
    name = "content-probe",
    about = "Mount Garry's Mod content and resolve what maps need"
)]
struct Args {
    /// Game root (`.../steamapps/common/GarrysMod`); detected through Steam when omitted.
    #[arg(long)]
    root: Option<PathBuf>,

    /// Do not mount Workshop downloads.
    #[arg(long)]
    no_workshop: bool,

    /// Do not mount garrysmod/addons.
    #[arg(long)]
    no_addons: bool,

    /// Where LZMA Workshop archives are extracted.
    #[arg(long)]
    cache: Option<PathBuf>,

    /// VMF files or directories: resolve every material they reference.
    #[arg(long)]
    vmf: Vec<PathBuf>,

    /// Print the resolved material with this name and where it came from.
    #[arg(long)]
    material: Option<String>,

    /// Decode this texture (material-relative name) ...
    #[arg(long)]
    texture: Option<String>,

    /// ... to this PNG file.
    #[arg(long)]
    out: Option<PathBuf>,

    /// List every mount, including the ones without files.
    #[arg(short, long)]
    verbose: bool,
}

fn main() {
    let args = Args::parse();

    let install = match &args.root {
        Some(r) => GameInstall::at(r),
        None => GameInstall::detect(),
    };
    let Some(install) = install else {
        eprintln!("Garry's Mod installation not found; pass --root");
        std::process::exit(2);
    };
    println!("game root: {}", install.root.display());
    println!(
        "workshop:  {}",
        install
            .workshop_dir
            .as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "none".into())
    );
    println!(
        "fgd:       {}",
        install
            .fgd_files()
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    );

    let cache = args.cache.clone().or_else(|| {
        std::env::var_os("LOCALAPPDATA").map(|l| {
            PathBuf::from(l)
                .join("mallet")
                .join("cache")
                .join("workshop")
        })
    });

    let options = SearchPathOptions {
        skip_workshop: args.no_workshop,
        skip_addons: args.no_addons,
        skip_mount_cfg: false,
    };
    let mounts = search_paths(&install, &options);
    println!("\n{} search paths", mounts.len());

    let started = Instant::now();
    let mut vfs = Vfs::new(cache);
    vfs.mount_all(&mounts, |info| {
        if args.verbose || info.error.is_some() || info.kind != MountKind::Gma {
            match &info.error {
                Some(e) => println!("  !! {:<28} {}", info.label, e),
                None => println!(
                    "  {:<31} {:>7} files {:>6} ms  {}",
                    info.label,
                    info.files,
                    info.mount_ms,
                    kind(info.kind)
                ),
            }
        }
    });
    let mount_ms = started.elapsed().as_millis();

    let gma_ok = vfs
        .mounts()
        .iter()
        .filter(|m| m.kind == MountKind::Gma && m.error.is_none())
        .count();
    let gma_files: usize = vfs
        .mounts()
        .iter()
        .filter(|m| m.kind == MountKind::Gma)
        .map(|m| m.files)
        .sum();
    let failed = vfs.mounts().iter().filter(|m| m.error.is_some()).count();
    println!(
        "\nmounted {} sources ({} failed) in {} ms; addons/workshop archives: {} with {} files",
        vfs.mounts().len(),
        failed,
        mount_ms,
        gma_ok,
        gma_files
    );

    let mut by_ext: BTreeMap<String, usize> = BTreeMap::new();
    for p in vfs.paths() {
        let ext = p.rsplit('.').next().unwrap_or("").to_string();
        *by_ext.entry(ext).or_default() += 1;
    }
    let interesting = ["vmt", "vtf", "mdl", "wav", "mp3", "bsp", "pcf", "txt"];
    println!(
        "{} visible files: {}",
        vfs.len(),
        interesting
            .iter()
            .map(|e| format!("{e} {}", by_ext.get(*e).copied().unwrap_or(0)))
            .collect::<Vec<_>>()
            .join(", ")
    );

    if let Some(name) = &args.material {
        show_material(&vfs, name);
    }
    if let Some(name) = &args.texture {
        let out = args
            .out
            .clone()
            .unwrap_or_else(|| PathBuf::from("texture.png"));
        dump_texture(&vfs, name, &out);
    }
    if !args.vmf.is_empty() {
        resolve_maps(&vfs, &args.vmf);
    }
}

fn kind(k: MountKind) -> &'static str {
    match k {
        MountKind::Dir => "dir",
        MountKind::Vpk => "vpk",
        MountKind::Gma => "gma",
    }
}

fn show_material(vfs: &Vfs, name: &str) {
    println!("\nmaterial {name}:");
    let path = content::vfs_material_path(name);
    println!("  path   {path}");
    println!("  source {}", vfs.source_of(&path).unwrap_or("not found"));
    match vfs.material(name) {
        Ok(m) => {
            println!("  shader {}", m.shader);
            for (k, v) in &m.params {
                println!("    {k} = {v:?}");
            }
            for p in &m.proxies {
                println!("    proxy {}", p.name);
            }
            if let Some(t) = m.base_texture() {
                match vfs.texture(&t) {
                    Ok(v) => println!(
                        "  $basetexture {t}: {:?} from {}",
                        v,
                        vfs.source_of(&content::vfs_texture_path(&t)).unwrap_or("?")
                    ),
                    Err(e) => println!("  $basetexture {t}: {e}"),
                }
            }
        }
        Err(e) => println!("  error: {e}"),
    }
}

fn dump_texture(vfs: &Vfs, name: &str, out: &Path) {
    match vfs.texture(name) {
        Ok(v) => {
            println!("\ntexture {name}: {v:?}");
            match v.decode_rgba8(0, 0, 0) {
                Ok(mip) => {
                    let file = std::fs::File::create(out).expect("create png");
                    let mut enc =
                        png::Encoder::new(std::io::BufWriter::new(file), mip.width, mip.height);
                    enc.set_color(png::ColorType::Rgba);
                    enc.set_depth(png::BitDepth::Eight);
                    let mut w = enc.write_header().expect("png header");
                    w.write_image_data(&mip.data).expect("png data");
                    println!("  wrote {}x{} to {}", mip.width, mip.height, out.display());
                }
                Err(e) => println!("  decode failed: {e}"),
            }
        }
        Err(e) => println!("\ntexture {name}: {e}"),
    }
}

struct MapResolution {
    materials: usize,
    vmt_missing: Vec<String>,
    vmt_bad: Vec<String>,
    vtf_missing: Vec<String>,
    vtf_bad: Vec<String>,
    tool: usize,
    no_basetexture: usize,
}

fn resolve_maps(vfs: &Vfs, inputs: &[PathBuf]) {
    let mut files: Vec<PathBuf> = Vec::new();
    for p in inputs {
        if p.is_file() {
            files.push(p.clone());
        } else {
            for e in WalkDir::new(p).into_iter().filter_map(Result::ok) {
                if e.file_type().is_file()
                    && e.path()
                        .extension()
                        .and_then(|x| x.to_str())
                        .is_some_and(|x| x.eq_ignore_ascii_case("vmf"))
                {
                    files.push(e.into_path());
                }
            }
        }
    }
    files.sort();

    println!("\nmaterial resolution per map (vmt = material files, vtf = their $basetexture):");
    let mut all_missing: BTreeMap<String, usize> = BTreeMap::new();
    let mut total_materials = 0usize;
    let mut total_ok = 0usize;
    let mut fully = 0usize;
    for f in &files {
        let Ok(text) = std::fs::read_to_string(f) else {
            continue;
        };
        let Ok(map) = vmf::Map::parse(&text) else {
            continue;
        };
        let names: BTreeSet<String> = map
            .solids()
            .flat_map(|s| {
                s.sides
                    .iter()
                    .map(|side| side.material.to_ascii_lowercase())
            })
            .filter(|m| !m.is_empty())
            .collect();
        let r = resolve_materials(vfs, &names);
        let ok = r.materials
            - r.vmt_missing.len()
            - r.vmt_bad.len()
            - r.vtf_missing.len()
            - r.vtf_bad.len();
        total_materials += r.materials;
        total_ok += ok;
        if ok == r.materials {
            fully += 1;
        }
        for m in &r.vmt_missing {
            *all_missing.entry(m.clone()).or_default() += 1;
        }
        println!(
            "  {:>4}/{:<4} ok  vmt missing {:>3}  vmt bad {:>2}  vtf missing {:>3}  vtf bad {:>2}  tool {:>3}  {}",
            ok,
            r.materials,
            r.vmt_missing.len(),
            r.vmt_bad.len(),
            r.vtf_missing.len(),
            r.vtf_bad.len(),
            r.tool,
            f.display().to_string().replace('\\', "/")
        );
        if !r.vmt_bad.is_empty() || !r.vtf_bad.is_empty() {
            for m in r.vmt_bad.iter().take(3) {
                println!("        bad vmt: {m}");
            }
            for m in r.vtf_bad.iter().take(3) {
                println!("        bad vtf: {m}");
            }
        }
        let _ = r.no_basetexture;
    }
    println!(
        "\n{} maps, {} fully resolved; {}/{} material references resolved to a decodable texture",
        files.len(),
        fully,
        total_ok,
        total_materials
    );
    if !all_missing.is_empty() {
        let mut v: Vec<(&String, &usize)> = all_missing.iter().collect();
        v.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0)));
        println!("most common missing materials:");
        for (m, n) in v.iter().take(15) {
            println!("  {n:>3}  {m}");
        }
    }
}

fn resolve_materials(vfs: &Vfs, names: &BTreeSet<String>) -> MapResolution {
    let mut r = MapResolution {
        materials: names.len(),
        vmt_missing: Vec::new(),
        vmt_bad: Vec::new(),
        vtf_missing: Vec::new(),
        vtf_bad: Vec::new(),
        tool: 0,
        no_basetexture: 0,
    };
    for name in names {
        let mat = match vfs.material(name) {
            Ok(m) => m,
            Err(content::MaterialError::NotFound(_)) => {
                r.vmt_missing.push(name.clone());
                continue;
            }
            Err(e) => {
                r.vmt_bad.push(format!("{name}: {e}"));
                continue;
            }
        };
        if mat.is_tool_texture() {
            r.tool += 1;
        }
        let Some(tex) = mat.base_texture() else {
            // Sky, water without base texture, pure-colour materials.
            r.no_basetexture += 1;
            continue;
        };
        match vfs.texture(&tex) {
            Ok(_) => {}
            Err(content::MaterialError::NotFound(_)) => {
                r.vtf_missing.push(format!("{name} -> {tex}"))
            }
            Err(e) => r.vtf_bad.push(format!("{name} -> {e}")),
        }
    }
    r
}
