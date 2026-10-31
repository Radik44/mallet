//! Desktop shell: owns the game content, serves textures to the webview and
//! exposes the handful of commands the phase 1 viewer needs.

mod assets;
mod assistant;
mod assistant_cli;
mod bridge;
mod compile;
mod imports;
mod mcp_bridge;
mod pack;
mod state;
mod workshop;

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::Manager;

use state::{AppState, ClassDef, ClassEntry, ClassInfo, ContentStatus, MaterialInfo};

#[derive(Serialize)]
struct AppInfo {
    tauri: String,
    webview: String,
    os: String,
    profile: String,
    /// `GME_AUTOLOAD`: a VMF to open at startup (development and tests).
    autoload: Option<String>,
    /// `GME_AUTOSHOT`: where to save a PNG of the first rendered frame.
    autoshot: Option<String>,
    /// `GME_AUTOSELECT`: `all`, `entities`, `center` or a solid id to select before the shot.
    autoselect: Option<String>,
    /// `GME_AUTOCAM`: `x,y,z,yaw,pitch` camera placement for the shot.
    autocam: Option<String>,
    /// `GME_AUTOMOVE`: `dx,dy,dz` applied to the selection before the shot.
    automove: Option<String>,
    /// `GME_AUTOSAVE`: path to save the edited map to after the shot.
    autosave: Option<String>,
    /// `GME_AUTOBLOCK`: `x0,y0,z0,x1,y1,z1` creates a brush before the shot.
    autoblock: Option<String>,
    /// `GME_AUTODELETE`: delete the selection before the shot.
    autodelete: Option<String>,
    /// `GME_AUTOROTATE`: degrees to turn the selection about Z through its centre.
    autorotate: Option<String>,
    /// `GME_AUTOSCALE`: `fx,fy,fz` factors applied to the selection about its minimum corner.
    autoscale: Option<String>,
    /// `GME_AUTOTEXTURE`: material applied to every face of the selected brushes.
    autotexture: Option<String>,
    /// `GME_AUTOENTITY`: `classname,x,y,z` creates a point entity.
    autoentity: Option<String>,
    /// `GME_AUTOKEY`: `key=value;key=value` set on the selected entity (empty value removes).
    autokey: Option<String>,
    /// `GME_AUTOOUTPUT`: `output,target,input,parameter,delay,times` added to the selected entity.
    autooutput: Option<String>,
    /// `GME_AUTOHIDE`: hide the selection.
    autohide: Option<String>,
    /// `GME_AUTOGROUP`: group the selection.
    autogroup: Option<String>,
    /// `GME_AUTOVISGROUP`: create a visgroup with this name from the selection.
    autovisgroup: Option<String>,
    /// `GME_AUTOCLIP`: `nx,ny,nz,dist,keep` clips the selection (keep 0 both, 1 front, 2 back).
    autoclip: Option<String>,
    /// `GME_AUTOCORDON`: `x0,y0,z0,x1,y1,z1` sets an active cordon.
    autocordon: Option<String>,
    /// `GME_AUTOHOLLOW`: wall thickness; hollows the selection.
    autohollow: Option<String>,
    /// `GME_AUTOCARVE`: carve with the selection.
    autocarve: Option<String>,
    /// `GME_AUTOVERTEX`: `fx,fy,fz,tx,ty,tz[;...]` moves vertices of the selected brushes.
    autovertex: Option<String>,
    /// `GME_AUTOPRIMITIVE`: `shape,sides,x0,y0,z0,x1,y1,z1[,axis]` creates a primitive.
    autoprimitive: Option<String>,
    /// `GME_AUTOTIE`: classname; ties the selected brushes to an entity.
    autotie: Option<String>,
    /// `GME_AUTOWORLD`: moves the selected brush entities to the world.
    autoworld: Option<String>,
    /// `GME_AUTOCOLLAPSE=1`: Collapse Instance on the selected func_instance.
    autocollapse: Option<String>,
    /// `GME_AUTOFACE`: `key=value;...` face edit applied to every face of the selection.
    autoface: Option<String>,
    /// `GME_AUTOPROBLEMS`: runs Check for Problems and logs the findings.
    autoproblems: Option<String>,
    /// `GME_AUTOFIX=1`: after `GME_AUTOCOMPILE`, waits for the build and logs what the auto-analysis fixed.
    autofix: Option<String>,
    /// `GME_AUTOISOLATE=1`: isolates the first brush, checks the rest is hidden, shows all, then selects similar.
    autoisolate: Option<String>,
    /// `GME_AUTOCLONE`: `dx,dy,dz` clones the selection, then pastes the copied snippet.
    autoclone: Option<String>,
    /// `GME_AUTOCOMPILE`: `vbsp[,vvis[,vrad]]` compiles the saved map (after `GME_AUTOSAVE`).
    autocompile: Option<String>,
    /// `GME_AUTOPACK=1`: after the compile, analyses and packs custom content.
    autopack: Option<String>,
    /// `GME_AUTOPREFAB=<name>`: saves the selection as a prefab, then inserts it.
    autoprefab: Option<String>,
    /// `GME_AUTOVIEWMODE=textured|flat|wireframe`: 3D view mode before the shot.
    autoviewmode: Option<String>,
    autoperf: Option<String>,
    /// `GME_AUTOBRIDGE=1`: after the compile, starts the game, waits for the bridge, builds cubemaps, ends the game.
    autobridge: Option<String>,
    /// `GME_AUTOTOUR=1`: starts the tour and logs where every step's target is.
    autotour: Option<String>,
    /// `GME_AUTOLANDSCAPE=w,l,nx,ny,power`: the landscape wizard in front of the camera.
    autolandscape: Option<String>,
    /// `GME_AUTOSOUND=1`: a tone through the sound editor's export and an ambient_generic.
    autosound: Option<String>,
    /// `GME_AUTOPAINT=1`: a painted texture through the painter's export, onto the selection.
    autopaint: Option<String>,
    /// `GME_AUTOASSIST=<request>`: the assistant with that request (a canned reply without a key).
    autoassist: Option<String>,
    /// `GME_AUTOJOURNEY=1`: logs the journey bar's stages and the project file.
    autojourney: Option<String>,
    /// `GME_AUTOWORKSHOP=pack`: after the compile, lays out the addon folder and packs it with gmad (no publish).
    autoworkshop: Option<String>,
    /// `GME_AUTOSCULPT=mode,x,y,z,radius,amount[,dabs]`: brush dabs along +x from that point.
    autosculpt: Option<String>,
    /// `GME_AUTOSATELLITE=3d|top|front|side`: opens that view in a satellite window and waits for it.
    autosatellite: Option<String>,
    /// `GME_AUTODROP=material|model|prefab,<name>,<view>,<fx>,<fy>`: drops an asset at that spot of a view.
    autodrop: Option<String>,
    /// `GME_AUTOPLACE=<model>,<dx>,<wheel>`: a prop row dragged over the 3D view with the mouse.
    autoplace: Option<String>,
    /// `GME_AUTOSCATTER=<model>,<dx>,<spacing>`: the prop brush dragged over the 3D view.
    autoscatter: Option<String>,
    /// `GME_AUTOMEASURE=1`: the ruler dragged in the top view and clicked twice in 3D.
    automeasure: Option<String>,
    /// `GME_AUTOSYMMETRY=1`: mirrors the selection across X=0 and places an entity with symmetry on.
    autosymmetry: Option<String>,
    automatpreview: Option<String>,
    automodelghost: Option<String>,
    /// `GME_AUTODOM=<css selector>`: logs the size and key styles of the first matches (layout debugging).
    autodom: Option<String>,
    /// `GME_AUTOPANEL=<kind>`: opens that panel before the DOM probe and the shot.
    autopanel: Option<String>,
    /// `GME_AUTOPATH=<class>,<count>`: places a chain of path nodes along X.
    autopath: Option<String>,
    /// `GME_AUTOIMPORT=<png or tga path>`: imports the picture as a material of the map's project.
    autoimport: Option<String>,
    /// `GME_AUTOALIGN=<x|y|z>,<min|center|max|grid>`: aligns the selected objects.
    autoalign: Option<String>,
    /// `GME_AUTOARRAY=<count>,<dx>,<dy>,<dz>,<yaw>`: multiplies the selection like Paste Special.
    autoarray: Option<String>,
    /// `GME_AUTOEXTRA=<command>`: expert-mode command run after `GME_AUTOCOMPILE`'s tools.
    autoextra: Option<String>,
    /// `GME_AUTOOVERLAY=<corner>,<dx>,<dy>,<dz>`: moves a corner of the selected info_overlay.
    autooverlay: Option<String>,
    /// `GME_AUTOPICK=<key>,<entity id>`: the eyedropper fills `key` of the selection with that entity's name.
    autopick: Option<String>,
    /// `GME_AUTOEXIT`: quit once the autotest sequence (and any compile) is done.
    autoexit: Option<String>,
    /// `GME_AUTODISP`: `power,radius,amount` makes displacements of the selection's top faces and sculpts one.
    autodisp: Option<String>,
    /// `GME_AUTODISPOP=smooth,invert,subdivide`: runs these on the `GME_AUTODISP` face in order.
    autodispop: Option<String>,
    /// `GME_AUTOPROP`: `model,x,y,z` places a prop_static with that model.
    autoprop: Option<String>,
    /// `GME_AUTOWORLDKEY`: `key=value;...` edits worldspawn keys (empty value removes).
    autoworldkey: Option<String>,
    /// `GME_AUTOREPLACE`: `find,replace[,selection]` replaces a material.
    autoreplace: Option<String>,
    /// `GME_AUTOALPHA`: `radius,amount` paints alpha on the selection's first displacement.
    autoalpha: Option<String>,
    /// `GME_AUTOSEW`: sews the displacements of the selection.
    autosew: Option<String>,
    /// `GME_AUTOHELPERS`: logs the helper overlay (connection lines, cones) of the selection.
    autohelpers: Option<String>,
    /// `GME_AUTONEW`: `w,l,h[,indoor|outdoor[,sky]]` makes a new map through the wizard instead of loading one.
    autonew: Option<String>,
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        tauri: tauri::VERSION.to_string(),
        webview: tauri::webview_version().unwrap_or_else(|_| "unknown".into()),
        os: format!("{} {}", std::env::consts::OS, std::env::consts::ARCH),
        profile: if cfg!(debug_assertions) {
            "debug"
        } else {
            "release"
        }
        .to_string(),
        autoload: std::env::var("GME_AUTOLOAD").ok(),
        autoshot: std::env::var("GME_AUTOSHOT").ok(),
        autoselect: std::env::var("GME_AUTOSELECT").ok(),
        autocam: std::env::var("GME_AUTOCAM").ok(),
        automove: std::env::var("GME_AUTOMOVE").ok(),
        autosave: std::env::var("GME_AUTOSAVE").ok(),
        autoblock: std::env::var("GME_AUTOBLOCK").ok(),
        autodelete: std::env::var("GME_AUTODELETE").ok(),
        autorotate: std::env::var("GME_AUTOROTATE").ok(),
        autoscale: std::env::var("GME_AUTOSCALE").ok(),
        autotexture: std::env::var("GME_AUTOTEXTURE").ok(),
        autoentity: std::env::var("GME_AUTOENTITY").ok(),
        autokey: std::env::var("GME_AUTOKEY").ok(),
        autooutput: std::env::var("GME_AUTOOUTPUT").ok(),
        autohide: std::env::var("GME_AUTOHIDE").ok(),
        autogroup: std::env::var("GME_AUTOGROUP").ok(),
        autovisgroup: std::env::var("GME_AUTOVISGROUP").ok(),
        autoclip: std::env::var("GME_AUTOCLIP").ok(),
        autocordon: std::env::var("GME_AUTOCORDON").ok(),
        autohollow: std::env::var("GME_AUTOHOLLOW").ok(),
        autocarve: std::env::var("GME_AUTOCARVE").ok(),
        autovertex: std::env::var("GME_AUTOVERTEX").ok(),
        autoprimitive: std::env::var("GME_AUTOPRIMITIVE").ok(),
        autotie: std::env::var("GME_AUTOTIE").ok(),
        autoworld: std::env::var("GME_AUTOWORLD").ok(),
        autocollapse: std::env::var("GME_AUTOCOLLAPSE").ok(),
        autoface: std::env::var("GME_AUTOFACE").ok(),
        autoproblems: std::env::var("GME_AUTOPROBLEMS").ok(),
        autofix: std::env::var("GME_AUTOFIX").ok(),
        autoisolate: std::env::var("GME_AUTOISOLATE").ok(),
        autoclone: std::env::var("GME_AUTOCLONE").ok(),
        autocompile: std::env::var("GME_AUTOCOMPILE").ok(),
        autopack: std::env::var("GME_AUTOPACK").ok(),
        autoprefab: std::env::var("GME_AUTOPREFAB").ok(),
        autoviewmode: std::env::var("GME_AUTOVIEWMODE").ok(),
        autoperf: std::env::var("GME_AUTOPERF").ok(),
        autobridge: std::env::var("GME_AUTOBRIDGE").ok(),
        autotour: std::env::var("GME_AUTOTOUR").ok(),
        autolandscape: std::env::var("GME_AUTOLANDSCAPE").ok(),
        autosound: std::env::var("GME_AUTOSOUND").ok(),
        autopaint: std::env::var("GME_AUTOPAINT").ok(),
        autoassist: std::env::var("GME_AUTOASSIST").ok(),
        autojourney: std::env::var("GME_AUTOJOURNEY").ok(),
        autoworkshop: std::env::var("GME_AUTOWORKSHOP").ok(),
        autosculpt: std::env::var("GME_AUTOSCULPT").ok(),
        autosatellite: std::env::var("GME_AUTOSATELLITE").ok(),
        autodrop: std::env::var("GME_AUTODROP").ok(),
        autoplace: std::env::var("GME_AUTOPLACE").ok(),
        autoscatter: std::env::var("GME_AUTOSCATTER").ok(),
        automeasure: std::env::var("GME_AUTOMEASURE").ok(),
        autosymmetry: std::env::var("GME_AUTOSYMMETRY").ok(),
        automatpreview: std::env::var("GME_AUTOMATPREVIEW").ok(),
        automodelghost: std::env::var("GME_AUTOMODELGHOST").ok(),
        autodom: std::env::var("GME_AUTODOM").ok(),
        autopanel: std::env::var("GME_AUTOPANEL").ok(),
        autopath: std::env::var("GME_AUTOPATH").ok(),
        autopick: std::env::var("GME_AUTOPICK").ok(),
        autooverlay: std::env::var("GME_AUTOOVERLAY").ok(),
        autoextra: std::env::var("GME_AUTOEXTRA").ok(),
        autoarray: std::env::var("GME_AUTOARRAY").ok(),
        autoimport: std::env::var("GME_AUTOIMPORT").ok(),
        autoalign: std::env::var("GME_AUTOALIGN").ok(),
        autoexit: std::env::var("GME_AUTOEXIT").ok(),
        autodisp: std::env::var("GME_AUTODISP").ok(),
        autodispop: std::env::var("GME_AUTODISPOP").ok(),
        autoprop: std::env::var("GME_AUTOPROP").ok(),
        autoworldkey: std::env::var("GME_AUTOWORLDKEY").ok(),
        autoreplace: std::env::var("GME_AUTOREPLACE").ok(),
        autoalpha: std::env::var("GME_AUTOALPHA").ok(),
        autosew: std::env::var("GME_AUTOSEW").ok(),
        autohelpers: std::env::var("GME_AUTOHELPERS").ok(),
        autonew: std::env::var("GME_AUTONEW").ok(),
    }
}

#[derive(Deserialize, Debug)]
struct GpuReport {
    ok: bool,
    message: String,
    adapter: Option<String>,
}

/// The frontend reports the WebGPU state here so `tauri dev` output shows it.
#[tauri::command]
fn gpu_report(report: GpuReport) {
    println!(
        "[gpu] ok={} message={:?} adapter={:?}",
        report.ok, report.message, report.adapter
    );
}

/// Free-form progress lines from the frontend, printed to the console.
#[tauri::command]
fn log(line: String) {
    println!("[web] {line}");
}

#[tauri::command]
fn content_status(state: tauri::State<'_, AppState>) -> ContentStatus {
    state.status()
}

/// The language picked in the installer, as the editor's locale code, or null
/// when the editor was not installed with the NSIS installer. The installer
/// writes the Windows LCID of its language to `installer-language.txt` next
/// to the executable (installer/hooks.nsh); the editor starts in the same
/// language until the person chooses another one.
#[tauri::command]
fn installer_language() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let text = std::fs::read_to_string(exe.parent()?.join("installer-language.txt")).ok()?;
    let code = match text.trim() {
        "1033" => "en",
        "1049" => "ru",
        "1031" => "de",
        "1036" => "fr",
        "1034" | "3082" => "es",
        "1046" | "2070" => "pt-BR",
        "1045" => "pl",
        "1055" => "tr",
        "1058" => "uk",
        "2052" | "4" => "zh-CN",
        "1041" => "ja",
        _ => return None,
    };
    Some(code.to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => e.into_bytes().iter().map(|&b| b as char).collect(),
    })
}

/// Modification time of a file in milliseconds since the epoch, or null when it does not exist.
#[tauri::command]
fn file_mtime(path: String) -> Option<u64> {
    let meta = std::fs::metadata(&path).ok()?;
    let modified = meta.modified().ok()?;
    Some(
        modified
            .duration_since(std::time::UNIX_EPOCH)
            .ok()?
            .as_millis() as u64,
    )
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    path: String,
    /// Milliseconds since the epoch, from the file name's stamp or the file time.
    when: u64,
    bytes: u64,
}

/// `<dir>/history` and `<stem>` for a map path.
fn history_parts(path: &str) -> Result<(PathBuf, String), String> {
    let p = PathBuf::from(path);
    let dir = p
        .parent()
        .ok_or("не удалось определить папку карты")?
        .join("history");
    let stem = p
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("не удалось определить имя карты")?
        .to_string();
    Ok((dir, stem))
}

/// Versions of a map, newest first.
#[tauri::command]
fn list_history(path: String) -> Result<Vec<HistoryEntry>, String> {
    let (dir, stem) = history_parts(&path)?;
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(out);
    };
    let prefix = format!("{stem}.");
    for entry in entries.flatten() {
        let p = entry.path();
        let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.starts_with(&prefix) || !name.ends_with(".vmf") {
            continue;
        }
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let when = meta
            .modified()
            .ok()
            .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(HistoryEntry {
            path: p.display().to_string(),
            when,
            bytes: meta.len(),
        });
    }
    out.sort_by_key(|e| std::cmp::Reverse(e.when));
    Ok(out)
}

/// Stores a dated copy of the map text in `<dir>/history/<stem>.<stamp>.vmf`
/// and keeps only the newest `keep` copies.
#[tauri::command]
fn save_history(path: String, text: String, keep: usize) -> Result<String, String> {
    let (dir, stem) = history_parts(&path)?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let target = dir.join(format!("{stem}.{now}.vmf"));
    std::fs::write(&target, text.as_bytes()).map_err(|e| format!("{}: {e}", target.display()))?;
    let mut all = list_history(path)?;
    all.sort_by_key(|e| std::cmp::Reverse(e.when));
    for old in all.iter().skip(keep.max(1)) {
        let _ = std::fs::remove_file(&old.path);
    }
    Ok(target.display().to_string())
}

/// Removes every stored version of a map.
#[tauri::command]
fn clear_history(path: String) -> Result<usize, String> {
    let mut n = 0;
    for e in list_history(path)? {
        if std::fs::remove_file(&e.path).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}

/// Deletes a file the editor itself wrote (an autosave copy); missing files are fine.
#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("{path}: {e}")),
    }
}

/// Saves VMF text. Writes to a temporary file first and renames, so a crash
/// mid-write never leaves a truncated map.
#[tauri::command]
fn write_text_file(path: String, text: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    let tmp = target.with_extension("vmf.saving");
    std::fs::write(&tmp, text.as_bytes()).map_err(|e| format!("{}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &target).map_err(|e| format!("{path}: {e}"))?;
    println!("[save] wrote {path} ({} bytes)", text.len());
    Ok(())
}

#[derive(Serialize)]
struct ProjectMount {
    root: Option<String>,
    files: usize,
}

/// Mounts the folder a map belongs to (the nearest ancestor that has a
/// `materials` or `models` directory) as the highest-priority content
/// source, so a map's own textures resolve like they would in its addon.
#[tauri::command]
fn open_map_project(path: String, state: tauri::State<'_, AppState>) -> ProjectMount {
    let root = find_project_root(Path::new(&path));
    let files = match &root {
        Some(r) => state.set_project(r.clone()),
        None => {
            state.clear_project();
            0
        }
    };
    ProjectMount {
        root: root.map(|r| r.display().to_string()),
        files,
    }
}

fn find_project_root(vmf: &Path) -> Option<PathBuf> {
    let mut dir = vmf.parent()?.to_path_buf();
    for _ in 0..6 {
        if dir.join("materials").is_dir() || dir.join("models").is_dir() {
            return Some(dir);
        }
        dir = dir.parent()?.to_path_buf();
    }
    None
}

/// The project folder of a map: the content root above it, else its own folder.
fn project_root_of(vmf: &Path) -> Option<PathBuf> {
    find_project_root(vmf).or_else(|| vmf.parent().map(Path::to_path_buf))
}

// ---- The Claude assistant.

#[tauri::command]
fn assistant_key_status() -> assistant::KeyStatus {
    assistant::key_status()
}

#[tauri::command]
fn assistant_set_key(key: String) -> Result<assistant::KeyStatus, String> {
    assistant::set_key(&key)?;
    println!("[assistant] key stored");
    Ok(assistant::key_status())
}

#[tauri::command]
fn assistant_clear_key() -> Result<assistant::KeyStatus, String> {
    assistant::clear_key()?;
    println!("[assistant] key removed");
    Ok(assistant::key_status())
}

/// One model call through the API or a local Claude Code; the tool loop runs
/// in the webview. The call takes seconds to minutes, so it runs on a worker
/// thread: a synchronous command would hold the main thread and freeze the window.
#[tauri::command]
async fn assistant_chat(
    app: tauri::AppHandle,
    request: assistant::ChatRequest,
) -> Result<assistant::ChatResponse, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let session = app.state::<assistant_cli::CliSession>();
        let (r, via) = assistant::dispatch(&request, &session)?;
        println!(
            "[assistant] {} via {via}: stop {}, {} in / {} out tokens",
            request.model, r.stop_reason, r.input_tokens, r.output_tokens
        );
        Ok(r)
    })
    .await
    .map_err(|e| format!("сбой потока ассистента: {e}"))?
}

/// The streamed API call: content block events reach the webview through the
/// channel as they arrive; the command returns when the reply is complete.
#[tauri::command]
async fn assistant_chat_stream(
    request: assistant::ChatRequest,
    on_event: tauri::ipc::Channel<serde_json::Value>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        assistant::chat_stream(&request, &|v| {
            let _ = on_event.send(v);
        })
    })
    .await
    .map_err(|e| format!("сбой потока ассистента: {e}"))?
}

/// One request through Claude Code with the editor's tools over MCP: the
/// reply streams through the channel, tool calls arrive as `tool_call` events
/// and are answered with `assistant_tool_reply`.
#[tauri::command]
async fn assistant_cli_run(
    app: tauri::AppHandle,
    request: assistant_cli::RunRequest,
    on_event: tauri::ipc::Channel<serde_json::Value>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let runs = app.state::<assistant_cli::McpRuns>();
        let cli = assistant_cli::find_cli().ok_or("Claude Code не найден: установите его командой npm install -g @anthropic-ai/claude-code и выполните вход командой claude")?;
        let sink: mcp_bridge::Sink = std::sync::Arc::new(move |v| {
            let _ = on_event.send(v);
        });
        let started = std::time::Instant::now();
        let r = assistant_cli::run_stream(&request, &cli, &runs, sink);
        println!(
            "[assistant] claude code run: {} ms, {}",
            started.elapsed().as_millis(),
            match &r {
                Ok(()) => "ok".to_string(),
                Err(e) => e.chars().take(200).collect(),
            }
        );
        r
    })
    .await
    .map_err(|e| format!("сбой потока ассистента: {e}"))?
}

/// The webview's answer to a tool call the bridge relayed.
#[tauri::command]
fn assistant_tool_reply(
    call_id: String,
    reply: serde_json::Value,
    runs: tauri::State<'_, assistant_cli::McpRuns>,
) -> bool {
    runs.bridge()
        .map(|b| b.reply(&call_id, reply))
        .unwrap_or(false)
}

/// Stops the running Claude Code request; the next one resumes the session.
#[tauri::command]
fn assistant_cli_stop(runs: tauri::State<'_, assistant_cli::McpRuns>) {
    runs.stop();
}

/// Installs Claude Code with Anthropic's native installer and reports the key status after.
#[tauri::command]
async fn assistant_install_cli() -> Result<assistant::KeyStatus, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let path = assistant_cli::install()?;
        println!("[assistant] claude code installed: {}", path.display());
        Ok(assistant::key_status())
    })
    .await
    .map_err(|e| format!("сбой потока ассистента: {e}"))?
}

/// Opens a console with Claude Code for signing in.
#[tauri::command]
fn assistant_login_cli() -> Result<(), String> {
    let cli = assistant_cli::find_cli().ok_or("Claude Code не найден: установите его командой npm install -g @anthropic-ai/claude-code и выполните вход командой claude")?;
    assistant_cli::open_login(&cli)
}

/// A new conversation: the Claude Code process and its session are dropped.
#[tauri::command]
fn assistant_cli_reset(runs: tauri::State<'_, assistant_cli::McpRuns>) {
    runs.reset();
}

/// The 3D camera's look: the cursor is kept inside the window while the button
/// is held (the webview hides it and turns the camera from the movement deltas)
/// and put back where the look began when it is released. Done here rather
/// than with the web Pointer Lock, whose "press Esc to show your cursor" banner
/// has no place in an editor.
#[tauri::command]
fn cursor_capture(window: tauri::Window, on: bool, x: f64, y: f64) -> Result<(), String> {
    if on {
        window.set_cursor_grab(true).map_err(|e| e.to_string())
    } else {
        let _ = window.set_cursor_grab(false);
        window
            .set_cursor_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))
            .map_err(|e| e.to_string())
    }
}

/// Moves the cursor to a point of the window (the webview re-centres it before it reaches an edge).
#[tauri::command]
fn cursor_warp(window: tauri::Window, x: f64, y: f64) -> Result<(), String> {
    window
        .set_cursor_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn project_list_files(map: String, dir: String) -> Result<Vec<assistant::ProjectFile>, String> {
    let root = project_root_of(Path::new(&map))
        .ok_or("папка карты не определена: сначала сохраните карту")?;
    assistant::list_files(&root, &dir)
}

#[tauri::command]
fn project_read_file(map: String, path: String) -> Result<String, String> {
    let root = project_root_of(Path::new(&map))
        .ok_or("папка карты не определена: сначала сохраните карту")?;
    assistant::read_file(&root, &path)
}

#[tauri::command]
fn project_write_file(map: String, path: String, text: String) -> Result<String, String> {
    let root = project_root_of(Path::new(&map))
        .ok_or("папка карты не определена: сначала сохраните карту")?;
    let p = assistant::write_file(&root, &path, &text)?;
    println!("[assistant] wrote {} ({} bytes)", p.display(), text.len());
    Ok(p.display().to_string())
}

#[tauri::command]
fn materials_info(names: Vec<String>, state: tauri::State<'_, AppState>) -> Vec<MaterialInfo> {
    names.iter().map(|n| state.material_info(n)).collect()
}

/// Resolved FGD classes for the given classnames (unknown ones get defaults).
#[tauri::command]
fn entity_classes(names: Vec<String>, state: tauri::State<'_, AppState>) -> Vec<ClassInfo> {
    names.iter().map(|n| state.class_info(n)).collect()
}

#[derive(Serialize)]
struct MaterialList {
    names: Vec<String>,
    total: usize,
}

/// Material names matching every whitespace-separated word of `filter`
/// (case-insensitive), at most `limit` of them, plus the total match count.
#[tauri::command]
fn list_materials(
    filter: String,
    limit: usize,
    shader: Option<String>,
    with_broken: Option<bool>,
    state: tauri::State<'_, AppState>,
) -> MaterialList {
    // Materials without a picture (no VMT, no $basetexture, missing VTF) are
    // left out unless asked for; `total` still counts them, so the page
    // counter is a rough one.
    let with_broken = with_broken.unwrap_or(false);
    let words: Vec<String> = filter
        .split_whitespace()
        .map(|w| w.to_ascii_lowercase())
        .collect();
    // Shader filter: `lightmappedgeneric`, `worldvertextransition`, … or `tool`
    // for the tools/ folder; reading each VMT once, then from the cache.
    let shader = shader
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| !s.is_empty());
    let all = state.material_names();
    let mut names = Vec::new();
    let mut total = 0;
    for name in all.iter() {
        if !words.iter().all(|w| name.contains(w.as_str())) {
            continue;
        }
        let shader_ok = match shader.as_deref() {
            None => true,
            Some("tool") => name.starts_with("tools/"),
            Some(want) => state.material_shader(name) == want,
        };
        if shader_ok {
            total += 1;
            if names.len() < limit && (with_broken || state.material_textured(name)) {
                names.push(name.clone());
            }
        }
    }
    MaterialList { names, total }
}

#[derive(Serialize)]
struct FolderEntry {
    /// Folder name relative to the prefix, with its trailing slash (`dev/`).
    name: String,
    /// Materials under it, at any depth.
    count: usize,
}

/// Immediate subfolders of `prefix` (`""` for the root, `models/props_c17/` …) among the
/// material names, with how many materials each holds: the folder column of the texture browser.
#[tauri::command]
fn material_folders(prefix: String, state: tauri::State<'_, AppState>) -> Vec<FolderEntry> {
    folders_of(&state.material_names(), "", &prefix)
}

/// The same for models; names are taken relative to `models/`, so the root lists `props_c17/` ….
#[tauri::command]
fn model_folders(prefix: String, state: tauri::State<'_, AppState>) -> Vec<FolderEntry> {
    folders_of(&state.model_names(), "models/", &prefix)
}

fn folders_of(names: &[String], strip: &str, prefix: &str) -> Vec<FolderEntry> {
    let prefix = prefix.to_ascii_lowercase();
    let mut counts: std::collections::BTreeMap<String, usize> = std::collections::BTreeMap::new();
    for name in names {
        let name = name.strip_prefix(strip).unwrap_or(name);
        let Some(rest) = name.strip_prefix(prefix.as_str()) else {
            continue;
        };
        if let Some(i) = rest.find('/') {
            *counts.entry(rest[..=i].to_string()).or_default() += 1;
        }
    }
    counts
        .into_iter()
        .map(|(name, count)| FolderEntry { name, count })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResourceReport {
    missing_materials: Vec<String>,
    missing_models: Vec<String>,
    /// Sky faces (`skybox/<name>bk` …) the game does not have.
    missing_sky: Vec<String>,
}

/// Which of the map's materials, models and sky faces the game cannot find.
#[tauri::command]
fn check_resources(
    materials: Vec<String>,
    models: Vec<String>,
    skyname: Option<String>,
    state: tauri::State<'_, AppState>,
) -> ResourceReport {
    let missing_materials = materials
        .into_iter()
        .filter(|m| !m.trim().is_empty() && state.material(m).is_none())
        .collect();
    let missing_models = models
        .into_iter()
        .filter(|m| !m.trim().is_empty() && !state.exists(&m.replace('\\', "/")))
        .collect();
    let mut missing_sky = Vec::new();
    if let Some(sky) = skyname.filter(|s| !s.trim().is_empty()) {
        for face in ["bk", "dn", "ft", "lf", "rt", "up"] {
            let name = format!("skybox/{sky}{face}");
            if state.material(&name).is_none() {
                missing_sky.push(name);
            }
        }
    }
    ResourceReport {
        missing_materials,
        missing_models,
        missing_sky,
    }
}

/// The `flags` word of a `.mdl` header (studiohdr_t, after the id, version, checksum, name, length
/// and six vectors), or `None` when the bytes are not a model.
fn mdl_flags(bytes: &[u8]) -> Option<u32> {
    const FLAGS_AT: usize = 4 + 4 + 4 + 64 + 4 + 6 * 12;
    if bytes.len() < FLAGS_AT + 4 || &bytes[..4] != b"IDST" {
        return None;
    }
    Some(u32::from_le_bytes(
        bytes[FLAGS_AT..FLAGS_AT + 4].try_into().ok()?,
    ))
}

/// The header flags of each model (`None` for a model the game does not have); bit 4 is
/// STUDIOHDR_FLAGS_STATIC_PROP, which VBSP requires of every prop_static.
#[tauri::command]
fn model_flags(models: Vec<String>, state: tauri::State<'_, AppState>) -> Vec<Option<u32>> {
    models
        .iter()
        .map(|m| {
            state
                .read(&m.replace('\\', "/"))
                .and_then(|b| mdl_flags(&b))
        })
        .collect()
}

/// Model names matching every word of `filter`, at most `limit`, plus the total.
#[tauri::command]
fn list_models(filter: String, limit: usize, state: tauri::State<'_, AppState>) -> MaterialList {
    let words: Vec<String> = filter
        .split_whitespace()
        .map(|w| w.to_ascii_lowercase())
        .collect();
    let all = state.model_names();
    let mut names = Vec::new();
    let mut total = 0;
    for name in all.iter() {
        if words.iter().all(|w| name.contains(w.as_str())) {
            total += 1;
            if names.len() < limit {
                names.push(name.clone());
            }
        }
    }
    MaterialList { names, total }
}

/// Sound files of the game and the project, filtered by words of the name.
#[tauri::command]
fn list_sounds(filter: String, limit: usize, state: tauri::State<'_, AppState>) -> MaterialList {
    let words: Vec<String> = filter
        .split_whitespace()
        .map(|w| w.to_ascii_lowercase())
        .collect();
    let all = state.sound_names();
    let mut names = Vec::new();
    let mut total = 0;
    for name in all.iter() {
        if words.iter().all(|w| name.contains(w.as_str())) {
            total += 1;
            if names.len() < limit {
                names.push(name.clone());
            }
        }
    }
    MaterialList { names, total }
}

/// A local file as bytes (for the sound editor's import); the body comes back raw.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<tauri::ipc::Response, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WrittenSound {
    /// VFS path the entity key uses, without the `sound/` prefix: `<map>/<name>.wav`.
    name: String,
    /// Where the file went on disk.
    path: String,
    bytes: usize,
}

/// Writes a WAV the sound editor made into the map project's `sound/<map>/`
/// folder. The body is the raw file; the headers carry the map path and the
/// file name.
#[tauri::command]
fn write_sound(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, AppState>,
) -> Result<WrittenSound, String> {
    let header = |k: &str| -> Result<String, String> {
        request
            .headers()
            .get(k)
            .and_then(|v| v.to_str().ok())
            .map(assets::percent_decode)
            .ok_or_else(|| format!("отсутствует заголовок {k}"))
    };
    let map = header("x-map")?;
    let name = header("x-name")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("тело запроса должно быть двоичным".into());
    };
    let safe: String = name
        .trim()
        .trim_end_matches(".wav")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    if safe.is_empty() {
        return Err("не указано имя звука".into());
    }
    let map_path = PathBuf::from(&map);
    let root = find_project_root(&map_path)
        .or_else(|| map_path.parent().map(Path::to_path_buf))
        .ok_or("папка карты не определена: сначала сохраните карту")?;
    let stem = map_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_ascii_lowercase())
        .unwrap_or_else(|| "map".into());
    let dir = root.join("sound").join(&stem);
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    let file = dir.join(format!("{safe}.wav"));
    std::fs::write(&file, bytes).map_err(|e| format!("{}: {e}", file.display()))?;
    state.set_project(root);
    state.forget_sounds();
    println!("[sound] wrote {} ({} bytes)", file.display(), bytes.len());
    Ok(WrittenSound {
        name: format!("{stem}/{safe}.wav"),
        path: file.display().to_string(),
        bytes: bytes.len(),
    })
}

/// Every placeable class in the FGD.
#[tauri::command]
fn entity_class_list(state: tauri::State<'_, AppState>) -> Vec<ClassEntry> {
    state.class_list()
}

/// Full FGD definition of a class: keys with types, choices, flags, I/O.
#[tauri::command]
fn entity_class_def(classname: String, state: tauri::State<'_, AppState>) -> ClassDef {
    state.class_def(&classname)
}

/// Key-values a new entity of this class starts with.
#[tauri::command]
fn entity_defaults(classname: String, state: tauri::State<'_, AppState>) -> Vec<(String, String)> {
    state.class_defaults(&classname)
}

/// Hammer's Run Map: compiles a saved VMF with vbsp/vvis/vrad in the
/// background. Output arrives as `compile-log` events, the result as
/// `compile-done`. Returns the run number the events carry.
#[tauri::command]
fn compile_map(
    vmf: String,
    options: compile::CompileOptions,
    app: tauri::AppHandle,
    compiler: tauri::State<'_, compile::Compiler>,
) -> Result<u64, String> {
    compiler.start(app, vmf, options)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PrefabInfo {
    name: String,
    path: String,
    bytes: u64,
}

/// The prefab library folder: `%APPDATA%/gme/prefabs` (created on demand).
fn prefab_root() -> Result<PathBuf, String> {
    let base = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))
        .ok_or("папка данных пользователя не найдена")?;
    let dir = base.join("mallet").join("prefabs");
    std::fs::create_dir_all(&dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    Ok(dir)
}

#[tauri::command]
fn prefab_dir() -> Result<String, String> {
    Ok(prefab_root()?.display().to_string())
}

/// Prefabs on disk, sorted by name.
#[tauri::command]
fn list_prefabs() -> Result<Vec<PrefabInfo>, String> {
    let dir = prefab_root()?;
    let mut out = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| format!("{}: {e}", dir.display()))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("vmf") {
            continue;
        }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        let bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        out.push(PrefabInfo {
            name: stem.to_string(),
            path: path.display().to_string(),
            bytes,
        });
    }
    out.sort_by_key(|p| p.name.to_lowercase());
    Ok(out)
}

/// Removes one prefab file by name.
#[tauri::command]
fn delete_prefab(name: String) -> Result<(), String> {
    let path = prefab_root()?.join(format!("{name}.vmf"));
    std::fs::remove_file(&path).map_err(|e| format!("{}: {e}", path.display()))
}

/// Converts PNG/TGA files into VTF+VMT under the map's project folder
/// (`materials/<dir>/`), mounts the folder and returns the new materials.
#[tauri::command]
fn import_textures(
    map: String,
    paths: Vec<String>,
    dir: String,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<imports::ImportedTexture>, String> {
    let map_path = PathBuf::from(&map);
    let root = find_project_root(&map_path)
        .or_else(|| map_path.parent().map(Path::to_path_buf))
        .ok_or("папка карты не определена: сначала сохраните карту")?;
    let mut out = Vec::new();
    for p in &paths {
        let t = imports::import_texture(&root, &dir, Path::new(p))?;
        println!("[import] {} -> {} ({}x{})", p, t.vtf, t.width, t.height);
        out.push(t);
    }
    state.set_project(root);
    Ok(out)
}

/// Writes a PNG the texture painter made as VTF+VMT under the map project's
/// `materials/<dir>/`, with the shader the painter chose. The body is the
/// PNG; the headers carry the map path, the name, the folder and the shader.
#[tauri::command]
fn write_texture(
    request: tauri::ipc::Request<'_>,
    state: tauri::State<'_, AppState>,
) -> Result<imports::ImportedTexture, String> {
    let header = |k: &str| -> Option<String> {
        request
            .headers()
            .get(k)
            .and_then(|v| v.to_str().ok())
            .map(assets::percent_decode)
    };
    let map = header("x-map").ok_or("отсутствует заголовок x-map")?;
    let name = header("x-name").ok_or("отсутствует заголовок x-name")?;
    let dir = header("x-dir").unwrap_or_else(|| "custom".into());
    let shader = header("x-shader").unwrap_or_else(|| "LightmappedGeneric".into());
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("тело запроса должно быть двоичным".into());
    };
    if name.trim().is_empty() {
        return Err("не указано имя текстуры".into());
    }
    let map_path = PathBuf::from(&map);
    let root = find_project_root(&map_path)
        .or_else(|| map_path.parent().map(Path::to_path_buf))
        .ok_or("папка карты не определена: сначала сохраните карту")?;
    let pic = imports::decode_png(bytes)?;
    let t = imports::write_picture(&root, &dir, name.trim(), &pic, Some(shader.as_str()))?;
    state.set_project(root);
    println!(
        "[paint] {} -> {} ({}x{}, {shader}{})",
        name,
        t.vtf,
        t.width,
        t.height,
        if t.translucent { ", translucent" } else { "" }
    );
    Ok(t)
}

/// Every file the map's materials, models, sounds and sky need, and where each comes from.
#[tauri::command]
fn pack_analyze(request: pack::PackRequest, state: tauri::State<'_, AppState>) -> pack::PackReport {
    pack::analyze(&state, &request)
}

/// Writes the given VFS paths into the BSP with bspzip.
#[tauri::command]
fn pack_bsp(
    bsp: String,
    files: Vec<String>,
    install: bool,
    state: tauri::State<'_, AppState>,
) -> Result<pack::PackResult, String> {
    let game = content::GameInstall::detect().ok_or("Garry's Mod не найден в библиотеках Steam")?;
    let r = pack::pack(&state, &game, &bsp, &files, install)?;
    println!(
        "[pack] {} files, {} bytes -> {}",
        r.packed, r.bytes, r.output
    );
    Ok(r)
}

/// Lays out the addon folder of a compiled map and packs it with gmad (blocking: on a worker thread).
#[tauri::command]
async fn workshop_pack(request: workshop::PackRequest) -> Result<workshop::PackResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let install =
            content::GameInstall::detect().ok_or("Garry's Mod не найден в библиотеках Steam")?;
        let r = workshop::pack(&install, &request)?;
        println!(
            "[workshop] packed {} files, {} bytes -> {}",
            r.files.len(),
            r.bytes,
            r.gma
        );
        Ok(r)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Creates or updates the Workshop item with gmpublish; Steam must be running.
#[tauri::command]
async fn workshop_publish(
    request: workshop::PublishRequest,
) -> Result<workshop::PublishResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let install =
            content::GameInstall::detect().ok_or("Garry's Mod не найден в библиотеках Steam")?;
        let r = workshop::publish(&install, &request);
        match &r {
            Ok(r) => println!("[workshop] published id {:?}", r.id),
            Err(e) => println!("[workshop] publish failed: {e}"),
        }
        r
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Writes raw bytes to a path given in the `x-path` header (the Workshop icon, say).
#[tauri::command]
fn write_file_bytes(request: tauri::ipc::Request<'_>) -> Result<u64, String> {
    let path = request
        .headers()
        .get("x-path")
        .and_then(|v| v.to_str().ok())
        .map(assets::percent_decode)
        .ok_or("отсутствует заголовок x-path")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("тело запроса должно быть двоичным".into());
    };
    let target = PathBuf::from(&path);
    if let Some(dir) = target.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("{}: {e}", dir.display()))?;
    }
    std::fs::write(&target, bytes).map_err(|e| format!("{path}: {e}"))?;
    Ok(bytes.len() as u64)
}

/// Opens a web page in the default browser (the Workshop item, say).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") {
        return Err("поддерживаются только ссылки https".into());
    }
    std::process::Command::new("cmd")
        .args(["/C", "start", "", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Starts Garry's Mod on an installed map (its BSP in `garrysmod/maps`).
#[tauri::command]
fn run_game(
    app: tauri::AppHandle,
    bridge: tauri::State<bridge::Bridge>,
    map: String,
    debug: Option<bool>,
    project: Option<String>,
    clean: Option<bool>,
) -> Result<String, String> {
    let install =
        content::GameInstall::detect().ok_or("Garry's Mod не найден в библиотеках Steam")?;
    if let Some(root) = project
        .as_deref()
        .and_then(|p| project_root_of(Path::new(p)))
    {
        match assistant::install_lua_addon(&install.game_dir, &root, &map) {
            Ok(0) => {}
            Ok(n) => println!("[lua] {n} files -> addons/mallet_{map}"),
            Err(e) => println!("[lua] addon not written: {e}"),
        }
    }
    let line = compile::launch_game(
        &app,
        &bridge,
        &install,
        &map,
        debug.unwrap_or(false),
        clean.unwrap_or(false),
    )?;
    println!("[game] {line}");
    Ok(line)
}

/// Builds the cubemaps of an installed map in the engine (see `compile::build_cubemaps`).
#[tauri::command]
fn build_cubemaps(
    app: tauri::AppHandle,
    bridge: tauri::State<bridge::Bridge>,
    map: String,
    relaunch: Option<bool>,
) -> Result<String, String> {
    let install =
        content::GameInstall::detect().ok_or("Garry's Mod не найден в библиотеках Steam")?;
    let line = compile::build_cubemaps(&app, &bridge, &install, &map, relaunch.unwrap_or(false))?;
    println!("[game] cubemaps: {line}");
    Ok(line)
}

/// Queues a command for the running game's bridge addon: `{"type": "teleport", ...}`.
#[tauri::command]
fn bridge_send(bridge: tauri::State<bridge::Bridge>, command: serde_json::Value) {
    println!(
        "[bridge] send {}",
        command.to_string().chars().take(160).collect::<String>()
    );
    bridge.send(command);
}

/// Whether the addon is talking, the map it runs, the player's position.
#[tauri::command]
fn bridge_status(bridge: tauri::State<bridge::Bridge>) -> bridge::BridgeStatus {
    bridge.status()
}

/// The reports the addon posted so far; autotests wait on them.
#[tauri::command]
fn bridge_reports(bridge: tauri::State<bridge::Bridge>) -> Vec<serde_json::Value> {
    bridge.reports()
}

/// A screenshot from the running game: JPEG bytes; the player's pose comes with the next status.
#[tauri::command]
async fn bridge_screenshot(
    app: tauri::AppHandle,
    options: Option<bridge::ShotOptions>,
) -> Result<tauri::ipc::Response, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bridge = app.state::<bridge::Bridge>();
        let mut opts = options.unwrap_or_default();
        if opts.quality == 0 {
            opts.quality = 80;
        }
        let (bytes, r) = bridge.screenshot(&opts, std::time::Duration::from_secs(8))?;
        println!(
            "[bridge] screenshot {} bytes, {}x{}",
            bytes.len(),
            r["w"].as_u64().unwrap_or(0),
            r["h"].as_u64().unwrap_or(0)
        );
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
    .map_err(|e| format!("сбой потока снимка: {e}"))?
}

/// Lua in the running game, client or server realm; the result as text.
#[tauri::command]
async fn bridge_lua(
    app: tauri::AppHandle,
    code: String,
    realm: String,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bridge = app.state::<bridge::Bridge>();
        let r = bridge.lua(
            &code,
            if realm == "server" {
                "server"
            } else {
                "client"
            },
            std::time::Duration::from_secs(10),
        )?;
        println!("[bridge] lua {}: ok {}", realm, r["ok"]);
        Ok(r)
    })
    .await
    .map_err(|e| format!("сбой потока моста: {e}"))?
}

/// Moves the player and returns the pose that settled.
#[tauri::command]
async fn bridge_teleport(
    app: tauri::AppHandle,
    pos: [f64; 3],
    pitch: f64,
    yaw: f64,
) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bridge = app.state::<bridge::Bridge>();
        bridge.teleport(pos, pitch, yaw, std::time::Duration::from_secs(6))
    })
    .await
    .map_err(|e| format!("сбой потока моста: {e}"))?
}

/// A console command in the game, with what the console logged right after.
#[tauri::command]
async fn bridge_console(app: tauri::AppHandle, cmd: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let bridge = app.state::<bridge::Bridge>();
        bridge.console(&cmd, std::time::Duration::from_millis(1500))
    })
    .await
    .map_err(|e| format!("сбой потока моста: {e}"))?
}

/// Whether a VFS path (materials/..., sound/..., models/...) exists in the game or the project.
#[tauri::command]
fn vfs_exists(path: String, state: tauri::State<'_, AppState>) -> bool {
    state.exists(&path)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VtfInfo {
    width: u32,
    height: u32,
    mips: u32,
    frames: u32,
    format: String,
    flags: u32,
    version: String,
}

/// The header of a texture by its name (`skybox/sky_day01_01up`, `dev/dev_measurewall01c`) or of a material's base texture.
#[tauri::command]
fn vtf_info(name: String, state: tauri::State<'_, AppState>) -> Result<VtfInfo, String> {
    let v = state
        .texture(&name)
        .or_else(|| {
            state
                .material(&name)
                .and_then(|(m, _)| m.base_texture())
                .and_then(|t| state.texture(&t))
        })
        .ok_or_else(|| format!("{name}: текстура не найдена ни в игре, ни в проекте"))?;
    Ok(VtfInfo {
        width: v.width,
        height: v.height,
        mips: v.mip_count,
        frames: v.frames,
        format: format!("{:?}", v.format),
        flags: v.flags,
        version: format!("{}.{}", v.version.0, v.version.1),
    })
}

/// Ends the game the editor started.
#[tauri::command]
fn game_kill(bridge: tauri::State<bridge::Bridge>) -> bool {
    let killed = bridge.kill_game();
    println!("[game] kill: {killed}");
    killed
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LeafOut {
    mins: [i32; 3],
    maxs: [i32; 3],
    cluster: i32,
    visible: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LeafReport {
    leaves: Vec<LeafOut>,
    clusters: u32,
    max_visible: u32,
}

/// Visleaves of a compiled BSP with the number of clusters each one sees, for the overlay in the views.
#[tauri::command]
fn bsp_leaves(path: String) -> Result<LeafReport, String> {
    let data = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    let map = bsp::Bsp::parse(data)?;
    let rep = map.visleaves();
    println!(
        "[bsp] {path}: {} visleaves, {} clusters, busiest sees {}",
        rep.leaves.len(),
        rep.clusters,
        rep.max_visible
    );
    Ok(LeafReport {
        leaves: rep
            .leaves
            .into_iter()
            .map(|l| LeafOut {
                mins: l.mins,
                maxs: l.maxs,
                cluster: l.cluster,
                visible: l.visible,
            })
            .collect(),
        clusters: rep.clusters,
        max_visible: rep.max_visible,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DecompileResult {
    vmf: String,
    world_brushes: usize,
    detail_brushes: usize,
    entity_brushes: usize,
    entities: usize,
    static_props: usize,
    displacements: usize,
    cubemaps: usize,
    skipped_brushes: usize,
    lost: Vec<String>,
    ms: u128,
}

/// Decompiles a BSP to VMF text with a report of what could not come back.
#[tauri::command]
fn decompile_bsp(path: String) -> Result<DecompileResult, String> {
    let started = std::time::Instant::now();
    let data = std::fs::read(&path).map_err(|e| format!("{path}: {e}"))?;
    let map = bsp::Bsp::parse(data)?;
    let out = bsp::decompile(&map)?;
    let r = out.report;
    println!(
        "[bsp] {path}: brushes {} + {} detail + {} entity, entities {}, props {}, displacements {}, skipped {}",
        r.world_brushes, r.detail_brushes, r.entity_brushes, r.entities, r.static_props, r.displacements, r.skipped_brushes
    );
    Ok(DecompileResult {
        vmf: out.vmf,
        world_brushes: r.world_brushes,
        detail_brushes: r.detail_brushes,
        entity_brushes: r.entity_brushes,
        entities: r.entities,
        static_props: r.static_props,
        displacements: r.displacements,
        cubemaps: r.cubemaps,
        skipped_brushes: r.skipped_brushes,
        lost: r.lost,
        ms: started.elapsed().as_millis(),
    })
}

/// Ends the process; autotests call it when their sequence is done.
#[tauri::command]
fn exit_app(app: tauri::AppHandle, code: i32) {
    println!("[exit] code {code}");
    app.exit(code);
}

/// Saves a `data:image/png;base64,...` URL to `path`; development aid.
#[tauri::command]
fn debug_screenshot(data_url: String, path: String) -> Result<(), String> {
    use base64::Engine;
    let b64 = data_url
        .split_once(',')
        .map(|(_, b)| b)
        .ok_or("not a data url")?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| format!("{path}: {e}"))?;
    println!("[shot] wrote {path}");
    Ok(())
}

pub fn run() {
    // Started by Claude Code as its MCP server: no window, just stdio and the bridge.
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("--mcp-bridge") {
        let code = match (args.get(2), args.get(3)) {
            (Some(addr), Some(token)) => match mcp_bridge::serve_stdio(addr, token) {
                Ok(()) => 0,
                Err(e) => {
                    eprintln!("mcp-bridge: {e}");
                    1
                }
            },
            _ => 2,
        };
        std::process::exit(code);
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new())
        .manage(compile::Compiler::default())
        .manage(bridge::Bridge::default())
        .manage(assistant_cli::CliSession::default())
        .manage(assistant_cli::McpRuns::default())
        .register_uri_scheme_protocol("gmod-asset", assets::handle)
        .on_window_event(|w, e| {
            if let tauri::WindowEvent::CloseRequested { .. } = e {
                println!("[exit] window {} closed by the user", w.label());
                // The assistant's Claude Code process does not outlive the editor.
                if w.label() == "main" {
                    w.app_handle().state::<assistant_cli::McpRuns>().stop();
                }
            }
        })
        .setup(|app| {
            let state = app.state::<AppState>().inner().clone();
            state.start_loading(app.handle().clone());
            app.state::<bridge::Bridge>().start(app.handle().clone());
            // Windowed, three quarters of the screen, in the middle of it.
            if let Some(win) = app.get_webview_window("main") {
                if let Ok(Some(mon)) = win.current_monitor() {
                    let size = mon.size();
                    let _ = win.set_size(tauri::PhysicalSize::new(
                        size.width * 3 / 4,
                        size.height * 3 / 4,
                    ));
                    let _ = win.center();
                }
                // The webview shows the window once its boot banner is painted;
                // should it never get there, the window appears anyway.
                let w = win.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(6));
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            gpu_report,
            log,
            content_status,
            installer_language,
            read_text_file,
            write_text_file,
            open_map_project,
            materials_info,
            entity_classes,
            list_materials,
            material_folders,
            model_folders,
            list_models,
            list_sounds,
            read_file_bytes,
            write_sound,
            write_texture,
            assistant_key_status,
            assistant_set_key,
            assistant_clear_key,
            assistant_chat,
            assistant_chat_stream,
            assistant_cli_run,
            assistant_tool_reply,
            assistant_cli_stop,
            assistant_install_cli,
            assistant_login_cli,
            assistant_cli_reset,
            cursor_capture,
            cursor_warp,
            project_list_files,
            project_read_file,
            project_write_file,
            check_resources,
            model_flags,
            entity_class_list,
            entity_class_def,
            entity_defaults,
            compile_map,
            run_game,
            build_cubemaps,
            bridge_send,
            bridge_status,
            bridge_reports,
            bridge_screenshot,
            bridge_lua,
            bridge_teleport,
            bridge_console,
            vfs_exists,
            vtf_info,
            game_kill,
            decompile_bsp,
            bsp_leaves,
            pack_analyze,
            pack_bsp,
            workshop_pack,
            workshop_publish,
            write_file_bytes,
            open_url,
            import_textures,
            file_mtime,
            remove_file,
            list_history,
            save_history,
            clear_history,
            prefab_dir,
            list_prefabs,
            delete_prefab,
            exit_app,
            debug_screenshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::mdl_flags;

    #[test]
    fn reads_the_header_flags_of_a_model() {
        let mut bytes = vec![0u8; 200];
        bytes[..4].copy_from_slice(b"IDST");
        bytes[152..156].copy_from_slice(&0x10u32.to_le_bytes());
        assert_eq!(mdl_flags(&bytes), Some(0x10));
        assert_eq!(mdl_flags(&bytes[..100]), None);
        bytes[0] = b'X';
        assert_eq!(mdl_flags(&bytes), None);
    }
}
