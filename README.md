# LumaCast

Transmissão de tela em tempo real no navegador com WebRTC. O servidor coordena a sala e o signaling; áudio e vídeo trafegam diretamente entre o transmissor e cada espectador.

## Requisitos

- Node.js 20 ou superior
- Um navegador atual com suporte a `getDisplayMedia` e WebRTC
- HTTPS em produção (localhost é aceito durante o desenvolvimento)

## Instalação e execução

```bash
cp .env.example .env
npm install
npm run dev
```

O cliente abre em `http://localhost:5173` e o servidor de signaling em `http://localhost:3001`. O comando raiz inicia os dois processos.

Para gerar e executar a versão de produção:

```bash
npm run build
npm start
```

## Arquitetura

```text
client/
  src/components/    interface reutilizável
  src/pages/         início, transmissor e espectador
  src/services/      Socket.IO e WebRTC
server/
  src/server.ts      Express, HTTP e arquivos estáticos
  src/signaling.ts   eventos Socket.IO e validação de papéis
  src/rooms.ts       salas efêmeras em memória
```

Ao criar uma sala, o servidor gera um código com `crypto.randomBytes` e um token secreto para o transmissor. Um espectador entra com o código; o servidor avisa o transmissor, que cria uma `RTCPeerConnection` exclusiva, adiciona as tracks e envia uma offer. O espectador responde com uma answer e ambos trocam ICE candidates. A implementação mantém um `Map<viewerSocketId, RTCPeerConnection>`, por isso a saída de um espectador fecha somente a conexão dele.

As salas existem apenas em memória. O vídeo não é enviado, gravado ou armazenado pelo servidor. Se o transmissor perder o WebSocket, ele pode recuperar a sala por 30 segundos com o token guardado na sessão do navegador.

## Teste com dois computadores

1. Hospede cliente e servidor em um domínio HTTPS acessível pelos dois computadores.
2. No primeiro, clique em **Transmitir tela**, escolha qualidade e FPS e depois clique em **Iniciar transmissão**.
3. Autorize a janela, aba ou monitor na caixa nativa do navegador.
4. Copie o link da sala e abra no segundo computador.
5. Para testar mais espectadores, abra o mesmo link em outros dispositivos ou perfis do navegador.

Em redes diferentes, um servidor TURN é fortemente recomendado. Sem TURN, NATs ou firewalls restritivos podem impedir a conexão P2P mesmo quando o signaling funciona.

## STUN e TURN

O padrão usa `stun:stun.l.google.com:19302`. Configure produção no build do frontend:

```env
VITE_STUN_URL=stun:seu-stun.example.com:3478
VITE_TURN_URL=turn:seu-turn.example.com:3478
VITE_TURN_USERNAME=usuario
VITE_TURN_CREDENTIAL=segredo
```

Credenciais TURN incorporadas no bundle são visíveis ao navegador. Para um produto público, prefira credenciais temporárias emitidas por um serviço autenticado.

## Deploy

O frontend pode ser hospedado como site estático usando a pasta `dist`. O backend precisa de um serviço Node.js com conexões WebSocket persistentes. Defina `VITE_SIGNALING_URL` com a URL HTTPS pública do backend antes do build, e configure no servidor:

```env
PORT=3001
PUBLIC_URL=https://app.example.com
CLIENT_ORIGIN=https://app.example.com
```

Use HTTPS/WSS em produção: `getDisplayMedia`, permissões de captura e várias APIs WebRTC exigem contexto seguro. Configure proxy reverso com suporte a upgrade de WebSocket para `/socket.io`.

## Segurança e limites

- IDs são validados, cada sala aceita um único transmissor e eventos sensíveis conferem o papel do socket.
- Há rate limiting HTTP e limitação básica por IP para eventos de signaling.
- O modelo P2P consome upload do transmissor uma vez por espectador. Para audiências grandes, use uma SFU como mediasoup, LiveKit ou Janus.
- Salas estão em memória; para várias instâncias do backend, use um adapter Socket.IO compartilhado e um armazenamento distribuído de presença.
- A qualidade real depende do navegador, da rede, do conteúdo compartilhado e das constraints aceitas pelo dispositivo.
