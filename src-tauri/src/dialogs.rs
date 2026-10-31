//! Native file dialogs and the commands built on them: importing images,
//! opening `.wajha` / `.wajha-template` archives and saving files.
//!
//! Dialogs run through tauri-plugin-dialog's callback API: the panel is shown
//! on the main thread and the command awaits the answer on a channel, so no
//! thread is blocked while the user browses (for minutes, possibly).

use std::cmp::Ordering;
use std::collections::VecDeque;
use std::fs;
use std::io;
use std::iter::Peekable;
use std::path::{Path, PathBuf};
use std::str::Chars;
use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;
use tauri::ipc::{Request, Response};
use tauri::{AppHandle, Runtime, State, Window};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder, FilePath};

use crate::assets::{self, ImageExt, MAX_IMAGE_BYTES};
use crate::error::{AppError, AppResult, shown};
use crate::paths;
use crate::store::{self, DataDir};

const MB: u64 = 1024 * 1024;

// Largest file `open_file_pick` accepts per kind, as OPEN_FILE_MAX_BYTES in
// src/platform/limits.ts: the importers refuse anything bigger, so a bigger
// file is turned away before it is read into memory (and copied over IPC).
const MAX_PROJECT_FILE: u64 = 500 * MB;
const MAX_TEMPLATE_FILE: u64 = 100 * MB;
const MAX_CSV_FILE: u64 = 10 * MB;
const MAX_FONT_FILE: u64 = 30 * MB;
const MAX_LOGO_FILE: u64 = 20 * MB;

/// Largest file `save_file` writes: no kind of file the app opens is
/// bigger, so a bigger one could never be opened again.
const MAX_SAVE_FILE: u64 = MAX_PROJECT_FILE;

/// Picked-but-unread files kept at most; older tokens are forgotten so a
/// frontend that never reads cannot grow the list.
const PENDING_CAPACITY: usize = 16;

/// One imported image, as `PickedImage` in src/platform/types.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedImage {
    pub asset_id: String,
    pub name: String,
    pub bytes: u64,
}

/// What `open_file_pick` returns: a single-use token for `open_file_read`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PickedFile {
    pub token: String,
    pub name: String,
}

/// A file picked with `open_file_pick`, waiting for `open_file_read`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PendingFile {
    pub path: PathBuf,
    /// The limit of its kind, checked again when the file is read.
    pub max_bytes: u64,
}

/// Files picked with `open_file_pick`, by token. Reading consumes the token,
/// so the frontend can read exactly what the user chose, once.
#[derive(Debug, Default)]
pub struct PendingFiles(Mutex<VecDeque<(String, PendingFile)>>);

impl PendingFiles {
    pub fn insert(&self, file: PendingFile) -> String {
        let token = store::random_hex(16);
        let mut pending = self.lock();
        while pending.len() >= PENDING_CAPACITY {
            pending.pop_front();
        }
        pending.push_back((token.clone(), file));
        token
    }

    pub fn take(&self, token: &str) -> Option<PendingFile> {
        let mut pending = self.lock();
        let index = pending.iter().position(|(known, _)| known == token)?;
        pending.remove(index).map(|(_, file)| file)
    }

    fn lock(&self) -> MutexGuard<'_, VecDeque<(String, PendingFile)>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/* Dialog plumbing ---------------------------------------------------- */

/// Shows a callback-style dialog and waits for its answer. `None` when the
/// dialog never answers, e.g. because the app is shutting down.
async fn run_dialog<T: Send + 'static>(show: impl FnOnce(Box<dyn FnOnce(T) + Send>)) -> Option<T> {
    let (sender, mut receiver) = tauri::async_runtime::channel(1);
    show(Box::new(move |answer| {
        // The capacity of one is never exceeded: there is a single answer.
        let _ = sender.try_send(answer);
    }));
    receiver.recv().await
}

fn into_path(file: FilePath) -> Option<PathBuf> {
    file.into_path().ok()
}

/// Dialog filter extensions. GTK matches filter patterns case-sensitively,
/// which would hide "IMG_0001.JPG" on Linux; macOS and Windows ignore case.
fn filter_extensions(extensions: &[&str]) -> Vec<String> {
    let mut all: Vec<String> = extensions.iter().map(|ext| (*ext).to_owned()).collect();
    if !cfg!(any(target_os = "macos", windows)) {
        all.extend(extensions.iter().map(|ext| ext.to_ascii_uppercase()));
    }
    all
}

fn as_strs(values: &[String]) -> Vec<&str> {
    values.iter().map(String::as_str).collect()
}

pub(crate) async fn pick_folder<R: Runtime>(builder: FileDialogBuilder<R>) -> Option<PathBuf> {
    run_dialog::<Option<FilePath>>(|done| builder.pick_folder(done))
        .await
        .flatten()
        .and_then(into_path)
}

async fn pick_file<R: Runtime>(builder: FileDialogBuilder<R>) -> Option<PathBuf> {
    run_dialog::<Option<FilePath>>(|done| builder.pick_file(done))
        .await
        .flatten()
        .and_then(into_path)
}

async fn pick_files<R: Runtime>(builder: FileDialogBuilder<R>) -> Option<Vec<PathBuf>> {
    run_dialog::<Option<Vec<FilePath>>>(|done| builder.pick_files(done))
        .await
        .flatten()
        .map(|files| files.into_iter().filter_map(into_path).collect())
}

async fn save_dialog<R: Runtime>(builder: FileDialogBuilder<R>) -> Option<PathBuf> {
    run_dialog::<Option<FilePath>>(|done| builder.save_file(done))
        .await
        .flatten()
        .and_then(into_path)
}

/* Images ------------------------------------------------------------- */

/// Stores picked files as project assets, in natural name order so a set
/// like "Screen 1, Screen 2, ... Screen 10" maps onto slides as expected.
/// Files that are unreadable, empty, over MAX_IMAGE_BYTES (checked before
/// reading) or not PNG/JPEG/WebP (by signature, whatever their extension)
/// are skipped; failing to store one is an error, since the disk is then
/// the problem.
pub fn import_images(
    base: &Path,
    project_id: &str,
    files: Vec<PathBuf>,
) -> AppResult<Vec<PickedImage>> {
    let project_id = paths::validate_project_id(project_id)?;
    let mut named: Vec<(String, PathBuf)> = files
        .into_iter()
        .map(|path| (display_name(&path), path))
        .collect();
    named.sort_by(|(a, _), (b, _)| natural_cmp(a, b));
    let mut picked = Vec::with_capacity(named.len());
    for (name, path) in named {
        // One file in memory at a time keeps a 50-screenshot import small.
        let Some(data) = read_image(&path) else {
            continue;
        };
        let Some(ext) = ImageExt::sniff(&data) else {
            continue;
        };
        let asset_id = assets::store_asset(base, project_id, &data, ext)?;
        picked.push(PickedImage {
            asset_id,
            name,
            bytes: data.len() as u64,
        });
    }
    Ok(picked)
}

fn read_image(path: &Path) -> Option<Vec<u8>> {
    let limit = MAX_IMAGE_BYTES as u64;
    match fs::metadata(path) {
        Ok(meta) if meta.is_file() && meta.len() > 0 && meta.len() <= limit => {}
        Ok(_) => return None,
        Err(err) => {
            eprintln!("wajha: cannot open {}: {err}", path.display());
            return None;
        }
    }
    match store::read_capped(path, limit) {
        Ok(data) => Some(data),
        // The file grew past the limit after the size check: skip it quietly.
        Err(err) if err.kind() == std::io::ErrorKind::FileTooLarge => None,
        Err(err) => {
            eprintln!("wajha: cannot read {}: {err}", path.display());
            None
        }
    }
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

/// Orders names the way Finder and Explorer do: case-insensitively, with
/// runs of digits compared by value ("Screen 2" before "Screen 10").
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut left = a.chars().peekable();
    let mut right = b.chars().peekable();
    loop {
        match (left.peek().copied(), right.peek().copied()) {
            // Equal as far as people can tell: fall back to the raw order so
            // the result is still deterministic.
            (None, None) => return a.cmp(b),
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let order = compare_numbers(&take_digits(&mut left), &take_digits(&mut right));
                if order != Ordering::Equal {
                    return order;
                }
            }
            (Some(x), Some(y)) => {
                let order = x.to_lowercase().cmp(y.to_lowercase());
                if order != Ordering::Equal {
                    return order;
                }
                left.next();
                right.next();
            }
        }
    }
}

fn take_digits(chars: &mut Peekable<Chars<'_>>) -> String {
    let mut digits = String::new();
    while let Some(&c) = chars.peek()
        && c.is_ascii_digit()
    {
        digits.push(c);
        chars.next();
    }
    digits
}

/// Compares digit strings by value without parsing, so no length overflows.
fn compare_numbers(a: &str, b: &str) -> Ordering {
    let (a_value, b_value) = (a.trim_start_matches('0'), b.trim_start_matches('0'));
    a_value
        .len()
        .cmp(&b_value.len())
        .then_with(|| a_value.cmp(b_value))
        .then_with(|| a.len().cmp(&b.len()))
}

/* Opening archives --------------------------------------------------- */

struct OpenKind {
    title: &'static str,
    label: &'static str,
    extensions: &'static [&'static str],
    max_bytes: u64,
}

fn open_kind(kind: &str) -> AppResult<OpenKind> {
    // ".zip" too: archives are zip files, and mail or chat apps sometimes
    // rename attachments.
    match kind {
        "project" => Ok(OpenKind {
            title: "Open a Wajha project",
            label: "Wajha project",
            extensions: &["wajha", "zip"],
            max_bytes: MAX_PROJECT_FILE,
        }),
        "template" => Ok(OpenKind {
            title: "Import a Wajha template",
            label: "Wajha template",
            extensions: &["wajha-template", "zip"],
            max_bytes: MAX_TEMPLATE_FILE,
        }),
        "csv" => Ok(OpenKind {
            title: "Import translations",
            label: "CSV spreadsheet",
            extensions: &["csv", "txt"],
            max_bytes: MAX_CSV_FILE,
        }),
        "font" => Ok(OpenKind {
            title: "Add a font",
            label: "Font",
            extensions: &["ttf", "otf", "woff", "woff2"],
            max_bytes: MAX_FONT_FILE,
        }),
        "image" => Ok(OpenKind {
            title: "Choose an image",
            label: "Image",
            extensions: &["png", "jpg", "jpeg", "webp"],
            max_bytes: MAX_LOGO_FILE,
        }),
        other => Err(AppError::invalid_data(format!(
            "unknown file kind {}",
            shown(other)
        ))),
    }
}

/// Worded like `tooLargeError` in src/platform/limits.ts.
fn too_large(name: &str, max_bytes: u64) -> AppError {
    AppError::invalid_data(format!("{name} is larger than {} MB", max_bytes >> 20))
}

fn check_openable(path: &Path, max_bytes: u64) -> AppResult<()> {
    let name = display_name(path);
    let meta = fs::metadata(path).map_err(|err| AppError::from_io(&name, &err))?;
    if !meta.is_file() {
        return Err(AppError::invalid_data(format!("{name} is not a file")));
    }
    if meta.len() > max_bytes {
        return Err(too_large(&name, max_bytes));
    }
    Ok(())
}

/// Reads a picked file whole, unless it grew past its limit since the pick.
fn read_picked(file: &PendingFile) -> AppResult<Vec<u8>> {
    store::read_capped(&file.path, file.max_bytes).map_err(|err| {
        let name = display_name(&file.path);
        if err.kind() == io::ErrorKind::FileTooLarge {
            too_large(&name, file.max_bytes)
        } else {
            AppError::from_io(&name, &err)
        }
    })
}

/* Saving ------------------------------------------------------------- */

/// The save dialog filter for a suggested name: (label, lowercase extension).
fn save_filter(name: &str) -> Option<(String, String)> {
    let (stem, ext) = name.rsplit_once('.')?;
    let sensible = !stem.is_empty()
        && !ext.is_empty()
        && ext.len() <= 20
        && ext.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    if !sensible {
        return None;
    }
    let ext = ext.to_ascii_lowercase();
    let label = match ext.as_str() {
        "wajha" => "Wajha project".to_owned(),
        "wajha-template" => "Wajha template".to_owned(),
        "csv" => "CSV spreadsheet".to_owned(),
        "zip" => "ZIP archive".to_owned(),
        "png" => "PNG image".to_owned(),
        "jpg" | "jpeg" => "JPEG image".to_owned(),
        "json" => "JSON file".to_owned(),
        other => format!("{} file", other.to_ascii_uppercase()),
    };
    Some((label, ext))
}

/// GTK save dialogs do not add the filter's extension when the user types a
/// bare name, which would leave a file the open dialog filters out. Adds it,
/// unless that would silently replace a file the dialog never asked about.
fn with_default_extension(path: PathBuf, ext: &str) -> PathBuf {
    if path.extension().is_some() || path.file_name().is_none() {
        return path;
    }
    let candidate = path.with_extension(ext);
    if fs::symlink_metadata(&candidate).is_ok() {
        path
    } else {
        candidate
    }
}

/* Commands ----------------------------------------------------------- */

#[tauri::command]
pub async fn pick_images<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    data: State<'_, DataDir>,
    project_id: String,
) -> Result<Vec<PickedImage>, String> {
    // Fail before showing a dialog whose result could not be stored.
    paths::validate_project_id(&project_id)?;
    let base = data.get()?.to_path_buf();
    let extensions = filter_extensions(&["png", "jpg", "jpeg", "webp"]);
    let builder = app
        .dialog()
        .file()
        .set_title("Choose images")
        .add_filter("Images", &as_strs(&extensions))
        .set_parent(&window);
    let Some(files) = pick_files(builder).await else {
        return Ok(Vec::new());
    };
    Ok(crate::run_blocking(move || import_images(&base, &project_id, files)).await?)
}

#[tauri::command]
pub async fn open_file_pick<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    pending: State<'_, PendingFiles>,
    kind: String,
) -> Result<Option<PickedFile>, String> {
    let kind = open_kind(&kind)?;
    let extensions = filter_extensions(kind.extensions);
    let builder = app
        .dialog()
        .file()
        .set_title(kind.title)
        .add_filter(kind.label, &as_strs(&extensions))
        .set_parent(&window);
    let Some(path) = pick_file(builder).await else {
        return Ok(None);
    };
    let max_bytes = kind.max_bytes;
    // Network volumes can stall a stat for seconds.
    let path = crate::run_blocking(move || check_openable(&path, max_bytes).map(|()| path)).await?;
    let name = display_name(&path);
    Ok(Some(PickedFile {
        token: pending.insert(PendingFile { path, max_bytes }),
        name,
    }))
}

#[tauri::command]
pub async fn open_file_read(
    pending: State<'_, PendingFiles>,
    token: String,
) -> Result<Response, String> {
    let file = pending
        .take(&token)
        .ok_or_else(|| AppError::not_found("the file token is unknown or was already used"))?;
    let bytes = crate::run_blocking(move || read_picked(&file)).await?;
    Ok(Response::new(bytes))
}

/// Raw body: the file. Header `x-name`: the suggested file name, URI-encoded.
/// Returns the saved path, or null when the dialog was cancelled.
#[tauri::command]
pub async fn save_file<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    request: Request<'_>,
) -> Result<Option<String>, String> {
    let name = paths::sanitize_file_name(&paths::header(request.headers(), "x-name")?);
    let body = paths::body_bytes(request.body())?;
    if body.len() as u64 > MAX_SAVE_FILE {
        return Err(too_large(&name, MAX_SAVE_FILE).into());
    }
    let filter = save_filter(&name);
    let mut builder = app
        .dialog()
        .file()
        .set_title("Save as")
        .set_file_name(&name)
        .set_can_create_directories(true)
        .set_parent(&window);
    if let Some((label, ext)) = &filter {
        builder = builder.add_filter(label, &[ext.as_str()]);
    }
    let Some(mut path) = save_dialog(builder).await else {
        return Ok(None);
    };
    if let Some((_, ext)) = &filter {
        path = with_default_extension(path, ext);
    }
    let saved = path.to_string_lossy().into_owned();
    // Written in place: the body is borrowed from the request, and copying
    // it to a blocking thread would double the memory of a big archive.
    store::write_atomic(&path, &body)
        .map_err(|err| AppError::from_io(&display_name(&path), &err))?;
    Ok(Some(saved))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::assets::tests::{jpeg, png, webp};
    use crate::error::ErrorCode;
    use std::time::Duration;

    #[test]
    fn dialog_answers_arrive_from_the_plugin_thread() {
        // The plugin answers from a thread of its own, like this one.
        let answer = tauri::async_runtime::block_on(run_dialog::<Option<u32>>(|done| {
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(20));
                done(Some(7));
            });
        }));
        assert_eq!(answer, Some(Some(7)));
        let cancelled =
            tauri::async_runtime::block_on(run_dialog::<Option<u32>>(|done| done(None)));
        assert_eq!(cancelled.flatten(), None);
    }

    #[test]
    fn a_dialog_that_never_answers_resolves_as_cancelled() {
        // E.g. the main thread is gone during shutdown and the callback is dropped.
        let answer = tauri::async_runtime::block_on(run_dialog::<Option<u32>>(drop));
        assert_eq!(answer, None);
    }

    fn pending(path: &str) -> PendingFile {
        PendingFile {
            path: PathBuf::from(path),
            max_bytes: MAX_PROJECT_FILE,
        }
    }

    #[test]
    fn tokens_are_single_use() {
        let files = PendingFiles::default();
        let token = files.insert(pending("/a.wajha"));
        assert_eq!(token.len(), 32);
        assert!(token.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_eq!(files.take("nope"), None);
        assert_eq!(files.take(&token), Some(pending("/a.wajha")));
        assert_eq!(files.take(&token), None);
        assert_eq!(files.take(""), None);
    }

    #[test]
    fn pending_files_are_bounded() {
        let files = PendingFiles::default();
        let tokens: Vec<String> = (0..40)
            .map(|i| files.insert(pending(&format!("/f{i}"))))
            .collect();
        assert_eq!(files.lock().len(), PENDING_CAPACITY);
        assert_eq!(files.take(&tokens[0]), None);
        assert_eq!(files.take(&tokens[39]), Some(pending("/f39")));
        assert_eq!(files.take(&tokens[24]), Some(pending("/f24")));
        assert_eq!(files.take(&tokens[23]), None);
    }

    #[test]
    fn imports_images_in_natural_order_and_skips_junk() {
        let source = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let write = |name: &str, bytes: &[u8]| {
            let path = source.path().join(name);
            fs::write(&path, bytes).unwrap();
            path
        };
        let files = vec![
            write("Screen 10.png", &png(b"10")),
            write("screen 2.PNG", &png(b"2")),
            write("Screen 1.jpg", &jpeg(b"1")),
            write("notes.txt", b"hello"),
            write("empty.png", b""),
            // Misnamed: a JPEG called .png is stored as what it really is.
            write("photo.png", &jpeg(b"real")),
            write("anim.webp", &webp(b"w")),
            source.path().join("vanished.png"),
            source.path().to_path_buf(),
        ];
        let picked = import_images(data.path(), "p1", files).unwrap();
        let names: Vec<&str> = picked.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(
            names,
            [
                "anim.webp",
                "photo.png",
                "Screen 1.jpg",
                "screen 2.PNG",
                "Screen 10.png"
            ]
        );
        assert!(picked[1].asset_id.ends_with(".jpg"));
        assert!(picked[0].asset_id.ends_with(".webp"));
        for image in &picked {
            assert!(assets::is_asset_id(&image.asset_id), "{image:?}");
            let stored = data.path().join("projects/p1/assets").join(&image.asset_id);
            assert_eq!(fs::metadata(stored).unwrap().len(), image.bytes);
        }
    }

    #[test]
    fn import_rejects_an_unsafe_project_id() {
        let data = tempfile::tempdir().unwrap();
        let err = import_images(data.path(), "../x", Vec::new()).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidPath);
    }

    #[test]
    fn import_skips_oversized_files() {
        let source = tempfile::tempdir().unwrap();
        let data = tempfile::tempdir().unwrap();
        let big = source.path().join("big.png");
        let file = fs::File::create(&big).unwrap();
        file.set_len(MAX_IMAGE_BYTES as u64 + 1).unwrap();
        let picked = import_images(data.path(), "p1", vec![big]).unwrap();
        assert!(picked.is_empty());
    }

    #[test]
    fn natural_order() {
        let mut names = vec![
            "Screen 10.png",
            "screen 2.png",
            "Screen 1.png",
            "Screen 01.png",
            "a.png",
            "B.png",
            "Screen 2a.png",
            "99999999999999999999999999.png",
            "100000000000000000000000000.png",
            "صورة 2.png",
            "صورة 10.png",
            "",
        ];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(
            names,
            [
                "",
                "99999999999999999999999999.png",
                "100000000000000000000000000.png",
                "a.png",
                "B.png",
                "Screen 1.png",
                "Screen 01.png",
                "screen 2.png",
                "Screen 2a.png",
                "Screen 10.png",
                "صورة 2.png",
                "صورة 10.png",
            ]
        );
        assert_eq!(natural_cmp("x", "x"), Ordering::Equal);
        assert_eq!(natural_cmp("A", "a"), "A".cmp("a"));
    }

    #[test]
    fn filters_cover_uppercase_extensions_where_matching_is_case_sensitive() {
        let extensions = filter_extensions(&["png", "jpg"]);
        assert!(extensions.starts_with(&["png".to_owned(), "jpg".to_owned()]));
        let case_insensitive = cfg!(any(target_os = "macos", windows));
        assert_eq!(extensions.contains(&"JPG".to_owned()), !case_insensitive);
        assert_eq!(as_strs(&extensions).len(), extensions.len());
    }

    #[test]
    fn open_kinds() {
        let project = open_kind("project").unwrap();
        assert_eq!(project.extensions, ["wajha", "zip"]);
        let template = open_kind("template").unwrap();
        assert_eq!(template.extensions, ["wajha-template", "zip"]);
        let csv = open_kind("csv").unwrap();
        assert_eq!(csv.extensions, ["csv", "txt"]);
        assert_eq!(
            open_kind("font").unwrap().extensions,
            ["ttf", "otf", "woff", "woff2"]
        );
        assert_eq!(
            open_kind("image").unwrap().extensions,
            ["png", "jpg", "jpeg", "webp"]
        );
        for bad in ["", "Project", "video", "../x"] {
            assert_eq!(
                open_kind(bad).err().map(|e| e.code()),
                Some(ErrorCode::InvalidData),
                "{bad}"
            );
        }
    }

    #[test]
    fn limits_match_the_frontend() {
        // OPEN_FILE_MAX_BYTES and MAX_IMAGE_BYTES in src/platform/limits.ts.
        let limit = |kind| open_kind(kind).unwrap().max_bytes;
        assert_eq!(limit("project"), 500 << 20);
        assert_eq!(limit("template"), 100 << 20);
        assert_eq!(limit("csv"), 10 << 20);
        assert_eq!(limit("font"), 30 << 20);
        assert_eq!(limit("image"), 20 << 20);
        assert_eq!(MAX_IMAGE_BYTES, 100 << 20);
        assert_eq!(MAX_SAVE_FILE, limit("project"));
    }

    /// A sparse file of `len` bytes: no disk space, no memory.
    fn sized(dir: &Path, name: &str, len: u64) -> PathBuf {
        let path = dir.join(name);
        fs::File::create(&path).unwrap().set_len(len).unwrap();
        path
    }

    #[test]
    fn openable_files_are_regular_and_within_their_kind_limit() {
        let dir = tempfile::tempdir().unwrap();
        let csv = open_kind("csv").unwrap().max_bytes;
        let sheet = sized(dir.path(), "texts.csv", csv);
        assert!(check_openable(&sheet, csv).is_ok());
        let big = sized(dir.path(), "big.csv", csv + 1);
        let err = check_openable(&big, csv).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidData);
        // Worded like tooLargeError in src/platform/limits.ts.
        assert_eq!(err.message(), "big.csv is larger than 10 MB");
        let project = open_kind("project").unwrap().max_bytes;
        assert!(check_openable(&big, project).is_ok());
        assert_eq!(
            check_openable(dir.path(), project).unwrap_err().code(),
            ErrorCode::InvalidData
        );
        let missing = dir.path().join("missing.wajha");
        assert_eq!(
            check_openable(&missing, project).unwrap_err().code(),
            ErrorCode::NotFound
        );
    }

    #[test]
    fn picked_files_are_read_within_their_kind_limit() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("texts.csv");
        fs::write(&path, "slide,key,ar-SA\n1,title,واجهة\n").unwrap();
        let picked = PendingFile {
            path: path.clone(),
            max_bytes: open_kind("csv").unwrap().max_bytes,
        };
        assert_eq!(read_picked(&picked).unwrap(), fs::read(&path).unwrap());
        // It grew past the limit between the pick and the read.
        fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_len(picked.max_bytes + 1)
            .unwrap();
        let err = read_picked(&picked).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidData);
        assert_eq!(err.message(), "texts.csv is larger than 10 MB");
        fs::remove_file(&path).unwrap();
        assert_eq!(
            read_picked(&picked).unwrap_err().code(),
            ErrorCode::NotFound
        );
    }

    #[test]
    fn save_filters_follow_the_extension() {
        assert_eq!(
            save_filter("My App.wajha"),
            Some(("Wajha project".to_owned(), "wajha".to_owned()))
        );
        assert_eq!(
            save_filter("Sunset.wajha-template"),
            Some(("Wajha template".to_owned(), "wajha-template".to_owned()))
        );
        assert_eq!(
            save_filter("Texts.CSV"),
            Some(("CSV spreadsheet".to_owned(), "csv".to_owned()))
        );
        assert_eq!(
            save_filter("notes.md"),
            Some(("MD file".to_owned(), "md".to_owned()))
        );
        for none in [
            "README",
            ".wajha",
            "a.",
            "a.b c",
            "a.verylongextensionthatisnotreal",
        ] {
            assert_eq!(save_filter(none), None, "{none}");
        }
    }

    #[test]
    fn adds_a_missing_extension_unless_it_would_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        let bare = dir.path().join("My App");
        assert_eq!(
            with_default_extension(bare.clone(), "wajha"),
            dir.path().join("My App.wajha")
        );
        let named = dir.path().join("My App.zip");
        assert_eq!(with_default_extension(named.clone(), "wajha"), named);
        fs::write(dir.path().join("Taken.wajha"), b"x").unwrap();
        let taken = dir.path().join("Taken");
        assert_eq!(with_default_extension(taken.clone(), "wajha"), taken);
    }
}
