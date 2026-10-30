//! Validation of everything path-like that crosses the IPC boundary: library
//! and export paths, project ids, URI-encoded header values, raw request
//! bodies and suggested file names.
//!
//! Library paths are relative POSIX paths (see src/platform/types.ts and the
//! mirror rules in src/platform/paths.ts). They are checked as text first and
//! then joined one segment at a time, refusing to traverse symbolic links, so
//! a path can never resolve outside the directory it is joined to.

use std::borrow::Cow;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use tauri::http::HeaderMap;
use tauri::ipc::InvokeBody;

use crate::error::{AppError, AppResult, shown};

/// Limits in UTF-8 bytes, like the TypeScript side. File systems count names
/// in bytes (ext4, APFS) or UTF-16 units (NTFS); 255 bytes fits all of them.
pub const MAX_PATH_BYTES: usize = 512;
pub const MAX_SEGMENT_BYTES: usize = 255;

/// Longest name `sanitize_file_name` produces, in bytes.
const MAX_FILE_NAME_BYTES: usize = 200;

/// A relative path that passed validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RelPath<'a> {
    text: &'a str,
    segments: Vec<&'a str>,
}

/// Whether the last component of a resolved path may be a symbolic link.
/// Only removal allows it: unlinking a link never touches its target.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LeafLink {
    Reject,
    Allow,
}

impl<'a> RelPath<'a> {
    /// Validates with the rules of the platform we run on.
    pub fn parse(text: &'a str) -> AppResult<Self> {
        Self::parse_with(text, cfg!(windows))
    }

    /// `windows_rules` adds what Win32 path normalisation would otherwise
    /// silently rewrite (trailing dots and spaces, device names). It is a
    /// parameter so the Windows rules are tested on every platform.
    pub fn parse_with(text: &'a str, windows_rules: bool) -> AppResult<Self> {
        if text.is_empty() {
            return Err(AppError::invalid_path("the path is empty"));
        }
        // Checked before splitting so a huge input never allocates.
        if text.len() > MAX_PATH_BYTES {
            return Err(AppError::invalid_path(format!(
                "the path is longer than {MAX_PATH_BYTES} bytes"
            )));
        }
        let segments: Vec<&str> = text.split('/').collect();
        for segment in &segments {
            check_segment(segment, windows_rules)
                .map_err(|reason| AppError::invalid_path(format!("{}: {reason}", shown(text))))?;
        }
        Ok(Self { text, segments })
    }

    #[cfg(test)]
    pub fn as_str(&self) -> &'a str {
        self.text
    }

    #[cfg(test)]
    pub fn segments(&self) -> &[&'a str] {
        &self.segments
    }

    /// Joins the path onto `base`, failing when an existing component below
    /// `base` is a symbolic link (on Windows junctions count as links too).
    /// `base` itself may be a link: it was resolved when the app started.
    ///
    /// The check and the later use are not atomic. Exploiting that needs
    /// write access to the data folder, which already means full control.
    pub fn resolve(&self, base: &Path, leaf: LeafLink) -> AppResult<PathBuf> {
        let mut path = base.to_path_buf();
        let mut checking = true;
        let last = self.segments.len().saturating_sub(1);
        for (index, segment) in self.segments.iter().enumerate() {
            // Validated segments contain no separator, drive or root, so
            // push always appends exactly one component.
            path.push(segment);
            if !checking {
                continue;
            }
            match fs::symlink_metadata(&path) {
                Ok(meta) => {
                    let allowed = index == last && leaf == LeafLink::Allow;
                    if meta.file_type().is_symlink() && !allowed {
                        return Err(AppError::permission(format!(
                            "{}: symbolic links are not followed",
                            self.text
                        )));
                    }
                }
                // Nothing deeper exists, so there is nothing left to traverse.
                Err(err)
                    if matches!(
                        err.kind(),
                        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
                    ) =>
                {
                    checking = false;
                }
                Err(err) => return Err(AppError::from_io(self.text, &err)),
            }
        }
        Ok(path)
    }
}

/// Why `segment` cannot be one component of a relative path.
pub fn check_segment(segment: &str, windows_rules: bool) -> Result<(), &'static str> {
    if segment.is_empty() {
        return Err("empty segments are not allowed");
    }
    if segment == "." || segment == ".." {
        return Err("'.' and '..' segments are not allowed");
    }
    if segment.len() > MAX_SEGMENT_BYTES {
        return Err("a segment is longer than 255 bytes");
    }
    if segment
        .chars()
        .any(|c| matches!(c, '/' | '\\' | ':') || c.is_control())
    {
        return Err("backslashes, colons and control characters are not allowed");
    }
    if windows_rules {
        if segment.ends_with(['.', ' ']) {
            return Err("names cannot end with a dot or a space on Windows");
        }
        if segment.contains(['<', '>', '"', '|', '?', '*']) {
            return Err("the name contains a character Windows does not allow");
        }
        if is_reserved_windows_name(segment) {
            return Err("the name is reserved by Windows");
        }
    }
    Ok(())
}

/// Device names Windows resolves to devices in any folder and with any
/// extension: "nul.png" opens the null device, not a file.
pub fn is_reserved_windows_name(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or(name).trim_end_matches(' ');
    let upper = stem.to_ascii_uppercase();
    if matches!(
        upper.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) {
        return true;
    }
    let Some(rest) = upper
        .strip_prefix("COM")
        .or_else(|| upper.strip_prefix("LPT"))
    else {
        return false;
    };
    let mut chars = rest.chars();
    matches!(
        (chars.next(), chars.next()),
        (Some('0'..='9' | '¹' | '²' | '³'), None)
    )
}

/// Project ids name a folder. Same rule as `ID_RE` in src/model/rules.ts
/// (`[A-Za-z0-9_-]{1,64}`) so every project the frontend accepts can be
/// stored; the app itself only generates lowercase `[a-z0-9]` ids.
pub fn validate_project_id(id: &str) -> AppResult<&str> {
    let valid = (1..=64).contains(&id.len())
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    if valid {
        Ok(id)
    } else {
        Err(AppError::invalid_path(format!(
            "invalid project id {}",
            shown(id)
        )))
    }
}

/// A header value encoded with `encodeURIComponent`, decoded. Header values
/// must be ASCII, which is why the frontend encodes paths and names.
pub fn header(headers: &HeaderMap, name: &str) -> AppResult<String> {
    let value = headers
        .get(name)
        .ok_or_else(|| AppError::invalid_data(format!("the {name} header is missing")))?;
    let text = value.to_str().map_err(|_| {
        AppError::invalid_data(format!("the {name} header must be URI-encoded ASCII"))
    })?;
    decode_component(text).ok_or_else(|| {
        AppError::invalid_data(format!("the {name} header is not valid URI encoding"))
    })
}

/// Strict `decodeURIComponent`: truncated or non-hex escapes and invalid
/// UTF-8 are errors (as in JavaScript) rather than passed through, so a
/// frontend that forgot to encode fails loudly instead of writing elsewhere.
pub fn decode_component(text: &str) -> Option<String> {
    if !text.contains('%') {
        return Some(text.to_owned());
    }
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while let Some(&byte) = bytes.get(i) {
        if byte == b'%' {
            let high = bytes.get(i + 1).copied().and_then(hex_value)?;
            let low = bytes.get(i + 2).copied().and_then(hex_value)?;
            out.push((high << 4) | low);
            i += 3;
        } else {
            out.push(byte);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

fn hex_value(digit: u8) -> Option<u8> {
    match digit {
        b'0'..=b'9' => Some(digit - b'0'),
        b'a'..=b'f' => Some(digit - b'a' + 10),
        b'A'..=b'F' => Some(digit - b'A' + 10),
        _ => None,
    }
}

/// The bytes of a raw-body request. `invoke(cmd, bytes)` arrives as raw
/// bytes over the IPC custom protocol; when a webview blocks that protocol
/// Tauri falls back to postMessage, which turns the bytes into a JSON array
/// of numbers. Accepting both keeps the app working on that fallback.
pub fn body_bytes(body: &InvokeBody) -> AppResult<Cow<'_, [u8]>> {
    match body {
        InvokeBody::Raw(bytes) => Ok(Cow::Borrowed(bytes.as_slice())),
        InvokeBody::Json(serde_json::Value::Array(items)) => items
            .iter()
            .map(|item| item.as_u64().and_then(|n| u8::try_from(n).ok()))
            .collect::<Option<Vec<u8>>>()
            .map(Cow::Owned)
            .ok_or_else(|| AppError::invalid_data("the request body is not a byte array")),
        InvokeBody::Json(_) => Err(AppError::invalid_data("the request body must be raw bytes")),
    }
}

/// Turns a suggested name into a safe file name for a save dialog: the last
/// path component only, without characters Windows forbids, hidden-file
/// dots, device names or a length that file systems refuse.
pub fn sanitize_file_name(name: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or(name);
    let mut cleaned = String::with_capacity(last.len());
    for c in last.chars() {
        if c.is_control() || is_bidi_control(c) {
            continue;
        }
        cleaned.push(if matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*') {
            '_'
        } else {
            c
        });
    }
    let trimmed = cleaned
        .trim()
        .trim_start_matches('.')
        .trim_end_matches(['.', ' '])
        .trim();
    let mut result = truncate_keeping_extension(trimmed, MAX_FILE_NAME_BYTES);
    if result.is_empty() {
        result = "Untitled".to_owned();
    }
    if is_reserved_windows_name(&result) {
        result.insert(0, '_');
    }
    result
}

/// Directional overrides can disguise an extension ("exe.png" shown as
/// "gnp.exe"); they never belong in a file name.
fn is_bidi_control(c: char) -> bool {
    matches!(c, '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

fn truncate_keeping_extension(name: &str, max_bytes: usize) -> String {
    if name.len() <= max_bytes {
        return name.to_owned();
    }
    if let Some((stem, ext)) = name.rsplit_once('.')
        && !stem.is_empty()
        && !ext.is_empty()
        && ext.len() <= 20
    {
        let room = max_bytes.saturating_sub(ext.len() + 1);
        let stem = truncate_utf8(stem, room).trim_end_matches(['.', ' ']);
        if !stem.is_empty() {
            return format!("{stem}.{ext}");
        }
    }
    truncate_utf8(name, max_bytes)
        .trim_end_matches(['.', ' '])
        .to_owned()
}

/// The longest prefix of `text` that fits in `max_bytes` without splitting
/// a character.
pub fn truncate_utf8(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::ErrorCode;
    use tauri::http::HeaderValue;

    fn valid(path: &str) -> bool {
        RelPath::parse_with(path, false).is_ok()
    }

    fn valid_on_windows(path: &str) -> bool {
        RelPath::parse_with(path, true).is_ok()
    }

    #[test]
    fn accepts_library_and_export_paths() {
        for path in [
            "settings.json",
            "projects/abc123/project.json",
            "projects/abc123/assets/0123abcd.png",
            "cache/gallery-index.json",
            "App Store/en-US/iPhone 6.9 (1290)/01.png",
            "fastlane/metadata/android/zh-Hans/images/phoneScreenshots/01.png",
            "Google Play/ar/Feature graphic.png",
            ".hidden",
            "a..b/c.d",
            "واجهة/متجر.png",
            "日本語/スクリーン.png",
            "emoji/🙂.png",
            "a/b/c/d/e/f/g",
        ] {
            assert!(valid(path), "{path}");
            assert!(valid_on_windows(path), "{path}");
        }
        // Three dots is an ordinary name on Unix; Win32 strips trailing dots.
        assert!(valid("..."));
        assert!(!valid_on_windows("..."));
    }

    #[test]
    fn rejects_traversal_and_absolute_paths() {
        for path in [
            "",
            "/",
            "/etc/passwd",
            "//server/share",
            "..",
            ".",
            "../x",
            "a/../b",
            "a/./b",
            "a/..",
            "a/.",
            "a//b",
            "a/",
            "./a",
            "a/b/",
        ] {
            assert!(!valid(path), "{path:?}");
        }
    }

    #[test]
    fn rejects_windows_style_and_hostile_characters() {
        for path in [
            "C:/Windows/win.ini",
            "C:\\Windows\\win.ini",
            "c:",
            "a\\b",
            "..\\..\\x",
            "\\\\?\\C:\\x",
            "\\\\server\\share",
            "file.txt:stream",
            "a\0b",
            "a\nb",
            "a\rb",
            "tab\there",
            "del\u{7f}",
            "c1\u{85}control",
            "\u{9b}csi",
        ] {
            assert!(!valid(path), "{path:?}");
        }
    }

    #[test]
    fn unicode_lookalikes_are_plain_names() {
        // These only look like dots or slashes; no file system treats them so.
        for path in [
            "\u{2024}\u{2024}/x",
            "\u{FF0E}\u{FF0E}/x",
            "a\u{2215}b",
            "a\u{FF0F}b",
            "\u{200B}",
            "\u{202E}gnp.exe",
        ] {
            assert!(valid(path), "{path:?}");
        }
    }

    #[test]
    fn enforces_byte_lengths() {
        let segment = "a".repeat(MAX_SEGMENT_BYTES);
        assert!(valid(&segment));
        assert!(!valid(&format!("{segment}a")));
        // Arabic letters take two bytes, so 128 of them is 256 bytes.
        assert!(valid(&"ب".repeat(127)));
        assert!(!valid(&"ب".repeat(128)));
        let long = vec!["abcdefg"; 64].join("/");
        assert_eq!(long.len(), 511);
        assert!(valid(&long));
        assert!(valid(&format!("{long}x")));
        assert!(!valid(&format!("{long}xy")));
        assert!(!valid(&"a/".repeat(1_000_000)));
    }

    #[test]
    fn windows_rules_reject_what_win32_would_rewrite() {
        for path in [
            "a./b",
            "a /b",
            "file.",
            "file ",
            ".. ",
            "... ",
            "a<b",
            "a>b",
            "a\"b",
            "a|b",
            "a?b",
            "a*b",
            "CON",
            "con.png",
            "nul",
            "NUL.tar.gz",
            "aux/x",
            "x/PRN",
            "com1",
            "COM9.txt",
            "lpt3",
            "COM\u{00B9}",
            "conin$",
            "nul .txt",
        ] {
            assert!(!valid_on_windows(path), "{path:?}");
        }
        // The same names are ordinary files elsewhere.
        for path in ["file ", "con.png", "a?b", "COM1"] {
            assert!(valid(path), "{path:?}");
        }
        for path in ["console.png", "com10", "lpt", "comx", "nul_file", "CONFIG"] {
            assert!(valid_on_windows(path), "{path:?}");
        }
    }

    #[test]
    fn invalid_paths_report_invalid_path_without_echoing_huge_input() {
        let err = RelPath::parse("a/../b").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InvalidPath);
        assert!(err.message().contains("a/../b"));
        let err = RelPath::parse(&"x".repeat(10_000)).unwrap_err();
        assert!(err.message().len() < 100);
    }

    #[test]
    fn exposes_segments() {
        let path = RelPath::parse("projects/p1/assets/a.png").unwrap();
        assert_eq!(path.segments(), ["projects", "p1", "assets", "a.png"]);
        assert_eq!(path.as_str(), "projects/p1/assets/a.png");
    }

    #[test]
    fn resolve_joins_inside_base() {
        let dir = tempfile::tempdir().unwrap();
        let path = RelPath::parse("a/b/c.json").unwrap();
        let resolved = path.resolve(dir.path(), LeafLink::Reject).unwrap();
        assert_eq!(resolved, dir.path().join("a").join("b").join("c.json"));
        assert!(resolved.starts_with(dir.path()));
    }

    #[test]
    fn resolve_tolerates_a_file_where_a_folder_is_expected() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("a"), b"x").unwrap();
        let path = RelPath::parse("a/b").unwrap();
        assert!(path.resolve(dir.path(), LeafLink::Reject).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn resolve_refuses_symlinks_out_of_the_base() {
        use std::os::unix::fs::symlink;
        let outside = tempfile::tempdir().unwrap();
        let dir = tempfile::tempdir().unwrap();
        symlink(outside.path(), dir.path().join("escape")).unwrap();
        symlink(outside.path().join("f"), dir.path().join("leaf")).unwrap();
        fs::create_dir(dir.path().join("real")).unwrap();
        symlink(dir.path().join("real"), dir.path().join("inside")).unwrap();

        for rel in ["escape/x", "escape", "inside/x", "leaf"] {
            let path = RelPath::parse(rel).unwrap();
            let err = path.resolve(dir.path(), LeafLink::Reject).unwrap_err();
            assert_eq!(err.code(), ErrorCode::Permission, "{rel}");
        }
        // Removal may unlink a link itself, never traverse one.
        let leaf = RelPath::parse("leaf").unwrap();
        assert!(leaf.resolve(dir.path(), LeafLink::Allow).is_ok());
        let deep = RelPath::parse("escape/x").unwrap();
        assert!(deep.resolve(dir.path(), LeafLink::Allow).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn resolve_accepts_a_symlinked_base() {
        use std::os::unix::fs::symlink;
        let real = tempfile::tempdir().unwrap();
        let holder = tempfile::tempdir().unwrap();
        let base = holder.path().join("data");
        symlink(real.path(), &base).unwrap();
        let path = RelPath::parse("projects/p/project.json").unwrap();
        assert!(path.resolve(&base, LeafLink::Reject).is_ok());
    }

    #[test]
    fn reserved_names() {
        for name in [
            "CON", "con", "Con.txt", "PRN", "AUX", "NUL", "COM0", "COM9", "LPT1", "lpt9.log",
            "COM²", "LPT³", "CONOUT$",
        ] {
            assert!(is_reserved_windows_name(name), "{name}");
        }
        for name in [
            "CONSOLE",
            "COM10",
            "LPT",
            "COMA",
            "NULL",
            "AUXILIARY",
            "a.CON",
            "",
            "COM\u{2074}",
        ] {
            assert!(!is_reserved_windows_name(name), "{name}");
        }
    }

    #[test]
    fn project_ids() {
        for id in ["a", "abc123", "0", "ABC", "a-b", "a_b", &"z".repeat(64)] {
            assert!(validate_project_id(id).is_ok(), "{id}");
        }
        for id in [
            "",
            "a/b",
            "..",
            "a b",
            "é",
            &"z".repeat(65),
            "abc\0",
            "p1.json",
        ] {
            let err = validate_project_id(id).unwrap_err();
            assert_eq!(err.code(), ErrorCode::InvalidPath, "{id:?}");
        }
    }

    #[test]
    fn decodes_uri_components_strictly() {
        assert_eq!(decode_component("plain").as_deref(), Some("plain"));
        assert_eq!(decode_component("a%2Fb%20c").as_deref(), Some("a/b c"));
        assert_eq!(decode_component("%e2%82%ac").as_deref(), Some("€"));
        assert_eq!(
            decode_component("%D9%88%D8%A7%D8%AC%D9%87%D8%A9").as_deref(),
            Some("واجهة")
        );
        assert_eq!(decode_component("%F0%9F%99%82").as_deref(), Some("🙂"));
        assert_eq!(decode_component("100%25").as_deref(), Some("100%"));
        // '+' is a literal plus in URI components, not a space.
        assert_eq!(decode_component("a+b").as_deref(), Some("a+b"));
        assert_eq!(decode_component("").as_deref(), Some(""));
        for bad in [
            "%",
            "%4",
            "%zz",
            "%G0",
            "a%2",
            "%C3",
            "%FF",
            "%C3%28",
            "%ED%A0%80",
        ] {
            assert_eq!(decode_component(bad), None, "{bad}");
        }
        // Decoding can produce characters that validation then rejects.
        let decoded = decode_component("..%2F..%2Fetc").unwrap();
        assert!(RelPath::parse(&decoded).is_err());
        let decoded = decode_component("a%00b").unwrap();
        assert!(RelPath::parse(&decoded).is_err());
    }

    #[test]
    fn reads_headers() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-path",
            HeaderValue::from_static("App%20Store%2Fen-US%2F01.png"),
        );
        headers.insert("x-bad", HeaderValue::from_static("%zz"));
        headers.insert("x-latin1", HeaderValue::from_bytes(b"caf\xe9").unwrap());
        assert_eq!(
            header(&headers, "x-path").unwrap(),
            "App Store/en-US/01.png"
        );
        // Header names are case-insensitive.
        assert_eq!(
            header(&headers, "X-Path").unwrap(),
            "App Store/en-US/01.png"
        );
        for name in ["x-missing", "x-bad", "x-latin1"] {
            let err = header(&headers, name).unwrap_err();
            assert_eq!(err.code(), ErrorCode::InvalidData, "{name}");
        }
    }

    #[test]
    fn reads_raw_and_fallback_bodies() {
        let raw = InvokeBody::Raw(vec![1, 2, 255]);
        assert_eq!(body_bytes(&raw).unwrap().as_ref(), &[1, 2, 255]);
        assert!(matches!(body_bytes(&raw).unwrap(), Cow::Borrowed(_)));
        let empty = InvokeBody::Raw(Vec::new());
        assert!(body_bytes(&empty).unwrap().is_empty());

        let json = InvokeBody::Json(serde_json::json!([0, 137, 80, 255]));
        assert_eq!(body_bytes(&json).unwrap().as_ref(), &[0, 137, 80, 255]);
        let json_empty = InvokeBody::Json(serde_json::json!([]));
        assert!(body_bytes(&json_empty).unwrap().is_empty());

        for bad in [
            serde_json::json!([256]),
            serde_json::json!([-1]),
            serde_json::json!([1.5]),
            serde_json::json!(["1"]),
            serde_json::json!({ "path": "x" }),
            serde_json::json!(null),
            serde_json::json!("bytes"),
        ] {
            let err = body_bytes(&InvokeBody::Json(bad.clone())).unwrap_err();
            assert_eq!(err.code(), ErrorCode::InvalidData, "{bad}");
        }
    }

    #[test]
    fn sanitizes_file_names() {
        assert_eq!(sanitize_file_name("My App.wajha"), "My App.wajha");
        assert_eq!(sanitize_file_name("../../etc/passwd"), "passwd");
        assert_eq!(sanitize_file_name("C:\\Users\\x\\evil.wajha"), "evil.wajha");
        assert_eq!(sanitize_file_name("a:b*c?.csv"), "a_b_c_.csv");
        assert_eq!(sanitize_file_name("  .hidden.wajha  "), "hidden.wajha");
        assert_eq!(sanitize_file_name("name.wajha..."), "name.wajha");
        assert_eq!(
            sanitize_file_name("tab\tand\nnewline.csv"),
            "tabandnewline.csv"
        );
        assert_eq!(sanitize_file_name("\u{202E}gnp.exe"), "gnp.exe");
        assert_eq!(sanitize_file_name(""), "Untitled");
        assert_eq!(sanitize_file_name(" . . "), "Untitled");
        assert_eq!(sanitize_file_name("dir/"), "Untitled");
        assert_eq!(sanitize_file_name("con.wajha"), "_con.wajha");
        assert_eq!(sanitize_file_name("NUL"), "_NUL");
        assert_eq!(sanitize_file_name("واجهة.wajha"), "واجهة.wajha");
    }

    #[test]
    fn sanitized_names_stay_short_and_keep_their_extension() {
        let long = format!("{}.wajha-template", "ي".repeat(400));
        let name = sanitize_file_name(&long);
        assert!(name.len() <= MAX_FILE_NAME_BYTES, "{}", name.len());
        assert!(name.ends_with(".wajha-template"));
        assert!(RelPath::parse_with(&name, true).is_ok());

        let no_ext = "x".repeat(1000);
        assert_eq!(sanitize_file_name(&no_ext).len(), MAX_FILE_NAME_BYTES);
        let huge_ext = format!("a.{}", "e".repeat(500));
        assert!(sanitize_file_name(&huge_ext).len() <= MAX_FILE_NAME_BYTES);
    }

    #[test]
    fn truncates_on_character_boundaries() {
        assert_eq!(truncate_utf8("abc", 10), "abc");
        assert_eq!(truncate_utf8("abc", 2), "ab");
        assert_eq!(truncate_utf8("éé", 3), "é");
        assert_eq!(truncate_utf8("🙂", 3), "");
        assert_eq!(truncate_utf8("", 0), "");
    }
}
