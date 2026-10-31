//! Everything the editor needs to find and read game content the way
//! Garry's Mod does.
//!
//! - [`GameInstall`] finds the game through Steam (registry and library
//!   folders) or from an explicit root.
//! - [`search_paths`] turns `gameinfo.txt`, `cfg/mount.cfg`,
//!   `cfg/mountdepots.txt`, the addons folder and the Workshop download
//!   folder into an ordered list of [`Mount`]s.
//! - [`Vfs`] mounts them and answers `read(path)` with the first match, the
//!   way the engine's search path does. Paths are case-insensitive with
//!   forward slashes.
//! - [`Vfs::material`] and [`Vfs::texture`] load VMT (resolving `patch`
//!   includes) and VTF files by material name.
//!
//! Workshop downloads are LZMA-compressed and are extracted once into a cache
//! directory, like the game does, because LZMA has no random access.

#![forbid(unsafe_code)]

mod install;
mod paths;
mod vfs;

pub use install::GameInstall;
pub use paths::{search_paths, Mount, MountKind, SearchPathOptions};
pub use vfs::{normalize, MaterialError, MountInfo, Vfs};

/// `materials/<name>.vmt` for a material name as written in a VMF.
pub fn vfs_material_path(name: &str) -> String {
    vfs::material_path(name, "vmt")
}

/// `materials/<name>.vtf` for a texture name as written in a VMT.
pub fn vfs_texture_path(name: &str) -> String {
    vfs::material_path(name, "vtf")
}
