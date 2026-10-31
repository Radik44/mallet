use std::path::{Path, PathBuf};

use kv::NodeList;

use crate::GameInstall;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MountKind {
    /// Loose files under a directory.
    Dir,
    /// A `_dir.vpk` (or single-file) archive.
    Vpk,
    /// A `.gma` addon, possibly LZMA-compressed.
    Gma,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mount {
    pub kind: MountKind,
    pub path: PathBuf,
    /// Short human-readable origin, e.g. `addon:my_addon`, `workshop:123`, `hl2_textures`.
    pub label: String,
}

impl Mount {
    fn dir(path: PathBuf, label: impl Into<String>) -> Mount {
        Mount {
            kind: MountKind::Dir,
            path,
            label: label.into(),
        }
    }

    fn vpk(path: PathBuf) -> Mount {
        let label = path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| {
                n.trim_end_matches(".vpk")
                    .trim_end_matches("_dir")
                    .to_string()
            })
            .unwrap_or_default();
        Mount {
            kind: MountKind::Vpk,
            path,
            label,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SearchPathOptions {
    /// Skip the Workshop download folder (hundreds of archives).
    pub skip_workshop: bool,
    /// Skip `garrysmod/addons`.
    pub skip_addons: bool,
    /// Skip the games listed in `cfg/mount.cfg`.
    pub skip_mount_cfg: bool,
}

/// The ordered mount list for an installation. Earlier entries win when the
/// same path exists in several places, matching how the game layers content:
/// addons and Workshop first, then the game's own files and archives, then
/// mounted games, then the engine's base content.
pub fn search_paths(install: &GameInstall, options: &SearchPathOptions) -> Vec<Mount> {
    let mut mounts: Vec<Mount> = Vec::new();
    let mut push = |m: Mount| {
        if !mounts.iter().any(|x| x.path == m.path) {
            mounts.push(m);
        }
    };

    // 1. Addons: folders and .gma files in garrysmod/addons.
    if !options.skip_addons {
        for entry in read_dir_sorted(&install.game_dir.join("addons")) {
            let name = entry
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();
            if entry.is_dir() {
                push(Mount::dir(entry, format!("addon:{name}")));
            } else if has_ext(&entry, "gma") {
                push(Mount {
                    kind: MountKind::Gma,
                    path: entry,
                    label: format!("addon:{name}"),
                });
            }
        }
    }

    // 2. Workshop downloads: <id>/<something>.gma or <something>.bin (LZMA).
    if !options.skip_workshop {
        if let Some(ws) = &install.workshop_dir {
            for item in read_dir_sorted(ws) {
                if !item.is_dir() {
                    continue;
                }
                let id = item
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("")
                    .to_string();
                for file in read_dir_sorted(&item) {
                    if file.is_file() && (has_ext(&file, "gma") || has_ext(&file, "bin")) {
                        push(Mount {
                            kind: MountKind::Gma,
                            path: file,
                            label: format!("workshop:{id}"),
                        });
                    }
                }
            }
        }
    }

    // 3. gameinfo.txt search paths, in file order, with GMod's extras.
    let gameinfo = std::fs::read_to_string(install.gameinfo_path()).unwrap_or_default();
    for m in gameinfo_mounts(&install.root, &install.game_dir, &gameinfo) {
        push(m);
    }
    // The game mounts these itself rather than through gameinfo.
    push_vpk_if_exists(&mut push, install.game_dir.join("garrysmod_dir.vpk"));
    push_vpk_if_exists(&mut push, install.game_dir.join("fallbacks_dir.vpk"));

    // 4. Mounted Steam games (cfg/mountdepots.txt): content delivered into sourceengine/.
    let depots = std::fs::read_to_string(install.game_dir.join("cfg").join("mountdepots.txt"))
        .unwrap_or_default();
    for game in enabled_depots(&depots) {
        push_vpk_if_exists(
            &mut push,
            install
                .root
                .join("sourceengine")
                .join(format!("content_{game}_dir.vpk")),
        );
    }

    // 5. cfg/mount.cfg: other games' folders on disk.
    if !options.skip_mount_cfg {
        let cfg = std::fs::read_to_string(install.game_dir.join("cfg").join("mount.cfg"))
            .unwrap_or_default();
        for (game, dir) in mount_cfg_entries(&cfg) {
            let dir = PathBuf::from(dir);
            if !dir.is_dir() {
                continue;
            }
            for vpk in read_dir_sorted(&dir) {
                if vpk
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.ends_with("_dir.vpk"))
                {
                    push(Mount::vpk(vpk));
                }
            }
            push(Mount::dir(dir, format!("mount:{game}")));
        }
    }

    mounts
}

/// Expands the `SearchPaths` block of a gameinfo.txt into mounts.
///
/// `|all_source_engine_paths|` and a bare relative path resolve against the
/// game root, `|gameinfo_path|` against the game directory. A `.vpk` entry
/// means `name_dir.vpk`; a trailing `/*` means every subdirectory.
pub fn gameinfo_mounts(root: &Path, game_dir: &Path, gameinfo: &str) -> Vec<Mount> {
    let mut out = Vec::new();
    let Ok(doc) = kv::Document::parse(gameinfo) else {
        return out;
    };
    let Some(paths) = doc
        .block("GameInfo")
        .and_then(|g| g.block("FileSystem"))
        .and_then(|f| f.block("SearchPaths"))
    else {
        return out;
    };

    for pair in paths.pairs() {
        let kinds = pair.key.text().to_ascii_lowercase();
        // Only paths the game reads content from; write paths and binaries are not content.
        if !kinds
            .split('+')
            .any(|k| matches!(k, "game" | "mod" | "platform" | "download"))
        {
            continue;
        }
        let raw = pair.value.text().trim().replace('\\', "/");
        let (base, rest) = if let Some(r) = raw.strip_prefix("|gameinfo_path|") {
            (game_dir.to_path_buf(), r.to_string())
        } else if let Some(r) = raw.strip_prefix("|all_source_engine_paths|") {
            (root.to_path_buf(), r.to_string())
        } else {
            (root.to_path_buf(), raw.clone())
        };
        let rest = rest.trim_start_matches('/');

        if let Some(dir) = rest.strip_suffix("/*").or_else(|| rest.strip_suffix("*")) {
            let dir = base.join(dir.trim_end_matches('/'));
            for sub in read_dir_sorted(&dir) {
                if sub.is_dir() {
                    let name = sub
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("")
                        .to_string();
                    out.push(Mount::dir(sub, format!("addon:{name}")));
                }
            }
            continue;
        }

        let path = if rest == "." || rest.is_empty() {
            base.clone()
        } else {
            base.join(rest)
        };

        if rest.to_ascii_lowercase().ends_with(".vpk") {
            let dir_vpk = PathBuf::from(format!(
                "{}_dir.vpk",
                path.display().to_string().trim_end_matches(".vpk")
            ));
            if dir_vpk.is_file() {
                out.push(Mount::vpk(dir_vpk));
            } else if path.is_file() {
                out.push(Mount::vpk(path));
            }
        } else if path.is_dir() {
            let label = path
                .strip_prefix(root)
                .ok()
                .map(|p| p.display().to_string().replace('\\', "/"))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "root".to_string());
            out.push(Mount::dir(path, label));
        }
    }
    out
}

/// Games enabled in `cfg/mountdepots.txt` (`"gamedepotsystem" { "cstrike" "1" }`).
pub fn enabled_depots(text: &str) -> Vec<String> {
    let Ok(doc) = kv::Document::parse(text) else {
        return Vec::new();
    };
    doc.block("gamedepotsystem")
        .map(|b| {
            b.pairs()
                .filter(|p| p.value.text().trim() != "0")
                .map(|p| p.key.text().to_ascii_lowercase())
                .collect()
        })
        .unwrap_or_default()
}

/// `(game, directory)` pairs from `cfg/mount.cfg`.
pub fn mount_cfg_entries(text: &str) -> Vec<(String, String)> {
    let Ok(doc) = kv::Document::parse(text) else {
        return Vec::new();
    };
    doc.block("mountcfg")
        .map(|b| {
            b.pairs()
                .map(|p| (p.key.text().to_string(), p.value.text().to_string()))
                .collect()
        })
        .unwrap_or_default()
}

fn push_vpk_if_exists(push: &mut impl FnMut(Mount), path: PathBuf) {
    if path.is_file() {
        push(Mount::vpk(path));
    }
}

fn has_ext(path: &Path, ext: &str) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case(ext))
}

fn read_dir_sorted(dir: &Path) -> Vec<PathBuf> {
    let mut v: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|rd| rd.filter_map(Result::ok).map(|e| e.path()).collect())
        .unwrap_or_default();
    v.sort();
    v
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depots_and_mount_cfg() {
        assert_eq!(
            enabled_depots("\"gamedepotsystem\"\n{\n\t\"hl2\"\t\"1\"\n\t\"cstrike\"\t\"0\"\n\t\"TF\"\t\"1\"\n}\n"),
            vec!["hl2", "tf"]
        );
        let cfg = "\"mountcfg\"\n{\n\t// \"cstrike\" \"C:\\x\"\n\t\"tf\"\t\"D:\\Steam\\tf\"\n}\n";
        assert_eq!(
            mount_cfg_entries(cfg),
            vec![("tf".to_string(), "D:\\Steam\\tf".to_string())]
        );
    }

    #[test]
    fn gameinfo_expansion() {
        let dir = std::env::temp_dir().join(format!("gi-test-{}", std::process::id()));
        let root = dir.join("GarrysMod");
        let game = root.join("garrysmod");
        std::fs::create_dir_all(game.join("addons").join("b_addon")).unwrap();
        std::fs::create_dir_all(game.join("addons").join("a_addon")).unwrap();
        std::fs::create_dir_all(root.join("sourceengine")).unwrap();
        std::fs::write(root.join("sourceengine").join("hl2_textures_dir.vpk"), b"").unwrap();
        std::fs::write(root.join("sourceengine").join("hl2_textures_000.vpk"), b"").unwrap();
        std::fs::create_dir_all(game.join("download")).unwrap();

        let gi = "\"GameInfo\"\n{\n\tFileSystem\n\t{\n\t\tSearchPaths\n\t\t{\n\t\t\tgame+mod\tgarrysmod/addons/*\n\t\t\tgame\t|all_source_engine_paths|sourceengine/hl2_textures.vpk\n\t\t\tgame\t|all_source_engine_paths|sourceengine/missing.vpk\n\t\t\tmod+mod_write\t|gameinfo_path|.\n\t\t\tgamebin\tgarrysmod/bin\n\t\t\tgame+download\tgarrysmod/download\n\t\t\tgame\tgarrysmod/nonexistent\n\t\t}\n\t}\n}\n";
        let mounts = gameinfo_mounts(&root, &game, gi);
        let labels: Vec<(MountKind, String)> =
            mounts.iter().map(|m| (m.kind, m.label.clone())).collect();
        assert_eq!(
            labels,
            vec![
                (MountKind::Dir, "addon:a_addon".to_string()),
                (MountKind::Dir, "addon:b_addon".to_string()),
                (MountKind::Vpk, "hl2_textures".to_string()),
                (MountKind::Dir, "garrysmod".to_string()),
                (MountKind::Dir, "garrysmod/download".to_string()),
            ]
        );
        assert_eq!(
            mounts[2].path,
            root.join("sourceengine").join("hl2_textures_dir.vpk")
        );
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
