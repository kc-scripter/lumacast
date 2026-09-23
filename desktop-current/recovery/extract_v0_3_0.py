#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, lzma, struct
from pathlib import Path

SETUP_SHA256="38914bdbd022735cf2aecc3b34910c122ede68accd049276282df6ba5faaa8e5"
EXE_SHA256="576b6adc32ed9e012870c934847163490782984f3c7a266325c2038c1c39596a"
OLD_SIGNALING="https://lunirascreen.onrender.com"
CURRENT_SIGNALING="https://lunira-screen.onrender.com"
EXE_DATA_OFFSET=111_514
EXE_SIZE=9_284_608
ASSETS={
    "assets/index-CVLCUZdC.css":(6_277_266,6_284_871),
    "index.html":(6_284_882,6_285_083),
    "assets/index-Dm-7PBzL.js":(6_285_108,6_855_981),
}

def sha256(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def extract_exe(setup:bytes)->bytes:
    magic=setup.find(b"NullsoftInst")
    if magic<8:
        raise RuntimeError("NSIS header not found")
    first_header=magic-8
    _flags,sig,signature,header_u_size,_compressed=struct.unpack_from("<II12sII",setup,first_header)
    if sig!=0xDEADBEEF or signature!=b"NullsoftInst":
        raise RuntimeError("Unexpected NSIS first header")
    data_offset=first_header+28
    props=setup[data_offset:data_offset+5]
    filters=lzma._decode_filter_properties(lzma.FILTER_LZMA1,props)
    solid=lzma.decompress(setup[data_offset+5:],format=lzma.FORMAT_RAW,filters=[filters])
    header_size=struct.unpack_from("<I",solid,0)[0]
    if header_size!=header_u_size:
        raise RuntimeError(f"NSIS header size mismatch: {header_size} != {header_u_size}")
    data_base=4+header_size+4
    exe=solid[data_base+EXE_DATA_OFFSET:data_base+EXE_DATA_OFFSET+EXE_SIZE]
    if len(exe)!=EXE_SIZE or sha256(exe)!=EXE_SHA256:
        raise RuntimeError("Recovered lunira-screen.exe failed integrity check")
    return exe

def recover_assets(exe:bytes,out:Path,patch:bool)->dict:
    try:
        import brotli
    except ImportError as exc:
        raise RuntimeError("Install recovery dependency first: pip install -r recovery/requirements.txt") from exc
    manifest={}
    for name,(start,end) in ASSETS.items():
        raw=brotli.decompress(exe[start:end])
        if name.endswith(".js") and patch:
            text=raw.decode("utf-8")
            count=text.count(OLD_SIGNALING)
            if count!=1:
                raise RuntimeError(f"Expected exactly one legacy signaling URL, found {count}")
            text=text.replace(OLD_SIGNALING,CURRENT_SIGNALING)
            raw=text.encode("utf-8")
        target=out/name
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(raw)
        manifest[name]={"size":len(raw),"sha256":sha256(raw)}
    return manifest

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("setup",type=Path)
    ap.add_argument("--out",type=Path,default=Path(__file__).resolve().parents[1]/"dist")
    ap.add_argument("--no-patch",action="store_true")
    args=ap.parse_args()
    setup=args.setup.read_bytes()
    if sha256(setup)!=SETUP_SHA256:
        raise SystemExit("Refusing to recover: setup SHA-256 does not match Lunira Screen v0.3.0 reference build")
    exe=extract_exe(setup)
    args.out.mkdir(parents=True,exist_ok=True)
    manifest=recover_assets(exe,args.out,not args.no_patch)
    report={"setup_sha256":SETUP_SHA256,"exe_sha256":EXE_SHA256,"signaling":CURRENT_SIGNALING if not args.no_patch else OLD_SIGNALING,"assets":manifest}
    (args.out/"recovery-manifest.json").write_text(json.dumps(report,indent=2),encoding="utf-8")
    print(json.dumps(report,indent=2))

if __name__=="__main__":
    main()
