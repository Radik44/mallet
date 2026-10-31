use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};
use std::time::Instant;

use crate::{Mount, MountKind};

/// Directories under a loose mount that hold content worth indexing. Walking
/// everything would pull in caches, saves, demos and screenshots.
const CONTENT_DIRS: &[&str] = &[
    "materials",
    "models",
    "sound",
    "maps",
    "scripts",
    "resource",
    "particles",
    "scenes",
    "shaders",
];

enum Source {
    Dir(PathBuf),
    Vpk(vpk::Vpk),
    Gma(gma::Gma),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MountInfo {
    pub label: String,
    pub kind: MountKind,
    pub path: PathBuf,
    pub files: usize,
    pub mount_ms: u128,
    /// Set when the mount failed; its files are not in the index.
    pub error: Option<String>,
}

#[derive(Clone, Copy)]
struct Loc {
    mount: u32,
    size: u64,
}

/// Layered, case-insensitive view over all mounted content.
pub struct Vfs {
    sources: Vec<Source>,
    info: Vec<MountInfo>,
    index: HashMap<String, Loc>,
    cache_dir: Option<PathBuf>,
}

impl fmt::Debug for Vfs {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Vfs")
            .field("mounts", &self.info.len())
            .field("files", &self.index.len())
            .finish()
    }
}

#[derive(Debug)]
pub enum MaterialError {
    NotFound(String),
    Vmt(String, vmt::Error),
    Vtf(String, vtf::Error),
    /// Patch chain deeper than the limit, or a patch including itself.
    PatchLoop(String),
}

impl fmt::Display for MaterialError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            MaterialError::NotFound(p) => write!(f, "{p} not found"),
            MaterialError::Vmt(p, e) => write!(f, "{p}: {e}"),
            MaterialError::Vtf(p, e) => write!(f, "{p}: {e}"),
            MaterialError::PatchLoop(p) => write!(f, "{p}: patch include chain too deep"),
        }
    }
}

impl std::error::Error for MaterialError {}

impl Vfs {
    /// An empty filesystem. `cache_dir` is where LZMA Workshop archives are
    /// extracted; without it compressed addons fail to mount.
    pub fn new(cache_dir: Option<PathBuf>) -> Vfs {
        Vfs {
            sources: Vec::new(),
            info: Vec::new(),
            index: HashMap::new(),
            cache_dir,
        }
    }

    /// Mounts in order; earlier mounts take priority over later ones.
    pub fn mount_all(&mut self, mounts: &[Mount], mut progress: impl FnMut(&MountInfo)) {
        for m in mounts {
            self.mount(m);
            progress(self.info.last().expect("just mounted"));
        }
    }

    /// Mounts one source at the lowest priority. Failures are recorded in
    /// [`Vfs::mounts`] rather than returned, so one broken addon does not stop
    /// the rest.
    pub fn mount(&mut self, m: &Mount) {
        let started = Instant::now();
        let mount_id = self.sources.len() as u32;
        let mut info = MountInfo {
            label: m.label.clone(),
            kind: m.kind,
            path: m.path.clone(),
            files: 0,
            mount_ms: 0,
            error: None,
        };

        let result: Result<(Source, Vec<(String, u64)>), String> = match m.kind {
            MountKind::Dir => Ok((Source::Dir(m.path.clone()), walk_dir(&m.path))),
            MountKind::Vpk => vpk::Vpk::open(&m.path).map_err(|e| e.to_string()).map(|v| {
                let files = v
                    .entries()
                    .map(|(p, e)| (p.to_string(), e.total_len() as u64))
                    .collect();
                (Source::Vpk(v), files)
            }),
            MountKind::Gma => self.open_gma(&m.path).map(|g| {
                let files = g.files.iter().map(|f| (f.path.clone(), f.size)).collect();
                (Source::Gma(g), files)
            }),
        };

        match result {
            Ok((source, files)) => {
                for (path, size) in files {
                    // First mount wins.
                    self.index.entry(path).or_insert(Loc {
                        mount: mount_id,
                        size,
                    });
                    info.files += 1;
                }
                self.sources.push(source);
            }
            Err(e) => {
                info.error = Some(e);
                // Keep indices aligned with `info`.
                self.sources.push(Source::Dir(PathBuf::new()));
            }
        }
        info.mount_ms = started.elapsed().as_millis();
        self.info.push(info);
    }

    fn open_gma(&self, path: &Path) -> Result<gma::Gma, String> {
        match gma::Gma::open(path) {
            Ok(g) => Ok(g),
            Err(gma::Error::Compressed) => {
                let cache = self
                    .cache_dir
                    .as_ref()
                    .ok_or_else(|| "compressed addon and no cache directory".to_string())?;
                std::fs::create_dir_all(cache).map_err(|e| e.to_string())?;
                let name = cache_name(path);
                let extracted = cache.join(format!("{name}.gma"));
                let stale = match (std::fs::metadata(path), std::fs::metadata(&extracted)) {
                    (Ok(src), Ok(dst)) => src.modified().ok() > dst.modified().ok(),
                    (_, Err(_)) => true,
                    _ => false,
                };
                if stale {
                    gma::Gma::decompress(path, &extracted).map_err(|e| e.to_string())?;
                }
                gma::Gma::open(&extracted).map_err(|e| e.to_string())
            }
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn mounts(&self) -> &[MountInfo] {
        &self.info
    }

    /// Number of distinct paths visible.
    pub fn len(&self) -> usize {
        self.index.len()
    }

    pub fn is_empty(&self) -> bool {
        self.index.is_empty()
    }

    pub fn exists(&self, path: &str) -> bool {
        self.index.contains_key(&normalize(path))
    }

    /// The mount that provides `path`, with the file's size.
    pub fn mount_of(&self, path: &str) -> Option<(&MountInfo, u64)> {
        let loc = self.index.get(&normalize(path))?;
        Some((&self.info[loc.mount as usize], loc.size))
    }

    /// Whether a mount that ships with the game (a VPK, or the engine's own
    /// directories) has `path`, even if an addon in front of it wins.
    pub fn has_stock_copy(&self, path: &str) -> bool {
        let key = normalize(path);
        self.sources
            .iter()
            .zip(&self.info)
            .any(|(src, info)| match src {
                Source::Vpk(v) => v.contains(&key),
                Source::Dir(root) => {
                    matches!(
                        info.label.as_str(),
                        "sourceengine" | "platform" | "fallbacks"
                    ) && root.join(&key).is_file()
                }
                Source::Gma(_) => false,
            })
    }

    /// Label of the mount that provides `path`.
    pub fn source_of(&self, path: &str) -> Option<&str> {
        self.index
            .get(&normalize(path))
            .map(|loc| self.info[loc.mount as usize].label.as_str())
    }

    pub fn size_of(&self, path: &str) -> Option<u64> {
        self.index.get(&normalize(path)).map(|l| l.size)
    }

    pub fn read(&self, path: &str) -> Option<Vec<u8>> {
        let key = normalize(path);
        let loc = self.index.get(&key)?;
        match &self.sources[loc.mount as usize] {
            Source::Dir(root) => std::fs::read(root.join(&key)).ok(),
            Source::Vpk(v) => v.read(&key).ok(),
            Source::Gma(g) => g.read(&key).ok(),
        }
    }

    /// All visible paths, unsorted.
    pub fn paths(&self) -> impl Iterator<Item = &str> {
        self.index.keys().map(String::as_str)
    }

    /// Paths with this extension (without dot), e.g. `vmt`, `mdl`.
    pub fn paths_with_ext<'a>(&'a self, ext: &'a str) -> impl Iterator<Item = &'a str> + 'a {
        let suffix = format!(".{}", ext.to_ascii_lowercase());
        self.index
            .keys()
            .filter(move |k| k.ends_with(&suffix))
            .map(String::as_str)
    }

    /// Paths under a directory prefix such as `materials/dev/`.
    pub fn paths_under<'a>(&'a self, prefix: &str) -> impl Iterator<Item = &'a str> + 'a {
        let prefix = normalize(prefix);
        let prefix = if prefix.is_empty() || prefix.ends_with('/') {
            prefix
        } else {
            format!("{prefix}/")
        };
        self.index
            .keys()
            .filter(move |k| k.starts_with(&prefix))
            .map(String::as_str)
    }

    /// Loads `materials/<name>.vmt`, following `patch` includes.
    pub fn material(&self, name: &str) -> Result<vmt::Material, MaterialError> {
        self.material_depth(name, 0)
    }

    fn material_depth(&self, name: &str, depth: u32) -> Result<vmt::Material, MaterialError> {
        if depth > 8 {
            return Err(MaterialError::PatchLoop(name.to_string()));
        }
        let path = material_path(name, "vmt");
        let bytes = self
            .read(&path)
            .ok_or_else(|| MaterialError::NotFound(path.clone()))?;
        let text = String::from_utf8_lossy(&bytes);
        let mat = vmt::Material::parse(&text).map_err(|e| MaterialError::Vmt(path.clone(), e))?;
        if let Some(include) = mat.include() {
            let base = self.material_depth(include, depth + 1)?;
            return Ok(mat.apply_patch(&base));
        }
        Ok(mat)
    }

    /// Loads `materials/<name>.vtf`.
    pub fn texture(&self, name: &str) -> Result<vtf::Vtf, MaterialError> {
        let path = material_path(name, "vtf");
        let bytes = self
            .read(&path)
            .ok_or_else(|| MaterialError::NotFound(path.clone()))?;
        vtf::Vtf::parse(bytes).map_err(|e| MaterialError::Vtf(path, e))
    }
}

/// `materials/<name>.<ext>` from a name that may already carry the prefix or extension.
pub fn material_path(name: &str, ext: &str) -> String {
    let mut n = normalize(name);
    if let Some(stripped) = n.strip_suffix(&format!(".{ext}")) {
        n = stripped.to_string();
    }
    if !n.starts_with("materials/") {
        n = format!("materials/{n}");
    }
    format!("{n}.{ext}")
}

/// Lowercase, forward slashes, no leading slash.
pub fn normalize(path: &str) -> String {
    let mut s = path.replace('\\', "/").to_ascii_lowercase();
    while s.starts_with('/') {
        s.remove(0);
    }
    while s.contains("//") {
        s = s.replace("//", "/");
    }
    s
}

fn cache_name(path: &Path) -> String {
    // Workshop files sit in a folder named after the item id; use it when
    // present so the cache name is stable and readable.
    let parent = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let file = path.file_stem().and_then(|n| n.to_str()).unwrap_or("addon");
    if parent.chars().all(|c| c.is_ascii_digit()) && !parent.is_empty() {
        format!("{parent}_{file}")
    } else {
        file.to_string()
    }
}

fn walk_dir(root: &Path) -> Vec<(String, u64)> {
    let mut out = Vec::new();
    for sub in CONTENT_DIRS {
        let dir = root.join(sub);
        if !dir.is_dir() {
            continue;
        }
        for entry in walkdir::WalkDir::new(&dir)
            .follow_links(false)
            .into_iter()
            .filter_map(Result::ok)
        {
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(rel) = entry.path().strip_prefix(root) else {
                continue;
            };
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push((normalize(&rel.to_string_lossy()), size));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn material_paths() {
        assert_eq!(
            material_path("dev/dev_measurewall01a", "vmt"),
            "materials/dev/dev_measurewall01a.vmt"
        );
        assert_eq!(
            material_path("MATERIALS\\Dev\\X.VMT", "vmt"),
            "materials/dev/x.vmt"
        );
        assert_eq!(
            material_path("/concrete/floor.vtf", "vtf"),
            "materials/concrete/floor.vtf"
        );
    }

    #[test]
    fn dirs_layer_with_first_mount_winning() {
        let dir = std::env::temp_dir().join(format!("vfs-test-{}", std::process::id()));
        let a = dir.join("a");
        let b = dir.join("b");
        std::fs::create_dir_all(a.join("materials").join("X")).unwrap();
        std::fs::create_dir_all(b.join("materials").join("x")).unwrap();
        std::fs::create_dir_all(b.join("cache")).unwrap();
        std::fs::write(a.join("materials").join("X").join("Shared.vmt"), "A").unwrap();
        std::fs::write(b.join("materials").join("x").join("shared.vmt"), "B").unwrap();
        std::fs::write(
            b.join("materials").join("x").join("only_b.vmt"),
            "LightmappedGeneric\n{\n\t\"$basetexture\" \"x/t\"\n}\n",
        )
        .unwrap();
        std::fs::write(b.join("cache").join("ignored.txt"), "no").unwrap();

        let mut vfs = Vfs::new(None);
        vfs.mount(&Mount {
            kind: MountKind::Dir,
            path: a.clone(),
            label: "a".into(),
        });
        vfs.mount(&Mount {
            kind: MountKind::Dir,
            path: b.clone(),
            label: "b".into(),
        });
        assert_eq!(vfs.len(), 2);
        assert_eq!(vfs.read("materials/x/shared.vmt").unwrap(), b"A");
        assert_eq!(vfs.source_of("MATERIALS/X/SHARED.VMT"), Some("a"));
        assert_eq!(
            vfs.read("materials/x/only_b.vmt").unwrap(),
            b"LightmappedGeneric\n{\n\t\"$basetexture\" \"x/t\"\n}\n"
        );
        assert!(!vfs.exists("cache/ignored.txt"));
        assert_eq!(vfs.paths_with_ext("vmt").count(), 2);
        assert_eq!(vfs.paths_under("materials/x").count(), 2);

        let m = vfs.material("x/only_b").unwrap();
        assert_eq!(m.base_texture().as_deref(), Some("x/t"));
        assert!(matches!(
            vfs.material("x/missing"),
            Err(MaterialError::NotFound(_))
        ));
        assert!(matches!(
            vfs.texture("x/t"),
            Err(MaterialError::NotFound(_))
        ));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn broken_mount_is_recorded_not_fatal() {
        let mut vfs = Vfs::new(None);
        vfs.mount(&Mount {
            kind: MountKind::Vpk,
            path: PathBuf::from("Z:/definitely/missing_dir.vpk"),
            label: "missing".into(),
        });
        assert_eq!(vfs.mounts().len(), 1);
        assert!(vfs.mounts()[0].error.is_some());
        assert!(vfs.is_empty());
    }
}
