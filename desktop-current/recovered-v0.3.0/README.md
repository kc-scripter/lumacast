# Lunira Screen Desktop v0.3.0 — recovered working base

This directory was recovered from the exact installer `Lunira Screen_0.3.0_x64-setup.exe` supplied by the project owner.

## Proven binary identity

- Setup SHA-256: `38914bdbd022735cf2aecc3b34910c122ede68accd049276282df6ba5faaa8e5`
- Recovered main executable SHA-256: `576b6adc32ed9e012870c934847163490782984f3c7a266325c2038c1c39596a`
- Application version: `0.3.0`
- Framework: Tauri `2.11.6`
- Autostart plugin: `tauri-plugin-autostart 2.5.1`
- Identifier: `com.lunira.screen.desktop`
- Runtime webview: Microsoft WebView2

## Recovered frontend

The Tauri binary embeds three Brotli-compressed assets. `tools/extract_v030.py` recovers them without executing the installer:

- `frontend/index.html`
- `frontend/assets/index-CVLCUZdC.css`
- `frontend/assets/index-Dm-7PBzL.js`

The JavaScript is the production Vite bundle, so third-party libraries and app code are bundled/minified together. It is not claimed to be the original TypeScript source.

## Confirmed cross-web bug and fix

The v0.3.0 production bundle hard-coded the signaling server as:

`https://lunirascreen.onrender.com`

The current site/backend is:

`https://lunira-screen.onrender.com`

This recovered working copy changes only that endpoint. The verifier additionally confirms that the room signaling events and RTC flows remain present (`create-room`, `join-room`, `reclaim-room`, Agora and LiveKit token flows).

## Reconstructed Tauri shell

`reconstructed/src-tauri/` is a reconstruction from binary metadata and runtime strings. It is clearly separated from the recovered frontend because it is not byte-for-byte original Rust source.

Use the recovered frontend as the behavioral reference. Do not silently treat reconstructed Rust files as original source.