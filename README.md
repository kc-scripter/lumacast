# Lunira Screen

Transmissão de tela em tempo real no navegador com WebRTC. O vídeo da tela usa Agora como rota principal; câmeras, áudio colaborativo e fallback usam LiveKit.

## Requisitos

- Node.js 20 ou superior
- Navegador atual com WebRTC
- HTTPS/WSS em produção
- Credenciais Agora e LiveKit válidas

## Instalação e desenvolvimento

```bash
cp .env.example .env
npm install
npm run dev
```

O cliente abre em `http://localhost:5173` e o signaling em `http://localhost:3001`.

## Build e execução de produção

```bash
npm run release:check
npm start
```

`server/dist` é artefato gerado e **não é versionado**. Sempre faça o build antes de iniciar a versão de produção. Isso evita executar JavaScript compilado de uma versão antiga do servidor.

## Arquitetura

```text
client/
  src/components/    UI reutilizável
  src/pages/         início, termos, como funciona, transmissor e espectador
  src/services/      Socket.IO, Agora, LiveKit e utilidades do navegador
server/
  src/server.ts      Express, headers, health check e arquivos estáticos
  src/signaling.ts   eventos Socket.IO, presença e autorização
  src/rooms.ts       estado das salas e tokens de retomada
  src/roomPersistence.ts
                     persistência opcional via Redis REST
```

Ao criar uma sala, o servidor gera um código criptograficamente aleatório e tokens RTC temporários. O vídeo da tela é publicado pelo Agora. Câmeras e áudio usam LiveKit; se a rota principal da tela falhar, o vídeo pode migrar para o LiveKit. O Socket.IO mantém presença, contador, lock da tela, reconexão e renovação de credenciais.

Sem Redis configurado, as salas vivem em memória. Com `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`, o estado mínimo de retomada é persistido temporariamente. Tokens de retomada são armazenados somente como hash.

## Variáveis de ambiente

```env
PORT=3001
PUBLIC_URL=https://app.example.com
CLIENT_ORIGIN=https://app.example.com
VITE_SIGNALING_URL=https://api.example.com

AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...

LIVEKIT_URL=wss://seu-projeto.livekit.cloud
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ROOM_REDIS_TTL_SECONDS=7200

TRUST_PROXY_HOPS=0
MAX_ROOM_PARTICIPANTS=50
```

`MAX_ROOM_PARTICIPANTS` conta participantes além do dono da sala e pode ser ajustado entre 1 e 500.

Se o backend estiver atrás de um reverse proxy confiável, configure `TRUST_PROXY_HOPS` com a quantidade de proxies entre o usuário e o Node. Para um único proxy, use `1`. Não habilite isso em um backend exposto diretamente sem entender a cadeia de proxy, pois o IP encaminhado passa a ser usado no rate limit.

`CLIENT_ORIGIN` aceita uma lista separada por vírgulas quando mais de uma origem web precisa acessar o signaling.

## Health check

`GET /api/health` retorna HTTP 200 somente quando a configuração RTC mínima está presente. Credenciais ausentes ou formato inválido resultam em HTTP 503 e uma lista apenas com os nomes das variáveis problemáticas — nunca os valores secretos.

Use esse endpoint como readiness/health check do serviço em produção.

## Teste com dois computadores

1. Faça deploy do frontend e backend em HTTPS.
2. No primeiro computador, crie uma sala e inicie o compartilhamento.
3. Teste 1080p/720p e 30/60 FPS.
4. Ligue a câmera e alterne entre 720p40 e 480p60 com ela ativa.
5. Entre pelo segundo computador usando o código/link.
6. Derrube a rede por alguns segundos e confirme a reconexão.
7. Teste Chrome/Edge e Firefox; no celular, valide entrada na sala, câmera quando suportada e rotação de tela.

## Deploy

O frontend é gerado em `dist`. O backend precisa de um serviço Node.js com WebSocket persistente.

Se frontend e backend forem servidos pelo mesmo Node, `VITE_SIGNALING_URL` pode ser omitida para usar a própria origem. Se forem separados, ela deve apontar para a URL HTTPS pública do signaling no momento do build.

O proxy reverso precisa permitir upgrade de WebSocket para `/socket.io`.

## Segurança e limites

- CORS e handshake Socket.IO validam a origem configurada.
- Payloads de signaling são limitados e eventos sensíveis possuem rate limit.
- Tokens de retomada persistidos são hash-only e comparados de forma timing-safe.
- App ID/certificado Agora e chaves LiveKit ficam apenas no servidor.
- O código da sala não é uma credencial secreta; permissões de publicação dependem do socket e de tokens RTC emitidos pelo backend.
- O Lunira Screen não possui gravação própria da transmissão.
- O limite padrão é de 50 participantes por sala, configurável por ambiente.
- O CI executa TypeScript, audit de dependências, build, smoke test, teste de segurança e load test.

## Comandos úteis

```bash
npm run typecheck
npm audit --omit=dev --audit-level=high
npm run build
npm run test:signal
npm run test:security
npm run test:load -- --rooms 3 --users 30
npm run release:check
```


## Aplicativo Windows

O cliente Windows fica em `desktop/` e usa **Microsoft Edge WebView2** para manter o mesmo frontend e o mesmo protocolo da versão web sem empacotar um Chromium inteiro.

Salas criadas no aplicativo e no navegador são as mesmas: Socket.IO, Agora e LiveKit continuam usando o backend público do Lunira Screen.

Por padrão, o build atual aponta para:

```text
https://lumacast-live-kc.onrender.com/
```

O app possui tela de carregamento e tela de erro com retry; falhas de rede não ficam mais presas em uma janela preta.

Para gerar o instalador no Windows:

```powershell
cd desktop
.\scripts\build.ps1 -Version 1.0.0 -WebUrl "https://lumacast-live-kc.onrender.com/"
```

O instalador é gerado em `desktop/release/`. O workflow **Windows Desktop Check** também faz um build real em `windows-latest` e publica o `.exe` como artifact do PR.

Consulte `desktop/README.md` para detalhes.
