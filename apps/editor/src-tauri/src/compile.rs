//! Hammer's "Run Map": vbsp, vvis and vrad from the game's `bin` folder,
//! run one after another on a saved VMF, their output streamed to the
//! window as `compile-log` events, the BSP copied into `garrysmod/maps`
//! and the game optionally launched on it.

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use content::GameInstall;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompileOptions {
    pub vbsp: bool,
    pub vvis: bool,
    pub vrad: bool,
    /// `-fast` for vvis and vrad.
    pub fast: bool,
    /// vrad: `-both` (LDR and HDR) instead of LDR only.
    pub hdr: bool,
    /// Copy the BSP into `garrysmod/maps` when done.
    pub install: bool,
    /// Start the game on the map afterwards.
    pub run_game: bool,
    /// Extra command-line words for each tool.
    pub vbsp_args: String,
    pub vvis_args: String,
    pub vrad_args: String,
    /// Expert mode: one command per line, run after the tools. `$vmf`, `$bsp`,
    /// `$name`, `$dir`, `$game` and `$bin` are substituted; a bare program
    /// name is looked up in the game's `bin` first.
    #[serde(default)]
    pub extra_commands: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompileLog {
    pub run: u64,
    /// `vbsp`, `vvis`, `vrad`, `install`, `game` or `editor`.
    pub step: String,
    pub line: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CompileDone {
    pub run: u64,
    pub ok: bool,
    pub bsp: Option<String>,
    pub installed: Option<String>,
    pub ms: u128,
    pub message: String,
}

/// One compile at a time; a new one cancels the running one.
#[derive(Default)]
pub struct Compiler {
    run: AtomicU64,
    cancel: Arc<AtomicBool>,
}

impl Compiler {
    pub fn start(
        &self,
        app: tauri::AppHandle,
        vmf: String,
        options: CompileOptions,
    ) -> Result<u64, String> {
        let install = GameInstall::detect().ok_or("Garry's Mod не найден в библиотеках Steam")?;
        let vmf_path = PathBuf::from(&vmf);
        if !vmf_path.is_file() {
            return Err(format!("{vmf}: файл не найден, сначала сохраните карту"));
        }
        self.cancel.store(true, Ordering::SeqCst);
        let cancel = Arc::new(AtomicBool::new(false));
        // Replace the shared flag for the new run; the old thread keeps its own.
        let run = self.run.fetch_add(1, Ordering::SeqCst) + 1;
        let flag = cancel.clone();
        std::thread::spawn(move || {
            let outcome = compile(&app, run, &install, &vmf_path, &options, &flag);
            let _ = app.emit("compile-done", outcome);
        });
        Ok(run)
    }
}

fn log(app: &tauri::AppHandle, run: u64, step: &str, line: impl Into<String>) {
    let line = line.into();
    println!("[compile:{step}] {line}");
    let _ = app.emit(
        "compile-log",
        CompileLog {
            run,
            step: step.to_string(),
            line,
        },
    );
}

fn compile(
    app: &tauri::AppHandle,
    run: u64,
    install: &GameInstall,
    vmf: &Path,
    options: &CompileOptions,
    cancel: &AtomicBool,
) -> CompileDone {
    let started = Instant::now();
    let game = install.game_dir.display().to_string();
    let stem = vmf
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let bsp = vmf.with_extension("bsp");
    let fail = |message: String| CompileDone {
        run,
        ok: false,
        bsp: None,
        installed: None,
        ms: started.elapsed().as_millis(),
        message,
    };
    // Leftovers of a build copy from a run that died halfway.
    for ext in ["vmf", "bsp", "prt", "log", "lin"] {
        let _ = std::fs::remove_file(vmf.with_file_name(format!("{stem}__build.{ext}")));
    }
    // Source cannot scale a prop_static, so the tools get a copy of the map
    // where every scaled one is a prop_dynamic; the user's file stays as is.
    let build = match scaled_static_props_workaround(vmf) {
        Ok(b) => b,
        Err(e) => return fail(format!("не удалось подготовить VMF к сборке: {e}")),
    };
    if let Some((path, n)) = &build {
        log(
            app,
            run,
            "editor",
            format!(
                "{n} масштабированных prop_static станут prop_dynamic в сборке: {}",
                path.display()
            ),
        );
    }
    let src = build
        .as_ref()
        .map(|(p, _)| p.clone())
        .unwrap_or_else(|| vmf.to_path_buf());
    let built_bsp = src.with_extension("bsp");

    let mut steps: Vec<(&str, Vec<String>)> = Vec::new();
    if options.vbsp {
        let mut a = vec!["-game".to_string(), game.clone()];
        a.extend(words(&options.vbsp_args));
        a.push(src.display().to_string());
        steps.push(("vbsp", a));
    }
    if options.vvis {
        let mut a = vec!["-game".to_string(), game.clone()];
        if options.fast {
            a.push("-fast".to_string());
        }
        a.extend(words(&options.vvis_args));
        a.push(built_bsp.display().to_string());
        steps.push(("vvis", a));
    }
    if options.vrad {
        let mut a = vec!["-game".to_string(), game.clone()];
        if options.fast {
            a.push("-fast".to_string());
        }
        if options.hdr {
            a.push("-both".to_string());
        }
        a.extend(words(&options.vrad_args));
        a.push(built_bsp.display().to_string());
        steps.push(("vrad", a));
    }
    for (tool, args) in &steps {
        let exe = install.bin_dir.join(format!("{tool}.exe"));
        if !exe.is_file() {
            return fail(format!("{} не найден", exe.display()));
        }
        log(
            app,
            run,
            "editor",
            format!("> {} {}", exe.display(), args.join(" ")),
        );
        match run_tool(app, run, tool, &exe, args, &install.bin_dir, cancel) {
            Ok(0) => {}
            Ok(code) => return fail(format!("{tool} завершился с кодом {code}")),
            Err(e) => return fail(format!("{tool}: {e}")),
        }
        if cancel.load(Ordering::SeqCst) {
            return fail("сборка отменена".to_string());
        }
    }
    if build.is_some() {
        // The build copy's output takes the map's own name; the copy and its leftovers go.
        if built_bsp.is_file() {
            if let Err(e) = std::fs::rename(&built_bsp, &bsp) {
                return fail(format!(
                    "не удалось переименовать {}: {e}",
                    built_bsp.display()
                ));
            }
        }
        for ext in ["vmf", "prt", "log", "lin"] {
            let _ = std::fs::remove_file(src.with_extension(ext));
        }
    }
    for raw in options.extra_commands.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let dir = vmf
            .parent()
            .map(|d| d.display().to_string())
            .unwrap_or_default();
        let expanded = line
            .replace("$vmf", &vmf.display().to_string())
            .replace("$bsp", &bsp.display().to_string())
            .replace("$name", &stem)
            .replace("$dir", &dir)
            .replace("$game", &game)
            .replace("$bin", &install.bin_dir.display().to_string());
        let parts = split_command(&expanded);
        let Some((program, args)) = parts.split_first() else {
            continue;
        };
        let in_bin = install.bin_dir.join(program);
        let in_bin_exe = install.bin_dir.join(format!("{program}.exe"));
        let exe = if Path::new(program).is_absolute() {
            PathBuf::from(program)
        } else if in_bin_exe.is_file() {
            in_bin_exe
        } else if in_bin.is_file() {
            in_bin
        } else {
            PathBuf::from(program)
        };
        log(app, run, "editor", format!("> {expanded}"));
        match run_tool(app, run, "cmd", &exe, args, &install.bin_dir, cancel) {
            Ok(0) => {}
            Ok(code) => return fail(format!("{program} завершился с кодом {code}")),
            Err(e) => return fail(format!("{program}: {e}")),
        }
        if cancel.load(Ordering::SeqCst) {
            return fail("сборка отменена".to_string());
        }
    }
    if !bsp.is_file() {
        return fail(format!("{} не создан", bsp.display()));
    }
    let mut installed = None;
    if options.install {
        let maps = install.game_dir.join("maps");
        let target = maps.join(format!("{stem}.bsp"));
        match std::fs::create_dir_all(&maps).and_then(|_| std::fs::copy(&bsp, &target)) {
            Ok(bytes) => {
                log(
                    app,
                    run,
                    "install",
                    format!("{} ({bytes} байт)", target.display()),
                );
                installed = Some(target.display().to_string());
            }
            Err(e) => {
                return fail(format!(
                    "не удалось скопировать в {}: {e}",
                    target.display()
                ))
            }
        }
    }
    if options.run_game {
        let bridge = app.state::<crate::bridge::Bridge>().inner().clone();
        match launch_game(app, &bridge, install, &stem, false, false) {
            Ok(line) => log(app, run, "game", line),
            Err(e) => log(app, run, "game", e),
        }
    }
    CompileDone {
        run,
        ok: true,
        bsp: Some(bsp.display().to_string()),
        installed,
        ms: started.elapsed().as_millis(),
        message: format!("готово за {:.1} с", started.elapsed().as_secs_f64()),
    }
}

/// Starts Garry's Mod on `map` (a BSP in `garrysmod/maps`); the game's own
/// executable at the install root, `hl2.exe` on older builds.
pub fn launch_game(
    app: &tauri::AppHandle,
    bridge: &crate::bridge::Bridge,
    install: &GameInstall,
    map: &str,
    debug: bool,
    clean: bool,
) -> Result<String, String> {
    let bsp = install.game_dir.join("maps").join(format!("{map}.bsp"));
    if !bsp.is_file() {
        return Err(format!(
            "{} не найден: соберите карту с установкой в maps",
            bsp.display()
        ));
    }
    let exe = ["gmod.exe", "hl2.exe"]
        .iter()
        .map(|e| install.root.join(e))
        .find(|p| p.is_file())
        .ok_or_else(|| format!("gmod.exe не найден в {}", install.root.display()))?;
    // -condebug writes the console to garrysmod/console.log and -conclearlog
    // starts it afresh, so the editor can read what the game said about the map.
    let mut args = vec!["-game", "garrysmod", "-condebug", "-conclearlog"];
    if debug {
        // Console, developer messages and cheats for testing the map.
        args.extend(["-console", "-dev", "+developer", "1", "+sv_cheats", "1"]);
    }
    if clean {
        // Only the game's own content and the legacy addons folder (where the bridge lives): no Workshop noise.
        args.push("-noworkshop");
    }
    args.extend(["+map", map]);
    // The bridge addon and its shared folder, fresh for this launch.
    if let Err(e) = crate::bridge::install_addon(&install.game_dir) {
        println!("[bridge] addon not written: {e}");
    }
    if let Err(e) = bridge.prepare(&install.game_dir) {
        println!("[bridge] data folder: {e}");
    }
    // One game at a time: the previous one the editor started goes away.
    if !bridge.game_exited() {
        bridge.kill_game();
    }
    let log_path = install.game_dir.join("console.log");
    let _ = std::fs::remove_file(&log_path);
    let child = Command::new(&exe)
        .current_dir(&install.root)
        .args(&args)
        .spawn()
        .map_err(|e| format!("не удалось запустить {}: {e}", exe.display()))?;
    bridge.set_child(child);
    let app = app.clone();
    let map_name = map.to_string();
    let bridge = bridge.clone();
    std::thread::spawn(move || {
        let outcome = watch_console(&app, &log_path, &map_name, || bridge.game_exited());
        let _ = app.emit("game-done", outcome);
    });
    Ok(format!("{} {}", exe.display(), args.join(" ")))
}

/// How a cubemap build in the engine went.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct CubemapsDone {
    /// The BSP in `maps` changed after the game ran.
    pub ok: bool,
    pub map: String,
    pub ms: u128,
    /// The game did not leave by itself within ten minutes.
    pub timeout: bool,
    /// The game was started again on the map afterwards.
    pub relaunched: bool,
}

/// Builds the cubemaps of an installed map in the engine: GMod's Lua may not
/// run `buildcubemaps`, but the engine's `-buildcubemaps` parameter loads the
/// map, builds them into the BSP and quits. A running game goes away first;
/// with `relaunch` it is started again when the build is through. The result
/// arrives as a `game-cubemaps` event.
pub fn build_cubemaps(
    app: &tauri::AppHandle,
    bridge: &crate::bridge::Bridge,
    install: &GameInstall,
    map: &str,
    relaunch: bool,
) -> Result<String, String> {
    let bsp = install.game_dir.join("maps").join(format!("{map}.bsp"));
    if !bsp.is_file() {
        return Err(format!(
            "{} не найден: соберите карту с установкой в maps",
            bsp.display()
        ));
    }
    let exe = ["gmod.exe", "hl2.exe"]
        .iter()
        .map(|e| install.root.join(e))
        .find(|p| p.is_file())
        .ok_or_else(|| format!("gmod.exe не найден в {}", install.root.display()))?;
    if !bridge.game_exited() {
        bridge.kill_game();
        std::thread::sleep(std::time::Duration::from_secs(2));
    }
    let before = std::fs::metadata(&bsp).and_then(|m| m.modified()).ok();
    // sv_cheats for the command, mat_specular 0 so the faces are rendered without the old maps.
    let args = [
        "-game",
        "garrysmod",
        "-condebug",
        "-conclearlog",
        "-buildcubemaps",
        "+sv_cheats",
        "1",
        "+mat_specular",
        "0",
        "+map",
        map,
    ];
    let _ = std::fs::remove_file(install.game_dir.join("console.log"));
    let child = Command::new(&exe)
        .current_dir(&install.root)
        .args(args)
        .spawn()
        .map_err(|e| format!("не удалось запустить {}: {e}", exe.display()))?;
    bridge.set_child(child);
    let app = app.clone();
    let bridge = bridge.clone();
    let install = install.clone();
    let map_name = map.to_string();
    std::thread::spawn(move || {
        let started = Instant::now();
        let mut gone = 0;
        let timeout = loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            // gmod.exe hands over to a copy started by Steam: the first seconds
            // show no process at all, and one look is not enough.
            if started.elapsed().as_secs() >= 20 && bridge.game_exited() {
                gone += 1;
                if gone >= 3 {
                    break false;
                }
            } else {
                gone = 0;
            }
            if started.elapsed().as_secs() >= 600 {
                bridge.kill_game();
                break true;
            }
        };
        let after = std::fs::metadata(&bsp).and_then(|m| m.modified()).ok();
        let ok = !timeout && after.is_some() && after != before;
        let mut relaunched = false;
        if ok && relaunch {
            relaunched = launch_game(&app, &bridge, &install, &map_name, false, false).is_ok();
        }
        let done = CubemapsDone {
            ok,
            map: map_name,
            ms: started.elapsed().as_millis(),
            timeout,
            relaunched,
        };
        println!(
            "[game] cubemaps: ok {}, {} ms, timeout {}, relaunched {}",
            done.ok, done.ms, done.timeout, done.relaunched
        );
        let _ = app.emit("game-cubemaps", done);
    });
    Ok(format!("{} {}", exe.display(), args.join(" ")))
}

/// What the game's console said while the map loaded.
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameConsole {
    /// The log appeared and the map's name showed up in it.
    pub loaded: bool,
    pub lines: usize,
    /// Lines that look like errors, in order, at most fifty.
    pub errors: Vec<String>,
    /// Why the watch ended: `map`, `exit`, `timeout` or `nolog`.
    pub ended: String,
}

/// Substrings that mark a console line as a problem worth showing.
const ERROR_MARKS: [&str; 14] = [
    "Error",
    "ERROR",
    "error:",
    "Couldn't",
    "couldn't",
    "Could not",
    "Failed",
    "failed",
    "Missing",
    "missing",
    "not found",
    "Bad ",
    "Attempted to create unknown entity",
    "CModelLoader",
];

/// True for a console line the mapper should see.
pub fn is_console_error(line: &str) -> bool {
    let t = line.trim();
    if t.is_empty() {
        return false;
    }
    // Lua and material noise the map cannot fix.
    if t.starts_with("[") && t.contains("lua/") {
        return false;
    }
    ERROR_MARKS.iter().any(|m| t.contains(m))
}

/// Tails `console.log` while the game starts: every error line goes to the
/// window as a `game-log` event, and the watch ends twenty seconds after the
/// map's name appears, when the game exits, or after four minutes.
fn watch_console(
    app: &tauri::AppHandle,
    log_path: &Path,
    map: &str,
    mut exited: impl FnMut() -> bool,
) -> GameConsole {
    use std::io::{Read, Seek, SeekFrom};
    let started = Instant::now();
    let mut out = GameConsole::default();
    let mut offset: u64 = 0;
    let mut pending = String::new();
    let mut loaded_at: Option<Instant> = None;
    let map_lc = map.to_ascii_lowercase();
    loop {
        if let Ok(mut f) = std::fs::File::open(log_path) {
            if f.seek(SeekFrom::Start(offset)).is_ok() {
                let mut buf = String::new();
                if f.read_to_string(&mut buf).is_ok() && !buf.is_empty() {
                    offset += buf.len() as u64;
                    pending.push_str(&buf);
                    while let Some(nl) = pending.find('\n') {
                        let line = pending[..nl].trim_end_matches('\r').to_string();
                        pending.drain(..=nl);
                        out.lines += 1;
                        if !out.loaded && line.to_ascii_lowercase().contains(&map_lc) {
                            out.loaded = true;
                            loaded_at = Some(Instant::now());
                        }
                        if is_console_error(&line) {
                            if out.errors.len() < 50 {
                                out.errors.push(line.clone());
                            }
                            let _ = app.emit("game-log", line);
                        }
                    }
                }
            }
        }
        if let Some(t) = loaded_at {
            if t.elapsed().as_secs() >= 20 {
                out.ended = "map".into();
                break;
            }
        }
        if exited() {
            out.ended = "exit".into();
            break;
        }
        if started.elapsed().as_secs() >= 240 {
            out.ended = if offset == 0 {
                "nolog".into()
            } else {
                "timeout".into()
            };
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
    println!(
        "[game] console: {} lines, {} errors, loaded {}, ended {}",
        out.lines,
        out.errors.len(),
        out.loaded,
        out.ended
    );
    out
}

/// Splits a command line on spaces, keeping double-quoted parts together.
fn split_command(s: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut quoted = false;
    for c in s.chars() {
        match c {
            '"' => quoted = !quoted,
            c if c.is_whitespace() && !quoted => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

fn words(s: &str) -> Vec<String> {
    s.split_whitespace().map(|w| w.to_string()).collect()
}

/// Runs one tool, forwarding every output line; returns its exit code.
fn run_tool(
    app: &tauri::AppHandle,
    run: u64,
    step: &str,
    exe: &Path,
    args: &[String],
    cwd: &Path,
    cancel: &AtomicBool,
) -> std::io::Result<i32> {
    let mut child = Command::new(exe)
        .args(args)
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null())
        .spawn()?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app2 = app.clone();
    let step2 = step.to_string();
    let err_thread = stderr.map(|e| {
        std::thread::spawn(move || {
            for line in BufReader::new(e).lines().map_while(Result::ok) {
                log(&app2, run, &step2, line);
            }
        })
    });
    if let Some(out) = stdout {
        for line in BufReader::new(out).lines().map_while(Result::ok) {
            if cancel.load(Ordering::SeqCst) {
                let _ = child.kill();
                break;
            }
            // The tools print progress as "0...1...2...9" on one line; keep it.
            log(app, run, step, line);
        }
    }
    if let Some(t) = err_thread {
        let _ = t.join();
    }
    let status = child.wait()?;
    Ok(status.code().unwrap_or(-1))
}

#[cfg(test)]
mod tests {
    use super::split_command;

    #[test]
    fn quoted_arguments_stay_whole() {
        assert_eq!(
            split_command(r#"bspzip -addfile "C:\my maps\a.bsp" x.txt"#),
            vec!["bspzip", "-addfile", r"C:\my maps\a.bsp", "x.txt"]
        );
        assert!(split_command("   ").is_empty());
    }
}

/// Writes `<stem>__build.vmf` next to the map with every `prop_static` whose
/// `modelscale` is not 1 turned into a `prop_dynamic` (the only way Source
/// shows a scaled prop); returns its path and the count, or None when the map
/// has no such props.
fn scaled_static_props_workaround(vmf: &Path) -> std::io::Result<Option<(PathBuf, usize)>> {
    let text = std::fs::read_to_string(vmf)?;
    let (out, swapped) = swap_scaled_static_props(&text);
    if swapped == 0 {
        return Ok(None);
    }
    let stem = vmf
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let path = vmf.with_file_name(format!("{stem}__build.vmf"));
    std::fs::write(&path, out)?;
    Ok(Some((path, swapped)))
}

/// Text-level pass over the VMF's top-level `entity` blocks (point entities
/// have no nested solids to confuse it).
fn swap_scaled_static_props(text: &str) -> (String, usize) {
    fn key_value(line: &str) -> Option<(String, String)> {
        let t = line.trim();
        let mut parts = t.splitn(2, "\" \"");
        let k = parts.next()?.strip_prefix('"')?;
        let v = parts.next()?.strip_suffix('"')?;
        Some((k.to_ascii_lowercase(), v.to_string()))
    }
    let lines: Vec<&str> = text.lines().collect();
    let mut out: Vec<String> = Vec::with_capacity(lines.len());
    let mut swapped = 0;
    let mut i = 0;
    while i < lines.len() {
        let is_entity = lines[i].trim() == "entity"
            && lines.get(i + 1).map(|l| l.trim() == "{").unwrap_or(false);
        if !is_entity {
            out.push(lines[i].to_string());
            i += 1;
            continue;
        }
        // Collect the block up to its closing brace.
        let start = i;
        let mut depth = 0;
        let mut end = i;
        for (j, l) in lines.iter().enumerate().skip(i + 1) {
            let t = l.trim();
            if t == "{" {
                depth += 1;
            } else if t == "}" {
                depth -= 1;
                if depth == 0 {
                    end = j;
                    break;
                }
            }
        }
        if end == i {
            out.push(lines[i].to_string());
            i += 1;
            continue;
        }
        let block = &lines[start..=end];
        let scaled = block.iter().filter_map(|l| key_value(l)).any(|(k, v)| {
            k == "modelscale"
                && v.trim()
                    .parse::<f64>()
                    .map(|s| (s - 1.0).abs() > 1.0e-6)
                    .unwrap_or(false)
        });
        let is_static = block
            .iter()
            .filter_map(|l| key_value(l))
            .any(|(k, v)| k == "classname" && v.eq_ignore_ascii_case("prop_static"));
        for l in block {
            if scaled && is_static {
                if let Some((k, v)) = key_value(l) {
                    if k == "classname" && v.eq_ignore_ascii_case("prop_static") {
                        let indent: String = l.chars().take_while(|c| c.is_whitespace()).collect();
                        out.push(format!("{indent}\"classname\" \"prop_dynamic\""));
                        continue;
                    }
                }
            }
            out.push(l.to_string());
        }
        if scaled && is_static {
            swapped += 1;
        }
        i = end + 1;
    }
    let mut joined = out.join("\n");
    if text.ends_with('\n') {
        joined.push('\n');
    }
    (joined, swapped)
}

#[cfg(test)]
mod console_tests {
    use super::is_console_error;

    #[test]
    fn picks_out_the_lines_a_mapper_needs() {
        assert!(is_console_error(
            "Error loading model models/props_c17/chair02a.mdl"
        ));
        assert!(is_console_error(
            "Couldn't find material brick/brickwall001x"
        ));
        assert!(is_console_error(
            "Attempted to create unknown entity type my_ent!"
        ));
        assert!(is_console_error(
            "CModelLoader::Map_IsValid: No such map 'maps/x.bsp'"
        ));
        assert!(!is_console_error("Map: gm_test"));
        assert!(!is_console_error(
            "ConVarRef mat_dxlevel doesn't point to an existing ConVar"
        ));
        assert!(!is_console_error(
            "[addon] lua/autorun/x.lua:12: attempt to index a nil value (Error)"
        ));
        assert!(!is_console_error(""));
    }
}

#[cfg(test)]
mod swap_tests {
    use super::swap_scaled_static_props;

    #[test]
    fn swaps_only_scaled_static_props() {
        let vmf = "entity\n{\n\t\"id\" \"1\"\n\t\"classname\" \"prop_static\"\n\t\"modelscale\" \"2\"\n\teditor\n\t{\n\t\t\"color\" \"1 1 1\"\n\t}\n}\nentity\n{\n\t\"id\" \"2\"\n\t\"classname\" \"prop_static\"\n}\n";
        let (out, n) = swap_scaled_static_props(vmf);
        assert_eq!(n, 1);
        assert!(out.contains("\"classname\" \"prop_dynamic\""));
        assert_eq!(out.matches("\"classname\" \"prop_static\"").count(), 1);
        assert_eq!(out.lines().count(), vmf.lines().count());
    }
}
