//! Bringing a mapper's own pictures into Source: PNG or TGA files become
//! `materials/<dir>/<name>.vtf` plus a plain VMT in the map's project
//! folder, so the material shows up in the texture browser at once and
//! gets packed into the BSP like any other custom content.

use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImportedTexture {
    /// Material name to use on faces (`custom/wall01`).
    pub material: String,
    pub vtf: String,
    pub vmt: String,
    pub width: u32,
    pub height: u32,
    pub translucent: bool,
}

/// Decoded RGBA8 picture.
pub struct Picture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub fn decode_png(bytes: &[u8]) -> Result<Picture, String> {
    let mut decoder = png::Decoder::new(bytes);
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().map_err(|e| format!("PNG: {e}"))?;
    let mut buf = vec![0u8; reader.output_buffer_size()];
    let info = reader
        .next_frame(&mut buf)
        .map_err(|e| format!("PNG: {e}"))?;
    let (w, h) = (info.width, info.height);
    let src = &buf[..info.buffer_size()];
    let rgba = match info.color_type {
        png::ColorType::Rgba => src.to_vec(),
        png::ColorType::Rgb => src
            .chunks_exact(3)
            .flat_map(|p| [p[0], p[1], p[2], 255])
            .collect(),
        png::ColorType::Grayscale => src.iter().flat_map(|&g| [g, g, g, 255]).collect(),
        png::ColorType::GrayscaleAlpha => src
            .chunks_exact(2)
            .flat_map(|p| [p[0], p[0], p[0], p[1]])
            .collect(),
        png::ColorType::Indexed => {
            return Err("PNG: индексированные цвета не поддерживаются".into())
        }
    };
    Ok(Picture {
        width: w,
        height: h,
        rgba,
    })
}

/// Uncompressed (2) and RLE (10) true-colour TGA, 24 or 32 bits, any origin.
fn decode_tga(bytes: &[u8]) -> Result<Picture, String> {
    if bytes.len() < 18 {
        return Err("TGA: файл обрезан".into());
    }
    let id_len = bytes[0] as usize;
    let image_type = bytes[2];
    let width = u16::from_le_bytes([bytes[12], bytes[13]]) as u32;
    let height = u16::from_le_bytes([bytes[14], bytes[15]]) as u32;
    let bpp = bytes[16] as usize;
    let descriptor = bytes[17];
    if image_type != 2 && image_type != 10 {
        return Err(format!(
            "TGA: тип {image_type} не поддерживается (нужен тип 2 - true color или 10 - RLE)"
        ));
    }
    if bpp != 24 && bpp != 32 {
        return Err(format!(
            "TGA: глубина цвета {bpp} бит не поддерживается (нужно 24 или 32)"
        ));
    }
    let bytes_pp = bpp / 8;
    let mut at = 18 + id_len;
    let count = (width * height) as usize;
    let mut pixels: Vec<[u8; 4]> = Vec::with_capacity(count);
    let read_px = |at: usize| -> Option<[u8; 4]> {
        let p = bytes.get(at..at + bytes_pp)?;
        Some([p[2], p[1], p[0], if bytes_pp == 4 { p[3] } else { 255 }])
    };
    if image_type == 2 {
        for _ in 0..count {
            pixels.push(read_px(at).ok_or("TGA: файл обрезан")?);
            at += bytes_pp;
        }
    } else {
        while pixels.len() < count {
            let packet = *bytes.get(at).ok_or("TGA: файл обрезан")?;
            at += 1;
            let n = (packet & 0x7f) as usize + 1;
            if packet & 0x80 != 0 {
                let px = read_px(at).ok_or("TGA: файл обрезан")?;
                at += bytes_pp;
                for _ in 0..n {
                    pixels.push(px);
                }
            } else {
                for _ in 0..n {
                    pixels.push(read_px(at).ok_or("TGA: файл обрезан")?);
                    at += bytes_pp;
                }
            }
        }
        pixels.truncate(count);
    }
    // Bit 5 of the descriptor: origin at the top; otherwise rows run bottom-up.
    let top_down = descriptor & 0x20 != 0;
    let mut rgba = Vec::with_capacity(count * 4);
    for y in 0..height as usize {
        let row = if top_down { y } else { height as usize - 1 - y };
        for x in 0..width as usize {
            rgba.extend_from_slice(&pixels[row * width as usize + x]);
        }
    }
    Ok(Picture {
        width,
        height,
        rgba,
    })
}

fn safe_name(stem: &str) -> String {
    let mut s: String = stem
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
        s = "texture".into();
    }
    s
}

/// Converts one picture into `<root>/materials/<dir>/<name>.vtf` and a VMT
/// beside it (an existing VMT is kept, so hand edits survive re-imports).
pub fn import_texture(root: &Path, dir: &str, src: &Path) -> Result<ImportedTexture, String> {
    let bytes = std::fs::read(src).map_err(|e| format!("{}: {e}", src.display()))?;
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let pic = match ext.as_str() {
        "png" => decode_png(&bytes)?,
        "tga" => decode_tga(&bytes)?,
        _ => {
            return Err(format!(
                "{}: поддерживаются только PNG и TGA",
                src.display()
            ))
        }
    };
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("texture");
    write_picture(root, dir, stem, &pic, None)
}

/// Writes a decoded picture as `<root>/materials/<dir>/<name>.vtf`. With a
/// `shader` the VMT is (re)written for it; without one an existing VMT is
/// kept, so hand edits survive re-imports.
pub fn write_picture(
    root: &Path,
    dir: &str,
    name: &str,
    pic: &Picture,
    shader: Option<&str>,
) -> Result<ImportedTexture, String> {
    if pic.width == 0 || pic.height == 0 || pic.rgba.len() != (pic.width * pic.height * 4) as usize
    {
        return Err("пустое изображение".into());
    }
    let vtf_bytes = vtf::encode::encode_rgba8(&pic.rgba, pic.width, pic.height, 0)
        .map_err(|e| e.to_string())?;
    let translucent = pic.rgba.chunks_exact(4).any(|p| p[3] != 255);
    let stem = safe_name(name);
    let dir_clean: String = dir
        .trim_matches(|c| c == '/' || c == '\\')
        .replace('\\', "/")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '/' {
                c.to_ascii_lowercase()
            } else {
                '_'
            }
        })
        .collect();
    let material = if dir_clean.is_empty() {
        stem.clone()
    } else {
        format!("{dir_clean}/{stem}")
    };
    let out_dir = root
        .join("materials")
        .join(dir_clean.replace('/', std::path::MAIN_SEPARATOR_STR));
    std::fs::create_dir_all(&out_dir).map_err(|e| format!("{}: {e}", out_dir.display()))?;
    let vtf_path: PathBuf = out_dir.join(format!("{stem}.vtf"));
    let vmt_path: PathBuf = out_dir.join(format!("{stem}.vmt"));
    std::fs::write(&vtf_path, &vtf_bytes).map_err(|e| format!("{}: {e}", vtf_path.display()))?;
    if shader.is_some() || !vmt_path.is_file() {
        let shader = shader
            .filter(|s| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'))
            .unwrap_or("LightmappedGeneric");
        let mut vmt = format!("\"{shader}\"\n{{\n\t\"$basetexture\" \"{material}\"\n");
        if translucent {
            vmt.push_str("\t\"$translucent\" \"1\"\n");
        }
        vmt.push_str("}\n");
        std::fs::write(&vmt_path, vmt).map_err(|e| format!("{}: {e}", vmt_path.display()))?;
    }
    Ok(ImportedTexture {
        material,
        vtf: vtf_path.display().to_string(),
        vmt: vmt_path.display().to_string(),
        width: pic.width,
        height: pic.height,
        translucent,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rle_tga_decodes_bottom_up_rows_in_bgr_order() {
        // 2×2, 24-bit, RLE: one run of two red pixels, then two literal pixels (green, blue).
        let mut tga = vec![0u8, 0, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 24, 0];
        tga.extend_from_slice(&[0x81, 0, 0, 255]); // run of 2: BGR = red
        tga.extend_from_slice(&[0x01, 0, 255, 0, 255, 0, 0]); // literal 2: green, blue
        let p = decode_tga(&tga).unwrap();
        assert_eq!((p.width, p.height), (2, 2));
        // Bottom-up: the first stored row (red, red) is the bottom one.
        assert_eq!(&p.rgba[0..8], &[0, 255, 0, 255, 0, 0, 255, 255]);
        assert_eq!(&p.rgba[8..16], &[255, 0, 0, 255, 255, 0, 0, 255]);
    }

    #[test]
    fn names_are_made_safe_for_source() {
        assert_eq!(safe_name("My Wall (final).PNG"), "my_wall__final__png");
        assert_eq!(safe_name(""), "texture");
    }
}
