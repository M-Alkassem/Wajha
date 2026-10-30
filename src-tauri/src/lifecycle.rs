//! App lifecycle: saving pending edits before quitting, and the scripted
//! self-test used by the desktop smoke test.
//!
//! Autosave writes a project 800 ms after the last change, so every way of
//! quitting must let the frontend write what is still pending:
//!
//! - Closing the window runs the frontend's close handler, which saves and
//!   then destroys the window. The last window going away raises
//!   `RunEvent::ExitRequested`, and the app quits with nothing left to save.
//! - Cmd+Q and Quit in the macOS app menu are an item of our own
//!   (`app_menu`), because the standard Quit item sends `terminate:`, which
//!   tao reports only as the run loop ending (`RunEvent::Exit`): too late to
//!   wait for anything. Windows and Linux have no app menu.
//!
//! That item, and any exit request raised while the main window is still
//! alive, go through `hold_exit`: the quit is held back and the frontend gets
//! a `wajha://before-exit` event; it flushes autosave and calls
//! `confirm_exit`. If it does not answer within a few seconds the app quits
//! anyway, so a stuck page can never block quitting.
//!
//! What cannot be held: Quit in the Dock menu, logging out, shutting down and
//! an AppleScript `quit` also end in `terminate:`, and tao lets it through
//! without asking the app (it implements no `applicationShouldTerminate:`).
//! The app then quits at once, and edits made in the last moment (within the
//! 0.8 s autosave delay) are lost. Cancelling `terminate:` to save first
//! would also cancel the user's logout, so the shell does not try.
//!
//! The self-test exists only in builds with the `self-test` cargo feature
//! (scripts/desktop-smoke.sh makes one). Shipped builds never read its
//! environment variable, which would swap the library and open a folder
//! for writing.

use std::ffi::OsString;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
#[cfg(target_os = "macos")]
use tauri::menu::{
    AboutMetadata, HELP_SUBMENU_ID, Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu,
    WINDOW_SUBMENU_ID,
};
use tauri::{AppHandle, Emitter, Manager, RunEvent, Runtime};

use crate::export::ExportRoots;

/// How long the frontend gets to save before the app quits regardless.
const EXIT_GRACE: Duration = Duration::from_secs(4);

pub const BEFORE_EXIT_EVENT: &str = "wajha://before-exit";

/// Id of the Quit item in the macOS app menu.
#[cfg(target_os = "macos")]
const QUIT_MENU_ID: &str = "wajha-quit";

/// Environment variable naming the output folder of the self-test.
pub const SELF_TEST_ENV: &str = "WAJHA_SELF_TEST_DIR";

/// The state of quitting, shared by every quit request (`hold_exit`).
#[derive(Default)]
pub struct ExitGate {
    /// The frontend saved (or the grace period ran out): let the next exit through.
    confirmed: AtomicBool,
    /// An exit is being held back right now.
    pending: AtomicBool,
}

/// Handles run events for the whole app (see module docs).
pub fn on_run_event<R: Runtime>(app: &AppHandle<R>, event: &RunEvent) {
    let RunEvent::ExitRequested { api, code, .. } = event else {
        return;
    };
    // Exits requested by app.exit(code) (confirm_exit, the grace timer) pass.
    if code.is_none() && hold_exit(app, EXIT_GRACE, exit_app) {
        api.prevent_exit();
    }
}

/// The macOS app menu: Tauri's default one (`Menu::default`), except that
/// Quit is `quit_item`, which `on_menu_event` holds like any other exit.
#[cfg(target_os = "macos")]
pub fn app_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app.package_info();
    let config = app.config();
    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    let window_menu = Submenu::with_id_and_items(
        app,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let help_menu = Submenu::with_id_and_items(app, HELP_SUBMENU_ID, "Help", true, &[])?;

    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                pkg_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, Some(about_metadata))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &quit_item(app)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[&PredefinedMenuItem::close_window(app, None)?],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app, None)?],
            )?,
            &window_menu,
            &help_menu,
        ],
    )
}

/// Quit as a plain menu item, with the label and shortcut of the standard one.
#[cfg(target_os = "macos")]
fn quit_item<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<MenuItem<R>> {
    let label = format!("Quit {}", app.package_info().name);
    MenuItem::with_id(app, QUIT_MENU_ID, label, true, Some("CmdOrCtrl+Q"))
}

/// Handles the macOS app menu: Quit (Cmd+Q) waits for the frontend to save.
#[cfg(target_os = "macos")]
pub fn on_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    if event.id() == QUIT_MENU_ID && !hold_exit(app, EXIT_GRACE, exit_app) {
        quit(app, exit_app);
    }
}

/// Holds a quit back until the frontend has saved, for run events, the macOS
/// menu's Quit and the self-test alike: sends `wajha://before-exit` once and
/// starts the grace timer, which quits unless `confirm_exit` did first. True
/// while the quit is held, by this request or an earlier one; false when there
/// is nothing to wait for (the exit is confirmed already, or no main window is
/// left to save), so the caller lets the app quit now.
fn hold_exit<R: Runtime>(app: &AppHandle<R>, grace: Duration, exit: fn(&AppHandle<R>)) -> bool {
    let gate = app.state::<ExitGate>();
    if gate.confirmed.load(Ordering::SeqCst) {
        return false;
    }
    // With no window left there is nothing to save: the close handler of the
    // window already flushed before the window went away.
    let Some(window) = app.get_webview_window("main") else {
        return false;
    };
    if gate.pending.swap(true, Ordering::SeqCst) {
        return true; // already waiting for the frontend
    }
    if window.emit(BEFORE_EXIT_EVENT, ()).is_err() {
        // No page to wait for.
        gate.pending.store(false, Ordering::SeqCst);
        return false;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(grace);
        quit(&handle, exit);
    });
    true
}

/// Ends the app through `exit`, once: later calls (the grace timer after
/// `confirm_exit`) do nothing, and later exit requests pass.
fn quit<R: Runtime>(app: &AppHandle<R>, exit: fn(&AppHandle<R>)) {
    let gate = app.state::<ExitGate>();
    if !gate.confirmed.swap(true, Ordering::SeqCst) {
        exit(app);
    }
}

/// How `quit` ends the app. Tests pass a stand-in: the mock runtime cannot quit.
fn exit_app<R: Runtime>(app: &AppHandle<R>) {
    app.exit(0);
}

/// Called by the frontend once pending edits are saved.
#[tauri::command]
pub async fn confirm_exit<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    quit(&app, exit_app);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfTestConfig {
    out_dir: String,
}

/// The self-test output folder from WAJHA_SELF_TEST_DIR, created and
/// registered as an export root; None in normal use, and always without the
/// `self-test` feature.
pub fn self_test_dir() -> Option<PathBuf> {
    self_test_dir_in(|name| std::env::var_os(name))
}

/// `self_test_dir`, reading the environment through `var`.
fn self_test_dir_in(var: impl FnOnce(&str) -> Option<OsString>) -> Option<PathBuf> {
    if !cfg!(feature = "self-test") {
        return None;
    }
    let dir = PathBuf::from(var(SELF_TEST_ENV)?);
    if !dir.is_absolute() {
        eprintln!("wajha: {SELF_TEST_ENV} must be an absolute path");
        return None;
    }
    std::fs::create_dir_all(&dir).ok()?;
    dunce::canonicalize(&dir).ok()
}

/// Registers the self-test folder as an export root at startup.
pub fn prepare_self_test<R: Runtime>(app: &AppHandle<R>) {
    if let Some(dir) = self_test_dir() {
        app.state::<ExportRoots>().remember(dir);
    }
}

/// Tells the frontend whether to run the scripted self-test, and where to write.
#[tauri::command]
pub async fn self_test_config() -> Result<Option<SelfTestConfig>, String> {
    Ok(self_test_dir().map(|dir| SelfTestConfig {
        out_dir: dir.to_string_lossy().into_owned(),
    }))
}

/// How long the self-test's quit waits for the frontend: longer than
/// scripts/desktop-smoke.sh waits for the app to end, so only the frontend
/// answering `wajha://before-exit` ends it in time.
#[cfg(feature = "self-test")]
const SELF_TEST_EXIT_GRACE: Duration = Duration::from_secs(60);

/// Quits the way the macOS app menu's Quit does (`hold_exit`), so the smoke
/// test sees the frontend save before the app ends. Self-test builds only.
#[cfg(feature = "self-test")]
#[tauri::command]
pub async fn self_test_quit<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if !hold_exit(&app, SELF_TEST_EXIT_GRACE, exit_app) {
        quit(&app, exit_app);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::AtomicUsize;
    use std::time::Instant;
    use tauri::Listener;
    use tauri::test::{MockRuntime, mock_builder};

    #[test]
    fn exit_gate_starts_closed() {
        let gate = ExitGate::default();
        assert!(!gate.confirmed.load(Ordering::SeqCst));
        assert!(!gate.pending.load(Ordering::SeqCst));
    }

    /* Holding quits ---------------------------------------------------- */

    /// Longer than the tests run: the timer of a held quit never fires.
    const NEVER: Duration = Duration::from_secs(3600);

    /// How often `quit` ended the app (through `count_exit`).
    #[derive(Default)]
    struct Exits(AtomicUsize);

    /// Stands in for `exit_app`, which the mock runtime cannot do.
    fn count_exit(app: &AppHandle<MockRuntime>) {
        app.state::<Exits>().0.fetch_add(1, Ordering::SeqCst);
    }

    struct Quitting {
        app: tauri::App<MockRuntime>,
        /// `wajha://before-exit` events sent.
        asked: Arc<AtomicUsize>,
    }

    impl Quitting {
        /// The app on the mock runtime, with or without its main window.
        fn new(window: bool) -> Self {
            let app = mock_builder()
                .manage(ExitGate::default())
                .manage(Exits::default())
                .build(crate::tests::context())
                .unwrap();
            if window {
                tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
                    .build()
                    .unwrap();
            }
            let asked = Arc::new(AtomicUsize::new(0));
            let count = asked.clone();
            app.listen_any(BEFORE_EXIT_EVENT, move |_| {
                count.fetch_add(1, Ordering::SeqCst);
            });
            Self { app, asked }
        }

        fn handle(&self) -> &AppHandle<MockRuntime> {
            self.app.handle()
        }

        fn hold(&self, grace: Duration) -> bool {
            hold_exit(self.handle(), grace, count_exit)
        }

        /// What `confirm_exit` does once the frontend saved.
        fn confirm(&self) {
            quit(self.handle(), count_exit);
        }

        /// Before-exit events sent and exits so far.
        fn counts(&self) -> (usize, usize) {
            (
                self.asked.load(Ordering::SeqCst),
                self.app.state::<Exits>().0.load(Ordering::SeqCst),
            )
        }
    }

    #[test]
    fn a_quit_waits_for_the_frontend_to_save() {
        let q = Quitting::new(true);
        assert!(q.hold(NEVER));
        assert_eq!(q.counts(), (1, 0));
        // Cmd+Q again while the frontend saves: still held, nothing sent twice.
        assert!(q.hold(NEVER));
        assert_eq!(q.counts(), (1, 0));
        // confirm_exit ends the app, once.
        q.confirm();
        q.confirm();
        assert_eq!(q.counts(), (1, 1));
        // Exit requests after that (the exit itself) pass straight through.
        assert!(!q.hold(NEVER));
        assert_eq!(q.counts(), (1, 1));
    }

    #[test]
    fn the_grace_period_ends_a_quit_the_frontend_never_answers() {
        let q = Quitting::new(true);
        assert!(q.hold(Duration::from_millis(10)));
        let deadline = Instant::now() + Duration::from_secs(10);
        while q.counts().1 == 0 {
            assert!(Instant::now() < deadline, "the grace timer never quit");
            std::thread::sleep(Duration::from_millis(5));
        }
        // A late answer does not end the app a second time.
        q.confirm();
        assert!(!q.hold(NEVER));
        assert_eq!(q.counts(), (1, 1));
    }

    #[test]
    fn nothing_is_held_once_the_window_is_gone() {
        let q = Quitting::new(false);
        assert!(!q.hold(NEVER));
        assert_eq!(q.counts(), (0, 0));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn the_menu_quit_waits_for_the_frontend_too() {
        let q = Quitting::new(true);
        let event = |id: &str| MenuEvent { id: id.into() };
        on_menu_event(q.handle(), event("something-else"));
        assert_eq!(q.counts(), (0, 0));
        on_menu_event(q.handle(), event(QUIT_MENU_ID));
        on_menu_event(q.handle(), event(QUIT_MENU_ID));
        assert_eq!(q.counts(), (1, 0));
        // The frontend answers within the grace period, so the timer's own
        // quit later finds the exit done.
        q.confirm();
        assert_eq!(q.counts(), (1, 1));
    }

    /// The rest of the menu needs the main thread (muda), which no test runs on.
    #[cfg(target_os = "macos")]
    #[test]
    fn the_menu_quit_is_named_after_the_app() {
        let q = Quitting::new(false);
        let item = quit_item(q.handle()).unwrap();
        assert_eq!(item.id().as_ref(), QUIT_MENU_ID);
        assert_eq!(item.text().unwrap(), "Quit Wajha");
        assert!(item.is_enabled().unwrap());
    }

    /* Self-test ---------------------------------------------------------- */

    // Both run with and without the feature (`cargo test --features
    // self-test`) and check what each build must do.

    #[test]
    fn only_self_test_builds_look_for_the_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let out = tmp.path().join("run 1");
        let mut asked = None;
        let found = self_test_dir_in(|name| {
            asked = Some(name.to_owned());
            Some(out.clone().into_os_string())
        });
        if cfg!(feature = "self-test") {
            assert_eq!(asked.as_deref(), Some(SELF_TEST_ENV));
            assert_eq!(found, Some(dunce::canonicalize(&out).unwrap()));
        } else {
            // A shipped build does not even read the variable.
            assert_eq!(asked, None);
            assert_eq!(found, None);
            assert!(!out.exists());
        }
    }

    #[test]
    fn self_test_folders_must_be_absolute() {
        assert_eq!(self_test_dir_in(|_| Some("relative/dir".into())), None);
        assert_eq!(self_test_dir_in(|_| None), None);
    }
}
