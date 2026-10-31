//! Reader for Garry's Mod addon archives.
//!
//! Layout (all little-endian):
//!
//! ```text
//! "GMAD" u8 version  u64 steamid  u64 timestamp
//! [version > 1: required-content strings until an empty one]
//! cstr name  cstr description (JSON)  cstr author  i32 addon_version
//! repeated { u32 file_number (0 ends)  cstr path  i64 size  u32 crc }
//! file data, concatenated in entry order
//! ```
//!
//! Files downloaded from the Workshop are often stored LZMA-compressed (the
//! `.lzma` container: 13-byte header, then the stream) under a `.bin` name.
//! LZMA has no random access, so [`Gma::decompress`] writes the plain archive
//! to a cache path once and [`Gma::open`] then reads entries by seeking, the
//! same way the game extracts Workshop addons to its cache.

#![forbid(unsafe_code)]

use std::fmt;
use std::fs::File;
use std::io::{self, BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use std::sync::Mutex;

const IDENT: &[u8; 4] = b"GMAD";

#[derive(Debug)]
pub enum Error {
    Io(io::Error),
    NotGma,
    /// The file is LZMA-compressed; decompress it first.
    Compressed,
    Truncated(&'static str),
    Lzma(String),
    NotFound(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(e) => write!(f, "io: {e}"),
            Error::NotGma => f.write_str("not a GMA archive"),
            Error::Compressed => f.write_str("LZMA-compressed GMA, decompress it first"),
            Error::Truncated(what) => write!(f, "truncated GMA while reading {what}"),
            Error::Lzma(e) => write!(f, "LZMA decompression failed: {e}"),
            Error::NotFound(p) => write!(f, "{p} not in addon"),
        }
    }
}

impl std::error::Error for Error {}

impl From<io::Error> for Error {
    fn from(e: io::Error) -> Error {
        Error::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEntry {
    /// Lowercase path with forward slashes, as gmad writes it.
    pub path: String,
    pub size: u64,
    pub crc: u32,
    /// Offset of the data from the start of the data block.
    pub offset: u64,
}

enum Backing {
    Memory(Vec<u8>),
    File(Mutex<File>),
}

/// A parsed addon.
pub struct Gma {
    pub version: u8,
    pub steam_id: u64,
    pub timestamp: u64,
    pub name: String,
    /// Raw description; the Workshop stores a JSON object with `description`,
    /// `type` and `tags` here.
    pub description: String,
    pub author: String,
    pub addon_version: i32,
    pub files: Vec<FileEntry>,
    backing: Backing,
    data_start: u64,
}

impl fmt::Debug for Gma {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Gma")
            .field("name", &self.name)
            .field("files", &self.files.len())
            .finish()
    }
}

/// True for the 13-byte `.lzma` container header Workshop downloads use.
pub fn is_lzma(path: impl AsRef<Path>) -> bool {
    let mut head = [0u8; 16];
    match File::open(path).and_then(|mut f| f.read(&mut head)) {
        Ok(n) if n >= 13 => looks_like_lzma(&head[..n]),
        _ => false,
    }
}

impl Gma {
    /// Opens a plain (uncompressed) archive for seeking reads. Returns
    /// [`Error::Compressed`] for an LZMA file.
    pub fn open(path: impl AsRef<Path>) -> Result<Gma> {
        let mut file = File::open(path)?;
        let mut head = vec![0u8; 64 * 1024];
        let n = file.read(&mut head)?;
        head.truncate(n);
        if !head.starts_with(IDENT) {
            return Err(if looks_like_lzma(&head) {
                Error::Compressed
            } else {
                Error::NotGma
            });
        }
        // The header is small for most addons; grow if the table did not fit.
        let (meta, data_start) = loop {
            match parse_header(&head) {
                Ok(parsed) => break parsed,
                Err(Error::Truncated(_)) => {
                    let len = head.len();
                    let total = file.metadata()?.len() as usize;
                    if len >= total {
                        return Err(Error::Truncated("header"));
                    }
                    head.resize((len * 2).min(total), 0);
                    file.seek(SeekFrom::Start(len as u64))?;
                    let got = file.read(&mut head[len..])?;
                    head.truncate(len + got);
                }
                Err(e) => return Err(e),
            }
        };
        let total = meta.files.last().map(|f| f.offset + f.size).unwrap_or(0);
        if file.metadata()?.len() < data_start + total {
            return Err(Error::Truncated("file data"));
        }
        Ok(meta.into_gma(Backing::File(Mutex::new(file)), data_start))
    }

    /// Parses an archive held in memory; LZMA input is decompressed in memory.
    pub fn from_bytes(bytes: Vec<u8>) -> Result<Gma> {
        let bytes = if bytes.starts_with(IDENT) {
            bytes
        } else if looks_like_lzma(&bytes) {
            let mut out = Vec::new();
            lzma_rs::lzma_decompress(&mut io::Cursor::new(&bytes), &mut out)
                .map_err(|e| Error::Lzma(e.to_string()))?;
            if !out.starts_with(IDENT) {
                return Err(Error::NotGma);
            }
            out
        } else {
            return Err(Error::NotGma);
        };
        let (meta, data_start) = parse_header(&bytes)?;
        let total = meta.files.last().map(|f| f.offset + f.size).unwrap_or(0);
        if (bytes.len() as u64) < data_start + total {
            return Err(Error::Truncated("file data"));
        }
        Ok(meta.into_gma(Backing::Memory(bytes), data_start))
    }

    /// Decompresses an LZMA Workshop download into a plain `.gma` at `dst`.
    pub fn decompress(src: impl AsRef<Path>, dst: impl AsRef<Path>) -> Result<()> {
        let mut input = BufReader::new(File::open(src)?);
        let tmp = dst.as_ref().with_extension("gma.part");
        {
            let mut out = io::BufWriter::new(File::create(&tmp)?);
            lzma_rs::lzma_decompress(&mut input, &mut out)
                .map_err(|e| Error::Lzma(e.to_string()))?;
        }
        std::fs::rename(&tmp, dst)?;
        Ok(())
    }

    pub fn entry(&self, path: &str) -> Option<&FileEntry> {
        let wanted = path.replace('\\', "/").to_ascii_lowercase();
        self.files.iter().find(|f| f.path == wanted)
    }

    pub fn read(&self, path: &str) -> Result<Vec<u8>> {
        let e = self
            .entry(path)
            .ok_or_else(|| Error::NotFound(path.to_string()))?;
        self.read_entry(e)
    }

    pub fn read_entry(&self, e: &FileEntry) -> Result<Vec<u8>> {
        let start = self.data_start + e.offset;
        match &self.backing {
            Backing::Memory(bytes) => Ok(bytes[start as usize..(start + e.size) as usize].to_vec()),
            Backing::File(file) => {
                let mut f = file.lock().expect("gma file lock");
                f.seek(SeekFrom::Start(start))?;
                let mut out = vec![0u8; e.size as usize];
                f.read_exact(&mut out)
                    .map_err(|_| Error::Truncated("file data"))?;
                Ok(out)
            }
        }
    }
}

struct Meta {
    version: u8,
    steam_id: u64,
    timestamp: u64,
    name: String,
    description: String,
    author: String,
    addon_version: i32,
    files: Vec<FileEntry>,
}

impl Meta {
    fn into_gma(self, backing: Backing, data_start: u64) -> Gma {
        Gma {
            version: self.version,
            steam_id: self.steam_id,
            timestamp: self.timestamp,
            name: self.name,
            description: self.description,
            author: self.author,
            addon_version: self.addon_version,
            files: self.files,
            backing,
            data_start,
        }
    }
}

fn parse_header(bytes: &[u8]) -> Result<(Meta, u64)> {
    if !bytes.starts_with(IDENT) {
        return Err(Error::NotGma);
    }
    let mut pos = 4usize;
    let version = *bytes.get(pos).ok_or(Error::Truncated("version"))?;
    pos += 1;
    let steam_id = u64_at(bytes, &mut pos)?;
    let timestamp = u64_at(bytes, &mut pos)?;
    if version > 1 {
        loop {
            let s = cstr(bytes, &mut pos)?;
            if s.is_empty() {
                break;
            }
        }
    }
    let name = cstr(bytes, &mut pos)?.to_string();
    let description = cstr(bytes, &mut pos)?.to_string();
    let author = cstr(bytes, &mut pos)?.to_string();
    let addon_version = i32::from_le_bytes(array4(bytes, &mut pos)?);

    let mut files = Vec::new();
    let mut offset = 0u64;
    loop {
        let number = u32::from_le_bytes(array4(bytes, &mut pos)?);
        if number == 0 {
            break;
        }
        let path = cstr(bytes, &mut pos)?
            .replace('\\', "/")
            .to_ascii_lowercase();
        let size = u64_at(bytes, &mut pos)?;
        let crc = u32::from_le_bytes(array4(bytes, &mut pos)?);
        files.push(FileEntry {
            path,
            size,
            crc,
            offset,
        });
        offset += size;
    }
    Ok((
        Meta {
            version,
            steam_id,
            timestamp,
            name,
            description,
            author,
            addon_version,
            files,
        },
        pos as u64,
    ))
}

/// `.lzma` container: props byte < 225, u32 dictionary size, u64 uncompressed
/// size (or -1).
fn looks_like_lzma(b: &[u8]) -> bool {
    b.len() >= 13 && b[0] < 225 && {
        let dict = u32::from_le_bytes([b[1], b[2], b[3], b[4]]);
        dict.is_power_of_two() || dict == 0 || dict % 4096 == 0
    }
}

fn cstr<'a>(bytes: &'a [u8], pos: &mut usize) -> Result<&'a str> {
    let rest = bytes.get(*pos..).ok_or(Error::Truncated("string"))?;
    let end = rest
        .iter()
        .position(|&b| b == 0)
        .ok_or(Error::Truncated("string"))?;
    let s = std::str::from_utf8(&rest[..end]).unwrap_or("?");
    *pos += end + 1;
    Ok(s)
}

fn array4(bytes: &[u8], pos: &mut usize) -> Result<[u8; 4]> {
    let s = bytes
        .get(*pos..*pos + 4)
        .ok_or(Error::Truncated("integer"))?;
    *pos += 4;
    Ok([s[0], s[1], s[2], s[3]])
}

fn u64_at(bytes: &[u8], pos: &mut usize) -> Result<u64> {
    let s = bytes
        .get(*pos..*pos + 8)
        .ok_or(Error::Truncated("integer"))?;
    *pos += 8;
    Ok(u64::from_le_bytes([
        s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7],
    ]))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Vec<u8> {
        let mut b = Vec::new();
        b.extend_from_slice(IDENT);
        b.push(3);
        b.extend_from_slice(&76561197960287930u64.to_le_bytes());
        b.extend_from_slice(&1_700_000_000u64.to_le_bytes());
        b.extend_from_slice(b"\0"); // no required content
        b.extend_from_slice(b"My Addon\0");
        b.extend_from_slice(b"{\"description\":\"d\",\"type\":\"map\",\"tags\":[\"fun\"]}\0");
        b.extend_from_slice(b"Author\0");
        b.extend_from_slice(&1i32.to_le_bytes());
        b.extend_from_slice(&1u32.to_le_bytes());
        b.extend_from_slice(b"Maps/GM_Test.bsp\0");
        b.extend_from_slice(&5i64.to_le_bytes());
        b.extend_from_slice(&0xdeadbeefu32.to_le_bytes());
        b.extend_from_slice(&2u32.to_le_bytes());
        b.extend_from_slice(b"materials/x/y.vmt\0");
        b.extend_from_slice(&3i64.to_le_bytes());
        b.extend_from_slice(&0u32.to_le_bytes());
        b.extend_from_slice(&0u32.to_le_bytes()); // end of files
        b.extend_from_slice(b"HELLOvmt");
        b
    }

    #[test]
    fn parses_header_and_reads_files_from_memory() {
        let g = Gma::from_bytes(sample()).unwrap();
        assert_eq!(g.version, 3);
        assert_eq!(g.name, "My Addon");
        assert_eq!(g.author, "Author");
        assert_eq!(g.files.len(), 2);
        assert_eq!(g.files[0].path, "maps/gm_test.bsp");
        assert_eq!(g.read("MAPS\\gm_test.bsp").unwrap(), b"HELLO");
        assert_eq!(g.read("materials/x/y.vmt").unwrap(), b"vmt");
        assert!(matches!(g.read("nope"), Err(Error::NotFound(_))));
    }

    #[test]
    fn reads_from_file_by_seeking() {
        let dir = std::env::temp_dir().join(format!("gma-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("a.gma");
        std::fs::write(&p, sample()).unwrap();
        let g = Gma::open(&p).unwrap();
        assert_eq!(g.read("materials/x/y.vmt").unwrap(), b"vmt");
        assert_eq!(g.read("maps/gm_test.bsp").unwrap(), b"HELLO");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn truncated_data_is_an_error() {
        let mut b = sample();
        b.truncate(b.len() - 2);
        assert!(matches!(
            Gma::from_bytes(b),
            Err(Error::Truncated("file data"))
        ));
        assert!(matches!(
            Gma::from_bytes(b"nope".to_vec()),
            Err(Error::NotGma)
        ));
    }
}
