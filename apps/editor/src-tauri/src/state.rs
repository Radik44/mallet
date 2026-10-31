//! Game content shared between commands and the asset protocol.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Instant;

use content::{search_paths, GameInstall, Mount, MountKind, SearchPathOptions, Vfs};
use serde::Serialize;
use tauri::Emitter;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContentStatus {
    /// `loading`, `ready`, `missing` (no installation) or `error`.
    pub state: String,
    pub root: Option<String>,
    pub mounts: usize,
    pub failed: usize,
    pub files: usize,
    pub ms: u128,
    pub message: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MaterialInfo {
    pub name: String,
    pub found: bool,
    pub shader: String,
    pub base_texture: Option<String>,
    /// `$basetexture2` of WorldVertexTransition materials.
    pub base_texture2: Option<String>,
    pub width: u32,
    pub height: u32,
    pub translucent: bool,
    pub alpha_test: bool,
    pub additive: bool,
    pub no_cull: bool,
    pub tool: bool,
    pub color: [f32; 3],
    pub source: Option<String>,
}

/// What the viewport needs to draw and describe an entity class.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClassInfo {
    pub classname: String,
    pub found: bool,
    pub point: bool,
    pub color: [u8; 3],
    pub mins: [f64; 3],
    pub maxs: [f64; 3],
    pub description: String,
    pub model: Option<String>,
    pub icon: Option<String>,
}

/// Full FGD description of a class for the properties panel.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClassDef {
    pub classname: String,
    pub found: bool,
    pub description: String,
    pub keys: Vec<KeyDef>,
    pub inputs: Vec<IoDef>,
    pub outputs: Vec<IoDef>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct KeyDef {
    pub name: String,
    pub ty: String,
    pub display: String,
    pub default: Option<String>,
    pub help: String,
    pub readonly: bool,
    pub choices: Vec<(String, String)>,
    /// `(bit, display, default on)`.
    pub flags: Vec<(u32, String, bool)>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct IoDef {
    pub name: String,
    pub ty: String,
    pub help: String,
}

/// A placeable entity class for the entity tool's list.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClassEntry {
    pub classname: String,
    pub point: bool,
    pub description: String,
}

type ModelCache = HashMap<(String, u32, u32), Arc<Vec<u8>>>;

struct Inner {
    game: RwLock<Option<Arc<Vfs>>>,
    project: RwLock<Option<Arc<Vfs>>>,
    fgd: RwLock<Option<Arc<fgd::Fgd>>>,
    status: Mutex<ContentStatus>,
    /// Sorted material names across all layers, built on first use.
    materials: RwLock<Option<Arc<Vec<String>>>>,
    /// Sorted model names (`models/.../x.mdl`), built on first use.
    models: RwLock<Option<Arc<Vec<String>>>>,
    sounds: RwLock<Option<Arc<Vec<String>>>>,
    /// Assembled model containers by (name, skin).
    model_cache: Mutex<ModelCache>,
    /// Shader of each material, lower-case, filled on demand by the shader filter.
    shaders: Mutex<HashMap<String, String>>,
    /// Whether a material resolves to a base texture, by name (the browser hides the rest by default).
    textured: Mutex<HashMap<String, bool>>,
}

/// Cheap to clone; the background mounting thread holds its own handle.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<Inner>,
}

impl AppState {
    pub fn new() -> AppState {
        AppState {
            inner: Arc::new(Inner {
                game: RwLock::new(None),
                project: RwLock::new(None),
                fgd: RwLock::new(None),
                status: Mutex::new(ContentStatus {
                    state: "loading".into(),
                    root: None,
                    mounts: 0,
                    failed: 0,
                    files: 0,
                    ms: 0,
                    message: None,
                }),
                materials: RwLock::new(None),
                models: RwLock::new(None),
                sounds: RwLock::new(None),
                model_cache: Mutex::new(HashMap::new()),
                shaders: Mutex::new(HashMap::new()),
                textured: Mutex::new(HashMap::new()),
            }),
        }
    }

    /// Every material name (`dev/dev_measuregeneric01b` style, without
    /// `materials/` or `.vmt`) visible through the project and the game.
    pub fn material_names(&self) -> Arc<Vec<String>> {
        if let Some(list) = self.inner.materials.read().expect("materials").as_ref() {
            return list.clone();
        }
        let mut set = std::collections::BTreeSet::new();
        for layer in self.layers() {
            for p in layer.paths_with_ext("vmt") {
                if let Some(rest) = p.strip_prefix("materials/") {
                    set.insert(rest[..rest.len() - 4].to_string());
                }
            }
        }
        let list = Arc::new(set.into_iter().collect::<Vec<_>>());
        *self.inner.materials.write().expect("materials") = Some(list.clone());
        list
    }

    /// The material's shader (`lightmappedgeneric`, …), cached; "" when it cannot be read.
    pub fn material_shader(&self, name: &str) -> String {
        if let Some(s) = self.inner.shaders.lock().expect("shaders").get(name) {
            return s.clone();
        }
        let shader = self
            .material(name)
            .map(|(m, _)| m.shader.to_ascii_lowercase())
            .unwrap_or_default();
        self.inner
            .shaders
            .lock()
            .expect("shaders")
            .insert(name.to_string(), shader.clone());
        shader
    }

    /// True when the material's VMT parses and its `$basetexture` exists, i.e. it has a picture to show.
    pub fn material_textured(&self, name: &str) -> bool {
        if let Some(t) = self.inner.textured.lock().expect("textured").get(name) {
            return *t;
        }
        let textured = self
            .material(name)
            .and_then(|(m, _)| m.base_texture())
            .map(|tex| self.texture(&tex).is_some())
            .unwrap_or(false);
        self.inner
            .textured
            .lock()
            .expect("textured")
            .insert(name.to_string(), textured);
        textured
    }

    fn invalidate_materials(&self) {
        self.inner.shaders.lock().expect("shaders").clear();
        self.inner.textured.lock().expect("textured").clear();
        *self.inner.models.write().expect("models") = None;
        self.inner.model_cache.lock().expect("models").clear();
        *self.inner.materials.write().expect("materials") = None;
    }

    /// Placeable classes from the FGD, sorted by name.
    pub fn class_list(&self) -> Vec<ClassEntry> {
        let fgd = self.inner.fgd.read().expect("fgd");
        let Some(f) = fgd.as_ref() else {
            return Vec::new();
        };
        let mut out: Vec<ClassEntry> = f
            .entity_classes()
            .map(|c| ClassEntry {
                classname: c.name.clone(),
                point: c.kind.is_point(),
                description: c.description.clone(),
            })
            .collect();
        out.sort_by(|a, b| a.classname.cmp(&b.classname));
        out
    }

    pub fn class_def(&self, classname: &str) -> ClassDef {
        let fgd = self.inner.fgd.read().expect("fgd");
        let Some(r) = fgd.as_ref().and_then(|f| f.resolve(classname)) else {
            return ClassDef {
                classname: classname.to_string(),
                found: false,
                description: String::new(),
                keys: Vec::new(),
                inputs: Vec::new(),
                outputs: Vec::new(),
            };
        };
        let io = |v: &[fgd::Io]| {
            v.iter()
                .map(|i| IoDef {
                    name: i.name.clone(),
                    ty: i.ty.clone(),
                    help: i.help.clone(),
                })
                .collect()
        };
        ClassDef {
            classname: r.name.clone(),
            found: true,
            description: r.description.clone(),
            keys: r
                .keys
                .iter()
                .map(|k| KeyDef {
                    name: k.name.clone(),
                    ty: k.ty.clone(),
                    display: if k.display.is_empty() {
                        k.name.clone()
                    } else {
                        k.display.clone()
                    },
                    default: k.default.clone(),
                    help: k.help.clone(),
                    readonly: k.readonly,
                    choices: k
                        .choices
                        .iter()
                        .map(|c| (c.value.clone(), c.display.clone()))
                        .collect(),
                    flags: k
                        .flags
                        .iter()
                        .map(|f| (f.bit, f.display.clone(), f.default))
                        .collect(),
                })
                .collect(),
            inputs: io(&r.inputs),
            outputs: io(&r.outputs),
        }
    }

    /// Key-values Hammer writes for a freshly placed entity: every FGD key
    /// with a default (flags summed from their default bits), minus `origin`.
    pub fn class_defaults(&self, classname: &str) -> Vec<(String, String)> {
        let fgd = self.inner.fgd.read().expect("fgd");
        let Some(r) = fgd.as_ref().and_then(|f| f.resolve(classname)) else {
            return Vec::new();
        };
        r.keys
            .iter()
            .filter(|k| !k.name.eq_ignore_ascii_case("origin"))
            .filter_map(|k| {
                if k.ty == "flags" {
                    let bits: u32 = k.flags.iter().filter(|f| f.default).map(|f| f.bit).sum();
                    return Some((k.name.clone(), bits.to_string()));
                }
                let d = k.default.as_deref()?.trim();
                (!d.is_empty()).then(|| (k.name.clone(), d.to_string()))
            })
            .collect()
    }

    pub fn status(&self) -> ContentStatus {
        self.inner.status.lock().expect("status").clone()
    }

    fn set_status(&self, s: ContentStatus, app: &tauri::AppHandle) {
        *self.inner.status.lock().expect("status") = s.clone();
        let _ = app.emit("content-status", s);
    }

    /// Mounts the game in a background thread; the window stays responsive.
    pub fn start_loading(&self, app: tauri::AppHandle) {
        let me = self.clone();
        std::thread::spawn(move || me.load(app));
    }

    fn load(&self, app: tauri::AppHandle) {
        let started = Instant::now();
        let Some(install) = GameInstall::detect() else {
            self.set_status(
                ContentStatus {
                    state: "missing".into(),
                    root: None,
                    mounts: 0,
                    failed: 0,
                    files: 0,
                    ms: started.elapsed().as_millis(),
                    message: Some("Garry's Mod not found through Steam".into()),
                },
                &app,
            );
            return;
        };
        // Entity definitions: garrysmod.fgd pulls in base.fgd and halflife2.fgd.
        if let Some(main) = install.fgd_files().first() {
            match fgd::Fgd::load(main) {
                Ok(f) => {
                    for w in &f.warnings {
                        println!("[fgd] {w}");
                    }
                    println!("[fgd] {} classes from {}", f.classes.len(), main.display());
                    *self.inner.fgd.write().expect("fgd") = Some(Arc::new(f));
                }
                Err(e) => println!("[fgd] cannot load {}: {e}", main.display()),
            }
        }

        let cache = std::env::var_os("LOCALAPPDATA").map(|l| {
            PathBuf::from(l)
                .join("mallet")
                .join("cache")
                .join("workshop")
        });
        let mounts = search_paths(&install, &SearchPathOptions::default());
        let mut vfs = Vfs::new(cache);
        vfs.mount_all(&mounts, |_| {});
        let failed = vfs.mounts().iter().filter(|m| m.error.is_some()).count();
        for m in vfs.mounts().iter().filter(|m| m.error.is_some()) {
            println!(
                "[content] failed {}: {}",
                m.label,
                m.error.as_deref().unwrap_or("")
            );
        }
        let status = ContentStatus {
            state: "ready".into(),
            root: Some(install.root.display().to_string()),
            mounts: vfs.mounts().len(),
            failed,
            files: vfs.len(),
            ms: started.elapsed().as_millis(),
            message: None,
        };
        println!(
            "[content] {} mounts, {} files in {} ms",
            status.mounts, status.files, status.ms
        );
        *self.inner.game.write().expect("game") = Some(Arc::new(vfs));
        self.invalidate_materials();
        self.set_status(status, &app);
    }

    pub fn set_project(&self, root: PathBuf) -> usize {
        let mut vfs = Vfs::new(None);
        vfs.mount(&Mount {
            kind: MountKind::Dir,
            path: root,
            label: "project".into(),
        });
        let n = vfs.len();
        *self.inner.project.write().expect("project") = Some(Arc::new(vfs));
        self.invalidate_materials();
        n
    }

    pub fn clear_project(&self) {
        *self.inner.project.write().expect("project") = None;
        self.invalidate_materials();
    }

    /// Project first, then the game.
    fn layers(&self) -> Vec<Arc<Vfs>> {
        let mut v = Vec::new();
        if let Some(p) = self.inner.project.read().expect("project").as_ref() {
            v.push(p.clone());
        }
        if let Some(g) = self.inner.game.read().expect("game").as_ref() {
            v.push(g.clone());
        }
        v
    }

    pub fn material(&self, name: &str) -> Option<(vmt::Material, String)> {
        for layer in self.layers() {
            if let Ok(m) = layer.material(name) {
                let src = layer
                    .source_of(&content::vfs_material_path(name))
                    .unwrap_or("?")
                    .to_string();
                return Some((m, src));
            }
        }
        None
    }

    pub fn texture(&self, name: &str) -> Option<vtf::Vtf> {
        self.layers().into_iter().find_map(|l| l.texture(name).ok())
    }

    /// The mount that provides a VFS path (project first), with the size.
    pub fn locate(&self, path: &str) -> Option<(content::MountInfo, u64)> {
        self.layers()
            .into_iter()
            .find_map(|l| l.mount_of(path).map(|(m, size)| (m.clone(), size)))
    }

    /// Whether the game itself ships `path` (so it needs no packing).
    pub fn has_stock(&self, path: &str) -> bool {
        self.layers().iter().any(|l| l.has_stock_copy(path))
    }

    /// Whether a VFS path exists in the project or the game.
    pub fn exists(&self, path: &str) -> bool {
        self.layers().iter().any(|l| l.exists(path))
    }

    /// Raw file from the project or the game, by VFS path.
    pub fn read(&self, path: &str) -> Option<Vec<u8>> {
        self.layers().into_iter().find_map(|l| l.read(path))
    }

    /// Every `.mdl` visible through the project and the game, sorted.
    pub fn model_names(&self) -> Arc<Vec<String>> {
        if let Some(list) = self.inner.models.read().expect("models").as_ref() {
            return list.clone();
        }
        let mut names: Vec<String> = Vec::new();
        for layer in self.layers() {
            names.extend(layer.paths_with_ext("mdl").map(|p| p.to_string()));
        }
        names.sort_unstable();
        names.dedup();
        let list = Arc::new(names);
        *self.inner.models.write().expect("models") = Some(list.clone());
        list
    }

    /// Every sound file (`sound/*.wav|mp3|ogg`) visible through the project and the game, sorted.
    pub fn sound_names(&self) -> Arc<Vec<String>> {
        if let Some(list) = self.inner.sounds.read().expect("sounds").as_ref() {
            return list.clone();
        }
        let mut names: Vec<String> = Vec::new();
        for layer in self.layers() {
            for ext in ["wav", "mp3", "ogg"] {
                names.extend(
                    layer
                        .paths_with_ext(ext)
                        .filter(|p| p.starts_with("sound/"))
                        .map(|p| p.to_string()),
                );
            }
        }
        names.sort_unstable();
        names.dedup();
        let list = Arc::new(names);
        *self.inner.sounds.write().expect("sounds") = Some(list.clone());
        list
    }

    /// Forgets the cached sound list (a sound was written into the project).
    pub fn forget_sounds(&self) {
        *self.inner.sounds.write().expect("sounds") = None;
    }

    /// A model assembled for the viewport as a `GMDL` container (see
    /// `assets.rs`), cached per name and skin. `None` when any of the three
    /// files is missing or malformed.
    /// The assembled model as a `GMDL` container; `body` is the entity's
    /// `body` key, Source's packed body group selection.
    pub fn model_container(&self, name: &str, skin: u32, body: u32) -> Option<Arc<Vec<u8>>> {
        let key = (name.to_ascii_lowercase().replace('\\', "/"), skin, body);
        if let Some(c) = self.inner.model_cache.lock().expect("models").get(&key) {
            return Some(c.clone());
        }
        let base = key.0.trim_end_matches(".mdl").to_string();
        let mdl_bytes = self.read(&format!("{base}.mdl"))?;
        let m = match mdl::Mdl::parse(&mdl_bytes) {
            Ok(m) => m,
            Err(e) => {
                println!("[mdl] {name}: {e}");
                return None;
            }
        };
        let vvd = mdl::Vvd::parse(&self.read(&format!("{base}.vvd"))?).ok()?;
        let vtx = mdl::Vtx::parse(&self.read(&format!("{base}.dx90.vtx"))?, m.version).ok()?;
        let groups = bodygroups(m.body_parts.iter().map(|p| (p.base, p.models.len())), body);
        let draw = match mdl::assemble(&m, &vvd, &vtx, skin as usize, &groups) {
            Ok(d) => d,
            Err(e) => {
                println!("[mdl] {name}: {e}");
                return None;
            }
        };
        let mut out = Vec::new();
        out.extend_from_slice(b"GMDL");
        out.extend_from_slice(&1u32.to_le_bytes());
        for v in draw.mins.iter().chain(draw.maxs.iter()) {
            out.extend_from_slice(&v.to_le_bytes());
        }
        out.extend_from_slice(&(draw.meshes.len() as u32).to_le_bytes());
        for mesh in &draw.meshes {
            // The first $cdmaterials directory holding the VMT wins, else the first.
            let candidates = m.material_candidates(mesh.texture);
            let material = candidates
                .iter()
                .find(|c| self.material(c).is_some())
                .or(candidates.first())
                .cloned()
                .unwrap_or_default()
                .to_ascii_lowercase();
            let bytes = material.as_bytes();
            out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
            out.extend_from_slice(bytes);
            while out.len() % 4 != 0 {
                out.push(0);
            }
            out.extend_from_slice(&((mesh.positions.len() / 3) as u32).to_le_bytes());
            out.extend_from_slice(&(mesh.indices.len() as u32).to_le_bytes());
            for v in mesh
                .positions
                .iter()
                .chain(mesh.normals.iter())
                .chain(mesh.uvs.iter())
            {
                out.extend_from_slice(&v.to_le_bytes());
            }
            for i in &mesh.indices {
                out.extend_from_slice(&i.to_le_bytes());
            }
        }
        let container = Arc::new(out);
        self.inner
            .model_cache
            .lock()
            .expect("models")
            .insert(key, container.clone());
        Some(container)
    }

    pub fn class_info(&self, classname: &str) -> ClassInfo {
        let resolved = self
            .inner
            .fgd
            .read()
            .expect("fgd")
            .as_ref()
            .and_then(|f| f.resolve(classname));
        match resolved {
            Some(r) => ClassInfo {
                classname: classname.to_string(),
                found: true,
                point: r.kind.is_point(),
                color: r.color,
                mins: r.mins,
                maxs: r.maxs,
                description: r.description,
                model: r.model,
                icon: r.icon,
            },
            None => ClassInfo {
                classname: classname.to_string(),
                found: false,
                point: true,
                color: fgd::DEFAULT_COLOR,
                mins: fgd::DEFAULT_MINS,
                maxs: fgd::DEFAULT_MAXS,
                description: String::new(),
                model: None,
                icon: None,
            },
        }
    }

    pub fn material_info(&self, name: &str) -> MaterialInfo {
        let mut info = MaterialInfo {
            name: name.to_string(),
            found: false,
            shader: String::new(),
            base_texture: None,
            base_texture2: None,
            width: 0,
            height: 0,
            translucent: false,
            alpha_test: false,
            additive: false,
            no_cull: false,
            tool: false,
            color: [1.0, 1.0, 1.0],
            source: None,
        };
        let Some((m, source)) = self.material(name) else {
            return info;
        };
        info.found = true;
        info.shader = m.shader.clone();
        info.source = Some(source);
        info.translucent = m.translucent();
        info.alpha_test = m.alpha_test();
        info.additive = m.additive();
        info.no_cull = m.no_cull();
        info.tool = m.is_tool_texture();
        if let Some(c) = m.color() {
            info.color = [c[0] as f32, c[1] as f32, c[2] as f32];
        }
        info.base_texture2 = m.base_texture2().filter(|t| self.texture(t).is_some());
        if let Some(tex) = m.base_texture() {
            if let Some(v) = self.texture(&tex) {
                info.width = v.width;
                info.height = v.height;
                info.base_texture = Some(tex);
            }
        }
        info
    }
}

/// Each body part's variant from the packed `body` value: Source stores
/// `sum(variant_i * base_i)`, where `base_i` is the product of the earlier
/// parts' variant counts (the `base` field of the body part). `parts` are
/// `(base, variant count)` in body part order.
fn bodygroups(parts: impl Iterator<Item = (i32, usize)>, body: u32) -> Vec<usize> {
    parts
        .map(|(base, count)| {
            let n = count.max(1) as u32;
            let base = base.max(1) as u32;
            ((body / base) % n) as usize
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::bodygroups;

    #[test]
    fn body_value_selects_each_part_variant() {
        // missile_defense: studio×1, hull×2 (base 1), gun1×2 (base 2), gun2×2 (base 4), cap×2 (base 8)
        let parts = [(1, 1), (1, 2), (2, 2), (4, 2), (8, 2)];
        assert_eq!(bodygroups(parts.iter().copied(), 0), vec![0, 0, 0, 0, 0]);
        assert_eq!(bodygroups(parts.iter().copied(), 1), vec![0, 1, 0, 0, 0]);
        assert_eq!(bodygroups(parts.iter().copied(), 6), vec![0, 0, 1, 1, 0]);
        assert_eq!(bodygroups(parts.iter().copied(), 15), vec![0, 1, 1, 1, 1]);
        // tv_monitor01_screen: screen×3 (base 1): body 2 is the third screen, 5 wraps.
        assert_eq!(bodygroups([(1, 3)].into_iter(), 2), vec![2]);
        assert_eq!(bodygroups([(1, 3)].into_iter(), 5), vec![2]);
        // dod_american: body×6 (base 1), helmet×2 (base 6).
        assert_eq!(bodygroups([(1, 6), (6, 2)].into_iter(), 9), vec![3, 1]);
    }
}
