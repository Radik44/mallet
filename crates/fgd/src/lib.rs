//! Parser for FGD files, the entity definitions Hammer reads.
//!
//! An FGD is a list of directives:
//!
//! ```text
//! @include "base.fgd"
//! @mapsize(-16384, 16384)
//! @BaseClass base(Targetname) color(255 255 0) size(-8 -8 -8, 8 8 8) = Name : "Description"
//! [
//!     key(type) : "Display" : default : "Help"
//!     spawnflags(flags) = [ 1 : "Flag" : 0 ]
//!     mode(choices) : "Mode" : 0 = [ 0 : "Off" 1 : "On" ]
//!     input Enable(void) : "Help"
//!     output OnTrigger(void) : "Help"
//! ]
//! @PointClass / @SolidClass / @NPCClass / @KeyFrameClass / @MoveClass / @FilterClass ...
//! ```
//!
//! Parsing is tolerant: unknown directives are skipped and problems are
//! collected as warnings, because community FGDs are rarely clean.
//! [`Fgd::resolve`] flattens a class with its `base()` chain the way Hammer
//! does: base keys come first, later definitions override earlier ones by
//! name, and helpers such as `color` and `size` take the most derived value.

#![forbid(unsafe_code)]

mod lexer;
mod parser;

use std::collections::HashMap;
use std::fmt;
use std::path::{Path, PathBuf};

pub use parser::parse_str;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClassKind {
    Base,
    Point,
    Solid,
    Npc,
    KeyFrame,
    Move,
    Filter,
}

impl ClassKind {
    pub fn is_point(self) -> bool {
        !matches!(self, ClassKind::Solid | ClassKind::Base)
    }
}

/// `name(args)` before the `=` of a class: `base(A, B)`, `size(-8 -8 -8, 8 8 8)`,
/// `studio("models/x.mdl")`, `iconsprite(...)`, `color(255 0 0)`, `line(...)`.
/// Arguments are kept as comma-separated groups of tokens.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Helper {
    pub name: String,
    pub args: Vec<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Choice {
    pub value: String,
    pub display: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Flag {
    pub bit: u32,
    pub display: String,
    pub default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Key {
    pub name: String,
    /// Lowercased type: `string`, `integer`, `float`, `choices`, `flags`,
    /// `color255`, `angle`, `studio`, `target_destination`, ...
    pub ty: String,
    pub display: String,
    pub default: Option<String>,
    pub help: String,
    pub readonly: bool,
    pub report: bool,
    pub choices: Vec<Choice>,
    pub flags: Vec<Flag>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Io {
    pub name: String,
    pub ty: String,
    pub help: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Class {
    pub kind: ClassKind,
    pub name: String,
    pub description: String,
    pub bases: Vec<String>,
    pub helpers: Vec<Helper>,
    pub keys: Vec<Key>,
    pub inputs: Vec<Io>,
    pub outputs: Vec<Io>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Warning {
    pub file: Option<PathBuf>,
    pub line: usize,
    pub message: String,
}

impl fmt::Display for Warning {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.file {
            Some(p) => write!(f, "{}:{}: {}", p.display(), self.line, self.message),
            None => write!(f, "{}: {}", self.line, self.message),
        }
    }
}

/// A class with its inheritance chain applied.
#[derive(Debug, Clone, PartialEq)]
pub struct ResolvedClass {
    pub kind: ClassKind,
    pub name: String,
    pub description: String,
    /// Keys in Hammer's order: inherited first, own last, no duplicates.
    pub keys: Vec<Key>,
    pub inputs: Vec<Io>,
    pub outputs: Vec<Io>,
    /// All helpers along the chain, most derived last.
    pub helpers: Vec<Helper>,
    /// `color(r g b)` or Hammer's default purple.
    pub color: [u8; 3],
    /// `size(mins, maxs)` or the default 16-unit cube.
    pub mins: [f64; 3],
    pub maxs: [f64; 3],
    /// First `studio("path")` / `studioprop("path")` with an explicit model.
    pub model: Option<String>,
    /// `iconsprite("path")`.
    pub icon: Option<String>,
}

impl ResolvedClass {
    pub fn key(&self, name: &str) -> Option<&Key> {
        self.keys.iter().find(|k| k.name.eq_ignore_ascii_case(name))
    }

    pub fn has_helper(&self, name: &str) -> bool {
        self.helpers
            .iter()
            .any(|h| h.name.eq_ignore_ascii_case(name))
    }
}

/// Hammer's colour for entities whose class defines none.
pub const DEFAULT_COLOR: [u8; 3] = [220, 30, 220];
pub const DEFAULT_MINS: [f64; 3] = [-8.0, -8.0, -8.0];
pub const DEFAULT_MAXS: [f64; 3] = [8.0, 8.0, 8.0];

#[derive(Debug, Default, Clone)]
pub struct Fgd {
    pub classes: Vec<Class>,
    pub includes: Vec<String>,
    pub map_size: Option<(i64, i64)>,
    pub warnings: Vec<Warning>,
    /// Lowercased name to class index, for placeable classes.
    index: HashMap<String, usize>,
    /// The same for `@BaseClass`es, kept apart: Valve's base.fgd defines both
    /// a `Light` base class and a `light` point entity.
    base_index: HashMap<String, usize>,
}

impl Fgd {
    /// Parses one FGD text without following includes.
    pub fn parse(text: &str) -> Fgd {
        let mut fgd = Fgd::default();
        let (classes, includes, map_size, warnings) = parse_str(text);
        fgd.includes = includes;
        fgd.map_size = map_size;
        fgd.warnings = warnings;
        for c in classes {
            fgd.add_class(c);
        }
        fgd
    }

    /// Parses a file and every `@include` reachable from it, each file once.
    /// Includes resolve relative to the including file's directory.
    pub fn load(path: impl AsRef<Path>) -> std::io::Result<Fgd> {
        let mut fgd = Fgd::default();
        let mut seen: Vec<PathBuf> = Vec::new();
        fgd.load_into(path.as_ref(), &mut seen)?;
        Ok(fgd)
    }

    fn load_into(&mut self, path: &Path, seen: &mut Vec<PathBuf>) -> std::io::Result<()> {
        let canonical = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
        if seen.contains(&canonical) {
            return Ok(());
        }
        seen.push(canonical);
        let text = std::fs::read_to_string(path)?;
        let (classes, includes, map_size, warnings) = parse_str(&text);
        let dir = path.parent().map(Path::to_path_buf).unwrap_or_default();
        for inc in &includes {
            let p = dir.join(inc);
            if p.is_file() {
                self.load_into(&p, seen)?;
            } else {
                self.warnings.push(Warning {
                    file: Some(path.to_path_buf()),
                    line: 0,
                    message: format!("include {inc:?} not found"),
                });
            }
        }
        self.includes.extend(includes);
        if map_size.is_some() {
            self.map_size = map_size;
        }
        self.warnings.extend(warnings.into_iter().map(|mut w| {
            w.file = Some(path.to_path_buf());
            w
        }));
        for c in classes {
            self.add_class(c);
        }
        Ok(())
    }

    /// Adds every class of `other`, later definitions winning.
    pub fn merge(&mut self, other: Fgd) {
        for c in other.classes {
            self.add_class(c);
        }
        self.warnings.extend(other.warnings);
        self.includes.extend(other.includes);
        if other.map_size.is_some() {
            self.map_size = other.map_size;
        }
    }

    fn add_class(&mut self, class: Class) {
        let key = class.name.to_ascii_lowercase();
        let index = if class.kind == ClassKind::Base {
            &mut self.base_index
        } else {
            &mut self.index
        };
        match index.get(&key) {
            Some(&i) => self.classes[i] = class,
            None => {
                index.insert(key, self.classes.len());
                self.classes.push(class);
            }
        }
    }

    /// A placeable class by name (case-insensitive).
    pub fn class(&self, name: &str) -> Option<&Class> {
        self.index
            .get(&name.to_ascii_lowercase())
            .map(|&i| &self.classes[i])
    }

    /// A `@BaseClass` by name; falls back to a placeable class of that name,
    /// which some FGDs use as a base.
    pub fn base_class(&self, name: &str) -> Option<&Class> {
        let key = name.to_ascii_lowercase();
        self.base_index
            .get(&key)
            .or_else(|| self.index.get(&key))
            .map(|&i| &self.classes[i])
    }

    /// Point, solid and other placeable classes (not base classes).
    pub fn entity_classes(&self) -> impl Iterator<Item = &Class> {
        self.classes.iter().filter(|c| c.kind != ClassKind::Base)
    }

    /// Flattens the inheritance chain. `None` when the class is unknown.
    pub fn resolve(&self, name: &str) -> Option<ResolvedClass> {
        let class = self.class(name)?;
        let mut out = ResolvedClass {
            kind: class.kind,
            name: class.name.clone(),
            description: class.description.clone(),
            keys: Vec::new(),
            inputs: Vec::new(),
            outputs: Vec::new(),
            helpers: Vec::new(),
            color: DEFAULT_COLOR,
            mins: DEFAULT_MINS,
            maxs: DEFAULT_MAXS,
            model: None,
            icon: None,
        };
        let mut visiting: Vec<String> = Vec::new();
        self.collect(class, &mut out, &mut visiting);
        Some(out)
    }

    fn collect(&self, class: &Class, out: &mut ResolvedClass, visiting: &mut Vec<String>) {
        let key = format!(
            "{}:{:?}",
            class.name.to_ascii_lowercase(),
            class.kind == ClassKind::Base
        );
        if visiting.contains(&key) {
            return;
        }
        visiting.push(key);
        for base in &class.bases {
            if let Some(b) = self.base_class(base) {
                self.collect(b, out, visiting);
            }
        }
        for k in &class.keys {
            match out
                .keys
                .iter_mut()
                .find(|e| e.name.eq_ignore_ascii_case(&k.name))
            {
                Some(existing) => *existing = k.clone(),
                None => out.keys.push(k.clone()),
            }
        }
        for i in &class.inputs {
            if !out
                .inputs
                .iter()
                .any(|e| e.name.eq_ignore_ascii_case(&i.name))
            {
                out.inputs.push(i.clone());
            }
        }
        for o in &class.outputs {
            if !out
                .outputs
                .iter()
                .any(|e| e.name.eq_ignore_ascii_case(&o.name))
            {
                out.outputs.push(o.clone());
            }
        }
        for h in &class.helpers {
            match h.name.to_ascii_lowercase().as_str() {
                "base" => continue,
                "color" => {
                    if let Some(c) = parse_color(h) {
                        out.color = c;
                    }
                }
                "size" => {
                    if let Some((mins, maxs)) = parse_size(h) {
                        out.mins = mins;
                        out.maxs = maxs;
                    }
                }
                "studio" | "studioprop" | "lightprop" => {
                    if let Some(path) = h.args.first().and_then(|a| a.first()) {
                        if !path.is_empty() {
                            out.model = Some(path.clone());
                        }
                    }
                }
                "iconsprite" => {
                    if let Some(path) = h.args.first().and_then(|a| a.first()) {
                        if !path.is_empty() {
                            out.icon = Some(path.clone());
                        }
                    }
                }
                _ => {}
            }
            out.helpers.push(h.clone());
        }
    }
}

fn parse_color(h: &Helper) -> Option<[u8; 3]> {
    let nums: Vec<f64> = h
        .args
        .iter()
        .flatten()
        .filter_map(|t| t.parse().ok())
        .collect();
    (nums.len() >= 3).then(|| {
        [
            nums[0].clamp(0.0, 255.0) as u8,
            nums[1].clamp(0.0, 255.0) as u8,
            nums[2].clamp(0.0, 255.0) as u8,
        ]
    })
}

fn parse_size(h: &Helper) -> Option<([f64; 3], [f64; 3])> {
    let groups: Vec<Vec<f64>> = h
        .args
        .iter()
        .map(|g| g.iter().filter_map(|t| t.parse().ok()).collect())
        .collect();
    match groups.as_slice() {
        [a, b] if a.len() == 3 && b.len() == 3 => Some(([a[0], a[1], a[2]], [b[0], b[1], b[2]])),
        // `size(32 32 32)` means a box of that extent centred on the origin.
        [a] if a.len() == 3 => Some((
            [-a[0] / 2.0, -a[1] / 2.0, -a[2] / 2.0],
            [a[0] / 2.0, a[1] / 2.0, a[2] / 2.0],
        )),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"
// A comment
@include "base.fgd"
@mapsize(-16384, 16384)

@BaseClass = Targetname
[
	targetname(target_source) : "Name" : : "The name that other entities refer to this entity by."
]

@BaseClass base(Targetname) color(0 255 0) = LightBase
[
	_light(color255) : "Brightness" : "255 255 255 200"
	spawnflags(flags) =
	[
		1 : "Initially dark" : 0
		2 : "Something" : 1
	]
	input TurnOn(void) : "Turn the light on."
	output OnLit(void) : "Fired when lit."
]

@PointClass base(LightBase) iconsprite("editor/light.vmt") size(-4 -4 -4, 4 4 4) = light :
	"Invisible point light "+
	"source."
[
	style(choices) : "Appearance" : 0 : "Help" =
	[
		0 : "Normal"
		10 : "Fluorescent flicker"
	]
	_light(color255) : "Brightness" : "255 255 255 300"
	health(integer) readonly : "Health" : 10
	input TurnOff(void) : "Turn the light off."
]

@SolidClass base(Targetname) = func_detail : "Detail brush."
[
]

@PointClass studio("models/editor/playerstart.mdl") = info_player_start : "Spawn" []
"#;

    #[test]
    fn parses_classes_keys_choices_flags_and_io() {
        let fgd = Fgd::parse(SAMPLE);
        assert!(fgd.warnings.is_empty(), "{:?}", fgd.warnings);
        assert_eq!(fgd.includes, vec!["base.fgd"]);
        assert_eq!(fgd.map_size, Some((-16384, 16384)));
        assert_eq!(fgd.classes.len(), 5);

        let light = fgd.class("LIGHT").unwrap();
        assert_eq!(light.kind, ClassKind::Point);
        assert_eq!(light.description, "Invisible point light source.");
        assert_eq!(light.bases, vec!["LightBase"]);
        assert_eq!(light.helpers.len(), 3);
        let style = &light.keys[0];
        assert_eq!(style.ty, "choices");
        assert_eq!(style.default.as_deref(), Some("0"));
        assert_eq!(style.choices.len(), 2);
        assert_eq!(style.choices[1].value, "10");
        assert_eq!(style.choices[1].display, "Fluorescent flicker");
        assert!(light.keys[2].readonly);
        assert_eq!(light.inputs[0].name, "TurnOff");

        let base = fgd.base_class("lightbase").unwrap();
        let flags = &base.keys[1];
        assert_eq!(flags.ty, "flags");
        assert_eq!(flags.flags.len(), 2);
        assert_eq!(flags.flags[1].bit, 2);
        assert!(flags.flags[1].default);
        assert_eq!(fgd.class("func_detail").unwrap().kind, ClassKind::Solid);
        assert_eq!(fgd.entity_classes().count(), 3);
    }

    #[test]
    fn resolve_applies_inheritance_and_helpers() {
        let fgd = Fgd::parse(SAMPLE);
        let r = fgd.resolve("light").unwrap();
        // targetname from Targetname, _light and spawnflags from LightBase (with _light overridden), own keys last.
        let names: Vec<&str> = r.keys.iter().map(|k| k.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["targetname", "_light", "spawnflags", "style", "health"]
        );
        assert_eq!(
            r.key("_light").unwrap().default.as_deref(),
            Some("255 255 255 300")
        );
        assert_eq!(
            r.inputs.iter().map(|i| i.name.as_str()).collect::<Vec<_>>(),
            vec!["TurnOn", "TurnOff"]
        );
        assert_eq!(r.outputs.len(), 1);
        assert_eq!(r.color, [0, 255, 0]);
        assert_eq!(r.mins, [-4.0, -4.0, -4.0]);
        assert_eq!(r.icon.as_deref(), Some("editor/light.vmt"));
        assert!(r.model.is_none());

        let start = fgd.resolve("info_player_start").unwrap();
        assert_eq!(start.color, DEFAULT_COLOR);
        assert_eq!(start.maxs, DEFAULT_MAXS);
        assert_eq!(
            start.model.as_deref(),
            Some("models/editor/playerstart.mdl")
        );
        assert!(fgd.resolve("nope").is_none());
    }

    #[test]
    fn later_definitions_override_and_cycles_terminate() {
        let a = Fgd::parse("@PointClass = x : \"one\" []");
        let mut b = Fgd::parse("@PointClass base(y) = x : \"two\" []\n@BaseClass base(x) = y []");
        let mut merged = a;
        merged.merge(std::mem::take(&mut b));
        assert_eq!(merged.class("x").unwrap().description, "two");
        let r = merged.resolve("x").unwrap();
        assert_eq!(r.name, "x");
    }

    #[test]
    fn tolerates_garbage() {
        let fgd = Fgd::parse("@Weird thing\n@PointClass = ok []\n@PointClass = broken : \"x\" [ key(integer) : \"K\" : 1 : \"h\"\n");
        assert!(fgd.class("ok").is_some());
        assert!(!fgd.warnings.is_empty());
    }
}
