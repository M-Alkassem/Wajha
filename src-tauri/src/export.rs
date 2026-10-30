//! Export destinations. The frontend may only write below folders the user
//! picked in this session's folder dialog; each root is remembered in its
//! canonical form, so a renamed path, `..` or a symlink cannot widen it.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use tauri::ipc::Request;
use tauri::{AppHandle, Runtime, State, Window};
use tauri_plugin_dialog::DialogExt;

use crate::dialogs;
use crate::error::{AppError, AppResult, shown};
use crate::paths::{self, LeafLink, RelPath};
use crate::store::{self, MAX_STORE_FILE};

/// Canonical paths of the folders picked with `pick_export_dir`.
#[derive(Debug, Default)]
pub struct ExportRoots(Mutex<HashSet<PathBuf>>);

impl ExportRoots {
    pub fn remember(&self, canonical: PathBuf) {
        self.lock().insert(canonical);
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashSet<PathBuf>> {
        // A panic elsewhere cannot leave the set half-updated.
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// The canonical root for a path the frontend sent back, which must
    /// canonicalise to a picked folder exactly.
    pub fn resolve_root(&self, root: &str) -> AppResult<PathBuf> {
        let canonical = canonical_absolute(root, "export folder")?;
        if self.lock().contains(&canonical) {
            Ok(canonical)
        } else {
            Err(AppError::permission(format!(
                "the export folder {} was not chosen in this session",
                shown(root)
            )))
        }
    }

    /// A picked folder or something inside one, and whether it is the
    /// picked folder itself.
    pub fn resolve_within(&self, path: &str) -> AppResult<(PathBuf, bool)> {
        let canonical = canonical_absolute(path, "path")?;
        let roots = self.lock();
        if roots.contains(&canonical) {
            return Ok((canonical, true));
        }
        if roots.iter().any(|root| canonical.starts_with(root)) {
            Ok((canonical, false))
        } else {
            Err(AppError::permission(format!(
                "{} is not inside a chosen export folder",
                shown(path)
            )))
        }
    }
}

/// Canonical form of an absolute path from the frontend. Canonicalising
/// resolves `..`, symlinks and (on Windows) short names and case, so two
/// spellings of one folder compare equal.
fn canonical_absolute(path: &str, what: &str) -> AppResult<PathBuf> {
    let candidate = Path::new(path);
    if path.is_empty() || path.chars().any(char::is_control) || !candidate.is_absolute() {
        return Err(AppError::invalid_path(format!(
            "the {what} must be an absolute path, got {}",
            shown(path)
        )));
    }
    dunce::canonicalize(candidate).map_err(|err| {
        if store::is_missing(&err) {
            AppError::not_found(format!("the {what} {} no longer exists", shown(path)))
        } else {
            AppError::from_io(path, &err)
        }
    })
}

/// Writes one exported file at `rel` below a picked root, creating folders.
pub fn write_export(roots: &ExportRoots, root: &str, rel: &str, data: &[u8]) -> AppResult<()> {
    let root = roots.resolve_root(root)?;
    let path = RelPath::parse(rel)?;
    if data.len() as u64 > MAX_STORE_FILE {
        return Err(AppError::invalid_data(format!(
            "{rel}: the file is larger than {} MB",
            MAX_STORE_FILE >> 20
        )));
    }
    let target = path.resolve(&root, LeafLink::Reject)?;
    store::write_new_file(&target, rel, data)
}

/// Shows an export in Finder, Explorer or the Linux file manager. A picked
/// folder is opened, so the user lands among the exported screenshots;
/// anything inside it is only selected, never opened: `open` would launch a
/// folder named "x.app" on macOS. (Folder pickers cannot pick bundles.)
fn reveal(target: &Path, is_root: bool) -> AppResult<()> {
    let result = if is_root && target.is_dir() {
        tauri_plugin_opener::open_path(target, None::<&str>)
    } else {
        tauri_plugin_opener::reveal_item_in_dir(target)
    };
    result.map_err(|err| AppError::io(format!("could not show {}: {err}", target.display())))
}

/* Commands ----------------------------------------------------------- */

/// Native folder picker. Returns the folder as picked (the spelling the user
/// recognises) and remembers its canonical form as an allowed root.
///
/// The frontend also sends `suggestedName`; it is deliberately not read,
/// because no platform lets a folder picker pre-fill a name (rfd ignores
/// file names for folder dialogs) and Tauri skips undeclared arguments.
#[tauri::command]
pub async fn pick_export_dir<R: Runtime>(
    app: AppHandle<R>,
    window: Window<R>,
    roots: State<'_, ExportRoots>,
) -> Result<Option<String>, String> {
    let builder = app
        .dialog()
        .file()
        .set_title("Choose where to export")
        .set_can_create_directories(true)
        .set_parent(&window);
    let Some(picked) = dialogs::pick_folder(builder).await else {
        return Ok(None);
    };
    // The frontend sends the folder back in a URI-encoded header, which can
    // only carry valid Unicode.
    let shown_path = picked
        .to_str()
        .map(str::to_owned)
        .ok_or_else(|| AppError::invalid_path("the folder name cannot be represented as text"))?;
    let (canonical, shown_path) = crate::run_blocking(move || {
        let canonical = canonical_absolute(&shown_path, "export folder")?;
        if canonical.is_dir() {
            Ok((canonical, shown_path))
        } else {
            Err(AppError::invalid_path(
                "the chosen export location is not a folder",
            ))
        }
    })
    .await?;
    roots.remember(canonical);
    Ok(Some(shown_path))
}

/// Raw body: the file. Headers: `x-root` (a folder from `pick_export_dir`)
/// and `x-path` (relative POSIX path inside it), both URI-encoded.
#[tauri::command]
pub async fn export_write(
    roots: State<'_, ExportRoots>,
    request: Request<'_>,
) -> Result<(), String> {
    let root = paths::header(request.headers(), "x-root")?;
    let rel = paths::header(request.headers(), "x-path")?;
    let body = paths::body_bytes(request.body())?;
    write_export(&roots, &root, &rel, &body)?;
    Ok(())
}

#[tauri::command]
pub async fn reveal_path(roots: State<'_, ExportRoots>, path: String) -> Result<(), String> {
    let (target, is_root) = roots.resolve_within(&path)?;
    Ok(crate::run_blocking(move || reveal(&target, is_root)).await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;
    use std::fs;

    fn picked(dir: &Path) -> (ExportRoots, String) {
        let roots = ExportRoots::default();
        roots.remember(dunce::canonicalize(dir).unwrap());
        (roots, dir.to_str().unwrap().to_owned())
    }

    #[test]
    fn writes_inside_a_picked_root() {
        let dir = tempfile::tempdir().unwrap();
        let (roots, root) = picked(dir.path());
        write_export(&roots, &root, "App Store/en-US/iPhone 6.9/01.png", b"png").unwrap();
        write_export(&roots, &root, "Google Play/ar/Feature graphic.png", b"fg").unwrap();
        let file = dir.path().join("App Store/en-US/iPhone 6.9/01.png");
        assert_eq!(fs::read(file).unwrap(), b"png");
        // Re-exporting replaces files in place.
        write_export(&roots, &root, "App Store/en-US/iPhone 6.9/01.png", b"v2").unwrap();
        assert_eq!(
            fs::read(dir.path().join("App Store/en-US/iPhone 6.9/01.png")).unwrap(),
            b"v2"
        );
    }

    #[test]
    fn other_spellings_of_a_root_are_the_same_root() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir(dir.path().join("sub")).unwrap();
        let (roots, root) = picked(dir.path());
        let dotted = format!("{root}/sub/..");
        write_export(&roots, &dotted, "a.png", b"x").unwrap();
        let slash = format!("{root}/");
        write_export(&roots, &slash, "b.png", b"x").unwrap();
        assert!(dir.path().join("a.png").exists() && dir.path().join("b.png").exists());
    }

    #[test]
    fn refuses_roots_that_were_not_picked() {
        let picked_dir = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let (roots, _) = picked(picked_dir.path());
        let err = write_export(&roots, other.path().to_str().unwrap(), "a.png", b"x").unwrap_err();
        assert_eq!(err.code(), ErrorCode::Permission);
        // A subfolder of a root is not a root either.
        fs::create_dir(picked_dir.path().join("sub")).unwrap();
        let sub = picked_dir.path().join("sub");
        let err = write_export(&roots, sub.to_str().unwrap(), "a.png", b"x").unwrap_err();
        assert_eq!(err.code(), ErrorCode::Permission);
        // Nor its parent.
        let parent = picked_dir.path().parent().unwrap();
        let err = write_export(&roots, parent.to_str().unwrap(), "a.png", b"x").unwrap_err();
        assert_eq!(err.code(), ErrorCode::Permission);
        let empty = ExportRoots::default();
        let err =
            write_export(&empty, picked_dir.path().to_str().unwrap(), "a.png", b"x").unwrap_err();
        assert_eq!(err.code(), ErrorCode::Permission);
        assert!(!other.path().join("a.png").exists());
    }

    #[test]
    fn refuses_relative_missing_or_hostile_roots() {
        let dir = tempfile::tempdir().unwrap();
        let (roots, root) = picked(dir.path());
        for bad in ["", "relative/dir", ".", "..", "C:relative", "a\0b"] {
            let err = write_export(&roots, bad, "a.png", b"x").unwrap_err();
            assert_eq!(err.code(), ErrorCode::InvalidPath, "{bad:?}");
        }
        let gone = format!("{root}/missing");
        assert_eq!(
            write_export(&roots, &gone, "a.png", b"x")
                .unwrap_err()
                .code(),
            ErrorCode::NotFound
        );
        let with_newline = format!("{root}\n");
        assert_eq!(
            write_export(&roots, &with_newline, "a.png", b"x")
                .unwrap_err()
                .code(),
            ErrorCode::InvalidPath
        );
    }

    #[test]
    fn export_paths_follow_library_rules() {
        let dir = tempfile::tempdir().unwrap();
        let (roots, root) = picked(dir.path());
        for bad in [
            "../escape.png",
            "/abs.png",
            "a/../../b.png",
            "a\\b.png",
            "",
            "a//b.png",
            "C:/x.png",
        ] {
            let err = write_export(&roots, &root, bad, b"x").unwrap_err();
            assert_eq!(err.code(), ErrorCode::InvalidPath, "{bad:?}");
        }
        assert!(!dir.path().parent().unwrap().join("escape.png").exists());
    }

    #[cfg(unix)]
    #[test]
    fn never_writes_through_links_inside_a_root() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        symlink(outside.path(), dir.path().join("App Store")).unwrap();
        let (roots, root) = picked(dir.path());
        let err = write_export(&roots, &root, "App Store/en-US/01.png", b"x").unwrap_err();
        assert_eq!(err.code(), ErrorCode::Permission);
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }

    #[cfg(unix)]
    #[test]
    fn a_linked_root_is_remembered_by_its_target() {
        use std::os::unix::fs::symlink;
        let real = tempfile::tempdir().unwrap();
        let holder = tempfile::tempdir().unwrap();
        let link = holder.path().join("Exports");
        symlink(real.path(), &link).unwrap();
        let (roots, link_text) = picked(&link);
        write_export(&roots, &link_text, "01.png", b"x").unwrap();
        assert!(real.path().join("01.png").exists());
        // The real folder is the same root.
        write_export(&roots, real.path().to_str().unwrap(), "02.png", b"x").unwrap();
    }

    #[test]
    fn reveal_scope_covers_roots_and_their_contents_only() {
        let dir = tempfile::tempdir().unwrap();
        let (roots, root) = picked(dir.path());
        fs::create_dir_all(dir.path().join("App Store/en-US")).unwrap();
        fs::write(dir.path().join("App Store/en-US/01.png"), b"x").unwrap();
        assert!(roots.resolve_within(&root).unwrap().1);
        let (inside, is_root) = roots
            .resolve_within(&format!("{root}/App Store/en-US/01.png"))
            .unwrap();
        assert!(!is_root);
        assert!(inside.ends_with("App Store/en-US/01.png"));
        // Folders inside a root are only ever selected, never opened.
        assert!(
            !roots
                .resolve_within(&format!("{root}/App Store"))
                .unwrap()
                .1
        );
        // Another spelling of the root is still the root.
        assert!(
            roots
                .resolve_within(&format!("{root}/App Store/.."))
                .unwrap()
                .1
        );
        let parent = dir.path().parent().unwrap().to_str().unwrap().to_owned();
        assert_eq!(
            roots.resolve_within(&parent).unwrap_err().code(),
            ErrorCode::Permission
        );
        assert_eq!(
            roots
                .resolve_within(&format!("{root}/App Store/../.."))
                .unwrap_err()
                .code(),
            ErrorCode::Permission
        );
        assert_eq!(
            roots.resolve_within("relative").unwrap_err().code(),
            ErrorCode::InvalidPath
        );
        assert_eq!(
            roots
                .resolve_within(&format!("{root}/missing"))
                .unwrap_err()
                .code(),
            ErrorCode::NotFound
        );
        // A sibling whose name starts with the root's name is not inside it.
        let sibling = format!("{root}-other");
        fs::create_dir(&sibling).unwrap();
        assert_eq!(
            roots.resolve_within(&sibling).unwrap_err().code(),
            ErrorCode::Permission
        );
        fs::remove_dir(&sibling).unwrap();
    }
}
