//! The `gmod-asset://` protocol: binary content for the webview without JSON
//! or base64. Today only textures:
//!
//! `texture/<name>[?rgba=1]` returns a small container
//!
//! ```text
//! "GMTX" u32 format (0 rgba8, 1 bc1, 2 bc2, 3 bc3)  u32 width  u32 height
//! u32 mip_count  u32 flags (bit 0: has alpha)
//! per mip: u32 byte_length, bytes
//! ```
//!
//! `rgba=1` forces CPU decoding to RGBA8 for GPUs without BC support.
//!
//! `model/<models/x/y.mdl>[?skin=N&body=M]` returns the assembled model
//!
//! ```text
//! "GMDL" u32 version(1)  f32 mins[3]  f32 maxs[3]  u32 mesh_count
//! per mesh: u32 name_len, material name bytes padded to 4,
//!           u32 vertex_count, u32 index_count,
//!           f32 positions[3·v], f32 normals[3·v], f32 uvs[2·v], u32 indices[i]
//! ```

use tauri::http::{Request, Response, StatusCode};
use tauri::{Manager, UriSchemeContext};

use crate::state::AppState;

pub fn handle(
    ctx: UriSchemeContext<'_, tauri::Wry>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let uri = request.uri();
    // Tauri encodes the path given to convertFileSrc, so the whole thing
    // (including any query) arrives percent-encoded in the path.
    let raw = uri.path().trim_start_matches('/');
    let decoded = percent_decode(raw);
    let (path, query) = match decoded.split_once('?') {
        Some((p, q)) => (p.to_string(), q.to_string()),
        None => (decoded.clone(), String::new()),
    };
    let rgba = query.split('&').any(|kv| kv == "rgba=1");
    let size: u32 = query
        .split('&')
        .find_map(|kv| kv.strip_prefix("size="))
        .and_then(|v| v.parse().ok())
        .map(|s: u32| s.clamp(16, 2048))
        .unwrap_or(64);
    let skin: u32 = query
        .split('&')
        .find_map(|kv| kv.strip_prefix("skin="))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);
    let body: u32 = query
        .split('&')
        .find_map(|kv| kv.strip_prefix("body="))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0);

    let state = ctx.app_handle().state::<AppState>();
    let (body, content_type) = if let Some(name) = path.strip_prefix("texture/") {
        (
            texture_container(&state, name, rgba),
            "application/octet-stream",
        )
    } else if let Some(name) = path.strip_prefix("thumb/") {
        (material_thumbnail(&state, name, size), "image/png")
    } else if let Some(name) = path.strip_prefix("model/") {
        (
            state
                .model_container(name, skin, body)
                .map(|c| c.as_ref().clone()),
            "application/octet-stream",
        )
    } else if let Some(name) = path.strip_prefix("sound/") {
        // Sounds go to the webview as they are; the browser decodes WAV, MP3 and OGG itself.
        let lower = name.to_ascii_lowercase();
        let ct = if lower.ends_with(".mp3") {
            "audio/mpeg"
        } else if lower.ends_with(".ogg") {
            "audio/ogg"
        } else {
            "audio/wav"
        };
        (state.read(&format!("sound/{name}")), ct)
    } else {
        (None, "text/plain")
    };

    match body {
        Some(bytes) => Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", content_type)
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "max-age=3600")
            .body(bytes)
            .expect("response"),
        None => Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header("Access-Control-Allow-Origin", "*")
            .body(format!("not found: {path}").into_bytes())
            .expect("response"),
    }
}

fn texture_container(state: &AppState, name: &str, rgba: bool) -> Option<Vec<u8>> {
    let v = state.texture(name)?;
    let image = v.gpu_image(0, 0).ok()?;
    let (format, mips) = if rgba && image.format != vtf::GpuFormat::Rgba8 {
        let mut mips = Vec::with_capacity(v.mip_count as usize);
        for level in 0..v.mip_count {
            mips.push(v.decode_rgba8(level, 0, 0).ok()?);
        }
        (0u32, mips)
    } else {
        let f = match image.format {
            vtf::GpuFormat::Rgba8 => 0,
            vtf::GpuFormat::Bc1 => 1,
            vtf::GpuFormat::Bc2 => 2,
            vtf::GpuFormat::Bc3 => 3,
        };
        (f, image.mips)
    };

    let mut out = Vec::new();
    out.extend_from_slice(b"GMTX");
    out.extend_from_slice(&format.to_le_bytes());
    out.extend_from_slice(&v.width.to_le_bytes());
    out.extend_from_slice(&v.height.to_le_bytes());
    out.extend_from_slice(&(mips.len() as u32).to_le_bytes());
    let flags: u32 = if v.format.has_alpha() { 1 } else { 0 };
    out.extend_from_slice(&flags.to_le_bytes());
    for m in &mips {
        out.extend_from_slice(&(m.data.len() as u32).to_le_bytes());
        out.extend_from_slice(&m.data);
    }
    Some(out)
}

/// `thumb/<material>`: the material's base texture as a small PNG, taken
/// from the largest mip that fits `size`, for the texture browser.
fn material_thumbnail(state: &AppState, material: &str, size: u32) -> Option<Vec<u8>> {
    let (m, _) = state.material(material)?;
    let tex = m.base_texture()?;
    let v = state.texture(&tex)?;
    let level = (0..v.mip_count)
        .find(|&l| {
            let (w, h) = v.mip_dims(l);
            w <= size && h <= size
        })
        .unwrap_or(v.mip_count.saturating_sub(1));
    let mip = v.decode_rgba8(level, 0, 0).ok()?;
    let mut out = Vec::new();
    {
        let mut enc = png::Encoder::new(&mut out, mip.width, mip.height);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut w = enc.write_header().ok()?;
        w.write_image_data(&mip.data).ok()?;
    }
    Some(out)
}

pub(crate) fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = &s[i + 1..i + 3];
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}
