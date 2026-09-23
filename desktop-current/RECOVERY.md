# Lunira Screen v0.3.0 — recovery notes

Reference installer: `Lunira Screen_0.3.0_x64-setup.exe`

- setup SHA-256: `38914bdbd022735cf2aecc3b34910c122ede68accd049276282df6ba5faaa8e5`
- recovered executable: `lunira-screen.exe`
- executable size: `9,284,608` bytes
- executable SHA-256: `576b6adc32ed9e012870c934847163490782984f3c7a266325c2038c1c39596a`
- framework: Tauri `2.11.6` / Rust
- autostart plugin: `tauri-plugin-autostart 2.5.1`
- app identifier: `com.lunira.screen.desktop`
- original frontendDist: `../dist`
- original dev URL: `http://localhost:5173`

## Recovered frontend

The compiled Tauri executable contains three Brotli-compressed frontend assets:

| Asset | Original size | SHA-256 |
| --- | ---: | --- |
| `index.html` | 453 B | `b24b2780aaa1358cf9fe10fbbbf721a92953ad98659631891fc73d0e8294e7e0` |
| `assets/index-CVLCUZdC.css` | 32,438 B | `c676fc0cd831594a812f4569df56497a0ca045bbde1993d1b42c2e7214f4d9d2` |
| `assets/index-Dm-7PBzL.js` | 2,503,291 B | `a57ca15fc586d25771fb126adc9795351b106cc14e04035b15626fb2f1c3b781` |

`recovery/extract_v0_3_0.py` reproduces the extraction from the reference setup and writes the recovered frontend to `desktop-current/dist/`.

## Confirmed cross-app bug

The v0.3.0 JavaScript bundle contains exactly one application signaling endpoint:

```text
https://lunirascreen.onrender.com
```

The current production site/backend is:

```text
https://lunirascreen.onrender.com
```

The recovery script refuses to patch unless the legacy endpoint occurs exactly once, then replaces it with the canonical endpoint. This prevents a blind/global binary patch.

The backend branch also explicitly permits the Tauri local origins `http://tauri.localhost`, `https://tauri.localhost` and `tauri://localhost` for Socket.IO/CORS.

## Rebuilding

Place the exact reference installer at:

`desktop-current/input/Lunira Screen_0.3.0_x64-setup.exe`

Then:

```powershell
cd desktop-current
py -m pip install -r recovery/requirements.txt
npm install
npm run recover
npm run tauri -- build
```

The recovered project is an engineering reconstruction from the shipped v0.3.0 binary, not a claim that the original unpublished Rust/React source was recovered byte-for-byte.
