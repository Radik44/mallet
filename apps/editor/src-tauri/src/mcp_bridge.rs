//! Claude Code reaches the editor's tools through MCP. Claude Code starts
//! this very executable as an MCP server over stdio (`--mcp-bridge ADDR
//! TOKEN`); that child forwards `tools/list` and `tools/call` over a loopback
//! socket to the running editor, whose bridge asks the webview to run the
//! tool and hands the answer back. Everything on the wire is one JSON object
//! per line.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};

/// Where the editor's events go: the webview's channel for the current run.
pub type Sink = Arc<dyn Fn(Value) + Send + Sync>;

/// A tool call waits this long for the webview (confirmations included).
const CALL_TIMEOUT: Duration = Duration::from_secs(30 * 60);

/// The editor's side: a loopback listener the child connects to.
pub struct Bridge {
    port: u16,
    token: String,
    tools: Mutex<Value>,
    sink: Mutex<Option<Sink>>,
    pending: Mutex<HashMap<String, mpsc::Sender<Value>>>,
    next: AtomicU64,
}

impl Bridge {
    /// Binds a free loopback port and serves connections on a thread.
    pub fn start() -> std::io::Result<Arc<Bridge>> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let port = listener.local_addr()?.port();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let token = format!("{:x}-{:x}-{:x}", std::process::id(), nanos, port);
        let bridge = Arc::new(Bridge {
            port,
            token,
            tools: Mutex::new(json!([])),
            sink: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            next: AtomicU64::new(1),
        });
        let accept = bridge.clone();
        std::thread::Builder::new()
            .name("mcp-bridge".into())
            .spawn(move || {
                for stream in listener.incoming().flatten() {
                    let b = accept.clone();
                    std::thread::spawn(move || b.serve(stream));
                }
            })?;
        Ok(bridge)
    }

    pub fn addr(&self) -> String {
        format!("127.0.0.1:{}", self.port)
    }

    pub fn token(&self) -> &str {
        &self.token
    }

    /// A run starts: these tools, events to this sink.
    pub fn begin(&self, tools: Value, sink: Sink) {
        *self.tools.lock().expect("tools") = tools;
        *self.sink.lock().expect("sink") = Some(sink);
    }

    /// The run is over: calls still waiting get an error, later ones are refused.
    pub fn end(&self) {
        *self.sink.lock().expect("sink") = None;
        let waiting: Vec<_> = self.pending.lock().expect("pending").drain().collect();
        for (_, tx) in waiting {
            let _ = tx.send(tool_error("the editor stopped the run"));
        }
    }

    /// The webview's answer to a call; false when nothing waits under that id.
    pub fn reply(&self, id: &str, value: Value) -> bool {
        match self.pending.lock().expect("pending").remove(id) {
            Some(tx) => tx.send(value).is_ok(),
            None => false,
        }
    }

    /// One request from the child, already parsed.
    pub fn handle(&self, req: &Value) -> Value {
        match req["method"].as_str() {
            Some("tools/list") => json!({ "tools": mcp_tools(&self.tools.lock().expect("tools")) }),
            Some("tools/call") => self.call(
                req["params"]["name"].as_str().unwrap_or(""),
                req["params"]["arguments"].clone(),
            ),
            _ => tool_error("unknown bridge method"),
        }
    }

    fn call(&self, name: &str, input: Value) -> Value {
        let Some(sink) = self.sink.lock().expect("sink").clone() else {
            return tool_error("the editor is not running the assistant now");
        };
        let id = format!("call_{}", self.next.fetch_add(1, Ordering::Relaxed));
        let (tx, rx) = mpsc::channel();
        self.pending.lock().expect("pending").insert(id.clone(), tx);
        sink(json!({
            "kind": "tool_call",
            "callId": id,
            "name": name,
            "input": if input.is_object() { input } else { json!({}) },
        }));
        match rx.recv_timeout(CALL_TIMEOUT) {
            Ok(v) => v,
            Err(_) => {
                self.pending.lock().expect("pending").remove(&id);
                tool_error("the editor did not answer the tool call in time")
            }
        }
    }

    fn serve(&self, stream: TcpStream) {
        let Ok(read) = stream.try_clone() else { return };
        let mut reader = BufReader::new(read);
        let mut out = stream;
        let mut line = String::new();
        // The first line carries the token; anything else is a stranger.
        if reader.read_line(&mut line).unwrap_or(0) == 0 {
            return;
        }
        let hello: Value = serde_json::from_str(line.trim()).unwrap_or(Value::Null);
        if hello["token"].as_str() != Some(self.token.as_str()) {
            return;
        }
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) | Err(_) => return,
                Ok(_) => {}
            }
            let Ok(req) = serde_json::from_str::<Value>(line.trim()) else {
                continue;
            };
            let res = json!({ "id": req["id"], "result": self.handle(&req) });
            if writeln!(out, "{res}").is_err() {
                return;
            }
        }
    }
}

/// The editor's tool definitions in MCP's shape.
pub fn mcp_tools(tools: &Value) -> Value {
    Value::Array(
        tools
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|t| json!({ "name": t["name"], "description": t["description"], "inputSchema": t["input_schema"] }))
                    .collect()
            })
            .unwrap_or_default(),
    )
}

/// A tool result that tells the model something went wrong.
pub fn tool_error(msg: &str) -> Value {
    json!({ "content": [{ "type": "text", "text": msg }], "isError": true })
}

// ---------------------------------------------------------------- child mode

/// The child's link to the editor.
struct Link {
    reader: BufReader<TcpStream>,
    writer: TcpStream,
}

impl Link {
    fn connect(addr: &str, token: &str) -> Result<Link, String> {
        let stream = TcpStream::connect(addr).map_err(|e| format!("bridge connect {addr}: {e}"))?;
        let mut writer = stream.try_clone().map_err(|e| e.to_string())?;
        writeln!(writer, "{}", json!({ "token": token })).map_err(|e| e.to_string())?;
        Ok(Link {
            reader: BufReader::new(stream),
            writer,
        })
    }

    fn ask(&mut self, req: Value) -> Result<Value, String> {
        writeln!(self.writer, "{req}").map_err(|e| format!("bridge write: {e}"))?;
        let mut line = String::new();
        if self
            .reader
            .read_line(&mut line)
            .map_err(|e| format!("bridge read: {e}"))?
            == 0
        {
            return Err("bridge closed".into());
        }
        let v: Value =
            serde_json::from_str(line.trim()).map_err(|e| format!("bridge reply: {e}"))?;
        Ok(v["result"].clone())
    }
}

/// One JSON-RPC message from Claude Code; `forward` reaches the editor.
/// Returns the response, or none for notifications.
pub fn respond(
    msg: &Value,
    forward: &mut dyn FnMut(Value) -> Result<Value, String>,
) -> Option<Value> {
    let id = msg.get("id").cloned()?;
    if id.is_null() {
        return None;
    }
    let method = msg["method"].as_str().unwrap_or("");
    let result: Result<Value, (i64, String)> = match method {
        "initialize" => Ok(json!({
            "protocolVersion": msg["params"]["protocolVersion"].as_str().unwrap_or("2025-03-26"),
            "capabilities": { "tools": {} },
            "serverInfo": { "name": "mallet", "version": env!("CARGO_PKG_VERSION") },
        })),
        "ping" => Ok(json!({})),
        "tools/list" => forward(json!({ "method": "tools/list" })).map_err(|e| (-32000, e)),
        // A broken link is reported to the model as the tool's result, so it can say so.
        "tools/call" => Ok(
            forward(json!({ "method": "tools/call", "params": msg["params"] }))
                .unwrap_or_else(|e| tool_error(&e)),
        ),
        _ => Err((-32601, format!("method not found: {method}"))),
    };
    Some(match result {
        Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
        Err((code, message)) => {
            json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
        }
    })
}

/// Runs as the MCP server on stdin/stdout until Claude Code closes the pipe.
pub fn serve_stdio(addr: &str, token: &str) -> Result<(), String> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    let mut link: Option<Link> = None;
    let mut forward = |req: Value| -> Result<Value, String> {
        if link.is_none() {
            link = Some(Link::connect(addr, token)?);
        }
        let l = link.as_mut().expect("link");
        let r = l.ask(req);
        if r.is_err() {
            link = None;
        }
        r
    };
    for line in stdin.lock().lines() {
        let line = line.map_err(|e| format!("stdin: {e}"))?;
        if line.trim().is_empty() {
            continue;
        }
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if let Some(res) = respond(&msg, &mut forward) {
            let mut out = stdout.lock();
            writeln!(out, "{res}").map_err(|e| format!("stdout: {e}"))?;
            out.flush().map_err(|e| format!("stdout: {e}"))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jsonrpc_handshake_list_and_call_go_through_the_forwarder() {
        let mut seen = Vec::new();
        let mut forward = |req: Value| -> Result<Value, String> {
            seen.push(req["method"].as_str().unwrap().to_string());
            Ok(match req["method"].as_str() {
                Some("tools/list") => json!({ "tools": [{ "name": "create_brush" }] }),
                _ => {
                    json!({ "content": [{ "type": "text", "text": "браш: id 7" }], "isError": false })
                }
            })
        };
        let init = respond(&json!({ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-06-18" } }), &mut forward).unwrap();
        assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(init["result"]["serverInfo"]["name"], "mallet");
        assert!(respond(
            &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
            &mut forward
        )
        .is_none());
        let list = respond(
            &json!({ "jsonrpc": "2.0", "id": 2, "method": "tools/list" }),
            &mut forward,
        )
        .unwrap();
        assert_eq!(list["result"]["tools"][0]["name"], "create_brush");
        let call = respond(&json!({ "jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": { "name": "create_brush", "arguments": {} } }), &mut forward).unwrap();
        assert_eq!(call["result"]["content"][0]["text"], "браш: id 7");
        let unknown = respond(
            &json!({ "jsonrpc": "2.0", "id": 4, "method": "resources/list" }),
            &mut forward,
        )
        .unwrap();
        assert_eq!(unknown["error"]["code"], -32601);
        assert_eq!(seen, ["tools/list", "tools/call"]);
    }

    #[test]
    fn a_failed_forward_becomes_a_tool_error_the_model_can_read() {
        let mut forward = |_: Value| -> Result<Value, String> { Err("bridge closed".into()) };
        let call = respond(
            &json!({ "id": 9, "method": "tools/call", "params": { "name": "x", "arguments": {} } }),
            &mut forward,
        )
        .unwrap();
        assert_eq!(call["result"]["isError"], true);
        assert!(call["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("bridge closed"));
    }

    #[test]
    fn the_bridge_relays_a_call_to_the_sink_and_the_reply_back_over_the_socket() {
        let bridge = Bridge::start().unwrap();
        let (tx, rx) = mpsc::channel::<Value>();
        let sink: Sink = Arc::new(move |v| {
            let _ = tx.send(v);
        });
        bridge.begin(json!([{ "name": "create_brush", "description": "Блок", "input_schema": { "type": "object" } }]), sink);
        // The webview's side: answer the one call that comes.
        let answerer = bridge.clone();
        let t = std::thread::spawn(move || {
            let ev = rx.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(ev["kind"], "tool_call");
            assert_eq!(ev["name"], "create_brush");
            assert_eq!(ev["input"]["min"][0], 0);
            let id = ev["callId"].as_str().unwrap().to_string();
            assert!(answerer.reply(
                &id,
                json!({ "content": [{ "type": "text", "text": "браш: id 12" }], "isError": false })
            ));
        });
        let mut link = Link::connect(&bridge.addr(), bridge.token()).unwrap();
        let list = link.ask(json!({ "method": "tools/list" })).unwrap();
        assert_eq!(list["tools"][0]["name"], "create_brush");
        assert_eq!(list["tools"][0]["inputSchema"]["type"], "object");
        let call = link.ask(json!({ "method": "tools/call", "params": { "name": "create_brush", "arguments": { "min": [0, 0, 0] } } })).unwrap();
        assert_eq!(call["content"][0]["text"], "браш: id 12");
        t.join().unwrap();
        // A wrong token gets nothing.
        let mut stranger = Link::connect(&bridge.addr(), "nope").unwrap();
        assert!(stranger.ask(json!({ "method": "tools/list" })).is_err());
        bridge.end();
        assert_eq!(link.ask(json!({ "method": "tools/call", "params": { "name": "create_brush", "arguments": {} } })).unwrap()["isError"], true);
    }
}
