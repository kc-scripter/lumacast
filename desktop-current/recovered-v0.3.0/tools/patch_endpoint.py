from pathlib import Path
import argparse
OLD="https://lunira-screen.onrender.com"
NEW="https://lunirascreen.onrender.com"
ap=argparse.ArgumentParser(); ap.add_argument('js',type=Path); a=ap.parse_args()
s=a.js.read_text(encoding='utf-8')
s=s.replace(OLD,NEW)
if OLD in s or s.count(NEW)<1: raise SystemExit('Production endpoint verification failed')
a.js.write_text(s,encoding='utf-8')
print(f'Patched {OLD} -> {NEW}')
