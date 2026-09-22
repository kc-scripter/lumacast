const fs = require("node:fs");
const path = require("node:path");

const raw = process.env.LUNIRA_WEB_URL?.trim();
if (!raw) {
  console.error("Defina LUNIRA_WEB_URL antes de gerar o instalador. Exemplo:");
  console.error('$env:LUNIRA_WEB_URL="https://seu-dominio.com"; npm run dist');
  process.exit(1);
}

let url;
try {
  url = new URL(raw);
} catch {
  console.error("LUNIRA_WEB_URL não é uma URL válida.");
  process.exit(1);
}

const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) {
  console.error("LUNIRA_WEB_URL deve usar HTTPS em produção.");
  process.exit(1);
}

url.hash = "";
fs.writeFileSync(
  path.join(__dirname, "..", "config.json"),
  JSON.stringify({ webUrl: url.href }, null, 2) + "\n",
  "utf8"
);
console.log(`Desktop configurado para ${url.origin}`);
