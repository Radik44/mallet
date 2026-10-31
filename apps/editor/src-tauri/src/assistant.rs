//! The Claude assistant's shell side: the API key lives in the OS
//! credential store and requests to the Messages API go out from here, so
//! the key never reaches the webview. The map project's files (Lua and the
//! like) are read and written through here too, fenced to the project
//! folder.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

const SERVICE: &str = "dev.mallet.editor";
const USER: &str = "anthropic-api-key";
const API: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, USER).map_err(|e| format!("хранилище ключей: {e}"))
}

/// The key from the credential store, or the `ANTHROPIC_API_KEY` variable.
pub fn get_key() -> Option<String> {
    if let Ok(e) = entry() {
        if let Ok(k) = e.get_password() {
            let k = k.trim().to_string();
            if !k.is_empty() {
                return Some(k);
            }
        }
    }
    std::env::var("ANTHROPIC_API_KEY")
        .ok()
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty())
}

pub fn set_key(key: &str) -> Result<(), String> {
    let key = key.trim();
    if key.is_empty() {
        return Err("ключ API не может быть пустым".into());
    }
    entry()?
        .set_password(key)
        .map_err(|e| format!("хранилище ключей: {e}"))
}

pub fn clear_key() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("хранилище ключей: {e}")),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyStatus {
    /// A key is available (store or environment).
    pub present: bool,
    /// Where it comes from: "store", "env" or "".
    pub source: String,
    /// The key's last four characters, to recognise it.
    pub hint: String,
    /// A local Claude Code (`claude`) to run on the subscription, if installed.
    pub cli: Option<String>,
}

pub fn key_status() -> KeyStatus {
    let from_store = entry()
        .ok()
        .and_then(|e| e.get_password().ok())
        .map(|k| k.trim().to_string())
        .filter(|k| !k.is_empty());
    let (key, source) = match from_store {
        Some(k) => (Some(k), "store"),
        None => (
            std::env::var("ANTHROPIC_API_KEY")
                .ok()
                .map(|k| k.trim().to_string())
                .filter(|k| !k.is_empty()),
            "env",
        ),
    };
    match key {
        Some(k) => KeyStatus {
            present: true,
            source: source.into(),
            hint: k
                .chars()
                .rev()
                .take(4)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
                .collect(),
            cli: crate::assistant_cli::find_cli().map(|p| p.display().to_string()),
        },
        None => KeyStatus {
            present: false,
            source: String::new(),
            hint: String::new(),
            cli: crate::assistant_cli::find_cli().map(|p| p.display().to_string()),
        },
    }
}

/// One Messages API call: the conversation so far, the tools, the system prompt.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub model: String,
    pub system: String,
    pub messages: serde_json::Value,
    pub tools: serde_json::Value,
    pub max_tokens: Option<u32>,
    /// "auto" (key, else Claude Code), "api" or "cli".
    pub backend: Option<String>,
}

/// Sends the request where it should go: the API with a key, else a local Claude Code.
pub fn dispatch(
    req: &ChatRequest,
    session: &crate::assistant_cli::CliSession,
) -> Result<(ChatResponse, &'static str), String> {
    let want = req.backend.as_deref().unwrap_or("auto");
    let cli = crate::assistant_cli::find_cli();
    let use_cli = match want {
        "cli" => true,
        "api" => false,
        // Auto: a local Claude Code runs on the subscription, so it wins over a key.
        _ => cli.is_some(),
    };
    if use_cli {
        let cli = cli.ok_or("Claude Code не найден: установите его командой npm install -g @anthropic-ai/claude-code и выполните вход командой claude")?;
        return crate::assistant_cli::chat(req, &cli, session).map(|r| (r, "cli"));
    }
    chat(req).map(|r| (r, "api"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    /// The content blocks as the API returned them (text and tool_use).
    pub content: serde_json::Value,
    pub stop_reason: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

pub fn chat(req: &ChatRequest) -> Result<ChatResponse, String> {
    let key = get_key().ok_or("ключ API не задан: введите его в панели «Ассистент»")?;
    let body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens.unwrap_or(4096),
        "system": req.system,
        "messages": req.messages,
        "tools": req.tools,
    });
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(240))
        .build();
    let resp = agent
        .post(API)
        .set("x-api-key", &key)
        .set("anthropic-version", API_VERSION)
        .set("content-type", "application/json")
        .send_json(body);
    let json: serde_json::Value = match resp {
        Ok(r) => r
            .into_json()
            .map_err(|e| format!("не удалось разобрать ответ API: {e}"))?,
        Err(ureq::Error::Status(code, r)) => {
            let text = r.into_string().unwrap_or_default();
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
                .unwrap_or(text);
            return Err(format!(
                "API {code}: {}",
                msg.chars().take(400).collect::<String>()
            ));
        }
        Err(e) => return Err(format!("ошибка сети: {e}")),
    };
    Ok(ChatResponse {
        content: json["content"].clone(),
        stop_reason: json["stop_reason"]
            .as_str()
            .unwrap_or("end_turn")
            .to_string(),
        input_tokens: json["usage"]["input_tokens"].as_u64().unwrap_or(0),
        output_tokens: json["usage"]["output_tokens"].as_u64().unwrap_or(0),
    })
}

/// One streamed Messages API call. Every content block event goes to `send`
/// as it arrives (text pieces, a tool call's name at once and its input JSON
/// in pieces); the webview puts the reply together and runs each tool call as
/// soon as its block is complete.
pub fn chat_stream(req: &ChatRequest, send: &dyn Fn(serde_json::Value)) -> Result<(), String> {
    let key = get_key().ok_or("ключ API не задан: введите его в панели «Ассистент»")?;
    let body = serde_json::json!({
        "model": req.model,
        "max_tokens": req.max_tokens.unwrap_or(4096),
        "system": req.system,
        "messages": req.messages,
        "tools": req.tools,
        "stream": true,
    });
    // No overall limit: a long reply streams for minutes; a silent connection is dropped.
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(30))
        .timeout_read(Duration::from_secs(180))
        .build();
    let resp = agent
        .post(API)
        .set("x-api-key", &key)
        .set("anthropic-version", API_VERSION)
        .set("content-type", "application/json")
        .set("accept", "text/event-stream")
        .send_json(body);
    let resp = match resp {
        Ok(r) => r,
        Err(ureq::Error::Status(code, r)) => {
            let text = r.into_string().unwrap_or_default();
            let msg = serde_json::from_str::<serde_json::Value>(&text)
                .ok()
                .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
                .unwrap_or(text);
            return Err(format!(
                "API {code}: {}",
                msg.chars().take(400).collect::<String>()
            ));
        }
        Err(e) => return Err(format!("ошибка сети: {e}")),
    };
    relay_stream(BufReader::new(resp.into_reader()), send)
}

/// Reads the API's server-sent events and forwards the content block events;
/// ends with a `done` event carrying the stop reason and the token counts.
fn relay_stream(reader: impl BufRead, send: &dyn Fn(serde_json::Value)) -> Result<(), String> {
    let mut stop_reason = "end_turn".to_string();
    let (mut input_tokens, mut output_tokens) = (0u64, 0u64);
    for line in reader.lines() {
        let line = line.map_err(|e| format!("поток API оборвался: {e}"))?;
        let Some(data) = line.strip_prefix("data: ") else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(data) else {
            continue;
        };
        match v["type"].as_str().unwrap_or("") {
            "message_start" => {
                input_tokens = v["message"]["usage"]["input_tokens"].as_u64().unwrap_or(0);
            }
            "content_block_start" => {
                let b = &v["content_block"];
                send(serde_json::json!({
                    "kind": "block_start", "index": v["index"], "type": b["type"], "id": b["id"], "name": b["name"]
                }));
            }
            "content_block_delta" => {
                let d = &v["delta"];
                match d["type"].as_str() {
                    Some("text_delta") => send(
                        serde_json::json!({ "kind": "text", "index": v["index"], "text": d["text"] }),
                    ),
                    Some("input_json_delta") => send(
                        serde_json::json!({ "kind": "json", "index": v["index"], "text": d["partial_json"] }),
                    ),
                    _ => {}
                }
            }
            "content_block_stop" => {
                send(serde_json::json!({ "kind": "block_stop", "index": v["index"] }))
            }
            "message_delta" => {
                if let Some(s) = v["delta"]["stop_reason"].as_str() {
                    stop_reason = s.to_string();
                }
                if let Some(n) = v["usage"]["output_tokens"].as_u64() {
                    output_tokens = n;
                }
            }
            "message_stop" => break,
            "error" => {
                return Err(format!(
                    "API: {}",
                    v["error"]["message"].as_str().unwrap_or("?")
                ))
            }
            _ => {}
        }
    }
    send(serde_json::json!({
        "kind": "done", "stopReason": stop_reason, "inputTokens": input_tokens, "outputTokens": output_tokens
    }));
    Ok(())
}

/// A path inside the project folder, from a relative path the model gave:
/// no absolute paths, no `..`, forward slashes.
pub fn project_path(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.trim().replace('\\', "/");
    let rel = rel.trim_start_matches('/');
    if rel.is_empty() {
        return Ok(root.to_path_buf());
    }
    if rel.contains(':') {
        return Err(format!("{rel}: путь должен быть внутри проекта карты"));
    }
    let mut out = root.to_path_buf();
    for part in rel.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            return Err(format!("{rel}: путь должен быть внутри проекта карты"));
        }
        out.push(part);
    }
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    /// Relative to the project root, forward slashes.
    pub path: String,
    pub bytes: u64,
    pub dir: bool,
}

/// Files under `<root>/<dir>`, two levels deep, text-ish ones first.
pub fn list_files(root: &Path, dir: &str) -> Result<Vec<ProjectFile>, String> {
    let base = project_path(root, dir)?;
    let mut out = Vec::new();
    fn walk(root: &Path, dir: &Path, depth: usize, out: &mut Vec<ProjectFile>) {
        let Ok(rd) = std::fs::read_dir(dir) else {
            return;
        };
        let mut entries: Vec<_> = rd.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for e in entries {
            let p = e.path();
            let rel = p
                .strip_prefix(root)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            let is_dir = p.is_dir();
            out.push(ProjectFile {
                path: rel,
                bytes: e.metadata().map(|m| m.len()).unwrap_or(0),
                dir: is_dir,
            });
            if is_dir && depth < 3 && out.len() < 400 {
                walk(root, &p, depth + 1, out);
            }
        }
    }
    walk(root, &base, 0, &mut out);
    Ok(out)
}

pub fn read_file(root: &Path, rel: &str) -> Result<String, String> {
    let p = project_path(root, rel)?;
    let bytes = std::fs::read(&p).map_err(|e| format!("{rel}: {e}"))?;
    if bytes.len() > 512 * 1024 {
        return Err(format!("{rel}: файл больше 512 КБ"));
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

pub fn write_file(root: &Path, rel: &str, text: &str) -> Result<PathBuf, String> {
    let p = project_path(root, rel)?;
    if p == root {
        return Err("не указано имя файла".into());
    }
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    std::fs::write(&p, text.as_bytes()).map_err(|e| format!("{}: {e}", p.display()))?;
    Ok(p)
}

/// The map's Lua (`<root>/lua/**`) as an addon folder in the game, written
/// fresh on every launch: `addons/mallet_<map>/lua/...` plus `addon.txt`.
pub fn install_lua_addon(game_dir: &Path, root: &Path, map: &str) -> std::io::Result<usize> {
    let src = root.join("lua");
    let addon = game_dir.join("addons").join(format!("mallet_{map}"));
    if addon.is_dir() {
        std::fs::remove_dir_all(&addon)?;
    }
    if !src.is_dir() {
        return Ok(0);
    }
    fn copy_dir(from: &Path, to: &Path) -> std::io::Result<usize> {
        std::fs::create_dir_all(to)?;
        let mut n = 0;
        for e in std::fs::read_dir(from)?.flatten() {
            let p = e.path();
            let target = to.join(e.file_name());
            if p.is_dir() {
                n += copy_dir(&p, &target)?;
            } else if p.extension().and_then(|x| x.to_str()) == Some("lua") {
                std::fs::copy(&p, &target)?;
                n += 1;
            }
        }
        Ok(n)
    }
    let n = copy_dir(&src, &addon.join("lua"))?;
    std::fs::write(
        addon.join("addon.txt"),
        format!(
            "\"AddonInfo\"\n{{\n\t\"name\" \"Mallet: Lua of {map}\"\n\t\"version\" \"1\"\n\t\"author_name\" \"Mallet\"\n\t\"info\" \"Written by the editor from the map project's lua folder on every launch.\"\n}}\n"
        ),
    )?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn project_paths_stay_inside_the_root() {
        let root = Path::new("C:/maps/proj");
        assert_eq!(
            project_path(root, "lua/autorun/server/door.lua").unwrap(),
            root.join("lua")
                .join("autorun")
                .join("server")
                .join("door.lua")
        );
        assert!(project_path(root, "../secrets.txt").is_err());
        assert!(project_path(root, "C:/windows/x").is_err());
        assert_eq!(
            project_path(root, "/lua\\x.lua").unwrap(),
            root.join("lua").join("x.lua")
        );
    }

    #[test]
    fn streamed_events_are_relayed_and_summed_up() {
        let sse = concat!(
            "event: message_start
",
            "data: {\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":12}}}

",
            "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}

",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Buil\"}}

",
            "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"d\"}}

",
            "data: {\"type\":\"content_block_stop\",\"index\":0}

",
            "data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tu_1\",\"name\":\"create_brush\",\"input\":{}}}

",
            "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"min\\\":\"}}

",
            "data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"[0,0,0]}\"}}

",
            "data: {\"type\":\"content_block_stop\",\"index\":1}

",
            "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":34}}

",
            "data: {\"type\":\"message_stop\"}

",
        );
        let got = std::sync::Mutex::new(Vec::new());
        relay_stream(sse.as_bytes(), &|v| got.lock().unwrap().push(v)).unwrap();
        let got = got.into_inner().unwrap();
        let kinds: Vec<&str> = got.iter().map(|v| v["kind"].as_str().unwrap()).collect();
        assert_eq!(
            kinds,
            [
                "block_start",
                "text",
                "text",
                "block_stop",
                "block_start",
                "json",
                "json",
                "block_stop",
                "done"
            ]
        );
        assert_eq!(got[4]["name"], "create_brush");
        assert_eq!(got[4]["id"], "tu_1");
        let json: String = got
            .iter()
            .filter(|v| v["kind"] == "json")
            .map(|v| v["text"].as_str().unwrap())
            .collect();
        assert_eq!(json, "{\"min\":[0,0,0]}");
        let done = got.last().unwrap();
        assert_eq!(done["stopReason"], "tool_use");
        assert_eq!(done["inputTokens"], 12);
        assert_eq!(done["outputTokens"], 34);
    }

    #[test]
    fn credential_store_round_trips_a_throwaway_entry() {
        let e = keyring::Entry::new(SERVICE, "test-throwaway").expect("entry");
        e.set_password("sk-test-1234").expect("store");
        assert_eq!(e.get_password().expect("read"), "sk-test-1234");
        e.delete_credential().expect("delete");
        assert!(matches!(e.get_password(), Err(keyring::Error::NoEntry)));
    }

    #[test]
    fn lua_addon_is_mirrored_from_the_project() {
        let dir = std::env::temp_dir().join(format!("mallet_lua_{}", std::process::id()));
        let root = dir.join("proj");
        let game = dir.join("game");
        std::fs::create_dir_all(root.join("lua/autorun/server")).unwrap();
        std::fs::write(root.join("lua/autorun/server/a.lua"), "print(1)").unwrap();
        std::fs::write(root.join("lua/autorun/server/notes.txt"), "x").unwrap();
        let n = install_lua_addon(&game, &root, "test_map").unwrap();
        assert_eq!(n, 1);
        assert!(game
            .join("addons/mallet_test_map/lua/autorun/server/a.lua")
            .is_file());
        assert!(!game
            .join("addons/mallet_test_map/lua/autorun/server/notes.txt")
            .exists());
        assert!(game.join("addons/mallet_test_map/addon.txt").is_file());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
