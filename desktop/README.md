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
