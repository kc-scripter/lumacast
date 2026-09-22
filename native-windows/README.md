# LuniraScreen — Windows nativo

Cliente Windows novo, desenvolvido separadamente da interface web.

## Etapa 1 — shell visual da sala

Esta etapa contém apenas a interface local para validar design e peso antes de conectar rede/media:

- visual baseado diretamente na sala atual do site;
- transmissão como elemento principal;
- dock de câmeras logo abaixo da transmissão;
- três câmeras de demonstração;
- sala privada + código de convite;
- qualidade 1080p / 30–60 FPS;
- controles de câmera, compartilhamento, áudio da tela e estatísticas;
- página de ajustes mínima;
- hover e controles sem animações contínuas.

Nenhum backend, Agora, LiveKit ou captura real foi conectado ainda.

## Tecnologia

- C++20;
- Win32;
- Direct2D;
- DirectWrite;
- somente bibliotecas do Windows.

Não usa Electron, Chromium, WebView ou .NET.

## Build

```powershell
cmake -S native-windows -B native-windows/build -A x64
cmake --build native-windows/build --config Release
```

Saída:

```text
native-windows/build/Release/LuniraScreen.exe
```
