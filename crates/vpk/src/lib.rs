//! Reader for Valve Pak archives.
//!
//! A VPK is either a single file or a `name_dir.vpk` directory plus
//! `name_000.vpk`, `name_001.vpk`, ... data parts. The directory holds a tree
//! of extension → path → filename with, per file, a CRC, up to a few preload
//! bytes stored inline, and the archive index and offset of the rest.
//!
//! Only reading is implemented. Paths are returned lowercase with forward
//! slashes, the way the Source filesystem compares them.

#![forbid(unsafe_code)]

use std::collections::HashMap;
use std::fmt;
use std::fs::File;
use std::io::{self, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const SIGNATURE: u32 = 0x55aa_1234;
/// `archive_index` meaning "data follows the tree in the directory file".
const DIR_ARCHIVE: u16 = 0x7fff;

#[derive(Debug)]
pub enum Error {
    Io(io::Error),
    BadSignature(u32),
    UnsupportedVersion(u32),
    Truncated(&'static str),
    MissingArchive(u16),
    NotFound(String),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Io(e) => write!(f, "io: {e}"),
            Error::BadSignature(s) => write!(f, "not a VPK (signature {s:#x})"),
            Error::UnsupportedVersion(v) => write!(f, "unsupported VPK version {v}"),
            Error::Truncated(what) => write!(f, "truncated VPK while reading {what}"),
            Error::MissingArchive(i) => write!(f, "archive part {i:03} is missing"),
            Error::NotFound(p) => write!(f, "{p} not in archive"),
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

/// Where one file's bytes live.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    pub crc: u32,
    /// Bytes stored right after the directory entry.
    pub preload: Vec<u8>,
    /// Part number, or [`DIR_ARCHIVE`] for the directory file itself.
    pub archive_index: u16,
    pub offset: u32,
    pub length: u32,
}

impl Entry {
    pub fn total_len(&self) -> usize {
        self.preload.len() + self.length as usize
    }
}

/// An opened VPK directory with lazily opened data parts.
pub struct Vpk {
    dir_path: PathBuf,
    /// `name` of `name_dir.vpk`, or `None` for a single-file archive.
    base: Option<PathBuf>,
    version: u32,
    /// Offset in the directory file where embedded file data starts.
    data_start: u64,
    entries: HashMap<String, Entry>,
    parts: Mutex<HashMap<u16, File>>,
}

impl fmt::Debug for Vpk {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("Vpk")
            .field("dir_path", &self.dir_path)
            .field("version", &self.version)
            .field("entries", &self.entries.len())
            .finish()
    }
}

impl Vpk {
    /// Opens `name_dir.vpk` (or a single-part `name.vpk`) and parses its tree.
    pub fn open(path: impl AsRef<Path>) -> Result<Vpk> {
        let path = path.as_ref();
        let bytes = std::fs::read(path)?;
        let (version, tree, data_start) = parse_header(&bytes)?;
        let entries = parse_tree(tree)?;

        let base = path
            .file_name()
            .and_then(|n| n.to_str())
            .and_then(|n| n.strip_suffix("_dir.vpk"))
            .map(|stem| path.with_file_name(stem));

        Ok(Vpk {
            dir_path: path.to_path_buf(),
            base,
            version,
            data_start,
            entries,
            parts: Mutex::new(HashMap::new()),
        })
    }

    pub fn version(&self) -> u32 {
        self.version
    }

    pub fn path(&self) -> &Path {
        &self.dir_path
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// All file paths, lowercase, forward slashes, in no particular order.
    pub fn paths(&self) -> impl Iterator<Item = &str> {
        self.entries.keys().map(String::as_str)
    }

    pub fn entries(&self) -> impl Iterator<Item = (&str, &Entry)> {
        self.entries.iter().map(|(k, v)| (k.as_str(), v))
    }

    pub fn entry(&self, path: &str) -> Option<&Entry> {
        self.entries.get(&normalize(path))
    }

    pub fn contains(&self, path: &str) -> bool {
        self.entry(path).is_some()
    }

    /// Reads a whole file.
    pub fn read(&self, path: &str) -> Result<Vec<u8>> {
        let entry = self
            .entry(path)
            .ok_or_else(|| Error::NotFound(path.to_string()))?;
        self.read_entry(entry)
    }

    pub fn read_entry(&self, entry: &Entry) -> Result<Vec<u8>> {
        let mut out = Vec::with_capacity(entry.total_len());
        out.extend_from_slice(&entry.preload);
        if entry.length == 0 {
            return Ok(out);
        }

        let mut parts = self.parts.lock().expect("vpk parts lock");
        let (file, offset) = if entry.archive_index == DIR_ARCHIVE {
            let f = parts
                .entry(DIR_ARCHIVE)
                .or_insert(File::open(&self.dir_path)?);
            (f, self.data_start + entry.offset as u64)
        } else {
            let index = entry.archive_index;
            let f = match parts.entry(index) {
                std::collections::hash_map::Entry::Occupied(o) => o.into_mut(),
                std::collections::hash_map::Entry::Vacant(v) => {
                    let base = self.base.as_ref().ok_or(Error::MissingArchive(index))?;
                    let mut name = base.as_os_str().to_owned();
                    name.push(format!("_{index:03}.vpk"));
                    let f = File::open(PathBuf::from(name))
                        .map_err(|_| Error::MissingArchive(index))?;
                    v.insert(f)
                }
            };
            (f, entry.offset as u64)
        };

        file.seek(SeekFrom::Start(offset))?;
        let start = out.len();
        out.resize(start + entry.length as usize, 0);
        file.read_exact(&mut out[start..])
            .map_err(|_| Error::Truncated("file data"))?;
        Ok(out)
    }
}

/// Lowercase, forward slashes, no leading slash.
pub fn normalize(path: &str) -> String {
    let mut s = path.replace('\\', "/").to_ascii_lowercase();
    while s.starts_with('/') {
        s.remove(0);
    }
    s
}

/// Returns (version, tree bytes, offset of embedded data).
fn parse_header(bytes: &[u8]) -> Result<(u32, &[u8], u64)> {
    if bytes.len() < 12 {
        return Err(Error::Truncated("header"));
    }
    let sig = u32_at(bytes, 0);
    if sig != SIGNATURE {
        return Err(Error::BadSignature(sig));
    }
    let version = u32_at(bytes, 4);
    let tree_size = u32_at(bytes, 8) as usize;
    let header_size = match version {
        1 => 12,
        2 => {
            if bytes.len() < 28 {
                return Err(Error::Truncated("v2 header"));
            }
            28
        }
        v => return Err(Error::UnsupportedVersion(v)),
    };
    let tree_end = header_size + tree_size;
    if bytes.len() < tree_end {
        return Err(Error::Truncated("directory tree"));
    }
    Ok((version, &bytes[header_size..tree_end], tree_end as u64))
}

fn parse_tree(tree: &[u8]) -> Result<HashMap<String, Entry>> {
    let mut entries = HashMap::new();
    let mut pos = 0usize;

    loop {
        let ext = read_cstr(tree, &mut pos)?;
        if ext.is_empty() {
            break;
        }
        loop {
            let dir = read_cstr(tree, &mut pos)?;
            if dir.is_empty() {
                break;
            }
            loop {
                let name = read_cstr(tree, &mut pos)?;
                if name.is_empty() {
                    break;
                }
                if tree.len() < pos + 18 {
                    return Err(Error::Truncated("directory entry"));
                }
                let crc = u32_at(tree, pos);
                let preload_len = u16_at(tree, pos + 4) as usize;
                let archive_index = u16_at(tree, pos + 6);
                let offset = u32_at(tree, pos + 8);
                let length = u32_at(tree, pos + 12);
                let terminator = u16_at(tree, pos + 16);
                pos += 18;
                if terminator != 0xffff {
                    return Err(Error::Truncated("entry terminator"));
                }
                if tree.len() < pos + preload_len {
                    return Err(Error::Truncated("preload bytes"));
                }
                let preload = tree[pos..pos + preload_len].to_vec();
                pos += preload_len;

                let mut full = String::with_capacity(dir.len() + name.len() + ext.len() + 2);
                // A single space means "no directory" in VPK trees.
                if dir != " " && !dir.is_empty() {
                    full.push_str(dir);
                    full.push('/');
                }
                full.push_str(name);
                if ext != " " {
                    full.push('.');
                    full.push_str(ext);
                }
                entries.insert(
                    normalize(&full),
                    Entry {
                        crc,
                        preload,
                        archive_index,
                        offset,
                        length,
                    },
                );
            }
        }
    }
    Ok(entries)
}

fn read_cstr<'a>(bytes: &'a [u8], pos: &mut usize) -> Result<&'a str> {
    let rest = &bytes[*pos..];
    let end = rest
        .iter()
        .position(|&b| b == 0)
        .ok_or(Error::Truncated("string"))?;
    let s = std::str::from_utf8(&rest[..end]).unwrap_or("?");
    *pos += end + 1;
    Ok(s)
}

fn u16_at(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}

fn u32_at(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Builds a minimal v2 directory with one embedded file and one external.
    fn sample_dir() -> Vec<u8> {
        let mut tree = Vec::new();
        let entry = |tree: &mut Vec<u8>, crc: u32, preload: &[u8], idx: u16, off: u32, len: u32| {
            tree.extend_from_slice(&crc.to_le_bytes());
            tree.extend_from_slice(&(preload.len() as u16).to_le_bytes());
            tree.extend_from_slice(&idx.to_le_bytes());
            tree.extend_from_slice(&off.to_le_bytes());
            tree.extend_from_slice(&len.to_le_bytes());
            tree.extend_from_slice(&0xffffu16.to_le_bytes());
            tree.extend_from_slice(preload);
        };
        // ext "vmt"
        tree.extend_from_slice(b"vmt\0");
        tree.extend_from_slice(b"materials/Dev\0");
        tree.extend_from_slice(b"dev_measurewall01a\0");
        entry(&mut tree, 1, b"ab", DIR_ARCHIVE, 0, 3); // preload "ab" + 3 embedded bytes
        tree.extend_from_slice(b"\0"); // end names
        tree.extend_from_slice(b"\0"); // end dirs
                                       // ext "txt", no directory
        tree.extend_from_slice(b"txt\0");
        tree.extend_from_slice(b" \0");
        tree.extend_from_slice(b"readme\0");
        entry(&mut tree, 2, b"", 0, 10, 4); // in part 000
        tree.extend_from_slice(b"\0\0");
        tree.extend_from_slice(b"\0"); // end extensions

        let mut out = Vec::new();
        out.extend_from_slice(&SIGNATURE.to_le_bytes());
        out.extend_from_slice(&2u32.to_le_bytes());
        out.extend_from_slice(&(tree.len() as u32).to_le_bytes());
        out.extend_from_slice(&3u32.to_le_bytes()); // file data section size
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&tree);
        out.extend_from_slice(b"cde"); // embedded data
        out
    }

    #[test]
    fn parses_tree_and_reads_embedded_and_external_data() {
        let dir = std::env::temp_dir().join(format!("vpk-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("pak01_dir.vpk"), sample_dir()).unwrap();
        std::fs::write(dir.join("pak01_000.vpk"), b"0123456789WXYZ..").unwrap();

        let vpk = Vpk::open(dir.join("pak01_dir.vpk")).unwrap();
        assert_eq!(vpk.version(), 2);
        assert_eq!(vpk.len(), 2);
        assert!(vpk.contains("materials/dev/dev_measurewall01a.vmt"));
        assert!(vpk.contains("MATERIALS\\Dev\\dev_measurewall01a.VMT"));
        assert!(vpk.contains("readme.txt"));

        assert_eq!(
            vpk.read("materials/dev/dev_measurewall01a.vmt").unwrap(),
            b"abcde"
        );
        assert_eq!(vpk.read("readme.txt").unwrap(), b"WXYZ");
        assert!(matches!(vpk.read("nope.txt"), Err(Error::NotFound(_))));

        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn rejects_garbage() {
        assert!(matches!(
            parse_header(b"not a vpk at all"),
            Err(Error::BadSignature(_))
        ));
        let mut v3 = SIGNATURE.to_le_bytes().to_vec();
        v3.extend_from_slice(&3u32.to_le_bytes());
        v3.extend_from_slice(&0u32.to_le_bytes());
        assert!(matches!(
            parse_header(&v3),
            Err(Error::UnsupportedVersion(3))
        ));
    }
}
