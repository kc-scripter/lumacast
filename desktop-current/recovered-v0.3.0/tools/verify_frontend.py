from pathlib import Path
import argparse
ap=argparse.ArgumentParser(); ap.add_argument('dir',type=Path); a=ap.parse_args()
js=next((a.dir/'assets').glob('index-*.js')).read_text(encoding='utf-8')
checks={
 'canonical_signaling': 'https://lunira-screen.onrender.com' in js,
 'legacy_signaling_absent': 'https://lunirascreen.onrender.com' not in js,
 'create_room': 'create-room' in js,
 'join_room': 'join-room' in js,
 'reclaim_room': 'reclaim-room' in js,
 'agora': 'renew-agora-token' in js and 'request-screen-share' in js,
 'livekit': 'get-livekit-token' in js,
 'tauri_autostart': 'plugin:autostart|is_enabled' in js,
}
for k,v in checks.items(): print(f'{k}: {"OK" if v else "FAIL"}')
if not all(checks.values()): raise SystemExit(1)