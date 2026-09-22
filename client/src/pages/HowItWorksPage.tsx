import {
  ArrowLeft,
  ArrowRight,
  Cast,
  Link2,
  LockKeyhole,
  MonitorPlay,
  RadioTower,
  RefreshCw,
  ShieldCheck,
  Signal,
  Sparkles,
  Users,
  Video,
  Volume2,
  Zap,
} from "lucide-react";
import { Logo } from "../components/Logo";

const steps=[
  {
    number:"01",
    icon:<Users/>,
    title:"Crie a sala",
    text:"Escolha seu nome e o LumaCast gera um código único de 8 caracteres. Não precisa criar conta.",
  },
  {
    number:"02",
    icon:<Link2/>,
    title:"Convide quem quiser",
    text:"Envie o link ou o código. Cada pessoa entra pelo navegador, escolhe um nome e aparece na lista da sala.",
  },
  {
    number:"03",
    icon:<MonitorPlay/>,
    title:"Escolha o que compartilhar",
    text:"Qualquer participante pode transmitir uma aba, janela ou monitor. Só uma tela fica ativa por vez.",
  },
  {
    number:"04",
    icon:<Cast/>,
    title:"Todo mundo recebe ao vivo",
    text:"A sala sincroniza automaticamente o estado da transmissão e entrega a mídia pelos servidores RTC.",
  },
];

export function HowItWorksPage(){
  return <main className="how-page how-v2">
    <header className="how-nav how-v2-nav">
      <Logo/>
      <div className="how-v2-nav-actions">
        <span className="how-v2-secure"><LockKeyhole/>Conexão protegida</span>
        <button type="button" className="how-back" onClick={()=>location.assign("/")}><ArrowLeft/>Voltar ao início</button>
      </div>
    </header>

    <section className="how-v2-hero">
      <div className="how-v2-hero-copy">
        <div className="how-v2-eyebrow"><Sparkles/> COMO FUNCIONA</div>
        <h1>Você compartilha.<br/><em>O LumaCast cuida do resto.</em></h1>
        <p>Crie uma sala, mande o código e comece quando quiser. Por trás da interface, o LumaCast separa tela, áudio, câmeras e estado da sala para manter tudo sincronizado em tempo real.</p>
        <div className="how-v2-hero-actions">
          <button type="button" className="how-v2-primary" onClick={()=>location.assign("/")}><MonitorPlay/>Criar uma sala<ArrowRight/></button>
          <span><ShieldCheck/>Sem instalação e sem cadastro</span>
        </div>
      </div>

      <div className="how-v2-live-card" aria-label="Fluxo visual de uma sessão LumaCast">
        <div className="how-v2-live-head">
          <div><i/><span>SESSÃO AO VIVO</span></div>
          <strong>RV7SZ533</strong>
        </div>
        <div className="how-v2-live-stage">
          <div className="how-v2-live-source">
            <span><MonitorPlay/></span>
            <div><small>ORIGEM</small><b>Sua tela</b><em>Aba, janela ou monitor</em></div>
          </div>
          <div className="how-v2-live-route" aria-hidden="true"><i/><i/><i/><b/></div>
          <div className="how-v2-live-core">
            <RadioTower/>
            <small>DISTRIBUIÇÃO</small>
            <b>Tempo real</b>
          </div>
          <div className="how-v2-live-route reverse" aria-hidden="true"><i/><i/><i/><b/></div>
          <div className="how-v2-live-viewers">
            <Users/>
            <div><small>SALA</small><b>Participantes</b><em>Recebem automaticamente</em></div>
          </div>
        </div>
        <div className="how-v2-live-foot">
          <span><Signal/><i/>Estado sincronizado</span>
          <span><Zap/>Baixa latência</span>
        </div>
      </div>
    </section>

    <section className="how-v2-section how-v2-steps">
      <div className="how-v2-section-heading">
        <div><span>01</span><small>NA PRÁTICA</small></div>
        <h2>Do código da sala até a tela aparecer.</h2>
        <p>O fluxo foi feito para exigir o mínimo de passos possível.</p>
      </div>
      <div className="how-v2-step-grid">
        {steps.map(step=><article key={step.number}>
          <div className="how-v2-step-top"><span>{step.icon}</span><b>{step.number}</b></div>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </article>)}
      </div>
    </section>

    <section className="how-v2-section how-v2-tech">
      <div className="how-v2-tech-copy">
        <div className="how-v2-section-heading compact">
          <div><span>02</span><small>POR BAIXO DA INTERFACE</small></div>
          <h2>A mídia não percorre um único caminho.</h2>
        </div>
        <p className="how-v2-tech-lede">O LumaCast usa serviços diferentes para cada parte da chamada. Isso permite tratar compartilhamento de tela, câmera, áudio e presença de forma independente.</p>

        <div className="how-v2-tech-list">
          <article><span><MonitorPlay/></span><div><b>Vídeo da tela → Agora</b><p>O compartilhamento de tela usa o SFU do Agora como rota principal, com ajuste de resolução, bitrate e 30 ou 60 FPS.</p></div></article>
          <article><span><Video/></span><div><b>Câmeras e áudio → LiveKit</b><p>As câmeras dos participantes e o áudio capturado da tela são publicados pelo LiveKit quando estão ativos.</p></div></article>
          <article><span><RefreshCw/></span><div><b>Fallback automático</b><p>Se a conexão de vídeo com o Agora cair durante a transmissão, o LumaCast pode mover o vídeo da tela para o LiveKit sem criar outra sala.</p></div></article>
          <article><span><Signal/></span><div><b>Estado da sala → Socket.IO</b><p>Presença, contador, quem está compartilhando, troca de provedor e reconexões são sincronizados separadamente da mídia.</p></div></article>
        </div>
      </div>

      <div className="how-v2-routing" aria-label="Diagrama das rotas de mídia do LumaCast">
        <div className="how-v2-routing-head">
          <span>ROTAS DA SESSÃO</span>
          <b><i/>online</b>
        </div>

        <div className="how-v2-route-row">
          <div className="how-v2-route-source"><MonitorPlay/><span><b>Tela</b><small>vídeo</small></span></div>
          <div className="how-v2-wire"><i className="packet p1"/><i className="packet p2"/></div>
          <div className="how-v2-provider primary"><RadioTower/><span><b>Agora SFU</b><small>rota principal</small></span></div>
          <div className="how-v2-wire"><i className="packet p3"/></div>
          <div className="how-v2-destination"><Cast/><span><b>Sala</b><small>espectadores</small></span></div>
        </div>

        <div className="how-v2-route-row secondary">
          <div className="how-v2-route-source"><Volume2/><span><b>Áudio + câmera</b><small>quando ativos</small></span></div>
          <div className="how-v2-wire"><i className="packet p2"/></div>
          <div className="how-v2-provider"><Video/><span><b>LiveKit</b><small>mídia colaborativa</small></span></div>
          <div className="how-v2-wire"><i className="packet p1"/></div>
          <div className="how-v2-destination"><Users/><span><b>Sala</b><small>participantes</small></span></div>
        </div>

        <div className="how-v2-fallback">
          <RefreshCw/>
          <div><b>Se a rota principal falhar</b><small>o vídeo da tela pode migrar para o LiveKit.</small></div>
        </div>

        <div className="how-v2-state-line">
          <Signal/><span><b>Socket.IO</b> sincroniza presença, permissões e estado da transmissão.</span>
        </div>
      </div>
    </section>

    <section className="how-v2-section how-v2-facts">
      <div className="how-v2-section-heading">
        <div><span>03</span><small>COMPORTAMENTO REAL</small></div>
        <h2>Alguns detalhes que fazem diferença.</h2>
      </div>
      <div className="how-v2-fact-grid">
        <article><span><Users/></span><div><b>Uma tela por vez</b><p>Qualquer membro da sala pode pedir para compartilhar, mas existe um bloqueio para impedir duas transmissões de tela simultâneas.</p></div></article>
        <article><span><RefreshCw/></span><div><b>Reconexão com tolerância</b><p>O dono pode recuperar a sala por cerca de 30 segundos após uma queda. Participantes e a tela ativa têm uma janela menor, de cerca de 10 segundos.</p></div></article>
        <article><span><LockKeyhole/></span><div><b>Sessões temporárias</b><p>As salas são temporárias e usam credenciais RTC de curta duração. O LumaCast não grava a transmissão nem armazena o vídeo da sessão.</p></div></article>
      </div>
    </section>

    <section className="how-v2-section how-v2-faq" aria-labelledby="faq-title">
      <div className="how-v2-section-heading compact">
        <div><span>04</span><small>DÚVIDAS RÁPIDAS</small></div>
        <h2 id="faq-title">O que vale saber antes de começar.</h2>
      </div>
      <div className="how-v2-faq-list">
        <details>
          <summary>Todo mundo pode compartilhar a própria tela?<ArrowRight/></summary>
          <p>Sim. O dono e os participantes podem iniciar um compartilhamento, desde que outra pessoa não esteja transmitindo naquele momento.</p>
        </details>
        <details>
          <summary>O LumaCast é conexão direta entre os computadores?<ArrowRight/></summary>
          <p>Não. A mídia passa por SFUs: o vídeo da tela usa Agora como rota principal, enquanto câmeras e áudio usam LiveKit. Isso evita multiplicar o upload do transmissor para cada espectador.</p>
        </details>
        <details>
          <summary>60 FPS é garantido em qualquer navegador?<ArrowRight/></summary>
          <p>Não. O LumaCast solicita até 60 FPS, mas a taxa real depende do navegador, da fonte capturada, do monitor, do computador, da rede e do dispositivo de quem assiste.</p>
        </details>
        <details>
          <summary>O áudio da tela sempre funciona?<ArrowRight/></summary>
          <p>O LumaCast solicita áudio junto com a captura, mas o navegador e o tipo de fonte escolhida precisam oferecer essa trilha. O suporte varia entre navegadores e sistemas.</p>
        </details>
        <details>
          <summary>O LumaCast grava ou salva a transmissão?<ArrowRight/></summary>
          <p>Não. A aplicação distribui a mídia em tempo real e as salas são temporárias; o conteúdo da transmissão não é gravado pelo LumaCast.</p>
        </details>
      </div>
    </section>

    <section className="how-v2-cta">
      <div>
        <small>PRONTO PARA TESTAR?</small>
        <h2>Crie uma sala. O resto acontece em segundos.</h2>
        <p>Escolha seu nome, copie o código e comece a compartilhar.</p>
      </div>
      <button type="button" onClick={()=>location.assign("/")}>Começar agora <ArrowRight/></button>
    </section>

    <footer className="how-footer how-v2-footer">
      <span>© {new Date().getFullYear()} LumaCast</span>
      <button type="button" onClick={()=>location.assign("/")}><ArrowLeft/>Voltar ao início</button>
    </footer>
  </main>;
}
