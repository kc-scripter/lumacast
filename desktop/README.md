# Lunira Screen Desktop

Base atual do cliente desktop, criada a partir do main funcional do Lunira Screen.

## Fonte de verdade

O cliente web em client/ e o signaling em server/ definem o contrato real. O desktop reutiliza a mesma lógica RTC para manter compatibilidade Web ↔ Desktop sem inventar funções.

Recursos expostos:
- criar e entrar em salas;
- qualquer participante pode compartilhar quando a tela está livre;
- compartilhamento Auto / 720p / 1080p;
- 30 / 60 FPS;
- câmera 720p40 / 480p60;
- áudio da tela;
- participantes;
- estatísticas;
- reconexão;
- fallback Agora para LiveKit.

O desktop começa em Automático + 30 FPS para usar a infraestrutura de mídia de forma mais eficiente. O usuário pode selecionar 720p, 1080p e 60 FPS quando quiser.

## Desenvolvimento

Na raiz do repositório instale as dependências web uma vez com npm ci. Depois, dentro de desktop/, execute npm install e npm run tauri:dev.

## Build Windows

No Windows com Rust, WebView2 e toolchain C++ instalados, dentro de desktop/ execute npm run tauri:build.

O endpoint público padrão de signaling é https://lunira-screen.onrender.com. Segredos Agora/LiveKit permanecem exclusivamente no servidor.


## Versionamento do desktop

A versão atual é `0.1.4`.

Regra de release: cada atualização distribuível do app incrementa o último número da versão (`0.1.1` → `0.1.2` → `0.1.3`).

Use `npm run version:next` dentro de `desktop/` para atualizar em conjunto:
- `desktop/package.json`;
- `desktop/src-tauri/Cargo.toml`;
- `desktop/src-tauri/tauri.conf.json`.

O CI valida se as três versões são iguais. O artefato Windows recebe a versão no nome e, depois de um build bem-sucedido, os instaladores desktop antigos do GitHub Actions são apagados automaticamente, deixando somente o mais recente.


## Cold start do Render

O desktop chama `/api/wake` ao abrir para iniciar o Web Service Free do Render. Ele só considera o backend pronto depois de confirmar também a conexão Socket.IO. O endpoint de wake é propositalmente leve e não depende da configuração Agora/LiveKit.
