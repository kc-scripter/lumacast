# Lunira Screen para Windows

O cliente Windows usa **Microsoft Edge WebView2**, em vez de empacotar um Chromium inteiro com Electron.

Isso mantém o app compatível com a versão web — mesmas salas, mesmo Socket.IO, Agora e LiveKit — mas reduz drasticamente o tamanho do instalador.

## URL usada pelo app

Por padrão:

```text
https://lumacast-live-kc.onrender.com/
```

A URL pode ser substituída no build pela variável `LUNIRA_WEB_URL`, ou em desenvolvimento por:

```powershell
LuniraScreen.exe --app-url=http://localhost:5173
```

Se a página não carregar, o aplicativo mostra um erro com **Tentar novamente** e **Abrir no navegador** em vez de ficar em uma tela preta.

## Captura de tela

O WebView2 usa Chromium/Edge e suporta `getDisplayMedia()`. O seletor de compartilhamento é o do próprio WebView2/Windows. Câmera e microfone são permitidos somente para a origem configurada do Lunira Screen.

## Build local

Requisitos:

- Windows 10/11 x64
- .NET Framework 4.8 targeting pack
- Inno Setup 6
- Microsoft Edge WebView2 Runtime

```powershell
cd desktop
.\scripts\build.ps1 -Version 1.0.0 -WebUrl "https://lumacast-live-kc.onrender.com/"
```

O instalador sai em:

```text
desktop/release/Lunira-Screen-1.0.0-x64.exe
```

## GitHub Actions

O PR executa um build real em `windows-latest` e publica o instalador como artifact.

Em releases, a tag define a versão do app. Exemplo:

```text
v1.2.0 -> Lunira-Screen-1.2.0-x64.exe
```

A variável opcional de repositório `LUNIRA_WEB_URL` pode apontar o app para um domínio novo sem alterar o código.

## Peso

O WebView2 Runtime não é incluído dentro do instalador. Windows 11 e instalações modernas do Edge normalmente já possuem o runtime. Por isso o pacote fica muito menor que a versão Electron, que precisava levar Chromium junto.
