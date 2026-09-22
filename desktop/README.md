# Lunira Screen para Windows

O cliente Windows usa **WinForms + Microsoft Edge WebView2**. Ele continua sendo apenas outro cliente das mesmas salas da versão web: mesmo Socket.IO, Agora e LiveKit.

## O que mudou nesta versão

A implementação anterior em Electron era pesada porque carregava um Chromium inteiro. A primeira tentativa em WPF/WebView2 ficou leve, mas podia encerrar antes de exibir qualquer erro e não garantia a presença do WebView2 Runtime.

A implementação atual corrige os dois pontos:

- sem Electron;
- sem XAML no startup;
- entrada WinForms protegida por tratamento global de exceções;
- verificação explícita do WebView2 Runtime;
- instalador inclui o **Evergreen Bootstrapper oficial da Microsoft** e instala o Runtime automaticamente quando necessário;
- validação dos assemblies e do `WebView2Loader.dll` antes de gerar o instalador;
- URL padrão real: `https://lumacast-live-kc.onrender.com/`;
- tela de loading/erro com retry em vez de janela preta ou encerramento silencioso;
- a imagem fornecida do Lunira Screen é a fonte do ícone do executável e do instalador.

## Build

Requisitos do ambiente de build:

- Windows;
- .NET SDK 8 para compilar o projeto `net48`;
- .NET Framework 4.8 targeting pack;
- Inno Setup 6.

```powershell
cd desktop
.\scripts\build.ps1 -Version 1.0.0 -WebUrl "https://lumacast-live-kc.onrender.com/"
```

O script baixa o bootstrapper oficial do WebView2, gera o ícone, verifica os arquivos obrigatórios do runtime e cria:

```text
desktop/release/Lunira-Screen-1.0.0-x64.exe
```

## Compatibilidade web

Uma sala criada no aplicativo pode ser acessada pelo navegador usando o mesmo código, e o contrário também funciona. Não existe backend separado para o app.

O compartilhamento continua sendo iniciado pelo `navigator.mediaDevices.getDisplayMedia()` do frontend, usando o motor Chromium do WebView2.
