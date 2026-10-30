//! The error type behind every command.
//!
//! The frontend receives errors as `"<code>: <message>"` strings. The code is
//! one of the `PlatformErrorCode` values in src/platform/types.ts, so the
//! TypeScript side can rebuild a typed `PlatformError` from the prefix alone.

use std::fmt;
use std::io;

/// `PlatformErrorCode` minus `cancelled`: the shell never produces it, a
/// dismissed dialog resolves to `null` as the Platform interface expects.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    NotFound,
    InvalidPath,
    InvalidData,
    Permission,
    Io,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NotFound => "not_found",
            Self::InvalidPath => "invalid_path",
            Self::InvalidData => "invalid_data",
            Self::Permission => "permission",
            Self::Io => "io",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppError {
    code: ErrorCode,
    message: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }

    pub fn code(&self) -> ErrorCode {
        self.code
    }

    pub fn message(&self) -> &str {
        &self.message
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::NotFound, message)
    }

    pub fn invalid_path(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidPath, message)
    }

    pub fn invalid_data(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::InvalidData, message)
    }

    pub fn permission(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Permission, message)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new(ErrorCode::Io, message)
    }

    /// Maps an I/O failure to the closest code. `context` names what was being
    /// accessed, usually the relative path the frontend asked for, so messages
    /// read like `not_found: projects/x/project.json`.
    pub fn from_io(context: &str, err: &io::Error) -> Self {
        use io::ErrorKind as Kind;
        let code = match err.kind() {
            Kind::NotFound => return Self::not_found(context),
            Kind::PermissionDenied | Kind::ReadOnlyFilesystem => ErrorCode::Permission,
            Kind::InvalidFilename => ErrorCode::InvalidPath,
            Kind::FileTooLarge | Kind::InvalidData => ErrorCode::InvalidData,
            _ => ErrorCode::Io,
        };
        Self::new(code, format!("{context}: {err}"))
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code.as_str(), self.message)
    }
}

impl std::error::Error for AppError {}

/// Commands return `Result<T, String>`; this lets `?` convert on the way out.
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

/// Untrusted text for error messages: quoted, escaped, and cut short so a
/// hostile multi-megabyte value cannot bloat the message.
pub fn shown(text: &str) -> String {
    const MAX_CHARS: usize = 80;
    let mut chars = text.chars();
    let head: String = chars.by_ref().take(MAX_CHARS).collect();
    if chars.next().is_some() {
        format!("{head:?}…")
    } else {
        format!("{head:?}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn displays_code_prefix() {
        let err = AppError::not_found("projects/x/project.json");
        assert_eq!(err.to_string(), "not_found: projects/x/project.json");
        assert_eq!(String::from(err), "not_found: projects/x/project.json");
        assert_eq!(AppError::invalid_path("a").to_string(), "invalid_path: a");
        assert_eq!(AppError::invalid_data("a").to_string(), "invalid_data: a");
        assert_eq!(AppError::permission("a").to_string(), "permission: a");
        assert_eq!(AppError::io("a").to_string(), "io: a");
    }

    #[test]
    fn maps_io_kinds_to_platform_codes() {
        let cases = [
            (io::ErrorKind::NotFound, ErrorCode::NotFound),
            (io::ErrorKind::PermissionDenied, ErrorCode::Permission),
            (io::ErrorKind::ReadOnlyFilesystem, ErrorCode::Permission),
            (io::ErrorKind::InvalidFilename, ErrorCode::InvalidPath),
            (io::ErrorKind::FileTooLarge, ErrorCode::InvalidData),
            (io::ErrorKind::StorageFull, ErrorCode::Io),
            (io::ErrorKind::Other, ErrorCode::Io),
        ];
        for (kind, code) in cases {
            let err = AppError::from_io("x/y", &io::Error::new(kind, "boom"));
            assert_eq!(err.code(), code, "{kind:?}");
        }
    }

    #[test]
    fn not_found_message_is_the_bare_context() {
        let err = AppError::from_io("a/b.json", &io::Error::from(io::ErrorKind::NotFound));
        assert_eq!(err.message(), "a/b.json");
        let err = AppError::from_io("a/b.json", &io::Error::other("disk on fire"));
        assert_eq!(err.message(), "a/b.json: disk on fire");
    }

    #[test]
    fn shown_quotes_escapes_and_truncates() {
        assert_eq!(shown("abc"), "\"abc\"");
        assert_eq!(shown("a\nb\0"), "\"a\\nb\\0\"");
        let long = "x".repeat(10_000);
        let out = shown(&long);
        assert!(out.ends_with('…'));
        assert!(out.chars().count() < 90);
        // Multi-byte characters are cut on character boundaries.
        let arabic = "واجهة".repeat(40);
        assert!(shown(&arabic).ends_with('…'));
    }
}
