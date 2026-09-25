# Lunira Screen Android

Aplicativo Android do Lunira Screen, empacotado com Capacitor e usando o mesmo frontend React, signaling Socket.IO, Agora e LiveKit do projeto principal.

## Estado da v0.1.0

Funcional nesta primeira versão:

- criar uma sala;
- entrar por código;
- assistir uma transmissão existente;
- presença e reconexão via Socket.IO;
- câmera via LiveKit/WebRTC;
- áudio colaborativo;
- UI própria para celular, portrait e landscape;
- safe areas/notch;
- build de APK debug pelo GitHub Actions.

Ainda não implementado:

- captura nativa da própria tela do Android.

O frontend web usa `getDisplayMedia()`, que não é uma base confiável para captura dentro do WebView Android. A próxima etapa é adicionar um bridge nativo com `MediaProjection` e publicar essa faixa pelo LiveKit.

## Estrutura

```text
android-app/
  capacitor.config.ts
  package.json
  tools/
    build-web.mjs
    init-android.mjs
```

O projeto Gradle em `android-app/android/` é gerado pelo Capacitor e fica fora do Git. Isso mantém a pasta Android pequena e reproduzível.

## Build local

Requisitos:

- Node.js 20+;
- JDK 21;
- Android SDK.

Na raiz do repositório:

```bash
npm install
npm install --prefix android-app
npm --prefix android-app run prepare:web
npm --prefix android-app run android:init
npm --prefix android-app run android:sync
```

Depois:

Linux/macOS:

```bash
cd android-app/android
./gradlew assembleDebug
```

Windows:

```powershell
cd android-app/android
.\gradlew.bat assembleDebug
```

APK gerado:

```text
android-app/android/app/build/outputs/apk/debug/app-debug.apk
```

## Backend

Por padrão o build Android conecta ao signaling de produção:

```text
https://lunirascreen.onrender.com
```

Para usar outro endpoint:

```bash
LUNIRA_SIGNALING_URL=https://seu-servidor.example npm --prefix android-app run prepare:web
```

## Próxima etapa

A v0.2.0 deve implementar captura de tela nativa com Android `MediaProjection`, foreground service e publicação pelo LiveKit, mantendo Agora como rota principal do desktop/web.
