# Lunira Screen para Windows

O cliente desktop usa Electron/Chromium e conecta **ao mesmo site e ao mesmo backend** da versão web. Não existem salas separadas para o aplicativo: códigos, participantes, Agora, LiveKit e Socket.IO continuam sendo os mesmos.

## Por que essa arquitetura

- mantém compatibilidade imediata entre app e navegador;
- evita duplicar a lógica de sala/transmissão;
- atualizações da interface web chegam ao app sem precisar recriar todo o cliente;
- no Windows, o Electron controla a seleção de tela/janela e pode fornecer áudio de sistema por loopback;
- o renderer continua sem Node.js (`contextIsolation`, `sandbox` e `nodeIntegration: false`).

## Desenvolvimento

Com a versão web rodando em `http://localhost:5173`:

```powershell
cd desktop
npm install
npm start
```

Para testar apontando para um deploy:

```powershell
$env:LUNIRA_WEB_URL="https://seu-dominio.com"
npm start
```

Também é possível usar:

```powershell
npm start -- --app-url=https://seu-dominio.com
```

## Gerar instalador Windows

A URL do site é gravada no `config.json` do pacote durante o build:

```powershell
cd desktop
npm install
$env:LUNIRA_WEB_URL="https://seu-dominio.com"
npm run dist
```

O instalador NSIS é gerado em `desktop/release/`.

Para gerar uma versão portátil:

```powershell
$env:LUNIRA_WEB_URL="https://seu-dominio.com"
npm run dist:portable
```

## Compatibilidade com salas web

Exemplo:

1. Usuário A abre o aplicativo Windows e cria `ABCD2345`.
2. Usuário B abre a URL web e entra com `ABCD2345`.
3. Ambos entram na mesma sala porque o aplicativo usa exatamente o mesmo signaling.
4. O inverso também funciona: uma sala criada no navegador pode ser acessada pelo app.

Opcionalmente o executável aceita `--room=ABCD2345` para abrir diretamente uma sala.

## Captura no Windows

Quando a página chama `navigator.mediaDevices.getDisplayMedia()`, o processo principal do Electron:

1. verifica que a solicitação veio da origem configurada do Lunira Screen;
2. enumera telas e janelas via `desktopCapturer`;
3. mostra o seletor próprio do aplicativo;
4. entrega a fonte escolhida ao Chromium;
5. quando o site pediu áudio, habilita loopback do sistema no Windows.

O restante do pipeline permanece o mesmo do site (Agora principal + LiveKit para áudio/câmera/fallback).


## Build automático no GitHub

O workflow `.github/workflows/windows-desktop.yml` gera o instalador em um runner Windows.

Para releases automáticas, configure uma variável do repositório:

```text
Settings > Secrets and variables > Actions > Variables
LUNIRA_WEB_URL=https://seu-dominio.com
```

Depois publique uma GitHub Release usando uma tag semântica, por exemplo `v1.2.0`. O workflow:

1. usa a versão da tag no instalador;
2. instala as dependências do desktop;
3. gera o instalador NSIS x64;
4. salva o `.exe` como artifact da execução;
5. anexa o `.exe` à própria GitHub Release.

Também é possível executar o workflow manualmente em **Actions > Windows Desktop > Run workflow**, informando a URL pública e a versão.

### Assinatura

O build atual não possui certificado de code signing. O executável funciona, mas o Windows SmartScreen pode exibir um aviso de editor desconhecido. Para distribuição pública sem esse aviso, será necessário adicionar um certificado de assinatura de código ao pipeline.
