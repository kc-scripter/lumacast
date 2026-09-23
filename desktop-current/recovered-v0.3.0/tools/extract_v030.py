from __future__ import annotations
from pathlib import Path
import argparse, brotli, hashlib, json, lzma, re, struct

EXPECTED_SETUP_SHA256 = "38914bdbd022735cf2aecc3b34910c122ede68accd049276282df6ba5faaa8e5"
NSIS_MAGIC = b"NullsoftInst"

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def pe_overlay_offset(data: bytes) -> int:
    pe = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe:pe+4] != b"PE\0\0": raise ValueError("PE signature not found")
    coff = pe + 4
    nsec = struct.unpack_from("<H", data, coff + 2)[0]
    opt_size = struct.unpack_from("<H", data, coff + 16)[0]
    sect = coff + 20 + opt_size
    end = 0
    for i in range(nsec):
        o = sect + i * 40
        raw_size = struct.unpack_from("<I", data, o + 16)[0]
        raw_ptr = struct.unpack_from("<I", data, o + 20)[0]
        end = max(end, raw_ptr + raw_size)
    return end

def decompress_nsis_solid(setup: bytes) -> bytes:
    off = pe_overlay_offset(setup)
    ov = setup[off:]
    if struct.unpack_from("<I", ov, 4)[0] != 0xDEADBEEF or ov[8:20] != NSIS_MAGIC:
        raise ValueError("Not the expected NSIS first header")
    data = ov[28:]
    prop = data[0]; dict_size = struct.unpack_from("<I", data, 1)[0]
    lc = prop % 9; rem = prop // 9; lp = rem % 5; pb = rem // 5
    filters = [{"id": lzma.FILTER_LZMA1, "dict_size": dict_size, "lc": lc, "lp": lp, "pb": pb}]
    dec = lzma.LZMADecompressor(format=lzma.FORMAT_RAW, filters=filters)
    out = dec.decompress(data[5:])
    if not dec.eof: raise ValueError("NSIS solid LZMA stream did not finish")
    return out

def valid_pe(data: bytes, i: int):
    try:
        peoff = struct.unpack_from("<I", data, i + 0x3C)[0]
        if peoff < 0x40 or peoff > 0x2000 or data[i+peoff:i+peoff+4] != b"PE\0\0": return None
        coff = i + peoff + 4
        machine, nsec = struct.unpack_from("<HH", data, coff)
        opt_size = struct.unpack_from("<H", data, coff + 16)[0]
        opt = coff + 20
        magic = struct.unpack_from("<H", data, opt)[0]
        if magic not in (0x10B, 0x20B) or not (1 <= nsec <= 96): return None
        sect = opt + opt_size; end = 0
        for s in range(nsec):
            o = sect + s * 40
            raw_size = struct.unpack_from("<I", data, o + 16)[0]
            raw_ptr = struct.unpack_from("<I", data, o + 20)[0]
            if raw_ptr and raw_size: end = max(end, raw_ptr + raw_size)
        if end <= 0 or i + end > len(data): return None
        return machine, magic, end
    except Exception:
        return None

def extract_main_exe(solid: bytes) -> bytes:
    candidates=[]; pos=0
    while True:
        i=solid.find(b"MZ", pos)
        if i < 0: break
        pos=i+2
        meta=valid_pe(solid,i)
        if meta:
            machine,magic,size=meta
            if machine==0x8664 and magic==0x20B:
                candidates.append((size,i))
    if not candidates: raise ValueError("No x64 PE found in NSIS payload")
    size,i=max(candidates)
    return solid[i:i+size]

def brotli_stream(data: bytes, start: int) -> tuple[int, bytes]:
    # Find first block with trailing bytes, then replay bytewise only in that block.
    block=4096; dec=brotli.Decompressor(); out=bytearray(); pos=start; fail=None
    while pos < len(data):
        piece=data[pos:pos+block]
        try:
            out.extend(dec.process(piece)); pos += len(piece)
            if dec.is_finished(): return pos, bytes(out)
        except brotli.error:
            fail=pos; break
    if fail is None: raise ValueError("Brotli stream end not found")
    dec=brotli.Decompressor(); out=bytearray(); pos=start
    while pos < fail:
        piece=data[pos:min(pos+block,fail)]
        out.extend(dec.process(piece)); pos += len(piece)
    while pos < len(data):
        out.extend(dec.process(data[pos:pos+1])); pos += 1
        if dec.is_finished(): return pos, bytes(out)
    raise ValueError("Brotli stream did not finish")

def recover_frontend(exe: bytes, out: Path):
    css_match=re.search(rb"/assets/index-[A-Za-z0-9_-]+\.css", exe)
    js_match=re.search(rb"/assets/index-[A-Za-z0-9_-]+\.js", exe)
    if not css_match or not js_match: raise ValueError("Tauri asset keys not found")
    css_start=css_match.end(); css_end,css=brotli_stream(exe,css_start)
    # The asset map places /index.html immediately after the CSS stream.
    html_key=exe.find(b"/index.html", css_end-1, js_match.start())
    if html_key < 0: raise ValueError("index.html asset key not found")
    html_start=html_key+len(b"/index.html"); html_end,html=brotli_stream(exe,html_start)
    js_start=js_match.end(); js_end,js=brotli_stream(exe,js_start)
    (out/"assets").mkdir(parents=True,exist_ok=True)
    (out/"index.html").write_bytes(html)
    (out/"assets"/css_match.group().decode().split('/')[-1]).write_bytes(css)
    (out/"assets"/js_match.group().decode().split('/')[-1]).write_bytes(js)
    return {
        "html": {"key": "/index.html", "compressed_range": [html_start,html_end], "size": len(html), "sha256": sha256(html)},
        "css": {"key": css_match.group().decode(), "compressed_range": [css_start,css_end], "size": len(css), "sha256": sha256(css)},
        "js": {"key": js_match.group().decode(), "compressed_range": [js_start,js_end], "size": len(js), "sha256": sha256(js)},
    }

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("setup", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--allow-other-hash", action="store_true")
    a=ap.parse_args(); setup=a.setup.read_bytes(); digest=sha256(setup)
    if not a.allow_other_hash and digest != EXPECTED_SETUP_SHA256:
        raise SystemExit(f"Unexpected setup SHA-256: {digest}")
    a.out.mkdir(parents=True,exist_ok=True)
    solid=decompress_nsis_solid(setup)
    exe=extract_main_exe(solid)
    (a.out/"Lunira Screen.exe").write_bytes(exe)
    assets=recover_frontend(exe,a.out/"frontend")
    report={
      "source_setup": a.setup.name, "setup_sha256": digest, "setup_size": len(setup),
      "main_exe_sha256": sha256(exe), "main_exe_size": len(exe),
      "identified": {"framework":"Tauri", "tauri_version":"2.11.6", "version":"0.3.0", "identifier":"com.lunira.screen.desktop", "webview":"WebView2"},
      "assets": assets,
    }
    (a.out/"recovery-manifest.json").write_text(json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps(report,indent=2,ensure_ascii=False))
if __name__=="__main__": main()