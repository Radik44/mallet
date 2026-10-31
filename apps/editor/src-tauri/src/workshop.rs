//! Steam Workshop: the addon folder of a compiled map, `gmad` packing it into
//! a GMA and `gmpublish` creating or updating the Workshop item. Hammer has
//! nothing of the kind: a mapper otherwise collects the files by hand.
//!
//! The folder lives next to the map project: `<out_dir>/<map>/` with
//! `maps/<map>.bsp`, the map's Lua addon (when the assistant wrote one) and
//! `addon.json`. Custom content is already inside the BSP (bspzip), so the
//! GMA carries nothing else.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use content::GameInstall;
use serde::{Deserialize, Serialize};

/// The tags gmad accepts on a map addon; at most two go into addon.json.
pub const MAP_TAGS: [&str; 9] = [
    "fun", "roleplay", "scenic", "movie", "realism", "cartoon", "water", "comic", "build",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackRequest {
    /// The compiled BSP to publish.
    pub bsp: String,
    /// The map's name: the BSP goes to `maps/<map>.bsp`, the folder is named after it.
    pub map: String,
    pub title: String,
    pub tags: Vec<String>,
    /// Where the folder and the GMA are written, usually `<project>/workshop`.
    pub out_dir: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PackResult {
    pub folder: String,
    pub gma: String,
    pub bytes: u64,
    /// What went into the addon, relative to its folder.
    pub files: Vec<String>,
    pub log: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishRequest {
    pub gma: String,
    /// 512×512 JPEG, required by gmpublish when creating.
    pub icon: Option<String>,
    /// The Workshop id to update; none creates a new item.
    pub id: Option<String>,
    pub changes: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResult {
    pub id: Option<String>,
    pub url: Option<String>,
    pub log: Vec<String>,
}

fn tool(install: &GameInstall, name: &str) -> Result<PathBuf, String> {
    let exe = install.bin_dir.join(format!("{name}.exe"));
    if exe.is_file() {
        Ok(exe)
    } else {
        Err(format!(
            "{name}.exe не найден в {}",
            install.bin_dir.display()
        ))
    }
}

/// A file name gmad accepts: lower-case ASCII letters, digits, `_` and `-`.
pub fn safe_map_name(map: &str) -> String {
    let s: String = map
        .trim()
        .trim_end_matches(".bsp")
        .trim_end_matches(".vmf")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    if s.is_empty() {
        "map".into()
    } else {
        s
    }
}

/// addon.json as gmad wants it.
pub fn addon_json(title: &str, tags: &[String]) -> String {
    let tags: Vec<String> = tags
        .iter()
        .map(|t| t.trim().to_ascii_lowercase())
        .filter(|t| MAP_TAGS.contains(&t.as_str()))
        .take(2)
        .map(|t| format!("\"{t}\""))
        .collect();
    let title = title.replace('\\', "\\\\").replace('"', "\\\"");
    format!(
        "{{\n\t\"title\": \"{title}\",\n\t\"type\": \"map\",\n\t\"tags\": [{}],\n\t\"ignore\": [\"*.vmf\", \"*.log\", \"*.txt\", \"*.psd\"]\n}}\n",
        tags.join(", ")
    )
}

fn copy_tree(src: &Path, dst: &Path, rel: &Path, out: &mut Vec<String>) -> Result<(), String> {
    for entry in fs::read_dir(src).map_err(|e| format!("{}: {e}", src.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let rel = rel.join(entry.file_name());
        if path.is_dir() {
            fs::create_dir_all(dst.join(&rel)).map_err(|e| e.to_string())?;
            copy_tree(&path, dst, &rel, out)?;
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("lua"))
            .unwrap_or(false)
        {
            fs::create_dir_all(dst.join(&rel).parent().unwrap_or(dst))
                .map_err(|e| e.to_string())?;
            fs::copy(&path, dst.join(&rel)).map_err(|e| format!("{}: {e}", path.display()))?;
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

/// Lays out the addon folder and packs it with gmad.
pub fn pack(install: &GameInstall, req: &PackRequest) -> Result<PackResult, String> {
    let title = req.title.trim();
    if title.is_empty() {
        return Err("не задано название карты: оно используется как имя в Workshop".into());
    }
    let bsp = Path::new(&req.bsp);
    if !bsp.is_file() {
        return Err(format!("нет собранной карты: {}", bsp.display()));
    }
    let map = safe_map_name(&req.map);
    let out_dir = Path::new(&req.out_dir);
    let folder = out_dir.join(&map);
    if folder.exists() {
        fs::remove_dir_all(&folder)
            .map_err(|e| format!("не удалось очистить {}: {e}", folder.display()))?;
    }
    fs::create_dir_all(folder.join("maps"))
        .map_err(|e| format!("не удалось создать {}: {e}", folder.display()))?;
    let mut files = Vec::new();
    let bsp_rel = format!("maps/{map}.bsp");
    fs::copy(bsp, folder.join(&bsp_rel)).map_err(|e| format!("не удалось скопировать BSP: {e}"))?;
    files.push(bsp_rel);
    // The map's Lua addon, as the assistant installs it for testing.
    let lua = install
        .game_dir
        .join("addons")
        .join(format!("mallet_{map}"))
        .join("lua");
    if lua.is_dir() {
        copy_tree(&lua, &folder, Path::new("lua"), &mut files)?;
    }
    fs::write(folder.join("addon.json"), addon_json(title, &req.tags))
        .map_err(|e| e.to_string())?;
    files.push("addon.json".into());

    let gma = out_dir.join(format!("{map}.gma"));
    let _ = fs::remove_file(&gma);
    let exe = tool(install, "gmad")?;
    let output = Command::new(&exe)
        .args(["create", "-folder"])
        .arg(&folder)
        .arg("-out")
        .arg(&gma)
        .current_dir(&install.bin_dir)
        .output()
        .map_err(|e| format!("gmad: {e}"))?;
    let mut log: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .chain(String::from_utf8_lossy(&output.stderr).lines())
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let bytes = fs::metadata(&gma).map(|m| m.len()).unwrap_or(0);
    if !output.status.success() || bytes == 0 {
        log.push(format!(
            "gmad завершился с кодом {:?}",
            output.status.code()
        ));
        return Err(format!(
            "gmad не создал аддон: {}",
            log.last().cloned().unwrap_or_default()
        ));
    }
    Ok(PackResult {
        folder: folder.display().to_string().replace('\\', "/"),
        gma: gma.display().to_string().replace('\\', "/"),
        bytes,
        files,
        log,
    })
}

/// The Workshop id in gmpublish's output: the page URL or a bare number of eight digits or more.
pub fn find_id(text: &str) -> Option<String> {
    if let Some(i) = text.find("id=") {
        let digits: String = text[i + 3..]
            .chars()
            .take_while(|c| c.is_ascii_digit())
            .collect();
        if digits.len() >= 6 {
            return Some(digits);
        }
    }
    let mut best: Option<String> = None;
    let mut cur = String::new();
    for c in text.chars().chain(std::iter::once(' ')) {
        if c.is_ascii_digit() {
            cur.push(c);
        } else {
            if cur.len() >= 8 && best.as_ref().map(|b| cur.len() > b.len()).unwrap_or(true) {
                best = Some(cur.clone());
            }
            cur.clear();
        }
    }
    best
}

/// Creates or updates the Workshop item. Steam must be running and logged in.
pub fn publish(install: &GameInstall, req: &PublishRequest) -> Result<PublishResult, String> {
    let gma = Path::new(&req.gma);
    if !gma.is_file() {
        return Err("сначала соберите аддон".into());
    }
    let exe = tool(install, "gmpublish")?;
    let mut cmd = Command::new(&exe);
    match &req.id {
        Some(id) if !id.trim().is_empty() => {
            cmd.arg("update")
                .arg("-addon")
                .arg(gma)
                .arg("-id")
                .arg(id.trim());
            if let Some(ch) = req
                .changes
                .as_ref()
                .map(|c| c.trim())
                .filter(|c| !c.is_empty())
            {
                cmd.arg("-changes").arg(ch);
            }
            if let Some(icon) = req.icon.as_ref().filter(|i| Path::new(i).is_file()) {
                cmd.arg("-icon").arg(icon);
            }
        }
        _ => {
            let icon = req
                .icon
                .as_ref()
                .filter(|i| Path::new(i).is_file())
                .ok_or("для первой публикации нужна иконка 512×512 JPEG")?;
            cmd.arg("create")
                .arg("-addon")
                .arg(gma)
                .arg("-icon")
                .arg(icon);
        }
    }
    let output = cmd
        .current_dir(&install.bin_dir)
        .output()
        .map_err(|e| format!("gmpublish: {e}"))?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    let log: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let lower = text.to_ascii_lowercase();
    let failed = !output.status.success()
        || lower.contains("error")
        || lower.contains("failed")
        || lower.contains("couldn't");
    if failed {
        let hint = if lower.contains("steam")
            && (lower.contains("not running")
                || lower.contains("login")
                || lower.contains("logged"))
        {
            "запустите Steam и войдите в аккаунт"
        } else if lower.contains("icon") {
            "иконка должна быть JPEG 512×512 до 1 МБ"
        } else {
            "подробности в журнале ниже"
        };
        return Err(format!("ошибка gmpublish: {hint}"));
    }
    let id = find_id(&text).or_else(|| req.id.clone().filter(|i| !i.trim().is_empty()));
    let url = id
        .as_ref()
        .map(|i| format!("https://steamcommunity.com/sharedfiles/filedetails/?id={i}"));
    Ok(PublishResult { id, url, log })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn addon_json_keeps_two_known_tags() {
        let s = addon_json(
            "My \"map\"",
            &["Fun".into(), "weird".into(), "build".into(), "water".into()],
        );
        assert!(s.contains("\"title\": \"My \\\"map\\\"\""));
        assert!(s.contains("\"tags\": [\"fun\", \"build\"]"));
        assert!(s.contains("\"type\": \"map\""));
    }

    #[test]
    fn map_names_are_gmad_safe() {
        assert_eq!(safe_map_name("My Map.bsp"), "my_map");
        assert_eq!(safe_map_name("gm_test.vmf"), "gm_test");
        assert_eq!(safe_map_name(" "), "map");
    }

    #[test]
    fn ids_come_from_urls_or_bare_numbers() {
        assert_eq!(
            find_id("Done: https://steamcommunity.com/sharedfiles/filedetails/?id=1234567890\n")
                .as_deref(),
            Some("1234567890")
        );
        assert_eq!(
            find_id("Published addon 2987654321!").as_deref(),
            Some("2987654321")
        );
        assert_eq!(find_id("nothing 123 here"), None);
    }
}
