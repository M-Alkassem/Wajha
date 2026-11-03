fn main() {
    let msvc = std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc");
    let mut attributes = tauri_build::Attributes::new();
    if msvc {
        // tauri-build puts the app manifest in the executable's resources, which
        // test binaries do not get: without its Common Controls v6 dependency
        // `cargo test` dies at start-up (STATUS_ENTRYPOINT_NOT_FOUND). Embedding
        // the same manifest through the linker covers the app and its tests.
        attributes = attributes.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
    tauri_build::try_build(attributes).expect("failed to run the Tauri build script");
}
