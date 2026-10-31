//! Valve Material Type reader.
//!
//! A VMT is one KeyValues block whose key is the shader name and whose pairs
//! are shader parameters (`$basetexture`), compile flags (`%compilenodraw`)
//! and the like. Nested blocks are either `Proxies` or shader fallbacks
//! (`>=DX90`, `<DX90`, `dx8`, ...). A `Patch` material includes another VMT
//! and inserts or replaces parameters in it.
//!
//! Parameter keys are lowercased; the engine compares them case-insensitively.

#![forbid(unsafe_code)]

use std::collections::BTreeMap;
use std::fmt;

use kv::{Node, NodeList};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    Syntax(kv::Error),
    /// No top-level block.
    Empty,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Syntax(e) => write!(f, "syntax error: {e}"),
            Error::Empty => f.write_str("material has no shader block"),
        }
    }
}

impl std::error::Error for Error {}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Proxy {
    pub name: String,
    pub params: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Material {
    /// Shader name as written, e.g. `LightmappedGeneric`.
    pub shader: String,
    /// Parameters with lowercased keys, values as written.
    pub params: BTreeMap<String, String>,
    pub proxies: Vec<Proxy>,
    /// Fallback blocks such as `>=DX90`, kept as (name, params) and not applied.
    pub fallbacks: Vec<(String, BTreeMap<String, String>)>,
}

impl Material {
    pub fn parse(src: &str) -> Result<Material, Error> {
        let doc = kv::Document::parse(src).map_err(Error::Syntax)?;
        let block = doc
            .nodes()
            .iter()
            .find_map(|n| n.as_block())
            .ok_or(Error::Empty)?;
        Ok(Material::from_block(block))
    }

    pub fn from_block(block: &kv::Block) -> Material {
        let mut m = Material {
            shader: block.key.text().to_string(),
            ..Material::default()
        };
        for node in block.nodes() {
            match node {
                Node::Pair(p) => {
                    m.params.insert(
                        p.key.text().to_ascii_lowercase(),
                        p.value.text().to_string(),
                    );
                }
                Node::Block(b) => {
                    if b.key.text().eq_ignore_ascii_case("proxies") {
                        for pb in b.nodes().iter().filter_map(|n| n.as_block()) {
                            m.proxies.push(Proxy {
                                name: pb.key.text().to_string(),
                                params: pairs(pb),
                            });
                        }
                    } else if m.is_patch()
                        && (b.key.text().eq_ignore_ascii_case("insert")
                            || b.key.text().eq_ignore_ascii_case("replace"))
                    {
                        // Patch blocks are kept as fallbacks until resolved.
                        m.fallbacks
                            .push((b.key.text().to_ascii_lowercase(), pairs(b)));
                    } else {
                        m.fallbacks.push((b.key.text().to_string(), pairs(b)));
                    }
                }
            }
        }
        m
    }

    pub fn shader_is(&self, name: &str) -> bool {
        self.shader.eq_ignore_ascii_case(name)
    }

    pub fn is_patch(&self) -> bool {
        self.shader_is("patch")
    }

    /// For a `Patch` material, the VMT it modifies (`include`).
    pub fn include(&self) -> Option<&str> {
        if self.is_patch() {
            self.params.get("include").map(String::as_str)
        } else {
            None
        }
    }

    /// Applies this patch to its included material: `insert` adds keys that
    /// are missing, `replace` overrides unconditionally. Returns `base` with
    /// the changes and this material's proxies appended.
    pub fn apply_patch(&self, base: &Material) -> Material {
        let mut out = base.clone();
        for (kind, params) in &self.fallbacks {
            match kind.as_str() {
                "insert" => {
                    for (k, v) in params {
                        out.params.entry(k.clone()).or_insert_with(|| v.clone());
                    }
                }
                "replace" => {
                    for (k, v) in params {
                        out.params.insert(k.clone(), v.clone());
                    }
                }
                _ => {}
            }
        }
        out.proxies.extend(self.proxies.iter().cloned());
        out
    }

    pub fn get(&self, key: &str) -> Option<&str> {
        self.params
            .get(&key.to_ascii_lowercase())
            .map(String::as_str)
    }

    /// Numeric parameter; Source accepts `1`, `1.0`, `"1"`, and `[1 1 1]` vectors
    /// (the first component is returned).
    pub fn get_f64(&self, key: &str) -> Option<f64> {
        let v = self.get(key)?.trim().trim_start_matches(['[', '{']);
        v.split_whitespace().next()?.parse().ok()
    }

    pub fn flag(&self, key: &str) -> bool {
        self.get_f64(key).map(|v| v != 0.0).unwrap_or(false)
    }

    /// Texture path relative to `materials/`, forward slashes, lowercase, no extension.
    pub fn texture(&self, key: &str) -> Option<String> {
        let v = self.get(key)?.trim();
        if v.is_empty() {
            return None;
        }
        let v = v.replace('\\', "/").to_ascii_lowercase();
        let v = v.strip_suffix(".vtf").unwrap_or(&v).to_string();
        Some(v.trim_start_matches('/').to_string())
    }

    pub fn base_texture(&self) -> Option<String> {
        self.texture("$basetexture")
    }

    pub fn base_texture2(&self) -> Option<String> {
        self.texture("$basetexture2")
    }

    pub fn bump_map(&self) -> Option<String> {
        self.texture("$bumpmap")
    }

    pub fn translucent(&self) -> bool {
        self.flag("$translucent")
    }

    pub fn alpha_test(&self) -> bool {
        self.flag("$alphatest")
    }

    pub fn additive(&self) -> bool {
        self.flag("$additive")
    }

    pub fn no_cull(&self) -> bool {
        self.flag("$nocull")
    }

    pub fn surface_prop(&self) -> Option<&str> {
        self.get("$surfaceprop")
    }

    /// `%compile*` tool flags: nodraw, sky, hint, skip, clip, trigger, ...
    pub fn compile_flag(&self, name: &str) -> bool {
        self.flag(&format!("%compile{name}"))
    }

    /// Any `%compile*` flag set: a tool texture that is not meant to be visible.
    pub fn is_tool_texture(&self) -> bool {
        self.params
            .iter()
            .any(|(k, v)| k.starts_with("%compile") && v.trim() != "0")
    }

    /// `$color` or `$color2` as 0..1 RGB, if present.
    pub fn color(&self) -> Option<[f64; 3]> {
        let v = self.get("$color").or_else(|| self.get("$color2"))?;
        let v = v.trim();
        let inner = v
            .trim_start_matches(['[', '{'])
            .trim_end_matches([']', '}']);
        let nums: Vec<f64> = inner
            .split_whitespace()
            .filter_map(|x| x.parse().ok())
            .collect();
        if nums.len() < 3 {
            return None;
        }
        // Braces mean 0..255, brackets mean 0..1.
        let scale = if v.starts_with('{') { 1.0 / 255.0 } else { 1.0 };
        Some([nums[0] * scale, nums[1] * scale, nums[2] * scale])
    }
}

fn pairs(b: &kv::Block) -> BTreeMap<String, String> {
    b.pairs()
        .map(|p| {
            (
                p.key.text().to_ascii_lowercase(),
                p.value.text().to_string(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_shader_params_proxies_and_fallbacks() {
        let m = Material::parse(
            "\"LightmappedGeneric\"\n{\n\t\"$BaseTexture\" \"Concrete\\ConcreteFloor001a\"\n\t\"$surfaceprop\" \"concrete\"\n\t\"$translucent\" 1\n\t\"%keywords\" \"hl2\"\n\tProxies\n\t{\n\t\tTextureScroll\n\t\t{\n\t\t\ttexturescrollvar $basetexturetransform\n\t\t}\n\t}\n\t\">=DX90\"\n\t{\n\t\t\"$bumpmap\" \"x\"\n\t}\n}\n",
        )
        .unwrap();
        assert!(m.shader_is("lightmappedgeneric"));
        assert_eq!(
            m.base_texture().as_deref(),
            Some("concrete/concretefloor001a")
        );
        assert_eq!(m.surface_prop(), Some("concrete"));
        assert!(m.translucent());
        assert!(!m.alpha_test());
        assert!(!m.is_tool_texture());
        assert_eq!(m.proxies.len(), 1);
        assert_eq!(m.proxies[0].name, "TextureScroll");
        assert_eq!(m.fallbacks.len(), 1);
        assert_eq!(m.fallbacks[0].0, ">=DX90");
        // Fallback params are not merged into the base material.
        assert!(m.bump_map().is_none());
    }

    #[test]
    fn tool_textures_and_colors() {
        let m = Material::parse(
            "LightmappedGeneric\n{\n\t\"%compilenodraw\" 1\n\t\"$color\" \"{255 128 0}\"\n}\n",
        )
        .unwrap();
        assert!(m.is_tool_texture());
        assert!(m.compile_flag("nodraw"));
        assert!(!m.compile_flag("sky"));
        let c = m.color().unwrap();
        assert!((c[0] - 1.0).abs() < 1e-9 && (c[1] - 128.0 / 255.0).abs() < 1e-9);
        let m = Material::parse("UnlitGeneric\n{\n\t\"$color2\" \"[0.5 0.5 1]\"\n}\n").unwrap();
        assert_eq!(m.color(), Some([0.5, 0.5, 1.0]));
    }

    #[test]
    fn patch_materials_apply_insert_and_replace() {
        let base = Material::parse(
            "LightmappedGeneric\n{\n\t\"$basetexture\" \"a\"\n\t\"$surfaceprop\" \"metal\"\n}\n",
        )
        .unwrap();
        let patch = Material::parse(
            "patch\n{\n\tinclude \"materials/base.vmt\"\n\tinsert\n\t{\n\t\t\"$surfaceprop\" \"wood\"\n\t\t\"$translucent\" 1\n\t}\n\treplace\n\t{\n\t\t\"$basetexture\" \"b\"\n\t}\n}\n",
        )
        .unwrap();
        assert!(patch.is_patch());
        assert_eq!(patch.include(), Some("materials/base.vmt"));
        let m = patch.apply_patch(&base);
        assert_eq!(m.shader, "LightmappedGeneric");
        assert_eq!(m.base_texture().as_deref(), Some("b"));
        assert_eq!(m.surface_prop(), Some("metal"));
        assert!(m.translucent());
    }

    #[test]
    fn empty_is_an_error() {
        assert_eq!(Material::parse("// nothing\n").unwrap_err(), Error::Empty);
    }
}
