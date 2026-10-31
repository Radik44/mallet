//! The assistant through a locally installed Claude Code (`claude -p`),
//! which runs on the user's subscription and needs no API key.
//!
//! The main way (`run_stream`): one `claude -p` per request with the editor's
//! tools served over MCP by this very executable (`mcp_bridge`), the reply
//! streamed line by line (`stream-json`) and every tool call relayed to the
//! webview as it happens. The old way (`chat`), kept for Claude Code versions
//! without streaming or MCP flags: one process per model step, the model
//! answers with one JSON object naming the calls it wants.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};

use crate::assistant::{ChatRequest, ChatResponse};
use crate::mcp_bridge::{Bridge, Sink};

/// Where `claude` is, if installed: the override, the native installer's
/// folder, npm's global folder (run through node), then PATH.
pub fn find_cli() -> Option<PathBuf> {
    if let Ok(p) = std::env::var("GME_CLAUDE_CLI") {
        let p = PathBuf::from(p);
        return p.is_file().then_some(p);
    }
    let mut candidates = Vec::new();
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let home = PathBuf::from(home);
        candidates.push(home.join(".local").join("bin").join("claude.exe"));
        candidates.push(home.join(".local").join("bin").join("claude"));
    }
    // npm's global folder: the package ships a native binary (newer) or cli.js (older).
    let npm_package = |dir: PathBuf| {
        let pkg = dir
            .join("node_modules")
            .join("@anthropic-ai")
            .join("claude-code");
        [pkg.join("bin").join("claude.exe"), pkg.join("cli.js")]
    };
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidates.extend(npm_package(PathBuf::from(appdata).join("npm")));
    }
    if let Some(path) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path) {
            candidates.push(dir.join("claude.exe"));
            candidates.extend(npm_package(dir.clone()));
            candidates.push(dir.join("claude.cmd"));
            candidates.push(dir.join("claude"));
        }
    }
    candidates.into_iter().find(|p| p.is_file())
}

/// Installs Claude Code with Anthropic's native installer (no Node.js), as a
/// game's setup brings DirectX: PowerShell runs the official script, the
/// result is where `claude` ended up. Takes a minute or so.
pub fn install() -> Result<PathBuf, String> {
    let mut cmd = Command::new("powershell");
    cmd.args([
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://claude.ai/install.ps1 | iex",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("не удалось запустить PowerShell: {e}"))?;
    if !out.status.success() {
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&out.stdout),
            String::from_utf8_lossy(&out.stderr)
        );
        let tail: String = text
            .trim()
            .chars()
            .rev()
            .take(300)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        return Err(format!(
            "установщик Claude Code завершился с ошибкой: {tail}"
        ));
    }
    find_cli().ok_or_else(|| "Claude Code установлен, но не найден в ожидаемой папке".to_string())
}

/// Opens a console with `claude` in it: its first run asks to sign in and
/// sends the person to the browser; after that the editor runs on the subscription.
pub fn open_login(cli: &Path) -> Result<(), String> {
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", "start", "Claude Code", "cmd", "/k"])
        .arg(cli);
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("не удалось открыть окно входа: {e}"))
}

/// The command for a CLI path: scripts go through their interpreter.
fn command_for(cli: &Path) -> Command {
    let ext = cli
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let mut cmd = match ext.as_str() {
        "js" => {
            let mut c = Command::new("node");
            c.arg(cli);
            c
        }
        "py" => {
            let mut c = Command::new("python");
            c.arg("-I").arg(cli);
            c
        }
        "cmd" | "bat" => {
            let mut c = Command::new("cmd");
            c.arg("/C").arg(cli);
            c
        }
        _ => Command::new(cli),
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// What the model must answer with instead of tool_use blocks.
const PROTOCOL: &str = r#"

ФОРМАТ ОТВЕТА. Функции-инструменты тебе недоступны напрямую: ты отвечаешь строго одним JSON-объектом без markdown и без текста вокруг:
{"text": "что ты делаешь или итоговый отчёт", "calls": [{"name": "имя_инструмента", "input": {…}}]}
Поле calls - вызовы, которые редактор выполнит по порядку и пришлёт результаты следующим сообщением как «Результаты инструментов»; после результатов отвечай тем же форматом. Когда всё сделано, отвечай с пустым calls и отчётом в text. Никогда не пиши в файлы и не запускай команды сам: только через calls. Инструменты (имя - описание - схема входа JSON):
"#;

fn tools_text(tools: &serde_json::Value) -> String {
    let mut out = String::new();
    if let Some(list) = tools.as_array() {
        for t in list {
            out.push_str(&format!(
                "- {} - {} - {}\n",
                t["name"].as_str().unwrap_or("?"),
                t["description"].as_str().unwrap_or(""),
                serde_json::to_string(&t["input_schema"]).unwrap_or_default()
            ));
        }
    }
    out
}

/// The text to send this step: the user's request, or the tool results of
/// the last assistant step, or (without a session to resume) the whole
/// conversation so far.
/// A tool result's content as text; pictures go to files the CLI may read.
fn result_text(content: &serde_json::Value, cwd: &Path) -> String {
    match content {
        serde_json::Value::String(s) => s.clone(),
        serde_json::Value::Array(blocks) => blocks
            .iter()
            .enumerate()
            .filter_map(|(i, b)| match b["type"].as_str() {
                Some("text") => b["text"].as_str().map(str::to_string),
                Some("image") => {
                    use base64::Engine;
                    let data = b["source"]["data"].as_str().unwrap_or("");
                    let ext = if b["source"]["media_type"].as_str() == Some("image/png") { "png" } else { "jpg" };
                    let stamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0);
                    let path = cwd.join(format!("shot_{stamp}_{i}.{ext}"));
                    match base64::engine::general_purpose::STANDARD.decode(data) {
                        Ok(bytes) if std::fs::write(&path, &bytes).is_ok() => Some(format!(
                            "Снимок сохранён в файл {}: прочитай его инструментом Read, чтобы увидеть.",
                            path.display().to_string().replace('\\', "/")
                        )),
                        _ => Some("(снимок не удалось сохранить в файл)".into()),
                    }
                }
                _ => None,
            })
            .collect::<Vec<_>>()
            .join("\n"),
        _ => String::new(),
    }
}

fn prompt_for(messages: &[serde_json::Value], resume: bool, cwd: &Path) -> String {
    let render = |m: &serde_json::Value| -> String {
        match &m["content"] {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Array(blocks) => blocks
                .iter()
                .map(|b| match b["type"].as_str() {
                    Some("text") => b["text"].as_str().unwrap_or("").to_string(),
                    Some("tool_use") => format!(
                        "вызов {} {}",
                        b["name"].as_str().unwrap_or(""),
                        serde_json::to_string(&b["input"]).unwrap_or_default()
                    ),
                    Some("tool_result") => format!(
                        "[{}] {}{}",
                        b["tool_use_id"].as_str().unwrap_or(""),
                        if b["is_error"].as_bool().unwrap_or(false) {
                            "ОШИБКА: "
                        } else {
                            ""
                        },
                        result_text(&b["content"], cwd)
                    ),
                    _ => String::new(),
                })
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("\n"),
            _ => String::new(),
        }
    };
    let Some(last) = messages.last() else {
        return String::new();
    };
    let last_has_results = last["content"]
        .as_array()
        .map(|a| a.iter().any(|b| b["type"] == "tool_result"))
        .unwrap_or(false);
    if resume {
        if last_has_results {
            return format!("Результаты инструментов:\n{}", render(last));
        }
        return render(last);
    }
    // No session to continue: replay the conversation.
    let mut out = String::new();
    for m in messages {
        let who = if m["role"] == "assistant" {
            "Ассистент"
        } else if m["content"]
            .as_array()
            .map(|a| a.iter().any(|b| b["type"] == "tool_result"))
            .unwrap_or(false)
        {
            "Результаты инструментов"
        } else {
            "Пользователь"
        };
        out.push_str(&format!("{who}:\n{}\n\n", render(m)));
    }
    out
}

#[derive(Deserialize, Default)]
struct Reply {
    #[serde(default)]
    text: String,
    #[serde(default)]
    calls: Vec<Call>,
}

#[derive(Deserialize)]
struct Call {
    name: String,
    #[serde(default)]
    input: serde_json::Value,
}

/// The model's JSON out of its text: fences and chatter around it are tolerated.
fn parse_reply(text: &str) -> Reply {
    let t = text.trim();
    let candidates = [t.to_string(), {
        let start = t.find('{');
        let end = t.rfind('}');
        match (start, end) {
            (Some(a), Some(b)) if b > a => t[a..=b].to_string(),
            _ => String::new(),
        }
    }];
    for c in candidates.iter().filter(|c| !c.is_empty()) {
        if let Ok(r) = serde_json::from_str::<Reply>(c) {
            return r;
        }
    }
    Reply {
        text: t.to_string(),
        calls: Vec::new(),
    }
}

/// One streamed request: the user's text, the system prompt, the tools the
/// MCP server offers, and the CLI session to continue.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequest {
    pub prompt: String,
    pub system: String,
    pub model: String,
    pub tools: Value,
    pub resume: Option<String>,
}

/// The living `claude -p` of a conversation: requests go in as `stream-json`
/// user messages, its reader thread turns the output into events, and the MCP
/// server (this exe) lives as long as it does - a follow-up skips the start-up.
struct LiveProcess {
    child: Child,
    stdin: std::process::ChildStdin,
    /// What it was started with; a change (the language, the model) restarts it.
    system: String,
    model: String,
}

/// What the reader thread reports to the request waiting on it.
enum TurnEnd {
    Done,
    Exited(String),
}

/// The streamed runs' state: the bridge (started on first use), the living
/// process, where its events go, and the CLI session to continue after a stop.
#[derive(Default)]
pub struct McpRuns {
    bridge: Mutex<Option<Arc<Bridge>>>,
    proc: Mutex<Option<LiveProcess>>,
    turns: Mutex<Option<std::sync::mpsc::Receiver<TurnEnd>>>,
    sink: Arc<Mutex<Option<Sink>>>,
    last_session: Arc<Mutex<Option<String>>>,
}

impl McpRuns {
    pub fn bridge(&self) -> Result<Arc<Bridge>, String> {
        let mut slot = self.bridge.lock().expect("bridge");
        if let Some(b) = slot.as_ref() {
            return Ok(b.clone());
        }
        let b = Bridge::start().map_err(|e| format!("MCP bridge: {e}"))?;
        *slot = Some(b.clone());
        Ok(b)
    }

    /// Ends the process; the bridge answers its waiting calls with an error.
    /// The CLI session is kept: the next request resumes it in a new process.
    pub fn stop(&self) {
        if let Some(mut p) = self.proc.lock().expect("proc").take() {
            let _ = p.child.kill();
        }
        if let Some(b) = self.bridge.lock().expect("bridge").as_ref() {
            b.end();
        }
    }

    /// A new conversation: the process and its session go.
    pub fn reset(&self) {
        self.stop();
        *self.last_session.lock().expect("session") = None;
    }

    pub fn alive(&self) -> bool {
        self.proc.lock().expect("proc").is_some()
    }
}

/// What a `stream-json` line turned into; `finished` once the result came.
#[derive(Default)]
pub struct StreamState {
    pub finished: bool,
    pub session: Option<String>,
}

fn strip_mcp(name: &str) -> &str {
    name.strip_prefix("mcp__mallet__").unwrap_or(name)
}

/// Translates one line of `claude -p --output-format stream-json
/// --include-partial-messages` into the editor's events: the session id,
/// content blocks as they stream (tool names without the MCP prefix), and the
/// final result. Whole `assistant` messages are skipped: their text already
/// came in pieces.
pub fn translate_line(line: &str, st: &mut StreamState) -> Vec<Value> {
    let Ok(v) = serde_json::from_str::<Value>(line.trim()) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    let is_result =
        v["type"] == "result" || (v.get("duration_api_ms").is_some() && v.get("usage").is_some());
    if is_result {
        st.finished = true;
        let u = &v["usage"];
        let input = u["input_tokens"].as_u64().unwrap_or(0)
            + u["cache_read_input_tokens"].as_u64().unwrap_or(0)
            + u["cache_creation_input_tokens"].as_u64().unwrap_or(0);
        let subtype = v["subtype"].as_str().unwrap_or("success");
        out.push(json!({
            "kind": "done",
            "isError": v["is_error"].as_bool().unwrap_or(false) || subtype != "success",
            "subtype": subtype,
            "result": v["result"].as_str().unwrap_or(""),
            "sessionId": v["session_id"],
            "inputTokens": input,
            "outputTokens": u["output_tokens"].as_u64().unwrap_or(0),
            "numTurns": v["num_turns"].as_u64().unwrap_or(0),
            "costUsd": v["total_cost_usd"],
        }));
        return out;
    }
    match v["type"].as_str().unwrap_or("") {
        "system" => {
            if v["subtype"] == "init" {
                if let Some(id) = v["session_id"].as_str() {
                    st.session = Some(id.to_string());
                    out.push(json!({ "kind": "session", "id": id }));
                }
            }
        }
        "stream_event" => {
            let e = &v["event"];
            match e["type"].as_str() {
                Some("content_block_start") => {
                    let b = &e["content_block"];
                    out.push(json!({
                        "kind": "block_start",
                        "type": b["type"],
                        "name": b["name"].as_str().map(strip_mcp),
                    }));
                }
                Some("content_block_delta") => {
                    let d = &e["delta"];
                    match d["type"].as_str() {
                        Some("text_delta") => {
                            out.push(json!({ "kind": "text", "text": d["text"] }))
                        }
                        Some("input_json_delta") => {
                            out.push(json!({ "kind": "json", "text": d["partial_json"] }))
                        }
                        _ => {}
                    }
                }
                Some("content_block_stop") => out.push(json!({ "kind": "block_stop" })),
                _ => {}
            }
        }
        _ => {}
    }
    out
}

/// One request through Claude Code with the editor's tools over MCP; events
/// go to `send` as the reply streams, tool calls included (the webview answers
/// them through the bridge). The process stays for the next request.
pub fn run_stream(req: &RunRequest, cli: &Path, runs: &McpRuns, send: Sink) -> Result<(), String> {
    let bridge = runs.bridge()?;
    bridge.begin(req.tools.clone(), send.clone());
    *runs.sink.lock().expect("sink") = Some(send);
    let r = run_turn(req, cli, runs, &bridge);
    *runs.sink.lock().expect("sink") = None;
    bridge.end();
    r
}

fn run_turn(req: &RunRequest, cli: &Path, runs: &McpRuns, bridge: &Bridge) -> Result<(), String> {
    // A process started with another prompt or model (the language changed) is replaced.
    {
        let mut slot = runs.proc.lock().expect("proc");
        if slot
            .as_ref()
            .is_some_and(|p| p.system != req.system || p.model != req.model)
        {
            if let Some(mut p) = slot.take() {
                let _ = p.child.kill();
            }
        }
    }
    ensure_process(req, cli, runs, bridge)?;
    let line = format!(
        "{}\n",
        json!({ "type": "user", "message": { "role": "user", "content": [{ "type": "text", "text": req.prompt }] } })
    );
    let written = {
        let mut slot = runs.proc.lock().expect("proc");
        match slot.as_mut() {
            Some(p) => p
                .stdin
                .write_all(line.as_bytes())
                .and_then(|_| p.stdin.flush())
                .is_ok(),
            None => false,
        }
    };
    if !written {
        // It went away quietly between requests: once more from scratch, resuming the session.
        runs.stop();
        ensure_process(req, cli, runs, bridge)?;
        let mut slot = runs.proc.lock().expect("proc");
        let p = slot.as_mut().ok_or("Claude Code не запустился")?;
        p.stdin
            .write_all(line.as_bytes())
            .and_then(|_| p.stdin.flush())
            .map_err(|e| format!("не удалось передать запрос Claude Code: {e}"))?;
    }
    let turns = runs.turns.lock().expect("turns");
    let rx = turns.as_ref().ok_or("Claude Code не запустился")?;
    match rx.recv_timeout(Duration::from_secs(60 * 60)) {
        Ok(TurnEnd::Done) => Ok(()),
        Ok(TurnEnd::Exited(err)) => {
            drop(turns);
            *runs.proc.lock().expect("proc") = None;
            Err(err)
        }
        Err(_) => {
            drop(turns);
            runs.stop();
            Err("Claude Code не ответил за час".into())
        }
    }
}

/// Starts the process when none lives: the MCP server is this exe, the
/// reader thread forwards its events and signals each turn's end.
fn ensure_process(
    req: &RunRequest,
    cli: &Path,
    runs: &McpRuns,
    bridge: &Bridge,
) -> Result<(), String> {
    if runs.alive() {
        return Ok(());
    }
    let cwd = std::env::temp_dir().join("mallet-assistant");
    let _ = std::fs::create_dir_all(&cwd);
    let cwd_slash = cwd.display().to_string().replace('\\', "/");
    let exe = std::env::current_exe().map_err(|e| format!("current exe: {e}"))?;
    let mcp = json!({
        "mcpServers": {
            "mallet": { "type": "stdio", "command": exe, "args": ["--mcp-bridge", bridge.addr(), bridge.token()] }
        }
    });
    let model = if req.model.contains("opus") {
        "opus"
    } else if req.model.contains("haiku") {
        "haiku"
    } else {
        "sonnet"
    };
    let mut cmd = command_for(cli);
    cmd.args([
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--model",
        model,
        "--strict-mcp-config",
    ])
    .arg("--mcp-config")
    .arg(mcp.to_string())
    .arg("--system-prompt")
    .arg(&req.system)
    .arg("--tools")
    .arg("Read")
    .arg("--allowedTools")
    .arg(format!("mcp__mallet,Read({cwd_slash}/**)"));
    // After a stop or a crash the same CLI session goes on in the new process.
    let resume = runs
        .last_session
        .lock()
        .expect("session")
        .clone()
        .or_else(|| req.resume.clone());
    if let Some(id) = &resume {
        cmd.arg("--resume").arg(id);
    }
    // Tool calls wait for the user's confirmations; the MCP server is this exe and starts at once.
    cmd.env("MCP_TOOL_TIMEOUT", "1800000")
        .env("MCP_TIMEOUT", "60000");
    cmd.current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("не удалось запустить {}: {e}", cli.display()))?;
    let stdin = child.stdin.take().ok_or("нет stdin у Claude Code")?;
    let stdout = child.stdout.take().ok_or("нет stdout у Claude Code")?;
    let stderr = child.stderr.take();
    let err_buf = Arc::new(Mutex::new(String::new()));
    if let Some(mut stderr) = stderr {
        let buf = err_buf.clone();
        std::thread::spawn(move || {
            let mut s = String::new();
            let _ = stderr.read_to_string(&mut s);
            *buf.lock().expect("stderr") = s;
        });
    }
    let (tx, rx) = std::sync::mpsc::channel();
    let sink = runs.sink.clone();
    let session = runs.last_session.clone();
    std::thread::Builder::new()
        .name("claude-reader".into())
        .spawn(move || {
            let mut st = StreamState::default();
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                for ev in translate_line(&line, &mut st) {
                    if ev["kind"] == "session" {
                        *session.lock().expect("session") = ev["id"].as_str().map(str::to_string);
                    }
                    if let Some(s) = sink.lock().expect("sink").clone() {
                        s(ev);
                    }
                }
                if st.finished {
                    st.finished = false;
                    let _ = tx.send(TurnEnd::Done);
                }
            }
            // The process ended: say why, if it said.
            std::thread::sleep(Duration::from_millis(100));
            let stderr = err_buf.lock().expect("stderr").clone();
            let hint = if stderr.contains("unknown option") || stderr.contains("unknown argument") {
                " (устаревшая версия Claude Code: обновите её командой npm install -g @anthropic-ai/claude-code)"
            } else if stderr.to_lowercase().contains("log in") || stderr.to_lowercase().contains("login") {
                " (требуется вход: выполните claude в терминале)"
            } else if stderr.trim().is_empty() {
                " (остановлен)"
            } else {
                ""
            };
            let tail: String = stderr.trim().chars().rev().take(400).collect::<Vec<_>>().into_iter().rev().collect();
            let _ = tx.send(TurnEnd::Exited(format!("Claude Code завершился{hint}: {tail}")));
        })
        .map_err(|e| format!("поток чтения: {e}"))?;
    *runs.turns.lock().expect("turns") = Some(rx);
    *runs.proc.lock().expect("proc") = Some(LiveProcess {
        child,
        stdin,
        system: req.system.clone(),
        model: req.model.clone(),
    });
    Ok(())
}

/// The CLI's own session, continued between steps of one conversation.
#[derive(Default)]
pub struct CliSession {
    id: Mutex<Option<String>>,
    counter: Mutex<u64>,
}

impl CliSession {
    pub fn reset(&self) {
        *self.id.lock().expect("session") = None;
    }
}

pub fn chat(req: &ChatRequest, cli: &Path, session: &CliSession) -> Result<ChatResponse, String> {
    let messages = req.messages.as_array().cloned().unwrap_or_default();
    // A conversation that starts afresh drops the old CLI session.
    if messages.len() <= 1 {
        session.reset();
    }
    let resume = session.id.lock().expect("session").clone();
    // An empty folder as the working directory: no project files, no CLAUDE.md;
    // screenshots for the model are written there.
    let cwd = std::env::temp_dir().join("mallet-assistant");
    let _ = std::fs::create_dir_all(&cwd);
    let prompt = prompt_for(&messages, resume.is_some(), &cwd);
    let system = format!("{}{}{}", req.system, PROTOCOL, tools_text(&req.tools));
    let model = if req.model.contains("opus") {
        "opus"
    } else if req.model.contains("haiku") {
        "haiku"
    } else {
        "sonnet"
    };
    let mut cmd = command_for(cli);
    // Only Read, and only inside the scratch folder: that is how the model
    // looks at screenshots; the folder is otherwise empty.
    let cwd_slash = cwd.display().to_string().replace('\\', "/");
    cmd.args([
        "-p",
        "--output-format",
        "json",
        "--max-turns",
        "3",
        "--model",
        model,
    ])
    .arg("--system-prompt")
    .arg(&system)
    .arg("--tools")
    .arg("Read")
    .arg("--allowedTools")
    .arg(format!("Read({cwd_slash}/**)"));
    if let Some(id) = &resume {
        cmd.arg("--resume").arg(id);
    }
    cmd.current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("не удалось запустить {}: {e}", cli.display()))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(prompt.as_bytes());
    }
    // The CLI gets five minutes; a hung one is ended.
    let started = std::time::Instant::now();
    let output = loop {
        match child.try_wait() {
            Ok(Some(_)) => break child.wait_with_output().map_err(|e| e.to_string())?,
            Ok(None) if started.elapsed() > Duration::from_secs(300) => {
                let _ = child.kill();
                return Err("Claude Code не ответил за пять минут".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return Err(e.to_string()),
        }
    };
    let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
    if !output.status.success() && stdout.trim().is_empty() {
        let hint = if stderr.contains("unknown option") {
            " (устаревшая версия Claude Code: обновите её командой npm install -g @anthropic-ai/claude-code)"
        } else if stderr.to_lowercase().contains("log in")
            || stderr.to_lowercase().contains("login")
        {
            " (требуется вход: выполните claude в терминале)"
        } else {
            ""
        };
        return Err(format!(
            "Claude Code завершился с ошибкой{hint}: {}",
            stderr.trim().chars().take(400).collect::<String>()
        ));
    }
    // The last JSON object on stdout is the result (the CLI may print lines before it).
    let json: serde_json::Value = stdout
        .lines()
        .rev()
        .find_map(|l| serde_json::from_str(l.trim()).ok())
        .or_else(|| serde_json::from_str(stdout.trim()).ok())
        .ok_or_else(|| {
            format!(
                "нераспознанный ответ Claude Code: {}",
                stdout.trim().chars().take(300).collect::<String>()
            )
        })?;
    if json["is_error"].as_bool().unwrap_or(false) {
        let msg = json["result"].as_str().unwrap_or("ошибка");
        let hint = if msg.to_lowercase().contains("log in")
            || msg.to_lowercase().contains("not logged")
            || msg.to_lowercase().contains("authentication")
        {
            " (требуется вход: выполните claude в терминале)"
        } else {
            ""
        };
        return Err(format!(
            "Claude Code{hint}: {}",
            msg.chars().take(400).collect::<String>()
        ));
    }
    if let Some(id) = json["session_id"].as_str() {
        *session.id.lock().expect("session") = Some(id.to_string());
    }
    let reply = parse_reply(json["result"].as_str().unwrap_or(""));
    let mut content = Vec::new();
    if !reply.text.trim().is_empty() {
        content.push(serde_json::json!({ "type": "text", "text": reply.text }));
    }
    let mut counter = session.counter.lock().expect("counter");
    for c in &reply.calls {
        *counter += 1;
        content.push(serde_json::json!({
            "type": "tool_use",
            "id": format!("cli_{}_{}", counter, c.name),
            "name": c.name,
            "input": if c.input.is_object() { c.input.clone() } else { serde_json::json!({}) },
        }));
    }
    Ok(ChatResponse {
        content: serde_json::Value::Array(content),
        stop_reason: if reply.calls.is_empty() {
            "end_turn".into()
        } else {
            "tool_use".into()
        },
        input_tokens: json["usage"]["input_tokens"].as_u64().unwrap_or(0),
        output_tokens: json["usage"]["output_tokens"].as_u64().unwrap_or(0),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replies_are_parsed_out_of_fences_and_chatter() {
        let r = parse_reply("Вот:\n```json\n{\"text\": \"делаю\", \"calls\": [{\"name\": \"create_brush\", \"input\": {\"min\": [0,0,0], \"max\": [1,1,1]}}]}\n```");
        assert_eq!(r.text, "делаю");
        assert_eq!(r.calls.len(), 1);
        assert_eq!(r.calls[0].name, "create_brush");
        let plain = parse_reply("Готово, комната стоит.");
        assert_eq!(plain.text, "Готово, комната стоит.");
        assert!(plain.calls.is_empty());
    }

    #[test]
    fn prompts_carry_results_when_resuming_and_the_whole_talk_otherwise() {
        let msgs = vec![
            serde_json::json!({"role": "user", "content": "сделай комнату"}),
            serde_json::json!({"role": "assistant", "content": [{"type": "tool_use", "id": "cli_1_create_brush", "name": "create_brush", "input": {}}]}),
            serde_json::json!({"role": "user", "content": [{"type": "tool_result", "tool_use_id": "cli_1_create_brush", "content": "браш id 7"}]}),
        ];
        let p = prompt_for(&msgs, true, Path::new("C:/tmp"));
        assert!(p.starts_with("Результаты инструментов:"));
        assert!(p.contains("[cli_1_create_brush] браш id 7"));
        let full = prompt_for(&msgs, false, Path::new("C:/tmp"));
        assert!(full.contains("Пользователь:\nсделай комнату"));
        assert!(full.contains("Ассистент:\nвызов create_brush"));
    }
}

#[cfg(test)]
mod stream_tests {
    use super::*;

    #[test]
    fn stream_json_lines_become_editor_events() {
        let mut st = StreamState::default();
        let init = translate_line(
            r#"{"type":"system","subtype":"init","session_id":"s-1","tools":["mcp__mallet__create_brush"]}"#,
            &mut st,
        );
        assert_eq!(init[0]["kind"], "session");
        assert_eq!(st.session.as_deref(), Some("s-1"));
        let start = translate_line(
            r#"{"type":"stream_event","event":{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tu","name":"mcp__mallet__create_brush","input":{}}}}"#,
            &mut st,
        );
        assert_eq!(start[0]["kind"], "block_start");
        assert_eq!(start[0]["name"], "create_brush");
        let text = translate_line(
            r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Привет"}}}"#,
            &mut st,
        );
        assert_eq!(text[0]["text"], "Привет");
        assert!(translate_line(
            r#"{"type":"assistant","message":{"content":[{"type":"text","text":"Привет"}]}}"#,
            &mut st
        )
        .is_empty());
        assert!(!st.finished);
        let done = translate_line(
            r#"{"duration_api_ms":2792,"stop_reason":"end_turn","session_id":"s-1","total_cost_usd":0.0007,"usage":{"input_tokens":2,"cache_read_input_tokens":3262,"cache_creation_input_tokens":3334,"output_tokens":5},"type":"result","subtype":"success","is_error":false,"num_turns":1,"result":"Привет"}"#,
            &mut st,
        );
        assert!(st.finished);
        assert_eq!(done[0]["kind"], "done");
        assert_eq!(done[0]["isError"], false);
        assert_eq!(done[0]["inputTokens"], 6598);
        assert_eq!(done[0]["outputTokens"], 5);
        assert_eq!(done[0]["result"], "Привет");
        let mut st2 = StreamState::default();
        let bad = translate_line(
            r#"{"type":"result","subtype":"error_max_turns","is_error":true,"result":"","usage":{},"session_id":"s"}"#,
            &mut st2,
        );
        assert_eq!(bad[0]["isError"], true);
        assert_eq!(bad[0]["subtype"], "error_max_turns");
    }
}
