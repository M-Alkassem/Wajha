//! Wajha desktop shell.
//!
//! The webview never touches the file system or the plugins directly: it only
//! calls the commands registered in `invoke_handler` (ARCHITECTURE 6.3), and
//! each of them validates its input and stays inside the app data folder, a
//! folder the user picked, or a file the user chose in a dialog.

mod assets;
mod dialogs;
mod error;
mod export;
mod fonts;
mod lifecycle;
mod paths;
mod store;

use serde::Serialize;
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Runtime, State, Url};

use crate::error::{AppError, AppResult, shown};
use crate::store::DataDir;

/// Longest URL `open_url` accepts, as in src/platform/paths.ts.
const MAX_URL_BYTES: usize = 8192;

/// Sends link clicks that would leave the app to the default browser
/// through `open_url` (https only), instead of navigating the app window
/// away from the editor with no way back. Clicks the UI already handled
/// (`preventDefault`) are left alone.
const LINK_SCRIPT: &str = r#"(function () {
  'use strict';
  window.addEventListener('click', function (event) {
    if (event.defaultPrevented || event.button !== 0) return;
    var path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    var anchor = null;
    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (node && typeof node.nodeName === 'string' && node.nodeName.toUpperCase() === 'A' && typeof node.href === 'string' && node.href) {
        anchor = node;
        break;
      }
    }
    if (!anchor) return;
    var url;
    try {
      url = new URL(anchor.href, window.location.href);
    } catch (_) {
      return;
    }
    if (url.origin === window.location.origin) return;
    if (['http:', 'https:', 'mailto:', 'tel:'].indexOf(url.protocol) === -1) return;
    event.preventDefault();
    var internals = window.__TAURI_INTERNALS__;
    if (url.protocol === 'https:' && internals && typeof internals.invoke === 'function') {
      internals.invoke('open_url', { url: url.href }).catch(function () {});
    }
  });
})();"#;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // The plugin's own link script would call its JS command, which the
        // capability deliberately does not grant; LINK_SCRIPT replaces it.
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .plugin(shell_guard())
        .manage(DataDir::default())
        .manage(export::ExportRoots::default())
        .manage(dialogs::PendingFiles::default())
        .manage(lifecycle::ExitGate::default());
    // The macOS app menu, whose Quit saves pending edits first (see
    // lifecycle). Windows and Linux have no app menu.
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(lifecycle::app_menu)
        .on_menu_event(lifecycle::on_menu_event);
    builder
        .setup(|app| {
            // The self-test keeps its projects out of the user's real library.
            let data_dir = match lifecycle::self_test_dir() {
                Some(dir) => Ok(dir.join("data")),
                None => app.path().app_data_dir(),
            };
            match data_dir {
                Ok(dir) => app.state::<DataDir>().set(store::prepare_data_dir(dir)),
                // Library commands then fail with an io error the UI can show.
                Err(err) => eprintln!("wajha: no data folder for this user: {err}"),
            }
            fonts::warm_up();
            lifecycle::prepare_self_test(app.handle());
            Ok(())
        })
        .invoke_handler(invoke_handler())
        .build(tauri::generate_context!())
        .expect("error while building Wajha")
        .run(|app, event| lifecycle::on_run_event(app, &event));
}

/// Every command of ARCHITECTURE 6.3. App commands need no capability entry:
/// Tauri allows them for the app's own (local) pages as long as no app ACL
/// manifest is configured in build.rs, and refuses them to remote pages.
fn invoke_handler<R: Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![
        app_info,
        open_url,
        store::store_read,
        store::store_write,
        store::store_list,
        store::store_remove,
        assets::asset_put,
        dialogs::pick_images,
        dialogs::open_file_pick,
        dialogs::open_file_read,
        dialogs::save_file,
        export::pick_export_dir,
        export::export_write,
        export::reveal_path,
        fonts::system_fonts,
        lifecycle::confirm_exit,
        lifecycle::self_test_config,
        #[cfg(feature = "self-test")]
        lifecycle::self_test_quit,
    ]
}

/// Keeps the window on the app: navigations to anything but the app's own
/// pages are cancelled (links go through LINK_SCRIPT instead).
fn shell_guard<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("wajha-shell")
        .js_init_script(LINK_SCRIPT)
        .on_navigation(|webview, url| {
            let dev_url = webview.config().build.dev_url.as_ref();
            let allowed = is_app_url(url, dev_url, tauri::is_dev());
            if !allowed {
                eprintln!("wajha: blocked navigation to {url}");
            }
            allowed
        })
        .build()
}

/// The app's own pages: `tauri://localhost` (macOS, Linux), `http(s)://
/// tauri.localhost` (Windows) and, in development, the Vite dev server.
fn is_app_url(url: &Url, dev_url: Option<&Url>, dev: bool) -> bool {
    match url.scheme() {
        "tauri" => true,
        "about" => matches!(url.path(), "blank" | "srcdoc"),
        "http" | "https" => {
            let Some(host) = url.host_str() else {
                return false;
            };
            if host == "tauri.localhost" {
                return true;
            }
            dev && (dev_url.is_some_and(|dev_url| same_origin(url, dev_url))
                || matches!(host, "localhost" | "127.0.0.1" | "[::1]"))
        }
        _ => false,
    }
}

fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme()
        && a.host_str() == b.host_str()
        && a.port_or_known_default() == b.port_or_known_default()
}

/// Runs blocking file work on Tauri's blocking pool, keeping the async
/// workers (and so every other command) responsive.
pub(crate) async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|err| AppError::io(format!("a background task failed: {err}")))?
}

fn os_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        // The other desktop targets (Linux, the BSDs) share the Linux shell.
        "linux"
    }
}

/// Absolute https URLs with a host and no embedded credentials. Anything
/// else could start a local program through the OS URL handlers.
fn https_url(text: &str) -> AppResult<Url> {
    if text.len() > MAX_URL_BYTES {
        return Err(AppError::invalid_data("the link is too long"));
    }
    let url = Url::parse(text)
        .map_err(|_| AppError::invalid_data(format!("{} is not a valid link", shown(text))))?;
    let has_host = url.host_str().is_some_and(|host| !host.is_empty());
    let has_credentials = !url.username().is_empty() || url.password().is_some();
    if url.scheme() != "https" || !has_host || has_credentials {
        return Err(AppError::invalid_data(format!(
            "only https:// links can be opened, not {}",
            shown(text)
        )));
    }
    Ok(url)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    os: &'static str,
    /// Empty when the data folder could not be resolved.
    data_dir: String,
}

#[tauri::command]
async fn app_info<R: Runtime>(
    app: AppHandle<R>,
    data: State<'_, DataDir>,
) -> Result<AppInfo, String> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        os: os_name(),
        data_dir: data
            .get()
            .map(|dir| dir.to_string_lossy().into_owned())
            .unwrap_or_default(),
    })
}

#[tauri::command]
async fn open_url(url: String) -> Result<(), String> {
    let url = https_url(&url)?;
    Ok(run_blocking(move || {
        tauri_plugin_opener::open_url(url.as_str(), None::<&str>)
            .map_err(|err| AppError::io(format!("could not open the link: {err}")))
    })
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use tauri::http::{HeaderMap, HeaderName, HeaderValue};
    use tauri::ipc::{CallbackFn, InvokeBody, InvokeResponseBody};
    use tauri::test::{INVOKE_KEY, MockRuntime, mock_builder};
    use tauri::webview::InvokeRequest;

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    #[test]
    fn navigation_stays_on_app_pages() {
        let dev_url = url("http://localhost:1420");
        for allowed in [
            "tauri://localhost/",
            "tauri://localhost/index.html#/editor",
            "http://tauri.localhost/",
            "https://tauri.localhost/index.html",
            "about:blank",
            "about:srcdoc",
        ] {
            assert!(is_app_url(&url(allowed), None, false), "{allowed}");
        }
        for blocked in [
            "https://example.com/",
            "http://localhost:1420/",
            "https://tauri.localhost.evil.com/",
            "http://evil.com/tauri.localhost",
            "file:///etc/passwd",
            "data:text/html,<script>1</script>",
            "javascript:alert(1)",
            "blob:tauri://localhost/123",
            "about:config",
            "ipc://localhost/store_read",
        ] {
            assert!(
                !is_app_url(&url(blocked), Some(&dev_url), false),
                "{blocked}"
            );
        }
    }

    #[test]
    fn development_also_allows_the_dev_server() {
        let dev_url = url("http://192.168.1.20:1420");
        assert!(is_app_url(
            &url("http://192.168.1.20:1420/src/main.tsx"),
            Some(&dev_url),
            true
        ));
        assert!(is_app_url(&url("http://localhost:5173/"), None, true));
        assert!(is_app_url(&url("http://127.0.0.1:1420/"), None, true));
        assert!(!is_app_url(
            &url("http://192.168.1.20:9999/"),
            Some(&dev_url),
            true
        ));
        assert!(!is_app_url(
            &url("https://example.com/"),
            Some(&dev_url),
            true
        ));
    }

    #[test]
    fn opens_only_https_links() {
        for ok in [
            "https://github.com/wajha/wajha",
            "https://example.com/path?q=1#x",
            "https://واجهة.example/",
            "  https://example.com  ",
        ] {
            assert!(https_url(ok).is_ok(), "{ok}");
        }
        for bad in [
            "http://example.com",
            "file:///Applications/Calculator.app",
            "javascript:alert(1)",
            "mailto:a@b.c",
            "ftp://example.com",
            "https://",
            "https://user:pass@example.com",
            "https://user@example.com",
            "smb://server/share",
            "example.com",
            "",
            "C:\\Windows\\system32\\calc.exe",
        ] {
            let err = https_url(bad).unwrap_err();
            assert_eq!(err.code(), error::ErrorCode::InvalidData, "{bad:?}");
        }
        let long = format!("https://example.com/{}", "a".repeat(MAX_URL_BYTES));
        assert!(https_url(&long).is_err());
        // WHATWG parsing (shared with the frontend's `new URL`) normalises
        // these; what reaches the OS is the clean serialisation.
        assert_eq!(
            https_url("https:///path").unwrap().as_str(),
            "https://path/"
        );
        assert_eq!(
            https_url("https://a.com/x y").unwrap().as_str(),
            "https://a.com/x%20y"
        );
    }

    #[test]
    fn os_names_match_the_platform_types() {
        assert!(["macos", "windows", "linux"].contains(&os_name()));
        if cfg!(target_os = "macos") {
            assert_eq!(os_name(), "macos");
        }
    }

    /* IPC wiring through Tauri's mock runtime ------------------------ */

    struct Harness {
        app: tauri::App<MockRuntime>,
        webview: tauri::WebviewWindow<MockRuntime>,
        data: PathBuf,
        _dir: tempfile::TempDir,
    }

    /// The origin of the app's own pages, which capabilities call "local".
    const LOCAL_ORIGIN: &str = if cfg!(windows) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    };

    /// The app's real context (tauri.conf.json), so every call goes through
    /// the ACL that capabilities/default.json compiles to.
    pub(crate) fn context() -> tauri::Context<MockRuntime> {
        tauri::generate_context!(test = true)
    }

    fn harness() -> Harness {
        let dir = tempfile::tempdir().unwrap();
        let data = dunce::canonicalize(dir.path()).unwrap();
        let app = mock_builder()
            .manage(DataDir::new(data.clone()))
            .manage(export::ExportRoots::default())
            .manage(dialogs::PendingFiles::default())
            .invoke_handler(invoke_handler())
            .build(context())
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        Harness {
            app,
            webview,
            data,
            _dir: dir,
        }
    }

    impl Harness {
        fn call(
            &self,
            cmd: &str,
            body: InvokeBody,
            headers: &[(&'static str, &str)],
        ) -> Result<InvokeResponseBody, String> {
            self.call_from(LOCAL_ORIGIN, cmd, body, headers)
        }

        /// A call made by a page at `origin`.
        fn call_from(
            &self,
            origin: &str,
            cmd: &str,
            body: InvokeBody,
            headers: &[(&'static str, &str)],
        ) -> Result<InvokeResponseBody, String> {
            let mut map = HeaderMap::new();
            for (name, value) in headers {
                map.insert(
                    HeaderName::from_static(name),
                    HeaderValue::from_str(value).unwrap(),
                );
            }
            tauri::test::get_ipc_response(
                &self.webview,
                InvokeRequest {
                    cmd: cmd.into(),
                    callback: CallbackFn(0),
                    error: CallbackFn(1),
                    url: origin.parse().unwrap(),
                    body,
                    headers: map,
                    invoke_key: INVOKE_KEY.to_string(),
                },
            )
            .map_err(|err| {
                err.as_str()
                    .map(str::to_owned)
                    .unwrap_or_else(|| err.to_string())
            })
        }

        fn json(&self, cmd: &str, args: serde_json::Value) -> Result<serde_json::Value, String> {
            self.call(cmd, InvokeBody::Json(args), &[])
                .map(|body| body.deserialize::<serde_json::Value>().unwrap())
        }

        fn raw(&self, cmd: &str, args: serde_json::Value) -> Result<Vec<u8>, String> {
            match self.call(cmd, InvokeBody::Json(args), &[])? {
                InvokeResponseBody::Raw(bytes) => Ok(bytes),
                InvokeResponseBody::Json(json) => panic!("expected raw bytes, got {json}"),
            }
        }
    }

    fn png() -> Vec<u8> {
        assets::tests::png(b"pixels")
    }

    #[test]
    fn ipc_store_round_trip() {
        let h = harness();
        let body = InvokeBody::Raw(b"{\"name\":\"Demo\"}".to_vec());
        h.call(
            "store_write",
            body,
            &[("x-path", "projects%2Fp1%2Fproject.json")],
        )
        .unwrap();
        assert_eq!(
            h.raw(
                "store_read",
                serde_json::json!({ "path": "projects/p1/project.json" })
            )
            .unwrap(),
            b"{\"name\":\"Demo\"}"
        );

        let listed = h
            .json("store_list", serde_json::json!({ "dir": "projects/p1" }))
            .unwrap();
        let entries = listed.as_array().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0]["name"], "project.json");
        assert_eq!(entries[0]["isDir"], false);
        assert_eq!(entries[0]["size"], 15);
        assert!(entries[0]["modifiedMs"].as_u64().unwrap() > 0);
        assert_eq!(
            h.json("store_list", serde_json::json!({ "dir": "missing" }))
                .unwrap(),
            serde_json::json!([])
        );

        h.json("store_remove", serde_json::json!({ "path": "projects/p1" }))
            .unwrap();
        h.json("store_remove", serde_json::json!({ "path": "projects/p1" }))
            .unwrap();
        let err = h
            .raw(
                "store_read",
                serde_json::json!({ "path": "projects/p1/project.json" }),
            )
            .unwrap_err();
        assert_eq!(err, "not_found: projects/p1/project.json");
    }

    #[test]
    fn ipc_store_write_decodes_unicode_paths_and_fallback_bodies() {
        let h = harness();
        // encodeURIComponent("cache/واجهة.json")
        let encoded = "cache%2F%D9%88%D8%A7%D8%AC%D9%87%D8%A9.json";
        h.call(
            "store_write",
            InvokeBody::Json(serde_json::json!([1, 2, 3])),
            &[("x-path", encoded)],
        )
        .unwrap();
        assert_eq!(
            fs::read(h.data.join("cache/واجهة.json")).unwrap(),
            [1, 2, 3]
        );
    }

    #[test]
    fn ipc_errors_carry_platform_codes() {
        let h = harness();
        let err = h
            .raw("store_read", serde_json::json!({ "path": "../secret" }))
            .unwrap_err();
        assert!(err.starts_with("invalid_path: "), "{err}");
        let err = h
            .call("store_write", InvokeBody::Raw(vec![1]), &[])
            .unwrap_err();
        assert_eq!(err, "invalid_data: the x-path header is missing");
        let err = h
            .call(
                "store_write",
                InvokeBody::Raw(vec![1]),
                &[("x-path", "%2E%2E%2Fx")],
            )
            .unwrap_err();
        assert!(err.starts_with("invalid_path: "), "{err}");
        let err = h
            .call(
                "store_write",
                InvokeBody::Json(serde_json::json!({ "a": 1 })),
                &[("x-path", "a.json")],
            )
            .unwrap_err();
        assert!(err.starts_with("invalid_data: "), "{err}");
        let err = h
            .json("pick_images", serde_json::json!({ "projectId": "../x" }))
            .unwrap_err();
        assert!(err.starts_with("invalid_path: "), "{err}");
        let err = h
            .json("open_file_pick", serde_json::json!({ "kind": "video" }))
            .unwrap_err();
        assert!(err.starts_with("invalid_data: "), "{err}");
    }

    #[test]
    fn ipc_asset_put() {
        let h = harness();
        let data = png();
        let id = h
            .call(
                "asset_put",
                InvokeBody::Raw(data.clone()),
                &[("x-project", "p1"), ("x-ext", "png")],
            )
            .unwrap()
            .deserialize::<String>()
            .unwrap();
        assert!(assets::is_asset_id(&id), "{id}");
        assert_eq!(
            fs::read(h.data.join("projects/p1/assets").join(&id)).unwrap(),
            data
        );
        let err = h
            .call(
                "asset_put",
                InvokeBody::Raw(data),
                &[("x-project", "p1"), ("x-ext", "webp")],
            )
            .unwrap_err();
        assert!(err.starts_with("invalid_data: "), "{err}");
        let err = h
            .call(
                "asset_put",
                InvokeBody::Raw(png()),
                &[("x-project", "P%2F1"), ("x-ext", "png")],
            )
            .unwrap_err();
        assert!(err.starts_with("invalid_path: "), "{err}");
    }

    #[test]
    fn ipc_export_write_is_scoped_to_picked_roots() {
        let h = harness();
        let out = tempfile::tempdir().unwrap();
        let root = out.path().to_str().unwrap().to_owned();
        let encoded_root: String = root
            .bytes()
            .map(|b| {
                if b.is_ascii_alphanumeric() {
                    char::from(b).to_string()
                } else {
                    format!("%{b:02X}")
                }
            })
            .collect();
        let headers = [
            ("x-root", encoded_root.as_str()),
            ("x-path", "App%20Store%2Fen-US%2F01.png"),
        ];
        let err = h
            .call("export_write", InvokeBody::Raw(png()), &headers)
            .unwrap_err();
        assert!(err.starts_with("permission: "), "{err}");

        h.app
            .state::<export::ExportRoots>()
            .remember(dunce::canonicalize(out.path()).unwrap());
        h.call("export_write", InvokeBody::Raw(png()), &headers)
            .unwrap();
        assert_eq!(
            fs::read(out.path().join("App Store/en-US/01.png")).unwrap(),
            png()
        );

        let escape = [("x-root", encoded_root.as_str()), ("x-path", "..%2F01.png")];
        let err = h
            .call("export_write", InvokeBody::Raw(png()), &escape)
            .unwrap_err();
        assert!(err.starts_with("invalid_path: "), "{err}");
        // An absolute path outside every picked root.
        let outside = if cfg!(windows) { "C:\\" } else { "/" };
        let err = h
            .json("reveal_path", serde_json::json!({ "path": outside }))
            .unwrap_err();
        assert!(err.starts_with("permission: "), "{err}");
    }

    #[test]
    fn ipc_open_file_read_consumes_its_token() {
        let h = harness();
        let path = h.data.join("Demo.wajha");
        fs::write(&path, b"PK\x03\x04archive").unwrap();
        let token = h
            .app
            .state::<dialogs::PendingFiles>()
            .insert(dialogs::PendingFile {
                path,
                max_bytes: 500 << 20,
            });
        let args = serde_json::json!({ "token": token });
        assert_eq!(
            h.raw("open_file_read", args.clone()).unwrap(),
            b"PK\x03\x04archive"
        );
        let err = h.raw("open_file_read", args).unwrap_err();
        assert!(err.starts_with("not_found: "), "{err}");
    }

    #[test]
    fn ipc_open_file_read_refuses_files_over_their_kind_limit() {
        let h = harness();
        let path = h.data.join("texts.csv");
        // Sparse: 10 MB and a byte, on no disk space.
        fs::File::create(&path)
            .unwrap()
            .set_len((10 << 20) + 1)
            .unwrap();
        let token = h
            .app
            .state::<dialogs::PendingFiles>()
            .insert(dialogs::PendingFile {
                path,
                max_bytes: 10 << 20,
            });
        let err = h
            .raw("open_file_read", serde_json::json!({ "token": token }))
            .unwrap_err();
        // What tauri.ts turns into the same PlatformError as its own check.
        assert_eq!(err, "invalid_data: texts.csv is larger than 10 MB");
    }

    #[test]
    fn ipc_app_info_and_fonts() {
        let h = harness();
        let info = h.json("app_info", serde_json::json!({})).unwrap();
        assert_eq!(info["version"], "0.1.0");
        assert_eq!(info["os"], os_name());
        assert_eq!(info["dataDir"], h.data.to_str().unwrap());
        let fonts = h.json("system_fonts", serde_json::json!({})).unwrap();
        assert!(
            fonts
                .as_array()
                .is_some_and(|list| list.iter().all(serde_json::Value::is_string))
        );
    }

    #[test]
    fn ipc_open_url_refuses_non_https() {
        let h = harness();
        for bad in [
            "http://example.com",
            "file:///etc/hosts",
            "javascript:alert(1)",
        ] {
            let err = h
                .json("open_url", serde_json::json!({ "url": bad }))
                .unwrap_err();
            assert!(err.starts_with("invalid_data: "), "{err}");
        }
    }

    /* Capabilities ----------------------------------------------------- */

    /// True when the ACL turned the call away (rather than the command
    /// running, successfully or not).
    fn refused(result: Result<InvokeResponseBody, String>) -> bool {
        result.is_err_and(|err| err.contains("not allowed"))
    }

    /// Every core command the frontend sends: the close guard and the
    /// before-exit listener (src/ui/shell/session.ts), and Tauri's injected
    /// scripts for the drag region and, in debug builds, the devtools hotkey.
    #[test]
    fn ipc_capability_allows_the_core_calls_the_frontend_makes() {
        let h = harness();
        let ok = |cmd: &str, args| {
            h.json(cmd, args)
                .unwrap_or_else(|err| panic!("{cmd}: {err}"))
        };
        let event = lifecycle::BEFORE_EXIT_EVENT;
        let target = serde_json::json!({ "kind": "Any" });
        let id = ok(
            "plugin:event|listen",
            serde_json::json!({ "event": event, "target": target, "handler": 7 }),
        );
        let none = serde_json::json!({});
        ok(
            "plugin:event|unlisten",
            serde_json::json!({ "event": event, "eventId": id }),
        );
        ok("plugin:window|start_dragging", none.clone());
        ok("plugin:window|internal_toggle_maximize", none.clone());
        if cfg!(debug_assertions) {
            ok("plugin:webview|internal_toggle_devtools", none.clone());
        }
        // Last, since it closes the window: the close handler, after saving.
        ok("plugin:window|destroy", none);
    }

    /// What core:default would add on top. None of it is used, so script
    /// injected into the page could not use it either. (The ACL answers
    /// before arguments are read, so none are needed.)
    #[test]
    fn ipc_capability_refuses_the_rest_of_the_core_api() {
        let h = harness();
        let allowed: Vec<&str> = [
            "plugin:event|emit",
            "plugin:event|emit_to",
            "plugin:app|version",
            "plugin:app|identifier",
            "plugin:path|resolve_directory",
            "plugin:image|from_path",
            "plugin:menu|new",
            "plugin:tray|new",
            "plugin:resources|close",
            "plugin:window|close",
            "plugin:window|set_title",
            "plugin:window|set_theme",
            "plugin:window|inner_size",
            "plugin:window|available_monitors",
            "plugin:webview|print",
            "plugin:webview|set_webview_zoom",
            "plugin:webview|get_all_webviews",
            "plugin:dialog|open",
            "plugin:opener|open_path",
            "plugin:opener|open_url",
        ]
        .into_iter()
        .filter(|cmd| !refused(h.call(cmd, InvokeBody::Json(serde_json::json!({})), &[])))
        .collect();
        assert!(allowed.is_empty(), "allowed: {allowed:?}");
    }

    /// A page from anywhere else gets nothing, not even the app's commands
    /// (shell_guard keeps the window on the app; this is the second line).
    #[test]
    fn ipc_refuses_remote_pages() {
        let h = harness();
        for cmd in ["app_info", "store_list", "plugin:event|listen"] {
            let body = InvokeBody::Json(serde_json::json!({ "dir": "projects" }));
            let result = h.call_from("https://example.com", cmd, body, &[]);
            assert!(refused(result), "{cmd}");
        }
    }
}
