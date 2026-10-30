//! Installed font families for the font picker.
//!
//! fontdb scans the system font folders (memory-mapping each file only while
//! it reads the name table). Only the sorted family names are kept, a few
//! kilobytes; the face database is dropped as soon as they are extracted.

use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

static FAMILIES: OnceLock<Vec<String>> = OnceLock::new();

/// Long enough to stay out of the way of startup, short enough that the
/// list is ready before anyone opens a font menu.
const WARM_UP_DELAY: Duration = Duration::from_secs(3);

/// Family names longer than this are broken fonts, not names people pick.
const MAX_NAME_CHARS: usize = 200;

/// Sorted, de-duplicated family names, loaded on first use. Concurrent first
/// callers wait for the one load instead of scanning twice.
pub fn families() -> &'static [String] {
    FAMILIES.get_or_init(load)
}

/// Loads the list on a background thread shortly after startup.
pub fn warm_up() {
    let spawned = thread::Builder::new().name("wajha-fonts".into()).spawn(|| {
        thread::sleep(WARM_UP_DELAY);
        families();
    });
    if let Err(err) = spawned {
        // The command loads the list itself on first use.
        eprintln!("wajha: cannot start the font scan thread: {err}");
    }
}

fn load() -> Vec<String> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    collect_families(
        db.faces()
            .filter_map(|face| face.families.first().map(|(name, _)| name.as_str())),
    )
}

/// Cleans, sorts (case-insensitively) and de-duplicates family names.
/// Names starting with "." are Apple's private system faces (".SF NS");
/// names with quotes, backslashes or control characters cannot be written
/// into a CSS font string, which is how the engine uses them.
pub fn collect_families<'a>(names: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut keyed: Vec<(String, String)> = names
        .into_iter()
        .map(str::trim)
        .filter(|name| {
            !name.is_empty()
                && !name.starts_with('.')
                && name.chars().count() <= MAX_NAME_CHARS
                && !name
                    .chars()
                    .any(|c| c.is_control() || c == '"' || c == '\\')
        })
        .map(|name| (name.to_lowercase(), name.to_owned()))
        .collect();
    keyed.sort();
    // CSS matches family names case-insensitively, so "ARIAL" and "Arial"
    // are one family; the first spelling in sort order wins.
    keyed.dedup_by(|a, b| a.0 == b.0);
    keyed.into_iter().map(|(_, name)| name).collect()
}

#[tauri::command]
pub async fn system_fonts() -> Result<Vec<String>, String> {
    Ok(crate::run_blocking(|| Ok(families().to_vec())).await?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorts_case_insensitively_and_dedupes() {
        let names = collect_families([
            "Helvetica Neue",
            "arial",
            "Arial",
            "ARIAL",
            "Zapfino",
            "Avenir",
            "  Avenir  ",
            "avenir next",
            "Noto Sans Arabic",
            "Geeza Pro",
            "Geeza Pro",
        ]);
        assert_eq!(
            names,
            [
                "ARIAL",
                "Avenir",
                "avenir next",
                "Geeza Pro",
                "Helvetica Neue",
                "Noto Sans Arabic",
                "Zapfino"
            ]
        );
    }

    #[test]
    fn skips_hidden_empty_and_unusable_names() {
        let long = "x".repeat(MAX_NAME_CHARS + 1);
        let names = collect_families([
            ".SF NS",
            ".Apple Color Emoji UI",
            "",
            "   ",
            "Bad\"Quote",
            "Back\\slash",
            "Tab\tName",
            &long,
            "Good",
        ]);
        assert_eq!(names, ["Good"]);
    }

    #[test]
    fn keeps_non_latin_names() {
        let names = collect_families(["ヒラギノ角ゴシック", "Damascus", "الخط", "Ägypten"]);
        assert_eq!(names.len(), 4);
        assert_eq!(names[0], "Damascus");
        assert!(names.contains(&"الخط".to_owned()));
    }

    #[test]
    fn empty_input_gives_an_empty_list() {
        assert!(collect_families(std::iter::empty()).is_empty());
    }

    #[test]
    fn loads_the_installed_families() {
        let first = families();
        // Every desktop CI image and developer machine has some fonts.
        assert!(!first.is_empty());
        assert!(
            first
                .windows(2)
                .all(|w| w[0].to_lowercase() < w[1].to_lowercase())
        );
        assert!(first.iter().all(|name| !name.starts_with('.')));
        // Cached: the same allocation every time.
        assert!(std::ptr::eq(first, families()));
    }
}
