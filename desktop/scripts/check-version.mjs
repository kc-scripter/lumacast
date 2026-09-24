import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,"..");
const pkg=JSON.parse(readFileSync(resolve(root,"package.json"),"utf8"));
const tauri=JSON.parse(readFileSync(resolve(root,"src-tauri","tauri.conf.json"),"utf8"));
const cargo=readFileSync(resolve(root,"src-tauri","Cargo.toml"),"utf8");
const cargoVersion=/^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];

if(pkg.version!==tauri.version||pkg.version!==cargoVersion){
  throw new Error("Versões divergentes: package="+pkg.version+", tauri="+tauri.version+", cargo="+cargoVersion);
}
console.log("Versão desktop consistente: v"+pkg.version);
