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
    // BGRA is the native Desktop Duplication format on Windows. Keeping it in
    // that layout avoids a full 4K/1080p channel-swap on the CPU every frame;
    // the WebGL shader performs the inexpensive swizzle on the GPU instead.
    DxgiDuplicationApi::new_options(monitor, &[DxgiDuplicationFormat::Bgra8])
        .map_err(|error| format!("Falha ao iniciar a captura DXGI: {error}"))
}

fn downscale_nearest(
    source: &[u8],
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> Vec<u8> {
    let mut target = vec![0u8; target_width as usize * target_height as usize * 4];
    let source_width_usize = source_width as usize;
    let target_width_usize = target_width as usize;

    for y in 0..target_height as usize {
        let source_y = y * source_height as usize / target_height as usize;
        let source_row = source_y * source_width_usize * 4;
        let target_row = y * target_width_usize * 4;

        for x in 0..target_width_usize {
            let source_x = x * source_width_usize / target_width_usize;
            let source_offset = source_row + source_x * 4;
            let target_offset = target_row + x * 4;
            target[target_offset..target_offset + 4]
                .copy_from_slice(&source[source_offset..source_offset + 4]);
        }
    }

    target
}

#[tauri::command]
fn native_capture_start(state: State<'_, Mutex<NativeCaptureState>>) -> Result<Vec<u32>, String> {
    let session = create_capture_session()?;
    let width = session.width();
    let height = session.height();
    let (refresh_num, refresh_den) = session.refresh_rate();
    let format_code = match session.format() {
        DxgiDuplicationFormat::Rgba8 => 0,
        DxgiDuplicationFormat::Bgra8 => 1,
        DxgiDuplicationFormat::Rgba16F => 2,
    };

    let mut capture = state.lock().map_err(|_| "Estado da captura nativa indisponível.".to_string())?;
    capture.session = Some(session);
    capture.width = width;
    capture.height = height;

    Ok(vec![width, height, refresh_num, refresh_den.max(1), format_code])
}

#[tauri::command]
fn native_capture_frame(
    width: u32,
    height: u32,
    state: State<'_, Mutex<NativeCaptureState>>,
) -> Result<Response, String> {
    let mut capture = state.lock().map_err(|_| "Estado da captura nativa indisponível.".to_string())?;
    let source_width = capture.width;
    let source_height = capture.height;
    let target_width = width.max(2).min(source_width);
    let target_height = height.max(2).min(source_height);
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

    let mut packed = Vec::new();
    let buffer = frame.buffer().map_err(|error| format!("Falha ao mapear quadro DXGI: {error}"))?;
    let bytes = buffer.as_nopadding_buffer(&mut packed);

    let output = if target_width == source_width && target_height == source_height {
        bytes.to_vec()
    } else {
        downscale_nearest(bytes, source_width, source_height, target_width, target_height)
    };

    Ok(Response::new(output))
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
