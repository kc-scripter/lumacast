import { ArrowLeft, ArrowRight, Cast, Link2, LockKeyhole, MonitorPlay, RadioTower, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { Logo } from "../components/Logo";

export function HowItWorksPage(){
  return <main className="how-page">
    <header className="how-nav">
      <Logo/>
      <button type="button" className="how-back" onClick={()=>location.assign("/")}><ArrowLeft/>Voltar ao início</button>
    </header>

    <section className="how-hero">
      <div className="how-hero-copy">
        <div className="how-page-eyebrow"><Sparkles/> SIMPLES DO INÍCIO AO FIM</div>
        <h1>Compartilhar sua tela leva <em>poucos segundos.</em></h1>
        <p>Crie uma sala, escolha o que quer mostrar e envie o link. Quem recebe entra direto pelo navegador, sem instalar aplicativo.</p>
        <div className="how-hero-actions">
          <button className="how-primary" onClick={()=>location.assign("/broadcast")}><MonitorPlay/>Começar a transmitir<ArrowRight/></button>
          <span><LockKeyhole/>Sala temporária e acesso por código</span>
        </div>
      </div>
      <div className="how-flow" aria-hidden="true">
        <div className="flow-node flow-host"><MonitorPlay/><span><b>Sua tela</b><small>Janela, aba ou monitor</small></span></div>
        <div className="flow-line"><i/><i/><i/></div>
        <div className="flow-core"><RadioTower/><b>Tempo real</b><small>WebRTC</small></div>
        <div className="flow-line"><i/><i/><i/></div>
        <div className="flow-node flow-viewer"><Cast/><span><b>Espectadores</b><small>Entram pelo navegador</small></span></div>
      </div>
    </section>

    <section className="how-section">
      <div className="how-section-head"><span>01</span><div><small>PASSO A PASSO</small><h2>Do clique ao compartilhamento</h2></div></div>
      <div className="how-page-steps">
        <article><span><MonitorPlay/></span><div className="step-number">01</div><h3>Crie sua sala</h3><p>Abra a área de transmissão. O LumaCast gera um código único para a sessão.</p></article>
        <article><span><RadioTower/></span><div className="step-number">02</div><h3>Escolha sua tela</h3><p>Selecione uma janela, aba ou monitor e defina resolução e taxa de quadros antes de começar.</p></article>
        <article><span><Link2/></span><div className="step-number">03</div><h3>Compartilhe o link</h3><p>Envie o link ou o código da sala. O espectador entra sem cadastro e sem instalar nada.</p></article>
        <article><span><Cast/></span><div className="step-number">04</div><h3>Assista em tempo real</h3><p>A transmissão aparece automaticamente para quem já estiver na sala quando você iniciar.</p></article>
      </div>
    </section>

    <section className="how-section how-details">
      <div className="how-section-head"><span>02</span><div><small>POR TRÁS DA INTERFACE</small><h2>Feito para ser direto</h2></div></div>
      <div className="how-detail-grid">
        <article><Zap/><div><b>Baixa latência</b><p>A mídia usa WebRTC para priorizar reprodução em tempo real.</p></div></article>
        <article><ShieldCheck/><div><b>Sem instalação</b><p>Transmissor e espectadores usam apenas um navegador moderno.</p></div></article>
        <article><LockKeyhole/><div><b>Sessões temporárias</b><p>As salas existem para a sessão e podem ser recuperadas por um curto período após uma queda de conexão.</p></div></article>
      </div>
    </section>

    <section className="how-bottom-cta">
      <div><small>PRONTO PARA TESTAR?</small><h2>Crie uma sala e compartilhe agora.</h2><p>Você escolhe o que será capturado antes de qualquer transmissão começar.</p></div>
      <button onClick={()=>location.assign("/broadcast")}>Transmitir tela <ArrowRight/></button>
    </section>

    <footer className="how-footer">© {new Date().getFullYear()} LumaCast <button type="button" onClick={()=>location.assign("/")}>Voltar ao início</button></footer>
  </main>;
}
