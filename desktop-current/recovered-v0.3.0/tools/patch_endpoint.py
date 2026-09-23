from pathlib import Path
import argparse
OLD="https://lunirascreen.onrender.com"
NEW="https://lunira-screen.onrender.com"
ap=argparse.ArgumentParser(); ap.add_argument('js',type=Path); a=ap.parse_args()
s=a.js.read_text(encoding='utf-8')
n=s.count(OLD)
if n != 1: raise SystemExit(f'Expected exactly one legacy endpoint, found {n}')
s=s.replace(OLD,NEW)
if OLD in s or s.count(NEW)<1: raise SystemExit('Endpoint verification failed')
a.js.write_text(s,encoding='utf-8')
print(f'Patched {OLD} -> {NEW}')