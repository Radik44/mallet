use std::path::{Path, PathBuf};

use kv::NodeList;

/// Steam app id of Garry's Mod.
pub const GMOD_APP_ID: u32 = 4000;

/// Where Garry's Mod lives on this machine.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GameInstall {
    /// `.../steamapps/common/GarrysMod`
    pub root: PathBuf,
    /// `root/garrysmod`
    pub game_dir: PathBuf,
    /// `root/bin`: Hammer, vbsp, vvis, vrad, the FGDs.
    pub bin_dir: PathBuf,
    /// `.../steamapps/workshop/content/4000`, when present.
    pub workshop_dir: Option<PathBuf>,
}

impl GameInstall {
    /// Finds the game through Steam: registry on Windows, then every library
    /// folder listed in `libraryfolders.vdf`.
    pub fn detect() -> Option<GameInstall> {
        let steam = steam_root()?;
        for lib in library_folders(&steam) {
            let root = lib.join("steamapps").join("common").join("GarrysMod");
            if let Some(install) = GameInstall::at(&root) {
                return Some(install);
            }
        }
        None
    }

    /// Uses an explicit game root (`.../common/GarrysMod`). Returns `None`
    /// when it does not look like an installation.
    pub fn at(root: impl AsRef<Path>) -> Option<GameInstall> {
        let root = root.as_ref().to_path_buf();
        let game_dir = root.join("garrysmod");
        if !game_dir.join("gameinfo.txt").is_file() {
            return None;
        }
        let workshop_dir = root
            .parent()
            .and_then(Path::parent)
            .map(|steamapps| {
                steamapps
                    .join("workshop")
                    .join("content")
                    .join(GMOD_APP_ID.to_string())
            })
            .filter(|p| p.is_dir());
        Some(GameInstall {
            bin_dir: root.join("bin"),
            root,
            game_dir,
            workshop_dir,
        })
    }

    pub fn gameinfo_path(&self) -> PathBuf {
        self.game_dir.join("gameinfo.txt")
    }

    /// FGD files shipped with the game, GMod's own first.
    pub fn fgd_files(&self) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for name in ["garrysmod.fgd", "halflife2.fgd", "base.fgd"] {
            let p = self.bin_dir.join(name);
            if p.is_file() {
                out.push(p);
            }
        }
        out
    }
}

/// The Steam installation folder.
pub fn steam_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;
        if let Ok(key) = RegKey::predef(HKEY_CURRENT_USER).open_subkey("Software\\Valve\\Steam") {
            if let Ok(path) = key.get_value::<String, _>("SteamPath") {
                let p = PathBuf::from(path.replace('/', "\\"));
                if p.is_dir() {
                    return Some(p);
                }
            }
        }
        for candidate in [
            "C:\\Program Files (x86)\\Steam",
            "C:\\Program Files\\Steam",
            "D:\\Steam",
            "D:\\SteamLibrary",
        ] {
            let p = PathBuf::from(candidate);
            if p.join("steam.exe").is_file() {
                return Some(p);
            }
        }
        None
    }
    #[cfg(not(windows))]
    {
        let home = std::env::var_os("HOME").map(PathBuf::from)?;
        for rel in [
            ".steam/steam",
            ".local/share/Steam",
            ".var/app/com.valvesoftware.Steam/.local/share/Steam",
        ] {
            let p = home.join(rel);
            if p.is_dir() {
                return Some(p);
            }
        }
        None
    }
}

/// All Steam library roots, the main one first.
pub fn library_folders(steam: &Path) -> Vec<PathBuf> {
    let mut out = vec![steam.to_path_buf()];
    let vdf = steam.join("steamapps").join("libraryfolders.vdf");
    if let Ok(text) = std::fs::read_to_string(&vdf) {
        if let Ok(doc) = kv::Document::parse(&text) {
            if let Some(root) = doc.block("libraryfolders") {
                for lib in root.nodes().iter().filter_map(|n| n.as_block()) {
                    if let Some(path) = lib.value("path") {
                        let p = PathBuf::from(path.replace("\\\\", "\\"));
                        if p.is_dir() && !out.contains(&p) {
                            out.push(p);
                        }
                    }
                }
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn library_folders_parses_vdf() {
        let dir = std::env::temp_dir().join(format!("steam-test-{}", std::process::id()));
        let apps = dir.join("steamapps");
        std::fs::create_dir_all(&apps).unwrap();
        let other = dir.join("Other");
        std::fs::create_dir_all(&other).unwrap();
        let vdf = format!(
            "\"libraryfolders\"\n{{\n\t\"0\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n\t\"1\"\n\t{{\n\t\t\"path\"\t\t\"{}\"\n\t}}\n\t\"2\"\n\t{{\n\t\t\"path\"\t\t\"Z:\\\\nope\"\n\t}}\n}}\n",
            dir.display().to_string().replace('\\', "\\\\"),
            other.display().to_string().replace('\\', "\\\\"),
        );
        std::fs::write(apps.join("libraryfolders.vdf"), vdf).unwrap();
        let libs = library_folders(&dir);
        assert_eq!(libs, vec![dir.clone(), other]);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn at_requires_gameinfo() {
        let dir = std::env::temp_dir().join(format!("gmod-test-{}", std::process::id()));
        let root = dir.join("steamapps").join("common").join("GarrysMod");
        std::fs::create_dir_all(root.join("garrysmod")).unwrap();
        assert!(GameInstall::at(&root).is_none());
        std::fs::write(
            root.join("garrysmod").join("gameinfo.txt"),
            "\"GameInfo\"\n{\n}\n",
        )
        .unwrap();
        let g = GameInstall::at(&root).unwrap();
        assert_eq!(g.game_dir, root.join("garrysmod"));
        assert!(g.workshop_dir.is_none());
        std::fs::create_dir_all(
            dir.join("steamapps")
                .join("workshop")
                .join("content")
                .join("4000"),
        )
        .unwrap();
        assert!(GameInstall::at(&root).unwrap().workshop_dir.is_some());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
