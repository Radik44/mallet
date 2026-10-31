//! Valve Texture Format reader.
//!
//! The editor needs two things from a VTF: the mip chain in a form WebGPU can
//! upload (BC1/BC2/BC3 blocks passed through untouched, everything else
//! converted to RGBA8), and an RGBA8 decode of any mip for thumbnails and
//! CPU-side use. Both are here, plus the header fields that matter for
//! rendering (flags, reflectivity, frame count).
//!
//! Versions 7.0 to 7.5 are supported. In 7.3+ image data is located through
//! the resource table; earlier versions store it right after the header.

#![forbid(unsafe_code)]

use std::fmt;

pub mod encode;

#[derive(Debug)]
pub enum Error {
    NotVtf,
    Truncated(&'static str),
    UnsupportedVersion(u32, u32),
    UnknownFormat(u32),
    NoImageData,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::NotVtf => f.write_str("not a VTF file"),
            Error::Truncated(what) => write!(f, "truncated VTF while reading {what}"),
            Error::UnsupportedVersion(a, b) => write!(f, "unsupported VTF version {a}.{b}"),
            Error::UnknownFormat(n) => write!(f, "unknown image format {n}"),
            Error::NoImageData => f.write_str("VTF has no high-resolution image data"),
        }
    }
}

impl std::error::Error for Error {}

pub type Result<T> = std::result::Result<T, Error>;

/// Header flags that affect rendering.
pub mod flags {
    pub const POINT_SAMPLE: u32 = 0x0000_0001;
    pub const TRILINEAR: u32 = 0x0000_0002;
    pub const CLAMP_S: u32 = 0x0000_0004;
    pub const CLAMP_T: u32 = 0x0000_0008;
    pub const ANISOTROPIC: u32 = 0x0000_0010;
    pub const HINT_DXT5: u32 = 0x0000_0020;
    pub const NORMAL: u32 = 0x0000_0080;
    pub const NO_MIP: u32 = 0x0000_0100;
    pub const NO_LOD: u32 = 0x0000_0200;
    pub const ONE_BIT_ALPHA: u32 = 0x0000_1000;
    pub const EIGHT_BIT_ALPHA: u32 = 0x0000_2000;
    pub const ENVMAP: u32 = 0x0000_4000;
    pub const RENDER_TARGET: u32 = 0x0000_8000;
    pub const NO_DEPTH_BUFFER: u32 = 0x0001_0000;
    pub const CLAMP_U: u32 = 0x0002_0000;
    pub const VERTEX_TEXTURE: u32 = 0x0004_0000;
    pub const SSBUMP: u32 = 0x0008_0000;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
pub enum ImageFormat {
    Rgba8888 = 0,
    Abgr8888 = 1,
    Rgb888 = 2,
    Bgr888 = 3,
    Rgb565 = 4,
    I8 = 5,
    Ia88 = 6,
    P8 = 7,
    A8 = 8,
    Rgb888Bluescreen = 9,
    Bgr888Bluescreen = 10,
    Argb8888 = 11,
    Bgra8888 = 12,
    Dxt1 = 13,
    Dxt3 = 14,
    Dxt5 = 15,
    Bgrx8888 = 16,
    Bgr565 = 17,
    Bgrx5551 = 18,
    Bgra4444 = 19,
    Dxt1OneBitAlpha = 20,
    Bgra5551 = 21,
    Uv88 = 22,
    Uvwq8888 = 23,
    Rgba16161616F = 24,
    Rgba16161616 = 25,
    Uvlx8888 = 26,
}

impl ImageFormat {
    pub fn from_u32(n: u32) -> Option<ImageFormat> {
        use ImageFormat::*;
        Some(match n {
            0 => Rgba8888,
            1 => Abgr8888,
            2 => Rgb888,
            3 => Bgr888,
            4 => Rgb565,
            5 => I8,
            6 => Ia88,
            7 => P8,
            8 => A8,
            9 => Rgb888Bluescreen,
            10 => Bgr888Bluescreen,
            11 => Argb8888,
            12 => Bgra8888,
            13 => Dxt1,
            14 => Dxt3,
            15 => Dxt5,
            16 => Bgrx8888,
            17 => Bgr565,
            18 => Bgrx5551,
            19 => Bgra4444,
            20 => Dxt1OneBitAlpha,
            21 => Bgra5551,
            22 => Uv88,
            23 => Uvwq8888,
            24 => Rgba16161616F,
            25 => Rgba16161616,
            26 => Uvlx8888,
            _ => return None,
        })
    }

    pub fn is_compressed(self) -> bool {
        matches!(
            self,
            ImageFormat::Dxt1
                | ImageFormat::Dxt1OneBitAlpha
                | ImageFormat::Dxt3
                | ImageFormat::Dxt5
        )
    }

    /// Bytes per pixel for uncompressed formats, bytes per 4x4 block for BC.
    fn unit_bytes(self) -> usize {
        use ImageFormat::*;
        match self {
            Rgba8888 | Abgr8888 | Argb8888 | Bgra8888 | Bgrx8888 | Uvwq8888 | Uvlx8888 => 4,
            Rgb888 | Bgr888 | Rgb888Bluescreen | Bgr888Bluescreen => 3,
            Rgb565 | Bgr565 | Bgrx5551 | Bgra4444 | Bgra5551 | Ia88 | Uv88 => 2,
            I8 | P8 | A8 => 1,
            Rgba16161616F | Rgba16161616 => 8,
            Dxt1 | Dxt1OneBitAlpha => 8,
            Dxt3 | Dxt5 => 16,
        }
    }

    /// Size in bytes of one image of this format at the given size.
    pub fn image_size(self, width: u32, height: u32) -> usize {
        if self.is_compressed() {
            let bw = (width as usize).div_ceil(4).max(1);
            let bh = (height as usize).div_ceil(4).max(1);
            bw * bh * self.unit_bytes()
        } else {
            width as usize * height as usize * self.unit_bytes()
        }
    }

    /// True when the format has meaningful alpha.
    pub fn has_alpha(self) -> bool {
        use ImageFormat::*;
        matches!(
            self,
            Rgba8888
                | Abgr8888
                | Argb8888
                | Bgra8888
                | Ia88
                | A8
                | Dxt3
                | Dxt5
                | Bgra4444
                | Dxt1OneBitAlpha
                | Bgra5551
                | Uvwq8888
                | Rgba16161616F
                | Rgba16161616
                | Rgb888Bluescreen
                | Bgr888Bluescreen
        )
    }
}

/// How a mip chain should be uploaded to the GPU.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GpuFormat {
    /// `bc1-rgba-unorm`, 8 bytes per 4x4 block.
    Bc1,
    /// `bc2-rgba-unorm`, 16 bytes per block.
    Bc2,
    /// `bc3-rgba-unorm`, 16 bytes per block.
    Bc3,
    /// `rgba8unorm`, 4 bytes per pixel.
    Rgba8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Mip {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

/// One frame's mip chain, largest first, in a GPU-ready format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GpuImage {
    pub format: GpuFormat,
    pub mips: Vec<Mip>,
}

pub struct Vtf {
    pub version: (u32, u32),
    pub width: u32,
    pub height: u32,
    pub depth: u32,
    pub flags: u32,
    pub frames: u32,
    pub first_frame: u32,
    pub faces: u32,
    pub mip_count: u32,
    pub format: ImageFormat,
    pub reflectivity: [f32; 3],
    pub bumpmap_scale: f32,
    pub low_res_format: Option<ImageFormat>,
    pub low_res_size: (u32, u32),
    data: Vec<u8>,
    high_res_offset: usize,
}

impl fmt::Debug for Vtf {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Vtf")
            .field("version", &self.version)
            .field("size", &(self.width, self.height))
            .field("format", &self.format)
            .field("mips", &self.mip_count)
            .field("frames", &self.frames)
            .field("faces", &self.faces)
            .finish()
    }
}

impl Vtf {
    pub fn parse(data: Vec<u8>) -> Result<Vtf> {
        if data.len() < 64 || &data[0..4] != b"VTF\0" {
            return Err(Error::NotVtf);
        }
        let major = u32_at(&data, 4);
        let minor = u32_at(&data, 8);
        if major != 7 || minor > 6 {
            return Err(Error::UnsupportedVersion(major, minor));
        }
        let header_size = u32_at(&data, 12) as usize;
        let width = u16_at(&data, 16) as u32;
        let height = u16_at(&data, 18) as u32;
        let flags = u32_at(&data, 20);
        let frames = (u16_at(&data, 24) as u32).max(1);
        let first_frame = u16_at(&data, 26) as u32;
        let reflectivity = [f32_at(&data, 32), f32_at(&data, 36), f32_at(&data, 40)];
        let bumpmap_scale = f32_at(&data, 48);
        let format_raw = u32_at(&data, 52);
        let format = ImageFormat::from_u32(format_raw).ok_or(Error::UnknownFormat(format_raw))?;
        let mip_count = (data[56] as u32).max(1);
        let low_res_raw = u32_at(&data, 57);
        let low_res_format = ImageFormat::from_u32(low_res_raw);
        let low_res_size = (data[61] as u32, data[62] as u32);
        let depth = if minor >= 2 {
            (u16_at(&data, 63) as u32).max(1)
        } else {
            1
        };
        let faces = if flags & flags::ENVMAP != 0 {
            if minor < 5 && first_frame != 0xffff {
                7
            } else {
                6
            }
        } else {
            1
        };

        let high_res_offset = if minor >= 3 {
            if data.len() < 80 {
                return Err(Error::Truncated("resource table"));
            }
            let count = u32_at(&data, 68) as usize;
            let mut found = None;
            for i in 0..count {
                let at = 80 + i * 8;
                if data.len() < at + 8 {
                    return Err(Error::Truncated("resource entry"));
                }
                let tag = [data[at], data[at + 1], data[at + 2]];
                let res_flags = data[at + 3];
                let offset = u32_at(&data, at + 4);
                if tag == [0x30, 0, 0] && res_flags & 0x02 == 0 {
                    found = Some(offset as usize);
                }
            }
            found.ok_or(Error::NoImageData)?
        } else {
            let low_res_bytes = match low_res_format {
                Some(f) if low_res_size.0 > 0 && low_res_size.1 > 0 => {
                    f.image_size(low_res_size.0, low_res_size.1)
                }
                _ => 0,
            };
            header_size + low_res_bytes
        };

        let vtf = Vtf {
            version: (major, minor),
            width,
            height,
            depth,
            flags,
            frames,
            first_frame,
            faces,
            mip_count,
            format,
            reflectivity,
            bumpmap_scale,
            low_res_format,
            low_res_size,
            data,
            high_res_offset,
        };
        // Validate that the largest mip of the first frame is present.
        vtf.mip_bytes(0, 0, 0)?;
        Ok(vtf)
    }

    pub fn has_flag(&self, flag: u32) -> bool {
        self.flags & flag != 0
    }

    /// Dimensions of mip `level`.
    pub fn mip_dims(&self, level: u32) -> (u32, u32) {
        ((self.width >> level).max(1), (self.height >> level).max(1))
    }

    fn mip_depth(&self, level: u32) -> u32 {
        (self.depth >> level).max(1)
    }

    /// Raw bytes of one image in the file's own format.
    pub fn mip_bytes(&self, level: u32, frame: u32, face: u32) -> Result<&[u8]> {
        if level >= self.mip_count || frame >= self.frames || face >= self.faces {
            return Err(Error::NoImageData);
        }
        // Stored smallest mip first: [mip = count-1 .. 0][frame][face][slice].
        let mut offset = self.high_res_offset;
        for m in (level + 1..self.mip_count).rev() {
            let (w, h) = self.mip_dims(m);
            offset += self.format.image_size(w, h)
                * (self.frames * self.faces * self.mip_depth(m)) as usize;
        }
        let (w, h) = self.mip_dims(level);
        let one = self.format.image_size(w, h);
        let per_frame = one * (self.faces * self.mip_depth(level)) as usize;
        offset += per_frame * frame as usize + one * (face * self.mip_depth(level)) as usize;
        self.data
            .get(offset..offset + one)
            .ok_or(Error::Truncated("image data"))
    }

    /// RGBA8 pixels of one mip, decoding block compression on the CPU.
    pub fn decode_rgba8(&self, level: u32, frame: u32, face: u32) -> Result<Mip> {
        let (w, h) = self.mip_dims(level);
        let src = self.mip_bytes(level, frame, face)?;
        Ok(Mip {
            width: w,
            height: h,
            data: decode_to_rgba8(self.format, src, w, h),
        })
    }

    /// Mip chain of one frame and face for upload: BC formats as-is, the rest
    /// converted to RGBA8.
    pub fn gpu_image(&self, frame: u32, face: u32) -> Result<GpuImage> {
        let format = match self.format {
            ImageFormat::Dxt1 | ImageFormat::Dxt1OneBitAlpha => GpuFormat::Bc1,
            ImageFormat::Dxt3 => GpuFormat::Bc2,
            ImageFormat::Dxt5 => GpuFormat::Bc3,
            _ => GpuFormat::Rgba8,
        };
        let mut mips = Vec::with_capacity(self.mip_count as usize);
        for level in 0..self.mip_count {
            let (w, h) = self.mip_dims(level);
            let src = self.mip_bytes(level, frame, face)?;
            let data = if format == GpuFormat::Rgba8 {
                decode_to_rgba8(self.format, src, w, h)
            } else {
                src.to_vec()
            };
            mips.push(Mip {
                width: w,
                height: h,
                data,
            });
        }
        Ok(GpuImage { format, mips })
    }
}

// ---------------------------------------------------------------------------
// Pixel conversion
// ---------------------------------------------------------------------------

/// Converts one image of `format` to tightly packed RGBA8.
pub fn decode_to_rgba8(format: ImageFormat, src: &[u8], width: u32, height: u32) -> Vec<u8> {
    use ImageFormat::*;
    let n = (width * height) as usize;
    let mut out = vec![0u8; n * 4];
    match format {
        Dxt1 | Dxt1OneBitAlpha => decode_bc1(src, width, height, &mut out),
        Dxt3 => decode_bc2(src, width, height, &mut out),
        Dxt5 => decode_bc3(src, width, height, &mut out),
        _ => {
            let bpp = format.unit_bytes();
            for i in 0..n {
                let p = &src[i * bpp..(i + 1) * bpp];
                let (r, g, b, a) = match format {
                    Rgba8888 => (p[0], p[1], p[2], p[3]),
                    Abgr8888 => (p[3], p[2], p[1], p[0]),
                    Rgb888 => (p[0], p[1], p[2], 255),
                    Bgr888 => (p[2], p[1], p[0], 255),
                    Rgb888Bluescreen => {
                        let a = if p[0] == 0 && p[1] == 0 && p[2] == 255 {
                            0
                        } else {
                            255
                        };
                        (p[0], p[1], p[2], a)
                    }
                    Bgr888Bluescreen => {
                        let a = if p[2] == 0 && p[1] == 0 && p[0] == 255 {
                            0
                        } else {
                            255
                        };
                        (p[2], p[1], p[0], a)
                    }
                    Argb8888 => (p[1], p[2], p[3], p[0]),
                    Bgra8888 => (p[2], p[1], p[0], p[3]),
                    Bgrx8888 => (p[2], p[1], p[0], 255),
                    Uvwq8888 | Uvlx8888 => (p[0], p[1], p[2], 255),
                    I8 | P8 => (p[0], p[0], p[0], 255),
                    A8 => (255, 255, 255, p[0]),
                    Ia88 => (p[0], p[0], p[0], p[1]),
                    Uv88 => (p[0], p[1], 255, 255),
                    Rgb565 => {
                        let v = u16::from_le_bytes([p[0], p[1]]);
                        (e5(v >> 11), e6((v >> 5) & 0x3f), e5(v & 0x1f), 255)
                    }
                    Bgr565 => {
                        let v = u16::from_le_bytes([p[0], p[1]]);
                        (e5(v & 0x1f), e6((v >> 5) & 0x3f), e5(v >> 11), 255)
                    }
                    Bgrx5551 => {
                        let v = u16::from_le_bytes([p[0], p[1]]);
                        (e5((v >> 10) & 0x1f), e5((v >> 5) & 0x1f), e5(v & 0x1f), 255)
                    }
                    Bgra5551 => {
                        let v = u16::from_le_bytes([p[0], p[1]]);
                        let a = if v & 0x8000 != 0 { 255 } else { 0 };
                        (e5((v >> 10) & 0x1f), e5((v >> 5) & 0x1f), e5(v & 0x1f), a)
                    }
                    Bgra4444 => {
                        let v = u16::from_le_bytes([p[0], p[1]]);
                        (
                            e4((v >> 8) & 0xf),
                            e4((v >> 4) & 0xf),
                            e4(v & 0xf),
                            e4(v >> 12),
                        )
                    }
                    Rgba16161616 => (p[1], p[3], p[5], p[7]),
                    Rgba16161616F => (
                        half_to_u8(u16::from_le_bytes([p[0], p[1]])),
                        half_to_u8(u16::from_le_bytes([p[2], p[3]])),
                        half_to_u8(u16::from_le_bytes([p[4], p[5]])),
                        half_to_u8(u16::from_le_bytes([p[6], p[7]])),
                    ),
                    Dxt1 | Dxt1OneBitAlpha | Dxt3 | Dxt5 => unreachable!(),
                };
                out[i * 4..i * 4 + 4].copy_from_slice(&[r, g, b, a]);
            }
        }
    }
    out
}

fn e5(v: u16) -> u8 {
    ((v as u32 * 255 + 15) / 31) as u8
}

fn e6(v: u16) -> u8 {
    ((v as u32 * 255 + 31) / 63) as u8
}

fn e4(v: u16) -> u8 {
    (v as u8) * 17
}

/// Half float to 0..255, clamping; HDR textures are shown without tonemapping.
fn half_to_u8(h: u16) -> u8 {
    let sign = if h & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exp = ((h >> 10) & 0x1f) as i32;
    let frac = (h & 0x3ff) as f32;
    let v = if exp == 0 {
        sign * frac * 2f32.powi(-24)
    } else if exp == 31 {
        if frac == 0.0 {
            sign * f32::INFINITY
        } else {
            f32::NAN
        }
    } else {
        sign * (1.0 + frac / 1024.0) * 2f32.powi(exp - 15)
    };
    (v.clamp(0.0, 1.0) * 255.0 + 0.5) as u8
}

fn rgb565_to_rgb(v: u16) -> [u8; 3] {
    [e5(v >> 11), e6((v >> 5) & 0x3f), e5(v & 0x1f)]
}

fn put(out: &mut [u8], width: u32, height: u32, x: u32, y: u32, rgba: [u8; 4]) {
    if x < width && y < height {
        let i = ((y * width + x) * 4) as usize;
        out[i..i + 4].copy_from_slice(&rgba);
    }
}

fn decode_bc1(src: &[u8], width: u32, height: u32, out: &mut [u8]) {
    let bw = (width as usize).div_ceil(4).max(1);
    let bh = (height as usize).div_ceil(4).max(1);
    for by in 0..bh {
        for bx in 0..bw {
            let at = (by * bw + bx) * 8;
            if at + 8 > src.len() {
                return;
            }
            decode_bc1_block(&src[at..at + 8], true, |px, py, rgba| {
                put(
                    out,
                    width,
                    height,
                    (bx * 4 + px) as u32,
                    (by * 4 + py) as u32,
                    rgba,
                )
            });
        }
    }
}

/// Decodes one BC1 colour block, calling `f(x, y, rgba)` 16 times. With
/// `one_bit_alpha` the c0 <= c1 ordering selects the transparent-black mode.
fn decode_bc1_block(block: &[u8], one_bit_alpha: bool, mut f: impl FnMut(usize, usize, [u8; 4])) {
    let c0 = u16::from_le_bytes([block[0], block[1]]);
    let c1 = u16::from_le_bytes([block[2], block[3]]);
    let (r0, g0, b0) = {
        let c = rgb565_to_rgb(c0);
        (c[0] as u32, c[1] as u32, c[2] as u32)
    };
    let (r1, g1, b1) = {
        let c = rgb565_to_rgb(c1);
        (c[0] as u32, c[1] as u32, c[2] as u32)
    };
    let palette: [[u8; 4]; 4] = if c0 > c1 || !one_bit_alpha {
        [
            [r0 as u8, g0 as u8, b0 as u8, 255],
            [r1 as u8, g1 as u8, b1 as u8, 255],
            [
                ((2 * r0 + r1) / 3) as u8,
                ((2 * g0 + g1) / 3) as u8,
                ((2 * b0 + b1) / 3) as u8,
                255,
            ],
            [
                ((r0 + 2 * r1) / 3) as u8,
                ((g0 + 2 * g1) / 3) as u8,
                ((b0 + 2 * b1) / 3) as u8,
                255,
            ],
        ]
    } else {
        [
            [r0 as u8, g0 as u8, b0 as u8, 255],
            [r1 as u8, g1 as u8, b1 as u8, 255],
            [
                ((r0 + r1) / 2) as u8,
                ((g0 + g1) / 2) as u8,
                ((b0 + b1) / 2) as u8,
                255,
            ],
            [0, 0, 0, 0],
        ]
    };
    let indices = u32::from_le_bytes([block[4], block[5], block[6], block[7]]);
    for py in 0..4 {
        for px in 0..4 {
            let idx = (indices >> (2 * (py * 4 + px))) & 3;
            f(px, py, palette[idx as usize]);
        }
    }
}

fn decode_bc2(src: &[u8], width: u32, height: u32, out: &mut [u8]) {
    let bw = (width as usize).div_ceil(4).max(1);
    let bh = (height as usize).div_ceil(4).max(1);
    for by in 0..bh {
        for bx in 0..bw {
            let at = (by * bw + bx) * 16;
            if at + 16 > src.len() {
                return;
            }
            let alpha = &src[at..at + 8];
            decode_bc1_block(&src[at + 8..at + 16], false, |px, py, mut rgba| {
                let a4 = (u16::from_le_bytes([alpha[py * 2], alpha[py * 2 + 1]]) >> (px * 4)) & 0xf;
                rgba[3] = (a4 as u8) * 17;
                put(
                    out,
                    width,
                    height,
                    (bx * 4 + px) as u32,
                    (by * 4 + py) as u32,
                    rgba,
                )
            });
        }
    }
}

fn decode_bc3(src: &[u8], width: u32, height: u32, out: &mut [u8]) {
    let bw = (width as usize).div_ceil(4).max(1);
    let bh = (height as usize).div_ceil(4).max(1);
    for by in 0..bh {
        for bx in 0..bw {
            let at = (by * bw + bx) * 16;
            if at + 16 > src.len() {
                return;
            }
            let a0 = src[at] as u32;
            let a1 = src[at + 1] as u32;
            let mut bits: u64 = 0;
            for i in 0..6 {
                bits |= (src[at + 2 + i] as u64) << (8 * i);
            }
            let alphas: [u8; 8] = if a0 > a1 {
                [
                    a0 as u8,
                    a1 as u8,
                    ((6 * a0 + a1) / 7) as u8,
                    ((5 * a0 + 2 * a1) / 7) as u8,
                    ((4 * a0 + 3 * a1) / 7) as u8,
                    ((3 * a0 + 4 * a1) / 7) as u8,
                    ((2 * a0 + 5 * a1) / 7) as u8,
                    ((a0 + 6 * a1) / 7) as u8,
                ]
            } else {
                [
                    a0 as u8,
                    a1 as u8,
                    ((4 * a0 + a1) / 5) as u8,
                    ((3 * a0 + 2 * a1) / 5) as u8,
                    ((2 * a0 + 3 * a1) / 5) as u8,
                    ((a0 + 4 * a1) / 5) as u8,
                    0,
                    255,
                ]
            };
            decode_bc1_block(&src[at + 8..at + 16], false, |px, py, mut rgba| {
                let idx = (bits >> (3 * (py * 4 + px))) & 7;
                rgba[3] = alphas[idx as usize];
                put(
                    out,
                    width,
                    height,
                    (bx * 4 + px) as u32,
                    (by * 4 + py) as u32,
                    rgba,
                )
            });
        }
    }
}

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

fn f32_at(b: &[u8], i: usize) -> f32 {
    f32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a 7.2 VTF: header (80 bytes), 4x4 low-res DXT1, then mips.
    fn build_vtf(
        minor: u32,
        format: ImageFormat,
        width: u16,
        height: u16,
        mips: u8,
        images: &[Vec<u8>],
    ) -> Vec<u8> {
        let mut b = vec![0u8; 80];
        b[0..4].copy_from_slice(b"VTF\0");
        b[4..8].copy_from_slice(&7u32.to_le_bytes());
        b[8..12].copy_from_slice(&minor.to_le_bytes());
        b[12..16].copy_from_slice(&80u32.to_le_bytes());
        b[16..18].copy_from_slice(&width.to_le_bytes());
        b[18..20].copy_from_slice(&height.to_le_bytes());
        b[24..26].copy_from_slice(&1u16.to_le_bytes());
        b[52..56].copy_from_slice(&(format as u32).to_le_bytes());
        b[56] = mips;
        b[57..61].copy_from_slice(&(ImageFormat::Dxt1 as u32).to_le_bytes());
        b[61] = 4;
        b[62] = 4;
        b[63..65].copy_from_slice(&1u16.to_le_bytes());
        if minor >= 3 {
            b[68..72].copy_from_slice(&2u32.to_le_bytes());
            // resource entries at 80: low-res at 96, high-res at 96 + 8
            b.extend_from_slice(&[0x01, 0, 0, 0]);
            b.extend_from_slice(&96u32.to_le_bytes());
            b.extend_from_slice(&[0x30, 0, 0, 0]);
            b.extend_from_slice(&104u32.to_le_bytes());
            b[12..16].copy_from_slice(&96u32.to_le_bytes());
        }
        b.extend_from_slice(&[0u8; 8]); // low-res 4x4 DXT1 block
        for img in images {
            b.extend_from_slice(img);
        }
        b
    }

    #[test]
    fn rgba_mips_are_located_smallest_first() {
        // 2x2 with 2 mips: file stores the 1x1 mip first, then 2x2.
        let mip1 = vec![9, 9, 9, 9];
        let mip0 = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
        for minor in [2u32, 5] {
            let data = build_vtf(
                minor,
                ImageFormat::Rgba8888,
                2,
                2,
                2,
                &[mip1.clone(), mip0.clone()],
            );
            let vtf = Vtf::parse(data).unwrap();
            assert_eq!(vtf.mip_dims(0), (2, 2));
            assert_eq!(vtf.mip_dims(1), (1, 1));
            assert_eq!(vtf.mip_bytes(0, 0, 0).unwrap(), &mip0[..]);
            assert_eq!(vtf.mip_bytes(1, 0, 0).unwrap(), &mip1[..]);
            let gpu = vtf.gpu_image(0, 0).unwrap();
            assert_eq!(gpu.format, GpuFormat::Rgba8);
            assert_eq!(gpu.mips.len(), 2);
            assert_eq!(gpu.mips[0].data, mip0);
        }
    }

    #[test]
    fn bgra_is_swizzled_and_bc1_is_passed_through_and_decoded() {
        let bgra = vec![10, 20, 30, 40];
        let vtf = Vtf::parse(build_vtf(2, ImageFormat::Bgra8888, 1, 1, 1, &[bgra])).unwrap();
        assert_eq!(
            vtf.decode_rgba8(0, 0, 0).unwrap().data,
            vec![30, 20, 10, 40]
        );

        // One BC1 block: c0 = pure red (0xF800), c1 = pure blue (0x001F), all indices 0 → red.
        let block = vec![0x00, 0xF8, 0x1F, 0x00, 0, 0, 0, 0];
        let vtf = Vtf::parse(build_vtf(
            2,
            ImageFormat::Dxt1,
            4,
            4,
            1,
            std::slice::from_ref(&block),
        ))
        .unwrap();
        let gpu = vtf.gpu_image(0, 0).unwrap();
        assert_eq!(gpu.format, GpuFormat::Bc1);
        assert_eq!(gpu.mips[0].data, block);
        let px = vtf.decode_rgba8(0, 0, 0).unwrap();
        assert_eq!(&px.data[0..4], &[255, 0, 0, 255]);
        assert_eq!(px.data.len(), 64);
    }

    #[test]
    fn bc3_alpha_decodes() {
        // alpha0 = 255, alpha1 = 0, all 3-bit indices 1 → alpha 0; colour block red.
        let mut block = vec![255, 0];
        block.extend_from_slice(&[
            0b0100_1001,
            0b1001_0010,
            0b0010_0100,
            0b0100_1001,
            0b1001_0010,
            0b0010_0100,
        ]);
        block.extend_from_slice(&[0x00, 0xF8, 0x1F, 0x00, 0, 0, 0, 0]);
        let vtf = Vtf::parse(build_vtf(2, ImageFormat::Dxt5, 4, 4, 1, &[block])).unwrap();
        let px = vtf.decode_rgba8(0, 0, 0).unwrap();
        assert_eq!(&px.data[0..4], &[255, 0, 0, 0]);
    }

    #[test]
    fn image_sizes() {
        assert_eq!(ImageFormat::Dxt1.image_size(1, 1), 8);
        assert_eq!(ImageFormat::Dxt1.image_size(8, 4), 16);
        assert_eq!(ImageFormat::Dxt5.image_size(5, 5), 4 * 16);
        assert_eq!(ImageFormat::Rgb888.image_size(3, 2), 18);
    }

    #[test]
    fn rejects_bad_input() {
        assert!(matches!(Vtf::parse(vec![0; 10]), Err(Error::NotVtf)));
        let mut b = build_vtf(2, ImageFormat::Rgba8888, 1, 1, 1, &[vec![0; 4]]);
        b[8..12].copy_from_slice(&9u32.to_le_bytes());
        assert!(matches!(
            Vtf::parse(b),
            Err(Error::UnsupportedVersion(7, 9))
        ));
        let b = build_vtf(2, ImageFormat::Rgba8888, 4, 4, 1, &[vec![0; 4]]);
        assert!(matches!(Vtf::parse(b), Err(Error::Truncated(_))));
    }
}
