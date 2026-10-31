//! Bridge to a running Garry's Mod.
//!
//! The game's Lua may not talk HTTP to private addresses from the client, so
//! the bridge goes through files in `garrysmod/data/gme_bridge`: the editor
//! drops numbered `cmd_*.json` files with commands (teleport, move an entity,
//! build cubemaps, reload); the addon the editor writes into
//! `garrysmod/addons/gme_bridge` runs them and deletes the files, appends its
//! reports (hello, cubemaps done) to `events.txt` and rewrites `pos.json`
//! with the player's position twice a second.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::process::Child;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;
use serde_json::Value;
use tauri::Emitter;

/// Folder under `garrysmod/data` the addon and the editor share.
pub const DATA_DIR: &str = "gme_bridge";

#[derive(Default)]
struct Inner {
    /// `garrysmod/data/gme_bridge`, once a game was launched.
    dir: Option<PathBuf>,
    queue: VecDeque<Value>,
    child: Option<Child>,
    /// The editor started a game; `gmod.exe` relaunches itself through Steam, so the
    /// child exits at once and the real game is found by name.
    launched: bool,
    /// When the editor last launched the game, for crash dumps newer than that.
    launched_at: Option<SystemTime>,
    /// Last look at the process list: when and whether `gmod.exe` was there.
    seen_process: Option<(Instant, bool)>,
    /// Number of the last command file written.
    seq: u64,
    /// How much of `events.txt` has been read.
    events_offset: u64,
    /// Modification time of `pos.json` at the last read.
    pos_mtime: Option<SystemTime>,
    map: Option<String>,
    last_seen: Option<Instant>,
    last_pos: Option<[f64; 5]>,
    /// Reports the addon wrote, newest last, at most a hundred.
    reports: VecDeque<Value>,
}

/// How a screenshot is taken.
#[derive(serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ShotOptions {
    pub quality: u8,
    /// A free camera for the shot: x, y, z, pitch, yaw, fov (0 keeps the game's).
    pub camera: Option<[f64; 6]>,
    /// Keep the HUD in the picture.
    pub hud: bool,
}

/// Shared state of the bridge; cheap to clone.
#[derive(Clone, Default)]
pub struct Bridge {
    inner: Arc<Mutex<Inner>>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BridgeStatus {
    /// A game was launched and the shared folder exists.
    pub ready: bool,
    /// The addon reported within the last three seconds.
    pub connected: bool,
    /// The game the editor started is still running.
    pub running: bool,
    pub map: Option<String>,
    /// Player eye position and angles: x, y, z, pitch, yaw.
    pub pos: Option<[f64; 5]>,
    pub queued: usize,
    /// The shared folder (`garrysmod/data/gme_bridge`), once a game was launched.
    pub data_dir: Option<String>,
    /// Why the game is gone, when it was launched and is not running: crash dump, normal close, unknown.
    pub exit_hint: Option<String>,
}

impl Bridge {
    /// Starts the thread that exchanges files with the addon five times a second.
    pub fn start(&self, app: tauri::AppHandle) {
        let bridge = self.clone();
        std::thread::spawn(move || loop {
            bridge.tick(&app);
            std::thread::sleep(Duration::from_millis(200));
        });
    }

    /// Prepares the shared folder for a fresh launch: old files go away.
    pub fn prepare(&self, game_dir: &Path) -> std::io::Result<()> {
        let dir = game_dir.join("data").join(DATA_DIR);
        std::fs::create_dir_all(&dir)?;
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let _ = std::fs::remove_file(e.path());
            }
        }
        let mut g = self.inner.lock().expect("bridge");
        g.dir = Some(dir);
        g.seq = 0;
        g.events_offset = 0;
        g.pos_mtime = None;
        Ok(())
    }

    /// Queues a command for the addon's next poll.
    pub fn send(&self, cmd: Value) {
        let mut g = self.inner.lock().expect("bridge");
        g.queue.push_back(cmd);
        while g.queue.len() > 64 {
            g.queue.pop_front();
        }
    }

    pub fn set_child(&self, child: Child) {
        let mut g = self.inner.lock().expect("bridge");
        g.child = Some(child);
        g.launched = true;
        g.launched_at = Some(SystemTime::now());
        g.seen_process = Some((Instant::now(), true));
        g.map = None;
        g.last_seen = None;
        g.last_pos = None;
        g.queue.clear();
        g.reports.clear();
    }

    /// Whether the game is running: the child, or (after Steam's relaunch) a
    /// `gmod.exe` in the process list, looked up at most every two seconds.
    fn game_running(g: &mut Inner) -> bool {
        if let Some(c) = g.child.as_mut() {
            if !matches!(c.try_wait(), Ok(Some(_))) {
                return true;
            }
        }
        if !g.launched {
            return false;
        }
        if g.last_seen
            .map(|t| t.elapsed() < Duration::from_secs(5))
            .unwrap_or(false)
        {
            return true;
        }
        match g.seen_process {
            Some((at, alive)) if at.elapsed() < Duration::from_secs(2) => alive,
            _ => {
                let alive = game_process_exists();
                g.seen_process = Some((Instant::now(), alive));
                alive
            }
        }
    }

    /// True once the game the editor started has exited (or none was started).
    pub fn game_exited(&self) -> bool {
        let mut g = self.inner.lock().expect("bridge");
        !Self::game_running(&mut g)
    }

    pub fn kill_game(&self) -> bool {
        let mut g = self.inner.lock().expect("bridge");
        let child = match g.child.as_mut() {
            Some(c) => c.kill().is_ok(),
            None => false,
        };
        let by_name = g.launched && kill_game_process();
        g.seen_process = Some((Instant::now(), false));
        g.last_seen = None;
        child || by_name
    }

    pub fn status(&self) -> BridgeStatus {
        let mut g = self.inner.lock().expect("bridge");
        let running = Self::game_running(&mut g);
        BridgeStatus {
            ready: g.dir.is_some(),
            connected: g
                .last_seen
                .map(|t| t.elapsed() < Duration::from_secs(3))
                .unwrap_or(false),
            running,
            map: g.map.clone(),
            pos: g.last_pos,
            queued: g.queue.len(),
            data_dir: g.dir.as_ref().map(|d| d.display().to_string()),
            exit_hint: if g.launched && !running {
                Some(Self::exit_hint(&g))
            } else {
                None
            },
        }
    }

    /// Game root from the shared folder: `<root>/garrysmod/data/gme_bridge`.
    fn game_dir(g: &Inner) -> Option<PathBuf> {
        g.dir
            .as_ref()
            .and_then(|d| d.parent())
            .and_then(|d| d.parent())
            .map(Path::to_path_buf)
    }

    /// A crash dump newer than the launch, a normal shutdown in the console log, or nothing to say.
    fn exit_hint(g: &Inner) -> String {
        let Some(game_dir) = Self::game_dir(g) else {
            return "игра завершилась (папка моста неизвестна)".into();
        };
        let since = g.launched_at.unwrap_or(SystemTime::UNIX_EPOCH);
        let mut dumps: Vec<(SystemTime, PathBuf)> = Vec::new();
        for dir in [
            game_dir.parent().map(Path::to_path_buf),
            Some(game_dir.clone()),
        ]
        .into_iter()
        .flatten()
        {
            if let Ok(rd) = std::fs::read_dir(&dir) {
                for e in rd.flatten() {
                    let p = e.path();
                    if p.extension()
                        .and_then(|x| x.to_str())
                        .map(|x| x.eq_ignore_ascii_case("mdmp"))
                        .unwrap_or(false)
                    {
                        if let Ok(m) = e.metadata().and_then(|m| m.modified()) {
                            if m >= since {
                                dumps.push((m, p));
                            }
                        }
                    }
                }
            }
        }
        if let Some((_, p)) = dumps.into_iter().max_by_key(|(t, _)| *t) {
            return format!("игра завершилась аварийно, дамп: {}", p.display());
        }
        let log = std::fs::read_to_string(game_dir.join("console.log")).unwrap_or_default();
        let tail: String = log
            .chars()
            .rev()
            .take(4000)
            .collect::<String>()
            .chars()
            .rev()
            .collect();
        if tail.contains("Host_Shutdown") || tail.contains("Disconnect") || tail.contains("quit") {
            "игра завершилась штатно (Host_Shutdown в console.log)".into()
        } else if tail.contains("Engine error") || tail.contains("Fatal") {
            let line = tail
                .lines()
                .rev()
                .find(|l| l.contains("Engine error") || l.contains("Fatal"))
                .unwrap_or("");
            format!("игра завершилась с ошибкой движка: {}", line.trim())
        } else {
            "игра завершилась, причина в console.log не указана, дампа нет".into()
        }
    }

    /// Waits for a report matching `pred`, polling the addon's events.
    fn wait_report(&self, pred: impl Fn(&Value) -> bool, timeout: Duration) -> Option<Value> {
        let started = Instant::now();
        loop {
            if let Some(r) = self.reports().iter().rev().find(|r| pred(r)) {
                return Some(r.clone());
            }
            if started.elapsed() > timeout {
                return None;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }

    fn next_seq() -> String {
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis().to_string())
            .unwrap_or_else(|_| "0".into())
    }

    /// Runs Lua in the game (client or server realm) and returns the addon's report.
    pub fn lua(&self, code: &str, realm: &str, timeout: Duration) -> Result<Value, String> {
        let seq = Self::next_seq();
        self.send(serde_json::json!({ "type": "lua", "seq": seq, "realm": realm, "code": code }));
        self.wait_report(
            |r| r["event"] == "lua" && r["seq"].as_str() == Some(&seq),
            timeout,
        )
        .ok_or_else(|| "игра не ответила на Lua-запрос: проверьте подключение".to_string())
    }

    /// Moves the player and returns the pose as it settled.
    pub fn teleport(
        &self,
        pos: [f64; 3],
        pitch: f64,
        yaw: f64,
        timeout: Duration,
    ) -> Result<Value, String> {
        let seq = Self::next_seq();
        self.send(serde_json::json!({ "type": "teleport", "seq": seq, "x": pos[0], "y": pos[1], "z": pos[2], "pitch": pitch, "yaw": yaw }));
        self.wait_report(
            |r| r["event"] == "teleported" && r["seq"].as_str() == Some(&seq),
            timeout,
        )
        .ok_or_else(|| "игра не подтвердила телепортацию".to_string())
    }

    /// Runs a console command in the game and returns what the console logged in the next moment.
    pub fn console(&self, cmd: &str, settle: Duration) -> Result<Vec<String>, String> {
        let game_dir = Self::game_dir(&self.inner.lock().expect("bridge"))
            .ok_or("игра не запущена из редактора")?;
        let log = game_dir.join("console.log");
        let before = std::fs::metadata(&log).map(|m| m.len()).unwrap_or(0);
        self.send(serde_json::json!({ "type": "console", "cmd": cmd }));
        std::thread::sleep(settle);
        let text = std::fs::read(&log)
            .map(|b| String::from_utf8_lossy(&b).into_owned())
            .unwrap_or_default();
        let new = text.get(before as usize..).unwrap_or("");
        Ok(new
            .lines()
            .map(|l| l.trim_end().to_string())
            .filter(|l| !l.is_empty())
            .take(200)
            .collect())
    }

    /// Asks the addon for a screenshot and waits for it: the JPEG bytes of
    /// what the player sees, plus the report with the player's pose.
    pub fn screenshot(
        &self,
        opts: &ShotOptions,
        timeout: Duration,
    ) -> Result<(Vec<u8>, Value), String> {
        let seq = Self::next_seq();
        let dir = self
            .inner
            .lock()
            .expect("bridge")
            .dir
            .clone()
            .ok_or("игра не запущена из редактора")?;
        let mut cmd = serde_json::json!({ "type": "screenshot", "seq": seq, "quality": opts.quality.clamp(20, 95), "hud": opts.hud });
        if let Some(c) = &opts.camera {
            cmd["camera"] = serde_json::json!({ "x": c[0], "y": c[1], "z": c[2], "pitch": c[3], "yaw": c[4], "fov": if c[5] > 0.0 { Some(c[5]) } else { None } });
        }
        self.send(cmd);
        let r = self
            .wait_report(
                |r| r["event"] == "shot" && r["seq"].as_str() == Some(&seq),
                timeout,
            )
            .ok_or(
                "игра не прислала снимок: проверьте подключение (мост опрашивается раз в 0,25 с)",
            )?;
        if let Some(e) = r["error"].as_str() {
            return Err(format!("не удалось сделать снимок в игре: {e}"));
        }
        let path = dir.join("shot.jpg");
        let bytes = std::fs::read(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        Ok((bytes, r))
    }

    /// The reports received so far, oldest first; the autotests read them.
    pub fn reports(&self) -> Vec<Value> {
        self.inner
            .lock()
            .expect("bridge")
            .reports
            .iter()
            .cloned()
            .collect()
    }

    /// One exchange: queued commands out as a file, the position and new events in.
    fn tick(&self, app: &tauri::AppHandle) {
        let (dir, cmds, seq) = {
            let mut g = self.inner.lock().expect("bridge");
            let Some(dir) = g.dir.clone() else { return };
            let cmds: Vec<Value> = g.queue.drain(..).collect();
            if !cmds.is_empty() {
                g.seq += 1;
            }
            (dir, cmds, g.seq)
        };
        if !cmds.is_empty() {
            // Written whole under another name, then renamed: the addon never sees a half file.
            let tmp = dir.join(format!("cmd_{seq:06}.tmp"));
            let fin = dir.join(format!("cmd_{seq:06}.json"));
            let body = serde_json::json!({ "commands": cmds }).to_string();
            if let Err(e) = std::fs::write(&tmp, body).and_then(|_| std::fs::rename(&tmp, &fin)) {
                println!("[bridge] command file: {e}");
            }
        }
        // The player's position: a file the addon rewrites twice a second.
        let pos_path = dir.join("pos.json");
        if let Ok(meta) = std::fs::metadata(&pos_path) {
            let mtime = meta.modified().ok();
            let fresh = {
                let g = self.inner.lock().expect("bridge");
                mtime.is_some() && mtime != g.pos_mtime
            };
            if fresh {
                if let Ok(text) = std::fs::read_to_string(&pos_path) {
                    if let Ok(v) = serde_json::from_str::<Value>(&text) {
                        let mut g = self.inner.lock().expect("bridge");
                        g.pos_mtime = mtime;
                        g.last_seen = Some(Instant::now());
                        let f = |k: &str| v.get(k).and_then(Value::as_f64).unwrap_or(0.0);
                        g.last_pos = Some([f("x"), f("y"), f("z"), f("pitch"), f("yaw")]);
                        if let Some(m) = v.get("map").and_then(Value::as_str) {
                            g.map = Some(m.to_string());
                        }
                    }
                }
            }
        }
        // Events: JSON lines appended by the addon, read past the last offset.
        let events_path = dir.join("events.txt");
        let offset = self.inner.lock().expect("bridge").events_offset;
        let Ok(meta) = std::fs::metadata(&events_path) else {
            return;
        };
        if meta.len() <= offset {
            if meta.len() < offset {
                // A new game truncated the file.
                self.inner.lock().expect("bridge").events_offset = 0;
            }
            return;
        }
        let Ok(text) = std::fs::read_to_string(&events_path) else {
            return;
        };
        let Some(rest) = text.get(offset as usize..) else {
            return;
        };
        let mut consumed = 0usize;
        for line in rest.split_inclusive('\n') {
            if !line.ends_with('\n') {
                break;
            }
            consumed += line.len();
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<Value>(line) {
                Ok(v) => self.report(app, v),
                Err(e) => println!("[bridge] bad event line: {e}"),
            }
        }
        self.inner.lock().expect("bridge").events_offset = offset + consumed as u64;
    }

    /// A report from the addon: remembered, printed and sent to the window.
    fn report(&self, app: &tauri::AppHandle, v: Value) {
        {
            let mut g = self.inner.lock().expect("bridge");
            g.last_seen = Some(Instant::now());
            if let Some(m) = v.get("map").and_then(Value::as_str) {
                g.map = Some(m.to_string());
            }
            println!(
                "[bridge] {}",
                v.to_string().chars().take(200).collect::<String>()
            );
            g.reports.push_back(v.clone());
            while g.reports.len() > 100 {
                g.reports.pop_front();
            }
        }
        let _ = app.emit("game-bridge", v);
    }
}

/// The game's process name; `gmod.exe` starts itself again through Steam.
const GAME_EXE: &str = "gmod.exe";

/// Whether a game process is in the process list (Windows only; the game is Windows-only too).
fn game_process_exists() -> bool {
    if !cfg!(windows) {
        return false;
    }
    std::process::Command::new("tasklist")
        .args([
            "/FI",
            &format!("IMAGENAME eq {GAME_EXE}"),
            "/NH",
            "/FO",
            "CSV",
        ])
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .to_ascii_lowercase()
                .contains(GAME_EXE)
        })
        .unwrap_or(false)
}

/// Ends every game process by name.
fn kill_game_process() -> bool {
    if !cfg!(windows) {
        return false;
    }
    std::process::Command::new("taskkill")
        .args(["/F", "/IM", GAME_EXE])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Writes the addon into `garrysmod/addons/gme_bridge`.
pub fn install_addon(game_dir: &Path) -> std::io::Result<()> {
    let client_dir = game_dir.join("addons/gme_bridge/lua/autorun/client");
    let server_dir = game_dir.join("addons/gme_bridge/lua/autorun/server");
    std::fs::create_dir_all(&client_dir)?;
    std::fs::create_dir_all(&server_dir)?;
    std::fs::write(client_dir.join("gme_bridge.lua"), CLIENT_LUA)?;
    std::fs::write(server_dir.join("gme_bridge_sv.lua"), SERVER_LUA)?;
    std::fs::write(
        game_dir.join("addons/gme_bridge/addon.txt"),
        "\"AddonInfo\"\n{\n\t\"name\" \"GMod Map Editor bridge\"\n\t\"version\" \"4\"\n\t\"author_name\" \"Mallet\"\n\t\"info\" \"Written by the editor on every launch; talks to it through data/gme_bridge.\"\n}\n",
    )?;
    Ok(())
}

const CLIENT_LUA: &str = r#"-- Written by Mallet on every launch. Exchanges files with the
-- editor in data/gme_bridge: cmd_*.json in, events.txt and pos.json out.
if not CLIENT then return end
local DIR = "gme_bridge"
file.CreateDir(DIR)

local function report(t)
    t.map = game.GetMap()
    file.Append(DIR .. "/events.txt", util.TableToJSON(t) .. "\n")
end

local function run(c)
    if c.type == "teleport" then
        RunConsoleCommand("gme_setpos", tostring(c.x), tostring(c.y), tostring(c.z), tostring(c.pitch or 0), tostring(c.yaw or 0), tostring(c.seq or ""))
    elseif c.type == "move_entity" then
        RunConsoleCommand("gme_moveent", tostring(c.id), tostring(c.x), tostring(c.y), tostring(c.z), tostring(c.pitch or 0), tostring(c.yaw or 0), tostring(c.roll or 0))
    elseif c.type == "set_keyvalue" then
        RunConsoleCommand("gme_setkv", tostring(c.id), tostring(c.key), tostring(c.value))
    elseif c.type == "reload" then
        RunConsoleCommand("gme_reload")
    elseif c.type == "say" then
        chat.AddText(Color(120, 200, 255), "[Mallet] ", Color(255, 255, 255), tostring(c.text or ""))
    elseif c.type == "screenshot" then
        pendingShot = c
        shotFrames = 0
        if c.camera then
            shotPrevCam = camOverride
            shotTempCam = true
            camOverride = { pos = Vector(tonumber(c.camera.x) or 0, tonumber(c.camera.y) or 0, tonumber(c.camera.z) or 0), ang = Angle(tonumber(c.camera.pitch) or 0, tonumber(c.camera.yaw) or 0, 0), fov = tonumber(c.camera.fov) }
        end
    elseif c.type == "hud" then
        hudHidden = not c.on
    elseif c.type == "look" then
        RunConsoleCommand("gme_look", tostring(c.pitch or 0), tostring(c.yaw or 0))
    elseif c.type == "noclip" then
        RunConsoleCommand("gme_noclip", c.on and "1" or "0")
    elseif c.type == "viewmodel" then
        hideViewmodel = not c.on
    elseif c.type == "camera" then
        if c.on == false then camOverride = nil
        else camOverride = { pos = Vector(tonumber(c.x) or 0, tonumber(c.y) or 0, tonumber(c.z) or 0), ang = Angle(tonumber(c.pitch) or 0, tonumber(c.yaw) or 0, 0), fov = tonumber(c.fov) } end
    elseif c.type == "console" then
        LocalPlayer():ConCommand(tostring(c.cmd or ""))
    elseif c.type == "lua" then
        if c.realm == "server" then
            file.Write(DIR .. "/lua_" .. tostring(c.seq) .. ".txt", tostring(c.code or ""))
            RunConsoleCommand("gme_lua", tostring(c.seq))
        else
            report(gmeRunLua(tostring(c.seq), tostring(c.code or ""), "client"))
        end
    end
end

-- Runs a piece of Lua and describes what came back; shared with the server file.
function gmeRunLua(seq, code, realm)
    local fn = CompileString("return (function()\n" .. code .. "\nend)()", "gme_" .. realm, false)
    if type(fn) == "string" then return { event = "lua", seq = seq, realm = realm, ok = false, result = fn } end
    local ok, res = pcall(fn)
    local out
    if istable(res) then
        local ok2, json = pcall(util.TableToJSON, res)
        out = ok2 and json or tostring(res)
    elseif isentity(res) then
        out = tostring(res) .. (IsValid(res) and (" class=" .. res:GetClass() .. " name=" .. res:GetName() .. " pos=" .. tostring(res:GetPos())) or " (invalid)")
    else
        out = tostring(res)
    end
    return { event = "lua", seq = seq, realm = realm, ok = ok, result = string.sub(out, 1, 20000) }
end

-- A free camera for screenshots and the live view, and a hidden viewmodel.
camOverride = nil
hideViewmodel = false
hook.Add("CalcView", "gme_bridge_cam", function(_, _, _, fov)
    local c = camOverride
    if not c then return end
    return { origin = c.pos, angles = c.ang, fov = c.fov or fov, drawviewer = true }
end)
hook.Add("PreDrawViewModel", "gme_bridge_vm", function()
    if hideViewmodel or camOverride or pendingShot then return true end
end)

-- A screenshot of what the player sees, as JPEG in the shared folder; the
-- editor asked with a seq and waits for the report that echoes it.
pendingShot = nil
shotFrames = 0
shotTempCam = false
shotPrevCam = nil
hudHidden = false
hook.Add("HUDShouldDraw", "gme_bridge_hud", function()
    if hudHidden or (pendingShot and pendingShot.hud ~= true) then return false end
end)
hook.Add("PostRender", "gme_bridge_shot", function()
    local c = pendingShot
    if not c then return end
    shotFrames = shotFrames + 1
    if shotFrames < 3 then return end
    pendingShot = nil
    if shotTempCam then
        shotTempCam = false
        timer.Simple(0, function() camOverride = shotPrevCam end)
    end
    local w, h = ScrW(), ScrH()
    local ok, data = pcall(render.Capture, { format = "jpeg", quality = tonumber(c.quality) or 80, x = 0, y = 0, w = w, h = h })
    if not ok or not data then
        report({ event = "shot", seq = c.seq, error = tostring(data) })
        return
    end
    file.Write(DIR .. "/shot.jpg", data)
    local p = LocalPlayer()
    local pos, ang = IsValid(p) and p:EyePos() or Vector(), IsValid(p) and p:EyeAngles() or Angle()
    if camOverride then pos, ang = camOverride.pos, camOverride.ang end
    report({ event = "shot", seq = c.seq, file = "shot.jpg", w = w, h = h, bytes = #data, x = pos.x, y = pos.y, z = pos.z, pitch = ang.p, yaw = ang.y })
end)

timer.Create("gme_bridge_poll", 0.25, 0, function()
    local files = file.Find(DIR .. "/cmd_*.json", "DATA")
    if not files or #files == 0 then return end
    table.sort(files)
    for _, name in ipairs(files) do
        local path = DIR .. "/" .. name
        local text = file.Read(path, "DATA")
        file.Delete(path)
        local t = text and util.JSONToTable(text)
        if t and t.commands then
            for _, c in ipairs(t.commands) do
                run(c)
                report({ event = "ran", type = c.type, id = c.id })
            end
        end
    end
end)

timer.Create("gme_bridge_pos", 0.5, 0, function()
    local p = LocalPlayer()
    if not IsValid(p) then return end
    local pos, ang = p:EyePos(), p:EyeAngles()
    file.Write(DIR .. "/pos.json", util.TableToJSON({ x = pos.x, y = pos.y, z = pos.z, pitch = ang.p, yaw = ang.y, map = game.GetMap() }))
end)

hook.Add("InitPostEntity", "gme_bridge_hello", function()
    print("[gme_bridge] map " .. game.GetMap() .. " loaded, reporting through data/" .. DIR)
    timer.Simple(1, function() report({ event = "hello" }) end)
end)
print("[gme_bridge] client addon loaded, files in data/" .. DIR)
"#;

const SERVER_LUA: &str = r#"-- Written by Mallet on every launch: the server side of the bridge.
if not SERVER then return end

local DIR = "gme_bridge"
local function report(t)
    t.map = game.GetMap()
    file.Append(DIR .. "/events.txt", util.TableToJSON(t) .. "\n")
end

concommand.Add("gme_setpos", function(ply, _, args)
    if not IsValid(ply) then return end
    local x, y, z = tonumber(args[1]), tonumber(args[2]), tonumber(args[3])
    if not (x and y and z) then return end
    if ply:GetMoveType() ~= MOVETYPE_NOCLIP then ply:SetMoveType(MOVETYPE_NOCLIP) end
    ply:SetPos(Vector(x, y, z))
    ply:SetEyeAngles(Angle(tonumber(args[4]) or 0, tonumber(args[5]) or 0, 0))
    ply:SetLocalVelocity(Vector(0, 0, 0))
    local seq = args[6]
    if seq and seq ~= "" then
        -- The pose as it settled a few ticks later: what a screenshot will show.
        timer.Simple(0.15, function()
            if not IsValid(ply) then return end
            ply:SetLocalVelocity(Vector(0, 0, 0))
            local p, a = ply:EyePos(), ply:EyeAngles()
            report({ event = "teleported", seq = seq, x = p.x, y = p.y, z = p.z, pitch = a.p, yaw = a.y, movetype = ply:GetMoveType() })
        end)
    end
end)

-- Lua from the editor: the client wrote it to a file, the result goes back as a report.
concommand.Add("gme_lua", function(_, _, args)
    local seq = tostring(args[1] or "")
    local path = DIR .. "/lua_" .. seq .. ".txt"
    local code = file.Read(path, "DATA")
    file.Delete(path)
    if not code then report({ event = "lua", seq = seq, realm = "server", ok = false, result = "no code file" }) return end
    report(gmeRunLua(seq, code, "server"))
end)

function gmeRunLua(seq, code, realm)
    local fn = CompileString("return (function()\n" .. code .. "\nend)()", "gme_" .. realm, false)
    if type(fn) == "string" then return { event = "lua", seq = seq, realm = realm, ok = false, result = fn } end
    local ok, res = pcall(fn)
    local out
    if istable(res) then
        local ok2, json = pcall(util.TableToJSON, res)
        out = ok2 and json or tostring(res)
    elseif isentity(res) then
        out = tostring(res) .. (IsValid(res) and (" class=" .. res:GetClass() .. " name=" .. res:GetName() .. " pos=" .. tostring(res:GetPos())) or " (invalid)")
    else
        out = tostring(res)
    end
    return { event = "lua", seq = seq, realm = realm, ok = ok, result = string.sub(out, 1, 20000) }
end

-- Finds a map entity by its Hammer id (the VMF id), else by creation index.
local function findEntity(id)
    for _, ent in ipairs(ents.GetAll()) do
        local kv = ent:GetKeyValues()
        if kv and tonumber(kv.hammerid) == id then return ent end
    end
    return ents.GetMapCreatedEntity(id)
end

concommand.Add("gme_moveent", function(_, _, args)
    local id, x, y, z = tonumber(args[1]), tonumber(args[2]), tonumber(args[3]), tonumber(args[4])
    if not (id and x and y and z) then return end
    local ent = findEntity(id)
    if not IsValid(ent) then print("[gme_bridge] no entity with hammerid " .. id) return end
    ent:SetPos(Vector(x, y, z))
    if args[5] then ent:SetAngles(Angle(tonumber(args[5]) or 0, tonumber(args[6]) or 0, tonumber(args[7]) or 0)) end
    print("[gme_bridge] moved " .. ent:GetClass() .. " " .. id .. " to " .. x .. " " .. y .. " " .. z)
end)

-- A key of a map entity, the way the map would have set it; model and skin have their own setters.
concommand.Add("gme_setkv", function(_, _, args)
    local id, key, value = tonumber(args[1]), args[2], args[3] or ""
    if not (id and key) then return end
    local ent = findEntity(id)
    if not IsValid(ent) then print("[gme_bridge] no entity with hammerid " .. id) return end
    if key == "model" then
        if util.IsValidModel(value) then ent:SetModel(value) end
    elseif key == "skin" then
        ent:SetSkin(tonumber(value) or 0)
    elseif key == "rendercolor" then
        local r, g, b = string.match(value, "(%d+)%s+(%d+)%s+(%d+)")
        if r then ent:SetColor(Color(tonumber(r), tonumber(g), tonumber(b), 255)) end
    elseif key == "origin" or key == "angles" or key == "hammerid" or key == "classname" then
        -- Moves come through gme_moveent; the rest would break the lookup.
    else
        ent:SetKeyValue(key, value)
    end
    print("[gme_bridge] " .. ent:GetClass() .. " " .. id .. ": " .. key .. " = " .. value)
end)

concommand.Add("gme_reload", function()
    game.ConsoleCommand("changelevel " .. game.GetMap() .. "\n")
end)

concommand.Add("gme_look", function(ply, _, args)
    if not IsValid(ply) then return end
    ply:SetEyeAngles(Angle(tonumber(args[1]) or 0, tonumber(args[2]) or 0, 0))
end)

concommand.Add("gme_noclip", function(ply, _, args)
    if not IsValid(ply) then return end
    ply:SetMoveType(args[1] == "1" and MOVETYPE_NOCLIP or MOVETYPE_WALK)
end)
"#;

#[cfg(test)]
mod tests {
    use super::*;

    /// A command goes out as one whole file; events and the position come back in.
    #[test]
    fn files_round_trip() {
        let dir = std::env::temp_dir().join(format!("gme_bridge_test_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let bridge = Bridge::default();
        bridge.prepare(&dir).unwrap();
        let shared = dir.join("data").join(DATA_DIR);
        assert!(shared.is_dir());
        bridge.send(serde_json::json!({ "type": "say", "text": "hi" }));
        {
            // The command file is written on the next tick; the test does that part by hand.
            let mut g = bridge.inner.lock().unwrap();
            let cmds: Vec<Value> = g.queue.drain(..).collect();
            g.seq += 1;
            let body = serde_json::json!({ "commands": cmds }).to_string();
            std::fs::write(shared.join("cmd_000001.json"), body).unwrap();
        }
        let text = std::fs::read_to_string(shared.join("cmd_000001.json")).unwrap();
        assert!(text.contains("\"say\""));
        std::fs::write(
            shared.join("pos.json"),
            "{\"x\":1,\"y\":2,\"z\":3,\"pitch\":4,\"yaw\":5,\"map\":\"m\"}",
        )
        .unwrap();
        std::fs::write(
            shared.join("events.txt"),
            "{\"event\":\"hello\",\"map\":\"m\"}\n{\"event\":\"cubemaps_done\"}\n",
        )
        .unwrap();
        // Without an app handle the reports are read the same way the tick does it.
        let text = std::fs::read_to_string(shared.join("events.txt")).unwrap();
        let events: Vec<Value> = text
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| serde_json::from_str(l).unwrap())
            .collect();
        assert_eq!(events.len(), 2);
        assert_eq!(events[1]["event"], "cubemaps_done");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
