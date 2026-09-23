#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Lunira Screen")
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("failed to run Lunira Screen");
}
