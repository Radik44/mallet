//! Packing custom content into the BSP (Hammer users do this with
//! Pakrat or VIDE): the map's materials, models, sounds and skybox are
//! followed to every file they need, each file is traced to the mount that
//! provides it, and the ones that do not ship with the game are written
//! into the BSP with the game's own `bspzip`.

use std::collections::{BTreeMap, HashSet};
use std::path::PathBuf;
use std::process::Command;

use content::{vfs_material_path, GameInstall, MountKind};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackRequest {
    pub materials: Vec<String>,
    pub models: Vec<String>,
    /// Sound names as written in entity keys (`ambient/x.wav`).
    pub sounds: Vec<String>,
    pub skyname: Option<String>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackFile {
    /// VFS path (`materials/x/y.vmt`).
    pub path: String,
    /// Mount label (`project`, `addon:foo`, `hl2_textures`…).
    pub source: String,
    pub size: u64,
    /// Not part of the game everyone has: must travel with the BSP.
    pub custom: bool,
    /// The material, model or sound that asked for it.
    pub needed_by: String,
}

#[derive(Serialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PackReport {
    pub files: Vec<PackFile>,
    /// Referenced but found nowhere.
    pub missing: Vec<String>,
    pub custom_bytes: u64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PackResult {
    pub packed: usize,
    pub bytes: u64,
    pub output: String,
    pub installed: Option<String>,
    pub log: Vec<String>,
}

/// Mounts whose files every Garry's Mod installation already has.
fn is_stock(label: &str, kind: MountKind) -> bool {
    match kind {
        MountKind::Vpk => true,
        MountKind::Gma => false,
        MountKind::Dir => matches!(label, "sourceengine" | "platform" | "fallbacks"),
    }
}

/// Texture parameters a material can point at (lower-case keys).
const TEXTURE_KEYS: &[&str] = &[
    "$basetexture",
    "$basetexture2",
    "$bumpmap",
    "$bumpmap2",
    "$normalmap",
    "$envmapmask",
    "$detail",
    "$blendmodulatetexture",
    "$lightwarptexture",
    "$selfillummask",
    "$phongexponenttexture",
    "$hdrbasetexture",
    "$hdrcompressedtexture",
    "$texture2",
    "$flowmap",
    "$refracttexture",
    "$envmap",
    "$dudvmap",
];

struct Walk<'a> {
    state: &'a AppState,
    files: BTreeMap<String, PackFile>,
    missing: Vec<String>,
    seen_materials: HashSet<String>,
}

impl Walk<'_> {
    fn add(&mut self, path: &str, needed_by: &str) -> bool {
        let key = content::normalize(path);
        if self.files.contains_key(&key) {
            return true;
        }
        let Some((info, size)) = self.state.locate(&key) else {
            return false;
        };
        // An addon may shadow a stock file: the player still has the original.
        let custom = !is_stock(&info.label, info.kind) && !self.state.has_stock(&key);
        self.files.insert(
            key.clone(),
            PackFile {
                path: key,
                source: info.label.clone(),
                size,
                custom,
                needed_by: needed_by.to_string(),
            },
        );
        true
    }

    fn material(&mut self, name: &str, needed_by: &str) {
        let key = content::normalize(name.trim_end_matches(".vmt"));
        if key.is_empty() || !self.seen_materials.insert(key.clone()) {
            return;
        }
        let vmt = vfs_material_path(&key);
        if !self.add(&vmt, needed_by) {
            self.missing.push(vmt);
            return;
        }
        let Some((mat, _)) = self.state.material(&key) else {
            return;
        };
        // Patch materials include another VMT, which brings its own textures.
        if let Some(bytes) = self.state.read(&vmt) {
            let text = String::from_utf8_lossy(&bytes);
            if let Ok(raw) = vmt::Material::parse(&text) {
                if let Some(include) = raw.include() {
                    let inc = include.trim_end_matches(".vmt");
                    let inc_path = if inc.starts_with("materials/") {
                        format!("{inc}.vmt")
                    } else {
                        vfs_material_path(inc)
                    };
                    if !self.add(&inc_path, &key) {
                        self.missing.push(inc_path);
                    }
                }
            }
        }
        for k in TEXTURE_KEYS {
            let Some(v) = mat.texture(k) else { continue };
            if v == "env_cubemap" {
                continue;
            }
            let path = content::vfs_texture_path(&v);
            if !self.add(&path, &key) {
                self.missing.push(path);
            }
        }
    }

    fn model(&mut self, name: &str) {
        let key = content::normalize(name);
        let base = key.trim_end_matches(".mdl").to_string();
        if base.is_empty() {
            return;
        }
        let mdl = format!("{base}.mdl");
        if !self.add(&mdl, &key) {
            self.missing.push(mdl);
            return;
        }
        for ext in ["vvd", "dx90.vtx", "dx80.vtx", "sw.vtx", "phy", "ani"] {
            // Optional companions: only the ones that exist are listed.
            self.add(&format!("{base}.{ext}"), &key);
        }
        if let Some(bytes) = self.state.read(&mdl) {
            if let Ok(m) = mdl::Mdl::parse(&bytes) {
                for t in 0..m.textures.len() {
                    let candidates = m.material_candidates(t);
                    let found = candidates
                        .iter()
                        .find(|c| self.state.exists(&vfs_material_path(c)))
                        .cloned();
                    match found {
                        Some(c) => self.material(&c, &key),
                        None => {
                            if let Some(first) = candidates.first() {
                                self.missing.push(vfs_material_path(first));
                            }
                        }
                    }
                }
            }
        }
    }

    fn sound(&mut self, name: &str) {
        // Sound names may start with channel/flag characters: ")weapons/x.wav".
        let trimmed = name.trim_start_matches(|c: char| "*#@><^)}$!?~+%".contains(c));
        let key = content::normalize(trimmed);
        if key.is_empty() || key.contains(' ') && !key.contains('/') {
            return;
        }
        let path = if key.starts_with("sound/") {
            key.clone()
        } else {
            format!("sound/{key}")
        };
        if !self.add(&path, name) {
            self.missing.push(path);
        }
    }
}

/// Every file the map needs, with where it comes from.
pub fn analyze(state: &AppState, req: &PackRequest) -> PackReport {
    let mut w = Walk {
        state,
        files: BTreeMap::new(),
        missing: Vec::new(),
        seen_materials: HashSet::new(),
    };
    for m in &req.materials {
        if !m.trim().is_empty() {
            w.material(m, m);
        }
    }
    for m in &req.models {
        if !m.trim().is_empty() {
            w.model(m);
        }
    }
    for s in &req.sounds {
        if !s.trim().is_empty() {
            w.sound(s);
        }
    }
    if let Some(sky) = req.skyname.as_deref().filter(|s| !s.trim().is_empty()) {
        for face in ["bk", "dn", "ft", "lf", "rt", "up"] {
            let name = format!("skybox/{sky}{face}");
            w.material(&name, &format!("skybox {sky}"));
        }
    }
    w.missing.sort();
    w.missing.dedup();
    let files: Vec<PackFile> = w.files.into_values().collect();
    let custom_bytes = files.iter().filter(|f| f.custom).map(|f| f.size).sum();
    PackReport {
        files,
        missing: w.missing,
        custom_bytes,
    }
}

/// Writes `files` (VFS paths) into `bsp` with bspzip, replacing the BSP;
/// with `install` the result is copied into `garrysmod/maps` too.
pub fn pack(
    state: &AppState,
    install: &GameInstall,
    bsp: &str,
    files: &[String],
    install_copy: bool,
) -> Result<PackResult, String> {
    let bsp_path = PathBuf::from(bsp);
    if !bsp_path.is_file() {
        return Err(format!("{bsp}: BSP не найден, сначала соберите карту"));
    }
    let bspzip = install.bin_dir.join("bspzip.exe");
    if !bspzip.is_file() {
        return Err(format!("{} не найден", bspzip.display()));
    }
    let stem = bsp_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "map".into());
    let stage = std::env::temp_dir().join("gme-pack").join(&stem);
    let _ = std::fs::remove_dir_all(&stage);
    std::fs::create_dir_all(&stage).map_err(|e| format!("{}: {e}", stage.display()))?;
    let mut list = String::new();
    let mut log = Vec::new();
    let mut bytes = 0u64;
    let mut packed = 0usize;
    for path in files {
        let key = content::normalize(path);
        let Some(data) = state.read(&key) else {
            log.push(format!("нет файла: {key}"));
            continue;
        };
        let out = stage.join(key.replace('/', std::path::MAIN_SEPARATOR_STR));
        if let Some(dir) = out.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
        }
        std::fs::write(&out, &data).map_err(|e| format!("{}: {e}", out.display()))?;
        bytes += data.len() as u64;
        packed += 1;
        list.push_str(&key);
        list.push('\n');
        list.push_str(&out.display().to_string());
        list.push('\n');
    }
    if packed == 0 {
        return Err("нет файлов для упаковки".to_string());
    }
    let list_path = stage.join("packlist.txt");
    std::fs::write(&list_path, list).map_err(|e| format!("{}: {e}", list_path.display()))?;
    let out_bsp = bsp_path.with_extension("packed.bsp");
    let output = Command::new(&bspzip)
        .current_dir(&install.bin_dir)
        .arg("-addlist")
        .arg(&bsp_path)
        .arg(&list_path)
        .arg(&out_bsp)
        .output()
        .map_err(|e| format!("bspzip: {e}"))?;
    for line in String::from_utf8_lossy(&output.stdout)
        .lines()
        .chain(String::from_utf8_lossy(&output.stderr).lines())
    {
        if !line.trim().is_empty() {
            log.push(line.to_string());
        }
    }
    if !output.status.success() || !out_bsp.is_file() {
        return Err(format!(
            "bspzip завершился с кодом {}: {}",
            output.status.code().unwrap_or(-1),
            log.join(" | ")
        ));
    }
    std::fs::rename(&out_bsp, &bsp_path).map_err(|e| format!("{}: {e}", bsp_path.display()))?;
    let mut installed = None;
    if install_copy {
        let target = install.game_dir.join("maps").join(format!("{stem}.bsp"));
        std::fs::copy(&bsp_path, &target).map_err(|e| format!("{}: {e}", target.display()))?;
        installed = Some(target.display().to_string());
    }
    let _ = std::fs::remove_dir_all(&stage);
    Ok(PackResult {
        packed,
        bytes,
        output: bsp_path.display().to_string(),
        installed,
        log,
    })
}

#[cfg(test)]
mod tests {
    use super::is_stock;
    use content::MountKind;

    #[test]
    fn stock_content_is_what_ships_in_vpks_and_engine_dirs() {
        assert!(is_stock("hl2_textures", MountKind::Vpk));
        assert!(is_stock("garrysmod", MountKind::Vpk));
        assert!(is_stock("sourceengine", MountKind::Dir));
        assert!(!is_stock("garrysmod", MountKind::Dir));
        assert!(!is_stock("project", MountKind::Dir));
        assert!(!is_stock("addon:my_addon", MountKind::Gma));
        assert!(!is_stock("workshop:123", MountKind::Gma));
    }
}
