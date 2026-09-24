#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;

use tauri::{ipc::Response, State};
use windows_capture::{
    dxgi_duplication_api::{DxgiDuplicationApi, DxgiDuplicationFormat, Error as DxgiError},
    monitor::Monitor,
};

#[derive(Default)]
struct NativeCaptureState {
    session: Option<DxgiDuplicationApi>,
    width: u32,
    height: u32,
}

fn create_capture_session() -> Result<DxgiDuplicationApi, String> {
    let monitor = Monitor::primary().map_err(|error| format!("Falha ao localizar o monitor principal: {error}"))?;
    DxgiDuplicationApi::new_options(monitor, &[DxgiDuplicationFormat::Rgba8])
        .map_err(|error| format!("Falha ao iniciar a captura DXGI: {error}"))
}

#[tauri::command]
fn native_capture_start(state: State<'_, Mutex<NativeCaptureState>>) -> Result<Vec<u32>, String> {
    let session = create_capture_session()?;
    let width = session.width();
    let height = session.height();
    let (refresh_num, refresh_den) = session.refresh_rate();

    let mut capture = state.lock().map_err(|_| "Estado da captura nativa indisponível.".to_string())?;
    capture.session = Some(session);
    capture.width = width;
    capture.height = height;

    Ok(vec![width, height, refresh_num, refresh_den.max(1)])
}

#[tauri::command]
fn native_capture_frame(state: State<'_, Mutex<NativeCaptureState>>) -> Result<Response, String> {
    let mut capture = state.lock().map_err(|_| "Estado da captura nativa indisponível.".to_string())?;
    let session = capture.session.as_mut().ok_or_else(|| "A captura DXGI ainda não foi iniciada.".to_string())?;

    let mut frame = match session.acquire_next_frame(12) {
        Ok(frame) => frame,
        Err(DxgiError::Timeout) => return Ok(Response::new(Vec::new())),
        Err(DxgiError::AccessLost) => {
            capture.session = None;
            return Err("DXGI_ACCESS_LOST".to_string());
        }
        Err(error) => return Err(format!("Falha ao capturar quadro DXGI: {error}")),
    };

    let actual_format = frame.format();

    let mut packed = Vec::new();
    let buffer = frame.buffer().map_err(|error| format!("Falha ao mapear quadro DXGI: {error}"))?;
    let bytes = buffer.as_nopadding_buffer(&mut packed);
    let mut rgba = bytes.to_vec();

    match actual_format {
        DxgiDuplicationFormat::Rgba8 => {}
        DxgiDuplicationFormat::Bgra8 => {
            for pixel in rgba.chunks_exact_mut(4) {
                pixel.swap(0, 2);
            }
        }
        DxgiDuplicationFormat::Rgba16F => {
            return Err("Formato HDR de 16 bits não é suportado pela ponte de captura atual.".to_string());
        }
    }

    Ok(Response::new(rgba))
}

#[tauri::command]
fn native_capture_stop(state: State<'_, Mutex<NativeCaptureState>>) -> Result<(), String> {
    let mut capture = state.lock().map_err(|_| "Estado da captura nativa indisponível.".to_string())?;
    capture.session = None;
    capture.width = 0;
    capture.height = 0;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(NativeCaptureState::default()))
        .invoke_handler(tauri::generate_handler![
            native_capture_start,
            native_capture_frame,
            native_capture_stop
        ])
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("failed to run Lunira Screen");
}
