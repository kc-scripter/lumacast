use std::{fs, io::Write, path::Path};

fn ensure_windows_icon() {
    let dir = Path::new("icons");
    let path = dir.join("icon.ico");
    if path.exists() {
        return;
    }

    fs::create_dir_all(dir).expect("create icons directory");

    // Minimal valid 32x32 RGBA Windows ICO generated at build time.
    // This keeps CI/rebuilds deterministic even when binary assets cannot be
    // committed through the repository connector.
    let width = 32u32;
    let height = 32u32;
    let xor_size = width * height * 4;
    let and_stride = ((width + 31) / 32) * 4;
    let and_size = and_stride * height;
    let image_size = 40 + xor_size + and_size;
    let image_offset = 6 + 16;

    let mut out = Vec::with_capacity((image_offset + image_size) as usize);
    out.extend_from_slice(&0u16.to_le_bytes()); // reserved
    out.extend_from_slice(&1u16.to_le_bytes()); // icon
    out.extend_from_slice(&1u16.to_le_bytes()); // one image

    out.push(width as u8);
    out.push(height as u8);
    out.push(0); // palette
    out.push(0); // reserved
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&image_size.to_le_bytes());
    out.extend_from_slice(&image_offset.to_le_bytes());

    out.extend_from_slice(&40u32.to_le_bytes()); // BITMAPINFOHEADER size
    out.extend_from_slice(&(width as i32).to_le_bytes());
    out.extend_from_slice(&((height * 2) as i32).to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&32u16.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
    out.extend_from_slice(&xor_size.to_le_bytes());
    out.extend_from_slice(&0i32.to_le_bytes());
    out.extend_from_slice(&0i32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());

    for y in 0..height {
        for x in 0..width {
            let dx = x as f32 - 15.5;
            let dy = y as f32 - 15.5;
            let radius = (dx * dx + dy * dy).sqrt();
            let inside = radius <= 13.5;
            let (b, g, r, a) = if inside {
                // Lunira violet with a subtle center highlight.
                let glow = ((1.0 - (radius / 13.5)).max(0.0) * 28.0) as u8;
                (246u8.saturating_add(glow / 8), 92u8.saturating_add(glow / 3), 139u8.saturating_add(glow / 2), 255)
            } else {
                (0, 0, 0, 0)
            };
            out.extend_from_slice(&[b, g, r, a]);
        }
    }

    out.resize((image_offset + 40 + xor_size + and_size) as usize, 0);
    let mut file = fs::File::create(path).expect("create generated icon.ico");
    file.write_all(&out).expect("write generated icon.ico");
}

fn main() {
    ensure_windows_icon();
    tauri_build::build()
}
