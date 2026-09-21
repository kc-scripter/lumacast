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

Ao criar uma sala, o servidor gera um código com `crypto.randomBytes`, cria uma sala Daily privada e emite tokens temporários com permissões distintas. O transmissor pode publicar apenas tela e áudio; espectadores são somente leitura. A mídia passa pelo SFU do Daily, enquanto o Socket.IO mantém apenas presença, contador e estado da transmissão.

As salas existem apenas em memória. O vídeo não é enviado, gravado ou armazenado pelo servidor. Se o transmissor perder o WebSocket, ele pode recuperar a sala por 30 segundos com o token guardado na sessão do navegador.

## Teste com dois computadores

1. Hospede cliente e servidor em um domínio HTTPS acessível pelos dois computadores.
2. No primeiro, clique em **Transmitir tela**, escolha qualidade e FPS e depois clique em **Iniciar transmissão**.
3. Autorize a janela, aba ou monitor na caixa nativa do navegador.
4. Copie o link da sala e abra no segundo computador.
5. Para testar mais espectadores, abra o mesmo link em outros dispositivos ou perfis do navegador.

## Deploy

O frontend pode ser hospedado como site estático usando a pasta `dist`. O backend precisa de um serviço Node.js com conexões WebSocket persistentes. Defina `VITE_SIGNALING_URL` com a URL HTTPS pública do backend antes do build, e configure no servidor:

```env
PORT=3001
PUBLIC_URL=https://app.example.com
CLIENT_ORIGIN=https://app.example.com
DAILY_API_KEY=seu-token-secreto
```

Use HTTPS/WSS em produção: `getDisplayMedia`, permissões de captura e várias APIs WebRTC exigem contexto seguro. Configure proxy reverso com suporte a upgrade de WebSocket para `/socket.io`.

## Segurança e limites

- IDs são validados, cada sala aceita um único transmissor e eventos sensíveis conferem o papel do socket.
- Há rate limiting HTTP e limitação básica por IP para eventos de signaling.
- A chave do Daily existe somente no backend; navegadores recebem tokens privados temporários e limitados por função.
- A mídia é distribuída pelo SFU do Daily, sem multiplicar o upload do transmissor por espectador.
- Salas estão em memória; para várias instâncias do backend, use um adapter Socket.IO compartilhado e um armazenamento distribuído de presença.
- A qualidade real depende do navegador, da rede, do conteúdo compartilhado e das constraints aceitas pelo dispositivo.
