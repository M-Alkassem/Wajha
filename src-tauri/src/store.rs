//! Library storage: files inside the app data directory, addressed by
//! validated relative paths (see paths.rs). Writes are atomic, so a crash or
//! a full disk never leaves a half-written project.json behind.

use std::ffi::OsString;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::State;
use tauri::ipc::{Request, Response};

use crate::error::{AppError, AppResult};
use crate::paths::{self, LeafLink, MAX_SEGMENT_BYTES, RelPath};

/// Sanity cap for one library file. Assets are capped at 64 MB on import;
/// nothing the app writes comes close, so anything bigger is a bug or junk.
pub const MAX_STORE_FILE: u64 = 512 * 1024 * 1024;

/// Temp files are `<name>.tmp-<16 hex>`; listings hide them.
const TEMP_MARKER: &str = ".tmp-";
const TEMP_HEX_LEN: usize = 16;
/// Older temp files can only be leftovers of a crash.
const STALE_TEMP_AGE: Duration = Duration::from_secs(60 * 60);

const RENAME_ATTEMPTS: u32 = 6;

/// The app data directory, set once during setup. Commands that arrive
/// before then (or when the folder could not be resolved) fail cleanly
/// instead of panicking on unmanaged state.
#[derive(Debug, Default)]
pub struct DataDir(OnceLock<PathBuf>);

impl DataDir {
    #[cfg(test)]
    pub fn new(path: PathBuf) -> Self {
        let dir = Self::default();
        dir.set(path);
        dir
    }

    pub fn set(&self, path: PathBuf) {
        // Set once at startup; a second call keeps the first value.
        let _ = self.0.set(path);
    }

    pub fn get(&self) -> AppResult<&Path> {
        self.0
            .get()
            .map(PathBuf::as_path)
            .ok_or_else(|| AppError::io("the data folder is not available"))
    }
}

/// Creates the data directory and resolves it once, so a data folder the
/// user symlinked to another disk keeps working while every library path is
/// still checked below its real location.
pub fn prepare_data_dir(dir: PathBuf) -> PathBuf {
    if let Err(err) = fs::create_dir_all(&dir) {
        // Writes retry the creation, so the app can still report the cause.
        eprintln!("wajha: cannot create {}: {err}", dir.display());
        return dir;
    }
    dunce::canonicalize(&dir).unwrap_or(dir)
}

/// One child of a listed directory, as `DirEntry` in src/platform/types.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub name: String,
    pub is_dir: bool,
    /// Bytes for files, 0 for directories.
    pub size: u64,
    /// Last modification, milliseconds since the Unix epoch (0 if unknown).
    pub modified_ms: u64,
}

/// Bytes of the file at `rel`; `not_found` when there is no file there.
pub fn read(base: &Path, rel: &str) -> AppResult<Vec<u8>> {
    let path = RelPath::parse(rel)?;
    let target = path.resolve(base, LeafLink::Reject)?;
    match fs::symlink_metadata(&target) {
        Ok(meta) if meta.is_file() => {}
        // Directories, FIFOs and devices are not files (a FIFO would block).
        Ok(_) => return Err(AppError::not_found(format!("{rel} is not a file"))),
        Err(err) => return Err(not_found_or(rel, &err)),
    }
    read_capped(&target, MAX_STORE_FILE).map_err(|err| AppError::from_io(rel, &err))
}

/// Atomically replaces the file at `rel`, creating parent directories.
pub fn write(base: &Path, rel: &str, data: &[u8]) -> AppResult<()> {
    let path = RelPath::parse(rel)?;
    if data.len() as u64 > MAX_STORE_FILE {
        return Err(AppError::invalid_data(format!(
            "{rel}: the data is larger than {} MB",
            MAX_STORE_FILE >> 20
        )));
    }
    let target = path.resolve(base, LeafLink::Reject)?;
    write_new_file(&target, rel, data)
}

/// Creates the parents of `target` and writes it atomically. `context` is
/// the path shown in errors.
pub(crate) fn write_new_file(target: &Path, context: &str, data: &[u8]) -> AppResult<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|err| AppError::from_io(context, &err))?;
    }
    if fs::symlink_metadata(target).is_ok_and(|meta| meta.is_dir()) {
        return Err(AppError::invalid_path(format!("{context} is a directory")));
    }
    write_atomic(target, data).map_err(|err| AppError::from_io(context, &err))
}

/// Direct children of the directory at `rel`, sorted by name; `[]` when it
/// does not exist. Links, temp files and OS litter (.DS_Store, Thumbs.db)
/// are skipped: none of them can be read back through the library API.
pub fn list(base: &Path, rel: &str) -> AppResult<Vec<DirEntry>> {
    let path = RelPath::parse(rel)?;
    let dir = path.resolve(base, LeafLink::Reject)?;
    match fs::symlink_metadata(&dir) {
        Ok(meta) if meta.is_dir() => {}
        Ok(_) => return Ok(Vec::new()),
        Err(err) if is_missing(&err) => return Ok(Vec::new()),
        Err(err) => return Err(AppError::from_io(rel, &err)),
    }
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(err) if is_missing(&err) => return Ok(Vec::new()),
        Err(err) => return Err(AppError::from_io(rel, &err)),
    };
    let now = SystemTime::now();
    let mut out = Vec::new();
    // Entries that vanish or cannot be read mid-listing are skipped.
    for entry in entries.flatten() {
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        // DirEntry::metadata does not follow links, so links are neither
        // files nor directories here.
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let kind = meta.file_type();
        if !(kind.is_file() || kind.is_dir()) {
            continue;
        }
        if is_temp_name(&name) {
            if kind.is_file() && is_older_than(&meta, now, STALE_TEMP_AGE) {
                let _ = fs::remove_file(entry.path());
            }
            continue;
        }
        if is_os_litter(&name) || paths::check_segment(&name, cfg!(windows)).is_err() {
            continue;
        }
        out.push(DirEntry {
            name,
            is_dir: kind.is_dir(),
            size: if kind.is_dir() { 0 } else { meta.len() },
            modified_ms: modified_ms(&meta),
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

/// Removes the file or directory tree at `rel`; succeeds when it is missing.
pub fn remove(base: &Path, rel: &str) -> AppResult<()> {
    let path = RelPath::parse(rel)?;
    let target = path.resolve(base, LeafLink::Allow)?;
    let meta = match fs::symlink_metadata(&target) {
        Ok(meta) => meta,
        Err(err) if is_missing(&err) => return Ok(()),
        Err(err) => return Err(AppError::from_io(rel, &err)),
    };
    let result = if meta.file_type().is_symlink() {
        // Unlink only. Windows removes directory links with remove_dir.
        fs::remove_file(&target).or_else(|_| fs::remove_dir(&target))
    } else if meta.is_dir() {
        remove_tree(&target)
    } else {
        fs::remove_file(&target)
    };
    match result {
        Err(err) if !is_missing(&err) => Err(AppError::from_io(rel, &err)),
        _ => Ok(()),
    }
}

/// remove_dir_all never follows links inside the tree. A file written
/// concurrently, or one Windows still holds open for a scanner, makes it fail
/// transiently, so it gets two more tries.
fn remove_tree(path: &Path) -> io::Result<()> {
    let mut attempt = 0;
    loop {
        match fs::remove_dir_all(path) {
            Ok(()) => return Ok(()),
            Err(err) if is_missing(&err) => return Ok(()),
            Err(_) if attempt < 2 => {
                attempt += 1;
                thread::sleep(Duration::from_millis(50));
            }
            Err(err) => return Err(err),
        }
    }
}

/// Writes `data` to a temp file next to `target`, syncs it to disk and
/// renames it over `target`. Readers see either the old or the new file.
pub(crate) fn write_atomic(target: &Path, data: &[u8]) -> io::Result<()> {
    let temp = temp_path_for(target)?;
    let result = write_synced(&temp, data).and_then(|()| replace_file(&temp, target));
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

fn write_synced(path: &Path, data: &[u8]) -> io::Result<()> {
    // create_new also refuses to open through a link planted at the name.
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(data)?;
    // The data must be durable before the rename is, or a crash could leave
    // the new name pointing at an empty file. (On macOS this is F_FULLFSYNC.)
    file.sync_all()
}

fn temp_path_for(target: &Path) -> io::Result<PathBuf> {
    let no_name = || io::Error::new(io::ErrorKind::InvalidInput, "the path has no file name");
    let dir = target.parent().ok_or_else(no_name)?;
    let name = target.file_name().ok_or_else(no_name)?;
    let suffix = format!("{TEMP_MARKER}{}", random_hex(TEMP_HEX_LEN / 2));
    // A long name plus the suffix could pass the 255-byte limit.
    let mut temp = if name.len() + suffix.len() <= MAX_SEGMENT_BYTES {
        name.to_os_string()
    } else {
        OsString::from("wajha")
    };
    temp.push(&suffix);
    Ok(dir.join(temp))
}

fn replace_file(temp: &Path, target: &Path) -> io::Result<()> {
    if cfg!(windows) {
        replace_with_retry(temp, target, |from, to| fs::rename(from, to), thread::sleep)
    } else {
        // POSIX rename atomically replaces the target, even an open one.
        fs::rename(temp, target)
    }
}

/// Windows refuses to replace a file that another process (an antivirus
/// scan, the search indexer, an image viewer) has open without delete
/// sharing. Such holds are short, so retry with backoff, then remove the old
/// file first: no longer atomic, but the new bytes are already durable in
/// `temp`, so the worst case is a missing file, never a torn one.
fn replace_with_retry(
    temp: &Path,
    target: &Path,
    mut rename: impl FnMut(&Path, &Path) -> io::Result<()>,
    mut sleep: impl FnMut(Duration),
) -> io::Result<()> {
    let mut delay = Duration::from_millis(10);
    for _ in 0..RENAME_ATTEMPTS {
        match rename(temp, target) {
            Ok(()) => return Ok(()),
            // The temp file or the folder is gone: retrying cannot help.
            Err(err) if is_missing(&err) => return Err(err),
            Err(_) => {
                sleep(delay);
                delay = (delay * 2).min(Duration::from_millis(200));
            }
        }
    }
    if cfg!(windows) {
        clear_readonly(target);
    }
    match fs::remove_file(target) {
        Err(err) if !is_missing(&err) => return Err(err),
        _ => {}
    }
    rename(temp, target)
}

/// The read-only attribute makes Windows refuse both replacing and deleting.
// Only called on Windows, where set_readonly(false) clears that attribute;
// on Unix it would make the file world-writable.
#[allow(clippy::permissions_set_readonly_false)]
fn clear_readonly(path: &Path) {
    if let Ok(meta) = fs::metadata(path) {
        let mut permissions = meta.permissions();
        if permissions.readonly() {
            permissions.set_readonly(false);
            let _ = fs::set_permissions(path, permissions);
        }
    }
}

/// Reads a whole file, refusing files larger than `max` bytes (also when the
/// file grows while it is being read).
pub(crate) fn read_capped(path: &Path, max: u64) -> io::Result<Vec<u8>> {
    let file = File::open(path)?;
    let len = file.metadata()?.len();
    if len > max {
        return Err(too_large(max));
    }
    // Exact capacity: no doubling growth and no copy for big files.
    let mut data = Vec::with_capacity(usize::try_from(len).unwrap_or(0));
    file.take(max.saturating_add(1)).read_to_end(&mut data)?;
    if data.len() as u64 > max {
        return Err(too_large(max));
    }
    Ok(data)
}

fn too_large(max: u64) -> io::Error {
    io::Error::new(
        io::ErrorKind::FileTooLarge,
        format!("the file is larger than {} MB", max >> 20),
    )
}

pub(crate) fn is_missing(err: &io::Error) -> bool {
    matches!(
        err.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
    )
}

fn not_found_or(context: &str, err: &io::Error) -> AppError {
    if is_missing(err) {
        AppError::not_found(context)
    } else {
        AppError::from_io(context, err)
    }
}

/// `<name>.tmp-<16 lowercase hex>`, as written by `write_atomic`.
pub(crate) fn is_temp_name(name: &str) -> bool {
    name.rsplit_once(TEMP_MARKER).is_some_and(|(stem, suffix)| {
        !stem.is_empty()
            && suffix.len() == TEMP_HEX_LEN
            && suffix
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    })
}

/// Files that Finder, Explorer or exFAT volumes drop into any folder.
fn is_os_litter(name: &str) -> bool {
    name == ".DS_Store"
        || name.starts_with("._")
        || name.eq_ignore_ascii_case("Thumbs.db")
        || name.eq_ignore_ascii_case("desktop.ini")
}

fn is_older_than(meta: &fs::Metadata, now: SystemTime, age: Duration) -> bool {
    meta.modified()
        .ok()
        .and_then(|modified| now.duration_since(modified).ok())
        .is_some_and(|elapsed| elapsed > age)
}

fn modified_ms(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |since| {
            u64::try_from(since.as_millis()).unwrap_or(u64::MAX)
        })
}

/// Lowercase hex of `bytes`.
pub(crate) fn to_hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(char::from(DIGITS[usize::from(byte >> 4)]));
        out.push(char::from(DIGITS[usize::from(byte & 0x0f)]));
    }
    out
}

/// `2 * bytes` hex characters of OS randomness.
pub(crate) fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    if getrandom::fill(&mut buf).is_err() {
        fallback_random(&mut buf);
    }
    to_hex(&buf)
}

/// OS randomness only fails in exotic sandboxes. Temp names and file tokens
/// need uniqueness more than secrecy there, so a keyed hash (std's
/// RandomState is seeded from the OS once) of a counter and the time will do.
fn fallback_random(buf: &mut [u8]) {
    use std::hash::{BuildHasher, Hasher};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let state = std::collections::hash_map::RandomState::new();
    for chunk in buf.chunks_mut(8) {
        let mut hasher = state.build_hasher();
        hasher.write_u64(COUNTER.fetch_add(1, Ordering::Relaxed));
        hasher.write_u128(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |since| since.as_nanos()),
        );
        hasher.write_u32(std::process::id());
        let bytes = hasher.finish().to_le_bytes();
        chunk.copy_from_slice(&bytes[..chunk.len()]);
    }
}

/* Commands ----------------------------------------------------------- */

#[tauri::command]
pub async fn store_read(data: State<'_, DataDir>, path: String) -> Result<Response, String> {
    let base = data.get()?.to_path_buf();
    let bytes = crate::run_blocking(move || read(&base, &path)).await?;
    Ok(Response::new(bytes))
}

/// The body is borrowed from the request, so it is written in place rather
/// than copied to a blocking thread: one less copy of up to 512 MB.
#[tauri::command]
pub async fn store_write(data: State<'_, DataDir>, request: Request<'_>) -> Result<(), String> {
    let rel = paths::header(request.headers(), "x-path")?;
    let body = paths::body_bytes(request.body())?;
    write(data.get()?, &rel, &body)?;
    Ok(())
}

#[tauri::command]
pub async fn store_list(data: State<'_, DataDir>, dir: String) -> Result<Vec<DirEntry>, String> {
    let base = data.get()?.to_path_buf();
    Ok(crate::run_blocking(move || list(&base, &dir)).await?)
}

#[tauri::command]
pub async fn store_remove(data: State<'_, DataDir>, path: String) -> Result<(), String> {
    let base = data.get()?.to_path_buf();
    Ok(crate::run_blocking(move || remove(&base, &path)).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;
    use std::cell::{Cell, RefCell};

    fn names(entries: &[DirEntry]) -> Vec<&str> {
        entries.iter().map(|e| e.name.as_str()).collect()
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "projects/p1/project.json", b"{\"a\":1}").unwrap();
        assert_eq!(
            read(dir.path(), "projects/p1/project.json").unwrap(),
            b"{\"a\":1}"
        );
        write(dir.path(), "projects/p1/project.json", b"{}").unwrap();
        assert_eq!(read(dir.path(), "projects/p1/project.json").unwrap(), b"{}");
        write(dir.path(), "empty.bin", b"").unwrap();
        assert!(read(dir.path(), "empty.bin").unwrap().is_empty());
        let unicode = "projects/p1/واجهة 🙂.txt";
        write(dir.path(), unicode, "نص".as_bytes()).unwrap();
        assert_eq!(read(dir.path(), unicode).unwrap(), "نص".as_bytes());
    }

    #[test]
    fn writes_leave_no_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..20 {
            write(dir.path(), "a/b.json", format!("{i}").as_bytes()).unwrap();
        }
        let files: Vec<_> = fs::read_dir(dir.path().join("a"))
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(files.len(), 1);
        assert_eq!(read(dir.path(), "a/b.json").unwrap(), b"19");
    }

    #[test]
    fn read_reports_missing_files_as_not_found() {
        let dir = tempfile::tempdir().unwrap();
        let err = read(dir.path(), "projects/x/project.json").unwrap_err();
        assert_eq!(err.to_string(), "not_found: projects/x/project.json");
        fs::create_dir_all(dir.path().join("projects/x")).unwrap();
        let err = read(dir.path(), "projects/x").unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
        // A file where a folder is expected is also "no such file".
        fs::write(dir.path().join("file"), b"x").unwrap();
        let err = read(dir.path(), "file/child").unwrap_err();
        assert_eq!(err.code(), ErrorCode::NotFound);
    }

    #[test]
    fn rejects_invalid_paths_before_touching_the_disk() {
        let dir = tempfile::tempdir().unwrap();
        for bad in ["", "../escape", "/abs", "a//b", "a\\b", "C:/x", "a/./b"] {
            assert_eq!(
                read(dir.path(), bad).unwrap_err().code(),
                ErrorCode::InvalidPath,
                "{bad:?}"
            );
            assert_eq!(
                write(dir.path(), bad, b"x").unwrap_err().code(),
                ErrorCode::InvalidPath
            );
            assert_eq!(
                list(dir.path(), bad).unwrap_err().code(),
                ErrorCode::InvalidPath
            );
            assert_eq!(
                remove(dir.path(), bad).unwrap_err().code(),
                ErrorCode::InvalidPath
            );
        }
        assert!(!dir.path().parent().unwrap().join("escape").exists());
    }

    #[test]
    fn write_refuses_to_replace_a_directory() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("projects/p1")).unwrap();
        let err = write(dir.path(), "projects/p1", b"x").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidPath);
        assert!(dir.path().join("projects/p1").is_dir());
    }

    #[test]
    fn write_fails_when_a_parent_is_a_file() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "projects", b"x").unwrap();
        let err = write(dir.path(), "projects/p1/project.json", b"x").unwrap_err();
        assert_ne!(err.code(), ErrorCode::NotFound);
        assert_eq!(read(dir.path(), "projects").unwrap(), b"x");
    }

    #[test]
    fn write_recreates_a_deleted_data_folder() {
        let holder = tempfile::tempdir().unwrap();
        let base = holder.path().join("data");
        write(&base, "settings.json", b"{}").unwrap();
        assert_eq!(read(&base, "settings.json").unwrap(), b"{}");
    }

    #[test]
    fn lists_direct_children_sorted() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "projects/b/project.json", b"12345").unwrap();
        write(dir.path(), "projects/a/meta.json", b"1").unwrap();
        write(dir.path(), "projects/z.json", b"abc").unwrap();
        let entries = list(dir.path(), "projects").unwrap();
        assert_eq!(names(&entries), ["a", "b", "z.json"]);
        assert!(entries[0].is_dir && entries[1].is_dir && !entries[2].is_dir);
        assert_eq!(entries[0].size, 0);
        assert_eq!(entries[2].size, 3);
        let now_ms = u64::try_from(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_millis(),
        )
        .unwrap();
        for entry in &entries {
            assert!(entry.modified_ms > 1_600_000_000_000, "{entry:?}");
            assert!(entry.modified_ms <= now_ms + 60_000, "{entry:?}");
        }
    }

    #[test]
    fn list_of_a_missing_folder_or_a_file_is_empty() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list(dir.path(), "projects").unwrap().is_empty());
        assert!(list(dir.path(), "projects/x/assets").unwrap().is_empty());
        write(dir.path(), "file.json", b"{}").unwrap();
        assert!(list(dir.path(), "file.json").unwrap().is_empty());
        assert!(list(dir.path(), "file.json/child").unwrap().is_empty());
    }

    #[test]
    fn list_hides_temp_files_litter_and_unreachable_names() {
        let dir = tempfile::tempdir().unwrap();
        let assets = dir.path().join("assets");
        fs::create_dir_all(&assets).unwrap();
        for name in [
            "a.png",
            "a.png.tmp-0123456789abcdef",
            ".DS_Store",
            "._a.png",
            "Thumbs.db",
            "desktop.ini",
            "bad\\name",
            "colon:name",
        ] {
            fs::write(assets.join(name), b"x").unwrap();
        }
        // Not our temp pattern: listed as a normal file.
        fs::write(assets.join("b.tmp-xyz"), b"x").unwrap();
        let entries = list(dir.path(), "assets").unwrap();
        assert_eq!(names(&entries), ["a.png", "b.tmp-xyz"]);
        // A fresh temp file may belong to a write in progress: it stays.
        assert!(assets.join("a.png.tmp-0123456789abcdef").exists());
    }

    #[test]
    fn list_removes_stale_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("p");
        fs::create_dir_all(&folder).unwrap();
        let stale = folder.join("project.json.tmp-00000000000000ff");
        fs::write(&stale, b"partial").unwrap();
        let old = SystemTime::now() - Duration::from_secs(3 * 60 * 60);
        File::options()
            .write(true)
            .open(&stale)
            .unwrap()
            .set_modified(old)
            .unwrap();
        assert!(list(dir.path(), "p").unwrap().is_empty());
        assert!(!stale.exists());
    }

    #[cfg(unix)]
    #[test]
    fn list_skips_links_and_refuses_linked_folders() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret"), b"s").unwrap();
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("p")).unwrap();
        fs::write(dir.path().join("p/real.json"), b"{}").unwrap();
        symlink(outside.path().join("secret"), dir.path().join("p/link")).unwrap();
        symlink(outside.path(), dir.path().join("linked")).unwrap();
        assert_eq!(names(&list(dir.path(), "p").unwrap()), ["real.json"]);
        assert_eq!(
            list(dir.path(), "linked").unwrap_err().code(),
            ErrorCode::Permission
        );
        assert_eq!(
            read(dir.path(), "p/link").unwrap_err().code(),
            ErrorCode::Permission
        );
        assert_eq!(
            read(dir.path(), "linked/secret").unwrap_err().code(),
            ErrorCode::Permission
        );
        assert_eq!(
            write(dir.path(), "linked/new", b"x").unwrap_err().code(),
            ErrorCode::Permission
        );
        assert!(!outside.path().join("new").exists());
        // Writing over a link must not write through it.
        assert_eq!(
            write(dir.path(), "p/link", b"x").unwrap_err().code(),
            ErrorCode::Permission
        );
        assert_eq!(fs::read(outside.path().join("secret")).unwrap(), b"s");
    }

    #[test]
    fn removes_files_and_trees() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "projects/p1/project.json", b"{}").unwrap();
        write(dir.path(), "projects/p1/assets/a.png", b"x").unwrap();
        write(dir.path(), "projects/p2/project.json", b"{}").unwrap();
        remove(dir.path(), "projects/p1/assets/a.png").unwrap();
        assert!(!dir.path().join("projects/p1/assets/a.png").exists());
        remove(dir.path(), "projects/p1").unwrap();
        assert!(!dir.path().join("projects/p1").exists());
        assert!(dir.path().join("projects/p2/project.json").exists());
        // Missing paths are fine, repeatedly.
        remove(dir.path(), "projects/p1").unwrap();
        remove(dir.path(), "nothing/here/at/all").unwrap();
        remove(dir.path(), "projects/p2/project.json/child").unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn remove_unlinks_links_without_touching_targets() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("keep"), b"k").unwrap();
        let dir = tempfile::tempdir().unwrap();
        symlink(outside.path(), dir.path().join("dirlink")).unwrap();
        symlink(outside.path().join("keep"), dir.path().join("filelink")).unwrap();
        remove(dir.path(), "dirlink").unwrap();
        remove(dir.path(), "filelink").unwrap();
        assert!(fs::symlink_metadata(dir.path().join("dirlink")).is_err());
        assert!(fs::symlink_metadata(dir.path().join("filelink")).is_err());
        assert_eq!(fs::read(outside.path().join("keep")).unwrap(), b"k");
        // A tree containing a link is removed without following it.
        fs::create_dir_all(dir.path().join("p")).unwrap();
        symlink(outside.path(), dir.path().join("p/inner")).unwrap();
        remove(dir.path(), "p").unwrap();
        assert!(!dir.path().join("p").exists());
        assert!(outside.path().join("keep").exists());
        // Paths that traverse a link are refused.
        symlink(outside.path(), dir.path().join("again")).unwrap();
        assert_eq!(
            remove(dir.path(), "again/keep").unwrap_err().code(),
            ErrorCode::Permission
        );
        assert!(outside.path().join("keep").exists());
    }

    #[test]
    fn write_atomic_keeps_the_old_file_when_the_write_fails() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("missing-folder").join("file.json");
        assert!(write_atomic(&target, b"x").is_err());
        let existing = dir.path().join("keep.json");
        fs::write(&existing, b"old").unwrap();
        write_atomic(&existing, b"new").unwrap();
        assert_eq!(fs::read(&existing).unwrap(), b"new");
    }

    #[test]
    fn temp_names_fit_the_segment_limit() {
        let dir = tempfile::tempdir().unwrap();
        let long = "a".repeat(250);
        let temp = temp_path_for(&dir.path().join(&long)).unwrap();
        let name = temp.file_name().unwrap().to_str().unwrap();
        assert!(name.len() <= MAX_SEGMENT_BYTES);
        assert!(is_temp_name(name));
        // And long names still write atomically.
        write(dir.path(), &long, b"ok").unwrap();
        assert_eq!(read(dir.path(), &long).unwrap(), b"ok");
        let short = temp_path_for(&dir.path().join("project.json")).unwrap();
        let short = short.file_name().unwrap().to_str().unwrap();
        assert!(short.starts_with("project.json.tmp-"));
        assert!(is_temp_name(short));
    }

    #[test]
    fn recognises_temp_names() {
        assert!(is_temp_name("a.json.tmp-0123456789abcdef"));
        assert!(!is_temp_name(".tmp-0123456789abcdef"));
        assert!(!is_temp_name("a.json.tmp-0123456789ABCDEF"));
        assert!(!is_temp_name("a.json.tmp-0123"));
        assert!(!is_temp_name("a.json"));
        assert!(!is_temp_name("a.tmp-0123456789abcdefg"));
    }

    #[test]
    fn rename_retries_transient_failures() {
        let dir = tempfile::tempdir().unwrap();
        let temp = dir.path().join("t");
        let target = dir.path().join("target");
        fs::write(&temp, b"new").unwrap();
        fs::write(&target, b"old").unwrap();
        let failures = Cell::new(3);
        let sleeps = RefCell::new(Vec::new());
        replace_with_retry(
            &temp,
            &target,
            |from, to| {
                if failures.get() > 0 {
                    failures.set(failures.get() - 1);
                    Err(io::Error::from(io::ErrorKind::PermissionDenied))
                } else {
                    fs::rename(from, to)
                }
            },
            |d| sleeps.borrow_mut().push(d.as_millis()),
        )
        .unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert_eq!(*sleeps.borrow(), [10, 20, 40]);
    }

    #[test]
    fn rename_falls_back_to_remove_then_rename() {
        let dir = tempfile::tempdir().unwrap();
        let temp = dir.path().join("t");
        let target = dir.path().join("target");
        fs::write(&temp, b"new").unwrap();
        fs::write(&target, b"old").unwrap();
        let calls = Cell::new(0);
        let mut slept = Duration::ZERO;
        replace_with_retry(
            &temp,
            &target,
            |from, to| {
                calls.set(calls.get() + 1);
                // Fails while the old file exists, like a locked target.
                if to.exists() {
                    Err(io::Error::from(io::ErrorKind::PermissionDenied))
                } else {
                    fs::rename(from, to)
                }
            },
            |d| slept += d,
        )
        .unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"new");
        assert_eq!(calls.get(), RENAME_ATTEMPTS + 1);
        assert!(slept < Duration::from_secs(1));
    }

    #[test]
    fn rename_gives_up_at_once_when_the_temp_file_is_gone() {
        let dir = tempfile::tempdir().unwrap();
        let calls = Cell::new(0);
        let err = replace_with_retry(
            &dir.path().join("missing"),
            &dir.path().join("target"),
            |_, _| {
                calls.set(calls.get() + 1);
                Err(io::Error::from(io::ErrorKind::NotFound))
            },
            |_| panic!("must not sleep"),
        )
        .unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::NotFound);
        assert_eq!(calls.get(), 1);
    }

    #[test]
    fn read_capped_enforces_the_limit() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("f");
        fs::write(&path, vec![7u8; 100]).unwrap();
        assert_eq!(read_capped(&path, 100).unwrap().len(), 100);
        let err = read_capped(&path, 99).unwrap_err();
        assert_eq!(err.kind(), io::ErrorKind::FileTooLarge);
        assert_eq!(AppError::from_io("f", &err).code(), ErrorCode::InvalidData);
    }

    #[test]
    fn hex_and_randomness() {
        assert_eq!(to_hex(&[0x00, 0x0f, 0xa0, 0xff]), "000fa0ff");
        assert_eq!(to_hex(&[]), "");
        let a = random_hex(16);
        let b = random_hex(16);
        assert_eq!(a.len(), 32);
        assert_ne!(a, b);
        let mut buf = [0u8; 20];
        fallback_random(&mut buf);
        let mut other = [0u8; 20];
        fallback_random(&mut other);
        assert_ne!(buf, other);
    }

    #[test]
    fn data_dir_is_set_once() {
        let unset = DataDir::default();
        assert_eq!(unset.get().unwrap_err().code(), ErrorCode::Io);
        let dir = DataDir::new(PathBuf::from("/first"));
        dir.set(PathBuf::from("/second"));
        assert_eq!(dir.get().unwrap(), Path::new("/first"));
    }

    #[test]
    fn prepare_creates_and_resolves_the_folder() {
        let holder = tempfile::tempdir().unwrap();
        let wanted = holder.path().join("studio.wajha.app");
        let prepared = prepare_data_dir(wanted.clone());
        assert!(prepared.is_dir());
        assert_eq!(prepared, dunce::canonicalize(&wanted).unwrap());
    }
}
