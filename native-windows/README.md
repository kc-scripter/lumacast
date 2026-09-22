# LuniraScreen — Windows nativo

Cliente Windows novo, desenvolvido separadamente da interface web.

## Recursos

- visual baseado diretamente na sala atual do site;
- transmissão como elemento principal;
- dock de câmeras logo abaixo da transmissão;
- sala privada + código de convite;
- qualidade 1080p / 30–60 FPS;
- compartilhamento nativo de monitor ou janela via Agora;
- câmeras e áudio do sistema via LiveKit;
- captura de áudio WASAPI loopback, sem publicar microfone;
- controles de câmera, compartilhamento, áudio da tela e estatísticas;
- página de ajustes mínima;
- hover e controles sem animações contínuas.

## Tecnologia

- C++20;
- Win32;
- Direct2D;
- DirectWrite;
- Agora Windows SDK 4.6.2;
- LiveKit C++ SDK.

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

O diretório Release também contém somente as DLLs do Agora e LiveKit necessárias
para executar o aplicativo. O workflow `Native Windows App` publica esse conjunto
como o artefato `LuniraScreen-Native`.


## Atualização automática

O cliente Windows verifica o GitHub Releases ao iniciar e também oferece Verificar atualizações em Ajustes. Quando uma versão mais nova existe:

1. baixa LuniraScreen-Native.zip;
2. baixa e valida LuniraScreen-Native.sha256;
3. verifica SHA-256 localmente;
4. inicia LuniraUpdater.exe;
5. fecha o aplicativo, substitui os arquivos com rollback básico em caso de falha;
6. abre o LuniraScreen novamente.

As releases do app nativo são geradas pelo workflow Native Windows Release. O número de versão é compilado em LUNIRA_APP_VERSION.
