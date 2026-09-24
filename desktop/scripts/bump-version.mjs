import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"..");
const packagePath=resolve(root,"package.json");
const tauriPath=resolve(root,"src-tauri","tauri.conf.json");
const cargoPath=resolve(root,"src-tauri","Cargo.toml");

const pkg=JSON.parse(readFileSync(packagePath,"utf8"));
const match=/^(\d+)\.(\d+)\.(\d+)$/.exec(pkg.version);
if(!match)throw new Error("Versão inválida em package.json: "+pkg.version);

const next=[Number(match[1]),Number(match[2]),Number(match[3])+1].join(".");
pkg.version=next;
writeFileSync(packagePath,JSON.stringify(pkg,null,2)+"\n");

const tauri=JSON.parse(readFileSync(tauriPath,"utf8"));
tauri.version=next;
writeFileSync(tauriPath,JSON.stringify(tauri,null,2)+"\n");

const cargo=readFileSync(cargoPath,"utf8");
writeFileSync(cargoPath,cargo.replace(/(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m,"$1"+next+"$2"));

console.log("Lunira Screen Desktop -> v"+next);
