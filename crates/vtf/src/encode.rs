//! Writing VTF files: an RGBA8 image with a box-filtered mip chain in a
//! version 7.2 container, which every Source build reads. Uncompressed
//! RGBA8888 keeps the encoder small and the pixels exact; files are larger
//! than DXT ones, which is fine for a map's own handful of textures.

use crate::ImageFormat;

/// Flags written into the header.
pub mod flags {
    pub const CLAMPS: u32 = 0x0004;
    pub const CLAMPT: u32 = 0x0008;
    pub const NOMIP: u32 = 0x0100;
    pub const NOLOD: u32 = 0x0200;
    pub const EIGHTBITALPHA: u32 = 0x2000;
}

#[derive(Debug)]
pub enum EncodeError {
    /// Source requires power-of-two sides (within 1..=4096).
    NotPowerOfTwo(u32, u32),
    WrongLength {
        expected: usize,
        got: usize,
    },
}

impl std::fmt::Display for EncodeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EncodeError::NotPowerOfTwo(w, h) => write!(
                f,
                "размер {w}×{h}: стороны должны быть степенью двойки (64, 128, 256, 512, 1024…)"
            ),
            EncodeError::WrongLength { expected, got } => {
                write!(f, "ожидалось {expected} байт RGBA, получено {got}")
            }
        }
    }
}

impl std::error::Error for EncodeError {}

fn is_pot(n: u32) -> bool {
    (1..=4096).contains(&n) && n.is_power_of_two()
}

/// Halves an RGBA8 image with a 2×2 box filter (a 1-pixel side stays 1).
pub fn downsample(rgba: &[u8], width: u32, height: u32) -> (Vec<u8>, u32, u32) {
    let nw = (width / 2).max(1);
    let nh = (height / 2).max(1);
    let mut out = vec![0u8; (nw * nh * 4) as usize];
    for y in 0..nh {
        for x in 0..nw {
            let mut acc = [0u32; 4];
            let mut n = 0u32;
            for dy in 0..2 {
                for dx in 0..2 {
                    let sx = (x * 2 + dx).min(width - 1);
                    let sy = (y * 2 + dy).min(height - 1);
                    let i = ((sy * width + sx) * 4) as usize;
                    for c in 0..4 {
                        acc[c] += rgba[i + c] as u32;
                    }
                    n += 1;
                }
            }
            let o = ((y * nw + x) * 4) as usize;
            for c in 0..4 {
                out[o + c] = ((acc[c] + n / 2) / n) as u8;
            }
        }
    }
    (out, nw, nh)
}

/// Encodes an RGBA8 image as a VTF 7.2 file with a full mip chain.
/// `extra_flags` adds to the defaults (eight-bit alpha when any pixel is translucent).
pub fn encode_rgba8(
    rgba: &[u8],
    width: u32,
    height: u32,
    extra_flags: u32,
) -> Result<Vec<u8>, EncodeError> {
    if !is_pot(width) || !is_pot(height) {
        return Err(EncodeError::NotPowerOfTwo(width, height));
    }
    let expected = (width * height * 4) as usize;
    if rgba.len() != expected {
        return Err(EncodeError::WrongLength {
            expected,
            got: rgba.len(),
        });
    }
    // Mips, largest first, then written smallest first as the format wants.
    let mut mips: Vec<(Vec<u8>, u32, u32)> = vec![(rgba.to_vec(), width, height)];
    while let Some((last, w, h)) = mips.last() {
        if *w == 1 && *h == 1 {
            break;
        }
        let next = downsample(last, *w, *h);
        mips.push(next);
    }
    let translucent = rgba.chunks_exact(4).any(|p| p[3] != 255);
    let mut flags = extra_flags;
    if translucent {
        flags |= flags::EIGHTBITALPHA;
    }
    let mut reflectivity = [0f32; 3];
    let n = (width * height) as f32;
    for p in rgba.chunks_exact(4) {
        for c in 0..3 {
            reflectivity[c] += (p[c] as f32 / 255.0).powf(2.2) / n;
        }
    }

    let header_size = 80u32;
    let mut out = Vec::with_capacity(header_size as usize + expected * 4 / 3);
    out.extend_from_slice(b"VTF\0");
    out.extend_from_slice(&7u32.to_le_bytes());
    out.extend_from_slice(&2u32.to_le_bytes());
    out.extend_from_slice(&header_size.to_le_bytes());
    out.extend_from_slice(&(width as u16).to_le_bytes());
    out.extend_from_slice(&(height as u16).to_le_bytes());
    out.extend_from_slice(&flags.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes()); // frames
    out.extend_from_slice(&0u16.to_le_bytes()); // first frame
    out.extend_from_slice(&[0u8; 4]); // padding
    for r in reflectivity {
        out.extend_from_slice(&r.to_le_bytes());
    }
    out.extend_from_slice(&[0u8; 4]); // padding
    out.extend_from_slice(&1.0f32.to_le_bytes()); // bumpmap scale
    out.extend_from_slice(&(ImageFormat::Rgba8888 as u32).to_le_bytes());
    out.push(mips.len() as u8);
    out.extend_from_slice(&0xFFFF_FFFFu32.to_le_bytes()); // no low-res image
    out.push(0); // low-res width
    out.push(0); // low-res height
    out.extend_from_slice(&1u16.to_le_bytes()); // depth
    while out.len() < header_size as usize {
        out.push(0);
    }
    for (data, _, _) in mips.iter().rev() {
        out.extend_from_slice(data);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encoded_file_parses_back_with_the_same_pixels_and_mips() {
        let (w, h) = (8u32, 4u32);
        let mut rgba = Vec::new();
        for y in 0..h {
            for x in 0..w {
                rgba.extend_from_slice(&[
                    (x * 32) as u8,
                    (y * 64) as u8,
                    200,
                    if x == 0 { 128 } else { 255 },
                ]);
            }
        }
        let bytes = encode_rgba8(&rgba, w, h, 0).unwrap();
        let vtf = crate::Vtf::parse(bytes).unwrap();
        assert_eq!((vtf.width, vtf.height), (8, 4));
        assert_eq!(vtf.format, ImageFormat::Rgba8888);
        assert_eq!(vtf.mip_count, 4);
        assert!(vtf.has_flag(flags::EIGHTBITALPHA));
        let top = vtf.decode_rgba8(0, 0, 0).unwrap();
        assert_eq!(top.data, rgba);
        let last = vtf.decode_rgba8(3, 0, 0).unwrap();
        assert_eq!((last.width, last.height), (1, 1));
        assert!(matches!(
            encode_rgba8(&[0; 12 * 4], 12, 1, 0),
            Err(EncodeError::NotPowerOfTwo(12, 1))
        ));
    }

    #[test]
    fn downsampling_averages_four_pixels() {
        let img = [
            0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255,
        ];
        let (out, w, h) = downsample(&img, 2, 2);
        assert_eq!((w, h), (1, 1));
        assert_eq!(out, vec![100, 100, 100, 255]);
    }
}
