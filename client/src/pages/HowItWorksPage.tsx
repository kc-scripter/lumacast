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
import { RoomProductPreview } from "../components/RoomProductPreview";
import { navigate } from "../services/navigation";

const steps=[
  {
    number:"01",
    icon:<Users/>,
    title:"Crie a sala",
    text:"Escolha seu nome e o Lunira Screen gera um código único de 8 caracteres. Não precisa criar conta.",
  },
  {
    number:"02",
    icon:<Link2/>,
    title:"Envie o código ou link",
    text:"Quem recebe entra pelo navegador, escolhe um nome e aparece na lista da sala.",
  },
  {
    number:"03",
    icon:<MonitorPlay/>,
    title:"Escolha o que compartilhar",
    text:"Selecione uma aba, janela ou monitor. O navegador mostra exatamente quais fontes estão disponíveis.",
  },
  {
    number:"04",
    icon:<Cast/>,
    title:"A sala acompanha automaticamente",
    text:"Participantes recebem o estado da transmissão e a mídia sem precisar atualizar a página.",
  },
];

const mediaDetails=[
  {
    icon:<MonitorPlay/>,
    title:"Tela",
    value:"Até 1080p · 60 FPS",
    text:"O vídeo da tela usa Agora como rota principal. A taxa real depende da fonte capturada, navegador, computador e rede.",
  },
  {
    icon:<Video/>,
    title:"Câmera",
    value:"720p40 ou 480p60",
    text:"A câmera usa LiveKit e pode trocar de preset enquanto está ligada. A webcam ainda pode limitar resolução ou FPS.",
  },
  {
    icon:<Volume2/>,
    title:"Áudio da tela",
    value:"Quando a fonte oferece",
    text:"O Lunira Screen solicita áudio junto da captura, mas o navegador e o tipo de fonte precisam fornecer essa trilha.",
  },
  {
    icon:<Zap/>,
    title:"Qualidade automática",
    value:"Só em condição extrema",
    text:"O modo automático evita reduzir por picos rápidos e só reage quando a conexão do transmissor fica realmente ruim por vários segundos.",
  },
];

const recoveryDetails=[
  {
    icon:<Signal/>,
    title:"Oscilações curtas",
    text:"Picos rápidos de latência não devem reduzir a qualidade imediatamente. O Lunira Screen tenta preservar o perfil escolhido.",
  },
  {
    icon:<RefreshCw/>,
    title:"Falha da rota principal",
    text:"Se o vídeo da tela perder a rota principal durante a sessão, ele pode migrar para o LiveKit sem criar outra sala.",
  },
  {
    icon:<Users/>,
    title:"Reconexão da sala",
    text:"O dono pode recuperar a sala por cerca de 30 segundos. Participantes e a tela ativa têm uma janela menor, de cerca de 10 segundos.",
  },
];

export function HowItWorksPage(){
  return <main className="how-page how-v2">
    <header className="how-nav how-v2-nav">
      <Logo/>
      <div className="how-v2-nav-actions">
        <span className="how-v2-secure"><LockKeyhole/>Conexão protegida</span>
        <button type="button" className="how-back" onClick={()=>navigate("/")}><ArrowLeft/>Voltar ao início</button>
      </div>
    </header>

    <section className="how-v2-hero">
      <div className="how-v2-hero-copy">
        <div className="how-v2-eyebrow"><Sparkles/> COMO FUNCIONA</div>
        <h1>Você compartilha.<br/><em>O Lunira Screen cuida do resto.</em></h1>
        <p>Crie uma sala, mande o código e comece quando quiser. Tela, áudio, câmeras e presença são tratados separadamente para que uma parte possa se recuperar sem derrubar o resto da sessão.</p>

        <div className="how-v3-hero-points" aria-label="Resumo do Lunira Screen">
          <span><MonitorPlay/><b>Até 1080p60</b><small>compartilhamento de tela</small></span>
          <span><Video/><b>Câmera flexível</b><small>720p40 ou 480p60</small></span>
          <span><RefreshCw/><b>Recuperação</b><small>reconexão e fallback</small></span>
        </div>

        <div className="how-v2-hero-actions">
          <button type="button" className="how-v2-primary" onClick={()=>navigate("/")}><MonitorPlay/>Criar uma sala<ArrowRight/></button>
          <span><ShieldCheck/>Sem instalação e sem cadastro</span>
        </div>
      </div>

      <RoomProductPreview className="how-v2-room-preview" compact/>
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

    <section className="how-v2-section how-v3-media">
      <div className="how-v2-section-heading">
        <div><span>02</span><small>MÍDIA E QUALIDADE</small></div>
        <h2>Cada tipo de mídia tem um trabalho diferente.</h2>
        <p>Os presets são limites solicitados pelo Lunira Screen. O resultado real também depende do hardware, do navegador e da conexão.</p>
      </div>

      <div className="how-v3-media-grid">
        {mediaDetails.map(item=><article key={item.title}>
          <span>{item.icon}</span>
          <div>
            <small>{item.title}</small>
            <b>{item.value}</b>
            <p>{item.text}</p>
          </div>
        </article>)}
      </div>
    </section>

    <section className="how-v2-section how-v2-tech">
      <div className="how-v2-tech-copy">
        <div className="how-v2-section-heading compact">
          <div><span>03</span><small>POR BAIXO DA INTERFACE</small></div>
          <h2>A mídia não percorre um único caminho.</h2>
        </div>
        <p className="how-v2-tech-lede">Separar as rotas permite que tela, câmera, áudio e presença continuem independentes. Se uma rota tiver problema, o restante da sala não precisa ser reconstruído.</p>

        <div className="how-v2-tech-list">
          <article><span><MonitorPlay/></span><div><b>Vídeo da tela → Agora</b><p>É a rota principal da tela, com controle de resolução, bitrate e 30 ou 60 FPS.</p></div></article>
          <article><span><Video/></span><div><b>Câmeras e áudio → LiveKit</b><p>Câmeras dos participantes e áudio capturado da tela são publicados pelo LiveKit quando estão ativos.</p></div></article>
          <article><span><RefreshCw/></span><div><b>Fallback da tela → LiveKit</b><p>Se a rota principal falhar durante a transmissão, o vídeo da tela pode migrar sem criar uma nova sala.</p></div></article>
          <article><span><Signal/></span><div><b>Estado da sala → Socket.IO</b><p>Presença, contador, quem transmite e reconexões são sincronizados separadamente da mídia.</p></div></article>
        </div>
      </div>

      <div className="how-v2-routing" aria-label="Diagrama das rotas de mídia do Lunira Screen">
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

    <section className="how-v2-section how-v3-recovery">
      <div className="how-v2-section-heading">
        <div><span>04</span><small>QUANDO A REDE OSCILA</small></div>
        <h2>O Lunira Screen tenta recuperar antes de desistir.</h2>
        <p>Nem toda oscilação precisa virar uma interrupção visível para a sala.</p>
      </div>

      <div className="how-v3-recovery-grid">
        {recoveryDetails.map((item,index)=><article key={item.title}>
          <div className="how-v3-recovery-number">0{index+1}</div>
          <span>{item.icon}</span>
          <b>{item.title}</b>
          <p>{item.text}</p>
        </article>)}
      </div>
    </section>

    <section className="how-v2-section how-v2-facts">
      <div className="how-v2-section-heading">
        <div><span>05</span><small>COMPORTAMENTO REAL</small></div>
        <h2>Limites que vale conhecer antes de começar.</h2>
      </div>
      <div className="how-v2-fact-grid">
        <article><span><Users/></span><div><b>Uma tela por vez</b><p>Qualquer membro pode pedir para compartilhar, mas existe um bloqueio para impedir duas telas simultâneas na mesma sala.</p></div></article>
        <article><span><LockKeyhole/></span><div><b>Sessões temporárias</b><p>As salas usam credenciais temporárias de RTC. O Lunira Screen não grava nem armazena o conteúdo da transmissão.</p></div></article>
        <article><span><Video/></span><div><b>Hardware ainda importa</b><p>Solicitar 480p60 ou 720p40 não faz uma webcam ultrapassar o FPS ou a resolução que ela realmente suporta.</p></div></article>
      </div>
    </section>

    <section className="how-v2-section how-v2-faq" aria-labelledby="faq-title">
      <div className="how-v2-section-heading compact">
        <div><span>06</span><small>DÚVIDAS RÁPIDAS</small></div>
        <h2 id="faq-title">O que vale saber antes de começar.</h2>
      </div>
      <div className="how-v2-faq-list">
        <details>
          <summary>Todo mundo pode compartilhar a própria tela?<ArrowRight/></summary>
          <p>Sim. Dono e participantes podem iniciar um compartilhamento, desde que outra pessoa não esteja transmitindo naquele momento.</p>
        </details>
        <details>
          <summary>O Lunira Screen é conexão direta entre os computadores?<ArrowRight/></summary>
          <p>Não. A mídia passa por SFUs. A tela usa Agora como rota principal; câmeras e áudio colaborativo usam LiveKit. Assim o transmissor não precisa enviar uma cópia separada para cada espectador.</p>
        </details>
        <details>
          <summary>60 FPS é garantido em qualquer dispositivo?<ArrowRight/></summary>
          <p>Não. O Lunira Screen solicita o perfil escolhido, mas navegador, fonte capturada, monitor, webcam, hardware e rede podem entregar menos.</p>
        </details>
        <details>
          <summary>Posso mudar a qualidade da câmera sem desligá-la?<ArrowRight/></summary>
          <p>Sim. O Lunira Screen tenta trocar entre 720p40 e 480p60 mantendo a câmera ativa. Se o navegador exigir, a faixa é recriada automaticamente por trás da interface.</p>
        </details>
        <details>
          <summary>O áudio da tela sempre funciona?<ArrowRight/></summary>
          <p>Não. O navegador e a fonte escolhida precisam disponibilizar áudio. O suporte muda conforme navegador, sistema e tipo de captura.</p>
        </details>
        <details>
          <summary>Dá para compartilhar a tela pelo celular?<ArrowRight/></summary>
          <p>Depende do navegador e do sistema. Assistir à sala funciona normalmente em navegadores compatíveis; a opção de compartilhar tela só aparece quando o próprio navegador oferece captura de tela.</p>
        </details>
        <details>
          <summary>O Lunira Screen grava ou salva a transmissão?<ArrowRight/></summary>
          <p>Não. A aplicação distribui a mídia em tempo real; o conteúdo da transmissão não é gravado pelo Lunira Screen.</p>
        </details>
      </div>
    </section>

    <section className="how-v2-cta">
      <div>
        <small>PRONTO PARA TESTAR?</small>
        <h2>Crie uma sala. O resto acontece em segundos.</h2>
        <p>Escolha seu nome, copie o código e comece a compartilhar.</p>
      </div>
      <button type="button" onClick={()=>navigate("/")}>Começar agora <ArrowRight/></button>
    </section>

    <footer className="how-footer how-v2-footer">
      <span>© {new Date().getFullYear()} Lunira Screen</span>
      <div className="how-v2-footer-actions"><button type="button" onClick={()=>navigate("/termos")}>Termos</button><button type="button" onClick={()=>navigate("/")}><ArrowLeft/>Voltar ao início</button></div>
    </footer>
  </main>;
}
