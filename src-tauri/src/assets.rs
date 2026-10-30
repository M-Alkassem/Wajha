//! Content-addressed project images: `projects/<id>/assets/<sha256>.<ext>`.
//! The id is the hash of the bytes, so the same screenshot imported twice is
//! stored once and an existing file is left alone.

use std::fs;
use std::path::Path;

use sha2::{Digest, Sha256};
use tauri::State;
use tauri::ipc::Request;

use crate::error::{AppError, AppResult, shown};
use crate::paths::{self, LeafLink, RelPath};
use crate::store::{self, DataDir};

/// Largest image the app imports, as MAX_IMAGE_BYTES in
/// src/platform/limits.ts. Store screenshots are a few MB; this is generous
/// headroom without letting one file exhaust memory.
pub const MAX_IMAGE_BYTES: usize = 100 * 1024 * 1024;

/// `ImageExt` in src/platform/types.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImageExt {
    Png,
    Jpg,
    Webp,
}

impl ImageExt {
    pub fn parse(ext: &str) -> Option<Self> {
        match ext {
            "png" => Some(Self::Png),
            "jpg" => Some(Self::Jpg),
            "webp" => Some(Self::Webp),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpg => "jpg",
            Self::Webp => "webp",
        }
    }

    /// The format named by the file signature, whatever the file is called.
    pub fn sniff(data: &[u8]) -> Option<Self> {
        const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF];
        if data.starts_with(PNG) {
            Some(Self::Png)
        } else if data.starts_with(JPEG) {
            Some(Self::Jpg)
        } else if data.starts_with(b"RIFF") && data.get(8..12) == Some(b"WEBP".as_slice()) {
            Some(Self::Webp)
        } else {
            None
        }
    }
}

pub fn sha256_hex(data: &[u8]) -> String {
    store::to_hex(&Sha256::digest(data))
}

/// `"<sha256 hex>.<ext>"`, the asset id format the model validates.
pub fn asset_id(data: &[u8], ext: ImageExt) -> String {
    format!("{}.{}", sha256_hex(data), ext.as_str())
}

/// Matches `^[0-9a-f]{64}\.(png|jpg|webp)$`.
#[cfg(test)]
pub fn is_asset_id(id: &str) -> bool {
    id.split_once('.').is_some_and(|(hash, ext)| {
        hash.len() == 64
            && hash
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
            && ImageExt::parse(ext).is_some()
    })
}

/// Validates an `asset_put` request: a safe project id, a known extension,
/// a size within limits and a signature matching the extension.
pub fn put_asset(base: &Path, project_id: &str, ext: &str, data: &[u8]) -> AppResult<String> {
    let project_id = paths::validate_project_id(project_id)?;
    let ext = ImageExt::parse(ext)
        .ok_or_else(|| AppError::invalid_data(format!("unsupported image type {}", shown(ext))))?;
    if data.len() > MAX_IMAGE_BYTES {
        return Err(AppError::invalid_data(format!(
            "the image is larger than {} MB",
            MAX_IMAGE_BYTES >> 20
        )));
    }
    match ImageExt::sniff(data) {
        Some(found) if found == ext => store_asset(base, project_id, data, ext),
        Some(found) => Err(AppError::invalid_data(format!(
            "the data is a {} image, not {}",
            found.as_str().to_uppercase(),
            ext.as_str().to_uppercase()
        ))),
        None => Err(AppError::invalid_data(
            "the data is not a PNG, JPEG or WebP image",
        )),
    }
}

/// Stores already-checked image bytes and returns the asset id. An existing
/// file of the right size is kept as is; a different size can only be
/// damage from outside the app, so it is rewritten.
pub fn store_asset(base: &Path, project_id: &str, data: &[u8], ext: ImageExt) -> AppResult<String> {
    // "a/b" would still form a valid path, so the id is checked here too.
    let project_id = paths::validate_project_id(project_id)?;
    let id = asset_id(data, ext);
    let rel = format!("projects/{project_id}/assets/{id}");
    let path = RelPath::parse(&rel)?;
    let target = path.resolve(base, LeafLink::Reject)?;
    if fs::symlink_metadata(&target)
        .is_ok_and(|meta| meta.is_file() && meta.len() == data.len() as u64)
    {
        return Ok(id);
    }
    store::write_new_file(&target, &rel, data)?;
    Ok(id)
}

/// Raw body: the image bytes. Headers: `x-project` (project id) and `x-ext`
/// (png | jpg | webp).
#[tauri::command]
pub async fn asset_put(data: State<'_, DataDir>, request: Request<'_>) -> Result<String, String> {
    let project_id = paths::header(request.headers(), "x-project")?;
    let ext = paths::header(request.headers(), "x-ext")?;
    let body = paths::body_bytes(request.body())?;
    Ok(put_asset(data.get()?, &project_id, &ext, &body)?)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::error::ErrorCode;

    pub(crate) fn png(extra: &[u8]) -> Vec<u8> {
        let mut bytes = vec![0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];
        bytes.extend_from_slice(extra);
        bytes
    }

    pub(crate) fn jpeg(extra: &[u8]) -> Vec<u8> {
        let mut bytes = vec![0xFF, 0xD8, 0xFF, 0xE0];
        bytes.extend_from_slice(extra);
        bytes
    }

    pub(crate) fn webp(extra: &[u8]) -> Vec<u8> {
        let mut bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 ".to_vec();
        bytes.extend_from_slice(extra);
        bytes
    }

    #[test]
    fn sniffs_signatures() {
        assert_eq!(ImageExt::sniff(&png(b"")), Some(ImageExt::Png));
        assert_eq!(ImageExt::sniff(&jpeg(b"")), Some(ImageExt::Jpg));
        assert_eq!(ImageExt::sniff(&[0xFF, 0xD8, 0xFF]), Some(ImageExt::Jpg));
        assert_eq!(ImageExt::sniff(&webp(b"")), Some(ImageExt::Webp));
        assert_eq!(ImageExt::sniff(b"RIFF\0\0\0\0WEBP"), Some(ImageExt::Webp));
        for bad in [
            &b""[..],
            &[0x89, b'P', b'N', b'G'],
            &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A],
            &[0xFF, 0xD8],
            b"RIFF\0\0\0\0WAVE",
            b"RIFF\0\0\0\0WEB",
            b"GIF89a",
            b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>",
            b"BM\0\0",
            b"\0\0\0\x0cjP  ",
        ] {
            assert_eq!(ImageExt::sniff(bad), None, "{bad:?}");
        }
    }

    #[test]
    fn hashes_with_sha256() {
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_hex(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn asset_ids_match_the_model_format() {
        let id = asset_id(&png(b"x"), ImageExt::Png);
        assert!(is_asset_id(&id), "{id}");
        assert!(id.ends_with(".png"));
        assert_eq!(id.len(), 64 + 4);
        assert!(is_asset_id(&asset_id(b"j", ImageExt::Jpg)));
        assert!(is_asset_id(&asset_id(b"w", ImageExt::Webp)));
        for bad in [
            "",
            "abc.png",
            &format!("{}.png", "A".repeat(64)),
            &format!("{}.jpeg", "a".repeat(64)),
            &format!("{}.png.png", "a".repeat(64)),
            &format!("{}png", "a".repeat(64)),
            &format!("{}.png", "a".repeat(63)),
            &format!("{}.gif", "0".repeat(64)),
        ] {
            assert!(!is_asset_id(bad), "{bad}");
        }
    }

    #[test]
    fn stores_assets_content_addressed() {
        let dir = tempfile::tempdir().unwrap();
        let data = png(b"pixels");
        let id = put_asset(dir.path(), "p1", "png", &data).unwrap();
        assert_eq!(id, asset_id(&data, ImageExt::Png));
        let file = dir.path().join("projects/p1/assets").join(&id);
        assert_eq!(fs::read(&file).unwrap(), data);
        // Same bytes again: same id, still one file.
        assert_eq!(put_asset(dir.path(), "p1", "png", &data).unwrap(), id);
        assert_eq!(fs::read_dir(file.parent().unwrap()).unwrap().count(), 1);
        // Other projects get their own copy.
        put_asset(dir.path(), "p2", "png", &data).unwrap();
        assert!(dir.path().join("projects/p2/assets").join(&id).exists());
    }

    #[test]
    fn rewrites_a_damaged_asset() {
        let dir = tempfile::tempdir().unwrap();
        let data = jpeg(b"photo");
        let id = put_asset(dir.path(), "p1", "jpg", &data).unwrap();
        let file = dir.path().join("projects/p1/assets").join(&id);
        fs::write(&file, b"trunc").unwrap();
        put_asset(dir.path(), "p1", "jpg", &data).unwrap();
        assert_eq!(fs::read(&file).unwrap(), data);
    }

    #[test]
    fn rejects_mismatched_or_unknown_data() {
        let dir = tempfile::tempdir().unwrap();
        let err = put_asset(dir.path(), "p1", "jpg", &png(b"")).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidData);
        assert!(err.message().contains("PNG"), "{err}");
        let err = put_asset(dir.path(), "p1", "png", b"GIF89a....").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidData);
        let err = put_asset(dir.path(), "p1", "png", b"").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidData);
        for ext in ["jpeg", "PNG", "gif", "", "png/../x"] {
            let err = put_asset(dir.path(), "p1", ext, &png(b"")).unwrap_err();
            assert_eq!(err.code(), ErrorCode::InvalidData, "{ext}");
        }
        assert!(!dir.path().join("projects").exists());
    }

    #[test]
    fn rejects_unsafe_project_ids() {
        let dir = tempfile::tempdir().unwrap();
        for id in ["", "../x", "a/b", "p.1", "p 1", "..", "p1\0"] {
            let err = put_asset(dir.path(), id, "png", &png(b"")).unwrap_err();
            assert_eq!(err.code(), ErrorCode::InvalidPath, "{id:?}");
        }
    }

    #[test]
    fn rejects_oversized_images() {
        let dir = tempfile::tempdir().unwrap();
        let mut big = png(b"");
        big.resize(MAX_IMAGE_BYTES + 1, 0);
        let err = put_asset(dir.path(), "p1", "png", &big).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidData);
        assert!(err.message().contains("100 MB"), "{err}");
        assert!(!dir.path().join("projects").exists());
    }

    #[cfg(unix)]
    #[test]
    fn refuses_assets_folders_that_are_links() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("projects/p1")).unwrap();
        symlink(outside.path(), dir.path().join("projects/p1/assets")).unwrap();
        let err = put_asset(dir.path(), "p1", "png", &png(b"")).unwrap_err();
        assert_eq!(err.code(), ErrorCode::Permission);
        assert_eq!(fs::read_dir(outside.path()).unwrap().count(), 0);
    }
}
