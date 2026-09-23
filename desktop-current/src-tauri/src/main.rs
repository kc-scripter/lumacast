#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::webview::{PermissionKind, PermissionResponse};

fn main() {
    tauri::Builder::default()
        .on_permission_request(|_, kind| match kind {
            PermissionKind::DisplayCapture
            | PermissionKind::Camera
            | PermissionKind::Microphone
            | PermissionKind::Autoplay => PermissionResponse::Allow,
            _ => PermissionResponse::Default,
        })
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Lunira Screen")
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("failed to run Lunira Screen");
}
